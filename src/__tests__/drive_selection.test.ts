import { beforeEach, describe, expect, it, mock } from "bun:test";
import { actions, state } from "@/store";
import type { Drive } from "@/types/drive";
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
});
