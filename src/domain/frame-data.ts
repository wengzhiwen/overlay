import type { ActivityMetrics } from "./metrics.js";

export type FrameSnapshot = {
  frame: number;
  elapsedMs: number;
  metrics: ActivityMetrics;
  position?: {
    lat: number;
    lon: number;
  };
  clockTimeIso?: string;
};

export type FrameData = {
  fps: number;
  durationInFrames: number;
  frames: FrameSnapshot[];
};
