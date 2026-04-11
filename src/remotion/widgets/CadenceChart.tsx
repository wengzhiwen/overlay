import type { CSSProperties, ReactNode } from "react";

import { getSnapshotForElapsedMs, type FrameData } from "../../domain/frame-data.js";

type ZoneInput = {
  min?: number | undefined;
  max?: number | undefined;
  color?: string | undefined;
};

const CHART_RANGE_MS: Record<"short" | "medium" | "long", number> = {
  short: 60_000,
  medium: 300_000,
  long: 1_200_000,
};

const DEFAULT_ZONES = [
  { max: 70, color: "#60a5fa" },
  { min: 70, max: 80, color: "#34d399" },
  { min: 80, max: 90, color: "#fbbf24" },
  { min: 90, max: 100, color: "#fb923c" },
  { min: 100, color: "#f87171" },
];

const Y_AXIS_DEFAULT_MIN = 60;
const Y_AXIS_DEFAULT_MAX = 120;
const Y_AXIS_PADDING_RATIO = 0.05;

// Thick bar width scales with chart dimensions (chartWidth/80 ≈ 3px at 240px width)
const THICK_BARS_FILL_COUNT = 80;

type ResolvedZone = {
  min: number;
  max: number;
  color: string;
};

const resolveZones = (
  sourceZones: ZoneInput[],
  configZones: ZoneInput[],
): ResolvedZone[] => {
  if (configZones.length > 0) {
    return configZones.map((z) => ({
      min: z.min ?? Number.NEGATIVE_INFINITY,
      max: z.max ?? Number.POSITIVE_INFINITY,
      color: z.color ?? "#94a3b8",
    }));
  }

  if (sourceZones.length > 0) {
    return sourceZones
      .filter((z) => z.color !== undefined)
      .map((z) => ({
        min: z.min ?? Number.NEGATIVE_INFINITY,
        max: z.max ?? Number.POSITIVE_INFINITY,
        color: z.color!,
      }));
  }

  return DEFAULT_ZONES.map((z) => ({
    min: z.min ?? Number.NEGATIVE_INFINITY,
    max: z.max ?? Number.POSITIVE_INFINITY,
    color: z.color,
  }));
};

const getZoneColor = (cadenceRpm: number, zones: ResolvedZone[]): string => {
  const zone = zones.find((z) => cadenceRpm >= z.min && cadenceRpm < z.max);
  return zone?.color ?? "#94a3b8";
};

const sampleCadence = (
  frameData: FrameData,
  elapsedMs: number,
): number | undefined => {
  return getSnapshotForElapsedMs(frameData, elapsedMs)?.metrics.cadenceRpm;
};

type CadenceChartProps = {
  frameData: FrameData;
  currentElapsedMs: number;
  chartRange: "short" | "medium" | "long";
  chartWidthPx: number;
  chartHeightPx: number;
  sourceZones: ZoneInput[];
  configZones: ZoneInput[];
};

export const CadenceChart = ({
  frameData,
  currentElapsedMs,
  chartRange,
  chartWidthPx,
  chartHeightPx,
  sourceZones,
  configZones,
}: CadenceChartProps): ReactNode => {
  const zones = resolveZones(sourceZones, configZones);
  const rangeMs = CHART_RANGE_MS[chartRange];
  const rangeSeconds = rangeMs / 1000;
  const elapsedSeconds = Math.max(0, Math.floor(currentElapsedMs / 1000));

  if (elapsedSeconds <= 0) {
    return <div style={{ height: chartHeightPx }} />;
  }

  // Determine bar count and time window
  let barCount: number;
  let windowStartSecond: number;

  if (elapsedSeconds <= rangeSeconds) {
    barCount = elapsedSeconds;
    windowStartSecond = 0;
  } else {
    barCount = rangeSeconds;
    windowStartSecond = elapsedSeconds - rangeSeconds;
  }

  // Thick bar width scales proportionally with chart width
  const thickBarWidth = Math.max(2, Math.round(chartWidthPx / THICK_BARS_FILL_COUNT));

  // Calculate bar widths: thick until full, then compress old bars
  const maxThickBars = Math.floor(chartWidthPx / thickBarWidth);
  const barWidths: number[] = [];

  if (barCount <= maxThickBars) {
    // Phase 1: all bars are thick
    for (let i = 0; i < barCount; i++) {
      barWidths.push(thickBarWidth);
    }
  } else {
    // Phase 2/3: compress old bars, newest stays thick
    const remainingWidth = chartWidthPx - thickBarWidth;
    const thinWidth = remainingWidth / (barCount - 1);
    for (let i = 0; i < barCount - 1; i++) {
      barWidths.push(thinWidth);
    }
    barWidths.push(thickBarWidth);
  }

  // Sample cadence for each bar and compute Y-axis range
  const barValues: (number | undefined)[] = [];
  let yMin = Y_AXIS_DEFAULT_MIN;
  let yMax = Y_AXIS_DEFAULT_MAX;

  for (let i = 0; i < barCount; i++) {
    const second = windowStartSecond + i;
    const cad = sampleCadence(frameData, second * 1000 + 500);
    barValues.push(cad);

    if (cad !== undefined) {
      if (cad < yMin) yMin = cad;
      if (cad > yMax) yMax = cad;
    }
  }

  // Add padding
  const yRange = yMax - yMin;
  const padding = yRange * Y_AXIS_PADDING_RATIO;
  yMin = Math.floor(yMin - padding);
  yMax = Math.ceil(yMax + padding);
  const ySpan = yMax - yMin;

  const containerStyle: CSSProperties = {
    display: "flex",
    alignItems: "flex-end",
    height: chartHeightPx,
    overflow: "hidden",
  };

  return (
    <div style={containerStyle}>
      {barValues.map((cad, i) => {
        if (cad === undefined) {
          return (
            <div
              key={i}
              style={{
                width: barWidths[i],
                height: chartHeightPx,
                flexShrink: 0,
              }}
            />
          );
        }

        const clampedCad = Math.max(yMin, Math.min(yMax, cad));
        const heightRatio = ySpan > 0 ? (clampedCad - yMin) / ySpan : 0;
        const barHeightPx = Math.max(2, heightRatio * chartHeightPx);
        const isThick = (barWidths[i] ?? 0) >= thickBarWidth;

        return (
          <div
            key={i}
            style={{
              width: barWidths[i],
              height: barHeightPx,
              flexShrink: 0,
              backgroundColor: getZoneColor(cad, zones),
              borderRadius: isThick ? "1px 1px 0 0" : 0,
            }}
          />
        );
      })}
    </div>
  );
};
