import { homedir } from "node:os";
import { join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { FileSystem } from "@/services/effects/FileSystem";
import type { PodcastEpisode } from "@/types/podcast";

// Apple Podcasts database paths
const PODCASTS_GROUP_CONTAINER =
  "Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Documents";
const DB_FILE = "MTLibrary.sqlite";

export class PodcastError extends Data.TaggedError("PodcastError")<{
  cause: unknown;
  message?: string;
}> {}

export class DatabaseNotFoundError extends Data.TaggedError("DatabaseNotFoundError")<{
  path: string;
}> {}

/**
 * Podcast Service Tag
 */
export class PodcastService extends Context.Tag("PodcastService")<
  PodcastService,
  {
    /** Checks if the Apple Podcasts database is available */
    readonly checkAvailability: Effect.Effect<boolean>;
    /** Loads podcast episodes from the local Mac Podcasts database */
    readonly loadMacPodcasts: Effect.Effect<PodcastEpisode[], PodcastError | DatabaseNotFoundError>;
    /** Returns the absolute path to the MTLibrary.sqlite database */
    readonly getDatabasePath: () => string;
  }
>() {}

/**
 * Live implementation of PodcastService using a background worker for SQLite access.
 */
export const PodcastServiceLive = Layer.effect(
  PodcastService,
  Effect.gen(function* () {
    const fs = yield* FileSystem;

    const getDatabasePath = () => join(homedir(), PODCASTS_GROUP_CONTAINER, DB_FILE);

    return PodcastService.of({
      getDatabasePath,

      checkAvailability: fs.exists(getDatabasePath()),

      loadMacPodcasts: Effect.gen(function* () {
        const dbPath = getDatabasePath();
        const exists = yield* fs.exists(dbPath);

        if (!exists) {
          return yield* new DatabaseNotFoundError({ path: dbPath });
        }

        return yield* Effect.acquireUseRelease(
          Effect.try({
            try: () => {
              // Determine worker URL based on environment (bundled vs dev)
              const isBundled = import.meta.url.startsWith("file:///$bunfs");
              const workerPath = isBundled
                ? "./services/workers/db.worker.js" // Bundled: $bunfs/root/services/workers/db.worker.js
                : "../workers/db.worker.ts"; // Dev: relative to src/services/effects/PodcastService.ts

              const workerUrl = new URL(workerPath, import.meta.url);
              return new Worker(workerUrl);
            },
            catch: (err) => new PodcastError({ cause: err }),
          }),
          // Use: Perform the async work
          (worker) =>
            Effect.async<PodcastEpisode[], PodcastError>((resume) => {
              worker.onmessage = (e) => {
                if (e.data.type === "SUCCESS") {
                  resume(Effect.succeed(e.data.data));
                } else {
                  resume(Effect.fail(new PodcastError({ cause: e.data.error })));
                }
              };

              worker.onerror = (err) => {
                resume(Effect.fail(new PodcastError({ cause: err })));
              };

              worker.postMessage({ type: "LOAD", dbPath });
            }),
          // Release: Always terminate the worker
          (worker) => Effect.sync(() => worker.terminate()),
        );
      }),
    });
  }),
);

/**
 * Creates a mock PodcastService for testing.
 */
export const createPodcastServiceTest = (episodes: PodcastEpisode[] = []) =>
  Layer.succeed(PodcastService, {
    getDatabasePath: () => "/mock/path/to/db.sqlite",
    checkAvailability: Effect.succeed(true),
    loadMacPodcasts: Effect.succeed(episodes),
  });
