import { describe, expect, it } from "vitest";

import { defaultOverlayConfig } from "../src/config/defaults.js";
import type { Activity } from "../src/domain/activity.js";
import {
  SNAPSHOT_INTERVAL_MS,
  getSnapshotForElapsedMs,
  getSnapshotForRenderFrame,
} from "../src/domain/frame-data.js";
import { buildFrameData } from "../src/preprocess/build-frame-data.js";

const activity: Activity = {
  id: "test-activity",
  source: {
    filePath: "/tmp/test.tcx",
    format: "tcx",
  },
  sportType: "ride",
  startedAt: "2026-03-25T09:16:45.000Z",
  timezone: "UTC",
  warnings: [],
  zones: {
    heartRate: [],
    power: [],
    cadence: [],
  },
  summary: {
    durationMs: 2000,
    distanceM: 20,
    ascentM: 3,
  },
  samples: [
    {
      timestampMs: Date.parse("2026-03-25T09:16:45.000Z"),
      elapsedMs: 0,
      lat: undefined,
      lon: undefined,
      altitudeM: 10,
      distanceM: 0,
      speedMps: 0,
      heartRateBpm: 100,
      ascentM: 0,
      gradePct: 0,
      cadenceRpm: 80,
      powerW: 120,
    },
    {
      timestampMs: Date.parse("2026-03-25T09:16:46.000Z"),
      elapsedMs: 1000,
      lat: undefined,
      lon: undefined,
      altitudeM: 12,
      distanceM: 10,
      speedMps: 10,
      heartRateBpm: 110,
      ascentM: 2,
      gradePct: 20,
      cadenceRpm: 85,
      powerW: 140,
    },
    {
      timestampMs: Date.parse("2026-03-25T09:16:47.000Z"),
      elapsedMs: 2000,
      lat: undefined,
      lon: undefined,
      altitudeM: 13,
      distanceM: 20,
      speedMps: 10,
      heartRateBpm: 120,
      ascentM: 3,
      gradePct: 10,
      cadenceRpm: 90,
      powerW: 150,
    },
  ],
};

describe("buildFrameData", () => {
  it("builds 1Hz frame snapshots and reuses them within the same second", async () => {
    const frameData = await buildFrameData(activity, {
      ...defaultOverlayConfig,
      render: {
        ...defaultOverlayConfig.render,
        fps: 2,
        durationStrategy: "activity",
      },
    });

    expect(frameData.durationInFrames).toBe(4);
    expect(frameData.snapshotIntervalMs).toBe(SNAPSHOT_INTERVAL_MS);
    expect(frameData.frames).toHaveLength(2);
    expect(frameData.frames[1]?.metrics.distanceM).toBe(10);
    expect(frameData.frames[1]?.clockTimeIso).toBe("2026-03-25T09:16:46.000Z");
    expect(frameData.elevationHistory).toHaveLength(3);
    expect(frameData.elevationHistory[1]?.altitudeM).toBe(12);
    expect(frameData.elevationHistory[2]?.altitudeM).toBe(13);
    expect(getSnapshotForRenderFrame(frameData, 0)?.metrics.distanceM).toBe(0);
    expect(getSnapshotForRenderFrame(frameData, 1)?.metrics.distanceM).toBe(0);
    expect(getSnapshotForRenderFrame(frameData, 2)?.metrics.distanceM).toBe(10);
    expect(getSnapshotForElapsedMs(frameData, 1500)?.metrics.heartRateBpm).toBe(110);
  });

  it("caps the render duration when sample mode is enabled", async () => {
    const frameData = await buildFrameData(
      activity,
      {
        ...defaultOverlayConfig,
        render: {
          ...defaultOverlayConfig.render,
          fps: 2,
          durationStrategy: "activity",
        },
      },
      {
        maxDurationMs: 1000,
      },
    );

    expect(frameData.durationInFrames).toBe(2);
    expect(frameData.frames).toHaveLength(1);
    expect(frameData.frames.at(-1)?.elapsedMs).toBe(0);
  });

  it("supports an elapsed offset for continued timing across split segments", async () => {
    const frameData = await buildFrameData(
      activity,
      {
        ...defaultOverlayConfig,
        render: {
          ...defaultOverlayConfig.render,
          fps: 1,
          durationStrategy: "activity",
        },
      },
      {
        elapsedOffsetMs: 601_000,
      },
    );

    expect(frameData.frames[0]?.elapsedMs).toBe(0);
    expect(frameData.frames[0]?.displayElapsedMs).toBe(601_000);
    expect(frameData.frames[1]?.displayElapsedMs).toBe(602_000);
  });
});
