/**
 * DriveDetection Effect Service
 *
 * Scans for external/removable drives on macOS using diskutil.
 * Uses Bun.spawn for native process execution and parsing of 'diskutil activity'.
 */

import { Context, Data, Effect, Either, Layer, Option, Ref, Stream } from "effect";
import type { Drive } from "@/types/drive";
import {
	getPlistBoolean,
	getPlistNumber,
	getPlistString,
	type PlistDict,
	parsePlist,
} from "@/utils/plist";
import { Logger } from "./Logger";

export class DriveDetectionError extends Data.TaggedError("DriveDetectionError")<{
	cause: unknown;
}> {}

export type DriveEvent =
	| { readonly _tag: "Appeared"; readonly drive: Drive }
	| { readonly _tag: "Disappeared"; readonly driveId: string };

/**
 * DriveDetection Service Tag
 */
export class DriveDetection extends Context.Tag("DriveDetection")<
	DriveDetection,
	{
		/** Scans for available external/removable volumes */
		readonly scanDrives: () => Effect.Effect<Drive[], DriveDetectionError>;
		/** Gets detailed information for a specific drive by its mount point */
		readonly getDriveInfo: (mountPoint: string) => Effect.Effect<Drive | null, DriveDetectionError>;
		/** Checks if a background activity scan is currently active */
		readonly isScanning: () => Effect.Effect<boolean, never>;
		/** A stream of drive appearance and disappearance events */
		readonly driveEvents: Stream.Stream<DriveEvent, DriveDetectionError>;
	}
>() {}

const EXCLUDED_NAMES = new Set([
	"Macintosh HD",
	"Macintosh HD - Data",
	"Recovery",
	"Preboot",
	"VM",
	"Update",
]);

/**
 * Checks if a volume should be excluded from detection.
 * Filters out internal/system volumes and Time Machine backups.
 * Returns the reason for exclusion if it should be excluded, or null otherwise.
 */
function getExclusionReason(info: PlistDict): string | null {
	const volumeName = getPlistString(info, "VolumeName") ?? "";
	const mountPoint = getPlistString(info, "MountPoint") ?? "";

	if (EXCLUDED_NAMES.has(volumeName)) return `In EXCLUDED_NAMES: ${volumeName}`;
	if (!mountPoint) return "No mount point";

	// Skip Time Machine volumes
	const volumeType = getPlistString(info, "FilesystemType") ?? "";
	if (volumeType === "apfs" && volumeName.toLowerCase().includes("time machine"))
		return "Time Machine volume";

	const internal = getPlistBoolean(info, "Internal");
	const removable = getPlistBoolean(info, "Removable");
	const ejectable = getPlistBoolean(info, "Ejectable");

	// Include if explicitly external/removable/ejectable.
	// Also include USB/Thunderbolt drives even if marked internal (common for some external enclosures).
	if (internal === true && removable !== true && ejectable !== true) {
		const busProtocol = getPlistString(info, "BusProtocol") ?? "";
		if (busProtocol !== "USB" && busProtocol !== "Thunderbolt") {
			return `Internal drive with non-removable protocol: ${busProtocol}`;
		}
	}

	return null;
}

const runDiskutil = (args: string[]) =>
	Effect.tryPromise({
		try: async () => {
			const finalArgs = ["diskutil"];
			if (args[0] === "info") {
				finalArgs.push("info", "-plist", ...args.slice(1));
			} else {
				finalArgs.push(...args, "-plist");
			}

			const proc = Bun.spawn(finalArgs, {
				stdout: "pipe",
				stderr: "pipe",
			});

			const output = await new Response(proc.stdout).text();
			const exitCode = await proc.exited;

			if (exitCode !== 0) {
				throw new Error(`diskutil exited with code ${exitCode}`);
			}

			const parsedEither = parsePlist(output);
			if (Either.isLeft(parsedEither)) {
				throw parsedEither.left;
			}
			const parsed = parsedEither.right;
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				return parsed as PlistDict;
			}
			throw new Error("Invalid plist output");
		},
		catch: (cause) => new DriveDetectionError({ cause }),
	});

const getDriveDetails = (identifier: string, logger: Context.Tag.Service<Logger>) =>
	Effect.gen(function* (_) {
		const info = yield* _(runDiskutil(["info", identifier]));

		const exclusionReason = getExclusionReason(info);
		if (exclusionReason) {
			yield* logger.debug(`Volume ${identifier} excluded: ${exclusionReason}`);
			return Option.none();
		}

		const mountPoint = getPlistString(info, "MountPoint");
		if (!mountPoint) return Option.none();

		const volumeUUID = getPlistString(info, "VolumeUUID") ?? "";
		const volumeName = getPlistString(info, "VolumeName") ?? mountPoint.split("/").pop() ?? "";
		const bsdName = getPlistString(info, "DeviceIdentifier") ?? "";
		const totalSpace = getPlistNumber(info, "TotalSize") ?? 0;

		// FreeSpace might be under different keys depending on filesystem
		let freeSpace = getPlistNumber(info, "VolumeFreeSpace");
		if (freeSpace === undefined) {
			freeSpace = getPlistNumber(info, "APFSContainerFree");
		}
		if (freeSpace === undefined) {
			freeSpace = getPlistNumber(info, "FreeSpace");
		}
		if (freeSpace === undefined) {
			const containerTotal = getPlistNumber(info, "APFSContainerTotalSpace");
			const containerUsed = getPlistNumber(info, "APFSPhysicalStoreSize");
			if (containerTotal !== undefined && containerUsed !== undefined) {
				freeSpace = containerTotal - containerUsed;
			}
		}

		// Filter out drives with 0 total space (likely unmounted or invalid)
		if (totalSpace <= 0) {
			yield* logger.debug(`Volume ${identifier} excluded: zero total space`);
			return Option.none();
		}

		return Option.some({
			id: volumeUUID || bsdName || volumeName,
			name: volumeName,
			bsdName,
			mountPoint,
			totalSpace,
			freeSpace: freeSpace ?? -1,
		} as Drive);
	}).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

/**
 * Parses a line from `diskutil activity` output.
 * Looking for ***DiskAppeared or ***DiskDisappeared events.
 */
export function parseActivityLine(
	line: string,
): Option.Option<{ type: "Appeared" | "Disappeared"; bsdName: string }> {
	const match = line.match(
		/^\s*\*\*\*(DiskAppeared|DiskDisappeared|VolumeMount|VolumeUnmount|DiskDescriptionChanged)\s+\('([^']+)',/,
	);
	if (!match?.[1] || !match[2]) return Option.none();

	const action = match[1];
	const bsdName = match[2];

	if (action === "DiskAppeared" || action === "VolumeMount" || action === "DiskDescriptionChanged") {
		return Option.some({ type: "Appeared", bsdName });
	}
	if (action === "DiskDisappeared" || action === "VolumeUnmount") {
		return Option.some({ type: "Disappeared", bsdName });
	}

	return Option.none();
}

/**
 * Live implementation of DriveDetection using macOS diskutil activity and info.
 */
export const DriveDetectionLive = Layer.effect(
	DriveDetection,
	Effect.gen(function* () {
		const logger = yield* Logger;
		// Shared state for scanning status
		const scanningRef = yield* Ref.make(false);

		const scanDrives = () =>
			Effect.gen(function* () {
				const volumeNames = yield* Effect.tryPromise({
					try: async () => {
						const glob = new Bun.Glob("*");
						const names: string[] = [];
						for await (const name of glob.scan({ cwd: "/Volumes", onlyFiles: false })) {
							if (!EXCLUDED_NAMES.has(name)) {
								names.push(name);
							}
						}
						return names;
					},
					catch: (cause) => new DriveDetectionError({ cause }),
				});

				const drives = yield* Effect.forEach(
					volumeNames,
					(name) => getDriveDetails(`/Volumes/${name}`, logger),
					{
						concurrency: "inherit",
					},
				);

				return drives.filter(Option.isSome).map((opt) => opt.value);
			});

		const getDriveInfo = (mountPoint: string) =>
			getDriveDetails(mountPoint, logger).pipe(Effect.map((opt) => Option.getOrNull(opt)));

		const driveEvents = Stream.unwrap(
			Effect.gen(function* () {
				const initialDrives = yield* scanDrives();
				const driveIdMap = yield* Ref.make(
					new Map<string, string>(initialDrives.map((d) => [d.bsdName, d.id])),
				);
				const lastEventTimeMap = yield* Ref.make(new Map<string, number>());
				const lastCrashRef = yield* Ref.make(0);

				const createProcessStream = () =>
					Stream.acquireRelease(
						Effect.gen(function* () {
							// Spawn first so if it fails, scanningRef is never set
							const process = Bun.spawn(["diskutil", "activity"], {
								stdout: "pipe",
								stderr: "ignore",
							});
							yield* Ref.set(scanningRef, true);
							return process;
						}),
						(process) =>
							Effect.gen(function* () {
								process.kill();
								yield* Ref.set(scanningRef, false);
							}),
					).pipe(
						Stream.flatMap((process) =>
							Stream.fromAsyncIterable(
								(async function* () {
									const reader = process.stdout.getReader();
									const decoder = new TextDecoder();
									let buffer = "";

									try {
										while (true) {
											const { done, value } = await reader.read();
											if (done) {
												throw new Error("diskutil activity process exited unexpectedly");
											}
											buffer += decoder.decode(value, { stream: true });
											const lines = buffer.split("\n");
											buffer = lines.pop() ?? "";
											for (const line of lines) {
												if (line.trim()) yield line;
											}
										}
									} finally {
										reader.releaseLock();
									}
								})(),
								(e) => new DriveDetectionError({ cause: e }),
							),
						),
						Stream.map(parseActivityLine),
						Stream.filterMap((o) => o),
						Stream.tap((event) => logger.debug(`diskutil event: ${event.type} ${event.bsdName}`)),
						Stream.mapEffect((event) =>
							Effect.gen(function* () {
								const map = yield* Ref.get(driveIdMap);
								const now = Date.now();

								// Debounce events for the same drive to prevent rapid successive reads
								const lastTime = (yield* Ref.get(lastEventTimeMap)).get(event.bsdName) ?? 0;
								if (now - lastTime < 1000) {
									return Option.none();
								}
								yield* Ref.update(lastEventTimeMap, (m) => new Map(m).set(event.bsdName, now));

								if (event.type === "Appeared") {
									const details = yield* getDriveDetails(event.bsdName, logger);
									if (Option.isSome(details)) {
										const drive = details.value;
										yield* Ref.update(driveIdMap, (m) => new Map(m).set(event.bsdName, drive.id));
										yield* logger.info(`Drive appeared/changed: ${drive.name} (${drive.id})`);
										return Option.some({ _tag: "Appeared", drive } as DriveEvent);
									}
									return Option.none();
								}

								// Disappeared
								const driveId = map.get(event.bsdName);
								if (driveId) {
									yield* Ref.update(driveIdMap, (m) => {
										const newMap = new Map(m);
										newMap.delete(event.bsdName);
										return newMap;
									});
									yield* logger.info(`Drive disappeared: ${driveId}`);
									return Option.some({ _tag: "Disappeared", driveId } as DriveEvent);
								}
								return Option.none();
							}),
						),
						Stream.filterMap((o) => o),
					);

				// Retry with exponential backoff up to 5 times (resets if stable for 60s)
				const retry = (
					stream: Stream.Stream<DriveEvent, DriveDetectionError>,
					attempts: number,
				): Stream.Stream<DriveEvent, DriveDetectionError> =>
					stream.pipe(
						Stream.catchAll((err) => {
							const now = Date.now();
							return Stream.fromEffect(
								Effect.gen(function* () {
									const lastCrash = yield* Ref.get(lastCrashRef);
									yield* Ref.set(lastCrashRef, now);
									const currentAttempts = now - lastCrash > 60000 ? 5 : attempts;

									if (currentAttempts <= 0) {
										return yield* Effect.fail(err);
									}

									yield* logger.error(
										`diskutil activity stream error, ${currentAttempts} retries left`,
										err,
									);

									const oldMap = yield* Ref.get(driveIdMap);
									// Re-scan to get fresh state
									const freshDrives = yield* scanDrives().pipe(
										Effect.catchAll(() => Effect.succeed([] as Drive[])),
									);
									const newMap = new Map<string, string>(freshDrives.map((d) => [d.bsdName, d.id]));
									yield* Ref.set(driveIdMap, newMap);

									const diffEvents: DriveEvent[] = [];
									// Emit Disappeared for drives no longer present
									for (const [bsdName, id] of oldMap.entries()) {
										if (!newMap.has(bsdName)) {
											diffEvents.push({ _tag: "Disappeared", driveId: id });
										}
									}
									// Emit Appeared for newly added drives
									for (const drive of freshDrives) {
										if (!oldMap.has(drive.bsdName)) {
											diffEvents.push({ _tag: "Appeared", drive });
										}
									}

									yield* Effect.sleep("1 second");
									return { diffEvents, nextAttempts: currentAttempts - 1 };
								}),
							).pipe(
								Stream.flatMap(({ diffEvents, nextAttempts }) =>
									Stream.concat(
										Stream.fromIterable(diffEvents),
										retry(createProcessStream(), nextAttempts),
									),
								),
							);
						}),
					);

				return retry(createProcessStream(), 5);
			}),
		);

		return DriveDetection.of({
			isScanning: () => Ref.get(scanningRef),
			scanDrives,
			getDriveInfo,
			driveEvents,
		});
	}),
);

/**
 * Creates a test implementation of DriveDetection with mock drives and events.
 */
export const createDriveDetectionTest = (
	drives: Drive[] = [],
	events: Stream.Stream<DriveEvent, DriveDetectionError> = Stream.empty,
) =>
	Layer.succeed(DriveDetection, {
		isScanning: () => Effect.succeed(false),
		scanDrives: () => Effect.succeed(drives),
		getDriveInfo: (mountPoint) =>
			Effect.succeed(drives.find((d) => d.mountPoint === mountPoint) ?? null),
		driveEvents: events,
	});
