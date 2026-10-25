import { createSignal } from "solid-js";
import { testRender } from "@opentui/solid";
import { describe, expect, it } from "bun:test";
import { DebugPopup } from "@/components/DebugPopup";
import { EpisodeList } from "@/components/EpisodeList";
import { state } from "@/store";
import type { PodcastEpisode } from "@/types/podcast";

const episodes: PodcastEpisode[] = Array.from({ length: 40 }, (_, n) => ({
	id: `e${n}`,
	title: `episode-${n}`,
	author: "author",
	duration: 60,
	published: new Date(0),
	onDrive: false,
	filePath: `/tmp/e${n}.mp3`,
	fileSize: 1,
	showName: "show",
	selected: false,
}));

const settle = async (setup: { renderOnce: () => Promise<void> }) => {
	await setup.renderOnce();
	await setup.renderOnce();
	await setup.renderOnce();
};

describe("EpisodeList (rendered)", () => {
	it("keeps the selected episode visible on open and as the selection moves", async () => {
		const [index, setIndex] = createSignal(30);
		const setup = await testRender(
			() => (
				<EpisodeList
					title='Apple Podcasts'
					episodes={episodes}
					selectedIndex={index()}
					focused={true}
				/>
			),
			{ width: 60, height: 20 },
		);
		await settle(setup);
		expect(setup.captureCharFrame()).toContain("episode-30");

		setIndex(1);
		await settle(setup);
		expect(setup.captureCharFrame()).toContain("episode-1");
		expect(setup.captureCharFrame()).not.toContain("episode-30");

		setIndex(38);
		await settle(setup);
		expect(setup.captureCharFrame()).toContain("episode-38");
		setup.renderer.destroy();
	});
});

describe("DebugPopup (rendered)", () => {
	it("clicking a row moves the debug menu selection", async () => {
		const messages = Array.from({ length: 5 }, (_, n) => ({
			timestamp: 0,
			message: `debug-message-${n}`,
			type: "info" as const,
		}));
		const setup = await testRender(
			() => <DebugPopup visible={true} messages={messages} onClose={() => {}} />,
			{ width: 80, height: 30 },
		);
		await settle(setup);
		expect(state.debugMenuIndex).toBe(0);

		const lines = setup.captureCharFrame().split("\n");
		const row = lines.findIndex((line) => line.includes("debug-message-3"));
		expect(row).toBeGreaterThanOrEqual(0);
		await setup.mockMouse.click(lines[row]!.indexOf("debug-message-3"), row);
		await settle(setup);
		expect(state.debugMenuIndex).toBe(3);
		setup.renderer.destroy();
	});
});
