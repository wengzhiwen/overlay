import type { WidgetConfig } from "../../config/schema.js";
import type { BaseWidgetProps } from "./WidgetShell.js";
import { WidgetShell } from "./WidgetShell.js";
import { CadenceChart } from "./CadenceChart.js";

type CadenceWidgetConfig = Extract<WidgetConfig, { type: "cadence" }>;

const DEFAULT_ZONES = [
  { max: 70, color: "#60a5fa" },
  { min: 70, max: 80, color: "#34d399" },
  { min: 80, max: 90, color: "#fbbf24" },
  { min: 90, max: 100, color: "#fb923c" },
  { min: 100, color: "#f87171" },
];

const getZoneColor = (
  cadenceRpm: number | undefined,
  config: CadenceWidgetConfig,
): string | undefined => {
  if (!config.colorByZone || cadenceRpm === undefined) {
    return undefined;
  }

  const zones = config.zones.length > 0 ? config.zones : DEFAULT_ZONES;
  const matchingZone = zones.find((zone) => {
    const min = zone.min ?? Number.NEGATIVE_INFINITY;
    const max = zone.max ?? Number.POSITIVE_INFINITY;

    return cadenceRpm >= min && cadenceRpm < max;
  });

  return matchingZone?.color;
};

const shouldShowChart = (
  config: CadenceWidgetConfig,
  totalDurationMs: number,
): boolean => {
  if (config.showChart === true) return true;
  if (config.showChart === false) return false;
  // "auto": show chart if total duration > 60s
  return totalDurationMs > 60_000;
};

// Keep the chart visually substantial while letting it sit closer to the bottom edge.
const CHART_HEIGHT_RATIO = 0.46;

export const CadenceWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<CadenceWidgetConfig>) => {
  const cadenceValue =
    frame.metrics.cadenceRpm === undefined
      ? "--"
      : Math.round(frame.metrics.cadenceRpm).toString();

  const showChart = shouldShowChart(config, frameData.activityDurationMs);
  const usableHeight = config.height - config.padding * 2;
  const chartHeightPx = Math.round(usableHeight * CHART_HEIGHT_RATIO);

  const chartElement = showChart
    ? (
        <CadenceChart
          frameData={frameData}
          currentElapsedMs={frame.elapsedMs}
          chartRange={config.chartRange}
          chartWidthPx={config.width - config.padding * 2}
          chartHeightPx={chartHeightPx}
          sourceZones={frameData.cadenceZones}
          configZones={config.zones}
        />
      )
    : undefined;

  return (
    <WidgetShell
      config={config}
      label="Cadence"
      theme={theme}
      value={cadenceValue}
      unit={config.showUnit ? "rpm" : undefined}
      secondary={chartElement}
      valueColor={getZoneColor(frame.metrics.cadenceRpm, config)}
      verticalLayout="compact"
      secondaryPlacement="bottom"
      isEmpty={isEmpty}
    />
  );
};
