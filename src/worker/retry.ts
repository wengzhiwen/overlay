import { logger } from "./logger.js";

/**
 * Retry an async operation with exponential backoff and jitter.
 *
 * Retries on any error — the caller should decide maxAttempts based on
 * how critical the operation is (e.g. completeJob needs aggressive retry
 * because the render work is already done).
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    label: string;
  },
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
        const jitter = delay * 0.2 * Math.random();
        const totalMs = Math.round(delay + jitter);
        logger.warn(
          `${options.label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${totalMs}ms: ${lastError.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, totalMs));
      }
    }
  }

  throw lastError;
};
