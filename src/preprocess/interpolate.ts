import type { OverlayConfig } from "../config/schema.js";
import type { Activity } from "../domain/activity.js";

const interpolateArray = (
  values: Array<number | undefined>,
): Array<number | undefined> => {
  const next = values.slice();
  let previousDefinedIndex: number | undefined;

  for (let index = 0; index < next.length; index += 1) {
    const currentValue = next[index];

    if (currentValue !== undefined) {
      previousDefinedIndex = index;
      continue;
    }

    const nextDefinedIndex = next.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate !== undefined,
    );

    if (previousDefinedIndex === undefined || nextDefinedIndex === -1) {
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

  const speed = interpolateArray(activity.samples.map((sample) => sample.speedMps));
  const heartRate = interpolateArray(
    activity.samples.map((sample) => sample.heartRateBpm),
  );
  const altitude = interpolateArray(
    activity.samples.map((sample) => sample.altitudeM),
  );
  const distance = interpolateArray(
    activity.samples.map((sample) => sample.distanceM),
  );
  const grade = interpolateArray(activity.samples.map((sample) => sample.gradePct));
  const latitude = interpolateArray(activity.samples.map((sample) => sample.lat));
  const longitude = interpolateArray(activity.samples.map((sample) => sample.lon));
  const cadence = interpolateArray(
    activity.samples.map((sample) => sample.cadenceRpm),
  );
  const power = interpolateArray(activity.samples.map((sample) => sample.powerW));

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
