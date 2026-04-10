import { rm, stat } from "node:fs/promises";
import path from "node:path";

import { renderOverlay } from "../render/render-overlay.js";
import { ensureDirectoryPath, writeJsonFile } from "../utils/files.js";

import type { ApiClient } from "./api-client.js";
import type { ClaimedJob } from "./api-client.js";
import type { WorkerConfig } from "./config.js";
import { uploadFileWithResume } from "./file-transfer.js";
import { logger } from "./logger.js";
import { removeJobState, saveJobState, updateJobStateStatus } from "./job-state.js";
import { withRetry } from "./retry.js";

/**
 * Thrown when the server has reassigned this job to another worker.
 * The caller should NOT call failJob (the job is no longer ours).
 */
export class JobAbortedError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} was reassigned by server`);
    this.name = "JobAbortedError";
  }
}

const FRAME_PROGRESS_RE = /frame (\d+)\/(\d+)/;
const STEP_NUMBER_RE = /\[(\d{2})-/;

/**
 * Estimate progress percentage from a renderOverlay progress message.
 *
 * Step-based estimation (when no frame info available):
 *   Steps 01-06 (setup):  0%–30%
 *   Steps 07-13 (data):  30%–85%
 *   Step 14 (render):    85%–99%
 *   Step 15 (finalize):  99%–100%
 */
const estimateProgressFromMessage = (message: string): number | null => {
  const frameMatch = FRAME_PROGRESS_RE.exec(message);
  if (frameMatch?.[1] && frameMatch[2]) {
    const current = parseInt(frameMatch[1], 10);
    const total = parseInt(frameMatch[2], 10);
    if (total > 0) {
      return Math.round((current / total) * 100);
    }
  }

  const stepMatch = STEP_NUMBER_RE.exec(message);
  if (stepMatch?.[1]) {
    const step = parseInt(stepMatch[1], 10);
    if (step <= 6) return Math.round((step / 6) * 30);
    if (step <= 13) return 30 + Math.round(((step - 6) / 7) * 55);
    if (step === 14) return 85;
    if (step >= 15) return 99;
  }

  return null;
};

export const runJob = async (
  job: ClaimedJob,
  config: WorkerConfig,
  apiClient: ApiClient,
  abortedJobs: Set<string>,
): Promise<void> => {
  const jobWorkDir = path.join(config.workDir, `job-${job.id}`);
  await ensureDirectoryPath(jobWorkDir);

  // Persist job state for crash recovery
  await saveJobState(config.workDir, job);

  const checkAborted = (): void => {
    if (abortedJobs.has(job.id)) {
      throw new JobAbortedError(job.id);
    }
  };

  try {
    // 1. Download activity file (resumable)
    const activityPath = path.join(jobWorkDir, job.activity_filename);
    logger.info(`[Job ${job.id}] Downloading activity file: ${job.activity_filename}`);

    await apiClient.downloadActivityFile(job.id, activityPath, (received, total) => {
      const pct = Math.round((received / total) * 100);
      if (pct % 25 === 0) {
        logger.info(`[Job ${job.id}] Download: ${pct}%`);
      }
    });

    checkAborted();

    // 2. Write layout config to local file
    const configPath = path.join(jobWorkDir, "config.json");
    await writeJsonFile(configPath, job.layout_config);

    // 3. Notify server: processing started (retry — server may be restarting)
    await withRetry(() => apiClient.startJob(job.id), {
      maxAttempts: 5,
      baseDelayMs: 2_000,
      maxDelayMs: 30_000,
      label: `[Job ${job.id}] startJob`,
    });
    await updateJobStateStatus(config.workDir, job.id, "processing");
    logger.info(`[Job ${job.id}] Rendering started`);

    // 4. Run renderOverlay with periodic progress reporting
    const outputPath = path.join(jobWorkDir, "output");
    let lastProgressReportAt = 0;
    let currentProgressPct = 0;

    const reportProgress = async (message: string): Promise<void> => {
      logger.info(`[Job ${job.id}] ${message}`);

      const estimated = estimateProgressFromMessage(message);
      if (estimated !== null) {
        currentProgressPct = Math.max(currentProgressPct, estimated);
      }

      const now = Date.now();
      if (now - lastProgressReportAt >= config.progressReportIntervalMs) {
        lastProgressReportAt = now;
        try {
          await apiClient.updateProgress(job.id, currentProgressPct, message);
        } catch {
          logger.warn(`[Job ${job.id}] Progress report failed, will retry next interval`);
        }
      }
    };

    // Read maxRenderTimeMs from layout_config (injected by MotionO based on user tier)
    const maxDurationMs = (job.layout_config as Record<string, unknown>)?.render
      ? ((job.layout_config as Record<string, unknown>).render as Record<string, unknown>)?.maxRenderTimeMs as number | undefined
      : undefined;

    const result = await renderOverlay({
      inputPath: activityPath,
      configPath,
      outputPath,
      onProgress: reportProgress,
      maxDurationMs,
    });

    checkAborted();

    if (result.exitCode !== 0) {
      throw new Error(
        `Render failed with exit code ${result.exitCode}: ${result.message}`,
      );
    }

    logger.info(`[Job ${job.id}] Render complete: ${result.outputPath}`);

    // 5. Upload result files
    if (result.outputs.length === 0) {
      throw new Error("Render completed without producing any output files");
    }

    for (const output of result.outputs) {
      checkAborted();
      await uploadFileWithResume(apiClient, job.id, output.path, config);
    }

    checkAborted();

    // 6. Collect result file metadata
    const uploadedResultFiles: Array<{
      filename: string;
      size_bytes: number;
      started_at?: string;
    }> = [];

    for (const output of result.outputs) {
      const outputStat = await stat(output.path);
      const entry: {
        filename: string;
        size_bytes: number;
        started_at?: string;
      } = {
        filename: path.basename(output.path),
        size_bytes: outputStat.size,
      };
      if (output.startedAt) {
        entry.started_at = output.startedAt;
      }
      uploadedResultFiles.push(entry);
    }

    // 7. Read render metadata if available
    let renderMetadata: Record<string, unknown> | undefined;
    try {
      const { readFile } = await import("node:fs/promises");
      const metadataContent = await readFile(
        path.join(result.outputPath, "metadata.json"),
        "utf8",
      );
      renderMetadata = JSON.parse(metadataContent) as Record<string, unknown>;
    } catch {
      // metadata.json may not exist, that's fine
    }

    // 8. Notify completion (aggressive retry — render work is already done)
    const videoSegments = result.outputs.map(
      (output) => output.durationSeconds,
    );
    const completePayload: {
      result_files: Array<{
        filename: string;
        size_bytes: number;
        started_at?: string;
      }>;
      video_segments: number[];
      render_metadata?: Record<string, unknown>;
    } = {
      result_files: uploadedResultFiles,
      video_segments: videoSegments,
    };
    if (renderMetadata) {
      completePayload.render_metadata = renderMetadata;
    }
    await withRetry(() => apiClient.completeJob(job.id, completePayload), {
      maxAttempts: 20,
      baseDelayMs: 3_000,
      maxDelayMs: 60_000,
      label: `[Job ${job.id}] completeJob`,
    });

    await withRetry(() => apiClient.updateProgress(job.id, 100, "Complete"), {
      maxAttempts: 3,
      label: `[Job ${job.id}] progress 100%`,
    });

    logger.info(`[Job ${job.id}] Completed successfully`);
  } finally {
    // Clean up local state and work directory
    await removeJobState(config.workDir, job.id);
    try {
      await rm(jobWorkDir, { recursive: true, force: true });
    } catch {
      logger.warn(`[Job ${job.id}] Failed to clean up work directory`);
    }
  }
};
