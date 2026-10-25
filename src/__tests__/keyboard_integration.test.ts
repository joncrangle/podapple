import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { useAppKeyboard } from "@/hooks/useAppKeyboard";
import type { useAppLogic } from "@/hooks/useAppLogic";
import { actions, state } from "@/store";
import type { Drive } from "@/types/drive";
import type { PodcastEpisode } from "@/types/podcast";

interface MockKeyboardEvent {
	name: string;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
}

let triggerKeyCallback: ((event: MockKeyboardEvent) => void) | undefined;

// Mock @opentui/solid
mock.module("@opentui/solid", () => ({
	useKeyboard: (callback: (event: MockKeyboardEvent) => void) => {
		triggerKeyCallback = callback;
	},
	useRenderer: () => ({
		destroy: mock(() => {}),
	}),
}));

describe("Keyboard Integration", () => {
	const mockLogic = {
		scanForDrives: mock(() => {}),
		refreshData: mock(() => {}),
		startSync: mock(() => {}),
		cancelSync: mock(() => {}),
		deleteSelectedFromDrive: mock(() => {}),
		saveTheme: mock(() => {}),
		loadDrivePodcasts: mock(() => {}),
		toggleFavoriteDrive: mock(() => {}),
		initialize: mock(() => {}),
	};

	beforeEach(() => {
		actions.resetState();
		// Ensure the view is normal for each test
		actions.setAppView("normal");
		actions.setFocusedPane("mac");
		mock.clearAllMocks();
	});

	// Only initialize once to avoid multiple listeners
	useAppKeyboard(mockLogic as unknown as ReturnType<typeof useAppLogic>);

	let currentTime = Date.now();
	spyOn(Date, "now").mockImplementation(() => currentTime);

	const pressKey = (name: string, extras: Partial<MockKeyboardEvent> = {}) => {
		if (triggerKeyCallback) {
			currentTime += 1000; // Advance time by 1s to bypass debouncing
			triggerKeyCallback({ name, ...extras });
		}
	};

	it("should navigate down with 'j'", () => {
		actions.setMacPodcasts([
			{ id: "1", title: "Ep 1" } as PodcastEpisode,
			{ id: "2", title: "Ep 2" } as PodcastEpisode,
		]);
		actions.setMacIndex(0);

		pressKey("j");
		expect(state.macIndex).toBe(1);

		pressKey("j");
		expect(state.macIndex).toBe(1); // Should cap at length - 1
	});

	it("should switch panes with 'tab'", () => {
		actions.setFocusedPane("mac");
		pressKey("tab");
		expect(state.focusedPane).toBe("drive");
		pressKey("tab");
		expect(state.focusedPane).toBe("mac");
	});

	it("should open drive selection with 'f'", () => {
		pressKey("f");
		expect(state.appView).toBe("driveSelection");
		expect(mockLogic.scanForDrives).toHaveBeenCalled();
	});

	it("should clear a stale drive error when selecting a drive with enter", () => {
		actions.setDrives([{ id: "drive-1", name: "Drive", mountPoint: "/Volumes/Drive" } as Drive]);
		actions.setErrorMsg("No drive selected");
		actions.setAppView("driveSelection");

		pressKey("return");

		expect(state.errorMsg).toBe("");
		expect(state.currentDrive?.id).toBe("drive-1");
	});

	it("should toggle selection with 'space'", () => {
		actions.setMacPodcasts([{ id: "1", selected: false } as PodcastEpisode]);
		actions.setMacIndex(0);
		actions.setFocusedPane("mac");

		pressKey("space");
		expect(state.macPodcasts[0]?.selected).toBe(true);

		pressKey("space");
		expect(state.macPodcasts[0]?.selected).toBe(false);
	});

	it("should start sync with 's' when episodes are selected", () => {
		actions.setMacPodcasts([
			{ id: "1", selected: true } as PodcastEpisode,
			{ id: "2", selected: false } as PodcastEpisode,
		]);
		actions.setFocusedPane("mac");

		pressKey("s");
		expect(mockLogic.startSync).toHaveBeenCalled();
	});

	it("should NOT start sync with 's' when no episodes are selected", () => {
		actions.setMacPodcasts([{ id: "1", selected: false } as PodcastEpisode]);
		actions.setFocusedPane("mac");

		pressKey("s");
		expect(mockLogic.startSync).not.toHaveBeenCalled();
	});

	it("should cancel sync with 'escape' when syncing", () => {
		actions.setAppView("syncing");
		pressKey("escape");
		expect(mockLogic.cancelSync).toHaveBeenCalled();
	});

	it("should handle navigation on empty lists without underflow", () => {
		actions.setMacPodcasts([]);
		actions.setMacIndex(0);

		pressKey("j");
		expect(state.macIndex).toBe(0);

		pressKey("k");
		expect(state.macIndex).toBe(0);
	});

	it("should open delete confirmation with 'd' on drive pane", () => {
		actions.setDrivePodcasts([{ id: "1", selected: true } as PodcastEpisode]);
		actions.setFocusedPane("drive");

		pressKey("d");
		expect(state.appView).toBe("confirm");
	});

	it("should delete from drive when 'y' is pressed in confirm view", () => {
		actions.setAppView("confirm");
		pressKey("y");
		expect(mockLogic.deleteSelectedFromDrive).toHaveBeenCalled();
	});

	it("keeps the drive menu index at 0 when there are no drives", () => {
		actions.setDrives([]);
		actions.setAppView("driveSelection");

		pressKey("j");
		expect(state.driveMenuIndex).toBe(0);
		pressKey("down");
		expect(state.driveMenuIndex).toBe(0);
	});

	it("keeps the debug menu index at 0 when there are no messages", () => {
		actions.clearDebugMessages();
		actions.setAppView("debug");

		pressKey("j");
		expect(state.debugMenuIndex).toBe(0);
	});

	it("does not fire bare-letter actions when ctrl is held", () => {
		actions.setMacPodcasts([{ id: "1", selected: true } as PodcastEpisode]);
		actions.setMacIndex(0);
		actions.setFocusedPane("mac");

		pressKey("s", { ctrl: true });
		pressKey("r", { ctrl: true });
		pressKey("f", { ctrl: true });
		pressKey("a", { ctrl: true });
		pressKey("l", { ctrl: true });

		expect(mockLogic.startSync).not.toHaveBeenCalled();
		expect(mockLogic.refreshData).not.toHaveBeenCalled();
		expect(mockLogic.scanForDrives).not.toHaveBeenCalled();
		expect(state.macPodcasts[0]?.selected).toBe(true);
		expect(state.focusedPane).toBe("mac");
		expect(state.appView).toBe("normal");
	});

	it("still handles ctrl+t and the ctrl+u/ctrl+d page remaps", () => {
		pressKey("t", { ctrl: true });
		expect(state.appView).toBe("themeSelection");

		actions.setAppView("normal");
		// Remapped to pageup/pagedown with ctrl cleared; must not reach plain-letter actions.
		pressKey("d", { ctrl: true });
		pressKey("u", { ctrl: true });
		expect(state.appView).toBe("normal");
		expect(mockLogic.deleteSelectedFromDrive).not.toHaveBeenCalled();
	});
});
