import { createSignal, createStore, reconcile } from "solid-js";
import { createTheme, Palettes, type ThemePalette } from "./themes";

export type Theme = ReturnType<typeof createTheme>;
export const Themes = Object.keys(Palettes) as (keyof typeof Palettes)[];
export const [Colors, setColors] = createStore<Theme>(createTheme(Palettes.Catppuccin));
export const [Palette, setPalette] = createSignal<ThemePalette>(Palettes.Catppuccin);

/**
 * Updates the reactive Colors store with the values from the corresponding theme.
 */
export function setTheme(themeName: string) {
	if (Object.hasOwn(Palettes, themeName)) {
		const name = themeName as keyof typeof Palettes;
		const palette = Palettes[name];
		const theme = createTheme(palette);

		setColors(reconcile(theme));
		setPalette(palette);
	}
}

export function previewThemeAt(index: number): void {
	const themeName = Themes[index];
	if (themeName) setTheme(themeName);
}
