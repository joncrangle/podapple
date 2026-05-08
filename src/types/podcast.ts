export interface Episode {
	id: string;
	title: string;
	duration: number;
	publishedAt: Date;
	synced: boolean;
	assetUrl: string;
	fileSize?: number;
}

export interface PodcastEpisode {
	id: string;
	title: string;
	showName: string;
	filePath: string;
	published: Date;
	duration: number; // seconds
	fileSize: number;
	selected: boolean;
	onDrive: boolean;
}

export interface Podcast {
	id: string;
	title: string;
	author: string;
	episodeCount: number;
	episodes: Episode[];
	uuid?: string; // UUID from macOS Podcasts DB (for linking episodes)
}

export type PaneId = "mac" | "drive";

export interface EpisodeRow {
	id: number;
	title: string | null;
	showName: string | null;
	assetUrl: string | null;
	pubDate: number | null;
	duration: number | null;
}
