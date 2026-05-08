import type { AppView } from "@/types/keyboard";

const NAVIGATION_KEYS = new Set(["j", "k", "up", "down"]);

export function isNavigationKey(key: string): boolean {
	return NAVIGATION_KEYS.has(key.toLowerCase());
}

/**
 * Creates a condensed list of footer shortcuts for a given view.
 * Matches original podcasts-sync layout.
 */
export function getFooterShortcuts(
	view: AppView,
	debugEnabled = false,
): Array<Array<{ key: string; label: string }>> {
	const line1: Array<{ key: string; label: string }> = [];
	const line2: Array<{ key: string; label: string }> = [];

	switch (view) {
		case "main":
		case "normal":
		case "podcasts":
		case "episodes":
			line1.push(
				{ key: "↑/↓", label: "navigate" },
				{ key: "tab", label: "switch list" },
				{ key: "f", label: "drives" },
				{ key: "r", label: "refresh" },
			);

			if (debugEnabled) {
				line2.push({ key: "x", label: "debug" });
			}

			line2.push({ key: "ctrl+t", label: "change theme" }, { key: "q", label: "quit" });
			break;
		case "confirm":
		case "debug":
		case "drives":
		case "driveSelection":
		case "sync":
		case "syncing":
		case "themeSelection":
		case "transferring":
			line1.push({ key: "q", label: "quit" });
			line2.push({ key: "", label: "" });
			break;
	}

	return [line1, line2];
}
