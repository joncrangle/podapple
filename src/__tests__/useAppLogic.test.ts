import { beforeEach, describe, expect, it } from "bun:test";
import { Cause, Effect, Exit, Fiber, Layer, Stream } from "effect";
import {
	describeError,
	makeAppLayerWith,
	syncSuccessMessage,
	useAppLogic,
} from "@/hooks/useAppLogic";
import { DriveScan, DriveScanError } from "@/services/effects/DriveScan";
import { SyncEngine, SyncError } from "@/services/effects/SyncEngine";
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
