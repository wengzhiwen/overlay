type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info";

const formatMessage = (level: LogLevel, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
};

export const logger = {
  debug: (message: string): void => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.debug) {
      console.debug(formatMessage("debug", message));
    }
  },
  info: (message: string): void => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.info) {
      console.info(formatMessage("info", message));
    }
  },
  warn: (message: string): void => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.warn) {
      console.warn(formatMessage("warn", message));
    }
  },
  error: (message: string): void => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.error) {
      console.error(formatMessage("error", message));
    }
  },
};
