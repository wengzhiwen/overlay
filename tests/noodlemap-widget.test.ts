import { describe, expect, it } from "vitest";

import { OverlayConfigSchema } from "../src/config/schema.js";
import {
  buildNoodleMapSegments,
  buildProjectedTrack,
  getNoodleMapSafePadding,
  getNoodleMapStrokeWidth,
  hasGpsTrack,
  NOODLEMAP_DEFAULT_RANGE_M,
} from "../src/remotion/widgets/noodleMapShared.js";

describe("noodlemap widget", () => {
  it("applies noodlemap defaults in config parsing", () => {
    const config = OverlayConfigSchema.parse({
      render: {},
      widgets: [
        {
          id: "route-main",
          type: "noodlemap",
        },
      ],
    });

    const widget = config.widgets[0];

    expect(widget.type).toBe("noodlemap");

    if (widget.type !== "noodlemap") {
      throw new Error("Expected noodlemap widget");
    }

    expect(widget.showLabel).toBe(false);
    expect(widget.lineColor).toBe("#ffffff");
    expect(widget.lineWeight).toBe("M");
    expect(widget.style).toBe("with-bgc");
    expect(widget.width / widget.height).toBeCloseTo(5 / 3, 2);
  });

  it("detects whether frame data contains any GPS track", () => {
    expect(
      hasGpsTrack([{ position: undefined }, { position: undefined }]),
    ).toBe(false);
    expect(
      hasGpsTrack([
        { position: undefined },
        { position: { lat: 1.3, lon: 103.8 } },
      ]),
    ).toBe(true);
  });

  it("keeps the first point centered until the route needs to pan or scale", () => {
    const positionHistory = [
      {
        displayElapsedMs: 0,
        lat: 1.300000,
        lon: 103.800000,
      },
      {
        displayElapsedMs: 5_000,
        lat: 1.300000,
        lon: 103.809000,
      },
      {
        displayElapsedMs: 10_000,
        lat: 1.300000,
        lon: 103.818000,
      },
    ];
    const projectedTrack = buildProjectedTrack(positionHistory, 10_000);
    const segments = buildNoodleMapSegments(projectedTrack, {
      width: 200,
      height: 120,
    });

    expect(projectedTrack).toHaveLength(3);
    expect(getNoodleMapStrokeWidth("M", 200)).toBeGreaterThan(
      getNoodleMapStrokeWidth("S", 200),
    );
    expect(getNoodleMapStrokeWidth("L", 200)).toBeGreaterThan(
      getNoodleMapStrokeWidth("M", 200),
    );

    const firstPoint = segments[0]?.points[0];
    const lastPoint = segments[0]?.points[2];

    expect(firstPoint?.x).toBeCloseTo(0, 1);
    expect(firstPoint?.y).toBeCloseTo(60, 1);
    expect(lastPoint?.x).toBeLessThanOrEqual(200);
    expect(projectedTrack[2]?.xM).toBeGreaterThan(NOODLEMAP_DEFAULT_RANGE_M);
  });

  it("breaks the route into new segments when the time gap exceeds 20 seconds", () => {
    const positionHistory = [
      {
        displayElapsedMs: 0,
        lat: 1.300000,
        lon: 103.800000,
      },
      {
        displayElapsedMs: 5_000,
        lat: 1.301000,
        lon: 103.801000,
      },
      {
        displayElapsedMs: 30_500,
        lat: 1.302000,
        lon: 103.802000,
      },
    ];
    const projectedTrack = buildProjectedTrack(positionHistory, 30_500);
    const segments = buildNoodleMapSegments(projectedTrack, {
      width: 240,
      height: 140,
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]?.points).toHaveLength(2);
    expect(segments[1]?.points).toHaveLength(1);
    expect(segments[1]?.startsAfterGap).toBe(true);
  });

  it("keeps the full stroke safely inside the visible area when padding is reserved", () => {
    const points = [
      { elapsedMs: 0, xM: 0, yM: 0 },
      { elapsedMs: 1_000, xM: -1_800, yM: -1_100 },
      { elapsedMs: 2_000, xM: 1_600, yM: 900 },
    ];
    const strokeWidth = getNoodleMapStrokeWidth("M", 240);
    const safePadding = getNoodleMapSafePadding(12, strokeWidth, {
      width: 240,
      height: 140,
    });
    const segments = buildNoodleMapSegments(points, {
      width: 240,
      height: 140,
      padding: safePadding,
    });
    const allPoints = segments.flatMap((segment) => segment.points);

    expect(safePadding).toBeGreaterThan(0);
    expect(allPoints.length).toBe(3);

    for (const point of allPoints) {
      expect(point.x).toBeGreaterThanOrEqual(safePadding - 0.001);
      expect(point.x).toBeLessThanOrEqual(240 - safePadding + 0.001);
      expect(point.y).toBeGreaterThanOrEqual(safePadding - 0.001);
      expect(point.y).toBeLessThanOrEqual(140 - safePadding + 0.001);
    }
  });
});
