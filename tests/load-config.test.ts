import { describe, expect, it } from "vitest";

import { loadOverlayConfig } from "../src/config/load-config.js";

describe("loadOverlayConfig", () => {
  it("loads the sample config with defaults applied", async () => {
    const config = await loadOverlayConfig("examples/sample-config.json");

    expect(config.render.width).toBe(1920);
    expect(config.render.output.format).toBe("mov");
    expect(config.widgets).toHaveLength(5);
    expect(config.debug.dumpFrameData).toBe(true);
  });
});
