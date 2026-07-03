export interface Palette {
  main: string;
  mid: string;
  dark: string;
  deepDark: string;
  highlight: string;
  purple: string;
  pink: string;
  glow: string;
  glowRgba: string;
}

export const palettes: Record<string, Palette> = {
  idle: {
    main: "#6C6EF5",
    mid: "#5558E0",
    dark: "#2D1B69",
    deepDark: "#1A0E3E",
    highlight: "#C5C1FF",
    purple: "#A855F7",
    pink: "#EC4899",
    glow: "#7C6EF5",
    glowRgba: "rgba(108, 110, 245, 0.5)",
  },
  listening: {
    main: "#5B9EF5",
    mid: "#3B7DE0",
    dark: "#1A3A6E",
    deepDark: "#0E1F3D",
    highlight: "#B8DBFF",
    purple: "#8B5CF6",
    pink: "#F062C0",
    glow: "#5B9EF5",
    glowRgba: "rgba(91, 158, 245, 0.55)",
  },
  thinking: {
    main: "#F5A062",
    mid: "#E08030",
    dark: "#6B2F0A",
    deepDark: "#3D1A04",
    highlight: "#FFE0C0",
    purple: "#C16BFF",
    pink: "#F062A0",
    glow: "#F5A062",
    glowRgba: "rgba(245, 160, 98, 0.55)",
  },
  speaking: {
    main: "#4ED090",
    mid: "#2EA870",
    dark: "#0F4A2E",
    deepDark: "#072A18",
    highlight: "#B0FFD4",
    purple: "#8B6CF6",
    pink: "#F070B0",
    glow: "#4ED090",
    glowRgba: "rgba(78, 208, 144, 0.55)",
  },
  error: {
    main: "#F56060",
    mid: "#D94040",
    dark: "#6B1515",
    deepDark: "#3D0A0A",
    highlight: "#FFC0C0",
    purple: "#C16BFF",
    pink: "#F06290",
    glow: "#F56060",
    glowRgba: "rgba(245, 96, 96, 0.55)",
  },
};
