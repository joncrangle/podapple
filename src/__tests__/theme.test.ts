import { describe, expect, test } from "bun:test";
import { Colors, Palette } from "@/theme/colors";

describe("theme/colors", () => {
  test("exports palette with required color constants", () => {
    expect(Palette.bg).toBeDefined();
    expect(Palette.bgLight).toBeDefined();
    expect(Palette.bgLighter).toBeDefined();
    expect(Palette.fg).toBeDefined();
    expect(Palette.fgDim).toBeDefined();
    expect(Palette.red).toBeDefined();
    expect(Palette.green).toBeDefined();
    expect(Palette.yellow).toBeDefined();
    expect(Palette.blue).toBeDefined();
    expect(Palette.purple).toBeDefined();
    expect(Palette.pink).toBeDefined();
    expect(Palette.accent).toBeDefined();
  });

  test("all palette colors are valid hex codes", () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const color of Object.values(Palette)) {
      expect(color).toMatch(hexPattern);
    }
  });

  test("semantic color object is defined and structured", () => {
    expect(Colors.background).toBe(Palette.bg);
    expect(Colors.foreground).toBe(Palette.fg);

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
    expect(Colors.text.error).toBe(Palette.red);
    expect(Colors.text.success).toBe(Palette.green);
    expect(Colors.text.warning).toBe(Palette.yellow);
    expect(Colors.text.accent).toBe(Palette.purple);

    // Status
    expect(Colors.status.error).toBe(Palette.red);
    expect(Colors.status.drive).toBe(Palette.accent);
    expect(Colors.status.app).toBe(Palette.blue);
  });
});
