import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Cause, Effect, Exit, Fiber, Layer, Stream } from "effect";
import {
	describeError,
	makeAppLayerWith,
	syncSuccessMessage,
	useAppLogic,
} from "@/hooks/useAppLogic";
import { DriveDetection, DriveDetectionError } from "@/services/effects/DriveDetection";
import { DriveScan, DriveScanError } from "@/services/effects/DriveScan";
import { CleanupError, SyncEngine, SyncError } from "@/services/effects/SyncEngine";
import type { SyncProgress } from "@/types/sync";
import { actions, state } from "@/store";
import { selectDrive } from "@/utils/driveSelection";
import type { Drive } from "@/types/drive";
import type { PodcastEpisode } from "@/types/podcast";

const drive: Drive = {
	id: "d1",
	name: "USB",
	bsdName: "USB",
	mountPoint: "/Volumes/USB",
	totalSpace: 32_000_000_000,
	freeSpace: 16_000_000_000,
};

const episode = (id: string): PodcastEpisode => ({
	id,
	title: `Episode ${id}`,
	author: "Dan Carlin",
	duration: 60,
	published: new Date("2024-01-01"),
	onDrive: false,
	filePath: `/mac/${id}.mp3`,
	fileSize: 1000,
	selected: true,
	showName: "Show",
});

describe("syncSuccessMessage", () => {
	it("reports a clean sync plainly", () => {
		expect(syncSuccessMessage(0)).toBe("Sync complete");
	});

	it("counts a single discarded file in the singular", () => {
		// The singular/plural branch is the whole reason this is a function.
		expect(syncSuccessMessage(1)).toBe("Sync complete (1 file discarded: tagging failed)");
	});

	it("pluralises multiple discarded files", () => {
		expect(syncSuccessMessage(2)).toBe("Sync complete (2 files discarded: tagging failed)");
		expect(syncSuccessMessage(17)).toBe("Sync complete (17 files discarded: tagging failed)");
	});

	it("never claims a clean sync while files were discarded", () => {
		for (const n of [1, 2, 5, 100]) {
			expect(syncSuccessMessage(n)).not.toBe("Sync complete");
			expect(syncSuccessMessage(n)).toContain(String(n));
		}
	});
});

describe("useAppLogic.startSync", () => {
	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("reports a missing drive and sets no success message", () => {
		const logic = useAppLogic();
		actions.setCurrentDrive(null);

		logic.startSync([episode("1")]);

		expect(state.errorMsg).toBe("No drive selected");
		// A refused sync is not a success.
		expect(state.successMsg).toBe("");
	});

	it("clears a stale success message when a new sync starts", () => {
		const logic = useAppLogic();
		actions.setCurrentDrive(null);

		// Stand in for a previous run that finished cleanly.
		actions.setSuccessMsg("Sync complete");
		expect(state.successMsg).toBe("Sync complete");

		logic.startSync([episode("1")]);

		// The refused sync set an error, and the two are mutually exclusive, so
		// the stale success must not survive alongside it.
		expect(state.errorMsg).toBe("No drive selected");
		expect(state.successMsg).toBe("");
	});

	it("clears a stale success message when a drive is selected", () => {
		actions.setSuccessMsg("Sync complete");
		expect(state.successMsg).toBe("Sync complete");

		// selectDrive is the path a drive selection actually takes; it clears
		// the status so a previous run's result does not follow the user to the
		// new drive.
		selectDrive(drive, () => {});

		expect(state.currentDrive).toBe(drive);
		expect(state.successMsg).toBe("");
	});

	it("does not clear the status when only rescanning the same drive", () => {
		const logic = useAppLogic();
		actions.setSuccessMsg("Sync complete");

		// loadDrivePodcasts is a bare rescan, not a selection. It reports its own
		// errors but is not a "new destination", so it leaves the status alone.
		logic.loadDrivePodcasts(drive);

		expect(state.successMsg).toBe("Sync complete");
	});
});

describe("status channel exclusivity", () => {
	beforeEach(() => {
		actions.resetState();
	});

	it("never holds a success and an error at the same time", () => {
		// The invariant the two setters enforce, exercised the way the app does it.
		actions.setSuccessMsg("Sync complete");
		actions.setErrorMsg("drive rescan failed");
		expect(state.successMsg).toBe("");
		expect(state.errorMsg).toBe("drive rescan failed");

		actions.setSuccessMsg("Sync complete");
		expect(state.errorMsg).toBe("");
		expect(state.successMsg).toBe("Sync complete");
	});
});

describe("describeError", () => {
	it("prefers a plain Error's message", () => {
		expect(describeError(new Error("disk on fire"))).toBe("disk on fire");
	});

	it("unwraps an Effect tagged error, whose message is empty", () => {
		// A Data.TaggedError IS an Error with an empty `message`, so the naive
		// `instanceof Error ? err.message : String(err)` yields "" and the user
		// is shown nothing at all.
		const err = new DriveScanError({ cause: new Error("rescan failed") });
		expect(err instanceof Error).toBe(true);
		expect(err.message).toBe("");
		expect(describeError(err)).toBe("rescan failed");
	});

	it("unwraps an Effect Cause to the underlying error", () => {
		// The sync-failure path. Cause.toString() renders the whole wrapper,
		// "Cause([Fail(SyncError (cause: Error: no space left))])", where the
		// user needs to read "no space left".
		const cause = Cause.fail(new SyncError({ episode: "Ep 1", cause: new Error("no space left") }));
		expect(cause.toString()).toContain("Cause(");
		expect(describeError(cause)).toBe("no space left");

		expect(
			describeError(Cause.fail(new DriveScanError({ cause: new Error("rescan failed") }))),
		).toBe("rescan failed");
	});

	it("names an interruption rather than rendering a cause wrapper", async () => {
		// A real interrupt, the way cancelSync produces one: fork, interrupt,
		// then await to collect the Exit.
		const forked = Effect.runFork(Effect.never);
		await new Promise((resolve) => setTimeout(resolve, 20));
		await Effect.runPromise(Fiber.interrupt(forked));
		const exit = await Effect.runPromise(Fiber.await(forked));
		expect(Exit.isFailure(exit)).toBe(true);
		const cause = (exit as unknown as { cause: Cause.Cause<unknown> }).cause;
		expect(Cause.hasInterruptsOnly(cause)).toBe(true);
		expect(describeError(cause)).toBe("Cancelled");
	});

	it("falls back to the tag when there is no message or cause", () => {
		expect(describeError(new DriveScanError({ cause: undefined }))).toBe("DriveScanError");
	});

	it("does not throw on a hostile constructor name", () => {
		// It runs inside Effect.catch handlers and the Errored boundary, so a
		// throw here would replace the error with a defect, and in index.tsx
		// crash the app.
		expect(() => describeError({ constructor: { name: "(" } })).not.toThrow();
		expect(describeError({ constructor: { name: "(" } })).toBe("Unknown error");
	});

	it("never returns something meaningless", () => {
		// An empty status renders as nothing, and so does "[object Object]".
		expect(describeError(new Error("   "))).toBe("Unknown error");
		expect(describeError(new Error(""))).toBe("Unknown error");
		expect(describeError(null)).toBe("Unknown error");
		expect(describeError(undefined)).toBe("Unknown error");
		expect(describeError({})).toBe("Unknown error");
	});

	it("still reports primitives, where String() is the whole story", () => {
		expect(describeError("disk full")).toBe("disk full");
		expect(describeError(42)).toBe("42");
		expect(describeError(false)).toBe("false");
	});
});

/**
 * A DriveScan that fails the post-sync rescan on demand.
 *
 * This cannot be provoked against a real tempdir: the live scanDrive returns []
 * for a missing Podcasts folder and swallows its own list errors, so it
 * essentially never fails on a well-formed directory.
 */
const driveScanDouble = (failScan: boolean) =>
	Layer.succeed(DriveScan, {
		scanDrive: (_drivePath) =>
			failScan
				? Effect.fail(new DriveScanError({ cause: new Error("rescan failed") }))
				: Effect.succeed([]),
		buildDriveIndex: () => Effect.succeed(new Map()),
		hasPodcastsFolder: () => Effect.succeed(false),
	});

/** A SyncEngine with nothing to copy, so startSync succeeds immediately. */
const emptyPlanEngine = Layer.succeed(SyncEngine, {
	createPlan: () => Effect.succeed({ toCopy: [], toDelete: [], totalFiles: 0, totalBytes: 0 }),
	execute: () =>
		Stream.succeed({
			currentFile: "",
			currentIndex: 0,
			totalFiles: 0,
			bytesTransferred: 0,
			totalBytes: 0,
			discarded: 0,
			startTime: 0,
			status: "complete",
		}),
	copyFileWithProgress: () => Effect.void,
	cleanup: () => Effect.void,
});

/** The live layer with only DriveScan and SyncEngine replaced. */
const testLayer = (failScan: boolean) =>
	makeAppLayerWith({ scan: driveScanDouble(failScan), sync: emptyPlanEngine });

/** Lets the fire-and-forget effects started by startSync run to completion. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("useAppLogic post-sync rescan gate", () => {
	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("does not claim success when the rescan after a sync fails", async () => {
		const logic = useAppLogic(testLayer(true));
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		await settle();

		// The rescan's error must survive, and must be visible: the underlying
		// cause is what the user needs, since the drive listing is now empty.
		expect(state.errorMsg).toBe("rescan failed");
		// Reporting success here would clear that error and claim a clean run.
		expect(state.successMsg).toBe("");
	});

	it("reports success when the rescan succeeds", async () => {
		const logic = useAppLogic(testLayer(false));
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		await settle();

		expect(state.successMsg).toBe("All episodes already synced");
		expect(state.errorMsg).toBe("");
	});
});

/** A scan double whose result for each call is released by the test. */
const gatedScan = () => {
	const gates: Array<(value: unknown[]) => void> = [];
	let calls = 0;
	const layer = Layer.succeed(DriveScan, {
		scanDrive: () => {
			calls++;
			return Effect.promise(
				() => new Promise<never[]>((resolve) => gates.push(resolve as (v: unknown[]) => void)),
			);
		},
		buildDriveIndex: () => Effect.succeed(new Map()),
		hasPodcastsFolder: () => Effect.succeed(false),
	});
	return { layer, gates, calls: () => calls };
};

const scannedShow = (title: string) => ({
	id: "p1",
	title: "Show",
	author: "Dan Carlin",
	episodeCount: 1,
	episodes: [
		{
			id: title,
			title,
			author: "Dan Carlin",
			duration: 60,
			published: new Date("2024-01-01"),
			onDrive: false,
			filePath: `/Volumes/USB/${title}.mp3`,
			fileSize: 1000,
		},
	],
});

describe("useAppLogic drive load staleness", () => {
	const otherDrive: Drive = { ...drive, id: "d2", name: "Other", mountPoint: "/Volumes/Other" };

	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("discards scan results when the current drive changed mid-scan", async () => {
		const scan = gatedScan();
		const logic = useAppLogic(makeAppLayerWith({ scan: scan.layer, sync: emptyPlanEngine }));
		actions.setCurrentDrive(drive);

		const pending = logic.loadDrivePodcasts(drive);
		await settle();
		actions.setCurrentDrive(otherDrive);
		scan.gates[0]?.([scannedShow("Stale")]);
		await pending;

		expect(state.drivePodcasts).toEqual([]);
		expect(state.loadingDrive).toBe(false);
	});

	it("discards scan results when the drive was unplugged mid-scan", async () => {
		const scan = gatedScan();
		const logic = useAppLogic(makeAppLayerWith({ scan: scan.layer, sync: emptyPlanEngine }));
		actions.setCurrentDrive(drive);

		const pending = logic.loadDrivePodcasts(drive);
		await settle();
		actions.setCurrentDrive(null);
		scan.gates[0]?.([scannedShow("Stale")]);
		await pending;

		expect(state.drivePodcasts).toEqual([]);
	});

	it("applies scan results for the drive that is still current", async () => {
		const scan = gatedScan();
		const logic = useAppLogic(makeAppLayerWith({ scan: scan.layer, sync: emptyPlanEngine }));
		actions.setCurrentDrive(drive);

		const pending = logic.loadDrivePodcasts(drive);
		await settle();
		scan.gates[0]?.([scannedShow("Fresh")]);
		await pending;

		expect(state.drivePodcasts.map((e) => e.title)).toEqual(["Fresh"]);
	});

	it("does not surface a stale scan's error", async () => {
		const logic = useAppLogic(testLayer(true));
		actions.setCurrentDrive(otherDrive);

		await logic.loadDrivePodcasts(drive);

		expect(state.errorMsg).toBe("");
	});

	it("clears onDrive markers on Mac episodes when the drive load fails", async () => {
		const logic = useAppLogic(testLayer(true));
		actions.setCurrentDrive(drive);
		actions.setMacPodcasts([{ ...episode("1"), onDrive: true }]);

		await logic.loadDrivePodcasts(drive);

		expect(state.errorMsg).toBe("rescan failed");
		expect(state.macPodcasts[0]?.onDrive).toBe(false);
	});
});

const progressOf = (over: Partial<SyncProgress>): SyncProgress => ({
	currentFile: "Episode 1",
	currentIndex: 1,
	totalFiles: 2,
	bytesTransferred: 500,
	totalBytes: 1000,
	discarded: 0,
	startTime: Date.now(),
	status: "syncing",
	...over,
});

describe("useAppLogic transfer progress", () => {
	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("counts the in-progress file as not yet done and never reports a non-finite speed", async () => {
		const nowSpy = spyOn(Date, "now").mockImplementation(() => 1_000_000);
		try {
			const seen: Array<{ filesDone: number; speed: number }> = [];
			const snapshot = () =>
				seen.push({
					filesDone: state.transferProgress.filesDone,
					speed: state.transferProgress.speed,
				});
			const items = [
				progressOf({ currentIndex: 1 }),
				progressOf({ currentIndex: 2, currentFile: "Episode 2", bytesTransferred: 1000 }),
				progressOf({ currentIndex: 2, status: "complete", bytesTransferred: 1000 }),
			];
			const engine = Layer.succeed(SyncEngine, {
				createPlan: () =>
					Effect.succeed({ toCopy: [], toDelete: [], totalFiles: 2, totalBytes: 1000 }),
				// Each emission records the state left by the one before it.
				execute: () => Stream.fromIterable(items).pipe(Stream.tap(() => Effect.sync(snapshot))),
				copyFileWithProgress: () => Effect.void,
				cleanup: () => Effect.void,
			});
			const logic = useAppLogic(makeAppLayerWith({ scan: driveScanDouble(false), sync: engine }));
			actions.setCurrentDrive(drive);

			logic.startSync([episode("1")]);
			await settle();

			// Before the first file: 0 done. During file 2: only file 1 is done.
			expect(seen.map((s) => s.filesDone)).toEqual([0, 0, 1]);
			// startTime == now, so zero ms have elapsed: speed must be 0, not Infinity/NaN.
			for (const s of seen) expect(Number.isFinite(s.speed)).toBe(true);
			expect(Number.isFinite(state.transferProgress.speed)).toBe(true);
			// "complete" reports every file done.
			expect(state.transferProgress.filesDone).toBe(2);
		} finally {
			nowSpy.mockRestore();
		}
	});
});

describe("useAppLogic cancelled sync", () => {
	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	const cancellableEngine = (cleanedUp: string[], failCleanup = false) =>
		Layer.succeed(SyncEngine, {
			createPlan: () =>
				Effect.succeed({ toCopy: [], toDelete: [], totalFiles: 2, totalBytes: 1000 }),
			execute: () => Stream.concat(Stream.make(progressOf({})), Stream.never),
			copyFileWithProgress: () => Effect.void,
			cleanup: (path) =>
				Effect.sync(() => {
					cleanedUp.push(path);
				}).pipe(
					Effect.flatMap(() =>
						failCleanup
							? Effect.fail(new CleanupError({ path, cause: new Error("boom") }))
							: Effect.void,
					),
				),
		});

	it("cleans up and rescans the drive without claiming success", async () => {
		const cleanedUp: string[] = [];
		const scan = gatedScan();
		const logic = useAppLogic(
			makeAppLayerWith({ scan: scan.layer, sync: cancellableEngine(cleanedUp) }),
		);
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		await settle();
		// The pre-sync index and the rescan are separate scans; only the rescan uses scanDrive.
		expect(scan.calls()).toBe(0);

		logic.cancelSync();
		await settle();

		expect(cleanedUp).toEqual([drive.mountPoint]);
		expect(scan.calls()).toBe(1);
		scan.gates[0]?.([scannedShow("Partial")]);
		await settle();

		expect(state.drivePodcasts.map((e) => e.title)).toEqual(["Partial"]);
		expect(state.successMsg).toBe("");
		expect(state.errorMsg).toBe("");
		expect(state.appView).toBe("normal");
	});

	it("still rescans when cleanup fails", async () => {
		const cleanedUp: string[] = [];
		const scan = gatedScan();
		const logic = useAppLogic(
			makeAppLayerWith({ scan: scan.layer, sync: cancellableEngine(cleanedUp, true) }),
		);
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		await settle();
		logic.cancelSync();
		await settle();

		expect(cleanedUp).toEqual([drive.mountPoint]);
		expect(scan.calls()).toBe(1);
		expect(state.successMsg).toBe("");
	});
});

/** A SyncEngine whose plan and execution the test controls. */
const planEngine = (opts: {
	totalBytes: number;
	executed: { count: number };
	execute?: () => Stream.Stream<SyncProgress, never>;
}) =>
	Layer.succeed(SyncEngine, {
		createPlan: () =>
			Effect.succeed({ toCopy: [], toDelete: [], totalFiles: 1, totalBytes: opts.totalBytes }),
		execute: () => {
			opts.executed.count++;
			return (
				opts.execute?.() ??
				Stream.succeed(progressOf({ status: "complete", currentIndex: 1, totalFiles: 1 }))
			);
		},
		copyFileWithProgress: () => Effect.void,
		cleanup: () => Effect.void,
	});

describe("useAppLogic free-space check", () => {
	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("refuses a plan larger than the drive's free space without copying", async () => {
		const executed = { count: 0 };
		const logic = useAppLogic(
			makeAppLayerWith({
				scan: driveScanDouble(false),
				sync: planEngine({ totalBytes: 2 * 1024 ** 3, executed }),
			}),
		);
		actions.setCurrentDrive({ ...drive, freeSpace: 1024 ** 3 });

		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(0);
		expect(state.errorMsg).toBe("Not enough space on USB: need 2.0 GB, have 1.0 GB");
		expect(state.successMsg).toBe("");
		expect(state.appView).toBe("normal");
	});

	it("allows a plan that exactly fits", async () => {
		const executed = { count: 0 };
		const logic = useAppLogic(
			makeAppLayerWith({
				scan: driveScanDouble(false),
				sync: planEngine({ totalBytes: 1000, executed }),
			}),
		);
		actions.setCurrentDrive({ ...drive, freeSpace: 1000 });

		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(1);
		expect(state.errorMsg).toBe("");
		expect(state.successMsg).toBe("Sync complete");
	});

	it("skips the check when free space is unknown (negative)", async () => {
		const executed = { count: 0 };
		const logic = useAppLogic(
			makeAppLayerWith({
				scan: driveScanDouble(false),
				sync: planEngine({ totalBytes: 5 * 1024 ** 3, executed }),
			}),
		);
		actions.setCurrentDrive({ ...drive, freeSpace: -1 });

		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(1);
		expect(state.errorMsg).toBe("");
	});
});

/** A DriveDetection whose free-space read the test controls; `free` is read on every call. */
const detectionWith = (free: { value: number | "fail" }) =>
	Layer.succeed(DriveDetection, {
		scanDrives: () => Effect.succeed([]),
		getDriveInfo: () => Effect.succeed(null),
		getFreeSpace: () =>
			free.value === "fail"
				? Effect.fail(new DriveDetectionError({ cause: new Error("statfs failed") }))
				: Effect.succeed(free.value),
		isScanning: () => Effect.succeed(false),
		driveEvents: Stream.empty,
	});

describe("useAppLogic free-space refresh", () => {
	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("uses fresh free space, not the value captured at detection", async () => {
		const executed = { count: 0 };
		const free = { value: (2 * 1024 ** 3) as number | "fail" };
		const logic = useAppLogic(
			makeAppLayerWith({
				detection: detectionWith(free),
				scan: driveScanDouble(false),
				sync: planEngine({ totalBytes: 2 * 1024 ** 3, executed }),
			}),
		);
		// Stale: detected when the drive was nearly full.
		const stale = { ...drive, freeSpace: 1024 ** 3 };
		actions.setDrives([stale]);
		actions.setCurrentDrive(stale);

		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(1);
		expect(state.errorMsg).toBe("");
		expect(state.currentDrive?.freeSpace).toBe(2 * 1024 ** 3);
		expect(state.drives[0]?.freeSpace).toBe(2 * 1024 ** 3);
	});

	it("refuses when fresh free space is smaller than the stale value", async () => {
		const executed = { count: 0 };
		const free = { value: (1024 ** 3) as number | "fail" };
		const logic = useAppLogic(
			makeAppLayerWith({
				detection: detectionWith(free),
				scan: driveScanDouble(false),
				sync: planEngine({ totalBytes: 2 * 1024 ** 3, executed }),
			}),
		);
		actions.setCurrentDrive({ ...drive, freeSpace: 16 * 1024 ** 3 });

		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(0);
		expect(state.errorMsg).toBe("Not enough space on USB: need 2.0 GB, have 1.0 GB");
	});

	it("falls back to the previous value when the refresh fails", async () => {
		const executed = { count: 0 };
		const free = { value: "fail" as number | "fail" };
		const logic = useAppLogic(
			makeAppLayerWith({
				detection: detectionWith(free),
				scan: driveScanDouble(false),
				sync: planEngine({ totalBytes: 2 * 1024 ** 3, executed }),
			}),
		);
		actions.setCurrentDrive({ ...drive, freeSpace: 1024 ** 3 });

		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(0);
		expect(state.errorMsg).toBe("Not enough space on USB: need 2.0 GB, have 1.0 GB");
		expect(state.currentDrive?.freeSpace).toBe(1024 ** 3);
	});

	it("does not write free space onto a drive that is no longer current", async () => {
		const other: Drive = { ...drive, id: "d2", name: "Other", mountPoint: "/Volumes/Other" };
		// The user switches drives while the free-space read is in flight.
		const switching = Layer.succeed(DriveDetection, {
			scanDrives: () => Effect.succeed([]),
			getDriveInfo: () => Effect.succeed(null),
			getFreeSpace: () =>
				Effect.sync(() => {
					actions.setCurrentDrive(other);
					return 5 * 1024 ** 3;
				}),
			isScanning: () => Effect.succeed(false),
			driveEvents: Stream.empty,
		});
		const logic = useAppLogic(
			makeAppLayerWith({ detection: switching, scan: driveScanDouble(false) }),
		);
		actions.setDrives([drive, other]);
		actions.setCurrentDrive(drive);

		logic.deleteSelectedFromDrive();
		await settle();

		expect(state.currentDrive?.id).toBe("d2");
		expect(state.currentDrive?.freeSpace).toBe(other.freeSpace);
		expect(state.drives.map((d) => d.freeSpace)).toEqual([drive.freeSpace, other.freeSpace]);
	});

	it("refreshes free space after episodes are deleted from the drive", async () => {
		const free = { value: (9 * 1024 ** 3) as number | "fail" };
		const logic = useAppLogic(
			makeAppLayerWith({ detection: detectionWith(free), scan: driveScanDouble(false) }),
		);
		actions.setDrives([drive]);
		actions.setCurrentDrive(drive);

		logic.deleteSelectedFromDrive();
		await settle();

		expect(state.currentDrive?.freeSpace).toBe(9 * 1024 ** 3);
		expect(state.drives[0]?.freeSpace).toBe(9 * 1024 ** 3);
	});

	it("refreshes free space after a sync completes", async () => {
		const free = { value: (7 * 1024 ** 3) as number | "fail" };
		const logic = useAppLogic(
			makeAppLayerWith({
				detection: detectionWith(free),
				scan: driveScanDouble(false),
				sync: emptyPlanEngine,
			}),
		);
		actions.setDrives([drive]);
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		await settle();

		expect(state.currentDrive?.freeSpace).toBe(7 * 1024 ** 3);
	});
});

describe("useAppLogic sync re-entrancy", () => {
	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("ignores a second startSync while one runs, and keeps the first cancellable", async () => {
		const executed = { count: 0 };
		const cleaned: string[] = [];
		const engine = Layer.succeed(SyncEngine, {
			createPlan: () => Effect.succeed({ toCopy: [], toDelete: [], totalFiles: 1, totalBytes: 10 }),
			execute: () => {
				executed.count++;
				return Stream.concat(Stream.make(progressOf({})), Stream.never);
			},
			copyFileWithProgress: () => Effect.void,
			cleanup: (path) =>
				Effect.sync(() => {
					cleaned.push(path);
				}),
		});
		const logic = useAppLogic(makeAppLayerWith({ scan: driveScanDouble(false), sync: engine }));
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		// Synchronous second call: before the first has even forked its fiber.
		logic.startSync([episode("2")]);
		await settle();
		logic.startSync([episode("3")]);
		await settle();

		expect(executed.count).toBe(1);
		expect(state.debugMessages.some((m) => JSON.stringify(m).includes("already in progress"))).toBe(
			true,
		);

		// The first sync's fiber must still be the one cancelSync reaches.
		logic.cancelSync();
		await settle();
		expect(cleaned).toEqual([drive.mountPoint]);
		expect(state.appView).toBe("normal");
	});

	it("allows a new sync once the previous one finished", async () => {
		const executed = { count: 0 };
		const logic = useAppLogic(
			makeAppLayerWith({
				scan: driveScanDouble(false),
				sync: planEngine({ totalBytes: 10, executed }),
			}),
		);
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		await settle();
		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(2);
	});

	it("allows a new sync after the previous one failed", async () => {
		const executed = { count: 0 };
		const logic = useAppLogic(
			makeAppLayerWith({
				scan: driveScanDouble(false),
				sync: planEngine({
					totalBytes: 10,
					executed,
					execute: () =>
						Stream.fail(new SyncError({ episode: "Ep", cause: new Error("boom") })) as never,
				}),
			}),
		);
		actions.setCurrentDrive(drive);

		logic.startSync([episode("1")]);
		await settle();
		expect(state.errorMsg).toBe("boom");
		logic.startSync([episode("1")]);
		await settle();

		expect(executed.count).toBe(2);
	});
});

describe("useAppLogic loadingDrive generations", () => {
	const otherDrive: Drive = { ...drive, id: "d2", name: "Other", mountPoint: "/Volumes/Other" };

	beforeEach(() => {
		actions.resetState();
		actions.setAppView("normal");
	});

	it("keeps loadingDrive true when a superseded load finishes before the newer one", async () => {
		const scan = gatedScan();
		const logic = useAppLogic(makeAppLayerWith({ scan: scan.layer, sync: emptyPlanEngine }));
		actions.setCurrentDrive(drive);

		const first = logic.loadDrivePodcasts(drive);
		await settle();
		const second = logic.loadDrivePodcasts(drive);
		await settle();
		expect(scan.gates.length).toBe(2);

		// The stale (first) load finishes while the newer one still runs.
		scan.gates[0]?.([]);
		await first;
		expect(state.loadingDrive).toBe(true);

		scan.gates[1]?.([]);
		await second;
		expect(state.loadingDrive).toBe(false);
	});

	it("clears loadingDrive when the newest load finishes first, and stays cleared", async () => {
		const scan = gatedScan();
		const logic = useAppLogic(makeAppLayerWith({ scan: scan.layer, sync: emptyPlanEngine }));
		actions.setCurrentDrive(drive);

		const first = logic.loadDrivePodcasts(drive);
		await settle();
		const second = logic.loadDrivePodcasts(drive);
		await settle();

		scan.gates[1]?.([]);
		await second;
		expect(state.loadingDrive).toBe(false);

		scan.gates[0]?.([]);
		await first;
		expect(state.loadingDrive).toBe(false);
	});

	it("clears loadingDrive when the latest load fails", async () => {
		const logic = useAppLogic(testLayer(true));
		actions.setCurrentDrive(drive);

		await logic.loadDrivePodcasts(drive);

		expect(state.errorMsg).toBe("rescan failed");
		expect(state.loadingDrive).toBe(false);
	});

	it("clears loadingDrive when the last load is for a drive that is no longer current", async () => {
		const scan = gatedScan();
		const logic = useAppLogic(makeAppLayerWith({ scan: scan.layer, sync: emptyPlanEngine }));
		actions.setCurrentDrive(drive);

		const pending = logic.loadDrivePodcasts(drive);
		await settle();
		actions.setCurrentDrive(otherDrive);
		scan.gates[0]?.([]);
		await pending;

		expect(state.loadingDrive).toBe(false);
	});
});
