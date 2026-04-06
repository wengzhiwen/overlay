#!/usr/bin/env node

import { readFileSync } from "node:fs";
import v8 from "node:v8";
import { spawn } from "node:child_process";

import { Command } from "commander";

import { runRenderCommand } from "./commands/render.js";

type PackageMetadata = {
  name?: string;
  version?: string;
  description?: string;
};

const loadPackageMetadata = (): PackageMetadata => {
  const packageJsonUrl = new URL("../../package.json", import.meta.url);
  const packageJsonContent = readFileSync(packageJsonUrl, "utf8");

  return JSON.parse(packageJsonContent) as PackageMetadata;
};

// When --segments > 1, multiple parallel renderMedia calls need more heap.
// Re-spawn with enlarged heap if the current limit is too low.
const ensureHeapForSegments = (segments: number): void => {
  const HEAP_PER_SEGMENT_MB = 2048; // ~2GB per segment headroom
  const neededMB = Math.max(4096, segments * HEAP_PER_SEGMENT_MB);
  const currentLimitMB = Math.floor(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);

  if (currentLimitMB >= neededMB) return;

  console.log(
    `Increasing Node.js heap to ${neededMB}MB (current: ${currentLimitMB}MB) for ${segments} parallel segment(s).`,
  );

  const env = { ...process.env, NODE_OPTIONS: `--max-old-space-size=${neededMB}` };
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env,
  });

  child.on("close", (code) => {
    process.exit(code ?? 1);
  });

  // Signal the caller to stop – we've handed off to the child.
  throw new Error("__RESPAWN__");
};

const main = async (): Promise<void> => {
  const packageMetadata = loadPackageMetadata();

  const program = new Command();

  program
    .name(packageMetadata.name ?? "overlay")
    .description(
      packageMetadata.description ??
        "Generate overlay videos from GPX or TCX activity files.",
    )
    .version(packageMetadata.version ?? "0.0.0");

  program
    .command("render")
    .description("Render a transparent overlay video from an activity file.")
    .requiredOption("-i, --input <path>", "Path to a GPX or TCX activity file.")
    .requiredOption("-c, --config <path>", "Path to a JSON or YAML config file.")
    .option(
      "-o, --output <path>",
      "Output directory for generated artifacts. Defaults to output/<timestamp>.",
    )
    .option(
      "--sample",
      "Limit the rendered output to at most 30 seconds for faster preview rendering.",
      false,
    )
    .option(
      "--concurrency <value>",
      "Number of parallel render threads. Accepts a number (e.g. 8) or percentage of CPU threads (e.g. 75%). Defaults to Remotion's automatic selection.",
    )
    .option(
      "--segments <number>",
      "Split render into N segments for parallel processing. Each segment must be at least 10 seconds. Requires ffmpeg for concatenation.",
      (value: string) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
          throw new Error(`--segments must be a positive integer, got: ${value}`);
        }
        return n;
      },
    )
    .action(
      async (options: {
        input: string;
        config: string;
        output?: string;
        sample: boolean;
        concurrency?: string;
        segments?: number;
      }) => {
        if (options.segments && options.segments > 1) {
          ensureHeapForSegments(options.segments);
        }
        process.exitCode = await runRenderCommand(options);
      },
    );

  await program.parseAsync(process.argv);
};

main().catch((error: unknown) => {
  if (error instanceof Error && error.message === "__RESPAWN__") {
    // Re-spawn happened; this process exits silently.
    return;
  }
  const message =
    error instanceof Error ? error.message : "Unknown CLI bootstrap error.";

  console.error(`CLI bootstrap failed: ${message}`);
  process.exitCode = 1;
});
