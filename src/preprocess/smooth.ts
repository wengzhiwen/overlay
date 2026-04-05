import type { OverlayConfig } from "../config/schema.js";
import type { Activity } from "../domain/activity.js";

const movingAverage = (
  values: Array<number | undefined>,
  windowSize: number,
): Array<number | undefined> => {
  const radius = Math.max(0, Math.floor(windowSize / 2));

  return values.map((value, index) => {
    if (value === undefined) {
      return undefined;
    }

    const windowValues = values
      .slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))
      .filter((candidate): candidate is number => candidate !== undefined);

    if (windowValues.length === 0) {
      return value;
    }

    const total = windowValues.reduce((sum, candidate) => sum + candidate, 0);

    return total / windowValues.length;
  });
};

export const smoothActivity = async (
  activity: Activity,
  config: OverlayConfig,
): Promise<Activity> => {
  const speed = movingAverage(
    activity.samples.map((sample) => sample.speedMps),
    config.preprocess.speedSmoothingSeconds,
  );
  const heartRate = movingAverage(
    activity.samples.map((sample) => sample.heartRateBpm),
    config.preprocess.heartRateSmoothingSeconds,
  );
  const altitude = movingAverage(
    activity.samples.map((sample) => sample.altitudeM),
    config.preprocess.altitudeSmoothingSeconds,
  );
  const grade = movingAverage(
    activity.samples.map((sample) => sample.gradePct),
    config.preprocess.gradeSmoothingSeconds,
  );

  return {
    ...activity,
    samples: activity.samples.map((sample, index) => ({
      ...sample,
      speedMps: speed[index],
      heartRateBpm: heartRate[index],
      altitudeM: altitude[index],
      gradePct: grade[index],
    })),
  };
};
