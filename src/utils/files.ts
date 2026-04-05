import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const resolveProjectPath = (targetPath: string): string => {
  return path.resolve(process.cwd(), targetPath);
};

export const ensureDirectoryPath = async (
  directoryPath: string,
): Promise<string> => {
  await mkdir(directoryPath, { recursive: true });

  return directoryPath;
};

export const readTextFile = async (filePath: string): Promise<string> => {
  return readFile(filePath, "utf8");
};

export const writeTextFile = async (
  filePath: string,
  content: string,
): Promise<void> => {
  await ensureDirectoryPath(path.dirname(filePath));
  await writeFile(filePath, content, "utf8");
};

export const writeJsonFile = async (
  filePath: string,
  value: unknown,
): Promise<void> => {
  await writeTextFile(filePath, JSON.stringify(value, null, 2));
};

export const copyFileToDirectory = async (
  sourceFilePath: string,
  targetDirectoryPath: string,
): Promise<string> => {
  await ensureDirectoryPath(targetDirectoryPath);

  const targetFilePath = path.join(
    targetDirectoryPath,
    path.basename(sourceFilePath),
  );

  await copyFile(sourceFilePath, targetFilePath);

  return targetFilePath;
};

export const toSafeTimestamp = (date: Date): string => {
  return date.toISOString().replaceAll(":", "-");
};

export const createTimestampedOutputDirectory = async (
  rootDirectoryPath: string,
  date = new Date(),
): Promise<{ runId: string; outputPath: string }> => {
  await ensureDirectoryPath(rootDirectoryPath);

  const runId = toSafeTimestamp(date);
  const outputPath = path.join(rootDirectoryPath, runId);

  await ensureDirectoryPath(outputPath);

  return { runId, outputPath };
};
