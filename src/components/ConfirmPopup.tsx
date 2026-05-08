import { Colors } from "@/theme/colors";
import { hasNerdFont } from "@/utils/terminal";
import { Footer } from "./Footer";
import { Modal } from "./Modal";

export interface ConfirmPopupProps {
	visible: boolean;
	message?: string;
	fileCount?: number;
	onShortcutClick?: (key: string) => void;
}

export function ConfirmPopup(props: ConfirmPopupProps) {
	const message = () =>
		props.message ??
		`Are you sure you want to delete ${props.fileCount ?? "the selected"} file(s)?`;

	return (
		<Modal
			title={hasNerdFont() ? " Confirm Delete" : " Confirm Delete"}
			visible={props.visible}
			width={50}
		>
			<box flexDirection='column' alignItems='center' gap={1}>
				<text style={{ fg: Colors.text.primary }}>{message()}</text>

				<Footer
					shortcuts={[
						[
							{ key: "y/enter", label: "yes" },
							{ key: "n/esc", label: "no" },
						],
					]}
					onShortcutClick={props.onShortcutClick}
				/>
			</box>
		</Modal>
	);
}
