import { extname, join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { EpisodeMatcher } from "@/services/effects/EpisodeMatcher";
import { FileSystem } from "@/services/effects/FileSystem";
import { Logger } from "@/services/effects/Logger";
import type { Podcast } from "@/types/podcast";

export class DriveScanError extends Data.TaggedError("DriveScanError")<{
	readonly cause: unknown;
}> {}

/**
 * DriveScan Service Tag
 */
export class DriveScan extends Context.Tag("DriveScan")<
	DriveScan,
	{
		/** Scans a drive for existing podcast files in the 'Podcasts' folder */
		readonly scanDrive: (
			drivePath: string,
		) => Effect.Effect<Podcast[], DriveScanError, FileSystem | EpisodeMatcher | Logger>;
		/** Builds a lookup index of podcast files on the drive for faster matching */
		readonly buildDriveIndex: (
			drivePath: string,
		) => Effect.Effect<
			Map<string, { id: string; title: string; path: string; size: number }>,
			DriveScanError,
			FileSystem | EpisodeMatcher | Logger
		>;
		/** Checks if a drive contains a 'Podcasts' folder at the root */
		readonly hasPodcastsFolder: (
			drivePath: string,
		) => Effect.Effect<boolean, DriveScanError, FileSystem | Logger>;
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
			const parsedDate = new Date(dateStr ?? "");
			if (!isNaN(parsedDate.getTime())) {
				title = titlePart;
				date = parsedDate;
			}
		}
	}

	return { showName, title, date, rawTitle };
}

/**
 * Recursively find all files in a directory in parallel
 */
const getFilesRecursive = (
	dir: string,
	baseRel: string,
): Effect.Effect<string[], never, FileSystem | Logger> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem;
		const logger = yield* Logger;
		const entries = yield* fs.list(dir).pipe(
			Effect.catchAll((err) =>
				Effect.gen(function* () {
					yield* logger.error(`Failed to list directory ${dir}`, err);
					return [] as string[];
				}),
			),
		);

		const subResults = yield* Effect.forEach(
			entries,
			(entry) =>
				Effect.gen(function* () {
					const fullPath = join(dir, entry);
					const relPath = baseRel ? join(baseRel, entry) : entry;
					const isDir = yield* fs
						.isDirectory(fullPath)
						.pipe(Effect.catchAll(() => Effect.succeed(false)));

					if (isDir) {
						return yield* getFilesRecursive(fullPath, relPath);
					} else {
						return [relPath];
					}
				}),
			{ concurrency: 10 },
		);

		return subResults.flat();
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
				const logger = yield* Logger;
				const podcastsMap = new Map<string, Podcast>();
				const podcastsDir = join(drivePath, "Podcasts");

				yield* logger.debug(`Starting drive scan: ${podcastsDir}`);

				const exists = yield* fs.exists(podcastsDir);
				if (!exists) {
					yield* logger.info(`No Podcasts directory found at ${podcastsDir}`);
					return [];
				}

				const files = yield* getFilesRecursive(podcastsDir, "");
				yield* logger.debug(`Found ${files.length} total files under Podcasts folder`);

				const candidates = files.flatMap((file) => {
					const filename = file.split(/[/\\]/).pop() ?? "";
					if (fs.isSystemHiddenFile(filename)) return [];
					if (!fs.isAudioFile(filename)) return [];

					const info = parsePodcastFile(file);
					if (!info) return [];

					return [{ file, info }];
				});

				yield* logger.debug(`Identified ${candidates.length} audio files to process`);

				const episodesData = yield* Effect.forEach(
					candidates,
					({ file, info }) =>
						Effect.gen(function* () {
							const { showName, title, date } = info;
							const fullPath = join(podcastsDir, file);

							let published = date;
							let size = 0;

							const statsExit = yield* fs.stat(fullPath).pipe(Effect.exit);
							if (statsExit._tag === "Success") {
								size = statsExit.value.size;
								if (!published) {
									published = statsExit.value.mtime;
								}
							}

							if (!published) {
								published = new Date();
							}

							return {
								showName,
								episode: {
									id: `${showName}-${title}`,
									title: title.replace(/_/g, " "),
									duration: 0,
									published,
									onDrive: true,
									filePath: fullPath,
									fileSize: size,
								},
							};
						}),
					{ concurrency: 20 },
				);

				for (const { showName, episode } of episodesData) {
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
					podcast.episodes.push(episode);
					podcast.episodeCount = podcast.episodes.length;
				}

				yield* logger.info(
					`Drive scan completed. Found ${podcastsMap.size} shows and ${episodesData.length} total episodes.`,
				);

				return Array.from(podcastsMap.values());
			}).pipe(Effect.catchAll((err) => Effect.fail(new DriveScanError({ cause: err })))),

		buildDriveIndex: (drivePath) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem;
				const matcher = yield* EpisodeMatcher;
				const logger = yield* Logger;
				const index = new Map<string, { id: string; title: string; path: string; size: number }>();
				const podcastsDir = join(drivePath, "Podcasts");

				yield* logger.debug(`Building drive index for ${podcastsDir}`);

				const exists = yield* fs.exists(podcastsDir);
				if (!exists) {
					yield* logger.debug(`No Podcasts directory found at ${podcastsDir} for indexing`);
					return index;
				}

				const files = yield* getFilesRecursive(podcastsDir, "");
				const candidates = files.flatMap((file) => {
					const filename = file.split(/[/\\]/).pop() ?? "";
					if (fs.isSystemHiddenFile(filename)) return [];
					if (!fs.isAudioFile(filename)) return [];

					const info = parsePodcastFile(file);
					if (!info) return [];

					return [{ file, info }];
				});

				const indexEntries = yield* Effect.forEach(
					candidates,
					({ file, info }) =>
						Effect.gen(function* () {
							const { showName, title } = info;
							const key = matcher.buildExpectedDrivePath(showName, title);
							const fullPath = join(podcastsDir, file);

							let size = 0;
							const statsExit = yield* fs.stat(fullPath).pipe(Effect.exit);
							if (statsExit._tag === "Success") {
								size = statsExit.value.size;
							}

							return [
								key,
								{
									id: key,
									title: title,
									path: fullPath,
									size,
								},
							] as const;
						}),
					{ concurrency: 20 },
				);

				for (const [key, val] of indexEntries) {
					index.set(key, val);
				}

				yield* logger.info(`Drive index built with ${index.size} episodes`);
				return index;
			}).pipe(Effect.catchAll((err) => Effect.fail(new DriveScanError({ cause: err })))),

		hasPodcastsFolder: (drivePath) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem;
				const logger = yield* Logger;
				const podcastsDir = join(drivePath, "Podcasts");
				const exists = yield* fs.exists(podcastsDir);
				yield* logger.debug(`Checked folder existence at ${podcastsDir}: ${exists}`);
				return exists;
			}).pipe(Effect.catchAll((err) => Effect.fail(new DriveScanError({ cause: err })))),
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
					published: new Date(),
					onDrive: true,
					filePath: ep.path,
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
