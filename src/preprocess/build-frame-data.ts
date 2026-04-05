import type { OverlayConfig } from "../config/schema.js";
import type { Activity, ActivitySample } from "../domain/activity.js";
import type { FrameData, FrameSnapshot } from "../domain/frame-data.js";

const interpolateValue = (
  startValue: number | undefined,
  endValue: number | undefined,
  ratio: number,
): number | undefined => {
  if (startValue === undefined && endValue === undefined) {
    return undefined;
  }

  if (startValue === undefined) {
    return endValue;
  }

  if (endValue === undefined) {
    return startValue;
  }

  return startValue + (endValue - startValue) * ratio;
};

const getInterpolatedSample = (
  samples: ActivitySample[],
  elapsedMs: number,
): ActivitySample | undefined => {
  if (samples.length === 0) {
    return undefined;
  }

  if (elapsedMs <= 0) {
    return samples[0];
  }

  const lowerIndex = Math.floor(elapsedMs / 1000);
  const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
  const lower = samples[Math.min(lowerIndex, samples.length - 1)];
  const upper = samples[upperIndex];

  if (!lower || !upper) {
    return samples[samples.length - 1];
  }

  const ratio = Math.max(0, Math.min(1, (elapsedMs - lower.elapsedMs) / 1000));

  return {
    timestampMs: Math.round(lower.timestampMs + (upper.timestampMs - lower.timestampMs) * ratio),
    elapsedMs,
    lat: interpolateValue(lower.lat, upper.lat, ratio),
    lon: interpolateValue(lower.lon, upper.lon, ratio),
    altitudeM: interpolateValue(lower.altitudeM, upper.altitudeM, ratio),
    distanceM: interpolateValue(lower.distanceM, upper.distanceM, ratio),
    speedMps: interpolateValue(lower.speedMps, upper.speedMps, ratio),
    heartRateBpm: interpolateValue(lower.heartRateBpm, upper.heartRateBpm, ratio),
    gradePct: interpolateValue(lower.gradePct, upper.gradePct, ratio),
    cadenceRpm: interpolateValue(lower.cadenceRpm, upper.cadenceRpm, ratio),
    powerW: interpolateValue(lower.powerW, upper.powerW, ratio),
    ascentM: interpolateValue(lower.ascentM, upper.ascentM, ratio),
  };
};

const getEffectiveDurationMs = (
  activity: Activity,
  config: OverlayConfig,
): number => {
  const baseDurationMs = activity.summary.durationMs ?? 0;
  const trimStartMs = config.sync.trimStartMs;
  const trimEndMs = config.sync.trimEndMs;
  const positiveOffsetMs = Math.max(0, config.sync.activityOffsetMs);
  const trimmedDurationMs = Math.max(0, baseDurationMs - trimStartMs - trimEndMs);

  if (config.render.durationStrategy === "fixed") {
    return config.render.durationMs ?? trimmedDurationMs + positiveOffsetMs;
  }

  if (config.render.durationStrategy === "trimmed") {
    return config.render.durationMs ?? trimmedDurationMs + positiveOffsetMs;
  }

  return baseDurationMs + positiveOffsetMs;
};

export const buildFrameData = async (
  activity: Activity,
  config: OverlayConfig,
  options?: {
    maxDurationMs?: number | undefined;
  },
): Promise<FrameData> => {
  const baseDurationMs = getEffectiveDurationMs(activity, config);
  const durationMs =
    options?.maxDurationMs === undefined
      ? baseDurationMs
      : Math.min(baseDurationMs, options.maxDurationMs);
  const durationInFrames = Math.max(
    1,
    Math.ceil((durationMs / 1000) * config.render.fps),
  );
  const startedAtMs = activity.startedAt
    ? new Date(activity.startedAt).getTime()
    : undefined;
  const trimStartMs =
    config.render.durationStrategy === "trimmed" ? config.sync.trimStartMs : 0;

  const frames: FrameSnapshot[] = Array.from(
    { length: durationInFrames },
    (_, frame) => {
      const renderTimeMs = (frame / config.render.fps) * 1000;
      const activityElapsedMs =
        renderTimeMs - config.sync.activityOffsetMs + trimStartMs;
      const isActive =
        activityElapsedMs >= 0 &&
        activityElapsedMs <= (activity.summary.durationMs ?? 0);
      const clampedElapsedMs = Math.max(0, activityElapsedMs);
      const sample = isActive
        ? getInterpolatedSample(activity.samples, clampedElapsedMs)
        : undefined;

      return {
        frame,
        elapsedMs: clampedElapsedMs,
        renderTimeMs,
        isActive,
        metrics: {
          speedMps: sample?.speedMps,
          heartRateBpm: sample?.heartRateBpm,
          altitudeM: sample?.altitudeM,
          ascentM: sample?.ascentM,
          distanceM: sample?.distanceM,
          gradePct: sample?.gradePct,
          cadenceRpm: sample?.cadenceRpm,
          powerW: sample?.powerW,
        },
        position:
          sample?.lat !== undefined && sample.lon !== undefined
            ? {
                lat: sample.lat,
                lon: sample.lon,
              }
            : undefined,
        clockTimeIso:
          startedAtMs === undefined
            ? undefined
            : new Date(startedAtMs + clampedElapsedMs).toISOString(),
      };
    },
  );

  return {
    width: config.render.width,
    height: config.render.height,
    fps: config.render.fps,
    durationInFrames,
    frames,
    heartRateZones: activity.zones.heartRate,
    activityDurationMs: activity.summary.durationMs ?? 0,
  };
};
