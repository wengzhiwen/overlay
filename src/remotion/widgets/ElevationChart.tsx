import type { CSSProperties, ReactNode } from "react";

import type { ElevationHistoryPoint } from "../../domain/frame-data.js";
import { getGradeZoneColor, resolveGradeZones } from "./elevationShared.js";
import { metersToFeet } from "../../utils/units.js";

// Elevation-specific chart ranges — capped at 1 hour to show full elevation profile.
const CHART_RANGE_MS: Record<"short" | "medium" | "long", number> = {
  short: 300_000,     // 5 min
  medium: 1_800_000,  // 30 min
  long: 3_600_000,    // 1 hour
};

const GRADE_ROLLING_WINDOW_SECONDS = 30;

const Y_AXIS_DEFAULT_MIN = 0;
const Y_AXIS_DEFAULT_MAX = 200;
const Y_AXIS_PADDING_RATIO = 0.05;

// Thick bar width scales with chart dimensions (chartWidth/80 ≈ 3px at 240px width)
const THICK_BARS_FILL_COUNT = 80;

type AltitudeUnit = "m" | "ft";

const convertAltitude = (value: number, unit: AltitudeUnit): number => {
  return unit === "ft" ? metersToFeet(value) : value;
};

const findHistoryIndex = (
  history: ElevationHistoryPoint[],
  targetDisplayMs: number,
): number => {
  // Binary search for the closest point at or before targetDisplayMs.
  let lo = 0;
  let hi = history.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (history[mid]!.displayElapsedMs <= targetDisplayMs) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // hi is the last index where displayElapsedMs <= targetDisplayMs.
  return hi;
};

const sampleAltitude = (
  point: ElevationHistoryPoint | undefined,
  unit: AltitudeUnit,
): number | undefined => {
  if (!point || point.altitudeM === undefined) return undefined;
  return convertAltitude(point.altitudeM, unit);
};

const sampleGrade = (
  history: ElevationHistoryPoint[],
  currentIndex: number,
): number | undefined => {
  // Look back GRADE_ROLLING_WINDOW_SECONDS data points (1 point per second).
  const lookback = GRADE_ROLLING_WINDOW_SECONDS;
  const pastIndex = currentIndex - lookback;
  if (pastIndex < 0) return undefined;

  const now = history[currentIndex];
  const past = history[pastIndex];
  if (!now || !past) return undefined;

  if (now.altitudeM === undefined || past.altitudeM === undefined) return undefined;
  if (now.distanceM === undefined || past.distanceM === undefined) return undefined;

  const distDelta = now.distanceM - past.distanceM;
  if (distDelta <= 0) return 0;

  return ((now.altitudeM - past.altitudeM) / distDelta) * 100;
};

type ElevationChartProps = {
  elevationHistory: ElevationHistoryPoint[];
  currentDisplayElapsedMs: number;
  chartRange: "short" | "medium" | "long";
  chartWidthPx: number;
  chartHeightPx: number;
  altitudeUnit: AltitudeUnit;
  gradeThresholds: number[] | undefined;
};

export const ElevationChart = ({
  elevationHistory,
  currentDisplayElapsedMs,
  chartRange,
  chartWidthPx,
  chartHeightPx,
  altitudeUnit,
  gradeThresholds,
}: ElevationChartProps): ReactNode => {
  const zones = resolveGradeZones(gradeThresholds);
  const rangeMs = CHART_RANGE_MS[chartRange];

  if (elevationHistory.length === 0 || currentDisplayElapsedMs <= 0) {
    return <div style={{ height: chartHeightPx }} />;
  }

  // Find the index in history closest to current time.
  const currentIdx = findHistoryIndex(elevationHistory, currentDisplayElapsedMs);
  if (currentIdx < 0) {
    return <div style={{ height: chartHeightPx }} />;
  }

  // Determine the visible window as a contiguous slice of history points.
  // Look back from currentIdx by rangeMs worth of data points (1 point per second).
  const rangePoints = rangeMs / 1000;
  const windowStart = Math.max(0, currentIdx - rangePoints + 1);
  const barCount = currentIdx - windowStart + 1;

  if (barCount <= 0) {
    return <div style={{ height: chartHeightPx }} />;
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

  // Sample altitude and grade for each bar, compute Y-axis range
  const barAltitudes: (number | undefined)[] = [];
  const barGrades: (number | undefined)[] = [];
  let yMin = Y_AXIS_DEFAULT_MIN;
  let yMax = Y_AXIS_DEFAULT_MAX;

  for (let i = 0; i < barCount; i++) {
    const idx = windowStart + i;
    const point = elevationHistory[idx];

    const alt = sampleAltitude(point, altitudeUnit);
    barAltitudes.push(alt);

    const grade = sampleGrade(elevationHistory, idx);
    barGrades.push(grade);

    if (alt !== undefined) {
      if (alt < yMin) yMin = alt;
      if (alt > yMax) yMax = alt;
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
      {barAltitudes.map((alt, i) => {
        if (alt === undefined) {
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

        const clampedAlt = Math.max(yMin, Math.min(yMax, alt));
        const heightRatio = ySpan > 0 ? (clampedAlt - yMin) / ySpan : 0;
        const barHeightPx = Math.max(2, heightRatio * chartHeightPx);
        const isThick = (barWidths[i] ?? 0) >= thickBarWidth;

        const grade = barGrades[i];
        const barColor = grade !== undefined
          ? getGradeZoneColor(grade, zones)
          : "#94a3b8";

        return (
          <div
            key={i}
            style={{
              width: barWidths[i],
              height: barHeightPx,
              flexShrink: 0,
              backgroundColor: barColor,
              borderRadius: isThick ? "1px 1px 0 0" : 0,
            }}
          />
        );
      })}
    </div>
  );
};
