import { OverlayConfigSchema } from "./schema.js";

export const defaultOverlayConfig = OverlayConfigSchema.parse({
  render: {},
  widgets: [],
});
