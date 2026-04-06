import type { CSSProperties, ReactNode } from "react";

import type { WidgetConfig } from "../../config/schema.js";
import type { BaseWidgetProps } from "./WidgetShell.js";
import {
  buildNoodleMapSegments,
  buildProjectedTrack,
  getNoodleMapSafePadding,
  getNoodleMapStrokeWidth,
} from "./noodleMapShared.js";

type NoodleMapWidgetConfig = Extract<WidgetConfig, { type: "noodlemap" }>;

const getLabelHeight = (config: NoodleMapWidgetConfig): number => {
  return config.showLabel ? Math.round(config.labelFontSize * 1.6) : 0;
};

export const NoodleMapWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<NoodleMapWidgetConfig>): ReactNode => {
  const labelHeight = getLabelHeight(config);
  const innerWidth = Math.max(1, config.width - config.padding * 2);
  const innerHeight = Math.max(
    1,
    config.height - config.padding * 2 - labelHeight,
  );
  const projectedTrack = buildProjectedTrack(frameData.frames, frame.elapsedMs);
  const strokeWidth = getNoodleMapStrokeWidth(config.lineWeight, innerWidth);
  const mapCornerRadius = Math.max(8, config.borderRadius - config.padding / 2);
  const safePadding = getNoodleMapSafePadding(mapCornerRadius, strokeWidth, {
    width: innerWidth,
    height: innerHeight,
  });
  const segments = buildNoodleMapSegments(projectedTrack, {
    width: innerWidth,
    height: innerHeight,
    padding: safePadding,
  });
  const pointRadius = Math.max(strokeWidth * 0.8, 2);

  const containerStyle: CSSProperties = {
    position: "absolute",
    left: config.x,
    top: config.y,
    width: config.width,
    height: config.height,
    opacity: isEmpty ? config.opacity * 0.3 : config.opacity,
    padding: config.padding,
    backgroundColor: config.backgroundColor,
    borderColor: config.borderColor,
    borderWidth: config.borderWidth,
    borderStyle: "solid",
    borderRadius: config.borderRadius,
    boxSizing: "border-box",
    fontFamily: config.fontFamily ?? theme.fontFamily,
    color: config.labelColor ?? theme.colors.secondary,
    display: "flex",
    flexDirection: "column",
    backdropFilter: "blur(10px)",
  };

  const labelStyle: CSSProperties = {
    fontSize: config.labelFontSize,
    color: config.labelColor ?? theme.colors.secondary,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    marginBottom: labelHeight > 0 ? 8 : 0,
  };

  const mapFrameStyle: CSSProperties = {
    position: "relative",
    width: innerWidth,
    height: innerHeight,
    overflow: "hidden",
    borderRadius: mapCornerRadius,
  };

  return (
    <div style={containerStyle}>
      {config.showLabel ? <div style={labelStyle}>Noodle Map</div> : null}
      <div style={mapFrameStyle}>
        <svg width={innerWidth} height={innerHeight} viewBox={`0 0 ${innerWidth} ${innerHeight}`}>
          {segments.map((segment, index) => {
            const [firstPoint, ...remainingPoints] = segment.points;
            const polylinePoints = segment.points
              .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
              .join(" ");

            return (
              <g key={`${index}-${segment.points.length}`}>
                {remainingPoints.length > 0 ? (
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke={config.lineColor}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={strokeWidth}
                  />
                ) : null}
                {firstPoint ? (
                  <circle
                    cx={firstPoint.x}
                    cy={firstPoint.y}
                    r={pointRadius}
                    fill={config.lineColor}
                    opacity={segment.startsAfterGap || remainingPoints.length === 0 ? 1 : 0.9}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
