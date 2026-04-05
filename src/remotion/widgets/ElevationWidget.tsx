import type { WidgetConfig } from "../../config/schema.js";
import { metersToFeet } from "../../utils/units.js";
import { WidgetShell, type BaseWidgetProps } from "./WidgetShell.js";

type ElevationWidgetConfig = Extract<WidgetConfig, { type: "elevation" }>;

const convertAltitude = (value: number | undefined, unit: "m" | "ft"): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return unit === "ft" ? metersToFeet(value) : value;
};

export const ElevationWidget = ({
  frame,
  config,
  theme,
}: BaseWidgetProps<ElevationWidgetConfig>) => {
  const altitude = convertAltitude(frame.metrics.altitudeM, config.altitudeUnit);
  const ascent = convertAltitude(frame.metrics.ascentM, config.ascentUnit);

  return (
    <WidgetShell
      config={config}
      label="Elevation"
      theme={theme}
      value={altitude === undefined ? "--" : Math.round(altitude).toString()}
      unit={config.altitudeUnit}
      secondary={
        config.showAscent
          ? ascent === undefined
            ? "Gain --"
            : `Gain +${Math.round(ascent)}${config.ascentUnit}`
          : undefined
      }
      valueColor={undefined}
    />
  );
};
