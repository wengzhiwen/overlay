import type { Activity, ActivitySample, DataGap } from "../domain/activity.js";

const createSegment = (
  activity: Activity,
  samples: ActivitySample[],
  shortGaps: DataGap[],
): Activity => {
  const firstSample = samples[0];
  const firstTimestampMs = firstSample?.timestampMs;
  const startedAt =
    firstTimestampMs !== undefined
      ? new Date(firstTimestampMs).toISOString()
      : activity.startedAt;

  // Reindex elapsedMs from 0
  const reindexedSamples = samples.map((sample, index) => ({
    ...sample,
    elapsedMs: index * 1000,
  }));

  const durationMs = reindexedSamples.length > 0
    ? reindexedSamples[reindexedSamples.length - 1]!.elapsedMs
    : 0;

  // Remap short gap indices to the reindexed sample array
  const remappedShortGaps = shortGaps.map((gap) => {
    const newAfterIndex = gap.afterIndex; // same relative position
    const newBeforeIndex = gap.beforeIndex; // same relative position

    return {
      ...gap,
      afterIndex: newAfterIndex,
      beforeIndex: newBeforeIndex,
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

    segments.push(createSegment(activity, segmentSamples, segmentShortGaps));
    sliceStart = gap.beforeIndex;
  }

  // Last segment
  const lastSamples = activity.samples.slice(sliceStart);
  const lastShortGaps = shortGaps.filter(
    (sg) => sg.afterIndex >= sliceStart,
  );

  segments.push(createSegment(activity, lastSamples, lastShortGaps));

  return segments;
};
