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
  "noodlemap",
  "citymap",
]);

const ZoneSchema = z.object({
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  color: z.string().min(1),
});

export const WidgetStyleSchema = z.enum(["with-bgc", "without-bgc"]);

const BaseWidgetSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  x: nonNegativeNumber.default(0),
  y: nonNegativeNumber.default(0),
  scale: z.number().finite().min(0.01).max(1).default(0.15),
  style: WidgetStyleSchema.default("with-bgc"),
  opacity: z.number().finite().min(0).max(1).default(1),
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
  colorByZone: z.boolean().default(false),
  zones: z.array(ZoneSchema).default([]),
  zoneThresholds: z.array(z.number().finite()).length(4).optional(),
  showChart: z.union([z.boolean(), z.literal("auto")]).default("auto"),
  chartRange: z.enum(["short", "medium", "long"]).default("medium"),
});

const HeartRateWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("heart-rate"),
  showUnit: z.boolean().default(true),
  colorByZone: z.boolean().default(false),
  zones: z.array(ZoneSchema).default([]),
  showChart: z.union([z.boolean(), z.literal("auto")]).default("auto"),
  chartRange: z.enum(["short", "medium", "long"]).default("medium"),
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

const NoodleMapWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("noodlemap"),
  showLabel: z.boolean().default(false),
  lineColor: z.string().default("#ffffff"),
  lineWeight: z.enum(["S", "M", "L"]).default("M"),
});

const CityMapWidgetSchema = BaseWidgetSchema.extend({
  type: z.literal("citymap"),
  showLabel: z.boolean().default(false),
  mapStyle: z.string().default("https://tiles.openfreemap.org/styles/liberty"),
  lineColor: z.string().default("#34d399"),
  lineWeight: z.enum(["S", "M", "L"]).default("M"),
});

export const WidgetConfigSchema = z.discriminatedUnion("type", [
  SpeedWidgetSchema,
  HeartRateWidgetSchema,
  ElevationWidgetSchema,
  DistanceWidgetSchema,
  TimeWidgetSchema,
  NoodleMapWidgetSchema,
  CityMapWidgetSchema,
]);

// Per-widget-type aspect ratios (width / height)
const WIDGET_ASPECT_RATIOS: Record<string, number> = {
  speed: 5 / 3,
  "heart-rate": 5 / 3,
  elevation: 5 / 3,
  distance: 5 / 3,
  time: 2,
  noodlemap: 5 / 3,
  citymap: 5 / 3,
};

const WIDGET_PADDING_RATIO = 0.07;

const resolveWidgetDimensions = (
  widget: z.infer<typeof WidgetConfigSchema>,
  canvasWidth: number,
) => {
  const width = Math.round(canvasWidth * widget.scale);
  const height = Math.round(width / (WIDGET_ASPECT_RATIOS[widget.type] ?? 5 / 3));
  const padding = Math.max(8, Math.round(width * WIDGET_PADDING_RATIO));

  return { ...widget, width, height, padding };
};

export const OverlayConfigSchema = z
  .object({
    render: z.object({
      width: positiveNumber.default(1920),
      height: positiveNumber.default(1080),
      fps: positiveNumber.default(30),
      durationStrategy: z
        .enum(["activity", "fixed", "trimmed"])
        .default("activity"),
      durationMs: positiveNumber.optional(),
      maxRenderTimeMs: positiveNumber.optional(),
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
        fontFamily: z
          .string()
          .default("SF Pro Display, Helvetica, Arial, sans-serif"),
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
  })
  .transform((data) => ({
    ...data,
    widgets: data.widgets.map((w) =>
      resolveWidgetDimensions(w, data.render.width),
    ),
  }));

export type OutputFormat = z.infer<typeof OutputFormatSchema>;
export type WidgetType = z.infer<typeof WidgetTypeSchema>;
export type WidgetStyle = z.infer<typeof WidgetStyleSchema>;
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;
export type WidgetConfig = OverlayConfig["widgets"][number];
