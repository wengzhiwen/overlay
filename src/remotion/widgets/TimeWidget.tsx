import type { WidgetConfig } from "../../config/schema.js";
import { formatClockTime, formatDurationMs } from "../../utils/time.js";
import { WidgetShell, type BaseWidgetProps } from "./WidgetShell.js";

type TimeWidgetConfig = Extract<WidgetConfig, { type: "time" }>;

export const TimeWidget = ({
  frame,
  config,
  theme,
}: BaseWidgetProps<TimeWidgetConfig>) => {
  const elapsed = formatDurationMs(frame.elapsedMs, config.elapsedFormat);
  const clock = formatClockTime(
    frame.clockTimeIso,
    config.timezone,
    config.clockFormat,
  );

  const value =
    config.mode === "clock"
      ? clock
      : elapsed;

  return (
    <WidgetShell
      config={config}
      label="Time"
      theme={theme}
      value={value}
      secondary={config.mode === "both" ? clock : undefined}
      unit={undefined}
      valueColor={undefined}
    />
  );
};
