import { describe, expect, it } from "bun:test";

/**
 * The component render tests in src/render_tests need Solid's client build,
 * which `bun test` does not wire up from bunfig (it resolves the server build,
 * where effects never run and nothing renders), and which breaks the
 * store-oriented suites if enabled globally. Run them in a child process with
 * the OpenTUI Solid preload so they exercise real rendering.
 */
describe("component render suites", () => {
	it("pass under the OpenTUI Solid preload", async () => {
		const proc = Bun.spawn(
			["bun", "test", "--preload", "@opentui/solid/preload", "./src/render_tests"],
			{ cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (code !== 0) console.error(stdout + stderr);
		expect(code).toBe(0);
	}, 60_000);
});
