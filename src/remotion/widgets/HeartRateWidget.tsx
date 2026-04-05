import type { WidgetConfig } from "../../config/schema.js";
import { WidgetShell, type BaseWidgetProps } from "./WidgetShell.js";

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

export const HeartRateWidget = ({
  frame,
  config,
  theme,
}: BaseWidgetProps<HeartRateWidgetConfig>) => {
  const heartRateValue =
    frame.metrics.heartRateBpm === undefined
      ? "--"
      : Math.round(frame.metrics.heartRateBpm).toString();

  return (
    <WidgetShell
      config={config}
      label="Heart Rate"
      theme={theme}
      value={heartRateValue}
      unit={config.showUnit ? "bpm" : undefined}
      secondary={undefined}
      valueColor={getZoneColor(frame.metrics.heartRateBpm, config)}
    />
  );
};
