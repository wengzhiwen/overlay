import type { ActivityMetrics } from "./metrics.js";
import type { ActivityZone } from "./activity.js";

export const SNAPSHOT_INTERVAL_MS = 1000;

export type FrameSnapshot = {
  frame: number;
  elapsedMs: number;
  renderTimeMs: number;
  isActive: boolean;
  metrics: ActivityMetrics;
  position:
    | {
    lat: number;
    lon: number;
  }
    | undefined;
  clockTimeIso: string | undefined;
};

export type FrameData = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  snapshotIntervalMs: number;
  frames: FrameSnapshot[];
  heartRateZones: ActivityZone[];
  activityDurationMs: number;
};

const clampSnapshotIndex = (
  snapshotCount: number,
  index: number,
): number => {
  if (snapshotCount <= 0) {
    return -1;
  }

  return Math.min(Math.max(0, index), snapshotCount - 1);
};

export const getSnapshotIndexForElapsedMs = (
  frameData: Pick<FrameData, "frames" | "snapshotIntervalMs">,
  elapsedMs: number,
): number => {
  return clampSnapshotIndex(
    frameData.frames.length,
    Math.floor(Math.max(0, elapsedMs) / frameData.snapshotIntervalMs),
  );
};

export const getSnapshotIndexForRenderFrame = (
  frameData: Pick<FrameData, "fps" | "frames" | "snapshotIntervalMs">,
  frame: number,
): number => {
  const renderTimeMs = (Math.max(0, frame) / frameData.fps) * 1000;

  return getSnapshotIndexForElapsedMs(frameData, renderTimeMs);
};

export const getSnapshotForElapsedMs = (
  frameData: Pick<FrameData, "frames" | "snapshotIntervalMs">,
  elapsedMs: number,
): FrameSnapshot | undefined => {
  const snapshotIndex = getSnapshotIndexForElapsedMs(frameData, elapsedMs);

  return snapshotIndex === -1 ? undefined : frameData.frames[snapshotIndex];
};

export const getSnapshotForRenderFrame = (
  frameData: Pick<FrameData, "fps" | "frames" | "snapshotIntervalMs">,
  frame: number,
): FrameSnapshot | undefined => {
  const snapshotIndex = getSnapshotIndexForRenderFrame(frameData, frame);

  return snapshotIndex === -1 ? undefined : frameData.frames[snapshotIndex];
};
