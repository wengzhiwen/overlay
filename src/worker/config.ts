import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const WorkerConfigSchema = z.object({
  serverUrl: z.string().url(),
  apiKey: z.string().min(1),
  workDir: z.string().default("/tmp/overlay-worker"),
  heartbeatIntervalMs: z.number().int().min(10_000).default(60_000),
  pollIntervalMs: z.number().int().min(1_000).default(1_000),
  maxConcurrency: z.number().int().min(1).default(1),
  chunkSizeBytes: z.number().int().min(1_048_576).default(5_242_880), // 5MB
  progressReportIntervalMs: z.number().int().min(5_000).default(15_000),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export type WorkerCliOptions = {
  server?: string;
  "api-key"?: string;
  "work-dir"?: string;
  "heartbeat-interval"?: string;
  "poll-interval"?: string;
  concurrency?: string;
};

/**
 * Load env vars from a .env file (simple key=VALUE parser).
 * Does not overwrite existing env vars (same semantics as python-dotenv).
 */
const loadEnvFile = (filePath: string): void => {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Do not overwrite existing env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

/**
 * Resolve config from env vars + CLI overrides.
 * Priority: CLI arg > env var > .env file > default.
 */
export const resolveWorkerConfig = (
  cliOptions: WorkerCliOptions,
): WorkerConfig => {
  // Load .env from project root
  const envPath = path.resolve(process.cwd(), ".env");
  loadEnvFile(envPath);

  const getNumber = (cliVal: string | undefined, envKey: string): number | undefined => {
    if (cliVal !== undefined) return Number(cliVal);
    const envVal = process.env[envKey];
    if (envVal !== undefined) return Number(envVal);
    return undefined;
  };

  return WorkerConfigSchema.parse({
    serverUrl: cliOptions.server ?? process.env["WORKER_SERVER_URL"],
    apiKey: cliOptions["api-key"] ?? process.env["WORKER_API_KEY"],
    workDir: cliOptions["work-dir"] ?? process.env["WORKER_WORK_DIR"],
    heartbeatIntervalMs: getNumber(cliOptions["heartbeat-interval"], "WORKER_HEARTBEAT_INTERVAL_SEC")
      ? getNumber(cliOptions["heartbeat-interval"], "WORKER_HEARTBEAT_INTERVAL_SEC")! * 1000
      : process.env["WORKER_HEARTBEAT_INTERVAL_MS"]
        ? Number(process.env["WORKER_HEARTBEAT_INTERVAL_MS"])
        : undefined,
    pollIntervalMs: getNumber(cliOptions["poll-interval"], "WORKER_POLL_INTERVAL_SEC")
      ? getNumber(cliOptions["poll-interval"], "WORKER_POLL_INTERVAL_SEC")! * 1000
      : process.env["WORKER_POLL_INTERVAL_MS"]
        ? Number(process.env["WORKER_POLL_INTERVAL_MS"])
        : undefined,
    maxConcurrency: getNumber(cliOptions.concurrency, "WORKER_CONCURRENCY"),
    chunkSizeBytes: process.env["WORKER_CHUNK_SIZE_BYTES"]
      ? Number(process.env["WORKER_CHUNK_SIZE_BYTES"])
      : undefined,
  });
};
