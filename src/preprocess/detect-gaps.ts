import type { Activity, DataGap } from "../domain/activity.js";

export const GAP_THRESHOLD_MS = 20_000;
export const SPLIT_THRESHOLD_MS = 120_000;

export type ClassifiedGaps = {
  shortGaps: DataGap[];
  longGaps: DataGap[];
};

export const detectGaps = (activity: Activity): ClassifiedGaps => {
  const shortGaps: DataGap[] = [];
  const longGaps: DataGap[] = [];
  const samples = activity.samples;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    if (previous === undefined || current === undefined) {
      continue;
    }

    const gapMs = current.elapsedMs - previous.elapsedMs - 1000;

    if (gapMs < GAP_THRESHOLD_MS) {
      continue;
    }

    const gap: DataGap = {
      afterIndex: index - 1,
      beforeIndex: index,
      startMs: previous.elapsedMs + 1000,
      endMs: current.elapsedMs,
      durationMs: gapMs,
    };

    if (gapMs > SPLIT_THRESHOLD_MS) {
      longGaps.push(gap);
    } else {
      shortGaps.push(gap);
    }
  }

  return { shortGaps, longGaps };
};
