import type { WidgetConfig } from "../../config/schema.js";
import { metersToKilometers, metersToMiles } from "../../utils/units.js";
import { WidgetShell, type BaseWidgetProps } from "./WidgetShell.js";

type DistanceWidgetConfig = Extract<WidgetConfig, { type: "distance" }>;

const formatDistance = (
  value: number | undefined,
  config: DistanceWidgetConfig,
): string => {
  if (value === undefined) {
    return "--";
  }

  const converted =
    config.unit === "mi" ? metersToMiles(value) : metersToKilometers(value);

  return converted.toFixed(config.precision);
};

export const DistanceWidget = ({
  frame,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<DistanceWidgetConfig>) => {
  return (
    <WidgetShell
      config={config}
      label="Distance"
      theme={theme}
      value={formatDistance(frame.metrics.distanceM, config)}
      unit={config.showUnit ? config.unit : undefined}
      secondary={undefined}
      valueColor={undefined}
      isEmpty={isEmpty}
    />
  );
};
