import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from "remotion";

import type { OverlayConfig, WidgetConfig } from "../../config/schema.js";
import {
  getSnapshotForRenderFrame,
  type FrameData,
  type FrameSnapshot,
} from "../../domain/frame-data.js";
import { defaultTheme, mergeThemeWithConfig } from "../theme/default.js";
import { CityMapWidget } from "../widgets/CityMapWidget.js";
import { CadenceWidget } from "../widgets/CadenceWidget.js";
import { DistanceWidget } from "../widgets/DistanceWidget.js";
import { ElevationWidget } from "../widgets/ElevationWidget.js";
import { HeartRateWidget } from "../widgets/HeartRateWidget.js";
import { NoodleMapWidget } from "../widgets/NoodleMapWidget.js";
import { PowerWidget } from "../widgets/PowerWidget.js";
import { SpeedGaugeWidget } from "../widgets/SpeedGaugeWidget.js";
import { SpeedWidget } from "../widgets/SpeedWidget.js";
import { TimeWidget } from "../widgets/TimeWidget.js";
import type { FrameDataMeta } from "../Root.js";

// Scan all frames once to determine which metrics are present in the activity.
const computeAvailableMetrics = (frames: FrameSnapshot[]): Set<string> => {
  const available = new Set<string>();

  for (const frame of frames) {
    const m = frame.metrics;
    if (m.speedMps !== undefined) available.add("speedMps");
    if (m.heartRateBpm !== undefined) available.add("heartRateBpm");
    if (m.powerW !== undefined) available.add("powerW");
    if (m.cadenceRpm !== undefined) available.add("cadenceRpm");
    if (m.altitudeM !== undefined) available.add("altitudeM");
    if (m.distanceM !== undefined) available.add("distanceM");
    if (frame.position !== undefined) available.add("position");
  }

  return available;
};

// Map each widget type to the metric it requires. Unmapped types (time) always render.
const REQUIRED_METRIC: Record<string, string> = {
  speed: "speedMps",
  "speed-gauge": "speedMps",
  "heart-rate": "heartRateBpm",
  power: "powerW",
  cadence: "cadenceRpm",
  elevation: "altitudeM",
  distance: "distanceM",
};

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
  availableMetrics: Set<string>,
) => {
  const frame = getSnapshotForRenderFrame(frameData, frameIndex);
  const theme = mergeThemeWithConfig(defaultTheme, overlayConfig.theme);

  if (!frame || !widget.enabled) {
    return null;
  }

  // Hide data widgets when their metric is absent from the entire activity.
  const requiredMetric = REQUIRED_METRIC[widget.type];
  if (requiredMetric && !availableMetrics.has(requiredMetric)) {
    return null;
  }

  // Map widgets require GPS position data.
  if ((widget.type === "noodlemap" || widget.type === "citymap") && !availableMetrics.has("position")) {
    return null;
  }

  const isEmpty = frame?.isDataGap ?? false;
  const baseProps = { frame, frameData, theme, isEmpty };

  switch (widget.type) {
    case "speed":
      return <SpeedWidget key={widget.id} {...baseProps} config={widget} />;
    case "speed-gauge":
      return <SpeedGaugeWidget key={widget.id} {...baseProps} config={widget} />;
    case "heart-rate":
      return <HeartRateWidget key={widget.id} {...baseProps} config={widget} />;
    case "power":
      return <PowerWidget key={widget.id} {...baseProps} config={widget} />;
    case "cadence":
      return <CadenceWidget key={widget.id} {...baseProps} config={widget} />;
    case "elevation":
      return <ElevationWidget key={widget.id} {...baseProps} config={widget} />;
    case "distance":
      return <DistanceWidget key={widget.id} {...baseProps} config={widget} />;
    case "time":
      return <TimeWidget key={widget.id} {...baseProps} config={widget} />;
    case "noodlemap":
      return <NoodleMapWidget key={widget.id} {...baseProps} config={widget} />;
    case "citymap":
      return <CityMapWidget key={widget.id} {...baseProps} config={widget} />;
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

  const availableMetrics = computeAvailableMetrics(frames);

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {overlayConfig.widgets.map((widget) =>
        renderWidget(widget, frameData, frame, overlayConfig, availableMetrics),
      )}
    </AbsoluteFill>
  );
};
