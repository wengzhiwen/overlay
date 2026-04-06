import type { WidgetConfig } from "../../config/schema.js";
import type { BaseWidgetProps } from "./WidgetShell.js";
import { WidgetShell } from "./WidgetShell.js";
import { HeartRateChart } from "./HeartRateChart.js";

type HeartRateWidgetConfig = Extract<WidgetConfig, { type: "heart-rate" }>;

const DEFAULT_ZONES = [
  { max: 100, color: "#60a5fa" },
  { min: 100, max: 120, color: "#34d399" },
  { min: 120, max: 140, color: "#fbbf24" },
  { min: 140, max: 160, color: "#fb923c" },
  { min: 160, color: "#f87171" },
];

const getZoneColor = (
  heartRateBpm: number | undefined,
  config: HeartRateWidgetConfig,
): string | undefined => {
  if (!config.colorByZone || heartRateBpm === undefined) {
    return undefined;
  }

  const zones = config.zones.length > 0 ? config.zones : DEFAULT_ZONES;
  const matchingZone = zones.find((zone) => {
    const min = zone.min ?? Number.NEGATIVE_INFINITY;
    const max = zone.max ?? Number.POSITIVE_INFINITY;

    return heartRateBpm >= min && heartRateBpm < max;
  });

  return matchingZone?.color;
};

const shouldShowChart = (
  config: HeartRateWidgetConfig,
  totalDurationMs: number,
): boolean => {
  if (config.showChart === true) return true;
  if (config.showChart === false) return false;
  // "auto": show chart if total duration > 60s
  return totalDurationMs > 60_000;
};

// Keep the chart visually substantial while letting it sit closer to the bottom edge.
const CHART_HEIGHT_RATIO = 0.46;

export const HeartRateWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<HeartRateWidgetConfig>) => {
  const heartRateValue =
    frame.metrics.heartRateBpm === undefined
      ? "--"
      : Math.round(frame.metrics.heartRateBpm).toString();

  const showChart = shouldShowChart(config, frameData.activityDurationMs);
  const usableHeight = config.height - config.padding * 2;
  const chartHeightPx = Math.round(usableHeight * CHART_HEIGHT_RATIO);

  const chartElement = showChart
    ? (
        <HeartRateChart
          frameData={frameData}
          currentElapsedMs={frame.elapsedMs}
          chartRange={config.chartRange}
          chartWidthPx={config.width - config.padding * 2}
          chartHeightPx={chartHeightPx}
          sourceZones={frameData.heartRateZones}
          configZones={config.zones}
        />
      )
    : undefined;

  return (
    <WidgetShell
      config={config}
      label="Heart Rate"
      theme={theme}
      value={heartRateValue}
      unit={config.showUnit ? "bpm" : undefined}
      secondary={chartElement}
      valueColor={getZoneColor(frame.metrics.heartRateBpm, config)}
      verticalLayout="compact"
      secondaryPlacement="bottom"
      isEmpty={isEmpty}
    />
  );
};
