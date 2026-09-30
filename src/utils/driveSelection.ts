import { actions } from "@/store";
import type { Drive } from "@/types/drive";

export const selectDrive = (drive: Drive, loadDrivePodcasts: (drive: Drive) => void): void => {
	actions.setCurrentDrive(drive);
	actions.setErrorMsg("");
	loadDrivePodcasts(drive);
	actions.setAppView("normal");
};
