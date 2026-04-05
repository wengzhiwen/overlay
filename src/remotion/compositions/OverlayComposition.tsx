import { AbsoluteFill, useCurrentFrame } from "remotion";

import type { OverlayConfig, WidgetConfig } from "../../config/schema.js";
import type { FrameData } from "../../domain/frame-data.js";
import { defaultTheme, mergeThemeWithConfig } from "../theme/default.js";
import { DistanceWidget } from "../widgets/DistanceWidget.js";
import { ElevationWidget } from "../widgets/ElevationWidget.js";
import { HeartRateWidget } from "../widgets/HeartRateWidget.js";
import { SpeedWidget } from "../widgets/SpeedWidget.js";
import { TimeWidget } from "../widgets/TimeWidget.js";

export type OverlayCompositionProps = {
  frameData: FrameData;
  overlayConfig: OverlayConfig;
};

const renderWidget = (
  widget: WidgetConfig,
  frameData: FrameData,
  frameIndex: number,
  overlayConfig: OverlayConfig,
) => {
  const frame = frameData.frames[Math.min(frameIndex, frameData.frames.length - 1)];
  const theme = mergeThemeWithConfig(defaultTheme, overlayConfig.theme);

  if (!frame || !widget.enabled) {
    return null;
  }

  const baseProps = { frame, frameData, theme };

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
    default:
      return null;
  }
};

export const OverlayComposition = ({
  frameData,
  overlayConfig,
}: OverlayCompositionProps) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {overlayConfig.widgets.map((widget) =>
        renderWidget(widget, frameData, frame, overlayConfig),
      )}
    </AbsoluteFill>
  );
};
