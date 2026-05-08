import { describe, expect, test } from "bun:test";
import { getSpinnerFrame } from "@/utils/spinners";

describe("progress utilities", () => {
	describe("getSpinnerFrame", () => {
		const spinnerChars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

		test("returns first frame at index 0", () => {
			expect(getSpinnerFrame(0)).toBe("⠋");
		});

		test("returns second frame at index 1", () => {
			expect(getSpinnerFrame(1)).toBe("⠙");
		});

		test("cycles through all frames", () => {
			for (let i = 0; i < spinnerChars.length; i++) {
				expect(getSpinnerFrame(i)).toBe(spinnerChars[i] as string);
			}
		});

		test("wraps around after last frame", () => {
			expect(getSpinnerFrame(10)).toBe("⠋");
			expect(getSpinnerFrame(11)).toBe("⠙");
		});

		test("handles large index values", () => {
			expect(getSpinnerFrame(100)).toBe("⠋");
		});
	});
});
