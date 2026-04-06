import type { CSSProperties, ReactNode } from "react";

import { getSnapshotForElapsedMs, type FrameData } from "../../domain/frame-data.js";
import {
  convertSpeedMpsToUnit,
  getDefaultSpeedAxisMax,
  getSpeedZoneColor,
  resolveSpeedZones,
  type SpeedUnit,
  type SpeedZoneInput,
} from "./speedShared.js";

const CHART_RANGE_MS: Record<"short" | "medium" | "long", number> = {
  short: 60_000,
  medium: 300_000,
  long: 1_200_000,
};

const Y_AXIS_DEFAULT_MIN = 0;
const Y_AXIS_PADDING_RATIO = 0.05;

// Thick bar width scales with chart dimensions (chartWidth/80 ~= 3px at 240px width).
const THICK_BARS_FILL_COUNT = 80;

const sampleSpeed = (
  frameData: FrameData,
  elapsedMs: number,
  unit: SpeedUnit,
): number | undefined => {
  const speedMps = getSnapshotForElapsedMs(frameData, elapsedMs)?.metrics.speedMps;

  return speedMps === undefined ? undefined : convertSpeedMpsToUnit(speedMps, unit);
};

type SpeedChartProps = {
  frameData: FrameData;
  currentElapsedMs: number;
  chartRange: "short" | "medium" | "long";
  chartWidthPx: number;
  chartHeightPx: number;
  unit: SpeedUnit;
  configZones: SpeedZoneInput[];
  zoneThresholds: number[] | undefined;
};

export const SpeedChart = ({
  frameData,
  currentElapsedMs,
  chartRange,
  chartWidthPx,
  chartHeightPx,
  unit,
  configZones,
  zoneThresholds,
}: SpeedChartProps): ReactNode => {
  const zones = resolveSpeedZones(configZones, zoneThresholds, unit);
  const rangeMs = CHART_RANGE_MS[chartRange];
  const rangeSeconds = rangeMs / 1000;
  const elapsedSeconds = Math.max(0, Math.floor(currentElapsedMs / 1000));

  if (elapsedSeconds <= 0) {
    return <div style={{ height: chartHeightPx }} />;
  }

  let barCount: number;
  let windowStartSecond: number;

  if (elapsedSeconds <= rangeSeconds) {
    barCount = elapsedSeconds;
    windowStartSecond = 0;
  } else {
    barCount = rangeSeconds;
    windowStartSecond = elapsedSeconds - rangeSeconds;
  }

  const thickBarWidth = Math.max(2, Math.round(chartWidthPx / THICK_BARS_FILL_COUNT));
  const maxThickBars = Math.floor(chartWidthPx / thickBarWidth);
  const barWidths: number[] = [];

  if (barCount <= maxThickBars) {
    for (let i = 0; i < barCount; i++) {
      barWidths.push(thickBarWidth);
    }
  } else {
    const remainingWidth = chartWidthPx - thickBarWidth;
    const thinWidth = remainingWidth / (barCount - 1);

    for (let i = 0; i < barCount - 1; i++) {
      barWidths.push(thinWidth);
    }

    barWidths.push(thickBarWidth);
  }

  const barValues: (number | undefined)[] = [];
  let yMin = Y_AXIS_DEFAULT_MIN;
  let yMax = getDefaultSpeedAxisMax(unit);

  for (let i = 0; i < barCount; i++) {
    const second = windowStartSecond + i;
    const speed = sampleSpeed(frameData, second * 1000 + 500, unit);
    barValues.push(speed);

    if (speed !== undefined && speed > yMax) {
      yMax = speed;
    }
  }

  const yRange = yMax - yMin;
  const padding = yRange * Y_AXIS_PADDING_RATIO;
  yMin = Math.max(0, Math.floor(yMin - padding));
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
      {barValues.map((speed, i) => {
        if (speed === undefined) {
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

        const clampedSpeed = Math.max(yMin, Math.min(yMax, speed));
        const heightRatio = ySpan > 0 ? (clampedSpeed - yMin) / ySpan : 0;
        const barHeightPx = Math.max(2, heightRatio * chartHeightPx);
        const isThick = (barWidths[i] ?? 0) >= thickBarWidth;

        return (
          <div
            key={i}
            style={{
              width: barWidths[i],
              height: barHeightPx,
              flexShrink: 0,
              backgroundColor: getSpeedZoneColor(speed, zones),
              borderRadius: isThick ? "1px 1px 0 0" : 0,
            }}
          />
        );
      })}
    </div>
  );
};
