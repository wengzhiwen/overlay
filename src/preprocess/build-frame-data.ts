import type { OverlayConfig } from "../config/schema.js";
import type { Activity, ActivitySample } from "../domain/activity.js";
import {
  SNAPSHOT_INTERVAL_MS,
  type ElevationHistoryPoint,
  type FrameData,
  type FrameSnapshot,
} from "../domain/frame-data.js";
import { movingAverage } from "./smooth.js";

const computeMaxSpeed10sAvg = (
  samples: ActivitySample[],
): number | undefined => {
  if (samples.length === 0) {
    return undefined;
  }

  const gapIndices = new Set<number>();
  samples.forEach((sample, index) => {
    if (sample.isDataGap) {
      gapIndices.add(index);
    }
  });

  const speedValues = samples.map((sample) => sample.speedMps);
  const smoothed = movingAverage(speedValues, 10, gapIndices);

  let max: number | undefined;
  for (const value of smoothed) {
    if (value !== undefined && (max === undefined || value > max)) {
      max = value;
    }
  }

  return max;
};

const getSampleAtElapsedMs = (
  samples: ActivitySample[],
  elapsedMs: number,
): ActivitySample | undefined => {
  if (samples.length === 0) {
    return undefined;
  }

  if (elapsedMs <= 0) {
    return samples[0];
  }

  const sampleIndex = Math.min(
    samples.length - 1,
    Math.floor(elapsedMs / SNAPSHOT_INTERVAL_MS),
  );

  return samples[sampleIndex];
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
    elapsedOffsetMs?: number | undefined;
    elevationHistory?: ElevationHistoryPoint[] | undefined;
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
  const snapshotCount = Math.max(1, Math.ceil(durationMs / SNAPSHOT_INTERVAL_MS));
  const startedAtMs = activity.startedAt
    ? new Date(activity.startedAt).getTime()
    : undefined;
  const trimStartMs =
    config.render.durationStrategy === "trimmed" ? config.sync.trimStartMs : 0;
  const elapsedOffsetMs = options?.elapsedOffsetMs ?? 0;

  const frames: FrameSnapshot[] = Array.from(
    { length: snapshotCount },
    (_, frame) => {
      const renderTimeMs = frame * SNAPSHOT_INTERVAL_MS;
      const activityElapsedMs =
        renderTimeMs - config.sync.activityOffsetMs + trimStartMs;
      const isActive =
        activityElapsedMs >= 0 &&
        activityElapsedMs <= (activity.summary.durationMs ?? 0);
      const clampedElapsedMs = Math.max(0, activityElapsedMs);
      const sample = isActive ? getSampleAtElapsedMs(activity.samples, clampedElapsedMs) : undefined;

      return {
        frame,
        elapsedMs: clampedElapsedMs,
        displayElapsedMs: clampedElapsedMs + elapsedOffsetMs,
        renderTimeMs,
        isActive,
        isDataGap: sample?.isDataGap ?? false,
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

  // Build current segment's elevation history points.
  const currentElevationHistory: ElevationHistoryPoint[] = frames
    .filter((f) => f.isActive)
    .map((f) => ({
      displayElapsedMs: f.displayElapsedMs,
      altitudeM: f.metrics.altitudeM,
      distanceM: f.metrics.distanceM,
    }));

  // Compute max 10-second rolling average speed for speed-gauge widget.
  const maxSpeed10sAvgMps = computeMaxSpeed10sAvg(activity.samples);

  return {
    width: config.render.width,
    height: config.render.height,
    fps: config.render.fps,
    durationInFrames,
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
    frames,
    heartRateZones: activity.zones.heartRate,
    powerZones: activity.zones.power,
    cadenceZones: activity.zones.cadence,
    elevationHistory: [
      ...(options?.elevationHistory ?? []),
      ...currentElevationHistory,
    ],
    activityDurationMs: activity.summary.durationMs ?? 0,
    maxSpeed10sAvgMps,
  };
};
