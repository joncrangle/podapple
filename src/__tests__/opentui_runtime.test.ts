import { createComponent } from "solid-js";
import { Portal, testRender } from "@opentui/solid";
import { describe, expect, it } from "bun:test";
import { Spinner } from "@/components/Spinner";

describe("OpenTUI Solid 2 runtime", () => {
	it("mounts and disposes a renderer root", async () => {
		const setup = await testRender(() => null);

		expect(setup.renderer).toBeDefined();
		setup.renderer.destroy();
	});

	it("mounts and disposes components with settle-phase cleanup", async () => {
		const setup = await testRender(() => createComponent(Spinner, { variant: "bouncingBall" }));

		expect(setup.renderer).toBeDefined();
		setup.renderer.destroy();
	});

	it("mounts and disposes portals with render-phase cleanup", async () => {
		const setup = await testRender(() =>
			createComponent(Portal, {
				children: createComponent(Spinner, { variant: "bouncingBall" }),
			}),
		);

		expect(setup.renderer).toBeDefined();
		setup.renderer.destroy();
	});
});
