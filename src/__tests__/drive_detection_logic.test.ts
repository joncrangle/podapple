import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import { parseActivityLine } from "../services/effects/DriveDetection";

describe("DriveDetection logic", () => {
  test("parseActivityLine - DiskAppeared", () => {
    const line = "***DiskAppeared          ('disk4s1', 'USB_DRIVE', 'MS-DOS FAT32')";
    const result = parseActivityLine(line);

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.type).toBe("Appeared");
      expect(result.value.bsdName).toBe("disk4s1");
    }
  });

  test("parseActivityLine - DiskDescriptionChanged (the fix)", () => {
    const line = "***DiskDescriptionChanged ('disk4s1', 'USB_DRIVE', 'MS-DOS FAT32')";
    const result = parseActivityLine(line);

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.type).toBe("Changed");
      expect(result.value.bsdName).toBe("disk4s1");
    }
  });

  test("parseActivityLine - DiskDisappeared", () => {
    const line = "***DiskDisappeared       ('disk4s1', 'USB_DRIVE', 'MS-DOS FAT32')";
    const result = parseActivityLine(line);

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.type).toBe("Disappeared");
      expect(result.value.bsdName).toBe("disk4s1");
    }
  });

  test("parseActivityLine - VolumeMount", () => {
    const line = "***VolumeMount           ('disk4s1', 'USB_DRIVE', 'MS-DOS FAT32')";
    const result = parseActivityLine(line);

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.type).toBe("Appeared");
      expect(result.value.bsdName).toBe("disk4s1");
    }
  });

  test("parseActivityLine - VolumeUnmount", () => {
    const line = "***VolumeUnmount         ('disk4s1', 'USB_DRIVE', 'MS-DOS FAT32')";
    const result = parseActivityLine(line);

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.type).toBe("Disappeared");
      expect(result.value.bsdName).toBe("disk4s1");
    }
  });

  test("parseActivityLine - Ignore other events", () => {
    const line = "***DiskAttributeChanged  ('disk4s1', 'USB_DRIVE', 'MS-DOS FAT32')";
    const result = parseActivityLine(line);

    expect(Option.isNone(result)).toBe(true);
  });

  test("parseActivityLine - Handle leading spaces", () => {
    const line = "  ***DiskAppeared ('disk2', '', '')";
    const result = parseActivityLine(line);

    expect(Option.isSome(result)).toBe(true);
    if (Option.isSome(result)) {
      expect(result.value.type).toBe("Appeared");
      expect(result.value.bsdName).toBe("disk2");
    }
  });
});
