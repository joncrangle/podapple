import { describe, expect, it } from "bun:test";
import { actions, state } from "@/store";
import type { PodcastEpisode } from "@/types/podcast";

describe("store actions", () => {
	it("should update appView", () => {
		actions.setAppView("driveSelection");
		expect(state.appView).toBe("driveSelection");
		actions.setAppView("normal");
		expect(state.appView).toBe("normal");
	});

	it("should toggle favorite drives", () => {
		const driveId = "test-drive-1";
		actions.toggleFavoriteDrive(driveId);
		expect(state.favoriteDrives).toContain(driveId);
		actions.toggleFavoriteDrive(driveId);
		expect(state.favoriteDrives).not.toContain(driveId);
	});

	it("should toggle mac selection", () => {
		// Setup initial state
		actions.setMacPodcasts([
			{ id: "1", title: "Ep 1", selected: false } as PodcastEpisode,
			{ id: "2", title: "Ep 2", selected: false } as PodcastEpisode,
		]);

		actions.toggleMacSelection(0);
		expect(state.macPodcasts[0]?.selected).toBe(true);
		expect(state.macPodcasts[1]?.selected).toBe(false);

		actions.toggleMacSelection(0);
		expect(state.macPodcasts[0]?.selected).toBe(false);
	});

	it("should toggle drive selection", () => {
		actions.setDrivePodcasts([{ id: "1", title: "Ep 1", selected: false } as PodcastEpisode]);

		actions.toggleDriveSelection(0);
		expect(state.drivePodcasts[0]?.selected).toBe(true);

		actions.toggleDriveSelection(0);
		expect(state.drivePodcasts[0]?.selected).toBe(false);
	});

	it("should update transfer progress", () => {
		actions.updateTransferProgress({
			currentFile: "test.mp3",
			filesDone: 1,
			totalFiles: 10,
		});
		expect(state.transferProgress.currentFile).toBe("test.mp3");
		expect(state.transferProgress.filesDone).toBe(1);
		expect(state.transferProgress.totalFiles).toBe(10);
	});

	it("should add debug messages", () => {
		actions.clearDebugMessages();
		actions.addDebugMessage("Test message", "info");
		expect(state.debugMessages.length).toBe(1);
		expect(state.debugMessages[0]?.message).toBe("Test message");
	});
});
