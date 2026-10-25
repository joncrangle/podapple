import type { Podcast, PodcastEpisode } from "@/types/podcast";
import { hasNerdFont } from "@/utils/terminal";

// Apple epoch offset (seconds between Unix epoch 1970-01-01 and Apple epoch 2001-01-01)
export const APPLE_EPOCH_OFFSET = 978307200;

const BYTES_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Fallback podcast author. Matches the DriveScan convention so ID3 artist is never blank. */
export const UNKNOWN_AUTHOR = "Unknown";
/** Date label used in drive filenames when an episode has no usable publish date. */
export const UNKNOWN_DATE = "Unknown";

/**
 * Formats bytes into human-readable string
 * e.g., 1073741824 → "1.0 GB"
 */
export function formatBytes(rawBytes: number): string {
	const bytes = Math.max(0, rawBytes);
	if (bytes === 0) return "0 B";

	let unitIndex = 0;
	let value = bytes;

	while (value >= 1024 && unitIndex < BYTES_UNITS.length - 1) {
		value /= 1024;
		unitIndex++;
	}

	// Show decimal for KB and above
	if (unitIndex === 0) {
		return `${Math.round(value)} ${BYTES_UNITS[unitIndex]}`;
	}

	return `${value.toFixed(1)} ${BYTES_UNITS[unitIndex]}`;
}

/** Maximum length of a sanitized name, in code points. */
const MAX_FILENAME_LENGTH = 100;

/**
 * Helper to sanitize filenames for FAT32 compatibility.
 * Replaces invalid characters with dashes and normalizes spaces.
 *
 * The result is NFC-normalized. HFS+ hands back NFD names from readdir while
 * Podcasts.app metadata is typically NFC, so keys built from the two sides only
 * match if both are normalized to the same form.
 */
export function sanitizeFilename(name: string): string {
	if (!name || name.trim().length === 0) {
		return "untitled";
	}

	// Replace invalid chars with -
	// < > : " / \ | ? *
	let sanitized = name.normalize("NFC").replace(/[<>:"/\\|?*]/g, "-");

	sanitized = sanitized.replace(/&/g, "and");
	sanitized = sanitized.replace(/'/g, "");
	sanitized = sanitized.replace(/\s+/g, "_");

	if (sanitized.length === 0) {
		return "untitled";
	}

	// Truncate by code point: slicing UTF-16 units can cut a surrogate pair in
	// half and leave a lone surrogate, which is not a valid filename.
	const codePoints = Array.from(sanitized);
	if (codePoints.length > MAX_FILENAME_LENGTH) {
		sanitized = codePoints.slice(0, MAX_FILENAME_LENGTH).join("");
	}

	// "." and ".." (or any run of dots) are directory references, not names.
	if (/^\.+$/.test(sanitized)) {
		return "_";
	}

	return sanitized.normalize("NFC");
}

/**
 * Cleans a file URL by removing the file:// protocol and decoding URI components.
 * Returns the original URL if it's not a file URL or if decoding fails.
 */
export function cleanFileUrl(url: string): string {
	if (url.startsWith("file://")) {
		try {
			return decodeURIComponent(new URL(url).pathname);
		} catch {
			return url;
		}
	}
	return url;
}

/**
 * Groups a flat list of episodes by their podcast show name.
 */
export function groupEpisodesByPodcast(episodes: PodcastEpisode[]): Podcast[] {
	const grouped = new Map<string, PodcastEpisode[]>();

	for (const ep of episodes) {
		const existing = grouped.get(ep.showName) ?? [];
		existing.push(ep);
		grouped.set(ep.showName, existing);
	}

	return Array.from(grouped.entries()).map(([showName, eps]) => ({
		id: showName,
		title: showName,
		author: eps.find((ep) => ep.author.trim().length > 0)?.author ?? UNKNOWN_AUTHOR,
		episodeCount: eps.length,
		episodes: eps.map((ep) => ({
			id: ep.id,
			title: ep.title,
			author: ep.author,
			duration: ep.duration,
			published: ep.published,
			onDrive: false,
			filePath: ep.filePath,
			fileSize: ep.fileSize,
		})),
	}));
}

/**
 * Format duration matching original Go formatDuration().
 * Returns HH:MM:SS for durations >= 1 hour, MM:SS otherwise.
 */
export function formatDuration(rawSeconds: number): string {
	const seconds = Math.max(0, rawSeconds);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	const paddedMins = minutes.toString().padStart(2, "0");
	const paddedSecs = secs.toString().padStart(2, "0");

	if (hours > 0) {
		return `${hours.toString().padStart(2, "0")}:${paddedMins}:${paddedSecs}`;
	}

	return `${paddedMins}:${paddedSecs}`;
}

/**
 * Format date matching original Go implementation (2006-01-02 format).
 */
export function formatDate(date: Date): string {
	if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
		return UNKNOWN_DATE;
	}

	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");

	return `${year}-${month}-${day}`;
}

/**
 * Truncates a string to a maximum length, adding an ellipsis if needed.
 */
export function truncateString(str: string, maxLength: number): string {
	if (maxLength <= 0) return "";
	if (str.length <= maxLength) {
		return str;
	}
	if (maxLength <= 3) {
		return ".".repeat(maxLength);
	}
	return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Get episode display title matching original Go implementation.
 * Format: "✓ {title}" if on drive, "{title}" otherwise.
 */
export function getEpisodeTitle(episode: PodcastEpisode): string {
	const icon = hasNerdFont() ? " " : "✓ ";
	const status = episode.onDrive ? icon : "";
	return status + episode.title;
}

/**
 * Get episode description matching original Go implementation.
 * Format: "{showName} • {date} • {duration}"
 */
export function getEpisodeDescription(episode: PodcastEpisode): string {
	const parts: string[] = [episode.showName];

	if (episode.published.getTime() !== 0) {
		parts.push(formatDate(episode.published));
	}

	if (episode.duration > 0) {
		parts.push(formatDuration(episode.duration));
	}

	return parts.join(" • ");
}

/**
 * Maps scanDrive results (Podcast[]) to a flat list of PodcastEpisode
 */
export const mapPodcastsToEpisodes = (podcasts: Podcast[]): PodcastEpisode[] => {
	return podcasts.flatMap((p) =>
		p.episodes.map((ep) => ({
			id: ep.id,
			title: ep.title,
			author: p.author.trim() || UNKNOWN_AUTHOR,
			showName: p.title,
			filePath: ep.filePath,
			published: ep.published,
			duration: ep.duration,
			fileSize: ep.fileSize,
			selected: false,
			onDrive: ep.onDrive,
			driveDate: ep.driveDate,
		})),
	);
};

/**
 * Maps buildDriveIndex results (Map) to a flat list of PodcastEpisode
 */
export function mapDriveEpisodes(
	index: Map<string, { id: string; title: string; path: string; size: number }>,
): PodcastEpisode[] {
	const episodes: PodcastEpisode[] = [];

	for (const [key, info] of index) {
		// key format: "Show_Name/Episode_Title"
		const parts = key.split("/");
		const showName = (parts.length > 0 ? parts[0] : "")?.replace(/_/g, " ") ?? "Unknown Show";

		episodes.push({
			id: info.path,
			title: info.title,
			author: UNKNOWN_AUTHOR,
			showName,
			filePath: info.path,
			published: new Date(), // Not available from file scan
			duration: 0,
			fileSize: info.size,
			selected: false,
			onDrive: true,
		});
	}

	return episodes;
}

/**
 * Builds the canonical show/file key used to match an episode with a file on the
 * drive: "Show/YYYY-MM-DD - Title.mp3", mirroring formatDestPath. `date` is either a
 * Date (formatted with formatDate, exactly as formatDestPath does) or the literal
 * date string from a filename ("YYYY-MM-DD" or "Unknown"). An empty string yields the
 * undated legacy key "Show/Title.mp3".
 */
export function driveEpisodeKey(showName: string, title: string, date: Date | string): string {
	const dateStr = typeof date === "string" ? date : formatDate(date);
	const prefix = dateStr ? `${dateStr} - ` : "";
	return `${sanitizeFilename(showName)}/${prefix}${sanitizeFilename(title)}.mp3`;
}

/**
 * Removes the " (2)", " (3)", ... suffix that SyncEngine.dedupeDestPath appends to
 * a title. Returns the title unchanged when there is no such suffix.
 */
export function stripDedupeSuffix(title: string): string {
	const match = title.match(/^(.*\S)\s\((\d+)\)$/);
	return match && Number(match[2]) >= 2 ? (match[1] ?? title) : title;
}

/**
 * Mark episodes as being on the drive based on file path matching.
 * Matches on Show Name + publish date + Episode Title using sanitized keys, the same
 * keys as DriveScan.buildDriveIndex. Drive files without a date prefix (legacy) match
 * on show + title alone, and a " (2)" dedupe suffix on a drive title is ignored.
 */
export function markEpisodesOnDrive(
	macEpisodes: PodcastEpisode[],
	driveEpisodes: PodcastEpisode[],
): PodcastEpisode[] {
	const driveSet = new Set<string>();
	for (const e of driveEpisodes) {
		const date = e.driveDate ?? e.published;
		driveSet.add(driveEpisodeKey(e.showName, e.title, date));
		const stripped = stripDedupeSuffix(e.title);
		if (stripped !== e.title) driveSet.add(driveEpisodeKey(e.showName, stripped, date));
	}

	return macEpisodes.map((episode) => ({
		...episode,
		onDrive:
			driveSet.has(driveEpisodeKey(episode.showName, episode.title, episode.published)) ||
			driveSet.has(driveEpisodeKey(episode.showName, episode.title, "")),
	}));
}
