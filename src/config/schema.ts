export type OutputFormat = "mov" | "png-sequence";

export type WidgetType =
  | "speed"
  | "heart-rate"
  | "elevation"
  | "distance"
  | "time";

export type WidgetConfig = {
  id: string;
  type: WidgetType;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  padding?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontFamily?: string;
  labelFontSize?: number;
  valueFontSize?: number;
  unitFontSize?: number;
  labelColor?: string;
  valueColor?: string;
  unitColor?: string;
  showLabel?: boolean;
};

export type OverlayConfig = {
  render: {
    width: number;
    height: number;
    fps: number;
    durationStrategy: "activity" | "fixed" | "trimmed";
    durationMs?: number;
    output: {
      format: OutputFormat;
      codec?: "prores";
      proresProfile?: "4444" | "4444-xq";
    };
  };
  sync?: {
    activityOffsetMs?: number;
    trimStartMs?: number;
    trimEndMs?: number;
    timezone?: string;
  };
  theme?: {
    fontFamily?: string;
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      text?: string;
      muted?: string;
    };
  };
  widgets: WidgetConfig[];
  debug?: {
    dumpFrameData?: boolean;
    dumpNormalizedActivity?: boolean;
  };
};
