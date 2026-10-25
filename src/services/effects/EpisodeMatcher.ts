import { Context, Layer } from "effect";
import { driveEpisodeKey } from "@/utils/formatting";

/**
 * EpisodeMatcher Service Tag
 */
export class EpisodeMatcher extends Context.Service<
	EpisodeMatcher,
	{
		/**
		 * Builds the expected relative path for an episode on the drive:
		 * "Show/YYYY-MM-DD - Title.mp3". `date` is a Date (formatted like formatDestPath)
		 * or the literal date string from a filename; "" gives the undated legacy path.
		 */
		readonly buildExpectedDrivePath: (
			showName: string,
			title: string,
			date: Date | string,
		) => string;
		/** Attempts to match a Mac episode with a file on the drive using path, size, or duration */
		readonly matchEpisode: (
			showName: string,
			episode: { title: string; published: Date; fileSize?: number; duration?: number },
			driveIndex: Map<string, { path: string; size?: number; duration?: number }>,
		) => boolean;
	}
>()("EpisodeMatcher") {}

const buildExpectedDrivePathImpl = (showName: string, title: string, date: Date | string): string =>
	driveEpisodeKey(showName, title, date);

/** " (2)", " (3)", ... appended by SyncEngine.dedupeDestPath (sanitized to "_(2)" in keys). */
const DEDUPE_KEY_SUFFIX = /^[ _]\(\d+\)\.mp3$/;

const matchEpisodeImpl = (
	showName: string,
	episode: { title: string; published: Date; fileSize?: number; duration?: number },
	driveIndex: Map<string, { path: string; size?: number; duration?: number }>,
): boolean => {
	// 1. Path-based matching (Strongest, handles tagged files where size changed).
	// The key includes the publish date so a new episode never matches an older one
	// with the same title ("Trailer", "Bonus").
	const expectedPath = buildExpectedDrivePathImpl(showName, episode.title, episode.published);
	if (driveIndex.has(expectedPath)) return true;

	// Legacy drive files carry no date prefix, so show + title is all there is.
	if (driveIndex.has(buildExpectedDrivePathImpl(showName, episode.title, ""))) return true;

	const showPrefix = `${expectedPath.slice(0, expectedPath.indexOf("/"))}/`;

	// A file that was deduped on copy ("<date> - Title (2).mp3") still counts as synced.
	const expectedBase = expectedPath.slice(0, -".mp3".length);
	for (const key of driveIndex.keys()) {
		if (key.startsWith(expectedBase) && DEDUPE_KEY_SUFFIX.test(key.slice(expectedBase.length))) {
			return true;
		}
	}

	// 2. Cascade through other matches
	for (const [key, info] of driveIndex) {
		// Only check fallback matches for the same show to avoid false positives across different shows
		if (!key.startsWith(showPrefix)) {
			continue;
		}

		// Size-based matching (Legacy fallback)
		if (episode.fileSize && info.size && info.size === episode.fileSize) {
			return true;
		}

		// Duration-based matching (2% tolerance for different encodings/metadata)
		if (episode.duration && info.duration) {
			const diff = Math.abs(episode.duration - info.duration);
			const tolerance = episode.duration * 0.02;
			if (diff <= tolerance) {
				return true;
			}
		}
	}
	return false;
};

export const EpisodeMatcherLive = Layer.succeed(EpisodeMatcher, {
	buildExpectedDrivePath: buildExpectedDrivePathImpl,
	matchEpisode: matchEpisodeImpl,
});
