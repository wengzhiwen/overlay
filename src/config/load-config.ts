import path from "node:path";

import YAML from "yaml";

import type { OverlayConfig } from "./schema.js";
import { OverlayConfigSchema } from "./schema.js";
import { readTextFile } from "../utils/files.js";

const parseConfigContent = (content: string, filePath: string): unknown => {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") {
    return JSON.parse(content) as unknown;
  }

  if (extension === ".yaml" || extension === ".yml") {
    return YAML.parse(content) as unknown;
  }

  throw new Error(`Unsupported config file extension: ${extension}`);
};

export const loadOverlayConfig = async (
  filePath: string,
): Promise<OverlayConfig> => {
  const content = await readTextFile(filePath);
  const parsed = parseConfigContent(content, filePath);

  return OverlayConfigSchema.parse(parsed);
};
