import { actions } from "@/store";
import type { Drive } from "@/types/drive";

export const selectDrive = (drive: Drive, loadDrivePodcasts: (drive: Drive) => void): void => {
	actions.setCurrentDrive(drive);
	// The previous drive's listing must not show under the new drive while it loads.
	actions.setDrivePodcasts([]);
	actions.setErrorMsg("");
	loadDrivePodcasts(drive);
	actions.setAppView("normal");
};
