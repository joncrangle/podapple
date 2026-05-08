import { Context, Layer } from "effect";
import { sanitizeFilename } from "@/utils/formatting";

/**
 * EpisodeMatcher Service Tag
 */
export class EpisodeMatcher extends Context.Tag("EpisodeMatcher")<
	EpisodeMatcher,
	{
		/** Builds the expected relative path for an episode on the drive */
		readonly buildExpectedDrivePath: (showName: string, title: string) => string;
		/** Attempts to match a Mac episode with a file on the drive using path, size, or duration */
		readonly matchEpisode: (
			showName: string,
			episode: { title: string; fileSize?: number; duration?: number },
			driveIndex: Map<string, { path: string; size?: number; duration?: number }>,
		) => boolean;
	}
>() {}

const buildExpectedDrivePathImpl = (showName: string, title: string): string => {
	return `${sanitizeFilename(showName)}/${sanitizeFilename(title)}.mp3`;
};

const matchEpisodeImpl = (
	showName: string,
	episode: { title: string; fileSize?: number; duration?: number },
	driveIndex: Map<string, { path: string; size?: number; duration?: number }>,
): boolean => {
	// 1. Path-based matching (Strongest, handles tagged files where size changed)
	const expectedPath = buildExpectedDrivePathImpl(showName, episode.title);
	if (driveIndex.has(expectedPath)) return true;

	// 2. Cascade through other matches
	for (const [_key, info] of driveIndex) {
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
