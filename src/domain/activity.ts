export type ActivitySourceFormat = "gpx" | "tcx";

export type ActivitySample = {
  timestampMs: number;
  elapsedMs: number;
  lat?: number;
  lon?: number;
  altitudeM?: number;
  distanceM?: number;
  speedMps?: number;
  heartRateBpm?: number;
  gradePct?: number;
  cadenceRpm?: number;
  powerW?: number;
};

export type Activity = {
  id: string;
  source: {
    filePath: string;
    format: ActivitySourceFormat;
  };
  sportType?: "ride" | "run" | "unknown";
  startedAt?: string;
  timezone?: string;
  summary: {
    durationMs?: number;
    distanceM?: number;
    ascentM?: number;
  };
  samples: ActivitySample[];
};
