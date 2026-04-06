import type { Activity, ActivitySample, DataGap } from "../domain/activity.js";

const createGapSample = (elapsedMs: number, timestampMs: number): ActivitySample => ({
  timestampMs,
  elapsedMs,
  lat: undefined,
  lon: undefined,
  altitudeM: undefined,
  distanceM: undefined,
  speedMps: undefined,
  heartRateBpm: undefined,
  ascentM: undefined,
  gradePct: undefined,
  cadenceRpm: undefined,
  powerW: undefined,
  isDataGap: true,
});

export const fillShortGaps = (
  activity: Activity,
  gaps: DataGap[],
): Activity => {
  if (gaps.length === 0) {
    return activity;
  }

  const startedAtMs = activity.startedAt ? new Date(activity.startedAt).getTime() : undefined;
  const filled: ActivitySample[] = [];
  let sampleIndex = 0;

  for (const gap of gaps) {
    // Copy samples before the gap
    while (sampleIndex <= gap.afterIndex) {
      filled.push(activity.samples[sampleIndex]!);
      sampleIndex += 1;
    }

    // Insert gap samples
    const gapDurationMs = gap.endMs - gap.startMs;
    const gapSampleCount = Math.round(gapDurationMs / 1000);

    for (let offset = 0; offset < gapSampleCount; offset += 1) {
      const gapElapsedMs = gap.startMs + offset * 1000;
      const gapTimestampMs = startedAtMs !== undefined
        ? startedAtMs + gapElapsedMs
        : gapElapsedMs;

      filled.push(createGapSample(gapElapsedMs, gapTimestampMs));
    }

    // sampleIndex now points to gap.beforeIndex, continue from there
  }

  // Copy remaining samples
  while (sampleIndex < activity.samples.length) {
    filled.push(activity.samples[sampleIndex]!);
    sampleIndex += 1;
  }

  // Reindex elapsedMs to continuous 1-second intervals
  const reindexed = filled.map((sample, index) => ({
    ...sample,
    elapsedMs: index * 1000,
  }));

  const durationMs = reindexed.length > 0
    ? reindexed[reindexed.length - 1]!.elapsedMs
    : activity.summary.durationMs ?? 0;

  return {
    ...activity,
    summary: {
      ...activity.summary,
      durationMs,
    },
    samples: reindexed,
  };
};
