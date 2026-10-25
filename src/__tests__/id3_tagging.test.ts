import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import nodeID3 from "node-id3";
import { FileSystemLive } from "@/services/effects/FileSystem";
import { LoggerLive } from "@/services/effects/Logger";
import { MetadataEditor, MetadataEditorLive } from "@/services/effects/MetadataEditor";
import { groupEpisodesByPodcast } from "@/utils/formatting";
import type { PodcastEpisode } from "@/types/podcast";

const dir = await mkdtemp(join(tmpdir(), "podapple-id3-"));

afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** A byte stream big enough for node-id3 to parse as a real audio file. */
const fakeMp3 = (): Uint8Array => {
	const bytes = new Uint8Array(1024);
	for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
	return bytes;
};

const writeTag = (file: string, artist: string, album: string) =>
	Effect.runPromise(
		Effect.provide(
			Effect.gen(function* () {
				const editor = yield* MetadataEditor;
				return yield* editor.write(file, {
					title: "Ep 1",
					artist,
					album,
					genre: "Podcast",
					year: "2024",
					comment: "Published: 2024-01-01",
				});
			}),
			Layer.mergeAll(MetadataEditorLive, FileSystemLive).pipe(Layer.provide(LoggerLive)),
		),
	);

describe("ID3 tagging, end to end", () => {
	it("puts the podcast author in the file's ID3 artist frame", async () => {
		const file = join(dir, "ep1.mp3");
		await Bun.write(file, fakeMp3());

		// Exactly what db.worker now produces from ZMTPODCAST.ZAUTHOR.
		const episode: PodcastEpisode = {
			id: "1",
			title: "Ep 1",
			author: "Dan Carlin",
			duration: 60,
			published: new Date("2024-01-01"),
			onDrive: false,
			filePath: file,
			fileSize: 1024,
			selected: true,
			showName: "Hardcore History",
		};

		const podcast = groupEpisodesByPodcast([episode])[0]!;
		expect(podcast.author).toBe("Dan Carlin");

		await writeTag(file, podcast.author, podcast.title);

		// Read the file back off disk, rather than trusting what was passed in.
		// This is the assertion the whole ZAUTHOR chain exists to satisfy: every
		// file podapple ever synced carried a blank artist before this.
		const tags = nodeID3.read(file);
		expect(tags.artist).toBe("Dan Carlin");
		expect(tags.album).toBe("Hardcore History");
	});

	it("never writes a blank artist, whatever the episode carries", async () => {
		const file = join(dir, "ep2.mp3");
		await Bun.write(file, fakeMp3());

		// No ZAUTHOR recorded, and a whitespace-only one, both have to fall back.
		for (const author of ["", "   "]) {
			const episode: PodcastEpisode = {
				id: "2",
				title: "Ep 2",
				author,
				duration: 60,
				published: new Date("2024-01-01"),
				onDrive: false,
				filePath: file,
				fileSize: 1024,
				selected: true,
				showName: "Show",
			};
			const podcast = groupEpisodesByPodcast([episode])[0]!;
			expect(podcast.author).not.toBe("");
			await writeTag(file, podcast.author, podcast.title);
			expect(nodeID3.read(file).artist).not.toBe("");
		}
	});
});
