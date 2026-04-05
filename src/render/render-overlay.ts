import path from "node:path";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { promisify } from "node:util";

import { bundle } from "@remotion/bundler";
import {
  renderFrames,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";

import { loadOverlayConfig } from "../config/load-config.js";
import type { OverlayConfig } from "../config/schema.js";
import type { FrameData } from "../domain/frame-data.js";
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

  const push = (level: "INFO" | "WARN" | "ERROR", message: string) => {
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

const selectOverlayComposition = async (
  serveUrl: string,
  inputProps: {
    frameData: FrameData;
    overlayConfig: OverlayConfig;
  },
): Promise<Awaited<ReturnType<typeof selectComposition>>> => {
  return selectComposition({
    serveUrl,
    id: "OverlayComposition",
    inputProps,
    logLevel: "error",
  });
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

const renderMov = async (
  serveUrl: string,
  composition: Awaited<ReturnType<typeof selectComposition>>,
  inputProps: {
    frameData: FrameData;
    overlayConfig: OverlayConfig;
  },
  targetFilePath: string,
  logger: StepLogger,
  concurrency?: number | undefined,
): Promise<void> => {
  let lastLoggedProgressBucket = -1;
  const totalSeconds = composition.durationInFrames / composition.fps;
  const renderStartTime = Date.now();

  logger.info(
    `Rendering MOV output. Total duration: ${totalSeconds.toFixed(1)}s (${composition.durationInFrames} frames at ${composition.fps}fps).`,
  );

  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "prores",
    proResProfile: "4444",
    imageFormat: "png",
    pixelFormat: PRORES_ALPHA_PIXEL_FORMAT,
    outputLocation: targetFilePath,
    overwrite: true,
    muted: true,
    logLevel: "error",
    concurrency: concurrency ?? null,
    onProgress: (progress) => {
      const bucket = Math.floor(progress.progress * 20);

      if (bucket !== lastLoggedProgressBucket) {
        lastLoggedProgressBucket = bucket;
        const renderedSeconds = progress.renderedFrames / composition.fps;
        const elapsedMs = Date.now() - renderStartTime;
        const eta = progress.progress > 0
          ? formatEta((elapsedMs / progress.progress - elapsedMs) / 1000)
          : "--";
        logger.info(
          `Render progress: ${Math.round(progress.progress * 100)}% | frame ${progress.renderedFrames}/${composition.durationInFrames} | video ${renderedSeconds.toFixed(1)}s/${totalSeconds.toFixed(1)}s | ETA ${eta} | stage ${progress.stitchStage}`,
        );
      }
    },
  });
};

const renderPngSequence = async (
  serveUrl: string,
  composition: Awaited<ReturnType<typeof selectComposition>>,
  inputProps: {
    frameData: FrameData;
    overlayConfig: OverlayConfig;
  },
  outputDirectoryPath: string,
  logger: StepLogger,
  concurrency?: number | undefined,
): Promise<void> => {
  let renderedFrames = 0;
  const renderStartTime = Date.now();

  await renderFrames({
    serveUrl,
    composition,
    inputProps,
    outputDir: outputDirectoryPath,
    imageFormat: "png",
    logLevel: "error",
    concurrency: concurrency ?? null,
    onStart: ({ frameCount }) => {
      const totalSeconds = composition.durationInFrames / composition.fps;
      logger.info(
        `Rendering ${frameCount} frame(s) as PNG sequence. Total duration: ${totalSeconds.toFixed(1)}s.`,
      );
    },
    onFrameUpdate: (framesRendered) => {
      if (framesRendered !== renderedFrames && framesRendered % 30 === 0) {
        renderedFrames = framesRendered;
        const progress = framesRendered / composition.durationInFrames;
        const elapsedMs = Date.now() - renderStartTime;
        const eta = progress > 0
          ? formatEta((elapsedMs / progress - elapsedMs) / 1000)
          : "--";
        logger.info(
          `Render progress: frame ${framesRendered}/${composition.durationInFrames} | video ${(framesRendered / composition.fps).toFixed(1)}s/${(composition.durationInFrames / composition.fps).toFixed(1)}s | ETA ${eta}`,
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
        `Built ${built.frames.length} frame snapshot(s). Total render duration: ${(built.durationInFrames / built.fps).toFixed(1)}s.`,
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

  const inputProps = {
    frameData,
    overlayConfig: config,
  };

  const composition = await runLoggedStep(
    "09-select-composition.log",
    logsDirectoryPath,
    onProgress,
    async (logger) => {
      logger.info("Selecting Remotion composition.");
      const selectedComposition = await selectOverlayComposition(serveUrl, inputProps);
      logger.info(
        `Composition selected successfully. Duration: ${(selectedComposition.durationInFrames / selectedComposition.fps).toFixed(1)}s (${selectedComposition.durationInFrames} frames).`,
      );
      return selectedComposition;
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
        );
        return framesDirectoryPath;
      }

      const movFilePath = path.join(outputPath, "overlay.mov");
      await renderMov(serveUrl, composition, inputProps, movFilePath, logger, request.concurrency);
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
