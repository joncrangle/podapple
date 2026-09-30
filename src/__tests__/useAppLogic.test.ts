import { beforeEach, describe, expect, it } from "bun:test";
import { syncSuccessMessage, useAppLogic } from "@/hooks/useAppLogic";
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
