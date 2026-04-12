import type { FrameSnapshot, PositionHistoryPoint } from "../../domain/frame-data.js";

export const NOODLEMAP_DEFAULT_RANGE_M = 2_000;
export const NOODLEMAP_GAP_THRESHOLD_MS = 20_000;

const EARTH_RADIUS_M = 6_371_000;

export type NoodleMapWeight = "S" | "M" | "L";

export type NoodleMapPoint = {
  elapsedMs: number;
  xM: number;
  yM: number;
};

export type NoodleMapSegment = {
  points: Array<{ x: number; y: number }>;
  startsAfterGap: boolean;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type FitState = {
  scale: number;
  translateX: number;
  translateY: number;
};

type Viewport = {
  width: number;
  height: number;
  padding?: number;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return (min + max) / 2;
  }

  return Math.min(Math.max(value, min), max);
};

const toRadians = (value: number): number => value * (Math.PI / 180);

const createBounds = (point: NoodleMapPoint): Bounds => ({
  minX: point.xM,
  maxX: point.xM,
  minY: point.yM,
  maxY: point.yM,
});

const expandBounds = (bounds: Bounds, point: NoodleMapPoint): Bounds => ({
  minX: Math.min(bounds.minX, point.xM),
  maxX: Math.max(bounds.maxX, point.xM),
  minY: Math.min(bounds.minY, point.yM),
  maxY: Math.max(bounds.maxY, point.yM),
});

const getFitScale = (
  bounds: Bounds,
  viewport: Viewport,
  maxScale: number,
): number => {
  const padding = viewport.padding ?? 0;
  const drawableWidth = Math.max(1, viewport.width - padding * 2);
  const drawableHeight = Math.max(1, viewport.height - padding * 2);
  const widthM = bounds.maxX - bounds.minX;
  const heightM = bounds.maxY - bounds.minY;
  const scaleX = widthM <= 0 ? Number.POSITIVE_INFINITY : drawableWidth / widthM;
  const scaleY = heightM <= 0 ? Number.POSITIVE_INFINITY : drawableHeight / heightM;

  return Math.min(maxScale, scaleX, scaleY);
};

const clampTransformToBounds = (
  bounds: Bounds,
  viewport: Viewport,
  fitState: FitState,
): FitState => {
  const padding = viewport.padding ?? 0;
  const minTranslateX = padding - bounds.minX * fitState.scale;
  const maxTranslateX = viewport.width - padding - bounds.maxX * fitState.scale;
  const minTranslateY = padding + bounds.maxY * fitState.scale;
  const maxTranslateY = viewport.height - padding + bounds.minY * fitState.scale;

  return {
    ...fitState,
    translateX: clamp(fitState.translateX, minTranslateX, maxTranslateX),
    translateY: clamp(fitState.translateY, minTranslateY, maxTranslateY),
  };
};

const resolveFitState = (
  points: NoodleMapPoint[],
  viewport: Viewport,
): FitState => {
  const padding = viewport.padding ?? 0;
  const drawableWidth = Math.max(1, viewport.width - padding * 2);
  const drawableHeight = Math.max(1, viewport.height - padding * 2);
  const baseScale = drawableWidth / NOODLEMAP_DEFAULT_RANGE_M;
  const initialState: FitState = {
    scale: baseScale,
    translateX: padding + drawableWidth / 2,
    translateY: padding + drawableHeight / 2,
  };

  const firstPoint = points[0];

  if (firstPoint === undefined) {
    return initialState;
  }

  let bounds = createBounds(firstPoint);
  let fitState = clampTransformToBounds(bounds, viewport, initialState);

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];

    if (point === undefined) {
      continue;
    }

    bounds = expandBounds(bounds, point);
    fitState = {
      ...fitState,
      scale: getFitScale(bounds, viewport, baseScale),
    };
    fitState = clampTransformToBounds(bounds, viewport, fitState);
  }

  return fitState;
};

const transformPoint = (
  point: NoodleMapPoint,
  fitState: FitState,
): { x: number; y: number } => ({
  x: point.xM * fitState.scale + fitState.translateX,
  y: fitState.translateY - point.yM * fitState.scale,
});

export const hasGpsTrack = (
  frames: Array<Pick<FrameSnapshot, "position">>,
): boolean => {
  return frames.some((frame) => frame.position !== undefined);
};

export const getNoodleMapStrokeWidth = (
  weight: NoodleMapWeight,
  viewportWidth: number,
): number => {
  const normalizedWidth = Math.max(160, viewportWidth);
  const strokeWidthByWeight: Record<NoodleMapWeight, number> = {
    S: normalizedWidth * 0.008,
    M: normalizedWidth * 0.012,
    L: normalizedWidth * 0.016,
  };

  return Number(strokeWidthByWeight[weight].toFixed(2));
};

export const getNoodleMapSafePadding = (
  cornerRadius: number,
  strokeWidth: number,
  viewport: Pick<Viewport, "width" | "height">,
): number => {
  const requestedPadding = Math.ceil(Math.max(cornerRadius + strokeWidth / 2, strokeWidth) + 2);
  const maxPadding = Math.max(0, Math.floor(Math.min(viewport.width, viewport.height) / 2) - 1);

  return Math.min(requestedPadding, maxPadding);
};

export const buildProjectedTrack = (
  positionHistory: PositionHistoryPoint[],
  currentDisplayElapsedMs: number,
): NoodleMapPoint[] => {
  const visible = positionHistory.filter(
    (point) =>
      point.displayElapsedMs <= currentDisplayElapsedMs,
  );
  const first = visible[0];

  if (first === undefined) {
    return [];
  }

  const originLatRad = toRadians(first.lat);
  const originLonRad = toRadians(first.lon);

  return visible.map((point) => {
    const latRad = toRadians(point.lat);
    const lonRad = toRadians(point.lon);
    const averageLat = (latRad + originLatRad) / 2;

    return {
      elapsedMs: point.displayElapsedMs,
      xM: (lonRad - originLonRad) * EARTH_RADIUS_M * Math.cos(averageLat),
      yM: (latRad - originLatRad) * EARTH_RADIUS_M,
    };
  });
};

export const buildNoodleMapSegments = (
  points: NoodleMapPoint[],
  viewport: Viewport,
): NoodleMapSegment[] => {
  if (points.length === 0) {
    return [];
  }

  const fitState = resolveFitState(points, viewport);
  const segments: NoodleMapSegment[] = [];
  let currentSegment: NoodleMapSegment | undefined;
  let previousPoint: NoodleMapPoint | undefined;

  for (const point of points) {
    const transformedPoint = transformPoint(point, fitState);
    const startsAfterGap =
      previousPoint !== undefined &&
      point.elapsedMs - previousPoint.elapsedMs > NOODLEMAP_GAP_THRESHOLD_MS;

    if (currentSegment === undefined || startsAfterGap) {
      currentSegment = {
        points: [transformedPoint],
        startsAfterGap: previousPoint !== undefined,
      };
      segments.push(currentSegment);
    } else {
      currentSegment.points.push(transformedPoint);
    }

    previousPoint = point;
  }

  return segments;
};
