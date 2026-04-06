import {
  metersPerSecondToKilometersPerHour,
  metersPerSecondToMilesPerHour,
} from "../../utils/units.js";

export type SpeedUnit = "km/h" | "mph";

export type SpeedZoneInput = {
  min?: number | undefined;
  max?: number | undefined;
  color?: string | undefined;
};

export type ResolvedSpeedZone = {
  min: number;
  max: number;
  color: string;
};

const DEFAULT_SPEED_ZONE_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#fb923c",
  "#f87171",
];

const DEFAULT_SPEED_ZONE_THRESHOLDS_KMH = [20, 25, 30, 35];

export const convertSpeedMpsToUnit = (
  value: number,
  unit: SpeedUnit,
): number => {
  return unit === "mph"
    ? metersPerSecondToMilesPerHour(value)
    : metersPerSecondToKilometersPerHour(value);
};

export const convertKilometersPerHourToUnit = (
  value: number,
  unit: SpeedUnit,
): number => {
  return unit === "mph" ? value / 1.609344 : value;
};

export const getDefaultSpeedAxisMax = (unit: SpeedUnit): number => {
  return convertKilometersPerHourToUnit(35, unit);
};

export const getDefaultSpeedZoneThresholds = (
  unit: SpeedUnit,
): number[] => {
  return DEFAULT_SPEED_ZONE_THRESHOLDS_KMH.map((threshold) =>
    convertKilometersPerHourToUnit(threshold, unit),
  );
};

const buildFiveZones = (thresholds: number[]): ResolvedSpeedZone[] => {
  const sortedThresholds = [...thresholds].sort((a, b) => a - b);

  return [
    {
      min: Number.NEGATIVE_INFINITY,
      max: sortedThresholds[0] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_SPEED_ZONE_COLORS[0]!,
    },
    {
      min: sortedThresholds[0] ?? Number.NEGATIVE_INFINITY,
      max: sortedThresholds[1] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_SPEED_ZONE_COLORS[1]!,
    },
    {
      min: sortedThresholds[1] ?? Number.NEGATIVE_INFINITY,
      max: sortedThresholds[2] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_SPEED_ZONE_COLORS[2]!,
    },
    {
      min: sortedThresholds[2] ?? Number.NEGATIVE_INFINITY,
      max: sortedThresholds[3] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_SPEED_ZONE_COLORS[3]!,
    },
    {
      min: sortedThresholds[3] ?? Number.NEGATIVE_INFINITY,
      max: Number.POSITIVE_INFINITY,
      color: DEFAULT_SPEED_ZONE_COLORS[4]!,
    },
  ];
};

export const resolveSpeedZones = (
  configZones: SpeedZoneInput[],
  zoneThresholds: number[] | undefined,
  unit: SpeedUnit,
): ResolvedSpeedZone[] => {
  if (zoneThresholds !== undefined && zoneThresholds.length === 4) {
    return buildFiveZones(zoneThresholds);
  }

  if (configZones.length > 0) {
    return configZones.map((zone, index) => ({
      min: zone.min ?? Number.NEGATIVE_INFINITY,
      max: zone.max ?? Number.POSITIVE_INFINITY,
      color: zone.color ?? DEFAULT_SPEED_ZONE_COLORS[index] ?? "#94a3b8",
    }));
  }

  return buildFiveZones(getDefaultSpeedZoneThresholds(unit));
};

export const getSpeedZoneColor = (
  speedValue: number,
  zones: ResolvedSpeedZone[],
): string => {
  const matchingZone = zones.find((zone) =>
    speedValue >= zone.min && speedValue < zone.max
  );

  return matchingZone?.color ?? "#94a3b8";
};
