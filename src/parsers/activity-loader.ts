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
  getStreamDataByDuration?: (
    streamType: string,
    filterNull?: boolean,
    filterInfinity?: boolean,
  ) => Array<{
    time: number;
    value: number | null;
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

type TimedStreamSample = {
  elapsedMs: number;
  value: number | undefined;
};

const getTimedStreamData = (
  activity: SportsActivity,
  candidateNames: string[],
): TimedStreamSample[] | undefined => {
  if (activity.getStreamDataByDuration !== undefined) {
    for (const candidateName of candidateNames) {
      let timedData: Array<{ time: number; value: number | null }>;

      try {
        timedData = activity.getStreamDataByDuration(candidateName, true, false);
      } catch {
        continue;
      }

      if (timedData.length === 0) {
        continue;
      }

      return timedData.map((sample) => ({
        elapsedMs: sample.time,
        value: sample.value === null ? undefined : sample.value,
      }));
    }
  }

  const streamData = toOptionalNumberArray(getStreamData(activity, candidateNames));

  return streamData.length === 0
    ? undefined
    : streamData.map((value, index) => ({
        elapsedMs: index * 1000,
        value,
      }));
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
  const distanceSamples = getTimedStreamData(activity, ["Distance"]);
  const cadenceSamples = getTimedStreamData(activity, ["Cadence"]);
  const heartRateSamples = getTimedStreamData(activity, ["Heart Rate"]);
  const speedSamples = getTimedStreamData(
    activity,
    ["Speed", "Speed in meters per minute"],
  );
  const altitudeSamples = getTimedStreamData(
    activity,
    [
      "Altitude",
      "Altitude Smooth",
      "Altitude smooth",
      "Altitude GPS",
      "Fused Altitude",
    ],
  );
  const powerSamples = getTimedStreamData(activity, ["Power"]);
  const latitudeSamples = getTimedStreamData(
    activity,
    ["Latitude", "Latitude degrees"],
  );
  const longitudeSamples = getTimedStreamData(
    activity,
    ["Longitude", "Longitude degrees"],
  );

  const elapsedMsSet = new Set<number>();
  const addElapsedMs = (samples: TimedStreamSample[] | undefined): void => {
    samples?.forEach((sample) => {
      elapsedMsSet.add(sample.elapsedMs);
    });
  };

  addElapsedMs(distanceSamples);
  addElapsedMs(cadenceSamples);
  addElapsedMs(heartRateSamples);
  addElapsedMs(speedSamples);
  addElapsedMs(altitudeSamples);
  addElapsedMs(powerSamples);
  addElapsedMs(latitudeSamples);
  addElapsedMs(longitudeSamples);

  if (startedAtMs !== undefined) {
    realTimestamps.forEach((timestampMs) => {
      elapsedMsSet.add(timestampMs - startedAtMs);
    });
  } else {
    realTimestamps.forEach((_, index) => {
      elapsedMsSet.add(index * 1000);
    });
  }

  const buildValueMap = (
    samples: TimedStreamSample[] | undefined,
  ): Map<number, number | undefined> => {
    return new Map(samples?.map((sample) => [sample.elapsedMs, sample.value]) ?? []);
  };

  const distanceByElapsedMs = buildValueMap(distanceSamples);
  const cadenceByElapsedMs = buildValueMap(cadenceSamples);
  const heartRateByElapsedMs = buildValueMap(heartRateSamples);
  const speedByElapsedMs = buildValueMap(speedSamples);
  const altitudeByElapsedMs = buildValueMap(altitudeSamples);
  const powerByElapsedMs = buildValueMap(powerSamples);
  const latitudeByElapsedMs = buildValueMap(latitudeSamples);
  const longitudeByElapsedMs = buildValueMap(longitudeSamples);

  return Array.from(elapsedMsSet)
    .sort((left, right) => left - right)
    .map((elapsedMs) => ({
      timestampMs:
        startedAtMs !== undefined
          ? startedAtMs + elapsedMs
          : elapsedMs,
      elapsedMs,
      lat: latitudeByElapsedMs.get(elapsedMs),
      lon: longitudeByElapsedMs.get(elapsedMs),
      altitudeM: altitudeByElapsedMs.get(elapsedMs),
      distanceM: distanceByElapsedMs.get(elapsedMs),
      speedMps: speedByElapsedMs.get(elapsedMs),
      heartRateBpm: heartRateByElapsedMs.get(elapsedMs),
      ascentM: undefined,
      gradePct: undefined,
      cadenceRpm: cadenceByElapsedMs.get(elapsedMs),
      powerW: powerByElapsedMs.get(elapsedMs),
    }));
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

  if (!samples.some((sample) => sample.lat !== undefined && sample.lon !== undefined)) {
    warnings.push("GPS position data is missing from the activity file.");
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
