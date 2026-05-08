import { render, useTerminalDimensions } from "@opentui/solid";
import { createMemo, ErrorBoundary, Show } from "solid-js";
import { ConfirmPopup } from "@/components/ConfirmPopup";
import { DebugPopup } from "@/components/DebugPopup";
import { DriveSelector } from "@/components/DriveSelector";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ThemePicker } from "@/components/ThemePicker";
import { TransferPopup } from "@/components/TransferPopup";
import { useAppKeyboard } from "@/hooks/useAppKeyboard";
import { useAppLogic } from "@/hooks/useAppLogic";
import { actions, state } from "@/store";
import { Colors } from "@/theme/colors";
import { getFooterShortcuts } from "@/utils/keyboard";
import { DriveView } from "@/views/DriveView";
import { PodcastView } from "@/views/PodcastView";

if (typeof Bun === "undefined") {
	console.error("❌ Error: Runtime mismatch.");
	console.error(
		"This application requires the Bun runtime or should be run as a standalone binary.",
	);
	process.exit(1);
}

// Check for version flag
const args = Bun.argv;
if (args.includes("--version") || args.includes("-v")) {
	// Use the injected version from build or fallback to package.json for dev
	const version = process.env.VERSION || (await import("../package.json")).version;
	console.log(`podapple v${version}`);
	process.exit(0);
}

// ============================================================================
// Main App
// ============================================================================

/**
 * Main Application Component.
 * Orchestrates the overall layout, view transitions, and global popups.
 */
const App = () => {
	const logic = useAppLogic();
	const { handleAction } = useAppKeyboard(logic);
	const terminalDimensions = useTerminalDimensions();
	const debugEnabled = Bun.env.DEBUG === "true";

	const handleShortcutClick = (key: string) => {
		let cleanKey = key.toLowerCase();
		const isCtrl = cleanKey.startsWith("ctrl+");
		cleanKey = cleanKey.replace("ctrl+", "");

		// Map UI shortcut labels to internal key names used by handleAction
		if (cleanKey === "esc") cleanKey = "escape";
		if (cleanKey === "enter") cleanKey = "return";
		if (cleanKey === "↑") cleanKey = "up";
		if (cleanKey === "↓") cleanKey = "down";

		handleAction(cleanKey, isCtrl);
	};

	const driveInfo = createMemo(() => {
		const drive = state.currentDrive;
		if (!drive) return "";
		return `Drive: ${drive.name} > podcasts`;
	});

	const footerShortcuts = createMemo(() => {
		return getFooterShortcuts(state.appView, debugEnabled);
	});

	const layout = createMemo<{
		macWidth: number | `${number}%` | "auto";
		driveWidth: number | `${number}%` | "auto";
		macGrow: number;
		driveGrow: number;
	}>(() => {
		const width = terminalDimensions().width;
		if (width <= 100) {
			return {
				macWidth: state.focusedPane === "mac" ? "70%" : "30%",
				driveWidth: state.focusedPane === "drive" ? "70%" : "30%",
				macGrow: state.focusedPane === "mac" ? 7 : 3,
				driveGrow: state.focusedPane === "drive" ? 7 : 3,
			};
		}
		return {
			macWidth: "50%",
			driveWidth: "50%",
			macGrow: 1,
			driveGrow: 1,
		};
	});

	return (
		<box
			flexDirection='column'
			height={terminalDimensions().height}
			backgroundColor={Colors.background}
		>
			<Header
				driveInfo={driveInfo()}
				debugEnabled={debugEnabled}
				lastKey={state.lastKey}
				terminalDimensions={terminalDimensions()}
				onDriveClick={() => handleAction("f")}
				onDebugClick={() => handleAction("f1")}
			/>

			<Show when={state.errorMsg}>
				<box style={{ paddingLeft: 4 }}>
					<text style={{ fg: Colors.text.error }}>{state.errorMsg}</text>
				</box>
			</Show>

			<box flexDirection='row' flexGrow={1}>
				<PodcastView width={layout().macWidth} flexGrow={layout().macGrow} logic={logic} />
				<DriveView width={layout().driveWidth} flexGrow={layout().driveGrow} logic={logic} />
			</box>

			<Footer shortcuts={footerShortcuts()} onShortcutClick={handleShortcutClick} />

			<Show when={state.appView === "driveSelection"}>
				<DriveSelector
					drives={state.drives}
					selectedIndex={state.driveMenuIndex}
					visible={true}
					isScanning={state.isScanning}
					onSelect={(drive) => {
						actions.setCurrentDrive(drive);
						logic.loadDrivePodcasts(drive);
						actions.setAppView("normal");
					}}
					onClose={() => actions.setAppView("normal")}
					onShortcutClick={handleShortcutClick}
				/>
			</Show>

			<Show when={state.appView === "transferring" || state.appView === "syncing"}>
				<TransferPopup
					visible={true}
					currentFile={state.transferProgress.currentFile}
					filesDone={state.transferProgress.filesDone}
					totalFiles={state.transferProgress.totalFiles}
					bytesTransferred={state.transferProgress.bytesTransferred}
					totalBytes={state.transferProgress.totalBytes}
					speed={state.transferProgress.speed}
					onShortcutClick={handleShortcutClick}
				/>
			</Show>

			<Show when={state.appView === "confirm"}>
				<ConfirmPopup
					visible={true}
					fileCount={state.drivePodcasts.filter((ep) => ep.selected).length}
					onShortcutClick={handleShortcutClick}
				/>
			</Show>

			<Show when={state.appView === "debug"}>
				<DebugPopup
					visible={true}
					messages={state.debugMessages}
					onClose={() => actions.setAppView("normal")}
					onShortcutClick={handleShortcutClick}
				/>
			</Show>

			<Show when={state.appView === "themeSelection"}>
				<ThemePicker logic={logic} onShortcutClick={handleShortcutClick} />
			</Show>
		</box>
	);
};

const Root = () => {
	const terminalDimensions = useTerminalDimensions();
	return (
		<ErrorBoundary
			fallback={(err: Error) => (
				<box
					flexDirection='column'
					padding={1}
					height={terminalDimensions().height}
					backgroundColor={Colors.background}
				>
					<text style={{ fg: Colors.text.error }}>Fatal Error Occurred:</text>
					<box marginTop={1}>
						<text>{err.message}</text>
					</box>
					<box marginTop={1}>
						<text>Press Ctrl+C to exit.</text>
					</box>
				</box>
			)}
		>
			<App />
		</ErrorBoundary>
	);
};

render(Root, {
	targetFps: 30,
	exitOnCtrlC: false, // We handle Ctrl+C ourselves for proper cleanup
	useMouse: true,
});
