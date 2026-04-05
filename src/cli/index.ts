#!/usr/bin/env node

import { readFileSync } from "node:fs";

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
    .action(
      async (options: {
        input: string;
        config: string;
        output?: string;
        sample: boolean;
      }) => {
        process.exitCode = await runRenderCommand(options);
      },
    );

  await program.parseAsync(process.argv);
};

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown CLI bootstrap error.";

  console.error(`CLI bootstrap failed: ${message}`);
  process.exitCode = 1;
});
