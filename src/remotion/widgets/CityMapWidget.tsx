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

// 1×1 transparent RGBA pixel, used to synchronously register a fallback for
// missing sprite icons so MapLibre does not log console warnings.
const TRANSPARENT_1X1 = { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) };

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

  // initHandle: holds render until map is loaded and source/layer are added.
  // Created once with useState so it persists across re-renders.
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

    // Synchronously register a transparent 1×1 fallback for every missing
    // sprite icon to suppress "Image X could not be loaded" console warnings.
    map.on("styleimagemissing", (e: { id: string }) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, TRANSPARENT_1X1);
      }
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

    map.on("error", () => {
      continueRender(initHandle);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Frame update effect: runs each time frame.elapsedMs changes.
  // Creates a fresh delayRender handle per run so Remotion waits for the
  // map to reflect the correct frame data before screenshotting.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      // Map not ready yet — initHandle is still blocking; nothing to do here.
      return;
    }

    const handle = delayRender(`CityMap frame: ${config.id}`);
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        continueRender(handle);
      }
    };

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) {
      release();
      return release;
    }

    const geojson = buildRouteGeoJSON(frameData.frames, frame.elapsedMs);
    source.setData(geojson as ReturnType<typeof buildRouteGeoJSON>);

    const visible = buildVisibleCoordinates(frameData.frames, frame.elapsedMs);
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

    map.once("idle", release);
    map.once("error", release);

    // Cleanup: if this effect re-runs before idle fires, release the old handle.
    return release;
  }, [frame.elapsedMs, mapReady, frameData.frames, lineWidth]);

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
