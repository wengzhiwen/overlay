import { access } from "node:fs/promises";
import { constants } from "node:fs";

import { renderOverlay } from "../../render/render-overlay.js";
import { resolveProjectPath } from "../../utils/files.js";

export type RenderCommandOptions = {
  input: string;
  config: string;
  output?: string;
  sample?: boolean;
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

  const result = await renderOverlay({
    inputPath,
    configPath,
    outputPath,
    maxDurationMs: options.sample ? 30_000 : undefined,
    onProgress: (message) => {
      console.log(message);
    },
  });

  console.log(result.message);
  console.log(`Run output directory: ${result.outputPath}`);

  return result.exitCode;
};
