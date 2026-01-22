import type { Episode, Podcast } from "@/types/podcast";

export interface SyncProgress {
  currentFile: string;
  currentIndex: number;
  totalFiles: number;
  bytesTransferred: number;
  totalBytes: number;
  startTime: number;
  status: "idle" | "syncing" | "complete" | "error";
  error?: string;
}

export interface SyncOptions {
  sourcePath: string; // Path to Mac podcasts
  destinationPath: string; // Path to USB drive
  deleteOrphans: boolean; // Remove episodes not on Mac
  dryRun: boolean; // Preview changes without syncing
}

export interface SyncEpisode extends Episode {
  podcastTitle: string;
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

export interface SyncResult {
  copied: number;
  deleted: number;
  failed: Array<{ file: string; error: string }>;
  duration: number;
}

export interface DriveEpisode {
  id: string;
  title: string;
  path: string;
  size: number;
}

export interface DrivePodcast {
  name: string;
  path: string;
  episodes: DriveEpisode[];
}
