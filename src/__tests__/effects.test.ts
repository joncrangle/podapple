/**
 * Effect Services Tests
 *
 * Tests for FileSystem, DriveDetection, and SyncEngine Effect services.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import {
	createDriveDetectionTest,
	DriveDetection,
	type DriveEvent,
} from "@/services/effects/DriveDetection";
import { createDriveScanTest, DriveScan, DriveScanLive } from "@/services/effects/DriveScan";
import { EpisodeMatcher, EpisodeMatcherLive } from "@/services/effects/EpisodeMatcher";
import { Logger, LoggerLive } from "@/services/effects/Logger";
import {
	createFileSystemTest,
	FileNotFoundError,
	FileSystem,
	CopyError as FileSystemCopyError,
} from "@/services/effects/FileSystem";
import {
	createMetadataEditorTest,
	MetadataEditor,
	MetadataEditorLive,
} from "@/services/effects/MetadataEditor";
import { createSyncEngineTest, SyncEngine } from "@/services/effects/SyncEngine";
import { SettingsService, SettingsServiceLive } from "@/services/effects/SettingsService";
import {
	PodcastService,
	PodcastServiceLive,
	DatabaseNotFoundError,
} from "@/services/effects/PodcastService";
import type { Drive } from "@/types/drive";
import type { Podcast } from "@/types/podcast";

describe("FileSystem Service", () => {
	describe("exists", () => {
		it("returns true for existing files", async () => {
			const files = new Map<string, Uint8Array>([
				["/test/file.txt", new TextEncoder().encode("hello")],
			]);

			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				return yield* fs.exists("/test/file.txt");
			});

			const result = await Effect.runPromise(Effect.provide(program, createFileSystemTest(files)));

			expect(result).toBe(true);
		});

		it("returns false for non-existing files", async () => {
			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				return yield* fs.exists("/missing.txt");
			});

			const result = await Effect.runPromise(Effect.provide(program, createFileSystemTest()));

			expect(result).toBe(false);
		});
	});

	describe("readFile", () => {
		it("reads file contents", async () => {
			const content = new TextEncoder().encode("file content");
			const files = new Map<string, Uint8Array>([["/data.txt", content]]);

			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				return yield* fs.readFile("/data.txt");
			});

			const result = await Effect.runPromise(Effect.provide(program, createFileSystemTest(files)));

			expect(new TextDecoder().decode(result)).toBe("file content");
		});

		it("fails with FileNotFoundError for missing files", async () => {
			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				return yield* fs.readFile("/missing.txt");
			});

			const result = await Effect.runPromise(
				Effect.either(Effect.provide(program, createFileSystemTest())),
			);

			expect(result._tag).toBe("Left");
			if (result._tag === "Left") {
				expect(result.left).toBeInstanceOf(FileNotFoundError);
				expect((result.left as FileNotFoundError).path).toBe("/missing.txt");
			}
		});
	});

	describe("writeFile", () => {
		it("writes file contents", async () => {
			const files = new Map<string, Uint8Array>();
			const content = new TextEncoder().encode("new content");

			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				yield* fs.writeFile("/new.txt", content);
				return yield* fs.readFile("/new.txt");
			});

			const result = await Effect.runPromise(Effect.provide(program, createFileSystemTest(files)));

			expect(new TextDecoder().decode(result)).toBe("new content");
		});
	});

	describe("copyFile", () => {
		it("copies file from source to destination", async () => {
			const content = new TextEncoder().encode("original");
			const files = new Map<string, Uint8Array>([["/src.txt", content]]);

			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				yield* fs.copyFile("/src.txt", "/dest.txt");
				return yield* fs.readFile("/dest.txt");
			});

			const result = await Effect.runPromise(Effect.provide(program, createFileSystemTest(files)));

			expect(new TextDecoder().decode(result)).toBe("original");
		});

		it("fails with CopyError when source not found", async () => {
			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				return yield* fs.copyFile("/missing.txt", "/dest.txt");
			});

			const result = await Effect.runPromise(
				Effect.either(Effect.provide(program, createFileSystemTest())),
			);

			expect(result._tag).toBe("Left");
			if (result._tag === "Left") {
				expect(result.left).toBeInstanceOf(FileSystemCopyError);
			}
		});
	});

	describe("readDir", () => {
		it("lists directory contents", async () => {
			const files = new Map<string, Uint8Array>([
				["/dir/file1.txt", new Uint8Array()],
				["/dir/file2.txt", new Uint8Array()],
				["/dir/subdir/file3.txt", new Uint8Array()],
			]);

			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				return yield* fs.readDir("/dir");
			});

			const result = await Effect.runPromise(Effect.provide(program, createFileSystemTest(files)));

			expect(result).toContain("file1.txt");
			expect(result).toContain("file2.txt");
			expect(result).toContain("subdir");
		});
	});

	describe("stat", () => {
		it("returns file size", async () => {
			const content = new TextEncoder().encode("hello world");
			const files = new Map<string, Uint8Array>([["/file.txt", content]]);

			const program = Effect.gen(function* () {
				const fs = yield* FileSystem;
				return yield* fs.stat("/file.txt");
			});

			const result = await Effect.runPromise(Effect.provide(program, createFileSystemTest(files)));

			expect(result.size).toBe(11); // "hello world" = 11 bytes
		});
	});
});

describe("DriveDetection Service", () => {
	const mockDrives: Drive[] = [
		{
			id: "USB_DRIVE",
			name: "USB_DRIVE",
			bsdName: "disk2s1",
			mountPoint: "/Volumes/USB_DRIVE",
			totalSpace: 64000000000,
			freeSpace: 32000000000,
		},
		{
			id: "BACKUP",
			name: "BACKUP",
			bsdName: "disk3s1",
			mountPoint: "/Volumes/BACKUP",
			totalSpace: 128000000000,
			freeSpace: 64000000000,
		},
	];

	describe("scanDrives", () => {
		it("returns list of drives", async () => {
			const program = Effect.gen(function* () {
				const detection = yield* DriveDetection;
				return yield* detection.scanDrives();
			});

			const result = await Effect.runPromise(
				Effect.provide(program, createDriveDetectionTest(mockDrives)),
			);

			expect(result).toHaveLength(2);
			expect(result[0]?.name).toBe("USB_DRIVE");
			expect(result[1]?.name).toBe("BACKUP");
		});

		it("returns empty array when no drives", async () => {
			const program = Effect.gen(function* () {
				const detection = yield* DriveDetection;
				return yield* detection.scanDrives();
			});

			const result = await Effect.runPromise(Effect.provide(program, createDriveDetectionTest([])));

			expect(result).toHaveLength(0);
		});
	});

	describe("getDriveInfo", () => {
		it("returns drive info for valid mount point", async () => {
			const program = Effect.gen(function* () {
				const detection = yield* DriveDetection;
				return yield* detection.getDriveInfo("/Volumes/USB_DRIVE");
			});

			const result = await Effect.runPromise(
				Effect.provide(program, createDriveDetectionTest(mockDrives)),
			);

			expect(result).not.toBeNull();
			expect(result?.name).toBe("USB_DRIVE");
			expect(result?.freeSpace).toBe(32000000000);
		});

		it("returns null for invalid mount point", async () => {
			const program = Effect.gen(function* () {
				const detection = yield* DriveDetection;
				return yield* detection.getDriveInfo("/Volumes/NONEXISTENT");
			});

			const result = await Effect.runPromise(
				Effect.provide(program, createDriveDetectionTest(mockDrives)),
			);

			expect(result).toBeNull();
		});
	});

	describe("isScanning", () => {
		it("returns false by default in test implementation", async () => {
			const program = Effect.gen(function* () {
				const detection = yield* DriveDetection;
				return yield* detection.isScanning();
			});

			const result = await Effect.runPromise(
				Effect.provide(program, createDriveDetectionTest(mockDrives)),
			);

			expect(result).toBe(false);
		});
	});

	describe("driveEvents", () => {
		it("emits events", async () => {
			const drive = mockDrives[0];
			if (!drive) throw new Error("Mock drive not found");

			const mockEvent: DriveEvent = {
				_tag: "Appeared",
				drive,
			};

			const program = Effect.gen(function* () {
				const detection = yield* DriveDetection;
				const events = yield* Stream.runCollect(detection.driveEvents);
				return events;
			});

			const eventsStream = Stream.fromIterable([mockEvent]);
			const result = await Effect.runPromise(
				Effect.provide(program, createDriveDetectionTest(mockDrives, eventsStream)),
			);

			const resultArray = Array.from(result);
			expect(resultArray.length).toBe(1);
			expect(resultArray[0]).toEqual(mockEvent);
		});
	});
});

describe("SyncEngine Service", () => {
	const mockMacPodcasts: Podcast[] = [
		{
			id: "podcast-1",
			title: "Tech Talk",
			author: "Host A",
			episodeCount: 2,
			episodes: [
				{
					id: "ep-1",
					title: "Episode 1",
					duration: 3600,
					published: new Date("2024-01-01"),
					onDrive: false,
					filePath: "/path/to/ep1.mp3",
					fileSize: 0,
				},
				{
					id: "ep-2",
					title: "Episode 2",
					duration: 1800,
					published: new Date("2024-01-08"),
					onDrive: true,
					filePath: "/path/to/ep2.mp3",
					fileSize: 0,
				},
			],
		},
	];

	// Empty drive index (nothing on drive yet)
	const emptyDriveIndex = new Map<string, { path: string }>();

	describe("createPlan", () => {
		it("creates sync plan with unsynced episodes", async () => {
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

			// Only ep-1 should be in toCopy (ep-2 is synced)
			expect(result.toCopy).toHaveLength(1);
			expect(result.toCopy[0]?.episode.title).toBe("Episode 1");
			expect(result.toDelete).toHaveLength(0);
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

		it("skips episodes already on drive", async () => {
			// Simulate Episode 1 already on drive
			// Key must include .mp3 extension now
			const driveIndexWithEp1 = new Map<string, { path: string }>([
				["Tech_Talk/Episode_1.mp3", { path: "/Volumes/USB/Podcasts/Tech_Talk/Episode_1.mp3" }],
			]);

			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				return yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", driveIndexWithEp1);
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

			// Episode 1 already on drive, Episode 2 is synced - nothing to copy
			expect(result.toCopy).toHaveLength(0);
		});
	});

	describe("execute", () => {
		it("streams progress updates during sync", async () => {
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(mockMacPodcasts, "/Volumes/USB", emptyDriveIndex);

				const progress: Array<{ status: string; currentFile: string }> = [];
				const stream = engine.execute(plan, "/Volumes/USB");

				yield* Stream.runForEach(stream, (p) => {
					progress.push({ status: p.status, currentFile: p.currentFile });
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

			// Should have progress for the episode + completion
			expect(result.length).toBeGreaterThan(0);
			expect(result[result.length - 1]?.status).toBe("complete");
		});
	});
});

describe("DriveScan Service", () => {
	const testLogger = Layer.succeed(Logger, {
		debug: () => Effect.void,
		info: () => Effect.void,
		error: () => Effect.void,
	});

	describe("scanDrive", () => {
		it("returns empty array when no podcasts on drive", async () => {
			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				return yield* scanner.scanDrive("/Volumes/USB");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createDriveScanTest([]),
						createFileSystemTest(),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			expect(result).toHaveLength(0);
		});

		it("returns podcasts when present on drive", async () => {
			const mockDrivePodcasts = [
				{
					name: "Tech_Talk",
					path: "/Volumes/USB/Podcasts/Tech_Talk",
					episodes: [
						{
							id: "drive:Tech_Talk:ep1.mp3",
							title: "ep1",
							path: "/Volumes/USB/Podcasts/Tech_Talk/ep1.mp3",
							size: 5000000,
						},
					],
				},
			];

			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				return yield* scanner.scanDrive("/Volumes/USB");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createDriveScanTest(mockDrivePodcasts),
						createFileSystemTest(),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			expect(result).toHaveLength(1);
			expect(result[0]?.title).toBe("Tech_Talk");
			expect(result[0]?.episodes).toHaveLength(1);
		});
	});

	describe("buildDriveIndex", () => {
		it("builds index from drive podcasts", async () => {
			const mockDrivePodcasts = [
				{
					name: "Tech_Talk",
					path: "/Volumes/USB/Podcasts/Tech_Talk",
					episodes: [
						{
							id: "drive:Tech_Talk:Episode_1.mp3",
							title: "Episode 1",
							path: "/Volumes/USB/Podcasts/Tech_Talk/Episode_1.mp3",
							size: 5000000,
						},
					],
				},
			];

			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				return yield* scanner.buildDriveIndex("/Volumes/USB");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createDriveScanTest(mockDrivePodcasts),
						createFileSystemTest(),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			// Check index has correct key
			expect(result.size).toBe(1);
			expect(result.has("Tech_Talk/Episode 1")).toBe(true);
		});
	});

	describe("hasPodcastsFolder", () => {
		it("returns true when podcasts exist", async () => {
			const mockDrivePodcasts = [
				{
					name: "Tech_Talk",
					path: "/Volumes/USB/Podcasts/Tech_Talk",
					episodes: [],
				},
			];

			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				return yield* scanner.hasPodcastsFolder("/Volumes/USB");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createDriveScanTest(mockDrivePodcasts),
						createFileSystemTest(),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			expect(result).toBe(true);
		});

		it("returns false when no podcasts", async () => {
			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				return yield* scanner.hasPodcastsFolder("/Volumes/USB");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						createDriveScanTest([]),
						createFileSystemTest(),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			expect(result).toBe(false);
		});
	});

	describe("DriveScanLive (Real Implementation)", () => {
		const mockFiles = new Map<string, Uint8Array>([
			["/Volumes/USB/Podcasts/Tech_Talk/2024-01-15 - Episode_1.mp3", new Uint8Array(100)],
			["/Volumes/USB/Podcasts/Tech_Talk/2024-01-22 - Episode_2.mp3", new Uint8Array(200)],
			["/Volumes/USB/Podcasts/Tech_Talk/.DS_Store", new Uint8Array(0)], // System hidden file
			["/Volumes/USB/Podcasts/Tech_Talk/notes.txt", new Uint8Array(0)], // Non-audio file
			["/Volumes/USB/Podcasts/Tech_Talk/InvalidDate - Episode_3.mp3", new Uint8Array(300)], // Invalid date format fallback
		]);

		const testLogger = Layer.succeed(Logger, {
			debug: () => Effect.void,
			info: () => Effect.void,
			error: () => Effect.void,
		});

		it("scanDrive detects podcasts and correctly parses file dates and filters other files", async () => {
			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				return yield* scanner.scanDrive("/Volumes/USB");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						DriveScanLive,
						createFileSystemTest(mockFiles),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			expect(result).toHaveLength(1);
			const podcast = result[0]!;
			expect(podcast.title).toBe("Tech Talk"); // underscores to spaces
			expect(podcast.episodes).toHaveLength(3); // Episode 1, Episode 2, Episode 3

			// Verify individual items
			const ep1 = podcast.episodes.find((e) => e.title.includes("Episode 1"));
			expect(ep1).toBeDefined();
			expect(ep1?.published.toISOString().slice(0, 10)).toBe("2024-01-15");
			expect(ep1?.fileSize).toBe(100);

			const ep2 = podcast.episodes.find((e) => e.title.includes("Episode 2"));
			expect(ep2).toBeDefined();
			expect(ep2?.published.toISOString().slice(0, 10)).toBe("2024-01-22");
			expect(ep2?.fileSize).toBe(200);

			// Invalid date should fall back to now
			const ep3 = podcast.episodes.find((e) => e.title.includes("InvalidDate - Episode 3"));
			expect(ep3).toBeDefined();
			expect(ep3?.published).toBeInstanceOf(Date);
			expect(isNaN(ep3!.published.getTime())).toBe(false);
		});

		it("buildDriveIndex builds lookup table using expected drive keys", async () => {
			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				return yield* scanner.buildDriveIndex("/Volumes/USB");
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						DriveScanLive,
						createFileSystemTest(mockFiles),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			expect(result.size).toBe(3);
			expect(result.has("Tech_Talk/Episode_1.mp3")).toBe(true);
			expect(result.has("Tech_Talk/Episode_2.mp3")).toBe(true);
			expect(result.has("Tech_Talk/InvalidDate_-_Episode_3.mp3")).toBe(true);
		});

		it("hasPodcastsFolder returns true if folder exists, false otherwise", async () => {
			const program = Effect.gen(function* () {
				const scanner = yield* DriveScan;
				const has1 = yield* scanner.hasPodcastsFolder("/Volumes/USB");
				const has2 = yield* scanner.hasPodcastsFolder("/Volumes/Empty");
				return { has1, has2 };
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						DriveScanLive,
						createFileSystemTest(mockFiles),
						EpisodeMatcherLive,
						testLogger,
					),
				),
			);

			expect(result.has1).toBe(true);
			expect(result.has2).toBe(false);
		});
	});

	describe("EpisodeMatcher Service", () => {
		it("buildExpectedDrivePath formats destination path correctly", async () => {
			const program = Effect.gen(function* () {
				const matcher = yield* EpisodeMatcher;
				return matcher.buildExpectedDrivePath("Tech Talk", "Episode 1: Intro");
			});

			const result = await Effect.runPromise(Effect.provide(program, EpisodeMatcherLive));
			expect(result).toBe("Tech_Talk/Episode_1-_Intro.mp3");
		});

		it("matchEpisode matches by path, size, or duration tolerance within same show", async () => {
			const program = Effect.gen(function* () {
				const matcher = yield* EpisodeMatcher;
				const driveIndex = new Map<string, { path: string; size?: number; duration?: number }>([
					["Tech_Talk/Episode_1.mp3", { path: "/path/ep1.mp3", size: 1000, duration: 100 }],
					["Tech_Talk/Episode_2_Renamed.mp3", { path: "/path/ep2.mp3", size: 2000, duration: 200 }],
					["Tech_Talk/Episode_3_Renamed.mp3", { path: "/path/ep3.mp3", size: 3000, duration: 300 }],
					["Other_Show/Episode_1.mp3", { path: "/path/other.mp3", size: 2000, duration: 200 }], // same size/duration but different show
				]);

				// 1. Path match
				const match1 = matcher.matchEpisode("Tech Talk", { title: "Episode 1" }, driveIndex);

				// 2. Size match (same show)
				const match2 = matcher.matchEpisode(
					"Tech Talk",
					{ title: "Episode 2", fileSize: 2000 },
					driveIndex,
				);

				// 3. Duration match (within 2% tolerance, same show)
				const match3 = matcher.matchEpisode(
					"Tech Talk",
					{ title: "Episode 3", duration: 303 }, // 303 vs 300 is 1% diff
					driveIndex,
				);

				// 4. Same size/duration but different show should NOT match
				const match4 = matcher.matchEpisode(
					"Other Show",
					{ title: "Episode 4", fileSize: 1000, duration: 100 },
					driveIndex,
				);

				// 5. Duration match outside tolerance (e.g. 310s for 300s) should NOT match
				const match5 = matcher.matchEpisode(
					"Tech Talk",
					{ title: "Episode 5", duration: 310 }, // 310 vs 300 is > 3% diff
					driveIndex,
				);

				return { match1, match2, match3, match4, match5 };
			});

			const result = await Effect.runPromise(Effect.provide(program, EpisodeMatcherLive));
			expect(result.match1).toBe(true);
			expect(result.match2).toBe(true);
			expect(result.match3).toBe(true);
			expect(result.match4).toBe(false);
			expect(result.match5).toBe(false);
		});
	});

	describe("SettingsServiceLive (Real Implementation)", () => {
		it("loads, parses JSONC, and saves settings", async () => {
			const mockFs = new Map<string, Uint8Array>();
			// Write settings file with comments
			const jsoncContent = `
				// This is a test comment
				{
					"theme": "Nord", /* Another comment */
					"favoriteDrives": ["/Volumes/USB"]
				}
			`;
			const settingsDir = join(homedir(), ".config", "podapple");
			const settingsFile = join(settingsDir, "podapple.jsonc");
			mockFs.set(settingsFile, new TextEncoder().encode(jsoncContent));

			const program = Effect.gen(function* () {
				const settings = yield* SettingsService;
				// Test loading
				const loaded = yield* settings.loadSettings;
				expect(loaded.theme).toBe("Nord");
				expect(loaded.favoriteDrives).toEqual(["/Volumes/USB"]);

				// Test saving
				yield* settings.saveSettings({ theme: "Catppuccin" });
				const savedBytes = mockFs.get(settingsFile);
				expect(savedBytes).toBeDefined();
				const savedText = new TextDecoder().decode(savedBytes!);
				const savedObj = JSON.parse(savedText);
				expect(savedObj.theme).toBe("Catppuccin");
				expect(savedObj.favoriteDrives).toEqual(["/Volumes/USB"]);
			});

			const testFileSystem = createFileSystemTest(mockFs);
			const layer = SettingsServiceLive.pipe(
				Layer.provide(testFileSystem),
				Layer.provide(LoggerLive),
			);
			await Effect.runPromise(Effect.provide(program, layer));
		});
	});

	describe("PodcastServiceLive (Real Implementation)", () => {
		it("handles availability checks and DatabaseNotFoundError when db is missing", async () => {
			const mockFs = new Map<string, Uint8Array>();
			const testFileSystem = createFileSystemTest(mockFs);

			const program = Effect.gen(function* () {
				const podcastService = yield* PodcastService;

				// 1. Not available initially
				const available = yield* podcastService.checkAvailability;
				expect(available).toBe(false);

				// 2. loadMacPodcasts returns DatabaseNotFoundError
				const exit = yield* podcastService.loadMacPodcasts.pipe(Effect.exit);
				expect(exit._tag).toBe("Failure");
				if (exit._tag === "Failure") {
					expect(exit.cause._tag).toBe("Fail");
					if (exit.cause._tag === "Fail") {
						expect(exit.cause.error).toBeInstanceOf(DatabaseNotFoundError);
					}
				}
			});

			const layer = PodcastServiceLive.pipe(
				Layer.provide(testFileSystem),
				Layer.provide(LoggerLive),
			);
			await Effect.runPromise(Effect.provide(program, layer));
		});
	});

	describe("MetadataEditorLive (Real Implementation)", () => {
		it("writes ID3 tags to a file", async () => {
			const tempFile = join(import.meta.dir, "temp-test-tag.mp3");
			await Bun.write(tempFile, new Uint8Array(0));

			const program = Effect.gen(function* () {
				const editor = yield* MetadataEditor;
				yield* editor.write(tempFile, {
					title: "Test Episode",
					artist: "Test Artist",
					album: "Test Album",
				});
			});

			try {
				await Effect.runPromise(Effect.provide(program, MetadataEditorLive));
				// Verify ID3 tags were written (file size should have increased)
				const fs = await import("node:fs/promises");
				const stats = await fs.stat(tempFile);
				expect(stats.size).toBeGreaterThan(0);
				await fs.unlink(tempFile);
			} catch (e) {
				const fs = await import("node:fs/promises");
				await fs.unlink(tempFile).catch(() => {});
				throw e;
			}
		});
	});
});
