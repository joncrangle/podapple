import { describe, expect, it } from "bun:test";
import { Either } from "effect";
import {
  getPlistBoolean,
  getPlistNumber,
  getPlistString,
  type PlistDict,
  parsePlist,
} from "@/utils/plist";

describe("Plist Parser", () => {
  describe("parsePlist", () => {
    it("parses simple string values", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>VolumeName</key>
  <string>WALKMAN</string>
</dict>
</plist>`;
      const result = Either.getOrThrow(parsePlist(xml)) as PlistDict;
      expect(getPlistString(result, "VolumeName")).toBe("WALKMAN");
    });

    it("parses integer values", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>TotalSize</key>
  <integer>32000000000</integer>
  <key>FreeSpace</key>
  <integer>16000000000</integer>
</dict>
</plist>`;
      const result = Either.getOrThrow(parsePlist(xml)) as PlistDict;
      expect(getPlistNumber(result, "TotalSize")).toBe(32000000000);
      expect(getPlistNumber(result, "FreeSpace")).toBe(16000000000);
    });

    it("parses boolean values", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Internal</key>
  <false/>
  <key>Removable</key>
  <true/>
</dict>
</plist>`;
      const result = Either.getOrThrow(parsePlist(xml)) as PlistDict;
      expect(getPlistBoolean(result, "Internal")).toBe(false);
      expect(getPlistBoolean(result, "Removable")).toBe(true);
    });

    it("parses nested dict values", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>DriveInfo</key>
  <dict>
    <key>Name</key>
    <string>USB Drive</string>
    <key>Size</key>
    <integer>1000000</integer>
  </dict>
</dict>
</plist>`;
      const result = Either.getOrThrow(parsePlist(xml)) as PlistDict;
      const driveInfo = result.DriveInfo as PlistDict;
      expect(driveInfo).toBeDefined();
      expect(getPlistString(driveInfo, "Name")).toBe("USB Drive");
      expect(getPlistNumber(driveInfo, "Size")).toBe(1000000);
    });

    it("parses array values", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Volumes</key>
  <array>
    <string>WALKMAN</string>
    <string>SANSA</string>
  </array>
</dict>
</plist>`;
      const result = Either.getOrThrow(parsePlist(xml)) as PlistDict;
      const volumes = result.Volumes as string[];
      expect(volumes).toHaveLength(2);
      expect(volumes[0]).toBe("WALKMAN");
      expect(volumes[1]).toBe("SANSA");
    });

    it("handles real diskutil output format", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>BusProtocol</key>
	<string>USB</string>
	<key>DeviceIdentifier</key>
	<string>disk4s1</string>
	<key>Ejectable</key>
	<true/>
	<key>Internal</key>
	<false/>
	<key>MountPoint</key>
	<string>/Volumes/WALKMAN</string>
	<key>Removable</key>
	<true/>
	<key>TotalSize</key>
	<integer>32212254720</integer>
	<key>VolumeFreeSpace</key>
	<integer>16106127360</integer>
	<key>VolumeName</key>
	<string>WALKMAN</string>
</dict>
</plist>`;
      const result = Either.getOrThrow(parsePlist(xml)) as PlistDict;

      expect(getPlistString(result, "BusProtocol")).toBe("USB");
      expect(getPlistString(result, "VolumeName")).toBe("WALKMAN");
      expect(getPlistString(result, "MountPoint")).toBe("/Volumes/WALKMAN");
      expect(getPlistBoolean(result, "Internal")).toBe(false);
      expect(getPlistBoolean(result, "Removable")).toBe(true);
      expect(getPlistBoolean(result, "Ejectable")).toBe(true);
      expect(getPlistNumber(result, "TotalSize")).toBe(32212254720);
      expect(getPlistNumber(result, "VolumeFreeSpace")).toBe(16106127360);
    });

    it("decodes XML entities in strings", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Name</key>
  <string>Tom &amp; Jerry&apos;s Drive</string>
</dict>
</plist>`;
      const result = Either.getOrThrow(parsePlist(xml)) as PlistDict;
      expect(getPlistString(result, "Name")).toBe("Tom & Jerry's Drive");
    });

    it("returns error for invalid plist", () => {
      const xml = "<invalid>xml</invalid>";
      const result = parsePlist(xml);
      expect(Either.isLeft(result)).toBe(true);
    });
  });

  describe("getPlist helpers", () => {
    const dict: PlistDict = {
      StringValue: "hello",
      NumberValue: 42,
      BoolValue: true,
      ArrayValue: [1, 2, 3],
      DictValue: { nested: "value" },
    };

    it("getPlistString returns string or undefined", () => {
      expect(getPlistString(dict, "StringValue")).toBe("hello");
      expect(getPlistString(dict, "NumberValue")).toBeUndefined();
      expect(getPlistString(dict, "Missing")).toBeUndefined();
    });

    it("getPlistNumber returns number or undefined", () => {
      expect(getPlistNumber(dict, "NumberValue")).toBe(42);
      expect(getPlistNumber(dict, "StringValue")).toBeUndefined();
      expect(getPlistNumber(dict, "Missing")).toBeUndefined();
    });

    it("getPlistBoolean returns boolean or undefined", () => {
      expect(getPlistBoolean(dict, "BoolValue")).toBe(true);
      expect(getPlistBoolean(dict, "StringValue")).toBeUndefined();
      expect(getPlistBoolean(dict, "Missing")).toBeUndefined();
    });
  });
});
