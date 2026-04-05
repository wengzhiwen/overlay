export const formatDurationHms = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

export const formatDurationMs = (
  elapsedMs: number,
  format: "hh:mm:ss" | "mm:ss" = "hh:mm:ss",
): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  if (format === "mm:ss") {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return formatDurationHms(elapsedMs);
};

export const formatClockTime = (
  isoString: string | undefined,
  timezone: string | undefined,
  format: "HH:mm" | "HH:mm:ss" = "HH:mm:ss",
): string => {
  if (!isoString) {
    return "--";
  }

  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: format === "HH:mm:ss" ? "2-digit" : undefined,
    hour12: false,
    timeZone: timezone,
  });

  return formatter.format(date);
};
