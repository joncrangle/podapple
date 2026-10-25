/**
 * Regression tests: episodes are matched to files on the drive by show + publish
 * date + title, not title alone. Exercises the real DriveScan, EpisodeMatcher and
 * SyncEngine.createPlan against a temp directory.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { DriveScan, DriveScanLive } from "@/services/effects/DriveScan";
import { EpisodeMatcher, EpisodeMatcherLive } from "@/services/effects/EpisodeMatcher";
import { FileSystemLive } from "@/services/effects/FileSystem";
import { LoggerLive } from "@/services/effects/Logger";
import { createMetadataEditorTest } from "@/services/effects/MetadataEditor";
import { SyncEngine, SyncEngineLive } from "@/services/effects/SyncEngine";
import type { Episode, Podcast } from "@/types/podcast";
import { formatDate, markEpisodesOnDrive, mapPodcastsToEpisodes } from "@/utils/formatting";

const root = await mkdtemp(join(tmpdir(), "podapple-match-"));
afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

let counter = 0;
/** Creates a fake drive with the given files under Podcasts/ and a Mac source dir. */
const makeDrive = async (files: string[]) => {
	const dir = join(root, `case-${counter++}`);
	const drive = join(dir, "drive");
	const mac = join(dir, "mac");
	await mkdir(mac, { recursive: true });
	for (const f of files) {
		await Bun.write(join(drive, "Podcasts", f), new Uint8Array([1, 2, 3]));
	}
	return { drive, mac };
};

const layer = Layer.mergeAll(
	DriveScanLive,
	EpisodeMatcherLive,
	FileSystemLive,
	SyncEngineLive,
	createMetadataEditorTest(),
).pipe(Layer.provideMerge(LoggerLive));

const localDate = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 30);

const macEpisode = async (
	mac: string,
	id: string,
	title: string,
	published: Date,
): Promise<Episode> => {
	const filePath = join(mac, `${id}.mp3`);
	await Bun.write(filePath, new Uint8Array([9, 9, 9, 9]));
	return {
		id,
		title,
		author: "Author",
		duration: 0,
		published,
		onDrive: false,
		filePath,
		fileSize: 4,
	};
};

const podcastOf = (title: string, episodes: Episode[]): Podcast => ({
	id: title,
	title,
	author: "Author",
	episodeCount: episodes.length,
	episodes,
});

/** Scans the drive, builds the index and plans a sync of `podcasts`. */
const plan = (drive: string, podcasts: Podcast[]) =>
	Effect.runPromise(
		Effect.provide(
			Effect.gen(function* () {
				const index = yield* (yield* DriveScan).buildDriveIndex(drive);
				return yield* (yield* SyncEngine).createPlan(podcasts, drive, index);
			}),
			layer,
		),
	);

describe("drive matching includes the publish date", () => {
	it("same title, different date: the newer episode is not on the drive and is planned", async () => {
		const { drive, mac } = await makeDrive(["Show/2024-01-01 - Trailer.mp3"]);
		const older = await macEpisode(mac, "old", "Trailer", localDate(2024, 1, 1));
		const newer = await macEpisode(mac, "new", "Trailer", localDate(2024, 6, 15));

		const result = await plan(drive, [podcastOf("Show", [older, newer])]);
		expect(result.toCopy.map((c) => c.episode.id)).toEqual(["new"]);
		expect(result.toCopy[0]?.destPath).toBe(`${drive}/Podcasts/Show/2024-06-15 - Trailer.mp3`);
	});

	it("same title, different date: only the matching date is marked onDrive", async () => {
		const { drive, mac } = await makeDrive(["Show/2024-01-01 - Trailer.mp3"]);
		const older = await macEpisode(mac, "old", "Trailer", localDate(2024, 1, 1));
		const newer = await macEpisode(mac, "new", "Trailer", localDate(2024, 6, 15));

		const scanned = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					return yield* (yield* DriveScan).scanDrive(drive);
				}),
				layer,
			),
		);
		const driveEpisodes = mapPodcastsToEpisodes(scanned).map((e) => ({
			...e,
			showName: "Show",
		}));
		const marked = markEpisodesOnDrive(
			[older, newer].map((e) => ({ ...e, showName: "Show", selected: false })),
			driveEpisodes,
		);
		expect(marked.map((e) => [e.id, e.onDrive])).toEqual([
			["old", true],
			["new", false],
		]);
	});

	it("same title and same date: matched, nothing planned", async () => {
		const { drive, mac } = await makeDrive(["Show/2024-01-01 - Trailer.mp3"]);
		const ep = await macEpisode(mac, "a", "Trailer", localDate(2024, 1, 1));

		const result = await plan(drive, [podcastOf("Show", [ep])]);
		expect(result.toCopy).toHaveLength(0);
	});

	it("a '(2)' deduped file still matches its episode", async () => {
		const { drive, mac } = await makeDrive([
			"Show/2024-01-01 - Trailer.mp3",
			"Show/2024-03-03 - Bonus (2).mp3",
		]);
		// The "(2)" copy exists on the drive, the undeduped base name does not.
		const bonus = await macEpisode(mac, "b", "Bonus", localDate(2024, 3, 3));
		const other = await macEpisode(mac, "c", "Bonus", localDate(2024, 3, 4));

		const result = await plan(drive, [podcastOf("Show", [bonus, other])]);
		expect(result.toCopy.map((c) => c.episode.id)).toEqual(["c"]);

		const scanned = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					return yield* (yield* DriveScan).scanDrive(drive);
				}),
				layer,
			),
		);
		const marked = markEpisodesOnDrive(
			[bonus, other].map((e) => ({ ...e, showName: "Show", selected: false })),
			mapPodcastsToEpisodes(scanned).map((e) => ({ ...e, showName: "Show" })),
		);
		expect(marked.map((e) => e.onDrive)).toEqual([true, false]);
	});

	it("Unknown dates round-trip: an Unknown episode matches 'Unknown - Title' only", async () => {
		const { drive, mac } = await makeDrive(["Show/Unknown - Trailer.mp3"]);
		const unknown = await macEpisode(mac, "u", "Trailer", new Date(NaN));
		const dated = await macEpisode(mac, "d", "Trailer", localDate(2024, 1, 1));
		expect(formatDate(unknown.published)).toBe("Unknown");

		const result = await plan(drive, [podcastOf("Show", [unknown, dated])]);
		expect(result.toCopy.map((c) => c.episode.id)).toEqual(["d"]);
	});

	it("legacy undated drive files still match by show and title", async () => {
		const { drive, mac } = await makeDrive(["Show/Trailer.mp3"]);
		const ep = await macEpisode(mac, "a", "Trailer", localDate(2024, 1, 1));

		const result = await plan(drive, [podcastOf("Show", [ep])]);
		expect(result.toCopy).toHaveLength(0);
	});

	it("the matcher keys the date from a Date and from the filename literal identically", async () => {
		const keys = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const matcher = yield* EpisodeMatcher;
					return [
						matcher.buildExpectedDrivePath("Show", "Ep", localDate(2024, 12, 31)),
						matcher.buildExpectedDrivePath("Show", "Ep", "2024-12-31"),
					];
				}),
				EpisodeMatcherLive,
			),
		);
		expect(keys[0]).toBe("Show/2024-12-31 - Ep.mp3");
		expect(keys[1]).toBe(keys[0]!);
	});
});

describe("DriveScan.scanDrive show-name normalization", () => {
	it("groups an NFD show directory with an NFC one", async () => {
		const nfc = "Café";
		const nfd = "Café";
		expect(nfc).not.toBe(nfd);
		const { drive } = await makeDrive([
			`${nfc}/2024-01-01 - One.mp3`,
			`${nfd}/2024-01-02 - Two.mp3`,
		]);

		const podcasts = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					return yield* (yield* DriveScan).scanDrive(drive);
				}),
				layer,
			),
		);
		expect(podcasts).toHaveLength(1);
		expect(podcasts[0]?.id).toBe(nfc);
		expect(podcasts[0]?.episodes).toHaveLength(2);
	});
});
