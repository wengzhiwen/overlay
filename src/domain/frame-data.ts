import type { ActivityMetrics } from "./metrics.js";

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
  frames: FrameSnapshot[];
};
