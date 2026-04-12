import type { PositionHistoryPoint } from "../../domain/frame-data.js";
import {
  type NoodleMapWeight,
  getNoodleMapStrokeWidth,
} from "./noodleMapShared.js";

export { hasGpsTrack } from "./noodleMapShared.js";
export type { NoodleMapWeight } from "./noodleMapShared.js";

export const CITYMAP_GAP_THRESHOLD_MS = 20_000;

type GeoJSONPosition = [number, number];

type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: GeoJSONPosition[] | GeoJSONPosition[][];
  };
};

const EMPTY_GEOJSON: GeoJSONFeature = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

export const buildVisibleCoordinates = (
  positionHistory: PositionHistoryPoint[],
  currentDisplayElapsedMs: number,
): Array<{ elapsedMs: number; lonLat: GeoJSONPosition }> => {
  const result: Array<{ elapsedMs: number; lonLat: GeoJSONPosition }> = [];

  for (const point of positionHistory) {
    if (point.displayElapsedMs > currentDisplayElapsedMs) {
      continue;
    }
    result.push({
      elapsedMs: point.displayElapsedMs,
      lonLat: [point.lon, point.lat],
    });
  }

  return result;
};

export const buildRouteGeoJSON = (
  positionHistory: PositionHistoryPoint[],
  currentDisplayElapsedMs: number,
): GeoJSONFeature => {
  const visible = buildVisibleCoordinates(positionHistory, currentDisplayElapsedMs);

  if (visible.length === 0) {
    return EMPTY_GEOJSON;
  }

  if (visible.length === 1) {
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [visible[0]!.lonLat] },
    };
  }

  const segments: GeoJSONPosition[][] = [];
  let currentSegment: GeoJSONPosition[] = [visible[0]!.lonLat];

  for (let index = 1; index < visible.length; index += 1) {
    const prev = visible[index - 1]!;
    const curr = visible[index]!;
    const gapMs = curr.elapsedMs - prev.elapsedMs;

    if (gapMs > CITYMAP_GAP_THRESHOLD_MS) {
      segments.push(currentSegment);
      currentSegment = [curr.lonLat];
    } else {
      currentSegment.push(curr.lonLat);
    }
  }

  segments.push(currentSegment);

  if (segments.length === 1) {
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: segments[0]! },
    };
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiLineString", coordinates: segments },
  };
};

export const computeBounds = (
  coordinates: GeoJSONPosition[],
): { sw: GeoJSONPosition; ne: GeoJSONPosition } | undefined => {
  if (coordinates.length === 0) {
    return undefined;
  }

  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const [lon, lat] of coordinates) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return {
    sw: [minLon, minLat],
    ne: [maxLon, maxLat],
  };
};

export const getCityMapLineWidth = (
  weight: NoodleMapWeight,
  viewportWidth: number,
): number => {
  const strokeWidth = getNoodleMapStrokeWidth(weight, viewportWidth);
  return Math.max(2, Math.round(strokeWidth * 1.5));
};
