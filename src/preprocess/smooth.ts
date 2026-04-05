import type { Activity } from "../domain/activity.js";

export const smoothActivity = async (activity: Activity): Promise<Activity> => {
  return activity;
};
