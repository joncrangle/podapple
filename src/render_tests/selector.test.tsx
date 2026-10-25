import { createSignal } from "solid-js";
import { testRender } from "@opentui/solid";
import { describe, expect, it, mock } from "bun:test";
import { Selector } from "@/components/Selector";

const items = Array.from({ length: 40 }, (_, n) => ({ name: `item-${n}` }));

const mount = async (selectedIndex: () => number, extra: Record<string, unknown> = {}) => {
	const setup = await testRender(
		() => (
			<Selector
				title='Pick'
				visible={true}
				items={items}
				selectedIndex={selectedIndex()}
				formatItem={(item) => ({ name: item.name })}
				onSelect={() => {}}
				onClose={() => {}}
				{...extra}
			/>
		),
		{ width: 60, height: 30 },
	);
	await setup.renderOnce();
	await setup.renderOnce();
	return setup;
};

describe("Selector (rendered)", () => {
	it("scrolls the initially selected row into view on open", async () => {
		const setup = await mount(() => 30);
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain("item-30");
		setup.renderer.destroy();
	});

	it("keeps the selection visible as the index moves down and back up", async () => {
		const [index, setIndex] = createSignal(0);
		const setup = await mount(index);
		expect(setup.captureCharFrame()).toContain("item-0");
		setIndex(25);
		await setup.renderOnce();
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain("item-25");
		expect(setup.captureCharFrame()).not.toContain("item-0 ");
		setIndex(2);
		await setup.renderOnce();
		await setup.renderOnce();
		expect(setup.captureCharFrame()).toContain("item-2");
		setup.renderer.destroy();
	});

	it("clicking the footer esc closes without forwarding esc to the parent", async () => {
		const onClose = mock(() => {});
		const onShortcutClick = mock((_key: string) => {});
		const setup = await mount(() => 0, { onClose, onShortcutClick });
		const frame = setup.captureCharFrame().split("\n");
		const row = frame.findIndex((line) => line.includes("esc"));
		expect(row).toBeGreaterThanOrEqual(0);
		await setup.mockMouse.click(frame[row]!.indexOf("esc") + 1, row);
		await setup.renderOnce();
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onShortcutClick).not.toHaveBeenCalledWith("esc");
		setup.renderer.destroy();
	});
});
