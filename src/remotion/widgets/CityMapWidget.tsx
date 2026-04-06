import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import maplibregl from "maplibre-gl";

import type { WidgetConfig } from "../../config/schema.js";
import type { BaseWidgetProps } from "./WidgetShell.js";
import {
  buildRouteGeoJSON,
  buildVisibleCoordinates,
  computeBounds,
  getCityMapLineWidth,
} from "./cityMapShared.js";
import type { NoodleMapWeight } from "./noodleMapShared.js";

type CityMapWidgetConfig = Extract<WidgetConfig, { type: "citymap" }>;

const getLabelHeight = (config: CityMapWidgetConfig): number => {
  return config.showLabel ? Math.round(config.labelFontSize * 1.6) : 0;
};

const SOURCE_ID = "route";
const LAYER_ID = "route-line";

export const CityMapWidget = ({
  frame,
  frameData,
  config,
  theme,
  isEmpty,
}: BaseWidgetProps<CityMapWidgetConfig>): ReactNode => {
  const labelHeight = getLabelHeight(config);
  const innerWidth = Math.max(1, config.width - config.padding * 2);
  const innerHeight = Math.max(
    1,
    config.height - config.padding * 2 - labelHeight,
  );
  const mapCornerRadius = Math.max(8, config.borderRadius - config.padding / 2);
  const lineWidth = getCityMapLineWidth(
    config.lineWeight as NoodleMapWeight,
    innerWidth,
  );

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map once
  const [initHandle] = useState(() =>
    delayRender(`CityMap init: ${config.id}`),
  );

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) {
      continueRender(initHandle);
      return;
    }

    const map = new maplibregl.Map({
      container,
      style: config.mapStyle,
      interactive: false,
      fadeDuration: 0,
      attributionControl: false,
      center: [0, 0],
      zoom: 1,
    });

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });

      map.addLayer({
        id: LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": config.lineColor,
          "line-width": lineWidth,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      mapRef.current = map;
      setMapReady(true);
      continueRender(initHandle);
    });

    // Suppress warnings for missing POI sprite icons (common with OpenFreeMap styles)
    map.on("styleimagemissing", () => {
      // no-op: the style references icons not included in the sprite sheet
    });

    map.on("error", () => {
      continueRender(initHandle);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update route and camera on each frame
  const [frameHandle] = useState(() =>
    delayRender(`CityMap frame: ${config.id}`),
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      continueRender(frameHandle);
      return;
    }

    const geojson = buildRouteGeoJSON(frameData.frames, frame.elapsedMs);
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
    if (!source) {
      continueRender(frameHandle);
      return;
    }

    source.setData(geojson as ReturnType<typeof buildRouteGeoJSON>);

    const visible = buildVisibleCoordinates(
      frameData.frames,
      frame.elapsedMs,
    );
    const allCoords = visible.map((v) => v.lonLat);
    const bounds = computeBounds(allCoords);

    if (bounds) {
      const lngLatBounds = new maplibregl.LngLatBounds(bounds.sw, bounds.ne);
      map.fitBounds(lngLatBounds, {
        padding: Math.max(lineWidth, 20),
        duration: 0,
        maxZoom: 17,
      });
    }

    map.once("idle", () => {
      continueRender(frameHandle);
    });

    map.once("error", () => {
      continueRender(frameHandle);
    });
  }, [frame.elapsedMs, mapReady, frameData.frames, lineWidth, frameHandle]);

  const isWithoutBgc = config.style === "without-bgc";
  const resolvedLabelColor = config.labelColor ?? theme.colors.secondary;

  const containerStyle: CSSProperties = {
    position: "absolute",
    left: config.x,
    top: config.y,
    width: config.width,
    height: config.height,
    opacity: isEmpty ? config.opacity * 0.3 : config.opacity,
    padding: config.padding,
    backgroundColor: isWithoutBgc ? "transparent" : config.backgroundColor,
    borderColor: isWithoutBgc ? "transparent" : config.borderColor,
    borderWidth: isWithoutBgc ? 0 : config.borderWidth,
    borderStyle: "solid",
    borderRadius: config.borderRadius,
    boxSizing: "border-box",
    fontFamily: config.fontFamily ?? theme.fontFamily,
    color: resolvedLabelColor,
    display: "flex",
    flexDirection: "column",
    backdropFilter: isWithoutBgc ? undefined : "blur(10px)",
  };

  const labelStyle: CSSProperties = {
    fontSize: config.labelFontSize,
    color: resolvedLabelColor,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
    marginBottom: labelHeight > 0 ? 8 : 0,
  };

  const mapFrameStyle: CSSProperties = {
    position: "relative",
    width: innerWidth,
    height: innerHeight,
    overflow: "hidden",
    borderRadius: mapCornerRadius,
  };

  const mapInnerStyle: CSSProperties = {
    width: innerWidth,
    height: innerHeight,
  };

  return (
    <div style={containerStyle}>
      {config.showLabel ? <div style={labelStyle}>City Map</div> : null}
      <div style={mapFrameStyle}>
        <div ref={mapContainerRef} style={mapInnerStyle} />
      </div>
    </div>
  );
};
