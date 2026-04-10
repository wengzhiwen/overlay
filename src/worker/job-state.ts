import fs from "node:fs/promises";
import path from "node:path";

import { ensureDirectoryPath } from "../utils/files.js";

import type { ClaimedJob } from "./api-client.js";
import type { ResultStorage } from "./api-client.js";

export type JobStateFile = {
  jobId: string;
  activity_format: string;
  activity_filename: string;
  activity_size_bytes: number;
  layout_config: Record<string, unknown>;
  result_storage: ResultStorage;
  status: "claimed" | "processing";
  claimedAt: string;
};

const STATE_DIR = "state";

const stateFilePath = (workDir: string, jobId: string): string =>
  path.join(workDir, STATE_DIR, `${jobId}.json`);

export const saveJobState = async (
  workDir: string,
  job: ClaimedJob,
): Promise<void> => {
  const dir = path.join(workDir, STATE_DIR);
  await ensureDirectoryPath(dir);

  const state: JobStateFile = {
    jobId: job.id,
    activity_format: job.activity_format,
    activity_filename: job.activity_filename,
    activity_size_bytes: job.activity_size_bytes,
    layout_config: job.layout_config,
    result_storage: job.result_storage,
    status: "claimed",
    claimedAt: new Date().toISOString(),
  };

  const filePath = stateFilePath(workDir, job.id);
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
};

export const updateJobStateStatus = async (
  workDir: string,
  jobId: string,
  status: "claimed" | "processing",
): Promise<void> => {
  const filePath = stateFilePath(workDir, jobId);
  try {
    const content = await fs.readFile(filePath, "utf8");
    const state = JSON.parse(content) as JobStateFile;
    state.status = status;
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // State file may not exist if worker was restarted without state
  }
};

export const loadJobStates = async (
  workDir: string,
): Promise<JobStateFile[]> => {
  const dir = path.join(workDir, STATE_DIR);
  try {
    const entries = await fs.readdir(dir);
    const states: JobStateFile[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(path.join(dir, entry), "utf8");
        states.push(JSON.parse(content) as JobStateFile);
      } catch {
        // Corrupt state file, skip
      }
    }
    return states;
  } catch {
    return [];
  }
};

export const removeJobState = async (
  workDir: string,
  jobId: string,
): Promise<void> => {
  try {
    await fs.unlink(stateFilePath(workDir, jobId));
  } catch {
    // Already removed or never created
  }
};
