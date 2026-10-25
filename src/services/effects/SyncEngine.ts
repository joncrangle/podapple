/**
 * SyncEngine Effect Service
 *
 * Orchestrates podcast sync operations between Mac and external drives.
 */

import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import { Cause, Context, Data, Effect, Layer, Option, Result, Stream } from "effect";
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
export class SyncEngine extends Context.Service<
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
>()("SyncEngine") {}

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
 * Makes destination paths unique within one plan. Two episodes can sanitize to the
 * same path (same show/title/date, or truncated names), and the second copy would
 * overwrite the first. The later one gets " (2)", " (3)", ... before the extension.
 * Comparison is case-insensitive because the drive filesystems (FAT/exFAT/APFS)
 * usually are. Deterministic: depends only on input order.
 */
export function dedupeDestPath(destPath: string, extension: string, used: Set<string>): string {
	const base =
		extension && destPath.endsWith(extension) ? destPath.slice(0, -extension.length) : destPath;
	const ext = base === destPath ? "" : extension;
	let candidate = destPath;
	let n = 2;
	while (used.has(candidate.toLowerCase())) {
		candidate = `${base} (${n})${ext}`;
		n += 1;
	}
	used.add(candidate.toLowerCase());
	return candidate;
}

/** Only MP3 carries ID3; tagging anything else (e.g. .m4a) would corrupt it. */
const isMp3 = (path: string): boolean => path.toLowerCase().endsWith(".mp3");

/** Best-effort removal of a leftover file; never fails. */
const removeQuietly = (path: string): Effect.Effect<void> =>
	Effect.tryPromise(() => fs.rm(path, { force: true })).pipe(Effect.catch(() => Effect.void));

/** In-progress copies live at `${dest}.part` and are renamed into place once complete. */
const partPathOf = (dest: string): string => `${dest}.part`;

/**
 * Copies `src` to `${dest}.part` using node:fs handles and emits the number of bytes
 * written in chunks. The caller owns the finished .part file (tag it, then rename it
 * to `dest`), which is why a final file on the drive is complete by construction.
 * The .part is removed on failure or interruption of the copy itself, and any stale
 * one from an earlier crashed run is removed before copying.
 */
const copyFileStream = (src: string, dest: string): Stream.Stream<number, SyncCopyError> =>
	Stream.scoped(
		Stream.unwrap(
			Effect.gen(function* () {
				const partPath = partPathOf(dest);
				let finished = false;

				const srcHandle = yield* Effect.acquireRelease(
					Effect.tryPromise({
						try: () => fs.open(src, "r"),
						catch: (cause) => new SyncCopyError({ src, dest, cause }),
					}),
					(handle) => Effect.promise(() => handle.close()),
				);

				yield* removeQuietly(partPath);

				const destHandle = yield* Effect.acquireRelease(
					Effect.tryPromise({
						try: () => fs.open(partPath, "w"),
						catch: (cause) => new SyncCopyError({ src, dest, cause }),
					}),
					(handle) =>
						Effect.gen(function* () {
							yield* Effect.promise(() => handle.close());
							// Failed or interrupted before the source was fully read: drop the
							// partial. Nothing ever appears at `dest` until the caller renames.
							if (!finished) {
								yield* removeQuietly(partPath);
							}
						}),
				);

				const buffer = Buffer.alloc(BUFFER_SIZE);

				return Stream.fromEffectRepeat(
					Effect.tryPromise({
						try: () => srcHandle.read(buffer, 0, BUFFER_SIZE, null),
						catch: (cause) => new SyncCopyError({ src, dest, cause }),
					}).pipe(
						Effect.flatMap(({ bytesRead }): Effect.Effect<number, SyncCopyError | Cause.Done> => {
							if (bytesRead === 0) {
								finished = true;
								return Cause.done();
							}
							return Effect.tryPromise({
								try: () => destHandle.write(buffer.subarray(0, bytesRead)),
								catch: (cause) => new SyncCopyError({ src, dest, cause }),
							}).pipe(
								Effect.flatMap(() =>
									Effect.tryPromise({
										try: () => destHandle.datasync(),
										catch: (cause) => new SyncCopyError({ src, dest, cause }),
									}),
								),
								Effect.as(bytesRead),
							);
						}),
					),
				);
			}),
		),
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
					const usedDestPaths = new Set<string>();

					for (const podcast of mac) {
						for (const episode of podcast.episodes) {
							if (episode.onDrive || !episode.filePath) continue;
							if (matcher.matchEpisode(podcast.title, episode, driveIndex)) continue;

							const ext = fs.getExtension(episode.filePath);
							// Deduped before the existence check so the " (2)" assignment is
							// stable across runs, whatever is already on the drive.
							const fullDestPath = dedupeDestPath(
								formatDestPath(drivePath, podcast.title, episode.title, episode.published, ext),
								ext,
								usedDestPaths,
							);
							candidates.push({ episode, podcast, fullDestPath });
						}
					}

					const results = yield* Effect.forEach(
						candidates,
						({ episode, podcast, fullDestPath }) =>
							Effect.gen(function* () {
								// getFileSize yields 0 for a missing/unreadable file. Planning such
								// an item would fail the whole execute stream at copy time.
								const sSize = yield* fs.getFileSize(episode.filePath);
								if (sSize <= 0) {
									yield* logger.info(
										`Warning: skipping "${episode.title}", source is missing or empty: ${episode.filePath}`,
									);
									return Option.none();
								}

								// Copies land at `${dest}.part` and are renamed into place only once
								// complete (and tagged), so any non-empty file at the final path is
								// whole. Do not compare sizes: ID3 tagging legitimately changes them.
								const dSize = yield* fs.getFileSize(fullDestPath);
								if (dSize > 0) return Option.none();

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
					const plan: SyncPlan = {
						toCopy,
						toDelete: [],
						totalFiles: toCopy.length,
						totalBytes,
					};
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
						// Files copied but discarded because tagging failed. The sync still
						// succeeds, but the count is surfaced so the user is not told
						// "Sync complete" while files are quietly missing.
						let discarded = 0;

						return Stream.fromIterable(plan.toCopy).pipe(
							Stream.zipWithIndex,
							Stream.flatMap(([item, i]) => {
								const destDir = item.destPath.substring(0, item.destPath.lastIndexOf("/"));

								const initialProgress = Stream.succeed<SyncProgress>({
									currentFile: item.episode.title,
									currentIndex: i + 1,
									totalFiles: plan.totalFiles,
									bytesTransferred: bytesWritten,
									totalBytes: plan.totalBytes,
									discarded,
									startTime,
									status: "syncing",
								});

								const copyOnly = Stream.fromEffect(
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
											Stream.map((bytes): SyncProgress => {
												bytesWritten += bytes;
												return {
													currentFile: item.episode.title,
													currentIndex: i + 1,
													totalFiles: plan.totalFiles,
													bytesTransferred: bytesWritten,
													totalBytes: plan.totalBytes,
													discarded,
													startTime,
													status: "syncing",
												};
											}),
										),
									),
								);

								const partPath = partPathOf(item.destPath);

								// Moves the finished .part into place. Any failure or interruption
								// here drops the .part so nothing half-done is left on the drive.
								const finalize = Effect.gen(function* () {
									const fs = yield* FileSystem;
									yield* fs.rename(partPath, item.destPath);
								}).pipe(Effect.onError(() => removeQuietly(partPath)));

								// Only MP3s carry ID3. Tagging .m4a etc. prepends an ID3 block and
								// corrupts the file, so those are copied untouched.
								const copyFlow = !isMp3(item.destPath)
									? copyOnly.pipe(Stream.concat(Stream.fromEffect(finalize).pipe(Stream.drain)))
									: copyOnly.pipe(
											Stream.concat(
												Stream.fromEffect(
													Effect.sync((): SyncProgress => ({
														// Emit a progress update to show we are tagging
														currentFile: `Tagging: ${item.episode.title}`,
														currentIndex: i + 1,
														totalFiles: plan.totalFiles,
														bytesTransferred: bytesWritten,
														totalBytes: plan.totalBytes,
														discarded,
														startTime,
														status: "syncing",
													})),
												),
											),
											Stream.concat(
												Stream.fromEffect(
													Effect.gen(function* () {
														const metadataEditor = yield* MetadataEditor;
														const fs = yield* FileSystem;
														yield* logger.debug(`Tagging episode: ${item.episode.title}`);
														// Tag the .part so the final path only ever holds a finished file.
														const tagged = yield* metadataEditor
															.write(partPath, {
																title: item.episode.title,
																artist: item.podcast.author,
																album: item.podcast.title,
																genre: "Podcast",
																// An invalid Date makes toISOString throw (a defect that
																// would kill the stream), so omit date-derived tags.
																...(Number.isNaN(item.episode.published.getTime())
																	? {}
																	: {
																			year: item.episode.published.getFullYear().toString(),
																			comment: `Published: ${item.episode.published.toISOString().split("T")[0]}`,
																		}),
															})
															.pipe(
																Effect.tap(() =>
																	logger.debug(`Successfully tagged: ${item.episode.title}`),
																),
																Effect.as(true),
																// A failed tag never fails the sync, but a half-tagged file must
																// not reach the drive, so discard the .part and let the next
																// run re-copy.
																Effect.tapError((err) =>
																	logger.error(
																		`Failed to tag: ${item.episode.title}, discarding copied file: ${item.destPath}`,
																		err,
																	),
																),
																Effect.catch(() =>
																	Effect.suspend(() => {
																		// Count it even if the removal itself fails: either way
																		// the file did not make it onto the drive correctly.
																		discarded += 1;
																		return fs.remove(partPath).pipe(
																			Effect.tapError((err) =>
																				logger.error(
																					`Failed to discard untagged file: ${partPath}`,
																					err,
																				),
																			),
																			Effect.catch(() => Effect.void),
																			Effect.as(false),
																		);
																	}),
																),
																// Interrupted mid-tag: do not leave the .part behind.
																Effect.onInterrupt(() => removeQuietly(partPath)),
															);
														if (tagged) yield* finalize;
													}),
												).pipe(Stream.filterMap(() => Result.fail(undefined))),
											),
										);

								return Stream.concat(initialProgress, copyFlow);
							}),
							Stream.concat(
								// Deferred, not Stream.succeed: `discarded` is only final once every
								// file has been tagged, and Stream.succeed builds its value when
								// the stream is assembled rather than when it is consumed.
								Stream.suspend((): Stream.Stream<SyncProgress> =>
									Stream.succeed({
										currentFile: "",
										currentIndex: plan.totalFiles,
										totalFiles: plan.totalFiles,
										bytesTransferred: plan.totalBytes,
										totalBytes: plan.totalBytes,
										discarded,
										startTime,
										status: "complete",
									}),
								),
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
					yield* fs
						.rename(partPathOf(dest), dest)
						.pipe(Effect.onError(() => removeQuietly(partPathOf(dest))));
				}),

			cleanup: (drivePath) =>
				Effect.gen(function* () {
					yield* logger.info(`Starting cleanup of drive: ${drivePath}`);
					const fs = yield* FileSystem;
					const podcastsPath = `${drivePath}/Podcasts`;
					const showDirs = yield* fs.readDir(podcastsPath).pipe(
						Effect.mapError((cause) => new CleanupError({ path: podcastsPath, cause })),
						Effect.catch(() => Effect.succeed([] as string[])),
					);
					for (const showDir of showDirs) {
						if (fs.isSystemHiddenFile(showDir)) continue;
						const showPath = `${podcastsPath}/${showDir}`;
						const isDir = yield* fs.isDirectory(showPath);
						if (isDir) {
							yield* logger.debug(`Cleaning show directory: ${showDir}`);
							yield* fs.cleanupSystemHiddenFiles(showPath).pipe(Effect.catch(() => Effect.void));
							const empty = yield* fs.isDirEmpty(showPath);
							if (empty) {
								yield* logger.info(`Removing empty show directory: ${showDir}`);
								yield* fs.remove(showPath).pipe(
									Effect.mapError((cause) => new CleanupError({ path: showPath, cause })),
									Effect.catch(() => Effect.void),
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
				return {
					toCopy,
					toDelete: [],
					totalFiles: toCopy.length,
					totalBytes,
				} satisfies SyncPlan;
			}),
		execute: (plan) => {
			const startTime = Date.now();
			return Stream.fromIterable(plan.toCopy).pipe(
				Stream.zipWithIndex,
				Stream.map(([item, i]): SyncProgress => ({
					currentFile: item.episode.title,
					currentIndex: i + 1,
					totalFiles: plan.totalFiles,
					bytesTransferred: plan.toCopy.slice(0, i + 1).reduce((acc, i) => acc + i.size, 0),
					totalBytes: plan.totalBytes,
					discarded: 0,
					startTime,
					status: "syncing",
				})),
				Stream.concat(
					Stream.succeed<SyncProgress>({
						currentFile: "",
						currentIndex: plan.totalFiles,
						totalFiles: plan.totalFiles,
						bytesTransferred: plan.totalBytes,
						totalBytes: plan.totalBytes,
						discarded: 0,
						startTime,
						status: "complete",
					}),
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
