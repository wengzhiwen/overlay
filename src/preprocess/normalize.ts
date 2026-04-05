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
    .map((sample, index) => {
      const elapsedMs = index * 1000;

      return {
        ...sample,
        elapsedMs,
        timestampMs:
          startedAtMs === undefined ? elapsedMs : startedAtMs + elapsedMs,
      };
    });

  const durationMs =
    normalizedSamples.length > 0
      ? normalizedSamples[normalizedSamples.length - 1]?.elapsedMs
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
