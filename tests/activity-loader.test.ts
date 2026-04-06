import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadActivity } from "../src/parsers/activity-loader.js";
import { fillShortGaps } from "../src/preprocess/fill-gaps.js";
import { detectGaps } from "../src/preprocess/detect-gaps.js";
import { normalizeActivity } from "../src/preprocess/normalize.js";
import { splitActivityAtLongGaps } from "../src/preprocess/split-activity.js";

describe("loadActivity", () => {
  it("preserves long gaps from sparse TCX timestamps after normalization", async () => {
    const activity = await loadActivity(
      path.resolve(process.cwd(), "ref_input/activity_22122783684.tcx"),
    );
    const normalizedActivity = await normalizeActivity(activity);
    const { longGaps } = detectGaps(normalizedActivity);

    expect(activity.samples).toHaveLength(267);
    expect(activity.samples[147]?.elapsedMs).toBeGreaterThan(activity.samples[146]!.elapsedMs + 120_000);
    expect(activity.samples[147]?.lat).toBeUndefined();
    expect(activity.samples[146]?.lat).toBeDefined();
    expect(longGaps).toHaveLength(1);
    expect(longGaps[0]?.durationMs).toBeGreaterThan(120_000);
  });

  it("keeps segment durations based on elapsed seconds instead of sparse trackpoint count", async () => {
    const activity = await loadActivity(
      path.resolve(process.cwd(), "ref_input/activity_22122783684.tcx"),
    );
    const normalizedActivity = await normalizeActivity(activity);
    const classifiedGaps = detectGaps(normalizedActivity);
    const segments = splitActivityAtLongGaps(
      normalizedActivity,
      classifiedGaps.longGaps,
      classifiedGaps.shortGaps,
    ).map((segment) => fillShortGaps(segment, segment.gaps));

    expect(segments).toHaveLength(2);
    expect(segments[0]?.summary.durationMs).toBe(469_000);
    expect(segments[1]?.summary.durationMs).toBe(388_000);
    expect(segments[0]?.samples).toHaveLength(470);
    expect(segments[1]?.samples).toHaveLength(389);
  });
});
