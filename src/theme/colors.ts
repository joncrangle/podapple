import { createStore, reconcile } from "solid-js/store";
import {
  createTheme,
  KanagawaPalette,
  MochaPalette,
  NordPalette,
  type ThemePalette,
  TokyoNightPalette,
} from "./themes";

/**
 * Theme definition
 */

type Theme = ReturnType<typeof createTheme>;

const themePalettes: Record<string, ThemePalette> = {
  "Catppuccin Mocha": MochaPalette,
  "Tokyo Night": TokyoNightPalette,
  Kanagawa: KanagawaPalette,
  Nord: NordPalette,
};

// Export a reactive Colors object
export const [Colors, setColors] = createStore<Theme>(createTheme(MochaPalette));

// Export the current palette
export let Palette: ThemePalette = MochaPalette;

/**
 * Updates the reactive Colors store with the values from the corresponding theme.
 * @param themeName - The name of the theme to set (e.g., "Catppuccin Mocha", "Tokyo Night", "Kanagawa", "Nord").
 */
export function setTheme(themeName: string) {
  if (themeName in themePalettes) {
    const palette = themePalettes[themeName]!;
    const theme = createTheme(palette);
    setColors(reconcile(theme));
    Palette = palette;
  }
}
