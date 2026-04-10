import { randomBytes } from "node:crypto";
import { openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";

import type { ApiClient } from "./api-client.js";
import type { ResultStorage } from "./api-client.js";
import type { WorkerConfig } from "./config.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry.js";

export type UploadedResultFile = {
  filename: string;
  storage_key: string;
  size_bytes: number;
  content_type?: string;
};

const isDirectStorageConflict = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("Upload init failed: 409");
};

const refreshResultStorageForJob = async (
  apiClient: ApiClient,
  jobId: string,
): Promise<ResultStorage | null> => {
  const activeJobs = await apiClient.getActiveJobs();
  const activeJob = activeJobs.find((job) => job.id === jobId);
  return activeJob?.result_storage ?? null;
};

/**
 * Upload a file using chunked upload protocol.
 * Supports idempotent chunk retries; the server writes each chunk by offset.
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

const guessContentType = (filePath: string): string | undefined => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mov") {
    return "video/quicktime";
  }
  if (extension === ".mp4") {
    return "video/mp4";
  }
  return undefined;
};

const buildRandomStorageKey = (
  resultStorage: Extract<ResultStorage, { backend: "r2" }>,
  filePath: string,
): string => {
  const extension = path.extname(filePath).toLowerCase();
  const randomName = randomBytes(20).toString("hex");
  return `${resultStorage.key_prefix}${randomName}${extension}`;
};

const readFileChunk = (
  filePath: string,
  start: number,
  end: number,
): Buffer => {
  const chunk = Buffer.alloc(end - start);
  const fd = openSync(filePath, "r");
  try {
    readSync(fd, chunk, 0, end - start, start);
  } finally {
    closeSync(fd);
  }
  return chunk;
};

const uploadBufferToPresignedUrl = async (
  chunk: Buffer,
  upload: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expires_at?: string;
  },
): Promise<string> => {
  const expiresAtMs = upload.expires_at ? Date.parse(upload.expires_at) : Number.NaN;
  const timeoutMs = Number.isFinite(expiresAtMs)
    ? Math.max(30_000, Math.min(10 * 60_000, expiresAtMs - Date.now() - 5_000))
    : 5 * 60_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: new Uint8Array(chunk),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Presigned upload failed: ${response.status} ${response.statusText}`);
  }

  const etag = response.headers.get("etag");
  if (!etag) {
    throw new Error("Multipart upload response is missing ETag header");
  }
  return etag;
};

const uploadFileToMultipartResultStorage = async (
  apiClient: ApiClient,
  jobId: string,
  filePath: string,
  resultStorage: Extract<ResultStorage, { backend: "r2" }>,
): Promise<UploadedResultFile> => {
  const filename = path.basename(filePath);
  const fileSize = statSync(filePath).size;
  const contentType = guessContentType(filePath);
  const storageKey = buildRandomStorageKey(resultStorage, filePath);

  logger.info(`Uploading ${filename} to result storage via multipart upload as ${storageKey}`);

  const initPayload: {
    filename: string;
    storage_key: string;
    content_type?: string;
  } = {
    filename,
    storage_key: storageKey,
  };
  if (contentType) {
    initPayload.content_type = contentType;
  }

  const session = await withRetry(
    () => apiClient.initMultipartResultUpload(jobId, initPayload),
    {
      maxAttempts: 5,
      baseDelayMs: 2_000,
      maxDelayMs: 30_000,
      label: `initMultipartResultUpload ${filename}`,
    },
  );

  let uploadCompleted = false;
  try {
    const totalParts = Math.ceil(fileSize / session.part_size_bytes);
    const uploadedParts: Array<{ part_number: number; etag: string }> = [];

    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      const start = (partNumber - 1) * session.part_size_bytes;
      const end = Math.min(start + session.part_size_bytes, fileSize);
      const chunk = readFileChunk(filePath, start, end);

      const etag = await withRetry(
        async () => {
          const upload = await apiClient.presignMultipartResultPart(jobId, {
            storage_key: session.storage_key,
            upload_id: session.upload_id,
            part_number: partNumber,
          });
          return uploadBufferToPresignedUrl(chunk, upload);
        },
        {
          maxAttempts: 3,
          baseDelayMs: 2_000,
          maxDelayMs: 15_000,
          label: `uploadMultipartPart ${filename} #${partNumber}`,
        },
      );

      uploadedParts.push({ part_number: partNumber, etag });
      const pct = Math.round((partNumber / totalParts) * 100);
      logger.info(`Multipart upload progress: ${pct}% (${partNumber}/${totalParts} parts)`);
    }

    await withRetry(
      () => apiClient.completeMultipartResultUpload(jobId, {
        storage_key: session.storage_key,
        upload_id: session.upload_id,
        parts: uploadedParts,
      }),
      {
        maxAttempts: 5,
        baseDelayMs: 2_000,
        maxDelayMs: 30_000,
        label: `completeMultipartResultUpload ${filename}`,
      },
    );
    uploadCompleted = true;
  } finally {
    if (!uploadCompleted) {
      try {
        await apiClient.abortMultipartResultUpload(jobId, {
          storage_key: session.storage_key,
          upload_id: session.upload_id,
        });
      } catch {
        logger.warn(`Failed to abort multipart upload for ${filename}`);
      }
    }
  }

  const uploaded: UploadedResultFile = {
    filename,
    storage_key: storageKey,
    size_bytes: fileSize,
  };
  if (contentType) {
    uploaded.content_type = contentType;
  }
  return uploaded;
};

export const uploadFileToResultStorage = async (
  apiClient: ApiClient,
  jobId: string,
  filePath: string,
  resultStorage: ResultStorage,
  config: WorkerConfig,
): Promise<UploadedResultFile> => {
  const filename = path.basename(filePath);
  const fileSize = statSync(filePath).size;
  const contentType = guessContentType(filePath);

  if (fileSize <= 0) {
    throw new Error(`Refusing to upload empty result file: ${filename}`);
  }

  logger.info(`Result storage backend for ${filename} on job ${jobId}: ${resultStorage.backend}`);

  if (resultStorage.backend === "local") {
    try {
      await uploadFileWithResume(apiClient, jobId, filePath, config);
    } catch (error) {
      if (!isDirectStorageConflict(error)) {
        throw error;
      }

      logger.warn(
        `Local result upload for ${filename} was rejected with 409; refreshing result storage mode from MotionO`,
      );
      const refreshedResultStorage = await refreshResultStorageForJob(apiClient, jobId);
      if (refreshedResultStorage?.backend !== "r2") {
        throw error;
      }

      logger.warn(
        `Job ${jobId} is now configured for R2 result storage; switching ${filename} to multipart upload`,
      );
      return uploadFileToMultipartResultStorage(apiClient, jobId, filePath, refreshedResultStorage);
    }
    const uploaded: UploadedResultFile = {
      filename,
      storage_key: filename,
      size_bytes: fileSize,
    };
    if (contentType) {
      uploaded.content_type = contentType;
    }
    return uploaded;
  }

  return uploadFileToMultipartResultStorage(apiClient, jobId, filePath, resultStorage);
};
