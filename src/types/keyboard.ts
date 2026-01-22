import type { Drive } from "./drive";
import type { SyncProgress } from "./sync";

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

// Legacy aliases for backward compatibility
export type ViewType = AppView | "main" | "podcasts" | "episodes" | "drives" | "sync";

export interface AppState {
  view: ViewType;
  focusedPane: FocusedPane;
  macSelectedIndex: number;
  driveSelectedIndex: number;
  selectedDrive: Drive | null;
  syncProgress: SyncProgress | null;
}
