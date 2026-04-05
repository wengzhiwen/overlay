import { Composition, getInputProps } from "remotion";

import { defaultOverlayConfig } from "../config/defaults.js";
import type { OverlayConfig } from "../config/schema.js";
import type { FrameData } from "../domain/frame-data.js";
import { OverlayComposition } from "./compositions/OverlayComposition.js";

export type RemotionInputProps = {
  frameData: FrameData;
  overlayConfig: OverlayConfig;
};

const getCompositionProps = (): RemotionInputProps => {
  const inputProps = getInputProps() as Partial<RemotionInputProps>;

  return {
    overlayConfig: inputProps.overlayConfig ?? defaultOverlayConfig,
    frameData:
      inputProps.frameData ??
      {
        width: defaultOverlayConfig.render.width,
        height: defaultOverlayConfig.render.height,
        fps: defaultOverlayConfig.render.fps,
        durationInFrames: 1,
        frames: [
          {
            frame: 0,
            elapsedMs: 0,
            renderTimeMs: 0,
            isActive: false,
            metrics: {
              speedMps: undefined,
              heartRateBpm: undefined,
              altitudeM: undefined,
              ascentM: undefined,
              distanceM: undefined,
              gradePct: undefined,
              cadenceRpm: undefined,
              powerW: undefined,
            },
            position: undefined,
            clockTimeIso: undefined,
          },
        ],
      },
  };
};

export const Root = () => {
  const props = getCompositionProps();

  return (
    <Composition
      id="OverlayComposition"
      component={OverlayComposition}
      width={props.frameData.width}
      height={props.frameData.height}
      fps={props.frameData.fps}
      durationInFrames={props.frameData.durationInFrames}
      defaultProps={props}
    />
  );
};
