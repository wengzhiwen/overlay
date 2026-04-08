import type { WorkerConfig } from "./config.js";
import { createApiClient } from "./api-client.js";
import type { ActiveJob } from "./api-client.js";
import { JobAbortedError, runJob } from "./job-runner.js";
import { loadJobStates, removeJobState } from "./job-state.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const runWorker = async (config: WorkerConfig): Promise<void> => {

  const apiClient = createApiClient(config);
  const activeJobs = new Map<string, Promise<void>>();
  const abortedJobs = new Set<string>();

  // Ensure work directory exists
  const { mkdir } = await import("node:fs/promises");
  await mkdir(config.workDir, { recursive: true });

  // Heartbeat loop — also detects job reassignment via server response
  let heartbeatStopped = false;
  const heartbeatLoop = async (): Promise<void> => {
    while (!heartbeatStopped) {
      try {
        const hbResponse = await apiClient.sendHeartbeat();

        // Detect jobs that were reassigned by the server
        const serverActiveIds = new Set(
          hbResponse.active_jobs.map((j) => j.job_id),
        );
        for (const jobId of activeJobs.keys()) {
          if (!serverActiveIds.has(jobId)) {
            logger.warn(`[Job ${jobId}] No longer in server active jobs — assuming reassigned`);
            abortedJobs.add(jobId);
          }
        }

        logger.debug("Heartbeat sent");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Heartbeat failed: ${msg}`);
      }
      await sleep(config.heartbeatIntervalMs);
    }
  };

  // Start heartbeat
  void heartbeatLoop();

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down worker...");

    heartbeatStopped = true;

    // Wait for active jobs with timeout
    const timeout = sleep(30_000).then(() => {
      logger.warn("Shutdown timeout, forcing exit");
    });
    await Promise.race([
      Promise.allSettled([...activeJobs.values()]),
      timeout,
    ]);

    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  logger.info(
    `Worker started. Server: ${config.serverUrl}. Concurrency: ${config.maxConcurrency}. Work dir: ${config.workDir}`,
  );

  // Initial heartbeat
  try {
    await apiClient.sendHeartbeat();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to connect to server: ${msg}`);
    process.exit(1);
  }

  // --- Startup recovery ---
  await recoverJobs(config, apiClient, activeJobs, abortedJobs);

  // Helper closure to run a job with context
  const startJob = (job: Parameters<typeof runJob>[0]): Promise<void> =>
    runAndTrackJob(job, config, apiClient, abortedJobs);

  // Main job loop
  while (!shuttingDown) {
    // Clean up completed job promises
    for (const [jobId, promise] of activeJobs) {
      const result = await Promise.race([
        promise.then(
          () => ({ status: "fulfilled" as const }),
          () => ({ status: "rejected" as const }),
        ),
        sleep(0).then(() => ({ status: "pending" as const })),
      ]);
      if (result.status !== "pending") {
        activeJobs.delete(jobId);
        abortedJobs.delete(jobId);
      }
    }

    // If we have capacity, try to claim a job
    if (activeJobs.size < config.maxConcurrency) {
      try {
        const job = await apiClient.claimNextJob();
        if (job) {
          logger.info(`Claimed job ${job.id}: ${job.activity_filename}`);
          const jobPromise = startJob(job);
          activeJobs.set(job.id, jobPromise);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to claim job: ${msg}`);
      }
    }

    // Sleep before next poll
    await sleep(config.pollIntervalMs);
  }
};

/**
 * Run a job, handling abort vs failure differently:
 * - JobAbortedError: job was reassigned, do NOT call failJob
 * - Other errors: report failure to server
 */
const runAndTrackJob = (
  job: Parameters<typeof runJob>[0],
  config: Parameters<typeof runJob>[1],
  apiClient: Parameters<typeof runJob>[2],
  abortedJobs: Set<string>,
): Promise<void> => {
  return runJob(job, config, apiClient, abortedJobs).catch(
    async (error: unknown) => {
      if (error instanceof JobAbortedError) {
        logger.warn(`[Job ${job.id}] Aborted: ${error.message}`);
        return;
      }

      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[Job ${job.id}] Failed: ${msg}`);
      try {
        await withRetry(() => apiClient.failJob(job.id, msg), {
          maxAttempts: 5,
          baseDelayMs: 2_000,
          maxDelayMs: 30_000,
          label: `[Job ${job.id}] failJob`,
        });
      } catch {
        logger.error(`[Job ${job.id}] Failed to report failure to server after retries`);
      }
    },
  );
};

/**
 * On startup, check for locally persisted job state files and compare
 * with server-side active jobs. Resume jobs that are still valid,
 * abandon those that have been reassigned.
 */
const recoverJobs = async (
  config: WorkerConfig,
  apiClient: ReturnType<typeof createApiClient>,
  activeJobs: Map<string, Promise<void>>,
  abortedJobs: Set<string>,
): Promise<void> => {
  const localStates = await loadJobStates(config.workDir);
  if (localStates.length === 0) {
    return;
  }

  logger.info(`Found ${localStates.length} local job state(s), checking with server...`);

  let serverActiveJobs: ActiveJob[];
  try {
    serverActiveJobs = await withRetry(() => apiClient.getActiveJobs(), {
      maxAttempts: 3,
      baseDelayMs: 2_000,
      label: "getActiveJobs (recovery)",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not fetch active jobs from server, discarding local state: ${msg}`);
    for (const state of localStates) {
      await removeJobState(config.workDir, state.jobId);
    }
    return;
  }

  const serverJobMap = new Map(serverActiveJobs.map((j) => [j.id, j]));

  for (const localState of localStates) {
    const serverJob = serverJobMap.get(localState.jobId);

    if (!serverJob) {
      // Job no longer assigned to us on server — discard
      logger.info(`[Job ${localState.jobId}] No longer active on server, discarding local state`);
      await removeJobState(config.workDir, localState.jobId);
      continue;
    }

    // Job is still ours — resume it
    logger.info(
      `[Job ${localState.jobId}] Still active on server (status: ${serverJob.status}), resuming`,
    );

    const claimedJob = {
      id: serverJob.id,
      activity_format: serverJob.activity_format as "gpx" | "tcx",
      activity_filename: serverJob.activity_filename,
      activity_size_bytes: serverJob.activity_size_bytes,
      layout_config: serverJob.layout_config,
    };

    const jobPromise = runAndTrackJob(claimedJob, config, apiClient, abortedJobs);
    activeJobs.set(localState.jobId, jobPromise);
  }

  // Clean up server-side orphans: jobs the server thinks we own but we have no local state for
  for (const serverJob of serverActiveJobs) {
    if (!localStates.some((ls) => ls.jobId === serverJob.id)) {
      logger.info(
        `[Job ${serverJob.id}] Server thinks we own this job but no local state, reporting failure`,
      );
      try {
        await apiClient.failJob(serverJob.id, "Worker restarted without local state for this job");
      } catch {
        logger.warn(`[Job ${serverJob.id}] Failed to report orphan failure to server`);
      }
    }
  }
};
