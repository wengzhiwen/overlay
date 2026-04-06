import type { Activity, ActivitySample, DataGap } from "../domain/activity.js";

const createGapSample = (
  elapsedMs: number,
  timestampMs: number,
  isDataGap: boolean,
): ActivitySample => ({
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
  isDataGap,
});

export const fillShortGaps = (
  activity: Activity,
  gaps: DataGap[],
): Activity => {
  if (activity.samples.length <= 1) {
    return activity;
  }

  const startedAtMs = activity.startedAt ? new Date(activity.startedAt).getTime() : undefined;
  const gapsByAfterIndex = new Map<number, DataGap>(
    gaps.map((gap) => [gap.afterIndex, gap]),
  );
  const filled: ActivitySample[] = [];

  for (let index = 0; index < activity.samples.length - 1; index += 1) {
    const current = activity.samples[index]!;
    const next = activity.samples[index + 1]!;

    filled.push(current);

    const deltaSeconds = Math.round((next.elapsedMs - current.elapsedMs) / 1000);
    const missingSeconds = Math.max(0, deltaSeconds - 1);
    const gap = gapsByAfterIndex.get(index);

    for (let offset = 1; offset <= missingSeconds; offset += 1) {
      const elapsedMs = current.elapsedMs + offset * 1000;
      const timestampMs = startedAtMs !== undefined
        ? startedAtMs + elapsedMs
        : elapsedMs;
      const isDataGap =
        gap !== undefined &&
        elapsedMs >= gap.startMs &&
        elapsedMs < gap.endMs;

      filled.push(createGapSample(elapsedMs, timestampMs, isDataGap));
    }
  }

  filled.push(activity.samples[activity.samples.length - 1]!);

  const durationMs = filled.length > 0
    ? filled[filled.length - 1]!.elapsedMs
    : activity.summary.durationMs ?? 0;

  return {
    ...activity,
    summary: {
      ...activity.summary,
      durationMs,
    },
    samples: filled,
  };
};
