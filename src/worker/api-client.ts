import { once } from "node:events";

import type { WorkerConfig } from "./config.js";
import { logger } from "./logger.js";

export type ClaimedJob = {
  id: string;
  activity_format: "gpx" | "tcx";
  activity_filename: string;
  activity_size_bytes: number;
  layout_config: Record<string, unknown>;
  result_storage: ResultStorage;
};

export type HeartbeatResponse = {
  active_jobs: Array<{ job_id: string; status: string }>;
};

export type ActiveJob = {
  id: string;
  status: string;
  activity_format: string;
  activity_filename: string;
  activity_size_bytes: number;
  layout_config: Record<string, unknown>;
  progress_pct: number;
  result_storage: ResultStorage;
};

export type ResultStorage =
  | {
    backend: "local";
  }
  | {
    backend: "r2";
    key_prefix: string;
    upload_url_ttl_seconds: number;
  };

export type ResultFileUploadPlan = {
  storage_key: string;
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expires_at: string;
};

export type MultipartUploadSession = {
  storage_key: string;
  upload_id: string;
  part_size_bytes: number;
};

export type MultipartPartUploadPlan = ResultFileUploadPlan & {
  part_number: number;
};

type ApiResponse<T = unknown> = {
  ok: boolean;
  data: T;
  status: number;
};

export type ApiClient = {
  sendHeartbeat(): Promise<HeartbeatResponse>;
  claimNextJob(): Promise<ClaimedJob | null>;
  getActiveJobs(): Promise<ActiveJob[]>;
  startJob(jobId: string): Promise<void>;
  updateProgress(jobId: string, progressPct: number, message?: string): Promise<void>;
  completeJob(
    jobId: string,
    result: {
      result_files: Array<{
        filename: string;
        storage_key?: string;
        size_bytes: number;
        started_at?: string;
        content_type?: string;
      }>;
      video_segments: number[];
      render_metadata?: Record<string, unknown>;
    },
  ): Promise<void>;
  failJob(jobId: string, errorMessage: string): Promise<void>;
  downloadActivityFile(
    jobId: string,
    targetPath: string,
    onProgress?: (received: number, total: number) => void,
  ): Promise<void>;
  initResultUpload(
    jobId: string,
    filename: string,
    totalSize: number,
  ): Promise<string>;
  uploadChunk(
    uploadId: string,
    chunkIndex: number,
    data: Buffer,
  ): Promise<{ received_bytes: number; total_received: number }>;
  completeResultUpload(
    uploadId: string,
    jobId: string,
    filename: string,
  ): Promise<void>;
  presignResultFileUpload(
    jobId: string,
    payload: {
      filename: string;
      storage_key: string;
      size_bytes: number;
      content_type?: string;
    },
  ): Promise<ResultFileUploadPlan>;
  initMultipartResultUpload(
    jobId: string,
    payload: {
      filename: string;
      storage_key: string;
      content_type?: string;
    },
  ): Promise<MultipartUploadSession>;
  presignMultipartResultPart(
    jobId: string,
    payload: {
      storage_key: string;
      upload_id: string;
      part_number: number;
    },
  ): Promise<MultipartPartUploadPlan>;
  completeMultipartResultUpload(
    jobId: string,
    payload: {
      storage_key: string;
      upload_id: string;
      parts: Array<{ part_number: number; etag: string }>;
    },
  ): Promise<void>;
  abortMultipartResultUpload(
    jobId: string,
    payload: {
      storage_key: string;
      upload_id: string;
    },
  ): Promise<void>;
};

const request = async <T = unknown>(
  config: WorkerConfig,
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    rawBody?: BodyInit;
    timeoutMs?: number;
  } = {},
): Promise<ApiResponse<T>> => {
  const url = `${config.serverUrl}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    ...(options.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 35_000,
  );

  try {
    const init: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };
    if (body !== undefined) {
      init.body = body;
    }
    const response = await fetch(url, init);

    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }

    return { ok: response.ok, data, status: response.status };
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeResultStorage = (
  resultStorage: ResultStorage | undefined,
): ResultStorage => resultStorage ?? { backend: "local" };

export const createApiClient = (config: WorkerConfig): ApiClient => {
  return {
    async sendHeartbeat(): Promise<HeartbeatResponse> {
      const res = await request<HeartbeatResponse>(config, "POST", "/workers/heartbeat", {
        timeoutMs: 10_000,
      });
      if (!res.ok) {
        throw new Error(`Heartbeat failed: ${res.status}`);
      }
      return res.data;
    },

    async getActiveJobs(): Promise<ActiveJob[]> {
      const res = await request<{ jobs: ActiveJob[] }>(
        config,
        "GET",
        "/workers/jobs/active",
        { timeoutMs: 10_000 },
      );
      if (!res.ok) {
        throw new Error(`Get active jobs failed: ${res.status}`);
      }
      return (res.data.jobs ?? []).map((job) => ({
        ...job,
        result_storage: normalizeResultStorage(job.result_storage),
      }));
    },

    async claimNextJob(): Promise<ClaimedJob | null> {
      const res = await request<{ job: ClaimedJob | null }>(
        config,
        "GET",
        "/workers/jobs/next",
        { timeoutMs: 35_000 },
      );
      if (!res.ok) {
        throw new Error(`Claim failed: ${res.status}`);
      }
      if (!res.data.job) {
        return null;
      }
      return {
        ...res.data.job,
        result_storage: normalizeResultStorage(res.data.job.result_storage),
      };
    },

    async startJob(jobId: string): Promise<void> {
      const res = await request(config, "POST", `/workers/jobs/${jobId}/start`, {
        body: { progress_pct: 0 },
      });
      if (!res.ok) {
        throw new Error(`Start job failed: ${res.status}`);
      }
    },

    async updateProgress(
      jobId: string,
      progressPct: number,
      message?: string,
    ): Promise<void> {
      const res = await request(
        config,
        "PUT",
        `/workers/jobs/${jobId}/progress`,
        { body: { progress_pct: progressPct, message } },
      );
      if (!res.ok) {
        logger.warn(`Progress update failed: ${res.status}`);
      }
    },

    async completeJob(
      jobId: string,
      result: {
        result_files: Array<{
          filename: string;
          storage_key?: string;
          size_bytes: number;
          started_at?: string;
          content_type?: string;
        }>;
        video_segments: number[];
        render_metadata?: Record<string, unknown>;
      },
    ): Promise<void> {
      const res = await request(
        config,
        "POST",
        `/workers/jobs/${jobId}/complete`,
        { body: result },
      );
      if (!res.ok) {
        throw new Error(`Complete job failed: ${res.status}`);
      }
    },

    async failJob(jobId: string, errorMessage: string): Promise<void> {
      const res = await request(
        config,
        "POST",
        `/workers/jobs/${jobId}/fail`,
        { body: { error_message: errorMessage } },
      );
      if (!res.ok) {
        logger.error(`Fail job report failed: ${res.status}`);
      }
    },

    async downloadActivityFile(
      jobId: string,
      targetPath: string,
      onProgress?: (received: number, total: number) => void,
    ): Promise<void> {
      const { createWriteStream, statSync } = await import(
        "node:fs"
      );
      const path = await import("node:path");

      // Check for existing partial download
      let existingSize = 0;
      try {
        const stat = statSync(targetPath);
        existingSize = stat.size;
      } catch {
        // File doesn't exist, start from scratch
      }

      const dir = path.dirname(targetPath);
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dir, { recursive: true });

      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
      };

      if (existingSize > 0) {
        headers["Range"] = `bytes=${existingSize}-`;
        logger.info(
          `Resuming download from byte ${existingSize}`,
        );
      }

      const url = `${config.serverUrl}/files/activity/${jobId}`;
      const response = await fetch(url, { headers });

      if (!response.ok && response.status !== 206) {
        throw new Error(
          `Download failed: ${response.status} ${response.statusText}`,
        );
      }

      const isResumedDownload = existingSize > 0 && response.status === 206;
      if (existingSize > 0 && !isResumedDownload) {
        logger.warn("Server did not honor Range request, restarting download from scratch.");
        existingSize = 0;
      }

      const contentLength = response.headers.get("Content-Length");
      const totalSize = contentLength
        ? parseInt(contentLength, 10) + existingSize
        : undefined;

      const fileStream = createWriteStream(targetPath, {
        flags: existingSize > 0 && response.status === 206 ? "a" : "w",
      });

      if (!response.body) {
        throw new Error("No response body for download");
      }

      const reader = response.body.getReader();
      let received = existingSize;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!fileStream.write(value)) {
          await once(fileStream, "drain");
        }
        received += value.length;
        if (totalSize && onProgress) {
          onProgress(received, totalSize);
        }
      }

      fileStream.end();
      await once(fileStream, "finish");
      logger.info(`Downloaded ${targetPath} (${received} bytes)`);
    },

    async initResultUpload(
      jobId: string,
      filename: string,
      totalSize: number,
    ): Promise<string> {
      const res = await request<{ upload_id: string; chunk_size: number }>(
        config,
        "POST",
        "/files/result/upload-init",
        {
          body: { job_id: jobId, filename, total_size: totalSize },
        },
      );
      if (!res.ok) {
        throw new Error(`Upload init failed: ${res.status}`);
      }
      return res.data.upload_id;
    },

    async uploadChunk(
      uploadId: string,
      chunkIndex: number,
      data: Buffer,
    ): Promise<{ received_bytes: number; total_received: number }> {
      const res = await request<{
        received_bytes: number;
        total_received: number;
      }>(config, "PUT", `/files/result/upload-chunk?upload_id=${uploadId}&chunk_index=${chunkIndex}`, {
        rawBody: new Uint8Array(data),
        headers: { "Content-Type": "application/octet-stream" },
      });
      if (!res.ok) {
        throw new Error(`Upload chunk failed: ${res.status}`);
      }
      return res.data;
    },

    async completeResultUpload(
      uploadId: string,
      jobId: string,
      filename: string,
    ): Promise<void> {
      const res = await request(config, "POST", "/files/result/upload-complete", {
        body: { upload_id: uploadId, job_id: jobId, filename },
      });
      if (!res.ok) {
        throw new Error(`Upload complete failed: ${res.status}`);
      }
    },

    async presignResultFileUpload(
      jobId: string,
      payload: {
        filename: string;
        storage_key: string;
        size_bytes: number;
        content_type?: string;
      },
    ): Promise<ResultFileUploadPlan> {
      const res = await request<{ upload: ResultFileUploadPlan }>(
        config,
        "POST",
        `/workers/jobs/${jobId}/result-files/presign`,
        { body: payload },
      );
      if (!res.ok) {
        throw new Error(`Presign result upload failed: ${res.status}`);
      }
      return res.data.upload;
    },

    async initMultipartResultUpload(
      jobId: string,
      payload: {
        filename: string;
        storage_key: string;
        content_type?: string;
      },
    ): Promise<MultipartUploadSession> {
      const res = await request<{ upload: MultipartUploadSession }>(
        config,
        "POST",
        `/workers/jobs/${jobId}/result-files/multipart-init`,
        { body: payload },
      );
      if (!res.ok) {
        throw new Error(`Init multipart result upload failed: ${res.status}`);
      }
      return res.data.upload;
    },

    async presignMultipartResultPart(
      jobId: string,
      payload: {
        storage_key: string;
        upload_id: string;
        part_number: number;
      },
    ): Promise<MultipartPartUploadPlan> {
      const res = await request<{ upload: MultipartPartUploadPlan }>(
        config,
        "POST",
        `/workers/jobs/${jobId}/result-files/multipart-part-url`,
        { body: payload },
      );
      if (!res.ok) {
        throw new Error(`Presign multipart result part failed: ${res.status}`);
      }
      return res.data.upload;
    },

    async completeMultipartResultUpload(
      jobId: string,
      payload: {
        storage_key: string;
        upload_id: string;
        parts: Array<{ part_number: number; etag: string }>;
      },
    ): Promise<void> {
      const res = await request(
        config,
        "POST",
        `/workers/jobs/${jobId}/result-files/multipart-complete`,
        { body: payload },
      );
      if (!res.ok) {
        throw new Error(`Complete multipart result upload failed: ${res.status}`);
      }
    },

    async abortMultipartResultUpload(
      jobId: string,
      payload: {
        storage_key: string;
        upload_id: string;
      },
    ): Promise<void> {
      const res = await request(
        config,
        "POST",
        `/workers/jobs/${jobId}/result-files/multipart-abort`,
        { body: payload },
      );
      if (!res.ok) {
        throw new Error(`Abort multipart result upload failed: ${res.status}`);
      }
    },
  };
};
