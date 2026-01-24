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
 */
function isExcludedVolume(info: PlistDict): boolean {
  const volumeName = getPlistString(info, "VolumeName") ?? "";
  const mountPoint = getPlistString(info, "MountPoint") ?? "";

  if (EXCLUDED_NAMES.has(volumeName)) return true;
  if (!mountPoint) return true;

  // Skip Time Machine volumes
  const volumeType = getPlistString(info, "FilesystemType") ?? "";
  if (volumeType === "apfs" && volumeName.toLowerCase().includes("time machine")) return true;

  const internal = getPlistBoolean(info, "Internal");
  const removable = getPlistBoolean(info, "Removable");
  const ejectable = getPlistBoolean(info, "Ejectable");

  // Include if explicitly external/removable/ejectable.
  // Also include USB/Thunderbolt drives even if marked internal (common for some external enclosures).
  if (internal === true && removable !== true && ejectable !== true) {
    const busProtocol = getPlistString(info, "BusProtocol") ?? "";
    if (busProtocol !== "USB" && busProtocol !== "Thunderbolt") {
      return true;
    }
  }

  return false;
}

const runDiskutil = (args: string[]) =>
  Effect.gen(function* () {
    const finalArgs = ["diskutil"];
    if (args[0] === "info") {
      finalArgs.push("info", "-plist", ...args.slice(1));
    } else {
      finalArgs.push(...args, "-plist");
    }

    const { output, exitCode } = yield* Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(finalArgs, {
          stdout: "pipe",
          stderr: "pipe",
        });
        const output = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        return { output, exitCode };
      },
      catch: (cause) => new DriveDetectionError({ cause }),
    });

    if (exitCode !== 0) {
      return yield* Effect.fail(
        new DriveDetectionError({ cause: new Error(`diskutil exited with code ${exitCode}`) }),
      );
    }

    const plistResult = parsePlist(output);
    if (Either.isLeft(plistResult)) {
      return yield* Effect.fail(
        new DriveDetectionError({
          cause: new Error("Invalid plist output", { cause: plistResult.left }),
        }),
      );
    }
    const parsed = plistResult.right;

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as PlistDict;
    }
    return yield* Effect.fail(
      new DriveDetectionError({ cause: new Error("Invalid plist output: not a dict") }),
    );
  });

const getDriveDetails = (identifier: string) =>
  Effect.gen(function* (_) {
    const info = yield* _(runDiskutil(["info", identifier]));

    if (isExcludedVolume(info)) return Option.none();

    const mountPoint = getPlistString(info, "MountPoint");
    if (!mountPoint) return Option.none();

    const volumeName = getPlistString(info, "VolumeName") ?? mountPoint.split("/").pop() ?? "";
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
    if (totalSpace <= 0) return Option.none();

    return Option.some({
      id: volumeName, // Using VolumeName as ID for now
      name: volumeName,
      mountPoint,
      totalSpace,
      freeSpace: freeSpace ?? 0,
    } as Drive);
  }).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

/**
 * Parses a line from `diskutil activity` output.
 * Looking for ***DiskAppeared, ***DiskDisappeared, or ***DiskDescriptionChanged events.
 */
function parseActivityLine(
  line: string,
): Option.Option<{ type: "Appeared" | "Disappeared" | "DescriptionChanged"; bsdName: string }> {
  const match = line.match(
    /^\*\*\*(DiskAppeared|DiskDisappeared|DiskDescriptionChanged)\s+\('([^']+)',/,
  );
  if (!match || !match[1] || !match[2]) return Option.none();
  return Option.some({
    type: match[1] as "Appeared" | "Disappeared" | "DescriptionChanged",
    bsdName: match[2],
  });
}

/**
 * Live implementation of DriveDetection using macOS diskutil activity and info.
 */
export const DriveDetectionLive = Layer.effect(
  DriveDetection,
  Effect.gen(function* () {
    // Shared state for scanning status (if needed, but stream tracks it implicitly?)
    // Original had isScanning()
    const scanningRef = yield* Ref.make(false);

    return DriveDetection.of({
      isScanning: () => Ref.get(scanningRef),

      scanDrives: () =>
        Effect.gen(function* (_) {
          const volumeNames = yield* _(
            Effect.tryPromise({
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
            }),
          );

          const drives = yield* _(
            Effect.forEach(volumeNames, (name) => getDriveDetails(`/Volumes/${name}`), {
              concurrency: "inherit",
            }),
          );

          return drives.filter(Option.isSome).map((opt) => opt.value);
        }),

      getDriveInfo: (mountPoint) =>
        getDriveDetails(mountPoint).pipe(Effect.map((opt) => Option.getOrNull(opt))),

      driveEvents: Stream.unwrap(
        Effect.gen(function* () {
          const driveIdMap = yield* Ref.make(new Map<string, string>());
          yield* Ref.set(scanningRef, true);

          return Stream.acquireRelease(
            Effect.try({
              try: () =>
                Bun.spawn(["diskutil", "activity"], {
                  stdout: "pipe",
                  stderr: "pipe",
                }),
              catch: (e) => new DriveDetectionError({ cause: e }),
            }),
            (process) => Effect.sync(() => process.kill()),
          ).pipe(
            Stream.flatMap((process) =>
              Stream.fromReadableStream(
                () => process.stdout,
                (e) => new DriveDetectionError({ cause: e }),
              ),
            ),
            Stream.decodeText(),
            Stream.splitLines,
            Stream.map(parseActivityLine),
            Stream.filterMap((o) => o),
            Stream.mapEffect((event) =>
              Effect.gen(function* () {
                if (event.type === "Appeared" || event.type === "DescriptionChanged") {
                  const details = yield* getDriveDetails(event.bsdName);
                  if (Option.isSome(details)) {
                    const drive = details.value;
                    yield* Ref.update(driveIdMap, (map) => map.set(event.bsdName, drive.id));
                    return Option.some({ _tag: "Appeared", drive } as DriveEvent);
                  }
                  // If DescriptionChanged and now invalid (e.g. unmounted), we might want to remove it
                  if (event.type === "DescriptionChanged") {
                    const map = yield* Ref.get(driveIdMap);
                    const driveId = map.get(event.bsdName);
                    if (driveId) {
                      yield* Ref.update(driveIdMap, (map) => {
                        map.delete(event.bsdName);
                        return map;
                      });
                      return Option.some({ _tag: "Disappeared", driveId } as DriveEvent);
                    }
                  }
                  return Option.none();
                } else {
                  // Disappeared
                  const map = yield* Ref.get(driveIdMap);
                  const driveId = map.get(event.bsdName);
                  if (driveId) {
                    yield* Ref.update(driveIdMap, (map) => {
                      map.delete(event.bsdName);
                      return map;
                    });
                    return Option.some({ _tag: "Disappeared", driveId } as DriveEvent);
                  }
                  return Option.none();
                }
              }),
            ),
            Stream.filterMap((o) => o),
            Stream.ensuring(Ref.set(scanningRef, false)),
          );
        }),
      ),
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
