import path from "node:path";

import { SportsLib } from "@sports-alliance/sports-lib";
import { DOMParser } from "@xmldom/xmldom";

import type { Activity, ActivitySample, ActivitySourceFormat } from "../domain/activity.js";
import { readTextFile } from "../utils/files.js";

type SportsActivity = {
  startDate?: Date;
  endDate?: Date;
  type?: string;
  intensityZones?: Array<{
    from?: number;
    to?: number;
    color?: string;
    name?: string;
  }>;
  streams?: Array<{
    type: string;
    getData: (onlyNumeric?: boolean, filterInfinity?: boolean) => Array<number | null>;
  }>;
};

type SportsEvent = {
  name?: string;
  activities?: SportsActivity[];
};

const SUPPORTED_FORMATS = new Set<ActivitySourceFormat>(["gpx", "tcx"]);

const detectActivitySourceFormat = (filePath: string): ActivitySourceFormat => {
  const extension = path.extname(filePath).toLowerCase().replace(".", "");

  if (SUPPORTED_FORMATS.has(extension as ActivitySourceFormat)) {
    return extension as ActivitySourceFormat;
  }

  throw new Error(`Unsupported activity file format: ${extension}`);
};

const parseSportType = (
  rawType: string | undefined,
): Activity["sportType"] => {
  const normalized = rawType?.toLowerCase() ?? "";

  if (
    normalized.includes("bike") ||
    normalized.includes("cycl") ||
    normalized.includes("ride")
  ) {
    return "ride";
  }

  if (normalized.includes("run")) {
    return "run";
  }

  return "unknown";
};

const getStreamData = (
  activity: SportsActivity,
  candidateNames: string[],
): Array<number | null> | undefined => {
  const stream = activity.streams?.find((item) => candidateNames.includes(item.type));

  return stream?.getData();
};

const getLastDefinedValue = (
  values: Array<number | undefined>,
): number | undefined => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const toOptionalNumberArray = (
  values: Array<number | null> | undefined,
): Array<number | undefined> => {
  return values?.map((value) => (value === null ? undefined : value)) ?? [];
};

const extractTimestamps = (
  content: string,
  format: ActivitySourceFormat,
): number[] => {
  const document = new DOMParser().parseFromString(content, "text/xml");

  if (format === "tcx") {
    const elements = document.getElementsByTagName("Time");

    return Array.from(elements)
      .map((el) => {
        const text = el.textContent?.trim();

        return text ? new Date(text).getTime() : NaN;
      })
      .filter((ts) => !isNaN(ts));
  }

  // GPX: timestamps are <time> children of <trkpt>
  const trkpts = document.getElementsByTagName("trkpt");

  return Array.from(trkpts)
    .map((tp) => {
      const timeElements = tp.getElementsByTagName("time");

      if (timeElements.length === 0) {
        return NaN;
      }

      const text = timeElements[0]?.textContent?.trim();

      return text ? new Date(text).getTime() : NaN;
    })
    .filter((ts) => !isNaN(ts));
};

const buildSamples = (
  activity: SportsActivity,
  startedAtMs: number | undefined,
  realTimestamps: number[],
): ActivitySample[] => {
  const distanceData = toOptionalNumberArray(getStreamData(activity, ["Distance"]));
  const cadenceData = toOptionalNumberArray(getStreamData(activity, ["Cadence"]));
  const heartRateData = toOptionalNumberArray(getStreamData(activity, ["Heart Rate"]));
  const speedData = toOptionalNumberArray(
    getStreamData(activity, ["Speed", "Speed in meters per minute"]),
  );
  const altitudeData = toOptionalNumberArray(
    getStreamData(activity, [
      "Altitude",
      "Altitude smooth",
      "Altitude GPS",
      "Fused Altitude",
    ]),
  );
  const powerData = toOptionalNumberArray(getStreamData(activity, ["Power"]));
  const latitudeData = toOptionalNumberArray(
    getStreamData(activity, ["Latitude degrees"]),
  );
  const longitudeData = toOptionalNumberArray(
    getStreamData(activity, ["Longitude degrees"]),
  );

  const sampleCount = Math.max(
    distanceData.length,
    cadenceData.length,
    heartRateData.length,
    speedData.length,
    altitudeData.length,
    powerData.length,
    latitudeData.length,
    longitudeData.length,
    0,
  );

  return Array.from({ length: sampleCount }, (_, index) => {
    const realTs = index < realTimestamps.length ? realTimestamps[index] : undefined;
    const elapsedMs =
      startedAtMs !== undefined && realTs !== undefined
        ? realTs - startedAtMs
        : index * 1000;

    return {
      timestampMs:
        realTs ?? (startedAtMs !== undefined ? startedAtMs + elapsedMs : elapsedMs),
      elapsedMs,
      lat: latitudeData[index],
      lon: longitudeData[index],
      altitudeM: altitudeData[index],
      distanceM: distanceData[index],
      speedMps: speedData[index],
      heartRateBpm: heartRateData[index],
      ascentM: undefined,
      gradePct: undefined,
      cadenceRpm: cadenceData[index],
      powerW: powerData[index],
    };
  });
};

export const loadActivity = async (filePath: string): Promise<Activity> => {
  const format = detectActivitySourceFormat(filePath);
  const content = await readTextFile(filePath);
  let event: SportsEvent;

  if (format === "gpx") {
    event = (await SportsLib.importFromGPX(content, DOMParser)) as SportsEvent;
  } else {
    const document = new DOMParser().parseFromString(content, "text/xml");
    event = (await SportsLib.importFromTCX(document as unknown as XMLDocument)) as SportsEvent;
  }

  const sourceActivity = event.activities?.[0];

  if (!sourceActivity) {
    throw new Error("No activity was found in the source file.");
  }

  const startedAt = sourceActivity.startDate?.toISOString();
  const startedAtMs = sourceActivity.startDate?.getTime();
  const realTimestamps = extractTimestamps(content, format);
  const samples = buildSamples(sourceActivity, startedAtMs, realTimestamps);
  const distanceM = getLastDefinedValue(samples.map((sample) => sample.distanceM));
  const summaryDurationMs =
    sourceActivity.startDate && sourceActivity.endDate
      ? sourceActivity.endDate.getTime() - sourceActivity.startDate.getTime()
      : samples.length > 0
        ? (samples.length - 1) * 1000
        : undefined;

  const warnings: string[] = [];

  if (!samples.some((sample) => sample.distanceM !== undefined)) {
    warnings.push("Distance data is missing from the activity file.");
  }

  if (!samples.some((sample) => sample.heartRateBpm !== undefined)) {
    warnings.push("Heart rate data is missing from the activity file.");
  }

  if (!samples.some((sample) => sample.altitudeM !== undefined)) {
    warnings.push("Altitude data is missing from the activity file.");
  }

  return {
    id: event.name ?? startedAt ?? path.basename(filePath),
    source: {
      filePath,
      format,
    },
    sportType: parseSportType(sourceActivity.type),
    startedAt,
    timezone: "UTC",
    warnings,
    zones: {
      heartRate:
        sourceActivity.intensityZones?.map((zone) => ({
          min: zone.from,
          max: zone.to,
          color: zone.color,
          label: zone.name,
        })) ?? [],
    },
    summary: {
      durationMs: summaryDurationMs,
      distanceM,
      ascentM: undefined,
    },
    samples,
    gaps: [],
  };
};
