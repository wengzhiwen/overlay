import { Composition, getInputProps } from "remotion";

import { defaultOverlayConfig } from "../config/defaults.js";
import type { OverlayConfig } from "../config/schema.js";
import type { ActivityZone } from "../domain/activity.js";
import { SNAPSHOT_INTERVAL_MS } from "../domain/frame-data.js";
import { OverlayComposition } from "./compositions/OverlayComposition.js";

export type FrameDataMeta = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  snapshotIntervalMs: number;
  heartRateZones: ActivityZone[];
  activityDurationMs: number;
};

export type RemotionInputProps = {
  frameDataMeta: FrameDataMeta;
  overlayConfig: OverlayConfig;
};

const DEFAULT_FRAME_DATA_META: FrameDataMeta = {
  width: defaultOverlayConfig.render.width,
  height: defaultOverlayConfig.render.height,
  fps: defaultOverlayConfig.render.fps,
  durationInFrames: 1,
  snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
  heartRateZones: [],
  activityDurationMs: 0,
};

const getCompositionProps = (): RemotionInputProps => {
  const inputProps = getInputProps() as Partial<RemotionInputProps>;

  return {
    overlayConfig: inputProps.overlayConfig ?? defaultOverlayConfig,
    frameDataMeta: inputProps.frameDataMeta ?? DEFAULT_FRAME_DATA_META,
  };
};

export const Root = () => {
  const props = getCompositionProps();

  return (
    <Composition
      id="OverlayComposition"
      component={OverlayComposition}
      width={props.frameDataMeta.width}
      height={props.frameDataMeta.height}
      fps={props.frameDataMeta.fps}
      durationInFrames={props.frameDataMeta.durationInFrames}
      defaultProps={props}
    />
  );
};
