import type { Activity } from "../domain/activity.js";

export const normalizeActivity = async (
  activity: Activity,
): Promise<Activity> => {
  const startedAtMs = activity.startedAt
    ? new Date(activity.startedAt).getTime()
    : undefined;

  const normalizedSamples = activity.samples
    .slice()
    .sort((left, right) => left.elapsedMs - right.elapsedMs)
    .filter((sample, index, samples) => {
      const previous = samples[index - 1];

      return index === 0 || (previous !== undefined && sample.elapsedMs > previous.elapsedMs);
    })
    .map((sample) => ({
      ...sample,
      // Keep gap-aware elapsedMs (do NOT reindex to index * 1000)
      // Only recalculate timestampMs for consistency
      timestampMs:
        startedAtMs === undefined
          ? sample.elapsedMs
          : startedAtMs + sample.elapsedMs,
    }));

  const durationMs =
    normalizedSamples.length > 0
      ? normalizedSamples[normalizedSamples.length - 1]!.elapsedMs
      : activity.summary.durationMs;

  return {
    ...activity,
    summary: {
      ...activity.summary,
      durationMs,
    },
    samples: normalizedSamples,
  };
};
