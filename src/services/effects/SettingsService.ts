import { homedir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { FileSystem } from "@/services/effects/FileSystem";
import { Logger } from "@/services/effects/Logger";

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
    const logger = yield* Logger;

    const loadSettings = Effect.gen(function* () {
      yield* logger.debug(`Loading settings from: ${SETTINGS_FILE}`);
      const result = yield* fs.readFile(SETTINGS_FILE).pipe(
        Effect.flatMap((data) =>
          Effect.try({
            try: () => {
              const text = new TextDecoder().decode(data);
              return JSON.parse(text) as Settings;
            },
            catch: (cause) => new Error(`Failed to parse settings: ${cause}`),
          }),
        ),
        Effect.catchAll(() => Effect.succeed(null)),
      );

      if (result) {
        yield* logger.info("Settings loaded successfully");
        return result;
      }

      yield* logger.info("Using default settings (could not load or parse settings file)");
      return { theme: "Catppuccin", favoriteDrives: [] } as Settings;
    });

    const saveSettings = (newSettings: Partial<Settings>) =>
      Effect.gen(function* () {
        yield* logger.debug(`Saving settings to: ${SETTINGS_FILE}`);
        const currentSettings = yield* loadSettings;
        const mergedSettings = { ...currentSettings, ...newSettings };

        const dirExists = yield* fs.exists(SETTINGS_DIR);
        if (!dirExists) {
          yield* logger.debug(`Creating settings directory: ${SETTINGS_DIR}`);
          yield* fs.mkdir(SETTINGS_DIR);
        }
        const settingsWithSchema = {
          $schema: SCHEMA_URL,
          ...mergedSettings,
        };
        const data = new TextEncoder().encode(JSON.stringify(settingsWithSchema, null, 2));
        yield* fs.writeFile(SETTINGS_FILE, data);
        yield* logger.info("Settings saved successfully");
      }).pipe(
        Effect.tapError((err) => logger.error("Failed to save settings", err)),
        Effect.catchAll(() => Effect.void),
      );

    return SettingsService.of({
      loadSettings,
      saveSettings,
    });
  }),
);
