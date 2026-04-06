import type { OverlayConfig } from "../config/schema.js";
import type { Activity } from "../domain/activity.js";

const interpolateArray = (
  values: Array<number | undefined>,
  gapIndices: Set<number>,
): Array<number | undefined> => {
  const next = values.slice();

  for (let index = 0; index < next.length; index += 1) {
    const currentValue = next[index];

    if (currentValue !== undefined) {
      continue;
    }

    // Skip interpolation for gap samples
    if (gapIndices.has(index)) {
      continue;
    }

    // Find previous defined, non-gap index
    let previousDefinedIndex = -1;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (next[i] !== undefined && !gapIndices.has(i)) {
        previousDefinedIndex = i;
        break;
      }
    }

    // Find next defined, non-gap index
    let nextDefinedIndex = -1;
    for (let i = index + 1; i < next.length; i += 1) {
      if (next[i] !== undefined && !gapIndices.has(i)) {
        nextDefinedIndex = i;
        break;
      }
    }

    if (previousDefinedIndex === -1 || nextDefinedIndex === -1) {
      continue;
    }

    const leftValue = next[previousDefinedIndex];
    const rightValue = next[nextDefinedIndex];

    if (leftValue === undefined || rightValue === undefined) {
      continue;
    }

    const ratio =
      (index - previousDefinedIndex) / (nextDefinedIndex - previousDefinedIndex);

    next[index] = leftValue + (rightValue - leftValue) * ratio;
  }

  return next;
};

export const interpolateActivity = async (
  activity: Activity,
  config: OverlayConfig,
): Promise<Activity> => {
  if (!config.preprocess.interpolateMissingSamples) {
    return activity;
  }

  const gapIndices = new Set<number>();

  activity.samples.forEach((sample, index) => {
    if (sample.isDataGap) {
      gapIndices.add(index);
    }
  });

  const speed = interpolateArray(
    activity.samples.map((sample) => sample.speedMps),
    gapIndices,
  );
  const heartRate = interpolateArray(
    activity.samples.map((sample) => sample.heartRateBpm),
    gapIndices,
  );
  const altitude = interpolateArray(
    activity.samples.map((sample) => sample.altitudeM),
    gapIndices,
  );
  const distance = interpolateArray(
    activity.samples.map((sample) => sample.distanceM),
    gapIndices,
  );
  const grade = interpolateArray(
    activity.samples.map((sample) => sample.gradePct),
    gapIndices,
  );
  const latitude = interpolateArray(
    activity.samples.map((sample) => sample.lat),
    gapIndices,
  );
  const longitude = interpolateArray(
    activity.samples.map((sample) => sample.lon),
    gapIndices,
  );
  const cadence = interpolateArray(
    activity.samples.map((sample) => sample.cadenceRpm),
    gapIndices,
  );
  const power = interpolateArray(
    activity.samples.map((sample) => sample.powerW),
    gapIndices,
  );

  return {
    ...activity,
    samples: activity.samples.map((sample, index) => ({
      ...sample,
      speedMps: speed[index],
      heartRateBpm: heartRate[index],
      altitudeM: altitude[index],
      distanceM: distance[index],
      gradePct: grade[index],
      lat: latitude[index],
      lon: longitude[index],
      cadenceRpm: cadence[index],
      powerW: power[index],
    })),
  };
};
