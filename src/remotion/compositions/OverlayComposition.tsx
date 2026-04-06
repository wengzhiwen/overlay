import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from "remotion";

import type { OverlayConfig, WidgetConfig } from "../../config/schema.js";
import {
  getSnapshotForRenderFrame,
  type FrameData,
  type FrameSnapshot,
} from "../../domain/frame-data.js";
import type { FrameDataMeta } from "../Root.js";
import { defaultTheme, mergeThemeWithConfig } from "../theme/default.js";
import { DistanceWidget } from "../widgets/DistanceWidget.js";
import { ElevationWidget } from "../widgets/ElevationWidget.js";
import { HeartRateWidget } from "../widgets/HeartRateWidget.js";
import { NoodleMapWidget } from "../widgets/NoodleMapWidget.js";
import { SpeedWidget } from "../widgets/SpeedWidget.js";
import { TimeWidget } from "../widgets/TimeWidget.js";
import { hasGpsTrack } from "../widgets/noodleMapShared.js";

const FRAME_DATA_URL = "/frame-data.json";

export type OverlayCompositionProps = {
  frameDataMeta: FrameDataMeta;
  overlayConfig: OverlayConfig;
};

const renderWidget = (
  widget: WidgetConfig,
  frameData: FrameData,
  frameIndex: number,
  overlayConfig: OverlayConfig,
) => {
  const frame = getSnapshotForRenderFrame(frameData, frameIndex);
  const theme = mergeThemeWithConfig(defaultTheme, overlayConfig.theme);

  if (!frame || !widget.enabled) {
    return null;
  }

  if (widget.type === "noodlemap" && !hasGpsTrack(frameData.frames)) {
    return null;
  }

  const isEmpty = frame?.isDataGap ?? false;
  const baseProps = { frame, frameData, theme, isEmpty };

  switch (widget.type) {
    case "speed":
      return <SpeedWidget key={widget.id} {...baseProps} config={widget} />;
    case "heart-rate":
      return <HeartRateWidget key={widget.id} {...baseProps} config={widget} />;
    case "elevation":
      return <ElevationWidget key={widget.id} {...baseProps} config={widget} />;
    case "distance":
      return <DistanceWidget key={widget.id} {...baseProps} config={widget} />;
    case "time":
      return <TimeWidget key={widget.id} {...baseProps} config={widget} />;
    case "noodlemap":
      return <NoodleMapWidget key={widget.id} {...baseProps} config={widget} />;
    default:
      return null;
  }
};

export const OverlayComposition = ({
  frameDataMeta,
  overlayConfig,
}: OverlayCompositionProps) => {
  const frame = useCurrentFrame();
  const [frames, setFrames] = useState<FrameSnapshot[] | null>(null);

  const [delayHandle] = useState(() => delayRender("Loading frame data from file"));

  useEffect(() => {
    fetch(FRAME_DATA_URL)
      .then((res) => res.json() as Promise<FrameSnapshot[]>)
      .then((data) => {
        setFrames(data);
        continueRender(delayHandle);
      })
      .catch((err: unknown) => {
        console.error("Failed to load frame data:", err);
        continueRender(delayHandle);
      });
  }, [delayHandle]);

  if (frames === null) {
    return <AbsoluteFill style={{ backgroundColor: "transparent" }} />;
  }

  const frameData: FrameData = {
    ...frameDataMeta,
    frames,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {overlayConfig.widgets.map((widget) =>
        renderWidget(widget, frameData, frame, overlayConfig),
      )}
    </AbsoluteFill>
  );
};
