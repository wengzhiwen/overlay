import type { CSSProperties, ReactNode } from "react";

import type { WidgetConfig } from "../../config/schema.js";
import type { FrameData, FrameSnapshot } from "../../domain/frame-data.js";
import type { OverlayTheme } from "../theme/default.js";

export type BaseWidgetProps<TConfig extends WidgetConfig> = {
  frame: FrameSnapshot;
  frameData: FrameData;
  config: TConfig;
  theme: OverlayTheme;
  isEmpty: boolean;
};

type WidgetShellProps = {
  config: WidgetConfig;
  theme: OverlayTheme;
  label: string | undefined;
  value: string;
  unit: string | undefined;
  secondary: ReactNode | undefined;
  isEmpty?: boolean | undefined;
  valueColor: string | undefined;
  verticalLayout?: "spread" | "compact";
  secondaryPlacement?: "flow" | "bottom";
};

export const WidgetShell = ({
  config,
  theme,
  label,
  value,
  unit,
  secondary,
  isEmpty = false,
  valueColor,
  verticalLayout = "spread",
  secondaryPlacement = "flow",
}: WidgetShellProps): ReactNode => {
  const isCompactLayout = verticalLayout === "compact";
  const resolvedValueColor = valueColor ?? config.valueColor ?? theme.colors.text;

  const containerStyle: CSSProperties = {
    position: "absolute",
    left: config.x,
    top: config.y,
    width: config.width,
    height: config.height,
    opacity: isEmpty ? config.opacity * 0.3 : config.opacity,
    padding: config.padding,
    backgroundColor: config.backgroundColor,
    borderColor: config.borderColor,
    borderWidth: config.borderWidth,
    borderStyle: "solid",
    borderRadius: config.borderRadius,
    color: resolvedValueColor,
    display: "flex",
    flexDirection: "column",
    justifyContent: isCompactLayout ? "flex-start" : "space-between",
    gap: isCompactLayout ? 6 : undefined,
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
    color: resolvedValueColor,
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
    marginTop: secondaryPlacement === "bottom" ? "auto" : undefined,
    display: "flex",
    alignItems: "flex-end",
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
