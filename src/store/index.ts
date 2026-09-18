import { createStore } from "solid-js";
import type { DebugMessage } from "@/components/DebugPopup";
import type { Drive } from "@/types/drive";
import type { AppView, FocusedPane } from "@/types/keyboard";
import type { PodcastEpisode } from "@/types/podcast";

export interface TransferProgress {
	currentFile: string;
	lastFile: string;
	filesDone: number;
	totalFiles: number;
	bytesTransferred: number;
	totalBytes: number;
	speed: number;
}

export interface AppState {
	appView: AppView;
	focusedPane: FocusedPane;
	macIndex: number;
	driveIndex: number;
	driveMenuIndex: number;
	macPodcasts: PodcastEpisode[];
	drivePodcasts: PodcastEpisode[];
	drives: Drive[];
	currentDrive: Drive | null;
	loadingMac: boolean;
	loadingDrive: boolean;
	isScanning: boolean;
	transferProgress: TransferProgress;
	errorMsg: string;
	debugMessages: DebugMessage[];
	lastKey: string | null;
	lastSavedTheme: string;
	themeMenuIndex: number;
	debugMenuIndex: number;
	favoriteDrives: string[];
}

const initialState: AppState = {
	appView: "normal",
	focusedPane: "mac",
	macIndex: 0,
	driveIndex: 0,
	driveMenuIndex: 0,
	themeMenuIndex: 0,
	debugMenuIndex: 0,
	macPodcasts: [],
	drivePodcasts: [],
	drives: [],
	currentDrive: null,
	loadingMac: true,
	loadingDrive: true,
	isScanning: false,
	transferProgress: {
		currentFile: "",
		lastFile: "",
		filesDone: 0,
		totalFiles: 0,
		bytesTransferred: 0,
		totalBytes: 0,
		speed: 0,
	},
	errorMsg: "",
	debugMessages: [],
	lastKey: null,
	lastSavedTheme: "Catppuccin",
	favoriteDrives: [],
};

export const [state, setState] = createStore<AppState>(initialState);

const updateState = (update: (draft: AppState) => void): void => {
	setState(update);
};

const resolveUpdate = <T>(value: T | ((previous: T) => T), previous: T): T =>
	typeof value === "function" ? (value as (previous: T) => T)(previous) : value;

export const actions = {
	setAppView: (view: AppView) =>
		updateState((draft) => {
			draft.appView = view;
		}),
	setFocusedPane: (pane: FocusedPane) =>
		updateState((draft) => {
			draft.focusedPane = pane;
		}),
	setMacIndex: (index: number | ((previous: number) => number)) =>
		updateState((draft) => {
			draft.macIndex = resolveUpdate(index, draft.macIndex);
		}),
	setDriveIndex: (index: number | ((previous: number) => number)) =>
		updateState((draft) => {
			draft.driveIndex = resolveUpdate(index, draft.driveIndex);
		}),
	setDriveMenuIndex: (index: number | ((previous: number) => number)) =>
		updateState((draft) => {
			draft.driveMenuIndex = resolveUpdate(index, draft.driveMenuIndex);
		}),
	setThemeMenuIndex: (index: number | ((previous: number) => number)) =>
		updateState((draft) => {
			draft.themeMenuIndex = resolveUpdate(index, draft.themeMenuIndex);
		}),
	setDebugMenuIndex: (index: number | ((previous: number) => number)) =>
		updateState((draft) => {
			draft.debugMenuIndex = resolveUpdate(index, draft.debugMenuIndex);
		}),
	setMacPodcasts: (
		episodes: PodcastEpisode[] | ((previous: PodcastEpisode[]) => PodcastEpisode[]),
	) =>
		updateState((draft) => {
			draft.macPodcasts = resolveUpdate(episodes, draft.macPodcasts);
		}),
	setDrivePodcasts: (
		episodes: PodcastEpisode[] | ((previous: PodcastEpisode[]) => PodcastEpisode[]),
	) =>
		updateState((draft) => {
			draft.drivePodcasts = resolveUpdate(episodes, draft.drivePodcasts);
		}),
	setDrives: (drives: Drive[] | ((previous: Drive[]) => Drive[])) =>
		updateState((draft) => {
			draft.drives = resolveUpdate(drives, draft.drives);
		}),
	setCurrentDrive: (drive: Drive | null | ((previous: Drive | null) => Drive | null)) =>
		updateState((draft) => {
			draft.currentDrive = resolveUpdate(drive, draft.currentDrive);
		}),
	setLoadingMac: (loading: boolean) =>
		updateState((draft) => {
			draft.loadingMac = loading;
		}),
	setLoadingDrive: (loading: boolean) =>
		updateState((draft) => {
			draft.loadingDrive = loading;
		}),
	setIsScanning: (scanning: boolean) =>
		updateState((draft) => {
			draft.isScanning = scanning;
		}),
	updateTransferProgress: (progress: Partial<TransferProgress>) =>
		updateState((draft) => {
			if (progress.currentFile === "Preparing...") {
				draft.transferProgress.lastFile = "";
			} else if (progress.currentFile) {
				draft.transferProgress.lastFile = progress.currentFile;
			}
			Object.assign(draft.transferProgress, progress);
		}),
	setErrorMsg: (msg: string) =>
		updateState((draft) => {
			draft.errorMsg = msg;
		}),
	addDebugMessage: (message: string, type: DebugMessage["type"] = "info") => {
		updateState((draft) => {
			draft.debugMessages.push({ timestamp: Date.now(), message, type });
			if (draft.debugMessages.length > 500) {
				draft.debugMessages.splice(0, draft.debugMessages.length - 500);
			}
		});
	},
	clearDebugMessages: () =>
		updateState((draft) => {
			draft.debugMessages = [];
		}),
	setLastKey: (key: string | null) =>
		updateState((draft) => {
			draft.lastKey = key;
		}),
	setLastSavedTheme: (theme: string) =>
		updateState((draft) => {
			draft.lastSavedTheme = theme;
		}),
	setFavoriteDrives: (drives: string[]) =>
		updateState((draft) => {
			draft.favoriteDrives = drives;
		}),
	toggleFavoriteDrive: (driveId: string) => {
		updateState((draft) => {
			const index = draft.favoriteDrives.indexOf(driveId);
			if (index >= 0) {
				draft.favoriteDrives.splice(index, 1);
			} else {
				draft.favoriteDrives.push(driveId);
			}
		});
	},
	toggleMacSelection: (index: number) => {
		updateState((draft) => {
			const episode = draft.macPodcasts[index];
			if (episode) episode.selected = !episode.selected;
		});
	},
	toggleAllMacSelection: () => {
		const allSelected = state.macPodcasts.every((p) => p.selected);
		updateState((draft) => {
			for (const episode of draft.macPodcasts) episode.selected = !allSelected;
		});
	},
	clearMacSelection: () => {
		updateState((draft) => {
			for (const episode of draft.macPodcasts) episode.selected = false;
		});
	},
	toggleDriveSelection: (index: number) => {
		updateState((draft) => {
			const episode = draft.drivePodcasts[index];
			if (episode) episode.selected = !episode.selected;
		});
	},
	toggleAllDriveSelection: () => {
		const allSelected = state.drivePodcasts.every((p) => p.selected);
		updateState((draft) => {
			for (const episode of draft.drivePodcasts) episode.selected = !allSelected;
		});
	},
	clearDriveSelection: () => {
		updateState((draft) => {
			for (const episode of draft.drivePodcasts) episode.selected = false;
		});
	},
	resetState: () =>
		updateState((draft) => {
			Object.assign(draft, initialState);
		}),
};
