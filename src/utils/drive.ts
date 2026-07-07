import type { Drive } from "@/types/drive";
import { formatBytes } from "@/utils/formatting";

/**
 * Formats drive info for display
 * e.g., "WALKMAN (15.2 GB free)"
 */
export function formatDriveInfo(drive: Drive): string {
	const freeText = drive.freeSpace >= 0 ? `${formatBytes(drive.freeSpace)} free` : "unknown free space";
	return `${drive.name} (${freeText})`;
}
