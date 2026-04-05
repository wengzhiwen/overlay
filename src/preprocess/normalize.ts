import type { Activity } from "../domain/activity.js";

export const normalizeActivity = async (
  activity: Activity,
): Promise<Activity> => {
  return activity;
};
