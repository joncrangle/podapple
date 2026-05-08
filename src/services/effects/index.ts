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
} from "./MetadataEditor";
export { PodcastService, PodcastServiceLive } from "./PodcastService";
export { SettingsService, SettingsServiceLive } from "./SettingsService";
export { CopyError, SyncEngine, SyncEngineLive } from "./SyncEngine";
