export const MIN_REMAINING_RENDER_BUDGET_MS = 15_000;

export const consumeRemainingRenderBudgetMs = (
  remainingRenderBudgetMs: number | undefined,
  renderedDurationMs: number,
): number | undefined => {
  if (remainingRenderBudgetMs === undefined) {
    return undefined;
  }

  return Math.max(0, remainingRenderBudgetMs - Math.max(0, renderedDurationMs));
};

export const shouldRenderNextSegment = (
  remainingRenderBudgetMs: number | undefined,
): boolean => {
  if (remainingRenderBudgetMs === undefined) {
    return true;
  }

  return remainingRenderBudgetMs >= MIN_REMAINING_RENDER_BUDGET_MS;
};
