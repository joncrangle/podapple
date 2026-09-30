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
