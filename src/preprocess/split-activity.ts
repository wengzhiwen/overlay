import type { Activity, ActivitySample, DataGap } from "../domain/activity.js";

const createSegment = (
  activity: Activity,
  samples: ActivitySample[],
  shortGaps: DataGap[],
  sliceStart: number,
): Activity => {
  const firstSample = samples[0];
  const firstTimestampMs = firstSample?.timestampMs;
  const firstElapsedMs = firstSample?.elapsedMs ?? 0;
  const startedAt =
    firstTimestampMs !== undefined
      ? new Date(firstTimestampMs).toISOString()
      : activity.startedAt;

  const reindexedSamples = samples.map((sample) => ({
    ...sample,
    elapsedMs: sample.elapsedMs - firstElapsedMs,
  }));

  const durationMs = reindexedSamples.length > 0
    ? reindexedSamples[reindexedSamples.length - 1]!.elapsedMs
    : 0;

  const remappedShortGaps = shortGaps.map((gap) => {
    return {
      ...gap,
      afterIndex: gap.afterIndex - sliceStart,
      beforeIndex: gap.beforeIndex - sliceStart,
      startMs: gap.startMs - firstElapsedMs,
      endMs: gap.endMs - firstElapsedMs,
    };
  });

  return {
    ...activity,
    startedAt,
    summary: {
      ...activity.summary,
      durationMs,
    },
    samples: reindexedSamples,
    gaps: remappedShortGaps,
  };
};

export const splitActivityAtLongGaps = (
  activity: Activity,
  longGaps: DataGap[],
  shortGaps: DataGap[],
): Activity[] => {
  if (longGaps.length === 0) {
    return [activity];
  }

  const segments: Activity[] = [];
  let sliceStart = 0;

  for (const gap of longGaps) {
    const segmentSamples = activity.samples.slice(sliceStart, gap.afterIndex + 1);
    const segmentShortGaps = shortGaps.filter(
      (sg) => sg.afterIndex >= sliceStart && sg.beforeIndex <= gap.afterIndex + 1,
    );

    segments.push(createSegment(activity, segmentSamples, segmentShortGaps, sliceStart));
    sliceStart = gap.beforeIndex;
  }

  // Last segment
  const lastSamples = activity.samples.slice(sliceStart);
  const lastShortGaps = shortGaps.filter(
    (sg) => sg.afterIndex >= sliceStart,
  );

  segments.push(createSegment(activity, lastSamples, lastShortGaps, sliceStart));

  return segments;
};
