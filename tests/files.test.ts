import { describe, expect, it } from "vitest";

import { getLocalTimestampedOutputBaseName } from "../src/utils/files.js";

describe("getLocalTimestampedOutputBaseName", () => {
  it("formats startedAt using the system local timezone", () => {
    expect(
      getLocalTimestampedOutputBaseName("2026-03-25T09:16:45.900Z"),
    ).toBe("2026-03-25_17-16-45");
  });

  it("falls back to the provided date when startedAt is missing", () => {
    expect(
      getLocalTimestampedOutputBaseName(
        undefined,
        new Date("2026-03-25T09:16:45.900Z"),
      ),
    ).toBe("2026-03-25_17-16-45");
  });
});
