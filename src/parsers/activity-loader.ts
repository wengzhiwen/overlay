import type { Activity } from "../domain/activity.js";

export const loadActivity = async (_filePath: string): Promise<Activity> => {
  throw new Error("Activity loading is not implemented yet.");
};
