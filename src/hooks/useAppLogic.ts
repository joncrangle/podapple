import { Cause, Effect, Exit, Fiber, Layer, Stream } from "effect";
import { onMount } from "solid-js";
import {
  DriveDetection,
  DriveDetectionLive,
  type DriveEvent,
  DriveScan,
  DriveScanLive,
  type EpisodeMatcher,
  EpisodeMatcherLive,
  FileSystem,
  FileSystemLive,
  Logger,
  LoggerLive,
  type MetadataEditor,
  MetadataEditorLive,
  PodcastService,
  PodcastServiceLive,
  SettingsService,
  SettingsServiceLive,
  SyncEngine,
  SyncEngineLive,
} from "@/services/effects";
import { actions, state } from "@/store";
import { setTheme } from "@/theme/colors";
import type { Drive } from "@/types/drive";
import type { PodcastEpisode } from "@/types/podcast";
import {
  groupEpisodesByPodcast,
  mapPodcastsToEpisodes,
  markEpisodesOnDrive,
} from "@/utils/formatting";

// Common layer for all services
/**
 * Base layer providing core services like FileSystem, Logger, etc.
 */
const Base = Layer.mergeAll(FileSystemLive, EpisodeMatcherLive, MetadataEditorLive).pipe(
  Layer.provideMerge(LoggerLive),
);
/**
 * Detection layer for drive appearance/disappearance.
 */
const Detection = DriveDetectionLive.pipe(Layer.provide(Base));
/**
 * Podcast layer for local database access.
 */
const Podcast = PodcastServiceLive.pipe(Layer.provide(Base));
/**
 * Scan layer for drive content analysis.
 */
const Scan = DriveScanLive.pipe(Layer.provide(Base));
/**
 * Sync layer for engine execution.
 */
const Sync = SyncEngineLive.pipe(Layer.provide(Layer.mergeAll(Base, Scan)));
/**
 * Settings layer for configuration management.
 */
const Settings = SettingsServiceLive.pipe(Layer.provide(Base));

/**
 * Combined application layer providing all required services.
 */
const AppLayer = Layer.mergeAll(Base, Detection, Podcast, Scan, Sync, Settings);

type AppRequirements =
  | FileSystem
  | DriveDetection
  | DriveScan
  | PodcastService
  | SettingsService
  | SyncEngine
  | EpisodeMatcher
  | MetadataEditor
  | Logger;

/**
 * Hook containing the core application logic, orchestrating various Effect services.
 */
export const useAppLogic = () => {
  /**
   * Runs an effect to completion using the AppLayer.
   */
  const run = <A, E, R extends AppRequirements>(effect: Effect.Effect<A, E, R>) =>
    Effect.runPromise(Effect.provide(effect, AppLayer as unknown as Layer.Layer<R>));

  /**
   * Runs an effect as a fiber using the AppLayer.
   */
  const runFork = <A, E, R extends AppRequirements>(effect: Effect.Effect<A, E, R>) =>
    Effect.runFork(Effect.provide(effect, AppLayer as unknown as Layer.Layer<R>));

  /**
   * Helper for view transitions that ensures a view is set during effect execution
   * and reset to 'normal' afterwards.
   */
  const withView =
    (view: typeof state.appView) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.acquireUseRelease(
        Effect.sync(() => actions.setAppView(view)),
        () => effect,
        () => Effect.sync(() => actions.setAppView("normal")),
      );

  /**
   * Loads podcasts from a drive using the DriveScan service.
   */
  const loadDrivePodcastsEffect = (drive: Drive) =>
    Effect.gen(function* () {
      const logger = yield* Logger;
      actions.setLoadingDrive(true);
      const driveScan = yield* DriveScan;
      const podcasts = yield* driveScan.scanDrive(drive.mountPoint);
      const episodes = mapPodcastsToEpisodes(podcasts);

      actions.setDrivePodcasts(episodes);
      yield* logger.debug(`Loaded ${episodes.length} drive episodes`);

      // Mark Mac podcasts that are on the drive
      const updated = markEpisodesOnDrive(state.macPodcasts, episodes);
      actions.setMacPodcasts(updated);
    }).pipe(
      Effect.catchAll((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        actions.setErrorMsg(errorMessage);
        actions.addDebugMessage(errorMessage, "error");
        actions.setDrivePodcasts([]);
        return Effect.void;
      }),
      Effect.onExit(() => Effect.sync(() => actions.setLoadingDrive(false))),
    );

  /**
   * Imperative wrapper for loadDrivePodcastsEffect.
   */
  const loadDrivePodcasts = (drive: Drive) => run(loadDrivePodcastsEffect(drive));

  /**
   * Scans for drives and handles auto-selection of favorites.
   */
  const scanForDrives = () =>
    Effect.gen(function* () {
      const logger = yield* Logger;
      actions.setIsScanning(true);
      const detection = yield* DriveDetection;
      const detectedDrives = yield* detection.scanDrives();

      // Sort favorites to the top
      const sortedDrives = [...detectedDrives].sort((a, b) => {
        const aFav = state.favoriteDrives.includes(a.id);
        const bFav = state.favoriteDrives.includes(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return 0;
      });

      actions.setDrives(sortedDrives);
      actions.setDriveMenuIndex(0);
      yield* logger.debug(`Found ${sortedDrives.length} drives`);

      // Auto-select favorited drive if none selected, or fallback to first
      if (sortedDrives.length > 0 && !state.currentDrive) {
        const favoriteDrive = sortedDrives.find((d) => state.favoriteDrives.includes(d.id));
        const driveToSelect = favoriteDrive || sortedDrives[0];

        if (driveToSelect) {
          actions.setCurrentDrive(driveToSelect);
          yield* loadDrivePodcastsEffect(driveToSelect);
        }
      }
    }).pipe(
      Effect.catchAll((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        actions.setErrorMsg(errorMessage);
        actions.addDebugMessage(errorMessage, "error");
        actions.setDrives([]);
        return Effect.void;
      }),
      Effect.onExit(() =>
        Effect.sync(() => {
          actions.setIsScanning(false);
          actions.setLoadingDrive(false);
        }),
      ),
    );

  /**
   * Listens for drive appearance/disappearance events in the background.
   */
  const listenForDrives = () =>
    Effect.gen(function* () {
      const detection = yield* DriveDetection;
      const logger = yield* Logger;

      yield* Stream.runForEach(detection.driveEvents, (event: DriveEvent) =>
        Effect.gen(function* () {
          if (event._tag === "Appeared") {
            const drive = event.drive;
            actions.setDrives((prev) => {
              const filtered = prev.filter((d) => d.id !== drive.id);
              return [...filtered, drive].sort((a, b) => {
                const aFav = state.favoriteDrives.includes(a.id);
                const bFav = state.favoriteDrives.includes(b.id);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return 0;
              });
            });
            yield* logger.info(`Drive appeared: ${drive.name} (${drive.id})`);

            // Auto-select if no drive is currently selected
            if (!state.currentDrive) {
              actions.setCurrentDrive(drive);
              yield* loadDrivePodcastsEffect(drive);
            }
          } else if (event._tag === "Disappeared") {
            actions.setDrives((prev) => prev.filter((d) => d.id !== event.driveId));
            if (state.currentDrive?.id === event.driveId) {
              actions.setCurrentDrive(null);
              actions.setDrivePodcasts([]);
            }
            yield* logger.info(`Drive disappeared: ${event.driveId}`);
          }
        }),
      );
    }).pipe(
      Effect.catchAll((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        actions.addDebugMessage(`Drive listener error: ${errorMessage}`, "error");
        return Effect.void;
      }),
    );

  /**
   * Loads application settings from disk.
   */
  const loadSettings = () =>
    Effect.gen(function* () {
      const settingsService = yield* SettingsService;
      const settings = yield* settingsService.loadSettings;
      if (settings.theme) {
        setTheme(settings.theme);
        actions.setLastSavedTheme(settings.theme);
      }
      if (settings.favoriteDrives) {
        actions.setFavoriteDrives(settings.favoriteDrives);
      }
      return settings;
    }).pipe(
      Effect.catchAll(() => {
        actions.addDebugMessage("Failed to load settings", "error");
        return Effect.succeed({ theme: "Catppuccin", favoriteDrives: [] });
      }),
    );

  /**
   * Toggles a drive as favorite and saves settings.
   */
  const toggleFavoriteDrive = (driveId: string) => {
    actions.toggleFavoriteDrive(driveId);
    run(
      Effect.gen(function* () {
        const settingsService = yield* SettingsService;
        const logger = yield* Logger;
        yield* settingsService.saveSettings({
          favoriteDrives: [...state.favoriteDrives],
        });
        yield* logger.info(`Toggled favorite: ${driveId}`);
      }).pipe(
        Effect.catchAll(() => {
          actions.addDebugMessage("Failed to save favorites", "error");
          return Effect.void;
        }),
      ),
    );
  };

  /**
   * Saves the selected theme to settings.
   */
  const saveTheme = (themeName: string) =>
    run(
      Effect.gen(function* () {
        const settingsService = yield* SettingsService;
        const logger = yield* Logger;
        yield* settingsService.saveSettings({ theme: themeName });
        actions.setLastSavedTheme(themeName);
        yield* logger.info(`Saved theme: ${themeName}`);
      }).pipe(
        Effect.catchAll(() => {
          actions.addDebugMessage("Failed to save theme", "error");
          return Effect.void;
        }),
      ),
    );

  /**
   * Initializes the application data.
   */
  const initialize = () =>
    run(
      Effect.gen(function* () {
        yield* loadSettings();

        // Start background drive listener
        runFork(listenForDrives());

        const podcastService = yield* PodcastService;
        const available = yield* podcastService.checkAvailability;

        if (available) {
          const episodes = yield* podcastService.loadMacPodcasts;
          actions.setMacPodcasts(episodes);
        }
      }).pipe(
        Effect.catchAll((err) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          actions.setErrorMsg(errorMessage);
          actions.addDebugMessage(errorMessage, "error");
          return Effect.void;
        }),
        Effect.onExit(() => Effect.sync(() => actions.setLoadingMac(false))),
        Effect.tap(() => scanForDrives()),
      ),
    );

  /**
   * Refreshes both Mac and Drive podcast data.
   */
  const refreshData = () => {
    actions.setLoadingMac(true);
    actions.setLoadingDrive(true);
    actions.setErrorMsg("");

    run(
      Effect.gen(function* () {
        const podcastService = yield* PodcastService;
        const episodes = yield* podcastService.loadMacPodcasts;
        actions.setMacPodcasts(episodes);
      }).pipe(
        Effect.catchAll((err) => {
          actions.setErrorMsg(err instanceof Error ? err.message : String(err));
          return Effect.void;
        }),
        Effect.onExit(() => Effect.sync(() => actions.setLoadingMac(false))),
        Effect.tap(() =>
          state.currentDrive
            ? loadDrivePodcastsEffect(state.currentDrive)
            : Effect.sync(() => actions.setLoadingDrive(false)),
        ),
      ),
    );
  };

  /**
   * Starts the sync operation for selected episodes.
   */
  const startSync = (episodesToSync: PodcastEpisode[]) => {
    const drive = state.currentDrive;
    if (!drive) {
      actions.setErrorMsg("No drive selected");
      actions.setAppView("normal");
      return;
    }

    if (episodesToSync.length === 0) {
      return;
    }

    actions.updateTransferProgress({
      currentFile: "Preparing...",
      filesDone: 0,
      totalFiles: 0,
      bytesTransferred: 0,
      totalBytes: 0,
      speed: 0,
    });

    const syncProgram = Effect.gen(function* () {
      const driveScan = yield* DriveScan;
      const syncEngine = yield* SyncEngine;

      // Group episodes into podcasts structure
      const podcasts = groupEpisodesByPodcast(episodesToSync);
      const driveIndex = new Map<string, { path: string }>();

      // Build index
      const index = yield* driveScan.buildDriveIndex(drive.mountPoint);
      for (const [key, ep] of index) {
        driveIndex.set(key, { path: ep.path });
      }

      const plan = yield* syncEngine.createPlan(podcasts, drive.mountPoint, driveIndex);

      if (plan.totalFiles === 0) {
        return { success: true, message: "All episodes already synced" };
      }

      // Initialize progress with plan info
      actions.updateTransferProgress({
        totalFiles: plan.totalFiles,
        totalBytes: plan.totalBytes,
      });

      const stream = syncEngine.execute(plan, drive.mountPoint);

      yield* Stream.runForEach(stream, (progress) =>
        Effect.sync(() => {
          actions.updateTransferProgress({
            currentFile: progress.currentFile,
            filesDone: progress.status === "complete" ? progress.totalFiles : progress.currentIndex,
            totalFiles: progress.totalFiles,
            bytesTransferred: progress.bytesTransferred,
            totalBytes: progress.totalBytes,
            speed:
              progress.startTime > 0
                ? progress.bytesTransferred / ((Date.now() - progress.startTime) / 1000)
                : 0,
          });

          if (progress.status === "error" && progress.error) {
            actions.setErrorMsg(progress.error);
          }
        }),
      );

      actions.updateTransferProgress({ currentFile: "Finalizing drive..." });
      yield* syncEngine.cleanup(drive.mountPoint);

      return { success: true, message: "Sync complete" };
    });

    run(
      Effect.gen(function* () {
        const logger = yield* Logger;
        const fiber = yield* Effect.fork(syncProgram);
        actions.setSyncFiber(fiber);

        const exit = yield* Fiber.await(fiber);
        actions.setSyncFiber(null);

        if (Exit.isSuccess(exit)) {
          if (exit.value.success) {
            yield* loadDrivePodcastsEffect(drive);
            actions.setMacPodcasts((prev) => prev.map((ep) => ({ ...ep, selected: false })));
          } else {
            actions.setErrorMsg(exit.value.message);
          }
        } else {
          const cause = exit.cause;
          if (Cause.isInterruptedOnly(cause)) {
            yield* logger.info("Sync cancelled by user");
            actions.setErrorMsg("");
          } else {
            const err = cause.toString();
            yield* logger.error("Sync failed", cause);
            actions.setErrorMsg(String(err));
          }
        }
      }).pipe(withView("syncing")),
    );
  };

  /**
   * Deletes selected episodes from the current drive.
   */
  const deleteSelectedFromDrive = () => {
    const selected = state.drivePodcasts.filter((ep) => ep.selected);
    const drive = state.currentDrive;

    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        yield* Effect.forEach(
          selected,
          (ep) => fs.remove(ep.filePath).pipe(Effect.catchAll(() => Effect.void)),
          { discard: true },
        );
        if (drive) {
          yield* loadDrivePodcastsEffect(drive);
        }
        actions.setDrivePodcasts((prev) => prev.map((ep) => ({ ...ep, selected: false })));
      }).pipe(withView("normal")),
    );
  };

  /**
   * Cancels the current sync operation by interrupting the fiber.
   */
  const cancelSync = () => {
    if (state.syncFiber) {
      actions.addDebugMessage("Interrupting sync fiber...");
      Fiber.interrupt(state.syncFiber).pipe(
        Effect.zipLeft(Effect.sync(() => actions.setSyncFiber(null))),
        Effect.zipLeft(Effect.sync(() => actions.setErrorMsg(""))),
        Effect.zipLeft(Effect.sync(() => actions.setAppView("normal"))),
        runFork,
      );
    }
  };

  onMount(() => {
    initialize();
  });

  return {
    initialize,
    scanForDrives,
    loadDrivePodcasts,
    refreshData,
    startSync,
    cancelSync,
    deleteSelectedFromDrive,
    saveTheme,
    toggleFavoriteDrive,
  };
};
