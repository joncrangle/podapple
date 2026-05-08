import { describe, expect, test } from "bun:test";
import type { Drive } from "@/types/drive";
import { formatDriveInfo } from "@/utils/drive";

describe("formatDriveInfo", () => {
	test("formats drive with name and free space", () => {
		const drive: Drive = {
			id: "1",
			name: "WALKMAN",
			bsdName: "disk2s1",
			mountPoint: "/Volumes/WALKMAN",
			totalSpace: 32 * 1024 * 1024 * 1024,
			freeSpace: 15.2 * 1024 * 1024 * 1024,
		};
		expect(formatDriveInfo(drive)).toBe("WALKMAN (15.2 GB free)");
	});

	test("formats drive with small free space", () => {
		const drive: Drive = {
			id: "2",
			name: "USB",
			bsdName: "disk3s1",
			mountPoint: "/Volumes/USB",
			totalSpace: 8 * 1024 * 1024 * 1024,
			freeSpace: 256 * 1024 * 1024,
		};
		expect(formatDriveInfo(drive)).toBe("USB (256.0 MB free)");
	});
});
