/**
 * Effect-based Services
 *
 * Barrel export for all Effect services.
 * These services use Bun native APIs and Effect for type-safe async operations.
 */

export {
	createDriveDetectionTest,
	DriveDetection,
	DriveDetectionError,
	DriveDetectionLive,
	type DriveEvent,
} from "./DriveDetection";
export { createDriveScanTest, DriveScan, DriveScanError, DriveScanLive } from "./DriveScan";
export { EpisodeMatcher, EpisodeMatcherLive } from "./EpisodeMatcher";
export {
	CopyError as FSCopyError,
	createFileSystemTest,
	FileNotFoundError,
	FileSystem,
	FileSystemLive,
	ReadDirError,
	WriteError,
} from "./FileSystem";
export { Logger, LoggerLive } from "./Logger";
export {
	createMetadataEditorTest,
	MetadataEditor,
	MetadataEditorLive,
	MetadataError,
	type PodcastMetadata,
} from "./MetadataEditor";
export {
	PodcastService,
	PodcastServiceLive,
	PodcastError,
	DatabaseNotFoundError,
} from "./PodcastService";
export { SettingsService, SettingsServiceLive, type Settings } from "./SettingsService";
export {
	SyncCopyError,
	SyncEngine,
	SyncEngineLive,
	PlanError,
	SyncError,
	CleanupError,
} from "./SyncEngine";
