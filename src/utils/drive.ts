import type { Drive } from "@/types/drive";
import { formatBytes } from "@/utils/formatting";

/**
 * Formats drive info for display
 * e.g., "WALKMAN (15.2 GB free)"
 */
export function formatDriveInfo(drive: Drive): string {
	return `${drive.name} (${formatBytes(drive.freeSpace)} free)`;
}
