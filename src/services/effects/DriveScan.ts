import { extname, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { EpisodeMatcher } from "@/services/effects/EpisodeMatcher";
import { FileSystem } from "@/services/effects/FileSystem";
import type { Podcast } from "@/types/podcast";

export class DriveScanError extends Error {
  readonly _tag = "DriveScanError";
  constructor(readonly error: unknown) {
    super(String(error));
  }
}

/**
 * DriveScan Service Tag
 */
export class DriveScan extends Context.Tag("DriveScan")<
  DriveScan,
  {
    /** Scans a drive for existing podcast files in the 'Podcasts' folder */
    readonly scanDrive: (
      drivePath: string,
    ) => Effect.Effect<Podcast[], DriveScanError, FileSystem | EpisodeMatcher>;
    /** Builds a lookup index of podcast files on the drive for faster matching */
    readonly buildDriveIndex: (
      drivePath: string,
    ) => Effect.Effect<
      Map<string, { id: string; title: string; path: string; size: number }>,
      DriveScanError,
      FileSystem | EpisodeMatcher
    >;
    /** Checks if a drive contains a 'Podcasts' folder at the root */
    readonly hasPodcastsFolder: (
      drivePath: string,
    ) => Effect.Effect<boolean, DriveScanError, FileSystem>;
  }
>() {}

/**
 * Helper to parse podcast file info from path.
 * extracts show name, title, and date if available.
 */
function parsePodcastFile(
  path: string,
): { showName: string; title: string; date?: Date; rawTitle: string } | null {
  const normalizedPath = path.replace(/\\/g, "/");
  const parts = normalizedPath.split("/");
  const filename = parts[parts.length - 1];
  if (!filename) return null;

  const showName = parts.length > 1 ? parts[0]! : "Unknown Show";
  const ext = extname(filename).toLowerCase();

  const rawTitle = filename.slice(0, -ext.length);
  let title = rawTitle;
  let date: Date | undefined;

  const dateMatch = rawTitle.match(/^(\d{4}-\d{2}-\d{2}) - (.+)$/);
  if (dateMatch) {
    const titlePart = dateMatch[2];
    if (titlePart) {
      const dateStr = dateMatch[1];
      title = titlePart;
      date = new Date(dateStr ?? "");
    }
  }

  return { showName, title, date, rawTitle };
}

/**
 * Recursively find all files in a directory
 */
const getFilesRecursive = (
  dir: string,
  baseRel: string,
): Effect.Effect<string[], never, FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const results: string[] = [];
    const entries = yield* fs.list(dir).pipe(Effect.catchAll(() => Effect.succeed([])));

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relPath = baseRel ? join(baseRel, entry) : entry;
      const isDir = yield* fs
        .isDirectory(fullPath)
        .pipe(Effect.catchAll(() => Effect.succeed(false)));

      if (isDir) {
        const sub = yield* getFilesRecursive(fullPath, relPath);
        results.push(...sub);
      } else {
        results.push(relPath);
      }
    }
    return results;
  });

/**
 * Live implementation of DriveScan.
 */
export const DriveScanLive = Layer.succeed(
  DriveScan,
  DriveScan.of({
    scanDrive: (drivePath) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        const podcastsMap = new Map<string, Podcast>();
        const podcastsDir = join(drivePath, "Podcasts");

        const exists = yield* fs.exists(podcastsDir);
        if (!exists) return [];

        const files = yield* getFilesRecursive(podcastsDir, "");

        for (const file of files) {
          const filename = file.split(/[/\\]/).pop() ?? "";
          if (fs.isSystemHiddenFile(filename)) continue;

          if (!fs.isAudioFile(filename)) continue;

          const info = parsePodcastFile(file);
          if (!info) continue;

          const { showName, title, date } = info;

          if (!podcastsMap.has(showName)) {
            podcastsMap.set(showName, {
              id: showName,
              title: showName.replace(/_/g, " "),
              author: "Unknown",
              episodeCount: 0,
              episodes: [],
            });
          }

          const podcast = podcastsMap.get(showName)!;
          const fullPath = join(podcastsDir, file);

          let publishedAt = date;
          let size = 0;

          const statsExit = yield* fs.stat(fullPath).pipe(Effect.exit);
          if (statsExit._tag === "Success") {
            size = statsExit.value.size;
            if (!publishedAt) {
              publishedAt = statsExit.value.mtime;
            }
          }

          if (!publishedAt) {
            publishedAt = new Date();
          }

          podcast.episodes.push({
            id: `${showName}-${title}`,
            title: title.replace(/_/g, " "),
            duration: 0,
            publishedAt,
            synced: true,
            assetUrl: fullPath,
            fileSize: size,
          });
          podcast.episodeCount = podcast.episodes.length;
        }
        return Array.from(podcastsMap.values());
      }).pipe(Effect.catchAll((err) => Effect.fail(new DriveScanError(err)))),

    buildDriveIndex: (drivePath) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        const matcher = yield* EpisodeMatcher;
        const index = new Map<string, { id: string; title: string; path: string; size: number }>();
        const podcastsDir = join(drivePath, "Podcasts");

        const exists = yield* fs.exists(podcastsDir);
        if (!exists) return index;

        const files = yield* getFilesRecursive(podcastsDir, "");

        for (const file of files) {
          const filename = file.split(/[/\\]/).pop() ?? "";
          if (fs.isSystemHiddenFile(filename)) continue;

          if (!fs.isAudioFile(filename)) continue;

          const info = parsePodcastFile(file);
          if (!info) continue;

          const { showName, title } = info;

          const key = matcher.buildExpectedDrivePath(showName, title);
          const fullPath = join(podcastsDir, file);

          let size = 0;
          const statsExit = yield* fs.stat(fullPath).pipe(Effect.exit);
          if (statsExit._tag === "Success") {
            size = statsExit.value.size;
          }

          index.set(key, {
            id: key,
            title: title,
            path: fullPath,
            size,
          });
        }
        return index;
      }).pipe(Effect.catchAll((err) => Effect.fail(new DriveScanError(err)))),

    hasPodcastsFolder: (drivePath) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        const podcastsDir = join(drivePath, "Podcasts");
        const exists = yield* fs.exists(podcastsDir);
        return exists;
      }).pipe(Effect.catchAll((err) => Effect.fail(new DriveScanError(err)))),
  }),
);

/**
 * Test mock structure for drive podcasts
 */
interface MockDrivePodcast {
  name: string;
  path: string;
  episodes: Array<{
    id: string;
    title: string;
    path: string;
    size: number;
  }>;
}

/**
 * Creates a test implementation of DriveScan with mock podcast data.
 */
export const createDriveScanTest = (mockPodcasts: MockDrivePodcast[] = []) =>
  Layer.succeed(DriveScan, {
    scanDrive: (_drivePath) => {
      const podcasts: Podcast[] = mockPodcasts.map((mock) => ({
        id: mock.name,
        title: mock.name,
        author: "Unknown",
        episodeCount: mock.episodes.length,
        episodes: mock.episodes.map((ep) => ({
          id: ep.id,
          title: ep.title,
          duration: 0,
          publishedAt: new Date(),
          synced: true,
          assetUrl: ep.path,
          fileSize: ep.size,
        })),
      }));
      return Effect.succeed(podcasts);
    },

    buildDriveIndex: (_drivePath) => {
      const index = new Map<string, { id: string; title: string; path: string; size: number }>();
      for (const podcast of mockPodcasts) {
        for (const ep of podcast.episodes) {
          const key = `${podcast.name}/${ep.title}`;
          index.set(key, {
            id: ep.id,
            title: ep.title,
            path: ep.path,
            size: ep.size ?? 0,
          });
        }
      }
      return Effect.succeed(index);
    },

    hasPodcastsFolder: (_drivePath) => {
      return Effect.succeed(mockPodcasts.length > 0);
    },
  }) as Layer.Layer<DriveScan>;
