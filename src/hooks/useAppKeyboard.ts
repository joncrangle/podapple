import { useKeyboard, useRenderer } from "@opentui/solid";
import { actions, state } from "@/store";
import { setTheme, Themes } from "@/theme/colors";
import { copyToClipboard } from "@/utils/clipboard";
import { quitApp } from "@/utils/terminal";
import type { useAppLogic } from "./useAppLogic";

const DEBOUNCE_INTERVAL = 50;
const REFRESH_DEBOUNCE = 1000;
const NAVIGATION_DEBOUNCE = 30;

const lastPressTimes = new Map<string, number>();

const NAVIGATION_KEYS = new Set([
  "up",
  "down",
  "left",
  "right",
  "j",
  "k",
  "h",
  "l",
  "tab",
  "pageup",
  "pagedown",
]);

export const useAppKeyboard = (logic: ReturnType<typeof useAppLogic>) => {
  const renderer = useRenderer();

  const handleGlobalActions = (key: string, ctrl: boolean): boolean => {
    if (key === "q" || (ctrl && (key === "c" || key === "C"))) {
      quitApp(renderer);
      return true;
    }
    return false;
  };

  const handleThemeSelectionActions = (key: string): void => {
    if (key === "escape") {
      setTheme(state.lastSavedTheme);
      actions.setAppView("normal");
    } else if (key === "up" || key === "k") {
      actions.setThemeMenuIndex((i) => Math.max(0, i - 1));
    } else if (key === "down" || key === "j") {
      actions.setThemeMenuIndex((i) => Math.min(Themes.length - 1, i + 1));
    } else if (key === "return" || key === "enter") {
      const themeName = Themes[state.themeMenuIndex];
      if (themeName) {
        setTheme(themeName);
        logic.saveTheme(themeName);
        actions.setAppView("normal");
      }
    }
  };

  const handleSyncingActions = (key: string): void => {
    if (key === "escape") {
      logic.cancelSync();
    }
  };

  const handleNormalActions = (key: string, ctrl: boolean): void => {
    if (ctrl && key === "t") {
      const currentIndex = (Themes as string[]).indexOf(state.lastSavedTheme);
      actions.setThemeMenuIndex(currentIndex >= 0 ? currentIndex : 0);
      actions.setAppView("themeSelection");
      return;
    }

    if (key === "f1") {
      actions.setDebugMenuIndex(Math.max(0, state.debugMessages.length - 1));
      actions.setAppView("debug");
      return;
    }

    if (key === "up" || key === "k") {
      if (state.focusedPane === "mac") {
        actions.setMacIndex((i) => (state.macPodcasts.length > 0 ? Math.max(0, i - 1) : 0));
      } else {
        actions.setDriveIndex((i) => (state.drivePodcasts.length > 0 ? Math.max(0, i - 1) : 0));
      }
      return;
    }

    if (key === "down" || key === "j") {
      if (state.focusedPane === "mac") {
        actions.setMacIndex((i) =>
          state.macPodcasts.length > 0 ? Math.min(state.macPodcasts.length - 1, i + 1) : 0,
        );
      } else {
        actions.setDriveIndex((i) =>
          state.drivePodcasts.length > 0 ? Math.min(state.drivePodcasts.length - 1, i + 1) : 0,
        );
      }
      return;
    }

    if (key === "left" || key === "h") {
      actions.setFocusedPane("mac");
      return;
    }

    if (key === "right" || key === "l") {
      actions.setFocusedPane("drive");
      return;
    }

    if (key === "tab") {
      actions.setFocusedPane(state.focusedPane === "mac" ? "drive" : "mac");
      return;
    }

    if (key === "f") {
      actions.setDriveMenuIndex(0);
      actions.setAppView("driveSelection");
      logic.scanForDrives();
      return;
    }

    if (key === "r") {
      logic.refreshData();
      return;
    }

    if (key === "s") {
      if (state.focusedPane === "mac") {
        const selectedEpisodes = state.macPodcasts.filter((e) => e.selected);
        if (selectedEpisodes.length > 0) {
          logic.startSync(selectedEpisodes);
        }
      }
      return;
    }

    if (key === "d") {
      if (state.focusedPane === "drive") {
        const selectedEpisodes = state.drivePodcasts.filter((ep) => ep.selected);
        if (selectedEpisodes.length > 0) {
          actions.setAppView("confirm");
        }
      }
      return;
    }

    if (key === "space") {
      if (state.focusedPane === "mac") {
        actions.toggleMacSelection(state.macIndex);
      } else {
        actions.toggleDriveSelection(state.driveIndex);
      }
      return;
    }

    if (key === "a") {
      if (state.focusedPane === "mac") {
        actions.toggleAllMacSelection();
      } else {
        actions.toggleAllDriveSelection();
      }
      return;
    }

    if (key === "escape") {
      if (state.focusedPane === "mac") {
        actions.clearMacSelection();
      } else {
        actions.clearDriveSelection();
      }
      return;
    }

    if (key === "x") {
      if (Bun.env.DEBUG === "true") {
        actions.setDebugMenuIndex(Math.max(0, state.debugMessages.length - 1));
        actions.setAppView("debug");
      }
      return;
    }
  };

  const handleDriveSelectionActions = (key: string, ctrl: boolean): void => {
    if (key === "escape") {
      actions.setAppView("normal");
    } else if (key === "up" || key === "k") {
      actions.setDriveMenuIndex((i) => Math.max(0, i - 1));
    } else if (key === "down" || key === "j") {
      actions.setDriveMenuIndex((i) => Math.min(state.drives.length - 1, i + 1));
    } else if (key === "return" || key === "enter") {
      const drive = state.drives[state.driveMenuIndex];
      if (drive) {
        actions.setCurrentDrive(drive);
        actions.setAppView("normal");
        logic.loadDrivePodcasts(drive);
      }
    } else if (ctrl && (key === "f" || key === "F")) {
      const drive = state.drives[state.driveMenuIndex];
      if (drive) {
        logic.toggleFavoriteDrive(drive.id);
      }
    }
  };

  const handleConfirmActions = (key: string): void => {
    if (key === "return" || key === "enter" || key === "y") {
      logic.deleteSelectedFromDrive();
    } else if (key === "escape" || key === "n") {
      actions.setAppView("normal");
    }
  };

  const handleDebugActions = (key: string): void => {
    if (key === "escape") {
      actions.setAppView("normal");
    } else if (key === "up" || key === "k") {
      actions.setDebugMenuIndex((i) => Math.max(0, i - 1));
    } else if (key === "down" || key === "j") {
      actions.setDebugMenuIndex((i) => Math.min(state.debugMessages.length - 1, i + 1));
    } else if (key === "return" || key === "enter") {
      const message = state.debugMessages[state.debugMenuIndex];
      if (message) {
        copyToClipboard(message.message).then((success) => {
          if (success) {
            actions.addDebugMessage("Copied to clipboard", "info");
          }
        });
      }
    }
  };

  const handleAction = (key: string, ctrl = false) => {
    if (handleGlobalActions(key, ctrl)) return;

    switch (state.appView) {
      case "themeSelection":
        handleThemeSelectionActions(key);
        break;
      case "syncing":
      case "transferring":
        handleSyncingActions(key);
        break;
      case "normal":
        handleNormalActions(key, ctrl);
        break;
      case "driveSelection":
        handleDriveSelectionActions(key, ctrl);
        break;
      case "confirm":
        handleConfirmActions(key);
        break;
      case "debug":
        handleDebugActions(key);
        break;
    }
  };

  useKeyboard((event) => {
    if (event.ctrl && event.name === "u") {
      event.name = "pageup";
      event.ctrl = false;
    } else if (event.ctrl && event.name === "d") {
      event.name = "pagedown";
      event.ctrl = false;
    }

    const now = Date.now();
    const lastPress = lastPressTimes.get(event.name) || 0;

    let interval = DEBOUNCE_INTERVAL;
    if (event.name === "r") {
      interval = REFRESH_DEBOUNCE;
    } else if (NAVIGATION_KEYS.has(event.name)) {
      interval = NAVIGATION_DEBOUNCE;
    }

    if (now - lastPress < interval) return;
    lastPressTimes.set(event.name, now);

    let label = event.name;
    if (event.meta) label = `Meta+${label}`;
    if (event.ctrl) label = `Ctrl+${label}`;
    if (event.shift) label = `Shift+${label}`;
    actions.setLastKey(label);

    handleAction(event.name, event.ctrl);
  });

  return { handleAction };
};
