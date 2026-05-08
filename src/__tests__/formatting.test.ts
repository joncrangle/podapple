import { describe, expect, test } from "bun:test";
import type { Podcast, PodcastEpisode } from "@/types/podcast";
import {
	cleanFileUrl,
	formatBytes,
	formatDate,
	formatDuration,
	getEpisodeDescription,
	getEpisodeTitle,
	groupEpisodesByPodcast,
	mapDriveEpisodes,
	mapPodcastsToEpisodes,
	markEpisodesOnDrive,
	sanitizeFilename,
} from "@/utils/formatting";

describe("Formatting Utils", () => {
	describe("formatBytes", () => {
		test("formats bytes", () => {
			expect(formatBytes(512)).toBe("512 B");
		});

		test("formats kilobytes", () => {
			expect(formatBytes(1024)).toBe("1.0 KB");
		});

		test("formats megabytes", () => {
			expect(formatBytes(1048576)).toBe("1.0 MB");
		});

		test("formats gigabytes", () => {
			expect(formatBytes(1073741824)).toBe("1.0 GB");
		});

		test("formats terabytes", () => {
			expect(formatBytes(1099511627776)).toBe("1.0 TB");
		});

		test("formats fractional values", () => {
			expect(formatBytes(1610612736)).toBe("1.5 GB");
		});

		test("handles zero", () => {
			expect(formatBytes(0)).toBe("0 B");
		});

		test("formats 15.2 GB correctly", () => {
			const bytes = 15.2 * 1024 * 1024 * 1024;
			expect(formatBytes(bytes)).toBe("15.2 GB");
		});
	});

	describe("sanitizeFilename", () => {
		test("replaces invalid characters with dashes", () => {
			expect(sanitizeFilename("Episode 1: The Beginning?")).toBe("Episode_1-_The_Beginning-");
		});

		test("replaces spaces with underscores", () => {
			expect(sanitizeFilename("My Episode Name")).toBe("My_Episode_Name");
		});

		test("truncates to 100 characters", () => {
			const longTitle = "A".repeat(150);
			expect(sanitizeFilename(longTitle).length).toBe(100);
		});

		test("replaces ampersands with 'and'", () => {
			expect(sanitizeFilename("Tom & Jerry")).toBe("Tom_and_Jerry");
		});

		test("removes apostrophes", () => {
			expect(sanitizeFilename("It's a wonderful life")).toBe("Its_a_wonderful_life");
		});
	});

	describe("cleanFileUrl", () => {
		test("decodes file:// URLs", () => {
			expect(cleanFileUrl("file:///Users/user/My%20Documents/file.txt")).toBe(
				"/Users/user/My Documents/file.txt",
			);
		});

		test("returns original string if not a file:// URL", () => {
			expect(cleanFileUrl("/Users/user/file.txt")).toBe("/Users/user/file.txt");
		});
	});

	describe("formatDuration", () => {
		test("formats seconds to MM:SS", () => {
			expect(formatDuration(65)).toBe("01:05");
		});

		test("formats seconds to HH:MM:SS", () => {
			expect(formatDuration(3665)).toBe("01:01:05");
		});

		test("pads single digits", () => {
			expect(formatDuration(5)).toBe("00:05");
		});
	});

	describe("formatDate", () => {
		test("formats date to YYYY-MM-DD", () => {
			const date = new Date("2023-12-25T12:00:00");
			expect(formatDate(date)).toBe("2023-12-25");
		});

		test("handles zero date", () => {
			const date = new Date(0);
			expect(formatDate(date)).toBe("Unknown");
		});
	});

	describe("getEpisodeTitle", () => {
		test("returns title with checkmark if on drive", () => {
			const ep = { title: "Test Ep", onDrive: true } as PodcastEpisode;
			// Note: The actual checkmark depends on Nerd Font support, so we check for either
			const title = getEpisodeTitle(ep);
			expect(title).toMatch(/^(✓|) Test Ep$/);
		});

		test("returns title without checkmark if not on drive", () => {
			const ep = { title: "Test Ep", onDrive: false } as PodcastEpisode;
			expect(getEpisodeTitle(ep)).toBe("Test Ep");
		});
	});

	describe("getEpisodeDescription", () => {
		test("formats description correctly", () => {
			const ep = {
				showName: "My Show",
				published: new Date("2023-01-01"),
				duration: 3600,
			} as PodcastEpisode;

			expect(getEpisodeDescription(ep)).toBe("My Show • 2023-01-01 • 01:00:00");
		});
	});

	describe("Mapping Functions", () => {
		const mockEpisode: PodcastEpisode = {
			id: "1",
			title: "Ep 1",
			showName: "Show A",
			filePath: "/path/to/ep1.mp3",
			published: new Date("2023-01-01"),
			duration: 3600,
			fileSize: 1000,
			selected: false,
			onDrive: false,
		};

		describe("groupEpisodesByPodcast", () => {
			test("groups episodes correctly", () => {
				const episodes = [
					mockEpisode,
					{ ...mockEpisode, id: "2", title: "Ep 2" },
					{ ...mockEpisode, id: "3", showName: "Show B" },
				];

				const grouped = groupEpisodesByPodcast(episodes);
				expect(grouped).toHaveLength(2);

				const showA = grouped.find((p) => p.title === "Show A");
				expect(showA).toBeDefined();
				expect(showA?.episodes).toHaveLength(2);

				const showB = grouped.find((p) => p.title === "Show B");
				expect(showB).toBeDefined();
				expect(showB?.episodes).toHaveLength(1);
			});
		});

		describe("mapPodcastsToEpisodes", () => {
			test("flattens podcasts to episodes", () => {
				const podcasts: Podcast[] = [
					{
						id: "p1",
						title: "Show A",
						author: "Author",
						episodeCount: 1,
						episodes: [
							{
								id: "1",
								title: "Ep 1",
								duration: 3600,
								publishedAt: new Date("2023-01-01"),
								synced: false,
								assetUrl: "/path/to/ep1.mp3",
							},
						],
					},
				];

				const episodes = mapPodcastsToEpisodes(podcasts);
				expect(episodes).toHaveLength(1);
				expect(episodes[0]?.title).toBe("Ep 1");
				expect(episodes[0]?.showName).toBe("Show A");
				expect(episodes[0]?.onDrive).toBe(true);
			});
		});

		describe("mapDriveEpisodes", () => {
			test("maps drive index to episodes", () => {
				const index = new Map([
					["Show_A/Ep_1", { id: "path", title: "Ep 1", path: "/path", size: 1000 }],
				]);

				const episodes = mapDriveEpisodes(index);
				expect(episodes).toHaveLength(1);
				expect(episodes[0]?.title).toBe("Ep 1");
				expect(episodes[0]?.showName).toBe("Show A"); // Replaces _ with space
			});
		});

		describe("markEpisodesOnDrive", () => {
			test("marks episodes as on drive if they match", () => {
				const macEpisodes = [mockEpisode];
				const driveEpisodes = [
					{
						...mockEpisode,
						onDrive: true,
					},
				];

				const result = markEpisodesOnDrive(macEpisodes, driveEpisodes);
				expect(result[0]?.onDrive).toBe(true);
			});

			test("handles mismatched sanitization gracefully", () => {
				const macEpisodes = [{ ...mockEpisode, showName: "Show & Tell" }];
				// Drive has "Show_and_Tell"
				const driveEpisodes = [
					{
						...mockEpisode,
						showName: "Show and Tell", // simulate sanitized name on drive
						onDrive: true,
					},
				];

				// markEpisodesOnDrive sanitizes both inputs, so "Show & Tell" -> "Show_and_Tell"
				// and "Show and Tell" -> "Show_and_Tell". They should match.
				const result = markEpisodesOnDrive(macEpisodes, driveEpisodes);
				expect(result[0]?.onDrive).toBe(true);
			});
		});
	});
});
