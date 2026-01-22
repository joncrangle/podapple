export interface ThemePalette {
  bg: string;
  bgDark: string;
  bgDarkest: string;
  fg: string;
  fgDim: string;
  fgMedium: string;
  bgLight: string;
  bgLighter: string;
  bgLightest: string;
  fgMuted: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  purple: string;
  pink: string;
  orange: string;
  accent: string;
  headerBg: string;
}

export const MochaPalette: ThemePalette = {
  bg: "#1e1e2e",
  bgDark: "#181825",
  bgDarkest: "#11111b",
  fg: "#cdd6f4",
  fgDim: "#a6adc8",
  fgMedium: "#bac2de",
  bgLight: "#313244",
  bgLighter: "#45475a",
  bgLightest: "#585b70",
  fgMuted: "#6c7086",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  purple: "#cba6f7",
  pink: "#f5c2e7",
  orange: "#fab387",
  accent: "#f2cdcd",
  headerBg: "#6b5885",
};

export const TokyoNightPalette: ThemePalette = {
  bg: "#1a1b26",
  bgDark: "#16161e",
  bgDarkest: "#0d0f17",
  fg: "#a9b1d6",
  fgDim: "#787c99",
  fgMedium: "#787c99",
  bgLight: "#3b4261",
  bgLighter: "#24283b",
  bgLightest: "#414868",
  fgMuted: "#565f89",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  purple: "#bb9af7",
  pink: "#ff007c",
  orange: "#e0af68",
  accent: "#bb9af7",
  headerBg: "#3d59a1",
};

export const KanagawaPalette: ThemePalette = {
  bg: "#1f1f28",
  bgDark: "#181820",
  bgDarkest: "#16161d",
  fg: "#dcd7ba",
  fgDim: "#a6a69c",
  fgMedium: "#a6a69c",
  bgLight: "#2a2a37",
  bgLighter: "#22222a",
  bgLightest: "#363646",
  fgMuted: "#727169",
  red: "#c34043",
  green: "#76946a",
  yellow: "#c0a36e",
  blue: "#7e9cd8",
  purple: "#957fb8",
  pink: "#d27e99",
  orange: "#c0a36e",
  accent: "#957fb8",
  headerBg: "#223249",
};

export const NordPalette: ThemePalette = {
  bg: "#2e3440",
  bgDark: "#242933",
  bgDarkest: "#1b1e23",
  fg: "#d8dee9",
  fgDim: "#9ea4af",
  fgMedium: "#9ea4af",
  bgLight: "#3b4252",
  bgLighter: "#434c5e",
  bgLightest: "#4c566a",
  fgMuted: "#4c566a",
  red: "#bf616a",
  green: "#a3be8c",
  yellow: "#ebcb8b",
  blue: "#81a1c1",
  purple: "#b48ead",
  pink: "#d08770",
  orange: "#ebcb8b",
  accent: "#b48ead",
  headerBg: "#3b4252",
};

export const createTheme = (palette: ThemePalette) => ({
  background: palette.bg,
  focused: palette.bgDark,
  foreground: palette.fg,
  text: {
    primary: palette.fg,
    secondary: palette.fgDim,
    dim: palette.fgMuted,
    inverse: palette.bg,
    error: palette.red,
    warning: palette.yellow,
    success: palette.green,
    accent: palette.purple,
  },
  border: {
    focused: palette.pink,
    unfocused: palette.bgLighter,
    highlight: palette.accent,
    info: palette.blue,
    error: palette.red,
  },
  list: {
    focused: palette.purple,
    selected: palette.accent,
    focusedSelected: palette.pink,
    markerSelected: palette.orange,
    markerUnfocused: palette.purple,
    scrollBarThumb: palette.purple,
    scrollBarTrack: palette.bgLightest,
  },
  header: {
    background: palette.headerBg,
    text: palette.fg,
  },
  popup: {
    border: palette.pink,
    background: palette.bgDark,
  },
  progressBar: {
    filled: palette.purple,
    empty: palette.bgLight,
  },
  footer: {
    key: palette.yellow,
    text: palette.fgDim,
    separator: palette.accent,
  },
  status: {
    debug: palette.red,
    drive: palette.accent,
    app: palette.blue,
    new: palette.green,
    synced: palette.fgMuted,
    error: palette.red,
    warning: palette.yellow,
    selected: palette.purple,
  },
});

export const Themes = {
  "Catppuccin Mocha": createTheme(MochaPalette),
  "Tokyo Night": createTheme(TokyoNightPalette),
  Kanagawa: createTheme(KanagawaPalette),
  Nord: createTheme(NordPalette),
} as const;
