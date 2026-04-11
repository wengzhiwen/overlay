import path from "node:path";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, readdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { bundle } from "@remotion/bundler";
import { renderFrames } from "@remotion/renderer";

import { loadOverlayConfig } from "../config/load-config.js";
import type { OverlayConfig } from "../config/schema.js";
import { SNAPSHOT_INTERVAL_MS } from "../domain/frame-data.js";
import type { FrameDataMeta } from "../remotion/Root.js";
import { loadActivity } from "../parsers/activity-loader.js";
import { buildFrameData } from "../preprocess/build-frame-data.js";
import type { ElevationHistoryPoint } from "../domain/frame-data.js";
import { detectGaps } from "../preprocess/detect-gaps.js";
import { deriveMetrics } from "../preprocess/derive-metrics.js";
import { fillShortGaps } from "../preprocess/fill-gaps.js";
import { interpolateActivity } from "../preprocess/interpolate.js";
import { normalizeActivity } from "../preprocess/normalize.js";
import { smoothActivity } from "../preprocess/smooth.js";
import { splitActivityAtLongGaps } from "../preprocess/split-activity.js";
import {
  consumeRemainingRenderBudgetMs,
  MIN_REMAINING_RENDER_BUDGET_MS,
  shouldRenderNextSegment,
} from "./render-budget.js";
import { PRORES_ALPHA_PIXEL_FORMAT } from "./codecs.js";
import {
  copyFileToDirectory,
  createTimestampedOutputDirectory,
  ensureDirectoryPath,
  getLocalTimestampedOutputBaseName,
  writeJsonFile,
} from "../utils/files.js";

export type RenderOverlayRequest = {
  inputPath: string;
  configPath: string;
  outputPath?: string | undefined;
  maxDurationMs?: number | undefined;
  concurrency?: number | undefined;
  segments?: number | undefined;
  onProgress?: ((message: string) => void) | undefined;
};

export type RenderOverlayResult = {
  exitCode: number;
  message: string;
  outputPath: string;
  outputs: Array<{ path: string; startedAt: string | undefined; durationSeconds: number }>;
};

type RenderMetadata = {
  runId: string;
  createdAt: string;
  input: {
    activityFile: string;
    configFile: string;
    format: "gpx" | "tcx";
  };
  render: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    snapshotIntervalMs: number;
    outputFormat: string;
    sampleMaxDurationMs: number | undefined;
  };
  activity: {
    startedAt: string | undefined;
    durationMs: number | undefined;
    distanceM: number | undefined;
    ascentM: number | undefined;
  };
  warnings: string[];
};

type StepLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

const execFileAsync = promisify(execFile);

const createStepLogger = (
  filePath: string,
  emitProgress: (message: string) => void,
): {
  logger: StepLogger;
  close: () => Promise<void>;
} => {
  const stream = createWriteStream(filePath, { flags: "a" });
  let closed = false;

  const push = (level: "INFO" | "WARN" | "ERROR", message: string) => {
    if (closed || stream.destroyed || stream.writableEnded) {
      return;
    }

    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    stream.write(`${line}\n`);
    emitProgress(line);
  };

  return {
    logger: {
      info: (message) => push("INFO", message),
      warn: (message) => push("WARN", message),
      error: (message) => push("ERROR", message),
    },
    close: async () => {
      closed = true;
      await new Promise<void>((resolve, reject) => {
        stream.end((error?: Error | null) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

const runLoggedStep = async <T>(
  fileName: string,
  logsDirectoryPath: string,
  onProgress: (message: string) => void,
  callback: (logger: StepLogger) => Promise<T>,
): Promise<T> => {
  const stepLabel = fileName.replace(/\.log$/, "");
  const emitProgress = (line: string) => {
    onProgress(`[${stepLabel}] ${line}`);
  };
  const { logger, close } = createStepLogger(
    path.join(logsDirectoryPath, fileName),
    emitProgress,
  );
  const startedAt = new Date();

  logger.info(`Step started: ${fileName}`);

  try {
    const result = await callback(logger);
    logger.info(
      `Step finished successfully in ${Date.now() - startedAt.getTime()}ms`,
    );
    await close();

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    logger.error(message);
    logger.info(`Step failed after ${Date.now() - startedAt.getTime()}ms`);
    await close();
    throw error;
  }
};

const resolveOutputDirectory = async (
  outputPath: string | undefined,
): Promise<{ runId: string; outputPath: string }> => {
  if (outputPath) {
    await ensureDirectoryPath(outputPath);

    return {
      runId: path.basename(outputPath),
      outputPath,
    };
  }

  return createTimestampedOutputDirectory(path.resolve(process.cwd(), "output"));
};

const bundleRemotionProject = async (logger: StepLogger): Promise<string> => {
  let lastProgressBucket = -1;

  return bundle({
    entryPoint: path.resolve(process.cwd(), "dist/remotion/index.js"),
    onProgress: (progress) => {
      const progressPercent = progress > 1 ? progress : progress * 100;
      const normalizedProgressPercent = Math.max(
        0,
        Math.min(100, progressPercent),
      );
      const bucket = Math.floor(normalizedProgressPercent / 10);

      if (bucket !== lastProgressBucket) {
        lastProgressBucket = bucket;
        logger.info(
          `Bundle progress: ${Math.round(normalizedProgressPercent)}%`,
        );
      }
    },
  });
};

const buildProjectForRender = async (logger: StepLogger): Promise<void> => {
  logger.info("Building project before bundling Remotion entry.");
  const { stdout, stderr } = await execFileAsync("npm", ["run", "build"], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 20,
  });

  if (stdout.trim()) {
    logger.info(stdout.trim());
  }

  if (stderr.trim()) {
    logger.warn(stderr.trim());
  }
};

type CompositionSpec = {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  defaultProps: Record<string, unknown>;
  props: Record<string, unknown>;
  defaultCodec: null;
  defaultOutName: null;
  defaultVideoImageFormat: null;
  defaultPixelFormat: null;
  defaultProResProfile: null;
};

const formatEta = (seconds: number): string => {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

const MIN_SEGMENT_SECONDS = 10;
const MAX_PARALLEL_ENCODERS = 2;

type FrameRange = [number, number];

const PRORES_PROFILE_TO_FFMPEG_PROFILE: Record<OverlayConfig["render"]["output"]["proresProfile"], string> = {
  "4444": "4",
  "4444-xq": "5",
};

let cachedFfmpegExecutablePath: string | undefined;

const resolveFfmpegExecutablePath = async (): Promise<string> => {
  if (cachedFfmpegExecutablePath) {
    return cachedFfmpegExecutablePath;
  }

  try {
    await execFileAsync("ffmpeg", ["-version"], {
      maxBuffer: 1024 * 1024 * 5,
    });
    cachedFfmpegExecutablePath = "ffmpeg";
    return cachedFfmpegExecutablePath;
  } catch {
    // Fall back to bundled ffmpeg binaries below.
  }

  const remotionRoot = path.join(process.cwd(), "node_modules", "@remotion");

  try {
    const packages = await readdir(remotionRoot);

    for (const packageName of packages) {
      if (!packageName.startsWith("compositor-")) {
        continue;
      }

      for (const binaryName of ["ffmpeg", "ffmpeg.exe"]) {
        const candidatePath = path.join(remotionRoot, packageName, binaryName);

        try {
          await access(candidatePath);
          cachedFfmpegExecutablePath = candidatePath;
          return candidatePath;
        } catch {
          // Try the next bundled binary candidate.
        }
      }
    }
  } catch {
    // Fall back to a system ffmpeg below.
  }

  cachedFfmpegExecutablePath = "ffmpeg";
  return cachedFfmpegExecutablePath;
};

const getFfmpegEnv = (ffmpegExecutablePath: string): NodeJS.ProcessEnv => {
  if (ffmpegExecutablePath === "ffmpeg") {
    return process.env;
  }

  const libraryDirectoryPath = path.dirname(ffmpegExecutablePath);

  return {
    ...process.env,
    DYLD_LIBRARY_PATH: process.env.DYLD_LIBRARY_PATH
      ? `${libraryDirectoryPath}:${process.env.DYLD_LIBRARY_PATH}`
      : libraryDirectoryPath,
    LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
      ? `${libraryDirectoryPath}:${process.env.LD_LIBRARY_PATH}`
      : libraryDirectoryPath,
  };
};

const getSnapshotRenderStep = (
  composition: Pick<CompositionSpec, "fps">,
  snapshotIntervalMs: number,
): number => {
  return Math.max(1, Math.round((snapshotIntervalMs / 1000) * composition.fps));
};

const getRenderableFrameCount = (
  frameRange: FrameRange,
  everyNthFrame: number,
): number => {
  const [startFrame, endFrame] = frameRange;
  const firstRenderableFrame =
    Math.ceil(startFrame / everyNthFrame) * everyNthFrame;

  if (firstRenderableFrame > endFrame) {
    return 0;
  }

  return Math.floor((endFrame - firstRenderableFrame) / everyNthFrame) + 1;
};

const createConcurrencyLimiter = (limit: number) => {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const scheduleNext = () => {
    if (activeCount >= limit) {
      return;
    }

    const next = queue.shift();

    if (!next) {
      return;
    }

    activeCount += 1;
    next();
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (activeCount >= limit) {
      await new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    } else {
      activeCount += 1;
    }

    try {
      return await task();
    } finally {
      activeCount -= 1;
      scheduleNext();
    }
  };
};

const calculateSegments = (
  requestedSegments: number,
  totalFrames: number,
  fps: number,
  snapshotIntervalMs: number,
): FrameRange[] => {
  const totalSeconds = Math.floor(totalFrames / fps);
  const maxSegments = Math.max(1, Math.floor(totalSeconds / MIN_SEGMENT_SECONDS));
  const actualSegments = Math.max(1, Math.min(requestedSegments, maxSegments));

  if (actualSegments <= 1) {
    return [[0, totalFrames - 1]];
  }

  const frameStep = getSnapshotRenderStep({ fps }, snapshotIntervalMs);
  const totalSnapshots = Math.max(1, Math.ceil(totalFrames / frameStep));
  const baseSnapshotsPerSegment = Math.floor(totalSnapshots / actualSegments);
  const remainderSnapshots = totalSnapshots % actualSegments;
  const ranges: FrameRange[] = [];
  let nextSnapshotIndex = 0;

  for (let index = 0; index < actualSegments; index += 1) {
    const snapshotCount =
      baseSnapshotsPerSegment + (index < remainderSnapshots ? 1 : 0);

    if (snapshotCount <= 0) {
      continue;
    }

    const startFrame = nextSnapshotIndex * frameStep;
    const endFrame = Math.min(
      totalFrames - 1,
      (nextSnapshotIndex + snapshotCount - 1) * frameStep,
    );

    if (startFrame <= endFrame) {
      ranges.push([startFrame, endFrame]);
    }

    nextSnapshotIndex += snapshotCount;
  }

  return ranges;
};

const ffmpegConcat = async (
  segmentPaths: string[],
  outputPath: string,
  logger: StepLogger,
): Promise<void> => {
  const ffmpegExecutablePath = await resolveFfmpegExecutablePath();
  const concatListPath = path.join(path.dirname(outputPath), "concat.txt");
  const concatContent = segmentPaths
    .map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`)
    .join("\n");

  await writeFile(concatListPath, concatContent, "utf8");
  logger.info(`Concatenating ${segmentPaths.length} segment(s) with ${path.basename(ffmpegExecutablePath)}.`);

  try {
    await execFileAsync(
      ffmpegExecutablePath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        "-y",
        outputPath,
      ],
      {
        env: getFfmpegEnv(ffmpegExecutablePath),
        maxBuffer: 1024 * 1024 * 20,
      },
    );
  } finally {
    await rm(concatListPath, { force: true });
  }
};

const FRAME_DATA_FILENAME = "frame-data.json";

const hasCityMapWidget = (config: OverlayConfig): boolean => {
  return config.widgets.some((widget) => widget.type === "citymap");
};

type RenderInputProps = {
  frameDataMeta: FrameDataMeta;
  overlayConfig: OverlayConfig;
};

const renderMovSegmented = async (
  serveUrl: string,
  composition: CompositionSpec,
  inputProps: RenderInputProps,
  targetFilePath: string,
  logger: StepLogger,
  concurrency: number | undefined,
  segments: number,
  proresProfile: OverlayConfig["render"]["output"]["proresProfile"],
  snapshotIntervalMs: number,
  gl?: "angle" | undefined,
): Promise<void> => {
  const totalFrames = composition.durationInFrames;
  const ranges = calculateSegments(
    segments,
    totalFrames,
    composition.fps,
    snapshotIntervalMs,
  );

  if (ranges.length <= 1) {
    logger.info(
      `Requested ${segments} segment(s) but duration too short. Falling back to single render.`,
    );
    await renderMov(
      serveUrl,
      composition,
      inputProps,
      targetFilePath,
      logger,
      concurrency,
      proresProfile,
      snapshotIntervalMs,
      gl,
    );
    return;
  }

  logger.info(
    `Rendering ${ranges.length} low-frequency segment(s) in parallel. Total: ${totalFrames} frames at ${composition.fps}fps.`,
  );

  const segmentsDir = path.join(path.dirname(targetFilePath), ".remotion-segments");
  await ensureDirectoryPath(segmentsDir);

  const segmentPaths = ranges.map((_, index) =>
    path.join(segmentsDir, `seg_${String(index).padStart(3, "0")}.mov`),
  );

  const perSegmentConcurrency = concurrency
    ? Math.max(1, Math.floor(concurrency / ranges.length))
    : null;
  const encodeConcurrency = Math.max(
    1,
    Math.min(MAX_PARALLEL_ENCODERS, ranges.length),
  );
  const runEncode = createConcurrencyLimiter(encodeConcurrency);
  logger.info(
    `Per-segment concurrency: ${perSegmentConcurrency ?? "auto"} (${ranges.length} segment(s)).`,
  );
  logger.info(`FFmpeg encode concurrency: ${encodeConcurrency}.`);

  const previousMaxListeners = process.getMaxListeners();
  process.setMaxListeners(previousMaxListeners + ranges.length);

  let completedSegments = 0;
  const encodeStartTime = Date.now();

  try {
    const results = await Promise.allSettled(
      ranges.map(async ([startFrame, endFrame], index) => {
        const segmentPngDirectoryPath = path.join(
          segmentsDir,
          `frames_${String(index).padStart(3, "0")}`,
        );
        const frameStep = getSnapshotRenderStep(composition, snapshotIntervalMs);
        const renderableFrameCount = getRenderableFrameCount(
          [startFrame, endFrame],
          frameStep,
        );
        const segmentDurationSeconds =
          (renderableFrameCount * snapshotIntervalMs) / 1000;

        logger.info(
          `Segment ${index}: frames ${startFrame}-${endFrame} | ${renderableFrameCount} snapshot(s) | ${segmentDurationSeconds.toFixed(1)}s.`,
        );

        await ensureDirectoryPath(segmentPngDirectoryPath);
        try {
          await renderPngSequence(
            serveUrl,
            composition,
            inputProps,
            segmentPngDirectoryPath,
            logger,
            perSegmentConcurrency ?? undefined,
            snapshotIntervalMs,
            [startFrame, endFrame],
            gl,
          );
          await runEncode(() =>
            encodePngSequenceToMov(
              segmentPngDirectoryPath,
              segmentPaths[index]!,
              snapshotIntervalMs,
              composition.fps,
              proresProfile,
              logger,
            )
          );
          completedSegments++;
          const progress = completedSegments / ranges.length;
          const elapsedMs = Date.now() - encodeStartTime;
          const eta = progress > 0
            ? formatEta((elapsedMs / progress - elapsedMs) / 1000)
            : "--";
          logger.info(
            `Encoding progress: segment ${completedSegments}/${ranges.length} | ETA ${eta}`,
          );
        } finally {
          await rm(segmentPngDirectoryPath, { recursive: true, force: true });
        }
      }),
    );

    const rejectedResults = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    const firstRejectedResult = rejectedResults[0];

    if (firstRejectedResult) {
      throw firstRejectedResult.reason;
    }

    await ffmpegConcat(segmentPaths, targetFilePath, logger);
  } finally {
    process.setMaxListeners(previousMaxListeners);
    await rm(segmentsDir, { recursive: true, force: true });
  }
};

const encodePngSequenceToMov = async (
  pngDirectoryPath: string,
  targetFilePath: string,
  snapshotIntervalMs: number,
  outputFps: number,
  proresProfile: OverlayConfig["render"]["output"]["proresProfile"],
  logger: StepLogger,
): Promise<void> => {
  const ffmpegExecutablePath = await resolveFfmpegExecutablePath();
  const inputPattern = path.join(pngDirectoryPath, "*.png");
  const inputFps = 1000 / snapshotIntervalMs;

  logger.info(
    `Encoding MOV from ${inputFps}fps PNG sequence to ${outputFps}fps using ${path.basename(ffmpegExecutablePath)}.`,
  );

  await execFileAsync(
    ffmpegExecutablePath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      inputFps.toString(),
      "-pattern_type",
      "glob",
      "-i",
      inputPattern,
      "-vf",
      `fps=${outputFps}`,
      "-c:v",
      "prores_ks",
      "-profile:v",
      PRORES_PROFILE_TO_FFMPEG_PROFILE[proresProfile],
      "-pix_fmt",
      PRORES_ALPHA_PIXEL_FORMAT,
      "-alpha_bits",
      "16",
      "-y",
      targetFilePath,
    ],
    {
      env: getFfmpegEnv(ffmpegExecutablePath),
      maxBuffer: 1024 * 1024 * 20,
    },
  );
};

const renderMov = async (
  serveUrl: string,
  composition: CompositionSpec,
  inputProps: RenderInputProps,
  targetFilePath: string,
  logger: StepLogger,
  concurrency?: number | undefined,
  proresProfile: OverlayConfig["render"]["output"]["proresProfile"] = "4444",
  snapshotIntervalMs = SNAPSHOT_INTERVAL_MS,
  gl?: "angle" | undefined,
): Promise<void> => {
  const tempFramesDirectoryPath = path.join(
    path.dirname(targetFilePath),
    ".remotion-low-fps-frames",
  );
  const totalSeconds = composition.durationInFrames / composition.fps;

  logger.info(
    `Rendering MOV output via low-frequency PNG snapshots. Total duration: ${totalSeconds.toFixed(1)}s.`,
  );

  await ensureDirectoryPath(tempFramesDirectoryPath);

  try {
    await renderPngSequence(
      serveUrl,
      composition,
      inputProps,
      tempFramesDirectoryPath,
      logger,
      concurrency,
      snapshotIntervalMs,
      undefined,
      gl,
    );
    await encodePngSequenceToMov(
      tempFramesDirectoryPath,
      targetFilePath,
      snapshotIntervalMs,
      composition.fps,
      proresProfile,
      logger,
    );
  } finally {
    await rm(tempFramesDirectoryPath, { recursive: true, force: true });
  }
};

const renderPngSequence = async (
  serveUrl: string,
  composition: CompositionSpec,
  inputProps: RenderInputProps,
  outputDirectoryPath: string,
  logger: StepLogger,
  concurrency?: number | undefined,
  snapshotIntervalMs = SNAPSHOT_INTERVAL_MS,
  frameRange?: FrameRange,
  gl?: "angle" | undefined,
): Promise<void> => {
  let renderedFrames = 0;
  const renderStartTime = Date.now();
  const everyNthFrame = getSnapshotRenderStep(composition, snapshotIntervalMs);
  const effectiveFrameRange: FrameRange = frameRange ?? [0, composition.durationInFrames - 1];
  const renderedFrameCount = getRenderableFrameCount(
    effectiveFrameRange,
    everyNthFrame,
  );

  await renderFrames({
    serveUrl,
    composition,
    inputProps,
    outputDir: outputDirectoryPath,
    imageFormat: "png",
    logLevel: "error",
    concurrency: concurrency ?? null,
    frameRange: effectiveFrameRange,
    everyNthFrame,
    ...(gl ? { chromiumOptions: { gl } } : {}),
    onStart: ({ frameCount }) => {
      const totalSeconds = (frameCount * snapshotIntervalMs) / 1000;
      const outputFps = 1000 / snapshotIntervalMs;
      logger.info(
        `Rendering ${frameCount} PNG frame(s) at ${outputFps}fps from a ${composition.fps}fps composition. Total duration: ${totalSeconds.toFixed(1)}s.`,
      );
    },
    onFrameUpdate: (framesRendered) => {
      if (
        framesRendered !== renderedFrames &&
        (framesRendered === renderedFrameCount || framesRendered % 10 === 0)
      ) {
        renderedFrames = framesRendered;
        const progress = framesRendered / renderedFrameCount;
        const elapsedMs = Date.now() - renderStartTime;
        const eta = progress > 0
          ? formatEta((elapsedMs / progress - elapsedMs) / 1000)
          : "--";
        const renderedSeconds = (framesRendered * snapshotIntervalMs) / 1000;
        const totalSeconds = (renderedFrameCount * snapshotIntervalMs) / 1000;
        logger.info(
          `Render progress: frame ${framesRendered}/${renderedFrameCount} | video ${renderedSeconds.toFixed(1)}s/${totalSeconds.toFixed(1)}s | ETA ${eta}`,
        );
      }
    },
  });
};

export const renderOverlay = async (
  request: RenderOverlayRequest,
): Promise<RenderOverlayResult> => {
  const onProgress = request.onProgress ?? (() => undefined);
  const { runId, outputPath } = await resolveOutputDirectory(request.outputPath);
  const logsDirectoryPath = path.join(outputPath, "logs");
  const debugDirectoryPath = path.join(outputPath, "debug");
  const sourceDirectoryPath = path.join(outputPath, "source");

  await Promise.all([
    ensureDirectoryPath(logsDirectoryPath),
    ensureDirectoryPath(debugDirectoryPath),
    ensureDirectoryPath(sourceDirectoryPath),
  ]);

  const config = await runLoggedStep(
    "01-load-config.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info(`Loading config from ${request.configPath}`);
      const loadedConfig = await loadOverlayConfig(request.configPath);
      logger.info("Config loaded successfully.");
      if (request.maxDurationMs !== undefined) {
        logger.info(
          `Sample mode is enabled. Output will be limited to at most ${(request.maxDurationMs / 1000).toFixed(0)} second(s).`,
        );
      }
      return loadedConfig;
    },
  );

  const rawActivity = await runLoggedStep(
    "02-load-activity.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info(`Loading activity from ${request.inputPath}`);
      const activity = await loadActivity(request.inputPath);
      logger.info(`Loaded ${activity.samples.length} sample(s).`);
      return activity;
    },
  );

  const normalizedActivity = await runLoggedStep(
    "03-normalize-activity.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Normalizing activity samples.");
      const activity = await normalizeActivity(rawActivity);
      logger.info(`Normalized to ${activity.samples.length} sample(s).`);
      return activity;
    },
  );

  // Step 04: Detect gaps in the normalized activity.
  const classifiedGaps = await runLoggedStep(
    "04-detect-gaps.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      const result = detectGaps(normalizedActivity);
      logger.info(`Detected ${result.shortGaps.length} short gap(s) and ${result.longGaps.length} long gap(s).`);
      return result;
    },
  );

  // Split activity at long gaps into independent segments.
  const activitySegments = splitActivityAtLongGaps(
    normalizedActivity,
    classifiedGaps.longGaps,
    classifiedGaps.shortGaps,
  );

  if (activitySegments.length > 1) {
    onProgress(`Activity split into ${activitySegments.length} segment(s) after gap detection.`);
  }

  // Build and bundle Remotion ONCE — shared across all segments.
  await runLoggedStep(
    "05-build-project.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      await buildProjectForRender(logger);
    },
  );

  const serveUrl = await runLoggedStep(
    "06-bundle-remotion.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Bundling Remotion project.");
      const bundledServeUrl = await bundleRemotionProject(logger);
      logger.info(`Bundle output ready at ${bundledServeUrl}`);
      return bundledServeUrl;
    },
  );

  await copyFileToDirectory(request.inputPath, sourceDirectoryPath);
  await copyFileToDirectory(request.configPath, sourceDirectoryPath);

  // Process each segment sequentially: derive → interpolate → smooth → fill gaps →
  // build frame data → write frame data → render.
  const renderOutputs: Array<{ path: string; startedAt: string | undefined; durationSeconds: number }> = [];
  let cumulativeElapsedOffsetMs = 0;
  let cumulativeElevationHistory: ElevationHistoryPoint[] = [];
  let remainingRenderBudgetMs = request.maxDurationMs;

  for (let segmentIndex = 0; segmentIndex < activitySegments.length; segmentIndex++) {
    if (!shouldRenderNextSegment(remainingRenderBudgetMs)) {
      const remainingBudgetMs = remainingRenderBudgetMs ?? 0;
      onProgress(
        remainingBudgetMs <= 0
          ? `Reached maxRenderTimeMs for this job. Skipping the remaining ${activitySegments.length - segmentIndex} segment(s).`
          : `Remaining maxRenderTimeMs for this job is below ${(MIN_REMAINING_RENDER_BUDGET_MS / 1000).toFixed(0)} seconds. Skipping the remaining ${activitySegments.length - segmentIndex} segment(s).`,
      );
      break;
    }

    const segment = activitySegments[segmentIndex]!;
    const segmentLabel = activitySegments.length > 1
      ? `segment ${segmentIndex + 1}/${activitySegments.length}`
      : "activity";

    onProgress(`Processing ${segmentLabel}...`);

    const derivedActivity = await runLoggedStep(
      `07-${String(segmentIndex).padStart(2, "0")}-derive-metrics.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        logger.info(`Deriving metrics for ${segmentLabel}.`);
        const activity = await deriveMetrics(segment);
        logger.info("Metric derivation finished.");
        return activity;
      },
    );

    const gapFilledActivity = await runLoggedStep(
      `08-${String(segmentIndex).padStart(2, "0")}-fill-gaps.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        logger.info("Expanding sparse samples to 1Hz and filling short gaps.");
        const activity = fillShortGaps(derivedActivity, derivedActivity.gaps);
        logger.info(`Filled activity has ${activity.samples.length} sample(s).`);
        return activity;
      },
    );

    const interpolatedActivity = await runLoggedStep(
      `09-${String(segmentIndex).padStart(2, "0")}-interpolate.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        logger.info("Interpolating missing samples.");
        const activity = await interpolateActivity(gapFilledActivity, config);
        return activity;
      },
    );

    const processedActivity = await runLoggedStep(
      `10-${String(segmentIndex).padStart(2, "0")}-smooth.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        logger.info("Applying smoothing.");
        const activity = await smoothActivity(interpolatedActivity, config);
        logger.info("Processed activity is ready.");
        return activity;
      },
    );

    const frameData = await runLoggedStep(
      `11-${String(segmentIndex).padStart(2, "0")}-build-frame-data.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        logger.info("Building frame data.");
        const built = await buildFrameData(processedActivity, config, {
          elapsedOffsetMs: cumulativeElapsedOffsetMs,
          maxDurationMs: remainingRenderBudgetMs,
          elevationHistory: cumulativeElevationHistory,
        });
        logger.info(
          `Built ${built.frames.length} 1Hz frame snapshot(s). Total render duration: ${(built.durationInFrames / built.fps).toFixed(1)}s.`,
        );
        return built;
      },
    );

    const segmentOutputBaseName = getLocalTimestampedOutputBaseName(segment.startedAt);
    // Determine per-segment output directory using the segment's first second in local time.
    const segmentDirName = segmentOutputBaseName;
    const segmentOutputPath = activitySegments.length > 1
      ? path.join(outputPath, segmentDirName)
      : outputPath;

    await ensureDirectoryPath(segmentOutputPath);

    if (config.debug.dumpNormalizedActivity) {
      await ensureDirectoryPath(path.join(segmentOutputPath, "debug"));
      await writeJsonFile(
        path.join(segmentOutputPath, "debug", "activity.normalized.json"),
        processedActivity,
      );
    }

    if (config.debug.dumpFrameData) {
      await ensureDirectoryPath(path.join(segmentOutputPath, "debug"));
      await writeJsonFile(
        path.join(segmentOutputPath, "debug", "frame-data.json"),
        frameData,
      );
    }

    // Write frame data to serve directory for file-based loading.
    await runLoggedStep(
      `12-${String(segmentIndex).padStart(2, "0")}-write-frame-data.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        logger.info("Writing frame data to serve directory for file-based loading.");
        const filePath = path.join(serveUrl, FRAME_DATA_FILENAME);
        await writeJsonFile(filePath, frameData.frames);
        logger.info(
          `Wrote ${frameData.frames.length} frame(s) to ${FRAME_DATA_FILENAME}.`,
        );
      },
    );

    // Pass lightweight metadata through inputProps; frames are loaded from file.
    const { frames: _frames, ...frameDataMeta } = frameData;
    const inputProps: RenderInputProps = {
      frameDataMeta,
      overlayConfig: config,
    };

    const composition: CompositionSpec = {
      id: "OverlayComposition",
      width: frameData.width,
      height: frameData.height,
      fps: frameData.fps,
      durationInFrames: frameData.durationInFrames,
      defaultProps: inputProps as unknown as Record<string, unknown>,
      props: inputProps as unknown as Record<string, unknown>,
      defaultCodec: null,
      defaultOutName: null,
      defaultVideoImageFormat: null,
      defaultPixelFormat: null,
      defaultProResProfile: null,
    };

    await runLoggedStep(
      `13-${String(segmentIndex).padStart(2, "0")}-select-composition.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        logger.info("Constructing composition metadata from frame data (bypassing selectComposition).");
        logger.info(
          `Composition: ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s).`,
        );
      },
    );

    const gl = hasCityMapWidget(config) ? "angle" as const : undefined;
    const segmentFinalOutputPath = await runLoggedStep(
      `14-${String(segmentIndex).padStart(2, "0")}-render-overlay.log`,
      logsDirectoryPath,
      onProgress,
      async (logger) => {
        if (gl) {
          logger.info("City map widget detected — enabling GPU rendering (gl=angle).");
        }
        if (config.render.output.format === "png-sequence") {
          const framesDirectoryPath = path.join(segmentOutputPath, "frames");
          await ensureDirectoryPath(framesDirectoryPath);
          await renderPngSequence(
            serveUrl,
            composition,
            inputProps,
            framesDirectoryPath,
            logger,
            request.concurrency,
            frameData.snapshotIntervalMs,
            undefined,
            gl,
          );
          return framesDirectoryPath;
        }

        const movFilePath = path.join(
          segmentOutputPath,
          `${segmentOutputBaseName}.mov`,
        );
        const requestedSegments = request.segments ?? 1;
        if (requestedSegments > 1) {
          await renderMovSegmented(
            serveUrl, composition, inputProps, movFilePath, logger,
            request.concurrency, requestedSegments,
            config.render.output.proresProfile,
            frameData.snapshotIntervalMs,
            gl,
          );
        } else {
          await renderMov(
            serveUrl,
            composition,
            inputProps,
            movFilePath,
            logger,
            request.concurrency,
            config.render.output.proresProfile,
            frameData.snapshotIntervalMs,
            gl,
          );
        }
        return movFilePath;
      },
    );

    renderOutputs.push({
      path: segmentFinalOutputPath,
      startedAt: segment.startedAt,
      durationSeconds: Math.ceil(frameData.durationInFrames / frameData.fps),
    });

    // Write per-segment metadata.
    const metadata: RenderMetadata = {
      runId,
      createdAt: new Date().toISOString(),
      input: {
        activityFile: request.inputPath,
        configFile: request.configPath,
        format: processedActivity.source.format,
      },
      render: {
        width: frameData.width,
        height: frameData.height,
        fps: frameData.fps,
        durationInFrames: frameData.durationInFrames,
        snapshotIntervalMs: frameData.snapshotIntervalMs,
        outputFormat: config.render.output.format,
        sampleMaxDurationMs: request.maxDurationMs,
      },
      activity: {
        startedAt: processedActivity.startedAt,
        durationMs: processedActivity.summary.durationMs,
        distanceM: processedActivity.summary.distanceM,
        ascentM: processedActivity.summary.ascentM,
      },
      warnings: processedActivity.warnings,
    };

    await writeJsonFile(path.join(segmentOutputPath, "metadata.json"), metadata);

    remainingRenderBudgetMs = consumeRemainingRenderBudgetMs(
      remainingRenderBudgetMs,
      (frameData.durationInFrames / frameData.fps) * 1000,
    );
    cumulativeElevationHistory = frameData.elevationHistory;
    cumulativeElapsedOffsetMs += processedActivity.summary.durationMs ?? 0;
    if (segmentIndex < activitySegments.length - 1) {
      cumulativeElapsedOffsetMs += SNAPSHOT_INTERVAL_MS;
    }
  }

  await runLoggedStep(
    "15-postprocess.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("No additional post-processing was required.");
    },
  );

  const outputPaths = renderOutputs.map((o) => o.path);
  const message = renderOutputs.length === 1
    ? `Overlay render completed successfully: ${outputPaths[0]}`
    : `Overlay render completed: ${renderOutputs.length} segment(s) -> ${outputPaths.join(", ")}`;

  return {
    exitCode: 0,
    message,
    outputPath,
    outputs: renderOutputs,
  };
};
