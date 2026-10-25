/**
 * Regression tests for the effect services: FileSystem.readDir, SyncEngine
 * (plan + tagging + cleanup), MetadataEditor merge semantics and the
 * DriveDetection debounce.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Effect, Exit, Layer, Option, Ref, Result, Stream } from "effect";
import nodeID3 from "node-id3";
import { processActivityEvent } from "@/services/effects/DriveDetection";
import { type EpisodeMatcher, EpisodeMatcherLive } from "@/services/effects/EpisodeMatcher";
import { createFileSystemTest, FileSystem, FileSystemLive } from "@/services/effects/FileSystem";
import { Logger, LoggerLive } from "@/services/effects/Logger";
import {
	MetadataEditor,
	MetadataEditorLive,
	type PodcastMetadata,
} from "@/services/effects/MetadataEditor";
import {
	PodcastError,
	PodcastService,
	PodcastServiceLive,
} from "@/services/effects/PodcastService";
import { SettingsService, SettingsServiceLive } from "@/services/effects/SettingsService";
import { dedupeDestPath, SyncEngine, SyncEngineLive } from "@/services/effects/SyncEngine";
import type { Drive } from "@/types/drive";
import type { Podcast } from "@/types/podcast";

const root = await mkdtemp(join(tmpdir(), "podapple-svc-"));
afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

let counter = 0;
const freshDir = async (): Promise<string> => {
	const dir = join(root, `case-${counter++}`);
	await mkdir(dir, { recursive: true });
	return dir;
};

const recordingEditor = (sink: Array<{ path: string; metadata: PodcastMetadata }>) =>
	Layer.succeed(MetadataEditor, {
		write: (path, metadata) =>
			Effect.sync(() => {
				sink.push({ path, metadata });
			}),
	});

const syncLayer = (editor: Layer.Layer<MetadataEditor>) =>
	Layer.mergeAll(SyncEngineLive, EpisodeMatcherLive, FileSystemLive, editor).pipe(
		Layer.provide(LoggerLive),
	);

const episode = (id: string, filePath: string, title = `Episode ${id}`) => ({
	id,
	title,
	author: "Host",
	duration: 60,
	published: new Date("2024-01-01T12:00:00Z"),
	onDrive: false,
	filePath,
	fileSize: 0,
});

const podcastOf = (episodes: ReturnType<typeof episode>[]): Podcast[] => [
	{ id: "p", title: "Show", author: "Host", episodeCount: episodes.length, episodes },
];

const runSync = <A, E>(
	program: Effect.Effect<A, E, SyncEngine | FileSystem | MetadataEditor | EpisodeMatcher>,
	editor: Layer.Layer<MetadataEditor>,
) => Effect.runPromise(Effect.provide(program, syncLayer(editor)) as Effect.Effect<A, E>);

describe("FileSystem.readDir", () => {
	it("returns directories as well as files (and skips dot entries)", async () => {
		const dir = await freshDir();
		await mkdir(join(dir, "Show A"));
		await Bun.write(join(dir, "loose.mp3"), new Uint8Array([1]));
		await Bun.write(join(dir, ".DS_Store"), new Uint8Array([1]));

		const entries = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					return yield* (yield* FileSystem).readDir(dir);
				}),
				FileSystemLive.pipe(Layer.provide(LoggerLive)),
			),
		);
		expect(entries.sort()).toEqual(["Show A", "loose.mp3"]);
	});
});

describe("SyncEngine.cleanup", () => {
	it("removes empty show dirs, including ones holding only system hidden files", async () => {
		const drive = await freshDir();
		const podcasts = join(drive, "Podcasts");
		await mkdir(join(podcasts, "Empty"), { recursive: true });
		await mkdir(join(podcasts, "OnlyHidden"), { recursive: true });
		await Bun.write(join(podcasts, "OnlyHidden", ".DS_Store"), new Uint8Array([1]));
		await Bun.write(join(podcasts, "OnlyHidden", "._ep.mp3"), new Uint8Array([1]));
		await mkdir(join(podcasts, "Full"), { recursive: true });
		await Bun.write(join(podcasts, "Full", "a.mp3"), new Uint8Array([1, 2]));
		await Bun.write(join(podcasts, "Full", ".DS_Store"), new Uint8Array([1]));

		await runSync(
			Effect.gen(function* () {
				yield* (yield* SyncEngine).cleanup(drive);
			}),
			recordingEditor([]),
		);

		expect(await Bun.file(join(podcasts, "Full", "a.mp3")).exists()).toBe(true);
		// Hidden files are swept even from a show dir that stays.
		expect(await Bun.file(join(podcasts, "Full", ".DS_Store")).exists()).toBe(false);
		const fs = await import("node:fs/promises");
		const remaining = await fs.readdir(podcasts);
		expect(remaining).toEqual(["Full"]);
	});
});

describe("SyncEngine tagging", () => {
	it("tags .mp3 (any case) but copies .m4a untouched and not counted as discarded", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		const m4a = new Uint8Array([9, 8, 7, 6, 5]);
		await Bun.write(join(dir, "a.m4a"), m4a);
		await Bun.write(join(dir, "b.MP3"), new Uint8Array([1, 2, 3]));

		const sink: Array<{ path: string; metadata: PodcastMetadata }> = [];
		const result = await runSync(
			Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(
					podcastOf([episode("1", join(dir, "a.m4a")), episode("2", join(dir, "b.MP3"))]),
					out,
					new Map(),
				);
				const progress = yield* Stream.runCollect(engine.execute(plan, out));
				return { plan, progress: Array.from(progress) };
			}),
			recordingEditor(sink),
		);

		expect(sink).toHaveLength(1);
		// Tagging happens on the .part, which is renamed into place afterwards.
		expect(sink[0]?.path.endsWith(".MP3.part")).toBe(true);
		expect(await Bun.file(sink[0]?.path as string).exists()).toBe(false);
		const m4aDest = result.plan.toCopy.find((c) => c.sourcePath.endsWith(".m4a"))?.destPath;
		expect(await Bun.file(m4aDest as string).bytes()).toEqual(m4a);
		expect(result.progress.at(-1)?.discarded).toBe(0);
		expect(result.progress.some((p) => p.currentFile.startsWith("Tagging:"))).toBe(true);
		expect(result.progress.filter((p) => p.currentFile === "Tagging: Episode 1").length).toBe(0);
	});
});

describe("SyncEngine.createPlan", () => {
	it("skips items whose source is missing or empty, and logs a warning", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		await Bun.write(join(dir, "ok.mp3"), new Uint8Array([1, 2, 3]));
		await Bun.write(join(dir, "empty.mp3"), new Uint8Array());

		const messages: string[] = [];
		const logger = Layer.succeed(Logger, {
			debug: () => Effect.void,
			info: (m) => Effect.sync(() => void messages.push(m)),
			error: (m) => Effect.sync(() => void messages.push(m)),
		});
		const layer = Layer.mergeAll(SyncEngineLive, EpisodeMatcherLive, FileSystemLive).pipe(
			Layer.provide(logger),
		);

		const plan = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					return yield* (yield* SyncEngine).createPlan(
						podcastOf([
							episode("1", join(dir, "ok.mp3")),
							episode("2", join(dir, "empty.mp3")),
							episode("3", join(dir, "missing.mp3")),
						]),
						out,
						new Map(),
					);
				}),
				layer,
			),
		);

		expect(plan.toCopy.map((c) => c.episode.id)).toEqual(["1"]);
		expect(plan.totalBytes).toBe(3);
		expect(messages.filter((m) => m.includes("skipping")).length).toBe(2);
	});

	it("gives colliding destinations distinct, deterministic paths and copies both", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		await Bun.write(join(dir, "a.mp3"), new Uint8Array([1, 1, 1]));
		await Bun.write(join(dir, "b.mp3"), new Uint8Array([2, 2, 2, 2]));
		const eps = podcastOf([
			episode("1", join(dir, "a.mp3"), "Same Title"),
			episode("2", join(dir, "b.mp3"), "Same Title"),
		]);

		const plan = async () =>
			runSync(
				Effect.gen(function* () {
					return yield* (yield* SyncEngine).createPlan(eps, out, new Map());
				}),
				recordingEditor([]),
			);
		const first = await plan();
		const second = await plan();
		const paths = first.toCopy.map((c) => c.destPath);

		expect(new Set(paths).size).toBe(2);
		expect(paths[0]?.endsWith("Same_Title.mp3")).toBe(true);
		expect(paths[1]?.endsWith("Same_Title (2).mp3")).toBe(true);
		expect(second.toCopy.map((c) => c.destPath)).toEqual(paths);

		await runSync(
			Effect.gen(function* () {
				yield* Stream.runDrain((yield* SyncEngine).execute(first, out));
			}),
			recordingEditor([]),
		);
		expect(await Bun.file(paths[0] as string).bytes()).toEqual(new Uint8Array([1, 1, 1]));
		expect(await Bun.file(paths[1] as string).bytes()).toEqual(new Uint8Array([2, 2, 2, 2]));
	});

	it("dedupeDestPath is case-insensitive and keeps the extension last", () => {
		const used = new Set<string>();
		expect(dedupeDestPath("/d/A.mp3", ".mp3", used)).toBe("/d/A.mp3");
		expect(dedupeDestPath("/d/a.MP3", ".MP3", used)).toBe("/d/a (2).MP3");
		expect(dedupeDestPath("/d/A.mp3", ".mp3", used)).toBe("/d/A (3).mp3");
	});

	it("skips an existing destination and re-plans a missing one", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		await Bun.write(join(dir, "ep.mp3"), new Uint8Array([1, 2, 3, 4, 5, 6]));
		const eps = podcastOf([episode("1", join(dir, "ep.mp3"))]);
		const planOnce = () =>
			runSync(
				Effect.gen(function* () {
					return yield* (yield* SyncEngine).createPlan(eps, out, new Map());
				}),
				recordingEditor([]),
			);

		const initial = await planOnce();
		const dest = initial.toCopy[0]?.destPath as string;
		expect(initial.toCopy).toHaveLength(1);

		// Even a smaller file at the final path counts as complete (tagging can shrink it).
		await Bun.write(dest, new Uint8Array([1, 2]));
		expect((await planOnce()).toCopy).toHaveLength(0);
	});
});

describe("SyncEngine atomic copy", () => {
	const executeOnce = (eps: Podcast[], out: string, editor: Layer.Layer<MetadataEditor>) =>
		runSync(
			Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(eps, out, new Map());
				const exit = yield* Effect.exit(Stream.runDrain(engine.execute(plan, out)));
				return { plan, exit };
			}),
			editor,
		);

	it("leaves no dest and no .part when the copy fails", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		// A directory opens for reading but fails on read: a mid-copy I/O error.
		await mkdir(join(dir, "ep.mp3"));
		const { plan, exit } = await executeOnce(
			podcastOf([episode("1", join(dir, "ep.mp3"))]),
			out,
			recordingEditor([]),
		);
		expect(plan.toCopy).toHaveLength(1);
		expect(Exit.isFailure(exit)).toBe(true);
		const dest = plan.toCopy[0]?.destPath as string;
		expect(await Bun.file(dest).exists()).toBe(false);
		expect(await Bun.file(`${dest}.part`).exists()).toBe(false);
	});

	it("leaves no dest and no .part when the copy is interrupted mid-file", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		await Bun.write(join(dir, "ep.mp3"), new Uint8Array(5 * 1024 * 1024).fill(7));
		const plan = await runSync(
			Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(
					podcastOf([episode("1", join(dir, "ep.mp3"))]),
					out,
					new Map(),
				);
				// Initial progress plus the first 1 MiB chunk, then the consumer stops.
				yield* Stream.runDrain(Stream.take(engine.execute(plan, out), 2));
				return plan;
			}),
			recordingEditor([]),
		);
		const dest = plan.toCopy[0]?.destPath as string;
		expect(await Bun.file(dest).exists()).toBe(false);
		expect(await Bun.file(`${dest}.part`).exists()).toBe(false);
	});

	it("removes a stale .part before copying and never leaves one behind", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		const content = new Uint8Array([4, 5, 6, 7]);
		await Bun.write(join(dir, "ep.m4a"), content);
		const eps = podcastOf([episode("1", join(dir, "ep.m4a"))]);
		const plan = await runSync(
			Effect.gen(function* () {
				return yield* (yield* SyncEngine).createPlan(eps, out, new Map());
			}),
			recordingEditor([]),
		);
		const dest = plan.toCopy[0]?.destPath as string;
		await Bun.write(`${dest}.part`, new Uint8Array(100).fill(9));
		await runSync(
			Effect.gen(function* () {
				yield* Stream.runDrain((yield* SyncEngine).execute(plan, out));
			}),
			recordingEditor([]),
		);
		expect(await Bun.file(dest).bytes()).toEqual(content);
		expect(await Bun.file(`${dest}.part`).exists()).toBe(false);
	});

	it("does not re-plan an mp3 whose tagged output is smaller than the source", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		const source = new Uint8Array(4096).fill(3);
		await Bun.write(join(dir, "ep.mp3"), source);
		const eps = podcastOf([episode("1", join(dir, "ep.mp3"))]);
		// A tagger that shrinks the file, as ID3 padding rewrites can.
		const shrinking = Layer.succeed(MetadataEditor, {
			write: (path) =>
				Effect.promise(async () => {
					await Bun.write(path, source.subarray(0, 1000));
				}),
		});
		const { plan, exit } = await executeOnce(eps, out, shrinking);
		expect(Exit.isSuccess(exit)).toBe(true);
		const dest = plan.toCopy[0]?.destPath as string;
		expect((await Bun.file(dest).bytes()).length).toBe(1000);
		expect(await Bun.file(`${dest}.part`).exists()).toBe(false);

		const second = await runSync(
			Effect.gen(function* () {
				return yield* (yield* SyncEngine).createPlan(eps, out, new Map());
			}),
			shrinking,
		);
		expect(second.toCopy).toHaveLength(0);
	});

	it("copies a non-mp3 byte-identical without tagging", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		const content = new Uint8Array(3000).map((_, i) => (i * 13) % 256);
		await Bun.write(join(dir, "ep.m4a"), content);
		const sink: Array<{ path: string; metadata: PodcastMetadata }> = [];
		const { plan, exit } = await executeOnce(
			podcastOf([episode("1", join(dir, "ep.m4a"))]),
			out,
			recordingEditor(sink),
		);
		expect(Exit.isSuccess(exit)).toBe(true);
		const dest = plan.toCopy[0]?.destPath as string;
		expect(await Bun.file(dest).bytes()).toEqual(content);
		expect(sink).toHaveLength(0);
	});
});

describe("MetadataEditor merge", () => {
	it("keeps frames already in the file (cover art) when writing podcast tags", async () => {
		const dir = await freshDir();
		const file = join(dir, "ep.mp3");
		const bytes = new Uint8Array(1024);
		for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
		await Bun.write(file, bytes);

		const cover = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
		nodeID3.write(
			{
				title: "Old",
				image: { mime: "image/jpeg", type: { id: 3 }, description: "cover", imageBuffer: cover },
			},
			file,
		);

		await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					yield* (yield* MetadataEditor).write(file, {
						title: "New",
						artist: "Host",
						album: "Show",
						genre: "Podcast",
						year: "2024",
						comment: "Published: 2024-01-01",
					});
				}),
				MetadataEditorLive,
			),
		);

		const tags = nodeID3.read(file);
		expect(tags.title).toBe("New");
		expect(tags.artist).toBe("Host");
		const image = tags.image as { imageBuffer: Buffer } | undefined;
		expect(image?.imageBuffer.equals(cover)).toBe(true);
	});
});

describe("DriveDetection debounce", () => {
	const drive: Drive = {
		id: "UUID",
		name: "USB",
		bsdName: "disk4s1",
		mountPoint: "/Volumes/USB",
		totalSpace: 1,
		freeSpace: 1,
	};
	const logger = {
		debug: () => Effect.void,
		info: () => Effect.void,
		error: () => Effect.void,
	};

	const setup = () =>
		Effect.gen(function* () {
			return {
				driveIdMap: yield* Ref.make(new Map<string, string>()),
				lastEventTimeMap: yield* Ref.make(new Map<string, number>()),
			};
		});

	it("does not let an empty Appeared (pre-mount) swallow the VolumeMount that follows", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const state = yield* setup();
				const ev = { type: "Appeared", bsdName: "disk4s1" } as const;
				const early = yield* processActivityEvent(
					ev,
					state,
					() => Effect.succeed(Option.none()),
					logger,
					10_000,
				);
				const mounted = yield* processActivityEvent(
					ev,
					state,
					() => Effect.succeed(Option.some(drive)),
					logger,
					10_100,
				);
				const dup = yield* processActivityEvent(
					ev,
					state,
					() => Effect.succeed(Option.some(drive)),
					logger,
					10_500,
				);
				const later = yield* processActivityEvent(
					ev,
					state,
					() => Effect.succeed(Option.some(drive)),
					logger,
					11_200,
				);
				return { early, mounted, dup, later };
			}),
		);
		expect(Option.isNone(result.early)).toBe(true);
		expect(Option.isSome(result.mounted)).toBe(true);
		// A real emitted event still debounces its immediate duplicates.
		expect(Option.isNone(result.dup)).toBe(true);
		expect(Option.isSome(result.later)).toBe(true);
	});

	it("does not record a timestamp for a Disappeared of an unknown drive", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const state = yield* setup();
				const gone = { type: "Disappeared", bsdName: "disk4s1" } as const;
				const unknown = yield* processActivityEvent(
					gone,
					state,
					() => Effect.succeed(Option.none()),
					logger,
					5_000,
				);
				yield* Ref.update(state.driveIdMap, (m) => new Map(m).set("disk4s1", "UUID"));
				const known = yield* processActivityEvent(
					gone,
					state,
					() => Effect.succeed(Option.none()),
					logger,
					5_100,
				);
				return { unknown, known };
			}),
		);
		expect(Option.isNone(result.unknown)).toBe(true);
		expect(Option.getOrNull(result.known)).toEqual({ _tag: "Disappeared", driveId: "UUID" });
	});
});

describe("FileSystem.getExtension", () => {
	const ext = (path: string) =>
		Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					return (yield* FileSystem).getExtension(path);
				}),
				FileSystemLive.pipe(Layer.provide(LoggerLive)),
			),
		);

	it("only considers the basename", async () => {
		expect(await ext("/Volumes/My.Drive/episode")).toBe(".mp3");
		expect(await ext("/a.b/c.d/episode.m4a")).toBe(".m4a");
		expect(await ext("/a/ep.final.MP3")).toBe(".MP3");
		expect(await ext("/a/ep.")).toBe(".mp3");
	});
});

describe("SyncEngine tagging, invalid dates", () => {
	it("does not crash the stream on an invalid published date", async () => {
		const dir = await freshDir();
		const out = join(dir, "out");
		await Bun.write(join(dir, "a.mp3"), new Uint8Array([1, 2, 3]));
		const bad = { ...episode("1", join(dir, "a.mp3")), published: new Date(Number.NaN) };

		const sink: Array<{ path: string; metadata: PodcastMetadata }> = [];
		const last = await runSync(
			Effect.gen(function* () {
				const engine = yield* SyncEngine;
				const plan = yield* engine.createPlan(podcastOf([bad]), out, new Map());
				const progress = Array.from(yield* Stream.runCollect(engine.execute(plan, out)));
				return progress.at(-1);
			}),
			recordingEditor(sink),
		);
		expect(last?.status).toBe("complete");
		expect(sink).toHaveLength(1);
		expect(sink[0]?.metadata.year).toBeUndefined();
		expect(sink[0]?.metadata.comment).toBeUndefined();
		expect(sink[0]?.metadata.artist).toBe("Host");
	});
});

describe("SettingsService", () => {
	const settingsFile = join(homedir(), ".config", "podapple", "podapple.jsonc");
	const run = <A, E>(
		files: Map<string, Uint8Array>,
		program: Effect.Effect<A, E, SettingsService>,
	) =>
		Effect.runPromise(
			Effect.provide(
				program,
				SettingsServiceLive.pipe(
					Layer.provide(createFileSystemTest(files)),
					Layer.provide(LoggerLive),
				),
			),
		);

	it("refuses to overwrite a settings file that exists but does not parse", async () => {
		const corrupt = new TextEncoder().encode('{ "theme": "Nord", ');
		const files = new Map<string, Uint8Array>([[settingsFile, corrupt]]);

		const exit = await run(
			files,
			Effect.gen(function* () {
				return yield* (yield* SettingsService).saveSettings({ theme: "Dracula" }).pipe(Effect.exit);
			}),
		);
		expect(exit._tag).toBe("Failure");
		expect(files.get(settingsFile)).toBe(corrupt);
		// No temp file left behind.
		expect(Array.from(files.keys())).toEqual([settingsFile]);

		// Loading still degrades to defaults rather than throwing.
		const loaded = await run(
			files,
			Effect.gen(function* () {
				return yield* (yield* SettingsService).loadSettings;
			}),
		);
		expect(loaded.theme).toBe("Catppuccin");
	});

	it("creates a missing settings file via temp file + rename", async () => {
		const files = new Map<string, Uint8Array>();
		await run(
			files,
			Effect.gen(function* () {
				yield* (yield* SettingsService).saveSettings({ theme: "Nord" });
			}),
		);
		expect(Array.from(files.keys())).toEqual([settingsFile]);
		expect(JSON.parse(new TextDecoder().decode(files.get(settingsFile))).theme).toBe("Nord");
	});
});

describe("PodcastService worker startup", () => {
	it("maps a throwing `new Worker` to PodcastError, not a defect", async () => {
		const RealWorker = globalThis.Worker;
		globalThis.Worker = class {
			constructor() {
				throw new Error("worker boom");
			}
		} as unknown as typeof Worker;
		try {
			const exit = await Effect.runPromise(
				Effect.provide(
					Effect.gen(function* () {
						const svc = yield* PodcastService;
						return yield* svc.loadMacPodcasts.pipe(Effect.exit);
					}),
					PodcastServiceLive.pipe(
						Layer.provide(
							// The DB file "exists" as far as the service can tell.
							createFileSystemTest(
								new Map([
									[
										join(
											homedir(),
											"Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Documents/MTLibrary.sqlite",
										),
										new Uint8Array([1]),
									],
								]),
							),
						),
						Layer.provide(LoggerLive),
					),
				),
			);
			expect(exit._tag).toBe("Failure");
			if (exit._tag === "Failure") {
				const error = Cause.findError(exit.cause);
				expect(Result.isSuccess(error)).toBe(true);
				if (Result.isSuccess(error)) expect(error.success).toBeInstanceOf(PodcastError);
			}
		} finally {
			globalThis.Worker = RealWorker;
		}
	});
});

describe("db.worker", () => {
	it("still loads episodes from a real SQLite file (connection closed in finally)", async () => {
		const dir = await freshDir();
		const dbPath = join(dir, "MTLibrary.sqlite");
		const db = new Database(dbPath);
		db.run("CREATE TABLE ZMTPODCAST (ZUUID TEXT, ZTITLE TEXT, ZAUTHOR TEXT)");
		db.run(
			"CREATE TABLE ZMTEPISODE (Z_PK INTEGER, ZTITLE TEXT, ZPODCASTUUID TEXT, ZASSETURL TEXT, ZPUBDATE REAL, ZDURATION REAL)",
		);
		db.run("INSERT INTO ZMTPODCAST VALUES ('u1', 'Show', 'Host')");
		db.run("INSERT INTO ZMTEPISODE VALUES (1, 'Ep', 'u1', 'file:///tmp/a%20b.mp3', 1000, 60)");
		db.close();

		const worker = new Worker(new URL("../services/workers/db.worker.ts", import.meta.url));
		try {
			const message = await new Promise<{
				type: string;
				data?: Array<{ filePath: string; author: string }>;
			}>((resolve, reject) => {
				worker.onmessage = (e) => resolve(e.data);
				worker.onerror = (e) => reject(e);
				worker.postMessage({ type: "LOAD", dbPath });
			});
			expect(message.type).toBe("SUCCESS");
			expect(message.data?.[0]?.filePath).toBe("/tmp/a b.mp3");
			expect(message.data?.[0]?.author).toBe("Host");

			// An unreadable database reports ERROR instead of hanging.
			const failure = await new Promise<{ type: string }>((resolve) => {
				worker.onmessage = (e) => resolve(e.data);
				worker.postMessage({ type: "LOAD", dbPath: join(dir, "missing.sqlite") });
			});
			expect(failure.type).toBe("ERROR");
		} finally {
			worker.terminate();
		}
	});
});
