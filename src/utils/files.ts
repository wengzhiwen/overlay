import { mkdir } from "node:fs/promises";
import path from "node:path";

export const resolveProjectPath = (targetPath: string): string => {
  return path.resolve(process.cwd(), targetPath);
};

export const ensureDirectoryPath = async (directoryPath: string): Promise<string> => {
  await mkdir(directoryPath, { recursive: true });

  return directoryPath;
};
