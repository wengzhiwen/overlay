#!/usr/bin/env node
/**
 * Generate PNG screenshots for each widget type in with-bgc and without-bgc modes.
 *
 * Efficient implementation: builds and bundles Remotion once, processes the activity
 * once, then renders a single target frame per widget configuration.
 *
 * The target frame is chosen from the middle section of the activity so that charts
 * have ample history data and maps show a meaningful portion of the route.
 *
 * Usage:  npx tsx scripts/generate-widget-screenshots.ts
 * Output: docs/images/widget-<type>.png
 */

import { mkdir, rm, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

import { bundle } from "@remotion/bundler";
import { renderFrames } from "@remotion/renderer";

import { OverlayConfigSchema } from "../src/config/schema.js";
import { loadActivity } from "../src/parsers/activity-loader.js";
import { buildFrameData } from "../src/preprocess/build-frame-data.js";
import { normalizeActivity } from "../src/preprocess/normalize.js";
import { deriveMetrics } from "../src/preprocess/derive-metrics.js";
import { fillShortGaps } from "../src/preprocess/fill-gaps.js";
import { interpolateActivity } from "../src/preprocess/interpolate.js";
import { smoothActivity } from "../src/preprocess/smooth.js";
import { detectGaps } from "../src/preprocess/detect-gaps.js";
import { splitActivityAtLongGaps } from "../src/preprocess/split-activity.js";
import { SNAPSHOT_INTERVAL_MS } from "../src/domain/frame-data.js";

const execFileAsync = promisify(execFile);

const INPUT_FILE = path.resolve("ref_input/all.tcx");
const OUTPUT_DIR = path.resolve("docs/images");
const TEMP_DIR = path.resolve("output/_widget-screenshots-temp");
const VIRTUAL_CANVAS_WIDTH = 2880;
const FPS = 30;
// Target 5 hours into the activity (middle of an ~11hr ride) for rich chart history.
const TARGET_ELAPSED_SEC = 5 * 3600;

const THEME = {
  fontFamily: "SF Pro Display, Helvetica, Arial, sans-serif",
  colors: {
    primary: "#ffffff",
    secondary: "#cbd5e1",
    accent: "#34d399",
    text: "#ffffff",
    muted: "#94a3b8",
  },
};

type WidgetDef = {
  type: string;
  label: string;
  widgetConfig: Record<string, unknown>;
  needsGpu?: boolean;
};

const WIDGET_CONFIGS: WidgetDef[] = [
  // Speed
  {
    type: "speed",
    label: "Speed (with-bgc)",
    widgetConfig: {
      id: "speed-screenshot",
      type: "speed",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "speed-without-bgc",
    label: "Speed (without-bgc)",
    widgetConfig: {
      id: "speed-nobgc-screenshot",
      type: "speed",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "speed-zone",
    label: "Speed (colorByZone)",
    widgetConfig: {
      id: "speed-zone-screenshot",
      type: "speed",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      colorByZone: true,
      showChart: true,
      chartRange: "medium",
    },
  },
  // Heart Rate
  {
    type: "heart-rate",
    label: "Heart Rate (with-bgc)",
    widgetConfig: {
      id: "hr-screenshot",
      type: "heart-rate",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "heart-rate-without-bgc",
    label: "Heart Rate (without-bgc)",
    widgetConfig: {
      id: "hr-nobgc-screenshot",
      type: "heart-rate",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "heart-rate-zone",
    label: "Heart Rate (colorByZone)",
    widgetConfig: {
      id: "hr-zone-screenshot",
      type: "heart-rate",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      colorByZone: true,
      showChart: true,
      chartRange: "medium",
    },
  },
  // Power
  {
    type: "power",
    label: "Power (with-bgc)",
    widgetConfig: {
      id: "power-screenshot",
      type: "power",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "power-without-bgc",
    label: "Power (without-bgc)",
    widgetConfig: {
      id: "power-nobgc-screenshot",
      type: "power",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "power-zone",
    label: "Power (colorByZone)",
    widgetConfig: {
      id: "power-zone-screenshot",
      type: "power",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      colorByZone: true,
      showChart: true,
      chartRange: "medium",
    },
  },
  // Cadence
  {
    type: "cadence",
    label: "Cadence (with-bgc)",
    widgetConfig: {
      id: "cadence-screenshot",
      type: "cadence",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "cadence-without-bgc",
    label: "Cadence (without-bgc)",
    widgetConfig: {
      id: "cadence-nobgc-screenshot",
      type: "cadence",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "cadence-zone",
    label: "Cadence (colorByZone)",
    widgetConfig: {
      id: "cadence-zone-screenshot",
      type: "cadence",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      colorByZone: true,
      showChart: true,
      chartRange: "medium",
    },
  },
  // Elevation
  {
    type: "elevation",
    label: "Elevation (with-bgc)",
    widgetConfig: {
      id: "elev-screenshot",
      type: "elevation",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      showAscent: true,
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "elevation-without-bgc",
    label: "Elevation (without-bgc)",
    widgetConfig: {
      id: "elev-nobgc-screenshot",
      type: "elevation",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
      showAscent: true,
      showChart: true,
      chartRange: "medium",
    },
  },
  // Distance
  {
    type: "distance",
    label: "Distance (with-bgc)",
    widgetConfig: {
      id: "dist-screenshot",
      type: "distance",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
    },
  },
  {
    type: "distance-without-bgc",
    label: "Distance (without-bgc)",
    widgetConfig: {
      id: "dist-nobgc-screenshot",
      type: "distance",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
    },
  },
  // Time
  {
    type: "time-elapsed",
    label: "Time (elapsed, with-bgc)",
    widgetConfig: {
      id: "time-elapsed-screenshot",
      type: "time",
      x: 0,
      y: 0,
      scale: 0.15,
      style: "with-bgc",
      mode: "elapsed",
      timezone: "Asia/Singapore",
    },
  },
  {
    type: "time-elapsed-without-bgc",
    label: "Time (elapsed, without-bgc)",
    widgetConfig: {
      id: "time-elapsed-nobgc-screenshot",
      type: "time",
      x: 0,
      y: 0,
      scale: 0.15,
      style: "without-bgc",
      mode: "elapsed",
      timezone: "Asia/Singapore",
    },
  },
  {
    type: "time-both",
    label: "Time (both, with-bgc)",
    widgetConfig: {
      id: "time-both-screenshot",
      type: "time",
      x: 0,
      y: 0,
      scale: 0.18,
      style: "with-bgc",
      mode: "both",
      timezone: "Asia/Singapore",
    },
  },
  {
    type: "time-both-without-bgc",
    label: "Time (both, without-bgc)",
    widgetConfig: {
      id: "time-both-nobgc-screenshot",
      type: "time",
      x: 0,
      y: 0,
      scale: 0.18,
      style: "without-bgc",
      mode: "both",
      timezone: "Asia/Singapore",
    },
  },
  // Noodle Map
  {
    type: "noodlemap",
    label: "Noodle Map (with-bgc)",
    widgetConfig: {
      id: "noodle-screenshot",
      type: "noodlemap",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      lineColor: "#ffffff",
      lineWeight: "M",
    },
  },
  {
    type: "noodlemap-without-bgc",
    label: "Noodle Map (without-bgc)",
    widgetConfig: {
      id: "noodle-nobgc-screenshot",
      type: "noodlemap",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
      lineColor: "#ffffff",
      lineWeight: "M",
    },
  },
  // City Map
  {
    type: "citymap",
    label: "City Map (with-bgc)",
    widgetConfig: {
      id: "citymap-screenshot",
      type: "citymap",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "with-bgc",
      mapStyle: "https://tiles.openfreemap.org/styles/liberty",
      lineColor: "#34d399",
      lineWeight: "M",
    },
    needsGpu: true,
  },
  {
    type: "citymap-without-bgc",
    label: "City Map (without-bgc)",
    widgetConfig: {
      id: "citymap-nobgc-screenshot",
      type: "citymap",
      x: 0,
      y: 0,
      scale: 0.12,
      style: "without-bgc",
      mapStyle: "https://tiles.openfreemap.org/styles/liberty",
      lineColor: "#34d399",
      lineWeight: "M",
    },
    needsGpu: true,
  },
];

/** Create a valid OverlayConfig for a single widget. */
function createConfig(widgetConfig: Record<string, unknown>) {
  return OverlayConfigSchema.parse({
    render: {
      width: VIRTUAL_CANVAS_WIDTH,
      height: 1080,
      fps: FPS,
      durationStrategy: "activity",
      output: { format: "png-sequence" },
    },
    sync: { trimStartMs: 0, activityOffsetMs: 0, trimEndMs: 0 },
    preprocess: {},
    theme: THEME,
    widgets: [widgetConfig],
    debug: { dumpFrameData: false, dumpNormalizedActivity: false },
  });
}

async function main() {
  console.log("=== Widget Screenshot Generator ===\n");

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  // --- Step 1: Build project ---
  console.log("[1/5] Building project...");
  const { stdout: buildStdout, stderr: buildStderr } = await execFileAsync(
    "npm",
    ["run", "build"],
    { cwd: process.cwd(), maxBuffer: 1024 * 1024 * 20 },
  );
  if (buildStdout.trim()) console.log(buildStdout.trim());
  if (buildStderr.trim()) console.error(buildStderr.trim());

  // --- Step 2: Bundle Remotion ---
  console.log("\n[2/5] Bundling Remotion...");
  const serveUrl = await bundle({
    entryPoint: path.resolve(process.cwd(), "dist/remotion/index.js"),
    onProgress: (progress) => {
      const pct = Math.round((progress > 1 ? progress : progress * 100));
      if (pct % 25 === 0) console.log(`  Bundle: ${pct}%`);
    },
  });
  console.log(`  Bundle ready: ${serveUrl}`);

  // --- Step 3: Load and process activity ---
  console.log("\n[3/5] Loading and processing activity...");
  const rawActivity = await loadActivity(INPUT_FILE);
  console.log(`  Loaded ${rawActivity.samples.length} samples.`);

  const normalized = await normalizeActivity(rawActivity);
  console.log(`  Normalized to ${normalized.samples.length} samples.`);

  const gaps = detectGaps(normalized);
  console.log(`  Detected ${gaps.shortGaps.length} short gap(s), ${gaps.longGaps.length} long gap(s).`);

  const segments = splitActivityAtLongGaps(normalized, gaps.longGaps, gaps.shortGaps);
  console.log(`  Activity split into ${segments.length} segment(s).`);

  // Process the first (main) segment.
  const segment = segments[0]!;
  const segmentDurationMs = segment.summary.durationMs ?? 0;
  console.log(`  First segment: ${(segmentDurationMs / 1000 / 60).toFixed(0)} minutes.`);

  // Adjust target if the segment is shorter than desired.
  const targetElapsedSec = Math.min(
    TARGET_ELAPSED_SEC,
    Math.floor(segmentDurationMs / 1000) - 10,
  );
  if (targetElapsedSec < 60) {
    console.error(
      `Activity segment too short (${(segmentDurationMs / 1000).toFixed(0)}s). Need at least 60 seconds.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  Target time: ${Math.floor(targetElapsedSec / 60)}m ${targetElapsedSec % 60}s.`);

  // Create a base config for preprocessing steps.
  const baseConfig = createConfig({ type: "speed", id: "base" });
  const derived = await deriveMetrics(segment);
  const filled = fillShortGaps(derived, derived.gaps);
  const interpolated = await interpolateActivity(filled, baseConfig);
  const processed = await smoothActivity(interpolated, baseConfig);

  // --- Step 4: Build frame data ---
  console.log("\n[4/5] Building frame data...");
  const frameData = await buildFrameData(processed, baseConfig, {
    maxDurationMs: (targetElapsedSec + 5) * 1000,
  });
  console.log(
    `  Built ${frameData.frames.length} snapshots. Total render: ${(frameData.durationInFrames / frameData.fps).toFixed(0)}s.`,
  );

  // Write frame-data.json into the serve URL so the Remotion composition can fetch it.
  const frameDataPath = path.join(serveUrl, "frame-data.json");
  await writeFile(frameDataPath, JSON.stringify(frameData.frames), "utf8");
  console.log(`  Wrote frame data to ${frameDataPath}`);

  // Extract metadata (everything except the frames array) for inputProps.
  const { frames: _frames, ...frameDataMeta } = frameData;

  // The Remotion frame number for the target elapsed time.
  const targetFrame = targetElapsedSec * FPS;

  // --- Step 5: Render one frame per widget ---
  console.log(`\n[5/5] Rendering ${WIDGET_CONFIGS.length} widget screenshots...`);

  let completed = 0;
  for (const widgetDef of WIDGET_CONFIGS) {
    completed++;
    console.log(`\n  [${completed}/${WIDGET_CONFIGS.length}] ${widgetDef.label}`);

    const overlayConfig = createConfig(widgetDef.widgetConfig);
    const inputProps = { frameDataMeta, overlayConfig };

    const composition = {
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

    const widgetOutputDir = path.join(TEMP_DIR, widgetDef.type);
    await mkdir(widgetOutputDir, { recursive: true });

    const renderStart = Date.now();
    await renderFrames({
      serveUrl,
      composition,
      inputProps: inputProps as unknown as Record<string, unknown>,
      outputDir: widgetOutputDir,
      imageFormat: "png",
      logLevel: "error",
      concurrency: null,
      frameRange: [targetFrame, targetFrame],
      ...(widgetDef.needsGpu ? { chromiumOptions: { gl: "angle" as const } } : {}),
    });
    console.log(`    Rendered in ${Date.now() - renderStart}ms`);

    // Find the rendered PNG.
    const files = await readdir(widgetOutputDir);
    const pngFile = files.find((f) => f.endsWith(".png"));
    if (!pngFile) {
      console.error(`    ERROR: No PNG file found`);
      continue;
    }

    // Trim transparent borders and add padding.
    const srcPng = path.join(widgetOutputDir, pngFile);
    const outputPath = path.join(OUTPUT_DIR, `widget-${widgetDef.type}.png`);
    const { width: origW, height: origH } = await sharp(srcPng).metadata();
    const trimmed = await sharp(srcPng).trim().toBuffer();
    const { width: tw, height: th } = await sharp(trimmed).metadata();
    const pad = 16;
    await sharp(trimmed)
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(outputPath);
    console.log(
      `    Saved: widget-${widgetDef.type}.png (${origW}x${origH} -> ${tw}x${th} + ${pad}px pad)`,
    );
  }

  // Cleanup temp directory.
  console.log("\nCleaning up temp files...");
  await rm(TEMP_DIR, { recursive: true, force: true });

  console.log(`\n=== Done! ${WIDGET_CONFIGS.length} screenshots saved to docs/images/ ===`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
