import { describe, expect, test } from "bun:test";
import { Colors, Palette } from "@/theme/colors";

describe("theme/colors", () => {
	test("exports palette with required semantic constants", () => {
		expect(Palette().bgBase).toBeDefined();
		expect(Palette().bgSurface).toBeDefined();
		expect(Palette().bgElement).toBeDefined();
		expect(Palette().bgHeader).toBeDefined();
		expect(Palette().fgBase).toBeDefined();
		expect(Palette().fgSub).toBeDefined();
		expect(Palette().fgDim).toBeDefined();
		expect(Palette().borderBase).toBeDefined();
		expect(Palette().borderFocus).toBeDefined();
		expect(Palette().itemFocus).toBeDefined();
		expect(Palette().itemSelect).toBeDefined();
		expect(Palette().itemMarker).toBeDefined();
		expect(Palette().progress).toBeDefined();
		expect(Palette().keyBind).toBeDefined();
		expect(Palette().statError).toBeDefined();
		expect(Palette().statWarn).toBeDefined();
		expect(Palette().statSuccess).toBeDefined();
		expect(Palette().statInfo).toBeDefined();
	});

	test("all palette colors are valid hex codes or keywords", () => {
		// Matches hex codes (#123456), ANSI names (blue, red), or transparent/white keywords
		const colorPattern = /^(#[0-9a-fA-F]{6}|[a-z]+(-[a-z]+)*)$/;
		for (const color of Object.values(Palette())) {
			if (color !== undefined) {
				expect(color).toMatch(colorPattern);
			}
		}
	});

	test("semantic color object is defined and structured", () => {
		expect(Colors.background).toBe(Palette().bgBase);
		expect(Colors.foreground).toBe(Palette().fgBase);

		// Categories exist
		expect(Colors.text).toBeDefined();
		expect(Colors.border).toBeDefined();
		expect(Colors.list).toBeDefined();
		expect(Colors.header).toBeDefined();
		expect(Colors.popup).toBeDefined();
		expect(Colors.progressBar).toBeDefined();
		expect(Colors.footer).toBeDefined();
		expect(Colors.status).toBeDefined();
	});

	test("semantic mappings are correct", () => {
		expect(Colors.text.error).toBe(Palette().statError);
		expect(Colors.text.success).toBe(Palette().statSuccess);
		expect(Colors.text.warning).toBe(Palette().statWarn);
		expect(Colors.text.accent).toBe(Palette().itemFocus);

		// Status
		expect(Colors.status.error).toBe(Palette().statError);
		expect(Colors.status.drive).toBe(Palette().itemSelect);
		expect(Colors.status.app).toBe(Palette().statInfo);
	});
});
