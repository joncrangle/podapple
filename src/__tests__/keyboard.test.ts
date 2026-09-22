import { describe, expect, test } from "bun:test";
import { getFooterShortcuts } from "@/utils/keyboard";

describe("keyboard utilities", () => {
	describe("getFooterShortcuts", () => {
		test("should return two lines for normal view", () => {
			const shortcuts = getFooterShortcuts("normal");
			expect(shortcuts.length).toBe(2);
			expect(shortcuts[0]!.length).toBeGreaterThan(0);
			expect(shortcuts[1]!.length).toBeGreaterThan(0);
		});

		test("should return two lines for syncing view", () => {
			const shortcuts = getFooterShortcuts("syncing");
			expect(shortcuts.length).toBe(2);
			expect(shortcuts[0]![0]!.key).toBe("q");
		});

		test("should return two lines for normal view with debug enabled", () => {
			const shortcuts = getFooterShortcuts("normal", true);
			expect(shortcuts.length).toBe(2);
			expect(shortcuts[1]!.some((s) => s.key === "x")).toBe(true);
		});
	});
});
