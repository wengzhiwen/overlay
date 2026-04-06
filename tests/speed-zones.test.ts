import { describe, expect, it } from "vitest";

import { OverlayConfigSchema } from "../src/config/schema.js";
import {
  getDefaultSpeedZoneThresholds,
  resolveSpeedZones,
} from "../src/remotion/widgets/speedShared.js";

describe("speed widget zones", () => {
  it("converts default 5-zone thresholds to mph", () => {
    const thresholds = getDefaultSpeedZoneThresholds("mph");

    expect(thresholds[0]).toBeCloseTo(12.43, 2);
    expect(thresholds[1]).toBeCloseTo(15.53, 2);
    expect(thresholds[2]).toBeCloseTo(18.64, 2);
    expect(thresholds[3]).toBeCloseTo(21.75, 2);
  });

  it("builds five default zones from thresholds", () => {
    const zones = resolveSpeedZones([], [20, 25, 30, 35], "km/h");

    expect(zones).toHaveLength(5);
    expect(zones[0]).toMatchObject({ max: 20, color: "#60a5fa" });
    expect(zones[1]).toMatchObject({ min: 20, max: 25, color: "#34d399" });
    expect(zones[2]).toMatchObject({ min: 25, max: 30, color: "#fbbf24" });
    expect(zones[3]).toMatchObject({ min: 30, max: 35, color: "#fb923c" });
    expect(zones[4]).toMatchObject({ min: 35, color: "#f87171" });
  });

  it("applies speed widget chart defaults in config parsing", () => {
    const config = OverlayConfigSchema.parse({
      render: {},
      widgets: [
        {
          id: "speed-main",
          type: "speed",
        },
      ],
    });

    const widget = config.widgets[0];

    expect(widget.type).toBe("speed");

    if (widget.type !== "speed") {
      throw new Error("Expected speed widget");
    }

    expect(widget.showChart).toBe("auto");
    expect(widget.chartRange).toBe("medium");
    expect(widget.colorByZone).toBe(false);
    expect(widget.zones).toEqual([]);
    expect(widget.zoneThresholds).toBeUndefined();
  });
});
