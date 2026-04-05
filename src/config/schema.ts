import { z } from "zod";

const positiveNumber = z.number().finite().positive();
const nonNegativeNumber = z.number().finite().min(0);

export const OutputFormatSchema = z.enum(["mov", "png-sequence"]);
export const WidgetTypeSchema = z.enum([
  "speed",
  "heart-rate",
  "elevation",
  "distance",
  "time",
]);

const ZoneSchema = z.object({
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  color: z.string().min(1),
});

const BaseWidgetSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  x: nonNegativeNumber.default(0),
  y: nonNegativeNumber.default(0),
  width: positiveNumber.default(320),
  height: positiveNumber.default(120),
  opacity: z.number().finite().min(0).max(1).default(1),
  padding: nonNegativeNumber.default(20),
  backgroundColor: z.string().default("rgba(10, 18, 24, 0.55)"),
  borderColor: z.string().default("rgba(255, 255, 255, 0.2)"),
  borderWidth: nonNegativeNumber.default(1),
  borderRadius: nonNegativeNumber.default(18),
  fontFamily: z.string().optional(),
  labelFontSize: positiveNumber.default(18),
  valueFontSize: positiveNumber.default(42),
  unitFontSize: positiveNumber.default(18),
  labelColor: z.string().default("#cbd5e1"),
  valueColor: z.string().default("#ffffff"),
  unitColor: z.string().default("#cbd5e1"),
  showLabel: z.boolean().default(true),
});

const SpeedWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("speed"),
  precision: z.number().int().min(0).max(3).default(1),
  unit: z.enum(["km/h", "mph"]).default("km/h"),
  showUnit: z.boolean().default(true),
});

const HeartRateWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("heart-rate"),
  showUnit: z.boolean().default(true),
  colorByZone: z.boolean().default(false),
  zones: z.array(ZoneSchema).default([]),
});

const ElevationWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("elevation"),
  showAscent: z.boolean().default(false),
  altitudeUnit: z.enum(["m", "ft"]).default("m"),
  ascentUnit: z.enum(["m", "ft"]).default("m"),
});

const DistanceWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("distance"),
  precision: z.number().int().min(0).max(3).default(2),
  unit: z.enum(["km", "mi"]).default("km"),
  showUnit: z.boolean().default(true),
});

const TimeWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("time"),
  mode: z.enum(["elapsed", "clock", "both"]).default("elapsed"),
  timezone: z.string().optional(),
  elapsedFormat: z.enum(["hh:mm:ss", "mm:ss"]).default("hh:mm:ss"),
  clockFormat: z.enum(["HH:mm:ss", "HH:mm"]).default("HH:mm:ss"),
});

export const WidgetConfigSchema = z.discriminatedUnion("type", [
  SpeedWidgetSchema,
  HeartRateWidgetSchema,
  ElevationWidgetSchema,
  DistanceWidgetSchema,
  TimeWidgetSchema,
]);

export const OverlayConfigSchema = z.object({
  render: z.object({
    width: positiveNumber.default(1920),
    height: positiveNumber.default(1080),
    fps: positiveNumber.default(30),
    durationStrategy: z.enum(["activity", "fixed", "trimmed"]).default("activity"),
    durationMs: positiveNumber.optional(),
    output: z
      .object({
        format: OutputFormatSchema.default("mov"),
        codec: z.literal("prores").default("prores"),
        proresProfile: z.enum(["4444", "4444-xq"]).default("4444"),
      })
      .default({
        format: "mov",
        codec: "prores",
        proresProfile: "4444",
      }),
  }),
  sync: z
    .object({
      activityOffsetMs: z.number().finite().default(0),
      trimStartMs: nonNegativeNumber.default(0),
      trimEndMs: nonNegativeNumber.default(0),
      timezone: z.string().optional(),
    })
    .default({
      activityOffsetMs: 0,
      trimStartMs: 0,
      trimEndMs: 0,
    }),
  preprocess: z
    .object({
      interpolateMissingSamples: z.boolean().default(true),
      speedSmoothingSeconds: z.number().int().min(1).max(15).default(3),
      heartRateSmoothingSeconds: z.number().int().min(1).max(15).default(3),
      altitudeSmoothingSeconds: z.number().int().min(1).max(15).default(5),
      gradeSmoothingSeconds: z.number().int().min(1).max(15).default(5),
    })
    .default({
      interpolateMissingSamples: true,
      speedSmoothingSeconds: 3,
      heartRateSmoothingSeconds: 3,
      altitudeSmoothingSeconds: 5,
      gradeSmoothingSeconds: 5,
    }),
  theme: z
    .object({
      fontFamily: z.string().default("SF Pro Display, Helvetica, Arial, sans-serif"),
      colors: z
        .object({
          primary: z.string().default("#ffffff"),
          secondary: z.string().default("#cbd5e1"),
          accent: z.string().default("#34d399"),
          text: z.string().default("#ffffff"),
          muted: z.string().default("#94a3b8"),
        })
        .default({
          primary: "#ffffff",
          secondary: "#cbd5e1",
          accent: "#34d399",
          text: "#ffffff",
          muted: "#94a3b8",
        }),
    })
    .default({
      fontFamily: "SF Pro Display, Helvetica, Arial, sans-serif",
      colors: {
        primary: "#ffffff",
        secondary: "#cbd5e1",
        accent: "#34d399",
        text: "#ffffff",
        muted: "#94a3b8",
      },
    }),
  widgets: z.array(WidgetConfigSchema).default([]),
  debug: z
    .object({
      dumpFrameData: z.boolean().default(true),
      dumpNormalizedActivity: z.boolean().default(true),
    })
    .default({
      dumpFrameData: true,
      dumpNormalizedActivity: true,
    }),
});

export type OutputFormat = z.infer<typeof OutputFormatSchema>;
export type WidgetType = z.infer<typeof WidgetTypeSchema>;
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;
