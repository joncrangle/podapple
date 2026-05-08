import { actions, state } from "@/store";
import type { Drive } from "@/types/drive";
import { formatDriveInfo } from "@/utils/drive";
import { hasNerdFont } from "@/utils/terminal";
import { Selector } from "./Selector";

export interface DriveSelectorProps {
	drives: Drive[];
	selectedIndex: number;
	visible: boolean;
	isScanning?: boolean;
	onSelect: (drive: Drive) => void;
	onClose: () => void;
	onShortcutClick?: (key: string) => void;
	onToggleFavorite?: (drive: Drive) => void;
}

/**
 * Modal component for selecting a drive from a list of detected volumes.
 * Highlights favorite drives and supports toggling favorites.
 */
export function DriveSelector(props: DriveSelectorProps) {
	return (
		<Selector
			title={hasNerdFont() ? " Select Drive" : "Select Drive"}
			visible={props.visible}
			loading={props.isScanning}
			loadingText='Scanning for drives...'
			items={props.drives}
			emptyText='No external drives found'
			formatItem={(drive) => ({
				name: `${formatDriveInfo(drive)}${state.favoriteDrives.includes(drive.id) ? " ⭐" : ""}`,
			})}
			onSelect={props.onSelect}
			onClose={props.onClose}
			onShortcutClick={props.onShortcutClick}
			selectedIndex={props.selectedIndex}
			onIndexChange={(index) => actions.setDriveMenuIndex(index)}
			extraShortcuts={[{ key: "ctrl+f", label: "favorite" }]}
		/>
	);
}
