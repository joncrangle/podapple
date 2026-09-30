/**
 * SyncEngineLive execute tests.
 *
 * These exercise the real engine (not the test double) so that the
 * currentIndex contract and the tag-failure cleanup are pinned against
 * production code paths.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Effect, Layer, Stream } from "effect";
import { EpisodeMatcherLive } from "@/services/effects/EpisodeMatcher";
import { FileSystemLive } from "@/services/effects/FileSystem";
import { LoggerLive } from "@/services/effects/Logger";
import {
	createMetadataEditorTest,
	MetadataEditor,
	MetadataError,
	type PodcastMetadata,
} from "@/services/effects/MetadataEditor";
import { SyncEngine, SyncEngineLive } from "@/services/effects/SyncEngine";
import type { Podcast } from "@/types/podcast";

const makePodcast = (root: string, count: number): Podcast[] => [
	{
		id: "live-1",
		title: "Live Show",
		author: "Dan Carlin",
		episodeCount: count,
		episodes: Array.from({ length: count }, (_, i) => ({
			id: `live-ep-${i + 1}`,
			title: `Live Episode ${i + 1}`,
			author: "Dan Carlin",
			duration: 60,
			published: new Date("2024-01-01"),
			onDrive: false,
			filePath: join(root, `ep${i + 1}.mp3`),
			fileSize: 0,
		})),
	},
];

/** A MetadataEditor whose write always fails, to exercise the tag-failure path. */
const failingMetadataEditor = () =>
	Layer.succeed(MetadataEditor, {
		write: (path) => Effect.fail(new MetadataError({ path, cause: new Error("tag boom") })),
	});

/** A MetadataEditor that records what it was asked to write. */
const recordingMetadataEditor = (sink: PodcastMetadata[]) =>
	Layer.succeed(MetadataEditor, {
		write: (_path, metadata) =>
			Effect.sync(() => {
				sink.push(metadata);
			}),
	});

describe("SyncEngineLive.execute", () => {
	it("emits 1-based currentIndex", async () => {
		const directory = await mkdtemp(join(tmpdir(), "podapple-live-"));
		try {
			for (let i = 1; i <= 3; i++) {
				await Bun.write(join(directory, `ep${i}.mp3`), new Uint8Array([1, 2, 3]));
			}

			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(
					makePodcast(directory, 3),
					join(directory, "out"),
					new Map(),
				);
				const seen: number[] = [];
				yield* Stream.runForEach(engine.execute(plan, join(directory, "out")), (prog) =>
					Effect.sync(() => {
						seen.push(prog.currentIndex);
					}),
				);
				return seen;
			});

			const seen = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						SyncEngineLive,
						EpisodeMatcherLive,
						FileSystemLive,
						createMetadataEditorTest(),
					).pipe(Layer.provide(LoggerLive)),
				),
			);

			expect(seen.length).toBeGreaterThan(0);
			// currentIndex is a 1-based position, emitted before the copy starts.
			expect(seen.every((v) => v >= 1)).toBe(true);
			// The first file in flight reports 1, not 0.
			expect(seen[0]).toBe(1);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("writes the podcast author as the ID3 artist", async () => {
		const directory = await mkdtemp(join(tmpdir(), "podapple-artist-"));
		const destDir = join(directory, "out");
		try {
			await Bun.write(join(directory, "ep1.mp3"), new Uint8Array([1, 2, 3]));

			const written: PodcastMetadata[] = [];
			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(makePodcast(directory, 1), destDir, new Map());
				yield* Stream.runForEach(engine.execute(plan, destDir), () => Effect.void);
			});

			await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						SyncEngineLive,
						EpisodeMatcherLive,
						FileSystemLive,
						recordingMetadataEditor(written),
					).pipe(Layer.provide(LoggerLive)),
				),
			);

			// The author is what lands in the ID3 artist frame; a blank here is the bug.
			expect(written).toHaveLength(1);
			expect(written[0]?.artist).toBe("Dan Carlin");
			expect(written[0]?.artist?.trim()).not.toBe("");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("unlinks the copied file when tagging fails, and still completes", async () => {
		const directory = await mkdtemp(join(tmpdir(), "podapple-tagfail-"));
		const destDir = join(directory, "out");
		try {
			await Bun.write(join(directory, "ep1.mp3"), new Uint8Array([1, 2, 3]));

			const program = Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(makePodcast(directory, 1), destDir, new Map());
				const statuses: string[] = [];
				yield* Stream.runForEach(engine.execute(plan, destDir), (prog) =>
					Effect.sync(() => {
						statuses.push(prog.status);
					}),
				);
				return { statuses, destPath: plan.toCopy[0]?.destPath };
			});

			const result = await Effect.runPromise(
				Effect.provide(
					program,
					Layer.mergeAll(
						SyncEngineLive,
						EpisodeMatcherLive,
						FileSystemLive,
						failingMetadataEditor(),
					).pipe(Layer.provide(LoggerLive)),
				),
			);

			// A failed tag never fails the sync.
			expect(result.statuses[result.statuses.length - 1]).toBe("complete");
			// The half-tagged file must not linger on the drive.
			expect(result.destPath).toBeDefined();
			expect(await Bun.file(result.destPath as string).exists()).toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
