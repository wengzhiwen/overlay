import type { CSSProperties, ReactNode } from "react";

import type { WidgetConfig } from "../../config/schema.js";
import type { BaseWidgetProps } from "./WidgetShell.js";
import {
  convertSpeedMpsToUnit,
  resolveSpeedZones,
} from "./speedShared.js";
import {
  computeGaugeMax,
  computeTickMarks,
  describeArc,
  GAUGE_CX,
  GAUGE_CY,
  GAUGE_END_DEG,
  GAUGE_RADIUS,
  GAUGE_START_DEG,
  polarToCartesian,
  speedToAngle,
  VB_HEIGHT,
  VB_WIDTH,
} from "./speedGaugeShared.js";

type SpeedGaugeWidgetConfig = Extract<WidgetConfig, { type: "speed-gauge" }>;

const formatSpeed = (
  value: number | undefined,
  config: SpeedGaugeWidgetConfig,
): string => {
  if (value === undefined) {
    return "--";
  }

  return convertSpeedMpsToUnit(value, config.unit).toFixed(config.precision);
};

// Simple decorative mini-gauges on each side to fill the 5:3 wings.
const SideMiniGauges = ({
  side,
  bezelColor,
  accentColor,
  dialColor,
}: {
  side: "left" | "right";
  bezelColor: string;
  accentColor: string;
  dialColor: string;
}): ReactNode => {
  const baseX = side === "left" ? 72 : 428;
  const miniR = 26;

  return (
    <g opacity={0.45}>
      {[125, 205].map((cy) => (
        <g key={cy}>
          <circle
            cx={baseX} cy={cy} r={miniR}
            fill={dialColor} opacity={0.6}
          />
          <circle
            cx={baseX} cy={cy} r={miniR}
            fill="none" stroke={bezelColor} strokeWidth={1.2}
          />
          <circle
            cx={baseX} cy={cy} r={miniR - 4}
            fill="none" stroke={bezelColor} strokeWidth={0.4} opacity={0.5}
          />
          {/* Decorative mini pointer (static) */}
          <line
            x1={baseX} y1={cy}
            x2={baseX + (side === "left" ? -miniR + 6 : miniR - 6)}
            y2={cy - 8}
            stroke={accentColor} strokeWidth={0.8} strokeLinecap="round"
          />
          <circle cx={baseX} cy={cy} r={2} fill={accentColor} opacity={0.7} />
        </g>
      ))}
    </g>
  );
};

export const SpeedGaugeWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<SpeedGaugeWidgetConfig>): ReactNode => {
  const gaugeMax = computeGaugeMax(
    frameData.maxSpeed10sAvgMps,
    config.unit,
  );
  const currentSpeedMps = frame.metrics.speedMps;
  const currentSpeed =
    currentSpeedMps !== undefined
      ? convertSpeedMpsToUnit(currentSpeedMps, config.unit)
      : undefined;
  const needleAngle =
    currentSpeed !== undefined
      ? speedToAngle(currentSpeed, gaugeMax)
      : GAUGE_START_DEG;

  const ticks = computeTickMarks(gaugeMax);
  const cx = GAUGE_CX;
  const cy = GAUGE_CY;
  const r = GAUGE_RADIUS;

  // Arc rendering radii.
  const arcR = r - 8;
  const outerBezelR = r + 6;
  const innerBezelR = r + 1;
  const tickOuterR = r - 3;
  const majorTickInnerR = r - 20;
  const minorTickInnerR = r - 12;
  const labelR = r - 30;

  // Zone-colored arcs.
  const zoneArcs = config.colorByZone
    ? resolveSpeedZones(config.zones, config.zoneThresholds, config.unit)
        .map((zone) => {
          const zoneMin = zone.min === Number.NEGATIVE_INFINITY ? 0 : zone.min;
          const zoneMax =
            zone.max === Number.POSITIVE_INFINITY ? gaugeMax : zone.max;
          if (zoneMin >= gaugeMax || zoneMax <= 0) {
            return null;
          }
          const clampedMin = Math.max(0, zoneMin);
          const clampedMax = Math.min(gaugeMax, zoneMax);
          if (clampedMin >= clampedMax) {
            return null;
          }
          const startAngle = speedToAngle(clampedMin, gaugeMax);
          const endAngle = speedToAngle(clampedMax, gaugeMax);
          return (
            <path
              key={`zone-${zoneMin}-${zoneMax}`}
              d={describeArc(cx, cy, arcR, startAngle, endAngle)}
              fill="none"
              stroke={zone.color}
              strokeWidth={6}
              strokeLinecap="butt"
            />
          );
        })
        .filter(Boolean)
    : null;

  // Determine resolved colors.
  const bezelColor = config.bezelColor;
  const accentColor = config.accentColor;
  const needleColor = config.needleColor;
  const dialColor = config.dialColor;
  const tickLabelColor = config.tickLabelColor;
  const resolvedValueColor = config.valueColor ?? theme.colors.text;
  const resolvedUnitColor = config.unitColor ?? theme.colors.secondary;

  const isWithoutBgc = config.style === "without-bgc";

  const valueFontSize = 28;
  const unitFontSize = 10;

  const containerStyle: CSSProperties = {
    position: "absolute",
    left: config.x,
    top: config.y,
    width: config.width,
    height: config.height,
    opacity: isEmpty ? config.opacity * 0.3 : config.opacity,
    boxSizing: "border-box",
    fontFamily: config.fontFamily ?? theme.fontFamily,
  };

  const needleLength = r - 18;
  const needleTailLength = 16;

  const glowFilterId = `gauge-glow-${config.id}`;

  return (
    <div style={containerStyle}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {isWithoutBgc ? (
          <defs>
            <filter id={glowFilterId} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={0.8} />
            </filter>
          </defs>
        ) : null}

        {/* Side mini-gauge decorations */}
        <SideMiniGauges side="left" bezelColor={bezelColor} accentColor={accentColor} dialColor={dialColor} />
        <SideMiniGauges side="right" bezelColor={bezelColor} accentColor={accentColor} dialColor={dialColor} />

        {/* Outer bezel ring */}
        <circle
          cx={cx} cy={cy} r={outerBezelR}
          fill="none" stroke={bezelColor} strokeWidth={4} opacity={0.7}
        />
        <circle
          cx={cx} cy={cy} r={innerBezelR}
          fill="none" stroke={bezelColor} strokeWidth={1} opacity={0.4}
        />

        {/* Dial background */}
        <circle
          cx={cx} cy={cy} r={r}
          fill={dialColor} opacity={0.85}
        />

        {/* Inner decorative ring */}
        <circle
          cx={cx} cy={cy} r={r - 35}
          fill="none" stroke={bezelColor} strokeWidth={0.5} opacity={0.3}
        />

        {/* Arc track (background) */}
        <path
          d={describeArc(cx, cy, arcR, GAUGE_START_DEG, GAUGE_END_DEG)}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={6}
          strokeLinecap="round"
        />

        {/* Zone-colored or single-color arc */}
        {config.colorByZone && zoneArcs ? (
          zoneArcs
        ) : (
          <path
            d={describeArc(cx, cy, arcR, GAUGE_START_DEG, needleAngle)}
            fill="none"
            stroke={accentColor}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.85}
          />
        )}

        {/* Tick marks and labels */}
        {ticks.map((tick) => {
          const outer = polarToCartesian(cx, cy, tickOuterR, tick.angle);
          const inner = polarToCartesian(
            cx, cy,
            tick.isMajor ? majorTickInnerR : minorTickInnerR,
            tick.angle,
          );
          const labelPos = tick.isMajor
            ? polarToCartesian(cx, cy, labelR, tick.angle)
            : null;

          return (
            <g key={`tick-${tick.value}`}>
              <line
                x1={inner.x} y1={inner.y}
                x2={outer.x} y2={outer.y}
                stroke={tickLabelColor}
                strokeWidth={tick.isMajor ? 1.5 : 0.8}
                opacity={tick.isMajor ? 0.9 : 0.5}
              />
              {labelPos ? (
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fontWeight={500}
                  fill={tickLabelColor}
                  fontFamily={config.fontFamily ?? theme.fontFamily}
                >
                  {tick.value}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Needle */}
        <g transform={`rotate(${needleAngle}, ${cx}, ${cy})`}>
          <line
            x1={cx} y1={cy - needleLength}
            x2={cx} y2={cy + needleTailLength}
            stroke={needleColor}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <circle
            cx={cx} cy={cy - needleLength}
            r={2}
            fill={needleColor}
          />
        </g>

        {/* Center cap */}
        <circle cx={cx} cy={cy} r={8} fill={accentColor} opacity={0.9} />
        <circle cx={cx} cy={cy} r={4} fill={dialColor} />

        {/* Digital speed readout */}
        <text
          x={cx} y={cy + 38}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={valueFontSize}
          fontWeight={700}
          fill={resolvedValueColor}
          fontFamily={config.fontFamily ?? theme.fontFamily}
        >
          {formatSpeed(currentSpeedMps, config)}
        </text>
        {config.showUnit ? (
          <text
            x={cx} y={cy + 54}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={unitFontSize}
            fontWeight={500}
            fill={resolvedUnitColor}
            fontFamily={config.fontFamily ?? theme.fontFamily}
            letterSpacing="0.08em"
          >
            {config.unit.toUpperCase()}
          </text>
        ) : null}

        {/* Bottom decorative arc (inner ring accent) */}
        <path
          d={describeArc(cx, cy + 65, 20, 200, 340)}
          fill="none"
          stroke={bezelColor}
          strokeWidth={0.5}
          opacity={0.3}
        />
      </svg>
    </div>
  );
};
