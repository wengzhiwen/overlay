import { access } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";

import { renderOverlay } from "../../render/render-overlay.js";
import { resolveProjectPath } from "../../utils/files.js";

const parseConcurrency = (value: string): number => {
  if (value.endsWith("%")) {
    const pct = Number(value.slice(0, -1));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new Error(`Invalid concurrency percentage: ${value}`);
    }
    return Math.max(1, Math.round((os.cpus().length * pct) / 100));
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid concurrency value: ${value}`);
  }
  return Math.round(n);
};

export type RenderCommandOptions = {
  input: string;
  config: string;
  output?: string;
  sample?: boolean;
  concurrency?: string;
};

const ensureReadableFile = async (
  filePath: string,
  label: string,
): Promise<void> => {
  await access(filePath, constants.R_OK).catch(() => {
    throw new Error(`${label} file is not readable: ${filePath}`);
  });
};

export const runRenderCommand = async (
  options: RenderCommandOptions,
): Promise<number> => {
  const inputPath = resolveProjectPath(options.input);
  const configPath = resolveProjectPath(options.config);
  const outputPath = options.output
    ? resolveProjectPath(options.output)
    : undefined;

  await ensureReadableFile(inputPath, "Input");
  await ensureReadableFile(configPath, "Config");

  console.log("Starting render command.");
  console.log(`Input file: ${inputPath}`);
  console.log(`Config file: ${configPath}`);
  console.log(`Output target: ${outputPath ?? resolveProjectPath("output")}`);
  console.log(
    `Sample mode: ${options.sample ? "enabled (max 30 seconds)" : "disabled"}`,
  );

  if (options.concurrency) {
    console.log(`Concurrency: ${options.concurrency}`);
  }

  const concurrency = options.concurrency
    ? parseConcurrency(options.concurrency)
    : undefined;

  const result = await renderOverlay({
    inputPath,
    configPath,
    outputPath,
    maxDurationMs: options.sample ? 30_000 : undefined,
    concurrency,
    onProgress: (message) => {
      console.log(message);
    },
  });

  console.log(result.message);
  console.log(`Run output directory: ${result.outputPath}`);

  return result.exitCode;
};
