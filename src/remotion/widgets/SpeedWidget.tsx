import type { WidgetConfig } from "../../config/schema.js";
import { SpeedChart } from "./SpeedChart.js";
import {
  convertSpeedMpsToUnit,
  getSpeedZoneColor,
  resolveSpeedZones,
} from "./speedShared.js";
import { WidgetShell, type BaseWidgetProps } from "./WidgetShell.js";

type SpeedWidgetConfig = Extract<WidgetConfig, { type: "speed" }>;

const formatSpeed = (value: number | undefined, config: SpeedWidgetConfig): string => {
  if (value === undefined) {
    return "--";
  }

  return convertSpeedMpsToUnit(value, config.unit).toFixed(config.precision);
};

const shouldShowChart = (
  config: SpeedWidgetConfig,
  totalDurationMs: number,
): boolean => {
  if (config.showChart === true) return true;
  if (config.showChart === false) return false;
  return totalDurationMs > 60_000;
};

const getZoneColor = (
  speedMps: number | undefined,
  config: SpeedWidgetConfig,
): string | undefined => {
  if (!config.colorByZone || speedMps === undefined) {
    return undefined;
  }

  const speedValue = convertSpeedMpsToUnit(speedMps, config.unit);
  const zones = resolveSpeedZones(config.zones, config.zoneThresholds, config.unit);

  return getSpeedZoneColor(speedValue, zones);
};

// Keep the chart visually substantial while letting it sit closer to the bottom edge.
const CHART_HEIGHT_RATIO = 0.46;

export const SpeedWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<SpeedWidgetConfig>) => {
  const showChart = shouldShowChart(config, frameData.activityDurationMs);
  const usableHeight = config.height - config.padding * 2;
  const chartHeightPx = Math.round(usableHeight * CHART_HEIGHT_RATIO);

  const chartElement = showChart
    ? (
        <SpeedChart
          frameData={frameData}
          currentElapsedMs={frame.elapsedMs}
          chartRange={config.chartRange}
          chartWidthPx={config.width - config.padding * 2}
          chartHeightPx={chartHeightPx}
          unit={config.unit}
          configZones={config.zones}
          zoneThresholds={config.zoneThresholds}
        />
      )
    : undefined;

  return (
    <WidgetShell
      config={config}
      label="Speed"
      theme={theme}
      value={formatSpeed(frame.metrics.speedMps, config)}
      unit={config.showUnit ? config.unit : undefined}
      secondary={chartElement}
      valueColor={getZoneColor(frame.metrics.speedMps, config)}
      verticalLayout="compact"
      secondaryPlacement="bottom"
      isEmpty={isEmpty}
    />
  );
};
