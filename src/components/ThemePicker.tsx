import type { useAppLogic } from "@/hooks/useAppLogic";
import { actions, state } from "@/store";
import { previewThemeAt, setTheme, Themes } from "@/theme/colors";
import { Selector } from "./Selector";

interface ThemePickerProps {
	logic: ReturnType<typeof useAppLogic>;
	onShortcutClick?: (key: string) => void;
}

export function ThemePicker(props: ThemePickerProps) {
	const themeNames = Themes;

	const handleIndexChange = (index: number) => {
		actions.setThemeMenuIndex(index);
		previewThemeAt(index);
	};

	const handleSelect = (themeName: string) => {
		setTheme(themeName);
		props.logic.saveTheme(themeName);
		actions.setAppView("normal");
	};

	const handleClose = () => {
		// Revert to last saved theme
		setTheme(state.lastSavedTheme);
		actions.setAppView("normal");
	};

	return (
		<Selector
			title='Select Theme'
			visible={true}
			items={themeNames}
			selectedIndex={state.themeMenuIndex}
			onIndexChange={handleIndexChange}
			formatItem={(name) => ({ name })}
			onSelect={handleSelect}
			onClose={handleClose}
			onShortcutClick={props.onShortcutClick}
		/>
	);
}
