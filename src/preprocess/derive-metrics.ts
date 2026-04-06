import type { Activity } from "../domain/activity.js";

import { GAP_THRESHOLD_MS } from "./detect-gaps.js";

const clampGrade = (gradePct: number): number => {
  return Math.max(-35, Math.min(35, gradePct));
};

export const deriveMetrics = async (activity: Activity): Promise<Activity> => {
  let accumulatedAscentM = 0;

  const samples = activity.samples.map((sample, index, allSamples) => {
    if (index === 0) {
      return {
        ...sample,
        ascentM: 0,
      };
    }

    const previous = allSamples[index - 1];

    if (!previous) {
      return {
        ...sample,
        ascentM: accumulatedAscentM,
      };
    }

    // Skip delta computation across gap boundaries
    const timeDeltaMs = sample.elapsedMs - previous.elapsedMs;

    if (timeDeltaMs > GAP_THRESHOLD_MS) {
      return {
        ...sample,
        ascentM: accumulatedAscentM,
      };
    }

    const distanceDeltaM =
      sample.distanceM !== undefined && previous.distanceM !== undefined
        ? sample.distanceM - previous.distanceM
        : undefined;
    const altitudeDeltaM =
      sample.altitudeM !== undefined && previous.altitudeM !== undefined
        ? sample.altitudeM - previous.altitudeM
        : undefined;

    if (altitudeDeltaM !== undefined && altitudeDeltaM > 0) {
      accumulatedAscentM += altitudeDeltaM;
    }

    const speedMps =
      sample.speedMps ??
      (distanceDeltaM !== undefined
        ? Math.max(0, distanceDeltaM / (timeDeltaMs / 1000))
        : undefined);

    const gradePct =
      distanceDeltaM !== undefined &&
      altitudeDeltaM !== undefined &&
      Math.abs(distanceDeltaM) >= 1
        ? clampGrade((altitudeDeltaM / distanceDeltaM) * 100)
        : sample.gradePct;

    return {
      ...sample,
      speedMps,
      gradePct,
      ascentM: accumulatedAscentM,
    };
  });

  return {
    ...activity,
    summary: {
      ...activity.summary,
      ascentM: accumulatedAscentM,
      distanceM: samples.length > 0 ? samples[samples.length - 1]?.distanceM : activity.summary.distanceM,
    },
    samples,
  };
};
