import type { WidgetConfig } from "../../config/schema.js";
import { metersToFeet } from "../../utils/units.js";
import { getGradeZoneColor, resolveGradeZones } from "./elevationShared.js";
import { ElevationChart } from "./ElevationChart.js";
import { WidgetShell, type BaseWidgetProps } from "./WidgetShell.js";

type ElevationWidgetConfig = Extract<WidgetConfig, { type: "elevation" }>;

const convertAltitude = (value: number | undefined, unit: "m" | "ft"): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return unit === "ft" ? metersToFeet(value) : value;
};

const shouldShowChart = (
  config: ElevationWidgetConfig,
  totalDurationMs: number,
): boolean => {
  if (config.showChart === true) return true;
  if (config.showChart === false) return false;
  return totalDurationMs > 60_000;
};

// Keep the chart visually substantial while letting it sit closer to the bottom edge.
const CHART_HEIGHT_RATIO = 0.46;

export const ElevationWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<ElevationWidgetConfig>) => {
  const altitude = convertAltitude(frame.metrics.altitudeM, config.altitudeUnit);
  const ascent = convertAltitude(frame.metrics.ascentM, config.ascentUnit);

  const showChart = shouldShowChart(config, frameData.activityDurationMs);
  const usableHeight = config.height - config.padding * 2;
  const chartHeightPx = Math.round(usableHeight * CHART_HEIGHT_RATIO);

  const chartElement = showChart
    ? (
        <ElevationChart
          elevationHistory={frameData.elevationHistory}
          currentDisplayElapsedMs={frame.displayElapsedMs}
          chartRange={config.chartRange}
          chartWidthPx={config.width - config.padding * 2}
          chartHeightPx={chartHeightPx}
          altitudeUnit={config.altitudeUnit}
          gradeThresholds={config.gradeThresholds}
        />
      )
    : undefined;

  // Chart takes priority over ascent text as the secondary element.
  const secondaryElement = chartElement ?? (
    config.showAscent
      ? ascent === undefined
        ? "Gain --"
        : `Gain +${Math.round(ascent)}${config.ascentUnit}`
      : undefined
  );

  // Compute value color from current rolling grade when colorByGrade is enabled.
  const valueColor = (() => {
    if (!config.colorByGrade) return undefined;

    const currentMs = frame.elapsedMs;
    const windowMs = 30_000;
    const now = frameData.frames[Math.min(
      frameData.frames.length - 1,
      Math.max(0, Math.floor(currentMs / 1000)),
    )];
    const pastIndex = Math.max(0, Math.floor((currentMs - windowMs) / 1000));
    const past = frameData.frames[pastIndex];

    if (!now || !past) return undefined;

    const altNow = now.metrics.altitudeM;
    const altPast = past.metrics.altitudeM;
    const distNow = now.metrics.distanceM;
    const distPast = past.metrics.distanceM;

    if (altNow === undefined || altPast === undefined) return undefined;
    if (distNow === undefined || distPast === undefined) return undefined;

    const distDelta = distNow - distPast;
    if (distDelta <= 0) return undefined;

    const grade = ((altNow - altPast) / distDelta) * 100;
    const zones = resolveGradeZones(config.gradeThresholds);

    return getGradeZoneColor(grade, zones);
  })();

  return (
    <WidgetShell
      config={config}
      label="Elevation"
      theme={theme}
      value={altitude === undefined ? "--" : Math.round(altitude).toString()}
      unit={config.altitudeUnit}
      secondary={secondaryElement}
      valueColor={valueColor}
      verticalLayout="compact"
      secondaryPlacement="bottom"
      isEmpty={isEmpty}
    />
  );
};
