export interface Episode {
	id: string;
	title: string;
	/** Podcast author, used as the ID3 artist tag. Never the empty string in production. */
	author: string;
	duration: number;
	published: Date;
	onDrive: boolean;
	filePath: string;
	fileSize: number;
	/**
	 * Drive-scan only: the date string exactly as it appears in the filename
	 * ("YYYY-MM-DD" or "Unknown"), or "" when the file has no date prefix.
	 * Used for drive matching so no timezone round-trip is involved.
	 */
	driveDate?: string;
}

export interface PodcastEpisode extends Episode {
	showName: string;
	selected: boolean;
}

export interface Podcast {
	id: string;
	title: string;
	author: string;
	episodeCount: number;
	episodes: Episode[];
	uuid?: string; // UUID from macOS Podcasts DB (for linking episodes)
}

export interface EpisodeRow {
	id: number;
	title: string | null;
	showName: string | null;
	author: string | null;
	assetUrl: string | null;
	pubDate: number | null;
	duration: number | null;
}
