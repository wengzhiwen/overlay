import { convertSpeedMpsToUnit, type SpeedUnit } from "./speedShared.js";

// Gauge arc spans from START_DEG to START_DEG + SWEEP_DEG.
// 0 degrees = 12 o'clock, clockwise positive.
// 240 deg = ~8 o'clock position (lower-left), sweeps clockwise to 480 deg (~4 o'clock, lower-right).
export const GAUGE_START_DEG = 240;
export const GAUGE_SWEEP_DEG = 240;
export const GAUGE_END_DEG = GAUGE_START_DEG + GAUGE_SWEEP_DEG;

// Viewbox and gauge center for 5:3 aspect ratio.
export const VB_WIDTH = 500;
export const VB_HEIGHT = 300;
export const GAUGE_CX = 250;
export const GAUGE_CY = 165;
export const GAUGE_RADIUS = 115;

export const polarToCartesian = (
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } => {
  // Offset by -90 so 0 degrees = 12 o'clock (top).
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
};

export const describeArc = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string => {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const sweep = endAngle - startAngle;
  const largeArcFlag = sweep > 180 ? 1 : 0;

  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
  ].join(" ");
};

export const speedToAngle = (
  speed: number,
  maxSpeed: number,
): number => {
  const ratio = maxSpeed > 0 ? Math.max(0, Math.min(1, speed / maxSpeed)) : 0;
  return GAUGE_START_DEG + ratio * GAUGE_SWEEP_DEG;
};

export const computeGaugeMax = (
  maxSpeed10sAvgMps: number | undefined,
  unit: SpeedUnit,
): number => {
  if (maxSpeed10sAvgMps === undefined || maxSpeed10sAvgMps <= 0) {
    return unit === "km/h" ? 60 : 40;
  }

  const maxInUnit = convertSpeedMpsToUnit(maxSpeed10sAvgMps, unit);
  // Round up to nearest 5.
  return Math.ceil(maxInUnit / 5) * 5;
};

export type TickMark = {
  value: number;
  angle: number;
  isMajor: boolean;
};

export const computeTickMarks = (maxSpeed: number): TickMark[] => {
  const ticks: TickMark[] = [];
  const step = maxSpeed > 0 ? 1 : 10;

  for (let value = 0; value <= maxSpeed; value += step) {
    const isMajor = value % 10 === 0;
    const isMinor = value % 5 === 0;
    // Only include major (every 10) and minor (every 5) ticks.
    if (!isMajor && !isMinor) {
      continue;
    }
    ticks.push({
      value,
      angle: speedToAngle(value, maxSpeed),
      isMajor,
    });
  }

  return ticks;
};
