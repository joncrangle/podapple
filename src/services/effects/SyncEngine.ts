/**
 * SyncEngine Effect Service
 *
 * Orchestrates podcast sync operations between Mac and external drives.
 */

import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import { Context, Data, Effect, Layer, Option, Stream } from "effect";
import { EpisodeMatcher } from "@/services/effects/EpisodeMatcher";
import { FileSystem, type WriteError } from "@/services/effects/FileSystem";
import { Logger } from "@/services/effects/Logger";
import { MetadataEditor } from "@/services/effects/MetadataEditor";
import type { Podcast } from "@/types/podcast";
import type { CopyItem, SyncPlan, SyncProgress } from "@/types/sync";
import { formatDate, sanitizeFilename } from "@/utils/formatting";

const BUFFER_SIZE = 1024 * 1024;

export class SyncError extends Data.TaggedError("SyncError")<{
	episode: string;
	cause: unknown;
}> {}

export class PlanError extends Data.TaggedError("PlanError")<{
	cause: unknown;
}> {}

export class SyncCopyError extends Data.TaggedError("SyncCopyError")<{
	src: string;
	dest: string;
	cause: unknown;
}> {}

export class CleanupError extends Data.TaggedError("CleanupError")<{
	path: string;
	cause: unknown;
}> {}

/**
 * SyncEngine Service Tag
 */
export class SyncEngine extends Context.Tag("SyncEngine")<
	SyncEngine,
	{
		/** Creates a plan for what needs to be copied or deleted */
		readonly createPlan: (
			mac: Podcast[],
			drivePath: string,
			driveIndex: Map<string, { path: string; size?: number }>,
		) => Effect.Effect<SyncPlan, PlanError, FileSystem | EpisodeMatcher>;
		/** Executes a sync plan, emitting progress updates */
		readonly execute: (
			plan: SyncPlan,
			destPath: string,
		) => Stream.Stream<SyncProgress, SyncCopyError | WriteError, FileSystem | MetadataEditor>;
		/** Copies a single file with progress callbacks */
		readonly copyFileWithProgress: (
			src: string,
			dest: string,
			onProgress: (written: number, total: number) => void,
		) => Effect.Effect<void, SyncCopyError | WriteError, FileSystem>;
		/** Cleans up empty show directories and system hidden files on the drive */
		readonly cleanup: (drivePath: string) => Effect.Effect<void, CleanupError, FileSystem>;
	}
>() {}

/**
 * Formats the destination path for an episode on the drive.
 * Pattern: /Volumes/DRIVE/Podcasts/Show Name/YYYY-MM-DD - Episode Title.ext
 */
export function formatDestPath(
	drivePath: string,
	showName: string,
	episodeTitle: string,
	published: Date,
	extension: string,
): string {
	const safePodcastName = sanitizeFilename(showName);
	const safeEpisodeName = sanitizeFilename(episodeTitle);
	const dateStr = formatDate(published);
	return `${drivePath}/Podcasts/${safePodcastName}/${dateStr} - ${safeEpisodeName}${extension}`;
}

/**
 * Copies a file using node:fs handles and emits the number of bytes written in chunks.
 * Cleans up partial files on failure or interruption.
 */
const copyFileStream = (src: string, dest: string): Stream.Stream<number, SyncCopyError> =>
	Stream.unwrapScoped(
		Effect.gen(function* () {
			const srcHandle = yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: () => fs.open(src, "r"),
					catch: (cause) => new SyncCopyError({ src, dest, cause }),
				}),
				(handle) => Effect.promise(() => handle.close()),
			);

			const destHandle = yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: () => fs.open(dest, "w"),
					catch: (cause) => new SyncCopyError({ src, dest, cause }),
				}),
				(handle) =>
					Effect.gen(function* () {
						yield* Effect.promise(() => handle.close());
						// Check if we were interrupted or failed before finishing
						const stat = yield* Effect.tryPromise(() => fs.stat(dest)).pipe(
							Effect.catchAll(() => Effect.succeed(null)),
						);
						const srcStat = yield* Effect.tryPromise(() => fs.stat(src)).pipe(
							Effect.catchAll(() => Effect.succeed(null)),
						);
						if (stat && srcStat && stat.size < srcStat.size) {
							yield* Effect.tryPromise(() => fs.unlink(dest)).pipe(
								Effect.catchAll(() => Effect.void),
							);
						}
					}),
			);

			const buffer = Buffer.alloc(BUFFER_SIZE);

			return Stream.repeatEffectOption(
				Effect.tryPromise({
					try: () => srcHandle.read(buffer, 0, BUFFER_SIZE, null),
					catch: (cause) => Option.some(new SyncCopyError({ src, dest, cause })),
				}).pipe(
					Effect.flatMap(({ bytesRead }) => {
						if (bytesRead === 0) return Effect.fail(Option.none());
						return Effect.tryPromise({
							try: () => destHandle.write(buffer.subarray(0, bytesRead)),
							catch: (cause) => Option.some(new SyncCopyError({ src, dest, cause })),
						}).pipe(
							Effect.flatMap(() =>
								Effect.tryPromise({
									try: () => destHandle.datasync(),
									catch: (cause) => Option.some(new SyncCopyError({ src, dest, cause })),
								}),
							),
							Effect.as(bytesRead),
						);
					}),
				),
			);
		}),
	);

/**
 * Live implementation of SyncEngine.
 */
export const SyncEngineLive = Layer.effect(
	SyncEngine,
	Effect.gen(function* () {
		const logger = yield* Logger;

		return {
			createPlan: (mac, drivePath, driveIndex) =>
				Effect.gen(function* () {
					yield* logger.info(`Creating sync plan for ${mac.length} podcasts on ${drivePath}`);
					const fs = yield* FileSystem;
					const matcher = yield* EpisodeMatcher;
					const toCopy: CopyItem[] = [];
					let totalBytes = 0;

					const candidates: Array<{
						episode: (typeof mac)[number]["episodes"][number];
						podcast: (typeof mac)[number];
						fullDestPath: string;
					}> = [];

					for (const podcast of mac) {
						for (const episode of podcast.episodes) {
							if (episode.onDrive || !episode.filePath) continue;
							if (matcher.matchEpisode(podcast.title, episode, driveIndex)) continue;

							const ext = fs.getExtension(episode.filePath);
							const fullDestPath = formatDestPath(
								drivePath,
								podcast.title,
								episode.title,
								episode.published,
								ext,
							);
							candidates.push({ episode, podcast, fullDestPath });
						}
					}

					const results = yield* Effect.forEach(
						candidates,
						({ episode, podcast, fullDestPath }) =>
							Effect.gen(function* () {
								const dSize = yield* fs.getFileSize(fullDestPath);
								if (dSize > 0) return Option.none();

								const sSize = yield* fs.getFileSize(episode.filePath);
								return Option.some({
									episode,
									podcast,
									sourcePath: episode.filePath,
									destPath: fullDestPath,
									size: sSize,
								} as CopyItem);
							}),
						{ concurrency: 10 },
					);

					for (const opt of results) {
						if (Option.isSome(opt)) {
							toCopy.push(opt.value);
							totalBytes += opt.value.size;
						}
					}
					const plan: SyncPlan = { toCopy, toDelete: [], totalFiles: toCopy.length, totalBytes };
					yield* logger.info(
						`Sync plan created: ${plan.totalFiles} files to copy, ${plan.totalBytes} bytes total`,
					);
					return plan;
				}).pipe(Effect.mapError((cause) => new PlanError({ cause }))),

			execute: (plan, _destPath) =>
				Stream.unwrap(
					Effect.gen(function* () {
						yield* logger.info(`Executing sync plan: ${plan.totalFiles} files to copy`);
						const startTime = Date.now();
						let bytesWritten = 0;

						return Stream.fromIterable(plan.toCopy).pipe(
							Stream.zipWithIndex,
							Stream.flatMap(([item, i]) => {
								const destDir = item.destPath.substring(0, item.destPath.lastIndexOf("/"));

								const initialProgress = Stream.succeed<SyncProgress>({
									currentFile: item.episode.title,
									currentIndex: i,
									totalFiles: plan.totalFiles,
									bytesTransferred: bytesWritten,
									totalBytes: plan.totalBytes,
									startTime,
									status: "syncing",
								});

								const copyFlow = Stream.fromEffect(
									Effect.gen(function* () {
										yield* logger.debug(
											`Starting copy of [${i + 1}/${plan.totalFiles}]: ${item.episode.title}`,
										);
										const fs = yield* FileSystem;
										yield* fs.ensureDir(destDir);
									}),
								).pipe(
									Stream.flatMap(() =>
										copyFileStream(item.sourcePath, item.destPath).pipe(
											Stream.map((bytes) => {
												bytesWritten += bytes;
												return {
													currentFile: item.episode.title,
													currentIndex: i,
													totalFiles: plan.totalFiles,
													bytesTransferred: bytesWritten,
													totalBytes: plan.totalBytes,
													startTime,
													status: "syncing",
												} as SyncProgress;
											}),
										),
									),
									Stream.concat(
										Stream.fromEffect(
											Effect.sync(() => {
												// Emit a progress update to show we are tagging
												return {
													currentFile: `Tagging: ${item.episode.title}`,
													currentIndex: i,
													totalFiles: plan.totalFiles,
													bytesTransferred: bytesWritten,
													totalBytes: plan.totalBytes,
													startTime,
													status: "syncing",
												} as SyncProgress;
											}),
										),
									),
									Stream.concat(
										Stream.fromEffect(
											Effect.gen(function* () {
												const metadataEditor = yield* MetadataEditor;
												yield* logger.debug(`Tagging episode: ${item.episode.title}`);
												yield* metadataEditor
													.write(item.destPath, {
														title: item.episode.title,
														artist: item.podcast.author,
														album: item.podcast.title,
														genre: "Podcast",
														year: item.episode.published.getFullYear().toString(),
														comment: `Published: ${item.episode.published.toISOString().split("T")[0]}`,
													})
													.pipe(
														Effect.tap(() =>
															logger.debug(`Successfully tagged: ${item.episode.title}`),
														),
														Effect.tapError((err) =>
															logger.error(`Failed to tag: ${item.episode.title}`, err),
														),
														Effect.catchAll(() => Effect.void),
													);
											}),
										).pipe(Stream.filterMap(() => Option.none<SyncProgress>())),
									),
								);

								return Stream.concat(initialProgress, copyFlow);
							}),
							Stream.concat(
								Stream.succeed<SyncProgress>({
									currentFile: "",
									currentIndex: plan.totalFiles,
									totalFiles: plan.totalFiles,
									bytesTransferred: plan.totalBytes,
									totalBytes: plan.totalBytes,
									startTime,
									status: "complete",
								}),
							),
							Stream.tap(() => logger.info("Sync plan execution complete")),
						);
					}),
				),

			copyFileWithProgress: (src, dest, onProgress) =>
				Effect.gen(function* () {
					const fs = yield* FileSystem;
					const size = yield* fs.getFileSize(src);
					let written = 0;
					yield* copyFileStream(src, dest).pipe(
						Stream.tap((bytes) =>
							Effect.sync(() => {
								written += bytes;
								onProgress(written, size);
							}),
						),
						Stream.runDrain,
					);
				}),

			cleanup: (drivePath) =>
				Effect.gen(function* () {
					yield* logger.info(`Starting cleanup of drive: ${drivePath}`);
					const fs = yield* FileSystem;
					const podcastsPath = `${drivePath}/Podcasts`;
					const showDirs = yield* fs.readDir(podcastsPath).pipe(
						Effect.mapError((cause) => new CleanupError({ path: podcastsPath, cause })),
						Effect.catchAll(() => Effect.succeed([] as string[])),
					);
					for (const showDir of showDirs) {
						if (fs.isSystemHiddenFile(showDir)) continue;
						const showPath = `${podcastsPath}/${showDir}`;
						const isDir = yield* fs.isDirectory(showPath);
						if (isDir) {
							yield* logger.debug(`Cleaning show directory: ${showDir}`);
							yield* fs.cleanupSystemHiddenFiles(showPath).pipe(Effect.catchAll(() => Effect.void));
							const empty = yield* fs.isDirEmpty(showPath);
							if (empty) {
								yield* logger.info(`Removing empty show directory: ${showDir}`);
								yield* fs.remove(showPath).pipe(
									Effect.mapError((cause) => new CleanupError({ path: showPath, cause })),
									Effect.catchAll(() => Effect.void),
								);
							}
						}
					}
					yield* logger.info("Cleanup complete");
				}),
		};
	}),
);

/**
 * Creates a test implementation of SyncEngine.
 */
export const createSyncEngineTest = (mockFiles: Map<string, Uint8Array> = new Map()) =>
	Layer.succeed(SyncEngine, {
		createPlan: (mac, drivePath, driveIndex) =>
			Effect.gen(function* () {
				const matcher = yield* EpisodeMatcher;
				const toCopy: CopyItem[] = [];
				let totalBytes = 0;

				for (const podcast of mac) {
					for (const episode of podcast.episodes) {
						if (episode.onDrive || !episode.filePath) continue;
						if (matcher.matchEpisode(podcast.title, episode, driveIndex)) continue;

						const fullDestPath = formatDestPath(
							drivePath,
							podcast.title,
							episode.title,
							episode.published,
							".mp3",
						);

						const sSize = mockFiles.get(episode.filePath)?.length || 1024 * 1024;
						toCopy.push({
							episode,
							podcast,
							sourcePath: episode.filePath,
							destPath: fullDestPath,
							size: sSize,
						});
						totalBytes += sSize;
					}
				}
				return { toCopy, toDelete: [], totalFiles: toCopy.length, totalBytes } as SyncPlan;
			}),
		execute: (plan) => {
			const startTime = Date.now();
			return Stream.fromIterable(plan.toCopy).pipe(
				Stream.zipWithIndex,
				Stream.map(
					([item, i]): SyncProgress => ({
						currentFile: item.episode.title,
						currentIndex: i + 1,
						totalFiles: plan.totalFiles,
						bytesTransferred: plan.toCopy.slice(0, i + 1).reduce((acc, i) => acc + i.size, 0),
						totalBytes: plan.totalBytes,
						startTime,
						status: "syncing",
					}),
				),
				Stream.concat(
					Stream.succeed({
						currentFile: "",
						currentIndex: plan.totalFiles,
						totalFiles: plan.totalFiles,
						bytesTransferred: plan.totalBytes,
						totalBytes: plan.totalBytes,
						startTime,
						status: "complete",
					} as SyncProgress),
				),
			);
		},
		copyFileWithProgress: (src, dest, onProgress) => {
			const content = mockFiles.get(src);
			if (!content) {
				return Effect.fail(new SyncCopyError({ src, dest, cause: new Error("File not found") }));
			}
			mockFiles.set(dest, content);
			onProgress(content.length, content.length);
			return Effect.void;
		},
		cleanup: () => Effect.void,
	});
