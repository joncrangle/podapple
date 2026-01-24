import { useKeyboard, useRenderer } from "@opentui/solid";
import { actions, state } from "@/store";
import { setTheme } from "@/theme/colors";
import { Themes } from "@/theme/themes";
import type { useAppLogic } from "./useAppLogic";

const DEBOUNCE_INTERVAL = 50; // ms for most keys
const REFRESH_DEBOUNCE = 1000; // 1s for refresh to prevent spamming
const NAVIGATION_DEBOUNCE = 30; // ms for faster scrolling

const lastPressTimes = new Map<string, number>();

const NAVIGATION_KEYS = new Set(["up", "down", "left", "right", "j", "k", "h", "l", "tab"]);

/**
 * Hook to handle global keyboard shortcuts and navigation based on the current app state.
 */
export const useAppKeyboard = (logic: ReturnType<typeof useAppLogic>) => {
  const renderer = useRenderer();

  useKeyboard((event) => {
    const now = Date.now();
    const lastPress = lastPressTimes.get(event.name) || 0;

    let interval = DEBOUNCE_INTERVAL;
    if (event.name === "r") {
      interval = REFRESH_DEBOUNCE;
    } else if (NAVIGATION_KEYS.has(event.name)) {
      interval = NAVIGATION_DEBOUNCE;
    }

    if (now - lastPress < interval) {
      return;
    }
    lastPressTimes.set(event.name, now);

    let label = event.name;
    if (event.meta) label = `Meta+${label}`;
    if (event.ctrl) label = `Ctrl+${label}`;
    if (event.shift) label = `Shift+${label}`;
    actions.setLastKey(label);

    const key = event.name;
    const ctrl = event.ctrl;
    const view = state.appView;
    const focused = state.focusedPane;
    const raw = event.raw;

    // Handle Ctrl+C globally
    if (raw === "\u0003" || (ctrl && (key === "c" || key === "C"))) {
      renderer.destroy();
      process.exit(0);
    }

    // Handle 'q' to quit globally (unless in a view where 'q' might be needed for input, which we don't have)
    if (key === "q") {
      renderer.destroy();
      process.exit(0);
    }

    // Theme selection view
    if (view === "themeSelection") {
      if (key === "escape") {
        setTheme(state.lastSavedTheme);
        actions.setAppView("normal");
        return;
      }

      if (key === "up" || key === "k") {
        actions.setThemeMenuIndex((i) => Math.max(0, i - 1));
        return;
      }

      if (key === "down" || key === "j") {
        actions.setThemeMenuIndex((i) => Math.min(Object.keys(Themes).length - 1, i + 1));
        return;
      }

      if (key === "return" || key === "enter") {
        const themeName = Object.keys(Themes)[state.themeMenuIndex];
        if (themeName) {
          setTheme(themeName);
          logic.saveTheme(themeName);
          actions.setAppView("normal");
        }
        return;
      }

      return;
    }

    // Syncing view
    if (view === "syncing" || view === "transferring") {
      if (key === "escape") {
        logic.cancelSync();
      }
      return;
    }

    // Normal view
    if (view === "normal") {
      // Toggle theme selector
      if (ctrl && key === "t") {
        const themeNames = Object.keys(Themes);
        const currentIndex = themeNames.indexOf(state.lastSavedTheme);
        actions.setThemeMenuIndex(currentIndex >= 0 ? currentIndex : 0);
        actions.setAppView("themeSelection");
        return;
      }

      if (key === "up" || key === "k") {
        if (focused === "mac") {
          actions.setMacIndex((i) => (state.macPodcasts.length > 0 ? Math.max(0, i - 1) : 0));
        } else {
          actions.setDriveIndex((i) => (state.drivePodcasts.length > 0 ? Math.max(0, i - 1) : 0));
        }
        return;
      }

      if (key === "down" || key === "j") {
        if (focused === "mac") {
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
        actions.setFocusedPane(focused === "mac" ? "drive" : "mac");
        return;
      }

      if (key === "f") {
        actions.setAppView("driveSelection");
        logic.scanForDrives();
        return;
      }

      if (key === "r") {
        logic.refreshData();
        return;
      }

      if (key === "s") {
        if (focused === "mac") {
          const selectedEpisodes = state.macPodcasts.filter((e) => e.selected);
          if (selectedEpisodes.length > 0) {
            logic.startSync(selectedEpisodes);
          }
        }
        return;
      }

      if (key === "d") {
        if (focused === "drive") {
          const selectedEpisodes = state.drivePodcasts.filter((ep) => ep.selected);
          if (selectedEpisodes.length > 0) {
            actions.setAppView("confirm");
          }
        }
        return;
      }

      if (key === "space") {
        if (focused === "mac") {
          actions.toggleMacSelection(state.macIndex);
        } else {
          actions.toggleDriveSelection(state.driveIndex);
        }
        return;
      }

      if (key === "a") {
        if (focused === "mac") {
          actions.setMacPodcasts((prev) => prev.map((ep) => ({ ...ep, selected: true })));
        } else {
          actions.setDrivePodcasts((prev) => prev.map((ep) => ({ ...ep, selected: true })));
        }
        return;
      }

      if (key === "escape") {
        if (focused === "mac") {
          actions.setMacPodcasts((prev) => prev.map((ep) => ({ ...ep, selected: false })));
        } else {
          actions.setDrivePodcasts((prev) => prev.map((ep) => ({ ...ep, selected: false })));
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
    }

    // Drive selection view
    if (view === "driveSelection") {
      if (key === "escape") {
        actions.setAppView("normal");
        return;
      }

      if (key === "up" || key === "k") {
        actions.setDriveMenuIndex((i) => Math.max(0, i - 1));
        return;
      }

      if (key === "down" || key === "j") {
        actions.setDriveMenuIndex((i) => Math.min(state.drives.length - 1, i + 1));
        return;
      }

      if (key === "return" || key === "enter") {
        const drive = state.drives[state.driveMenuIndex];
        if (drive) {
          actions.setCurrentDrive(drive);
          actions.setAppView("normal");
          logic.loadDrivePodcasts(drive);
        }
        return;
      }

      if (ctrl && (key === "f" || key === "F")) {
        const drive = state.drives[state.driveMenuIndex];
        if (drive) {
          logic.toggleFavoriteDrive(drive.id);
        }
        return;
      }
    }

    // Confirm popup
    if (view === "confirm") {
      if (key === "return" || key === "enter" || key === "y") {
        logic.deleteSelectedFromDrive();
        return;
      }
      if (key === "escape" || key === "n") {
        actions.setAppView("normal");
        return;
      }
    }

    // Debug popup
    if (view === "debug") {
      if (key === "escape") {
        actions.setAppView("normal");
        return;
      }

      if (key === "up" || key === "k") {
        actions.setDebugMenuIndex((i) => Math.max(0, i - 1));
        return;
      }

      if (key === "down" || key === "j") {
        actions.setDebugMenuIndex((i) => Math.min(state.debugMessages.length - 1, i + 1));
        return;
      }
    }
  });
};
