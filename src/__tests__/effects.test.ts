/**
 * Effect Services Tests
 *
 * Tests for FileSystem, DriveDetection, and SyncEngine Effect services.
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import {
  createDriveDetectionTest,
  DriveDetection,
  type DriveEvent,
} from "@/services/effects/DriveDetection";
import { createDriveScanTest, DriveScan } from "@/services/effects/DriveScan";
import { EpisodeMatcherLive } from "@/services/effects/EpisodeMatcher";
import {
  createFileSystemTest,
  FileNotFoundError,
  FileSystem,
  CopyError as FileSystemCopyError,
} from "@/services/effects/FileSystem";
import { createMetadataEditorTest } from "@/services/effects/MetadataEditor";
import { createSyncEngineTest, SyncEngine } from "@/services/effects/SyncEngine";
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
      mountPoint: "/Volumes/USB_DRIVE",
      totalSpace: 64000000000,
      freeSpace: 32000000000,
    },
    {
      id: "BACKUP",
      name: "BACKUP",
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
          publishedAt: new Date("2024-01-01"),
          synced: false,
          assetUrl: "/path/to/ep1.mp3",
        },
        {
          id: "ep-2",
          title: "Episode 2",
          duration: 1800,
          publishedAt: new Date("2024-01-08"),
          synced: true,
          assetUrl: "/path/to/ep2.mp3",
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
  describe("scanDrive", () => {
    it("returns empty array when no podcasts on drive", async () => {
      const program = Effect.gen(function* () {
        const scanner = yield* DriveScan;
        return yield* scanner.scanDrive("/Volumes/USB");
      });

      const result = await Effect.runPromise(
        Effect.provide(
          program,
          Layer.mergeAll(createDriveScanTest([]), createFileSystemTest(), EpisodeMatcherLive),
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
          Layer.mergeAll(createDriveScanTest([]), createFileSystemTest(), EpisodeMatcherLive),
        ),
      );

      expect(result).toBe(false);
    });
  });
});
