export type AppView =
  | "normal"
  | "driveSelection"
  | "syncing"
  | "transferring"
  | "confirm"
  | "themeSelection"
  | "debug"
  | "main"
  | "podcasts"
  | "episodes"
  | "drives"
  | "sync";

/**
 * Focused pane in dual-pane layout.
 */
export type FocusedPane = "mac" | "drive";
