import { homedir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { FileSystem } from "@/services/effects/FileSystem";

export interface Settings {
  theme: string;
  favoriteDrives?: string[];
}

const SETTINGS_DIR = join(homedir(), ".config", "podapple");
const SETTINGS_FILE = join(SETTINGS_DIR, "podapple.jsonc");
const SCHEMA_URL =
  "https://raw.githubusercontent.com/joncrangle/podapple/main/schemas/podapple.schema.json";

/**
 * SettingsService Service Tag
 */
export class SettingsService extends Context.Tag("SettingsService")<
  SettingsService,
  {
    /** Loads application settings from ~/.config/podapple/podapple.jsonc */
    readonly loadSettings: Effect.Effect<Settings>;
    /** Saves application settings to ~/.config/podapple/podapple.jsonc */
    readonly saveSettings: (settings: Partial<Settings>) => Effect.Effect<void>;
  }
>() {}

/**
 * Live implementation of SettingsService.
 */
export const SettingsServiceLive = Layer.effect(
  SettingsService,
  Effect.gen(function* () {
    const fs = yield* FileSystem;

    const loadSettings = fs.readFile(SETTINGS_FILE).pipe(
      Effect.map((data) => {
        try {
          const text = new TextDecoder().decode(data);
          return JSON.parse(text) as Settings;
        } catch (_e) {
          return { theme: "Catppuccin Mocha", favoriteDrives: [] };
        }
      }),
      Effect.catchAll(() => Effect.succeed({ theme: "Catppuccin Mocha", favoriteDrives: [] })),
    );

    const saveSettings = (newSettings: Partial<Settings>) =>
      Effect.gen(function* () {
        const currentSettings = yield* loadSettings;
        const mergedSettings = { ...currentSettings, ...newSettings };

        const dirExists = yield* fs.exists(SETTINGS_DIR);
        if (!dirExists) {
          yield* fs.mkdir(SETTINGS_DIR);
        }
        const settingsWithSchema = {
          $schema: SCHEMA_URL,
          ...mergedSettings,
        };
        const data = new TextEncoder().encode(JSON.stringify(settingsWithSchema, null, 2));
        yield* fs.writeFile(SETTINGS_FILE, data);
      }).pipe(Effect.catchAll(() => Effect.void));

    return SettingsService.of({
      loadSettings,
      saveSettings,
    });
  }),
);
