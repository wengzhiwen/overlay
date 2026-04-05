import type { Activity } from "../domain/activity.js";
import type { FrameData } from "../domain/frame-data.js";

export const buildFrameData = async (
  _activity: Activity,
  fps: number,
): Promise<FrameData> => {
  return {
    fps,
    durationInFrames: 0,
    frames: [],
  };
};
