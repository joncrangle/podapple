import { describe, expect, it } from "bun:test";
import { Result } from "effect";
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
			const result = Result.getOrThrow(parsePlist(xml)) as PlistDict;
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
			const result = Result.getOrThrow(parsePlist(xml)) as PlistDict;
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
			const result = Result.getOrThrow(parsePlist(xml)) as PlistDict;
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
			const result = Result.getOrThrow(parsePlist(xml)) as PlistDict;
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
			const result = Result.getOrThrow(parsePlist(xml)) as PlistDict;
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
			const result = Result.getOrThrow(parsePlist(xml)) as PlistDict;

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
			const result = Result.getOrThrow(parsePlist(xml)) as PlistDict;
			expect(getPlistString(result, "Name")).toBe("Tom & Jerry's Drive");
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

	describe("hardening", () => {
		const wrap = (body: string) => `<plist version="1.0">${body}</plist>`;
		const parse = (body: string) => Result.getOrThrow(parsePlist(wrap(body))) as PlistDict;

		it("does not double-decode entities", () => {
			const dict = parse("<dict><key>K</key><string>&amp;lt; &amp;amp; &amp;#65;</string></dict>");
			expect(dict.K).toBe("&lt; &amp; &#65;");
		});

		it("decodes the named entities", () => {
			const dict = parse(
				"<dict><key>K</key><string>a &lt;b&gt; &amp; &quot;c&quot; &apos;d&apos;</string></dict>",
			);
			expect(dict.K).toBe("a <b> & \"c\" 'd'");
		});

		it("decodes decimal and hex numeric entities", () => {
			const dict = parse("<dict><key>K</key><string>&#65;&#x42;&#x1F600;</string></dict>");
			expect(dict.K).toBe("AB\u{1F600}");
		});

		it("leaves out-of-range numeric entities as written", () => {
			const dict = parse("<dict><key>K</key><string>&#x110000;&#xD800;</string></dict>");
			expect(dict.K).toBe("&#x110000;&#xD800;");
		});

		it("decodes entities at the top level too", () => {
			expect(Result.getOrThrow(parsePlist(wrap("<string>&amp;lt;</string>")))).toBe("&lt;");
		});

		it("parses reals with exponents and signs", () => {
			const dict = parse(
				"<dict><key>A</key><real>1.5e3</real><key>B</key><real>-2E-2</real><key>C</key><real>+4</real><key>D</key><real>.5</real><key>E</key><real>3.</real></dict>",
			);
			expect(dict.A).toBe(1500);
			expect(dict.B).toBe(-0.02);
			expect(dict.C).toBe(4);
			expect(dict.D).toBe(0.5);
			expect(dict.E).toBe(3);
		});

		it("parses a top-level real with an exponent", () => {
			expect(Result.getOrThrow(parsePlist(wrap("<real>1e2</real>")))).toBe(100);
		});

		it("skips one unparseable value without dropping the remaining keys", () => {
			const dict = parse(
				"<dict><key>Before</key><string>x</string><key>Bad</key><weird>?</weird><key>After</key><integer>7</integer><key>Last</key><true/></dict>",
			);
			expect(dict.Before).toBe("x");
			expect("Bad" in dict).toBe(false);
			expect(dict.After).toBe(7);
			expect(dict.Last).toBe(true);
		});

		it("skips an unparseable final value", () => {
			const dict = parse("<dict><key>A</key><integer>1</integer><key>Bad</key><weird/></dict>");
			expect(dict).toEqual({ A: 1 });
		});

		it("parses self-closing strings as empty", () => {
			const dict = parse(
				"<dict><key>A</key><string/><key>B</key><string /><key>C</key><integer>1</integer></dict>",
			);
			expect(dict.A).toBe("");
			expect(dict.B).toBe("");
			expect(dict.C).toBe(1);
			expect(Result.getOrThrow(parsePlist(wrap("<string/>")))).toBe("");
		});

		it("parses self-closing strings inside arrays", () => {
			const arr = Result.getOrThrow(parsePlist(wrap("<array><string/><string>a</string></array>")));
			expect(arr).toEqual(["", "a"]);
		});
	});
});
