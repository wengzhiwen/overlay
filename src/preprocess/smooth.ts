import type { OverlayConfig } from "../config/schema.js";
import type { Activity } from "../domain/activity.js";

const movingAverage = (
  values: Array<number | undefined>,
  windowSize: number,
  gapIndices: Set<number>,
): Array<number | undefined> => {
  const radius = Math.max(0, Math.floor(windowSize / 2));

  return values.map((value, index) => {
    if (value === undefined || gapIndices.has(index)) {
      return undefined;
    }

    const windowStart = Math.max(0, index - radius);
    const windowEnd = Math.min(values.length, index + radius + 1);

    const windowValues = values
      .slice(windowStart, windowEnd)
      .filter((candidate, i) => candidate !== undefined && !gapIndices.has(windowStart + i));

    if (windowValues.length === 0) {
      return value;
    }

    let total = 0;
    for (const candidate of windowValues) {
      total += candidate as number;
    }

    return total / windowValues.length;
  });
};

export const smoothActivity = async (
  activity: Activity,
  config: OverlayConfig,
): Promise<Activity> => {
  const gapIndices = new Set<number>();

  activity.samples.forEach((sample, index) => {
    if (sample.isDataGap) {
      gapIndices.add(index);
    }
  });

  const speed = movingAverage(
    activity.samples.map((sample) => sample.speedMps),
    config.preprocess.speedSmoothingSeconds,
    gapIndices,
  );
  const heartRate = movingAverage(
    activity.samples.map((sample) => sample.heartRateBpm),
    config.preprocess.heartRateSmoothingSeconds,
    gapIndices,
  );
  const power = movingAverage(
    activity.samples.map((sample) => sample.powerW),
    config.preprocess.powerSmoothingSeconds,
    gapIndices,
  );
  const cadence = movingAverage(
    activity.samples.map((sample) => sample.cadenceRpm),
    config.preprocess.cadenceSmoothingSeconds,
    gapIndices,
  );
  const altitude = movingAverage(
    activity.samples.map((sample) => sample.altitudeM),
    config.preprocess.altitudeSmoothingSeconds,
    gapIndices,
  );
  const grade = movingAverage(
    activity.samples.map((sample) => sample.gradePct),
    config.preprocess.gradeSmoothingSeconds,
    gapIndices,
  );

  return {
    ...activity,
    samples: activity.samples.map((sample, index) => ({
      ...sample,
      speedMps: speed[index],
      heartRateBpm: heartRate[index],
      powerW: power[index],
      cadenceRpm: cadence[index],
      altitudeM: altitude[index],
      gradePct: grade[index],
    })),
  };
};
