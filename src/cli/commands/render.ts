import { access } from "node:fs/promises";
import { constants } from "node:fs";

import { renderOverlay } from "../../render/render-overlay.js";
import { ensureDirectoryPath, resolveProjectPath } from "../../utils/files.js";

export type RenderCommandOptions = {
  input: string;
  config: string;
  output?: string;
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
  const outputPath = await ensureDirectoryPath(
    resolveProjectPath(options.output ?? "output"),
  );

  await ensureReadableFile(inputPath, "Input");
  await ensureReadableFile(configPath, "Config");

  console.log("Starting render command.");
  console.log(`Input file: ${inputPath}`);
  console.log(`Config file: ${configPath}`);
  console.log(`Output directory: ${outputPath}`);

  const result = await renderOverlay({
    inputPath,
    configPath,
    outputPath,
  });

  console.log(result.message);

  return result.exitCode;
};
