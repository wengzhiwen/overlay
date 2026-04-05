import type { Activity } from "../domain/activity.js";

export const deriveMetrics = async (activity: Activity): Promise<Activity> => {
  return activity;
};
