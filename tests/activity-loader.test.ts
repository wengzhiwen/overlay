import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadActivity } from "../src/parsers/activity-loader.js";
import { fillShortGaps } from "../src/preprocess/fill-gaps.js";
import { detectGaps } from "../src/preprocess/detect-gaps.js";
import { normalizeActivity } from "../src/preprocess/normalize.js";
import { splitActivityAtLongGaps } from "../src/preprocess/split-activity.js";

const MINIMAL_TCX_WITH_LONG_GAP = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
    <Activity Sport="Biking">
      <Id>2026-01-01T00:00:00Z</Id>
      <Lap StartTime="2026-01-01T00:00:00Z">
        <TotalTimeSeconds>133</TotalTimeSeconds>
        <DistanceMeters>2300</DistanceMeters>
        <Track>
          <Trackpoint>
            <Time>2026-01-01T00:00:00Z</Time>
            <Position>
              <LatitudeDegrees>1.3000</LatitudeDegrees>
              <LongitudeDegrees>103.8000</LongitudeDegrees>
            </Position>
            <AltitudeMeters>10</AltitudeMeters>
            <DistanceMeters>0</DistanceMeters>
            <HeartRateBpm>
              <Value>120</Value>
            </HeartRateBpm>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-01-01T00:00:04Z</Time>
            <Position>
              <LatitudeDegrees>1.3004</LatitudeDegrees>
              <LongitudeDegrees>103.8004</LongitudeDegrees>
            </Position>
            <AltitudeMeters>11</AltitudeMeters>
            <DistanceMeters>400</DistanceMeters>
            <HeartRateBpm>
              <Value>121</Value>
            </HeartRateBpm>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-01-01T00:02:10Z</Time>
            <Position>
              <LatitudeDegrees>1.3010</LatitudeDegrees>
              <LongitudeDegrees>103.8010</LongitudeDegrees>
            </Position>
            <AltitudeMeters>12</AltitudeMeters>
            <DistanceMeters>2000</DistanceMeters>
            <HeartRateBpm>
              <Value>122</Value>
            </HeartRateBpm>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-01-01T00:02:13Z</Time>
            <Position>
              <LatitudeDegrees>1.3013</LatitudeDegrees>
              <LongitudeDegrees>103.8013</LongitudeDegrees>
            </Position>
            <AltitudeMeters>13</AltitudeMeters>
            <DistanceMeters>2300</DistanceMeters>
            <HeartRateBpm>
              <Value>123</Value>
            </HeartRateBpm>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>
`;

const tempDirectories: string[] = [];

const createTempTcxFixture = async (): Promise<string> => {
  const tempDirectoryPath = await mkdtemp(path.join(os.tmpdir(), "overlay-test-"));
  tempDirectories.push(tempDirectoryPath);

  const filePath = path.join(tempDirectoryPath, "activity-with-long-gap.tcx");
  await writeFile(filePath, MINIMAL_TCX_WITH_LONG_GAP, "utf8");

  return filePath;
};

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    ),
  );
});

describe("loadActivity", () => {
  it("preserves long gaps from sparse TCX timestamps after normalization", async () => {
    const fixturePath = await createTempTcxFixture();
    const activity = await loadActivity(fixturePath);
    const normalizedActivity = await normalizeActivity(activity);
    const { longGaps } = detectGaps(normalizedActivity);

    expect(activity.samples).toHaveLength(4);
    expect(activity.samples.map((sample) => sample.elapsedMs)).toEqual([0, 4_000, 130_000, 133_000]);
    expect(longGaps).toHaveLength(1);
    expect(longGaps[0]?.durationMs).toBe(125_000);
  });

  it("keeps segment durations based on elapsed seconds instead of sparse trackpoint count", async () => {
    const fixturePath = await createTempTcxFixture();
    const activity = await loadActivity(fixturePath);
    const normalizedActivity = await normalizeActivity(activity);
    const classifiedGaps = detectGaps(normalizedActivity);
    const segments = splitActivityAtLongGaps(
      normalizedActivity,
      classifiedGaps.longGaps,
      classifiedGaps.shortGaps,
    ).map((segment) => fillShortGaps(segment, segment.gaps));

    expect(segments).toHaveLength(2);
    expect(segments[0]?.summary.durationMs).toBe(4_000);
    expect(segments[1]?.summary.durationMs).toBe(3_000);
    expect(segments[0]?.samples).toHaveLength(5);
    expect(segments[1]?.samples).toHaveLength(4);
  });
});
