#!/usr/bin/env node
/**
 * Generate a single-frame PNG screenshot for each widget type.
 *
 * Each widget is rendered through the normal renderOverlay pipeline,
 * which correctly handles map widgets with GPS data and chart history.
 *
 * Usage:  npx tsx scripts/generate-widget-screenshots.ts
 * Output: docs/images/widget-<type>.png
 */

import { mkdir, rm, readdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { OverlayConfigSchema } from "../src/config/schema.js";
import { loadActivity } from "../src/parsers/activity-loader.js";
import { renderOverlay } from "../src/render/render-overlay.js";

const INPUT_FILE = path.resolve("ref_input/activity_22268846124.tcx");
const OUTPUT_DIR = path.resolve("docs/images");
const TEMP_DIR = path.resolve("output/_widget-screenshots-temp");
const TARGET_ELAPSED_SEC = 17 * 60; // 17-minute mark
const VIRTUAL_CANVAS_WIDTH = 2880;

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
};

const WIDGET_CONFIGS: WidgetDef[] = [
  {
    type: "speed",
    label: "Speed",
    widgetConfig: {
      id: "speed-screenshot",
      type: "speed",
      x: 0,
      y: 0,
      scale: 0.12,
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
      colorByZone: true,
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
    type: "heart-rate",
    label: "Heart Rate",
    widgetConfig: {
      id: "hr-screenshot",
      type: "heart-rate",
      x: 0,
      y: 0,
      scale: 0.12,
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
      colorByZone: true,
      showChart: true,
      chartRange: "medium",
    },
  },
  {
    type: "elevation",
    label: "Elevation",
    widgetConfig: {
      id: "elev-screenshot",
      type: "elevation",
      x: 0,
      y: 0,
      scale: 0.12,
      showAscent: true,
    },
  },
  {
    type: "distance",
    label: "Distance",
    widgetConfig: {
      id: "dist-screenshot",
      type: "distance",
      x: 0,
      y: 0,
      scale: 0.12,
    },
  },
  {
    type: "time-elapsed",
    label: "Time (elapsed)",
    widgetConfig: {
      id: "time-elapsed-screenshot",
      type: "time",
      x: 0,
      y: 0,
      scale: 0.15,
      mode: "elapsed",
      timezone: "Asia/Singapore",
    },
  },
  {
    type: "time-both",
    label: "Time (both)",
    widgetConfig: {
      id: "time-both-screenshot",
      type: "time",
      x: 0,
      y: 0,
      scale: 0.18,
      mode: "both",
      timezone: "Asia/Singapore",
    },
  },
  {
    type: "noodlemap",
    label: "Noodle Map",
    widgetConfig: {
      id: "noodle-screenshot",
      type: "noodlemap",
      x: 0,
      y: 0,
      scale: 0.12,
      lineColor: "#ffffff",
      lineWeight: "M",
    },
  },
  {
    type: "citymap",
    label: "City Map",
    widgetConfig: {
      id: "citymap-screenshot",
      type: "citymap",
      x: 0,
      y: 0,
      scale: 0.12,
      mapStyle: "https://tiles.openfreemap.org/styles/liberty",
      lineColor: "#34d399",
      lineWeight: "M",
    },
  },
];

/** Find the frames directory inside the renderOverlay output. */
async function findFramesDir(outputPath: string): Promise<string | null> {
  // renderOverlay creates: <outputPath>/<timestamped-dir>/frames/*.png
  const entries = await readdir(outputPath);
  for (const entry of entries) {
    const framesPath = path.join(outputPath, entry, "frames");
    try {
      const stat = await readdir(framesPath);
      if (stat.length > 0) return framesPath;
    } catch {
      continue;
    }
  }
  return null;
}

async function writeTempConfig(
  widgetConfig: Record<string, unknown>,
  outputPath: string,
): Promise<void> {
  const config = OverlayConfigSchema.parse({
    render: {
      width: VIRTUAL_CANVAS_WIDTH,
      height: 1080,
      fps: 30,
      durationStrategy: "activity",
      output: { format: "png-sequence" },
    },
    sync: { trimStartMs: TARGET_ELAPSED_SEC * 1000 },
    preprocess: {},
    theme: THEME,
    widgets: [widgetConfig],
    debug: { dumpFrameData: false, dumpNormalizedActivity: false },
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(config, null, 2), "utf8");
}

async function main() {
  console.log("=== Widget Screenshot Generator ===\n");

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  let completed = 0;
  for (const widgetDef of WIDGET_CONFIGS) {
    completed++;
    console.log(`\n[${completed}/${WIDGET_CONFIGS.length}] Rendering ${widgetDef.label}...`);

    const configPath = path.join(TEMP_DIR, `${widgetDef.type}-config.json`);
    const tempOutputPath = path.join(TEMP_DIR, widgetDef.type);

    await writeTempConfig(widgetDef.widgetConfig, configPath);

    await renderOverlay({
      inputPath: INPUT_FILE,
      configPath,
      outputPath: tempOutputPath,
      maxDurationMs: 30_000,
      onProgress: (msg) => {
        if (msg.includes("Render progress:") || msg.includes("Saved:")) {
          console.log(`  ${msg}`);
        }
      },
    });

    // Find rendered frames
    const framesDir = await findFramesDir(tempOutputPath);
    if (!framesDir) {
      console.error(`  ERROR: No frames directory found`);
      continue;
    }
    const files = await readdir(framesDir);
    const pngFiles = files.filter((f) => f.endsWith(".png")).sort();

    if (pngFiles.length === 0) {
      console.error(`  ERROR: No PNG files found`);
      continue;
    }

    // Pick frame closest to target elapsed time (fps=30, snapshotIntervalMs=1000)
    const targetMs = TARGET_ELAPSED_SEC * 1000;
    let bestFile = pngFiles[0]!;
    let bestDiff = Infinity;
    for (const f of pngFiles) {
      const frameNum = parseInt(f.match(/element-(\d+)\.png$/)?.[1] ?? "0", 10);
      const frameMs = (frameNum / 30) * 1000;
      const diff = Math.abs(frameMs - targetMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestFile = f;
      }
    }

    // Trim transparent borders, then add a little padding
    const srcPng = path.join(framesDir, bestFile);
    const outputPath = path.join(OUTPUT_DIR, `widget-${widgetDef.type}.png`);
    const { width: origW, height: origH } = await sharp(srcPng).metadata();
    const trimmed = await sharp(srcPng).trim().toBuffer();
    const { width: tw, height: th } = await sharp(trimmed).metadata();
    const pad = 16;
    await sharp(trimmed)
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(outputPath);
    console.log(`  Saved: ${outputPath} (${origW}x${origH} → ${tw}x${th} + ${pad}px padding)`);
  }

  // Cleanup
  console.log("\nCleaning up temp files...");
  await rm(TEMP_DIR, { recursive: true, force: true });

  console.log("\n=== Done! All widget screenshots saved to docs/images/ ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
