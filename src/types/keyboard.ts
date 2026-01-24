export type AppView =
  | "normal"
  | "driveSelection"
  | "syncing"
  | "transferring"
  | "confirm"
  | "themeSelection"
  | "debug";

/**
 * Focused pane in dual-pane layout.
 */
export type FocusedPane = "mac" | "drive";
