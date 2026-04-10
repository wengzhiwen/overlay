import { describe, expect, it } from "vitest";

import {
  consumeRemainingRenderBudgetMs,
  MIN_REMAINING_RENDER_BUDGET_MS,
  shouldRenderNextSegment,
} from "../src/render/render-budget.js";

describe("consumeRemainingRenderBudgetMs", () => {
  it("keeps sample mode disabled when no job budget is configured", () => {
    expect(consumeRemainingRenderBudgetMs(undefined, 500_000)).toBeUndefined();
  });

  it("consumes the render budget across split segments", () => {
    const afterFirstSegment = consumeRemainingRenderBudgetMs(1_200_000, 500_000);
    const afterSecondSegment = consumeRemainingRenderBudgetMs(afterFirstSegment, 700_000);

    expect(afterFirstSegment).toBe(700_000);
    expect(afterSecondSegment).toBe(0);
  });

  it("exhausts the full job budget when the first segment already fills it", () => {
    expect(consumeRemainingRenderBudgetMs(1_200_000, 1_200_000)).toBe(0);
  });

  it("stops before the next segment when the remaining budget is below 15 seconds", () => {
    expect(shouldRenderNextSegment(MIN_REMAINING_RENDER_BUDGET_MS - 1)).toBe(false);
    expect(shouldRenderNextSegment(MIN_REMAINING_RENDER_BUDGET_MS)).toBe(true);
  });
});
