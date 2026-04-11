import type { WidgetConfig } from "../../config/schema.js";
import type { BaseWidgetProps } from "./WidgetShell.js";
import { WidgetShell } from "./WidgetShell.js";
import { PowerChart } from "./PowerChart.js";

type PowerWidgetConfig = Extract<WidgetConfig, { type: "power" }>;

const DEFAULT_ZONES = [
  { max: 150, color: "#60a5fa" },
  { min: 150, max: 200, color: "#34d399" },
  { min: 200, max: 250, color: "#fbbf24" },
  { min: 250, max: 300, color: "#fb923c" },
  { min: 300, color: "#f87171" },
];

const getZoneColor = (
  powerW: number | undefined,
  config: PowerWidgetConfig,
): string | undefined => {
  if (!config.colorByZone || powerW === undefined) {
    return undefined;
  }

  const zones = config.zones.length > 0 ? config.zones : DEFAULT_ZONES;
  const matchingZone = zones.find((zone) => {
    const min = zone.min ?? Number.NEGATIVE_INFINITY;
    const max = zone.max ?? Number.POSITIVE_INFINITY;

    return powerW >= min && powerW < max;
  });

  return matchingZone?.color;
};

const shouldShowChart = (
  config: PowerWidgetConfig,
  totalDurationMs: number,
): boolean => {
  if (config.showChart === true) return true;
  if (config.showChart === false) return false;
  // "auto": show chart if total duration > 60s
  return totalDurationMs > 60_000;
};

// Keep the chart visually substantial while letting it sit closer to the bottom edge.
const CHART_HEIGHT_RATIO = 0.46;

export const PowerWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<PowerWidgetConfig>) => {
  const powerValue =
    frame.metrics.powerW === undefined
      ? "--"
      : Math.round(frame.metrics.powerW).toString();

  const showChart = shouldShowChart(config, frameData.activityDurationMs);
  const usableHeight = config.height - config.padding * 2;
  const chartHeightPx = Math.round(usableHeight * CHART_HEIGHT_RATIO);

  const chartElement = showChart
    ? (
        <PowerChart
          frameData={frameData}
          currentElapsedMs={frame.elapsedMs}
          chartRange={config.chartRange}
          chartWidthPx={config.width - config.padding * 2}
          chartHeightPx={chartHeightPx}
          sourceZones={frameData.powerZones}
          configZones={config.zones}
        />
      )
    : undefined;

  return (
    <WidgetShell
      config={config}
      label="Power"
      theme={theme}
      value={powerValue}
      unit={config.showUnit ? "W" : undefined}
      secondary={chartElement}
      valueColor={getZoneColor(frame.metrics.powerW, config)}
      verticalLayout="compact"
      secondaryPlacement="bottom"
      isEmpty={isEmpty}
    />
  );
};
