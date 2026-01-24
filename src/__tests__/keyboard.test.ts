import { describe, expect, test } from "bun:test";
import { getFooterShortcuts, isNavigationKey } from "@/utils/keyboard";

describe("keyboard utilities", () => {
  describe("isNavigationKey", () => {
    test("should return true for j key", () => {
      expect(isNavigationKey("j")).toBe(true);
    });

    test("should return true for k key", () => {
      expect(isNavigationKey("k")).toBe(true);
    });

    test("should return true for up arrow", () => {
      expect(isNavigationKey("up")).toBe(true);
    });

    test("should return true for down arrow", () => {
      expect(isNavigationKey("down")).toBe(true);
    });

    test("should return false for tab (no longer navigation key)", () => {
      expect(isNavigationKey("tab")).toBe(false);
    });

    test("should return false for non-navigation keys", () => {
      expect(isNavigationKey("q")).toBe(false);
      expect(isNavigationKey("s")).toBe(false);
      expect(isNavigationKey("enter")).toBe(false);
      expect(isNavigationKey("escape")).toBe(false);
    });
  });

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
