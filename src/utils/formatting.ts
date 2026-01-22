import type { Podcast, PodcastEpisode } from "@/types/podcast";
import { hasNerdFont } from "@/utils/terminal";

// Apple epoch offset (seconds between Unix epoch 1970-01-01 and Apple epoch 2001-01-01)
export const APPLE_EPOCH_OFFSET = 978307200;

const BYTES_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Formats bytes into human-readable string
 * e.g., 1073741824 → "1.0 GB"
 */
export function formatBytes(bytes: number): string {
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

/**
 * Helper to sanitize filenames for FAT32 compatibility.
 * Replaces invalid characters with dashes and normalizes spaces.
 */
export function sanitizeFilename(name: string): string {
  // Replace invalid chars with -
  // < > : " / \ | ? *
  let sanitized = name.replace(/[<>:"/\\|?*]/g, "-");

  sanitized = sanitized.replace(/&/g, "and");
  sanitized = sanitized.replace(/'/g, "");
  sanitized = sanitized.replace(/\s+/g, "_");

  // Truncate to 100 chars (FAT32 limit is higher but this is safe)
  if (sanitized.length > 100) {
    sanitized = sanitized.slice(0, 100);
  }

  return sanitized;
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
    author: "",
    episodeCount: eps.length,
    episodes: eps.map((ep) => ({
      id: ep.id,
      title: ep.title,
      duration: ep.duration,
      publishedAt: ep.published,
      synced: false,
      assetUrl: ep.filePath,
    })),
  }));
}

/**
 * Format duration matching original Go formatDuration().
 * Returns HH:MM:SS for durations >= 1 hour, MM:SS otherwise.
 */
export function formatDuration(seconds: number): string {
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
  if (date.getTime() === 0) {
    return "Unknown";
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
  if (str.length <= maxLength) {
    return str;
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
      showName: p.title,
      podcastId: p.id,
      podcastTitle: p.title,
      filePath: ep.assetUrl,
      published: ep.publishedAt,
      duration: ep.duration,
      fileSize: ep.fileSize ?? 0,
      selected: false,
      onDrive: true,
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
 * Mark episodes as being on the drive based on file path matching.
 * Matches on Show Name + Episode Title using sanitized keys for robustness.
 */
export function markEpisodesOnDrive(
  macEpisodes: PodcastEpisode[],
  driveEpisodes: PodcastEpisode[],
): PodcastEpisode[] {
  // Create a set of "SanitizedShow/SanitizedTitle" keys
  const driveSet = new Set(
    driveEpisodes.map((e) => `${sanitizeFilename(e.showName)}/${sanitizeFilename(e.title)}`),
  );

  return macEpisodes.map((episode) => ({
    ...episode,
    onDrive: driveSet.has(
      `${sanitizeFilename(episode.showName)}/${sanitizeFilename(episode.title)}`,
    ),
  }));
}
