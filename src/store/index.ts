import type { Fiber } from "effect";
import { createStore } from "solid-js/store";
import type { DebugMessage } from "@/components/DebugPopup";
import type { Drive } from "@/types/drive";
import type { AppView, FocusedPane } from "@/types/keyboard";
import type { PodcastEpisode } from "@/types/podcast";

export interface TransferProgress {
  currentFile: string;
  filesDone: number;
  totalFiles: number;
  bytesTransferred: number;
  totalBytes: number;
  speed: number;
}

export interface AppState {
  appView: AppView;
  focusedPane: FocusedPane;
  macIndex: number;
  driveIndex: number;
  driveMenuIndex: number;
  macPodcasts: PodcastEpisode[];
  drivePodcasts: PodcastEpisode[];
  drives: Drive[];
  currentDrive: Drive | null;
  loadingMac: boolean;
  loadingDrive: boolean;
  isScanning: boolean;
  transferProgress: TransferProgress;
  syncFiber: Fiber.RuntimeFiber<unknown, unknown> | null;
  errorMsg: string;
  debugMessages: DebugMessage[];
  lastKey: string | null;
  lastSavedTheme: string;
  themeMenuIndex: number;
  debugMenuIndex: number;
  favoriteDrives: string[];
}

const initialState: AppState = {
  appView: "normal",
  focusedPane: "mac",
  macIndex: 0,
  driveIndex: 0,
  driveMenuIndex: 0,
  themeMenuIndex: 0,
  debugMenuIndex: 0,
  macPodcasts: [],
  drivePodcasts: [],
  drives: [],
  currentDrive: null,
  loadingMac: true,
  loadingDrive: true,
  isScanning: false,
  transferProgress: {
    currentFile: "",
    filesDone: 0,
    totalFiles: 0,
    bytesTransferred: 0,
    totalBytes: 0,
    speed: 0,
  },
  syncFiber: null,
  errorMsg: "",
  debugMessages: [],
  lastKey: null,
  lastSavedTheme: "Catppuccin",
  favoriteDrives: [],
};

export const [state, setState] = createStore<AppState>(initialState);

export const actions = {
  setAppView: (view: AppView) => setState("appView", view),
  setFocusedPane: (pane: FocusedPane) => setState("focusedPane", pane),
  setMacIndex: (index: number | ((prev: number) => number)) => setState("macIndex", index),
  setDriveIndex: (index: number | ((prev: number) => number)) => setState("driveIndex", index),
  setDriveMenuIndex: (index: number | ((prev: number) => number)) =>
    setState("driveMenuIndex", index),
  setThemeMenuIndex: (index: number | ((prev: number) => number)) =>
    setState("themeMenuIndex", index),
  setDebugMenuIndex: (index: number | ((prev: number) => number)) =>
    setState("debugMenuIndex", index),
  setMacPodcasts: (episodes: PodcastEpisode[] | ((prev: PodcastEpisode[]) => PodcastEpisode[])) =>
    setState("macPodcasts", episodes),
  setDrivePodcasts: (episodes: PodcastEpisode[] | ((prev: PodcastEpisode[]) => PodcastEpisode[])) =>
    setState("drivePodcasts", episodes),
  setDrives: (drives: Drive[] | ((prev: Drive[]) => Drive[])) => setState("drives", drives),
  setCurrentDrive: (drive: Drive | null | ((prev: Drive | null) => Drive | null)) =>
    setState("currentDrive", drive),
  setLoadingMac: (loading: boolean) => setState("loadingMac", loading),
  setLoadingDrive: (loading: boolean) => setState("loadingDrive", loading),
  setIsScanning: (scanning: boolean) => setState("isScanning", scanning),
  updateTransferProgress: (progress: Partial<TransferProgress>) =>
    setState("transferProgress", (prev) => ({ ...prev, ...progress })),
  setSyncFiber: (fiber: Fiber.RuntimeFiber<unknown, unknown> | null) =>
    setState("syncFiber", fiber),
  setErrorMsg: (msg: string) => setState("errorMsg", msg),
  addDebugMessage: (message: string, type: DebugMessage["type"] = "info") => {
    setState("debugMessages", (prev) => [...prev, { timestamp: Date.now(), message, type }]);
  },
  clearDebugMessages: () => setState("debugMessages", []),
  setLastKey: (key: string | null) => setState("lastKey", key),
  setLastSavedTheme: (theme: string) => setState("lastSavedTheme", theme),
  setFavoriteDrives: (drives: string[]) => setState("favoriteDrives", drives),
  toggleFavoriteDrive: (driveId: string) => {
    setState("favoriteDrives", (prev) => {
      if (prev.includes(driveId)) {
        return prev.filter((id) => id !== driveId);
      }
      return [...prev, driveId];
    });
  },
  toggleMacSelection: (index: number) => {
    setState("macPodcasts", index, "selected", (s) => !s);
  },
  toggleAllMacSelection: () => {
    const allSelected = state.macPodcasts.every((p) => p.selected);
    setState("macPodcasts", (prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
  },
  clearMacSelection: () => {
    setState("macPodcasts", (prev) => prev.map((p) => ({ ...p, selected: false })));
  },
  toggleDriveSelection: (index: number) => {
    setState("drivePodcasts", index, "selected", (s) => !s);
  },
  toggleAllDriveSelection: () => {
    const allSelected = state.drivePodcasts.every((p) => p.selected);
    setState("drivePodcasts", (prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
  },
  clearDriveSelection: () => {
    setState("drivePodcasts", (prev) => prev.map((p) => ({ ...p, selected: false })));
  },
  resetState: () => setState(initialState),
};
