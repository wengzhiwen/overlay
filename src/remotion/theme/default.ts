export type OverlayTheme = {
  fontFamily: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    muted: string;
  };
};

export const defaultTheme: OverlayTheme = {
  fontFamily: "sans-serif",
  colors: {
    primary: "#ffffff",
    secondary: "#d1d5db",
    accent: "#22c55e",
    text: "#ffffff",
    muted: "#9ca3af",
  },
};
