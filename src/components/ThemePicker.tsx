import { createEffect } from "solid-js";
import type { useAppLogic } from "@/hooks/useAppLogic";
import { actions, state } from "@/store";
import { setTheme, Themes } from "@/theme/colors";
import { Selector } from "./Selector";

interface ThemePickerProps {
	logic: ReturnType<typeof useAppLogic>;
	onShortcutClick?: (key: string) => void;
}

export function ThemePicker(props: ThemePickerProps) {
	const themeNames = Themes;

	// Sync theme preview with selected index in store
	createEffect(() => {
		if (state.appView === "themeSelection") {
			const themeName = themeNames[state.themeMenuIndex];
			if (themeName) {
				setTheme(themeName);
			}
		}
	});

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
			onIndexChange={(index) => actions.setThemeMenuIndex(index)}
			formatItem={(name) => ({ name })}
			onSelect={handleSelect}
			onClose={handleClose}
			onShortcutClick={props.onShortcutClick}
		/>
	);
}
