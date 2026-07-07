/**
 * Sync Engine Tests
 *
 * Tests for SyncEngine functionality including:
 * - Sync plan creation
 * - File path generation
 * - Matching logic (path, size, duration)
 * - Progress streaming
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import { EpisodeMatcherLive } from "@/services/effects/EpisodeMatcher";
import { createFileSystemTest } from "@/services/effects/FileSystem";
import { createMetadataEditorTest } from "@/services/effects/MetadataEditor";
import { createSyncEngineTest, formatDestPath, SyncEngine } from "@/services/effects/SyncEngine";
import type { Podcast } from "@/types/podcast";
import { sanitizeFilename } from "@/utils/formatting";

describe("SyncEngine", () => {
	// Test podcasts matching original Go implementation format
	const mockMacPodcasts: Podcast[] = [
		{
			id: "podcast-1",
			title: "Tech Talk",
			author: "Host A",
			episodeCount: 3,
			episodes: [
				{
					id: "ep-1",
					title: "Episode 1: Getting Started",
					duration: 3600,
					published: new Date("2024-01-15"),
					onDrive: false,
					filePath: "/path/to/ep1.mp3",
					fileSize: 0,
				},
				{
					id: "ep-2",
					title: "Episode 2: Deep Dive",
					duration: 1800,
					published: new Date("2024-01-22"),
					onDrive: true, // Already synced - should be skipped
					filePath: "/path/to/ep2.mp3",
					fileSize: 0,
				},
				{
					id: "ep-3",
					title: "Episode 3: Q&A Session",
					duration: 2400,
					published: new Date("2024-01-29"),
					onDrive: false,
					filePath: "/path/to/ep3.mp3",
					fileSize: 0,
				},
			],
		},
		{
			id: "podcast-2",
			title: "Science Daily",
			author: "Host B",
			episodeCount: 1,
			episodes: [
				{
					id: "ep-4",
					title: "The Universe Explained",
					duration: 4200,
					published: new Date("2024-02-01"),
					onDrive: false,
					filePath: "/path/to/ep4.mp3",
					fileSize: 0,
				},
			],
		},
	];

	const emptyDriveIndex = new Map<string, { path: string }>();

	describe("formatDestPath", () => {
		it("formats destination path with date prefix", () => {
			const result = formatDestPath(
				"/Volumes/USB",
				"My Podcast",
				"Episode Title",
				new Date("2024-03-15"),
				".mp3",
			);

			expect(result).toBe("/Volumes/USB/Podcasts/My_Podcast/2024-03-15 - Episode_Title.mp3");
		});

		it("sanitizes show name and episode title", () => {
			const result = formatDestPath(
				"/Volumes/USB",
				"Show: With Special/Characters?",
				"Episode: The *Best* One!",
				new Date("2024-01-01"),
				".mp3",
			);

			expect(result).toContain("Show-_With_Special-Characters-");
			expect(result).toContain("Episode-_The_-Best-_One!");
		});

		it("handles different extensions", () => {
			const mp3 = formatDestPath("/Volumes/USB", "Show", "Ep", new Date("2024-01-01"), ".mp3");
			const m4a = formatDestPath("/Volumes/USB", "Show", "Ep", new Date("2024-01-01"), ".m4a");

			expect(mp3).toEndWith(".mp3");
			expect(m4a).toEndWith(".m4a");
		});
	});

	describe("sanitizeFilename", () => {
		it("replaces invalid characters", () => {
			expect(sanitizeFilename("file:name?test")).toBe("file-name-test");
		});

		it("replaces spaces with underscores", () => {
			expect(sanitizeFilename("my file name")).toBe("my_file_name");
		});

		it("truncates long names to 100 characters", () => {
			const longName = "A".repeat(150);
			const result = sanitizeFilename(longName);
			expect(result.length).toBe(100);
		});

		it("handles ampersands and special characters", () => {
			expect(sanitizeFilename("Tom & Jerry's Show")).toBe("Tom_and_Jerrys_Show");
		});
	});

	describe("createPlan", () => {
		it("creates sync plan with unsynced episodes only", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				return yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", emptyDriveIndex);
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			// Episode 2 is synced, so only 3 episodes should be copied
			expect(result.toCopy).toHaveLength(3);
			expect(result.toCopy.map((i) => i.episode.title)).toContain("Episode 1: Getting Started");
			expect(result.toCopy.map((i) => i.episode.title)).toContain("Episode 3: Q&A Session");
			expect(result.toCopy.map((i) => i.episode.title)).toContain("The Universe Explained");
		});

		it("skips episodes already on drive (path matching)", async () => {
			// Simulate Episode 1 already on drive
			// Key must include .mp3 extension now
			const driveWithEp1 = new Map<string, { path: string }>([
				[
					"Tech_Talk/Episode_1-_Getting_Started.mp3",
					{ path: "/Volumes/USB/Podcasts/Tech_Talk/2024-01-15 - Episode_1-_Getting_Started.mp3" },
				],
			]);

			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				return yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", driveWithEp1);
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			// Episode 1 on drive + Episode 2 synced = only 2 to copy
			expect(result.toCopy).toHaveLength(2);
			expect(result.toCopy.map((i) => i.episode.title)).not.toContain("Episode 1: Getting Started");
		});

		it("handles empty podcast lists", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				return yield* engine.createPlan([], "/Volumes/USB", emptyDriveIndex);
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			expect(result.toCopy).toHaveLength(0);
			expect(result.toDelete).toHaveLength(0);
			expect(result.totalBytes).toBe(0);
			expect(result.totalFiles).toBe(0);
		});

		it("generates correct destination paths with date prefix", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				return yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", emptyDriveIndex);
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			// Check first episode path has correct format
			const ep1 = result.toCopy.find((i) => i.episode.title.includes("Episode 1"));
			expect(ep1?.destPath).toContain("/Podcasts/Tech_Talk/");
			expect(ep1?.destPath).toContain("2024-01-15");
		});

		it("calculates total bytes correctly", async () => {
			const mockFiles = new Map<string, Uint8Array>([
				["/path/to/ep1.mp3", new Uint8Array(5000000)], // 5MB
				["/path/to/ep3.mp3", new Uint8Array(3000000)], // 3MB
				["/path/to/ep4.mp3", new Uint8Array(7000000)], // 7MB
			]);

			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				return yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", emptyDriveIndex);
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(mockFiles),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			// 5MB + 3MB + 7MB = 15MB
			expect(result.totalBytes).toBe(15000000);
		});
	});

	describe("execute", () => {
		it("streams progress updates during sync", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", emptyDriveIndex);

				const progress: Array<{ status: string; currentFile: string; currentIndex: number }> = [];
				const stream = engine.execute(plan, "/Volumes/USB");

				yield* Stream.runForEach(stream, (p) => {
					progress.push({
						status: p.status,
						currentFile: p.currentFile,
						currentIndex: p.currentIndex,
					});
					return Effect.void;
				});

				return progress;
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			// Should have progress for each file + completion
			expect(result.length).toBe(4); // 3 files + completion
			expect(result[result.length - 1]?.status).toBe("complete");
			expect(result[result.length - 1]?.currentFile).toBe("");
		});

		it("reports correct bytes transferred during progress", async () => {
			const mockFiles = new Map<string, Uint8Array>([
				["/path/to/ep1.mp3", new Uint8Array(1000)],
				["/path/to/ep3.mp3", new Uint8Array(2000)],
				["/path/to/ep4.mp3", new Uint8Array(3000)],
			]);

			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", emptyDriveIndex);

				const bytesProgress: number[] = [];
				const stream = engine.execute(plan, "/Volumes/USB");

				yield* Stream.runForEach(stream, (p) => {
					bytesProgress.push(p.bytesTransferred);
					return Effect.void;
				});

				return bytesProgress;
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(mockFiles),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			// Should accumulate bytes: 1000, 3000, 6000, 6000 (final)
			expect(result[0]).toBe(1000);
			expect(result[1]).toBe(3000);
			expect(result[2]).toBe(6000);
			expect(result[3]).toBe(6000); // Completion event
		});

		it("completes with success status when no errors", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const singlePodcast: Podcast[] = [
					{
						id: "p1",
						title: "Test",
						author: "A",
						episodeCount: 1,
						episodes: [
							{
								id: "e1",
								title: "Ep",
								duration: 100,
								published: new Date("2024-01-01"),
								onDrive: false,
								filePath: "/path/to/test.mp3",
								fileSize: 0,
							},
						],
					},
				];

				const plan = yield* engine.createPlan(singlePodcast, "/Volumes/USB", emptyDriveIndex);
				const progressList: Array<{ status: string }> = [];

				const stream = engine.execute(plan, "/Volumes/USB");
				yield* Stream.runForEach(stream, (p) => {
					progressList.push({ status: p.status });
					return Effect.void;
				});

				return progressList.length > 0 ? progressList[progressList.length - 1] : null;
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			expect(result?.status).toBe("complete");
		});
	});

	describe("copyFileWithProgress", () => {
		it("copies file and reports progress", async () => {
			const content = new Uint8Array([1, 2, 3, 4, 5]);
			const mockFiles = new Map<string, Uint8Array>([["/src/file.mp3", content]]);

			const progressUpdates: Array<{ written: number; total: number }> = [];

			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				yield* engine.copyFileWithProgress("/src/file.mp3", "/dest/file.mp3", (written, total) => {
					progressUpdates.push({ written, total });
				});

				// Check destination was written
				return mockFiles.get("/dest/file.mp3");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(mockFiles),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			expect(result).toBeDefined();
			expect(result?.length).toBe(5);
			expect(progressUpdates.length).toBeGreaterThan(0);
		});

		it("fails with SyncCopyError when source not found", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				return yield* engine.copyFileWithProgress("/missing.mp3", "/dest.mp3", () => {});
			});

			const result = await Effect.runPromise(
				Effect.either(
					Effect.provide(
						program,
						Layer.mergeAll(createSyncEngineTest(), EpisodeMatcherLive, createFileSystemTest()),
					),
				),
			);

			expect(result._tag).toBe("Left");
		});
	});

	describe("cleanup", () => {
		it("runs without error", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				yield* engine.cleanup("/Volumes/USB");
				return true;
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createSyncEngineTest(),
						EpisodeMatcherLive,
						createFileSystemTest(),
						createMetadataEditorTest(),
					),
				),
			);

			expect(result).toBe(true);
		});
	});
});
