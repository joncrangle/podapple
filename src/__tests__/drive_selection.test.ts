import { beforeEach, describe, expect, it, mock } from "bun:test";
import { actions, state } from "@/store";
import type { Drive } from "@/types/drive";
import type { PodcastEpisode } from "@/types/podcast";
import { selectDrive } from "@/utils/driveSelection";

describe("drive selection", () => {
	beforeEach(() => actions.resetState());

	it("clears a stale error for selector-driven selection", () => {
		const drive = { id: "drive-1", name: "Drive", mountPoint: "/Volumes/Drive" } as Drive;
		const loadDrivePodcasts = mock(() => {});

		actions.setErrorMsg("No drive selected");
		actions.setAppView("driveSelection");
		selectDrive(drive, loadDrivePodcasts);

		expect(state.errorMsg).toBe("");
		expect(state.currentDrive).toBe(drive);
		expect(state.appView).toBe("normal");
		expect(loadDrivePodcasts).toHaveBeenCalledWith(drive);
	});

	it("clears the previous drive's listing immediately", () => {
		const drive = { id: "drive-2", name: "Drive 2", mountPoint: "/Volumes/Drive2" } as Drive;
		actions.setDrivePodcasts([{ id: "old", selected: false } as PodcastEpisode]);
		actions.setDriveIndex(0);

		// The loader is a no-op, so anything left in drivePodcasts is stale.
		selectDrive(drive, () => {});

		expect(state.drivePodcasts).toEqual([]);
	});
});
