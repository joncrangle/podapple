import type { Episode, Podcast } from "@/types/podcast";

export interface SyncProgress {
	currentFile: string;
	currentIndex: number;
	totalFiles: number;
	bytesTransferred: number;
	totalBytes: number;
	/** Files copied but discarded because tagging failed. Monotonic across a run. */
	discarded: number;
	startTime: number;
	status: "idle" | "syncing" | "complete" | "error";
	error?: string;
}

export interface CopyItem {
	episode: Episode;
	podcast: Podcast;
	sourcePath: string;
	destPath: string;
	size: number;
}

export interface DeleteItem {
	path: string;
	episode: Episode;
	podcast: Podcast;
}

export interface SyncPlan {
	toCopy: CopyItem[];
	toDelete: DeleteItem[];
	totalBytes: number;
	totalFiles: number;
}
