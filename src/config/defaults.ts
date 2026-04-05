import type { OverlayConfig } from "./schema.js";

export const defaultOverlayConfig: OverlayConfig = {
  render: {
    width: 1920,
    height: 1080,
    fps: 30,
    durationStrategy: "activity",
    output: {
      format: "mov",
    },
  },
  widgets: [],
};
