import { Database } from "bun:sqlite";
import { Effect, Exit } from "effect";
import type { EpisodeRow } from "@/types/podcast";

declare var self: Worker;

const APPLE_EPOCH_OFFSET = 978307200;

const parseFileUrl = (url: string) =>
	Effect.try({
		try: () => decodeURIComponent(new URL(url).pathname),
		catch: () => new Error("Invalid URL"),
	}).pipe(Effect.orElse(() => Effect.succeed(url.replace("file://", ""))));

self.onmessage = (event: MessageEvent) => {
	const { type, dbPath } = event.data;

	if (type === "LOAD") {
		const program = Effect.gen(function* () {
			// 1. Fetch raw rows from DB
			const rows = yield* Effect.try({
				try: () => {
					const db = new Database(dbPath, { readonly: true });
					const query = `
            SELECT
              e.Z_PK as id,
              e.ZTITLE as title,
              p.ZTITLE as showName,
              e.ZASSETURL as assetUrl,
              e.ZPUBDATE as pubDate,
              e.ZDURATION as duration
            FROM ZMTEPISODE e
            JOIN ZMTPODCAST p ON e.ZPODCASTUUID = p.ZUUID
            WHERE e.ZASSETURL IS NOT NULL
            ORDER BY e.ZPUBDATE DESC
          `;
					const results = db.query(query).all() as EpisodeRow[];
					db.close();
					return results;
				},
				catch: (error) => (error instanceof Error ? error : new Error(String(error))),
			});

			// 2. Transform rows using Effect to safely handle URL parsing
			return yield* Effect.forEach(rows, (row) =>
				Effect.gen(function* () {
					let filePath = "";
					if (row.assetUrl) {
						filePath = yield* parseFileUrl(row.assetUrl);
					}

					return {
						id: String(row.id),
						title: row.title ?? "Untitled",
						showName: row.showName ?? "Unknown",
						filePath,
						published: row.pubDate
							? new Date((row.pubDate + APPLE_EPOCH_OFFSET) * 1000)
							: new Date(0),
						duration: row.duration ?? 0,
						fileSize: 0,
						selected: false,
						onDrive: false,
					};
				}),
			);
		});

		Effect.runPromiseExit(program).then((exit) => {
			if (Exit.isSuccess(exit)) {
				self.postMessage({ type: "SUCCESS", data: exit.value });
			} else {
				self.postMessage({
					type: "ERROR",
					error: String(exit.cause),
				});
			}
		});
	}
};
