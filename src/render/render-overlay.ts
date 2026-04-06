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
import { deriveMetrics } from "../preprocess/derive-metrics.js";
import { interpolateActivity } from "../preprocess/interpolate.js";
import { normalizeActivity } from "../preprocess/normalize.js";
import { smoothActivity } from "../preprocess/smooth.js";
import { PRORES_ALPHA_PIXEL_FORMAT } from "./codecs.js";
import {
  copyFileToDirectory,
  createTimestampedOutputDirectory,
  ensureDirectoryPath,
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
          );
          await runEncode(() =>
            encodePngSequenceToMov(
              segmentPngDirectoryPath,
              segmentPaths[index]!,
              snapshotIntervalMs,
              composition.fps,
              renderableFrameCount,
              proresProfile,
              logger,
            )
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
  frameCount: number,
  proresProfile: OverlayConfig["render"]["output"]["proresProfile"],
  logger: StepLogger,
): Promise<void> => {
  const ffmpegExecutablePath = await resolveFfmpegExecutablePath();
  const padLength = Math.max(1, String(Math.max(0, frameCount - 1)).length);
  const inputPattern = path.join(
    pngDirectoryPath,
    `element-%0${padLength}d.png`,
  );
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
      "-start_number",
      "0",
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
    const frameStep = getSnapshotRenderStep(composition, snapshotIntervalMs);
    const renderableFrameCount = getRenderableFrameCount(
      [0, composition.durationInFrames - 1],
      frameStep,
    );
    await renderPngSequence(
      serveUrl,
      composition,
      inputProps,
      tempFramesDirectoryPath,
      logger,
      concurrency,
      snapshotIntervalMs,
    );
    await encodePngSequenceToMov(
      tempFramesDirectoryPath,
      targetFilePath,
      snapshotIntervalMs,
      composition.fps,
      renderableFrameCount,
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

  const derivedActivity = await runLoggedStep(
    "04-derive-metrics.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Deriving metrics.");
      const activity = await deriveMetrics(normalizedActivity);
      logger.info("Metric derivation finished.");
      return activity;
    },
  );

  const processedActivity = await runLoggedStep(
    "05-interpolate-and-smooth.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Interpolating missing samples.");
      const interpolated = await interpolateActivity(derivedActivity, config);
      logger.info("Applying smoothing.");
      const smoothed = await smoothActivity(interpolated, config);
      logger.info("Processed activity is ready.");
      return smoothed;
    },
  );

  const frameData = await runLoggedStep(
    "06-build-frame-data.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Building frame data.");
      const built = await buildFrameData(processedActivity, config, {
        maxDurationMs: request.maxDurationMs,
      });
      logger.info(
        `Built ${built.frames.length} 1Hz frame snapshot(s). Total render duration: ${(built.durationInFrames / built.fps).toFixed(1)}s.`,
      );
      return built;
    },
  );

  await copyFileToDirectory(request.inputPath, sourceDirectoryPath);
  await copyFileToDirectory(request.configPath, sourceDirectoryPath);

  if (config.debug.dumpNormalizedActivity) {
    await writeJsonFile(
      path.join(debugDirectoryPath, "activity.normalized.json"),
      processedActivity,
    );
  }

  if (config.debug.dumpFrameData) {
    await writeJsonFile(path.join(debugDirectoryPath, "frame-data.json"), frameData);
  }

  await runLoggedStep(
    "07-build-project.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      await buildProjectForRender(logger);
    },
  );

  const serveUrl = await runLoggedStep(
    "08-bundle-remotion.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Bundling Remotion project.");
      const bundledServeUrl = await bundleRemotionProject(logger);
      logger.info(`Bundle output ready at ${bundledServeUrl}`);
      return bundledServeUrl;
    },
  );

  // Write frame data to serve directory for file-based loading.
  // Passing 500K+ frames through Chrome script injection causes OOM crashes
  // because each parallel renderMedia call serializes inputProps via JSON.stringify.
  await runLoggedStep(
    "08b-write-frame-data.log",
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
    "09-select-composition.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Constructing composition metadata from frame data (bypassing selectComposition).");
      logger.info(
        `Composition: ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s).`,
      );
    },
  );

  const finalOutputPath = await runLoggedStep(
    "10-render-overlay.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      if (config.render.output.format === "png-sequence") {
        const framesDirectoryPath = path.join(outputPath, "frames");
        await ensureDirectoryPath(framesDirectoryPath);
        await renderPngSequence(
          serveUrl,
          composition,
          inputProps,
          framesDirectoryPath,
          logger,
          request.concurrency,
          frameData.snapshotIntervalMs,
        );
        return framesDirectoryPath;
      }

      const movFilePath = path.join(outputPath, "overlay.mov");
      const requestedSegments = request.segments ?? 1;
      if (requestedSegments > 1) {
        await renderMovSegmented(
          serveUrl, composition, inputProps, movFilePath, logger,
          request.concurrency, requestedSegments,
          config.render.output.proresProfile,
          frameData.snapshotIntervalMs,
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
        );
      }
      return movFilePath;
    },
  );

  await runLoggedStep(
    "11-postprocess.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("No additional post-processing was required.");
    },
  );

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

  await writeJsonFile(path.join(outputPath, "metadata.json"), metadata);

  return {
    exitCode: 0,
    message: `Overlay render completed successfully: ${finalOutputPath}`,
    outputPath,
  };
};
