import { openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";

import type { ApiClient } from "./api-client.js";
import type { WorkerConfig } from "./config.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry.js";

/**
 * Upload a file using chunked upload protocol.
 * Supports resume by re-uploading all chunks (server appends to partial file).
 */
export const uploadFileWithResume = async (
  apiClient: ApiClient,
  jobId: string,
  filePath: string,
  config: WorkerConfig,
): Promise<void> => {
  const filename = path.basename(filePath);
  const fileSize = statSync(filePath).size;

  logger.info(`Uploading ${filename} (${(fileSize / 1024 / 1024).toFixed(1)} MB) for job ${jobId}`);

  const uploadId = await withRetry(
    () => apiClient.initResultUpload(jobId, filename, fileSize),
    { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 30_000, label: `initResultUpload ${filename}` },
  );

  const chunkSize = config.chunkSizeBytes;
  const totalChunks = Math.ceil(fileSize / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const chunk = Buffer.alloc(end - start);

    const fd = openSync(filePath, "r");
    readSync(fd, chunk, 0, end - start, start);
    closeSync(fd);

    const result = await withRetry(
      () => apiClient.uploadChunk(uploadId, i, chunk),
      { maxAttempts: 3, baseDelayMs: 1_000, label: `uploadChunk ${filename} #${i}` },
    );
    const pct = Math.round(((i + 1) / totalChunks) * 100);
    logger.info(
      `Upload progress: ${pct}% (${result.total_received}/${fileSize} bytes)`,
    );
  }

  await withRetry(
    () => apiClient.completeResultUpload(uploadId, jobId, filename),
    { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 30_000, label: `completeResultUpload ${filename}` },
  );
  logger.info(`Upload complete: ${filename}`);
};
