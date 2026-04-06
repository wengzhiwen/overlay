import { describe, expect, it } from "vitest";

import { getInvertedGlowShadow, invertColor } from "../src/utils/color.js";

describe("invertColor", () => {
  it("inverts white to black", () => {
    expect(invertColor("#ffffff")).toBe("#000000");
  });

  it("inverts black to white", () => {
    expect(invertColor("#000000")).toBe("#ffffff");
  });

  it("inverts a mid-gray color", () => {
    expect(invertColor("#808080")).toBe("#7f7f7f");
  });

  it("handles shorthand hex (#RGB)", () => {
    expect(invertColor("#fff")).toBe("#000000");
    expect(invertColor("#000")).toBe("#ffffff");
  });
});

describe("getInvertedGlowShadow", () => {
  it("returns a multi-layer text-shadow with inverted color", () => {
    const shadow = getInvertedGlowShadow("#ffffff");
    expect(shadow).toContain("#000000");
    // Should have 5 shadow layers separated by commas
    expect(shadow.split(",").length).toBe(5);
  });
});
