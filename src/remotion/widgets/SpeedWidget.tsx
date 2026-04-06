import type { WidgetConfig } from "../../config/schema.js";
import { metersPerSecondToKilometersPerHour, metersPerSecondToMilesPerHour } from "../../utils/units.js";
import { WidgetShell, type BaseWidgetProps } from "./WidgetShell.js";

type SpeedWidgetConfig = Extract<WidgetConfig, { type: "speed" }>;

const formatSpeed = (value: number | undefined, config: SpeedWidgetConfig): string => {
  if (value === undefined) {
    return "--";
  }

  const converted =
    config.unit === "mph"
      ? metersPerSecondToMilesPerHour(value)
      : metersPerSecondToKilometersPerHour(value);

  return converted.toFixed(config.precision);
};

export const SpeedWidget = ({
  frame,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<SpeedWidgetConfig>) => {
  return (
    <WidgetShell
      config={config}
      label="Speed"
      theme={theme}
      value={formatSpeed(frame.metrics.speedMps, config)}
      unit={config.showUnit ? config.unit : undefined}
      secondary={undefined}
      valueColor={undefined}
      isEmpty={isEmpty}
    />
  );
};
