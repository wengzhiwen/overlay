export type ActivitySourceFormat = "gpx" | "tcx";

export type ActivityZone = {
  min: number | undefined;
  max: number | undefined;
  color: string | undefined;
  label: string | undefined;
};

export type ActivitySample = {
  timestampMs: number;
  elapsedMs: number;
  lat: number | undefined;
  lon: number | undefined;
  altitudeM: number | undefined;
  distanceM: number | undefined;
  speedMps: number | undefined;
  heartRateBpm: number | undefined;
  ascentM: number | undefined;
  gradePct: number | undefined;
  cadenceRpm: number | undefined;
  powerW: number | undefined;
  isDataGap?: boolean;
};

export type DataGap = {
  afterIndex: number;
  beforeIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
};

export type Activity = {
  id: string;
  source: {
    filePath: string;
    format: ActivitySourceFormat;
  };
  sportType: "ride" | "run" | "unknown" | undefined;
  startedAt: string | undefined;
  timezone: string | undefined;
  warnings: string[];
  zones: {
    heartRate: ActivityZone[];
    power: ActivityZone[];
    cadence: ActivityZone[];
  };
  summary: {
    durationMs: number | undefined;
    distanceM: number | undefined;
    ascentM: number | undefined;
  };
  samples: ActivitySample[];
  gaps: DataGap[];
};
