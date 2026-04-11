const DEFAULT_GRADE_ZONE_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#fb923c",
  "#f87171",
];

const DEFAULT_GRADE_THRESHOLDS = [3, 5, 8, 10];

export type ResolvedGradeZone = {
  min: number;
  max: number;
  color: string;
};

const buildFiveZones = (thresholds: number[]): ResolvedGradeZone[] => {
  const sorted = [...thresholds].sort((a, b) => a - b);

  return [
    {
      min: Number.NEGATIVE_INFINITY,
      max: sorted[0] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_GRADE_ZONE_COLORS[0]!,
    },
    {
      min: sorted[0] ?? Number.NEGATIVE_INFINITY,
      max: sorted[1] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_GRADE_ZONE_COLORS[1]!,
    },
    {
      min: sorted[1] ?? Number.NEGATIVE_INFINITY,
      max: sorted[2] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_GRADE_ZONE_COLORS[2]!,
    },
    {
      min: sorted[2] ?? Number.NEGATIVE_INFINITY,
      max: sorted[3] ?? Number.POSITIVE_INFINITY,
      color: DEFAULT_GRADE_ZONE_COLORS[3]!,
    },
    {
      min: sorted[3] ?? Number.NEGATIVE_INFINITY,
      max: Number.POSITIVE_INFINITY,
      color: DEFAULT_GRADE_ZONE_COLORS[4]!,
    },
  ];
};

export const resolveGradeZones = (
  gradeThresholds: number[] | undefined,
): ResolvedGradeZone[] => {
  if (gradeThresholds !== undefined && gradeThresholds.length === 4) {
    return buildFiveZones(gradeThresholds);
  }

  return buildFiveZones(DEFAULT_GRADE_THRESHOLDS);
};

export const getGradeZoneColor = (
  gradePct: number,
  zones: ResolvedGradeZone[],
): string => {
  const zone = zones.find((z) => gradePct >= z.min && gradePct < z.max);

  return zone?.color ?? "#94a3b8";
};
