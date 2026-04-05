import type { CSSProperties, ReactNode } from "react";

import type { WidgetConfig } from "../../config/schema.js";
import type { FrameData, FrameSnapshot } from "../../domain/frame-data.js";
import type { OverlayTheme } from "../theme/default.js";

export type BaseWidgetProps<TConfig extends WidgetConfig> = {
  frame: FrameSnapshot;
  frameData: FrameData;
  config: TConfig;
  theme: OverlayTheme;
};

type WidgetShellProps = {
  config: WidgetConfig;
  theme: OverlayTheme;
  label: string | undefined;
  value: string;
  unit: string | undefined;
  secondary: ReactNode | undefined;
  valueColor: string | undefined;
};

export const WidgetShell = ({
  config,
  theme,
  label,
  value,
  unit,
  secondary,
  valueColor,
}: WidgetShellProps): ReactNode => {
  const containerStyle: CSSProperties = {
    position: "absolute",
    left: config.x,
    top: config.y,
    width: config.width,
    height: config.height,
    opacity: config.opacity,
    padding: config.padding,
    backgroundColor: config.backgroundColor,
    borderColor: config.borderColor,
    borderWidth: config.borderWidth,
    borderStyle: "solid",
    borderRadius: config.borderRadius,
    color: config.valueColor ?? theme.colors.text,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxSizing: "border-box",
    fontFamily: config.fontFamily ?? theme.fontFamily,
    backdropFilter: "blur(10px)",
  };

  const labelStyle: CSSProperties = {
    fontSize: config.labelFontSize,
    color: config.labelColor ?? theme.colors.secondary,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };

  const valueRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  };

  const valueStyle: CSSProperties = {
    fontSize: config.valueFontSize,
    color: valueColor ?? config.valueColor ?? theme.colors.text,
    fontWeight: 700,
    lineHeight: 1,
  };

  const unitStyle: CSSProperties = {
    fontSize: config.unitFontSize,
    color: config.unitColor ?? theme.colors.secondary,
    fontWeight: 500,
    whiteSpace: "nowrap",
  };

  const secondaryStyle: CSSProperties = {
    fontSize: config.unitFontSize,
    color: config.unitColor ?? theme.colors.muted,
    fontWeight: 500,
  };

  return (
    <div style={containerStyle}>
      <div>{config.showLabel && label ? <div style={labelStyle}>{label}</div> : null}</div>
      <div style={valueRowStyle}>
        <div style={valueStyle}>{value}</div>
        {unit ? <div style={unitStyle}>{unit}</div> : null}
      </div>
      <div style={secondaryStyle}>{secondary ?? ""}</div>
    </div>
  );
};
