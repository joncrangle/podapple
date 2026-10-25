import { homedir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer, Option } from "effect";
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
export class SettingsService extends Context.Service<
	SettingsService,
	{
		/** Loads application settings from ~/.config/podapple/podapple.jsonc */
		readonly loadSettings: Effect.Effect<Settings>;
		/** Saves application settings to ~/.config/podapple/podapple.jsonc */
		readonly saveSettings: (settings: Partial<Settings>) => Effect.Effect<void, Error>;
	}
>()("SettingsService") {}

/**
 * Live implementation of SettingsService.
 */
export const SettingsServiceLive = Layer.effect(
	SettingsService,
	Effect.gen(function* () {
		const fs = yield* FileSystem;
		const logger = yield* Logger;

		const DEFAULTS: Settings = { theme: "Catppuccin", favoriteDrives: [] };

		/**
		 * Reads the settings file. A missing file is `None` (use defaults); a file
		 * that exists but cannot be read or parsed is an error, so callers that
		 * would overwrite it can refuse.
		 */
		const readSettings = Effect.gen(function* () {
			if (!(yield* fs.exists(SETTINGS_FILE))) return Option.none<Settings>();
			const data = yield* fs
				.readFile(SETTINGS_FILE)
				.pipe(Effect.mapError((cause) => new Error(`Failed to read settings: ${cause.path}`)));
			const parsed = yield* Effect.try({
				try: () => {
					const text = new TextDecoder().decode(data);
					// Strip single-line and multi-line comments from JSONC
					const cleanJson = text.replace(
						/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
						(m, g) => (g ? "" : m),
					);
					const value: unknown = JSON.parse(cleanJson);
					if (typeof value !== "object" || value === null || Array.isArray(value)) {
						throw new Error("expected a JSON object");
					}
					return value as Settings;
				},
				catch: (cause) => new Error(`Failed to parse settings: ${cause}`),
			});
			return Option.some(parsed);
		});

		const loadSettings = Effect.gen(function* () {
			yield* logger.debug(`Loading settings from: ${SETTINGS_FILE}`);
			const result = yield* readSettings.pipe(
				Effect.tapError((err) => logger.error("Could not load settings, using defaults", err)),
				Effect.catch(() => Effect.succeed(Option.none<Settings>())),
			);

			if (Option.isSome(result)) {
				yield* logger.info("Settings loaded successfully");
				return result.value;
			}

			yield* logger.info("Using default settings (could not load or parse settings file)");
			return { ...DEFAULTS } as Settings;
		});

		const saveSettings = (newSettings: Partial<Settings>) =>
			Effect.gen(function* () {
				yield* logger.debug(`Saving settings to: ${SETTINGS_FILE}`);
				// Strict read: if the file exists but is unreadable/corrupt, fail rather
				// than overwrite the user's (possibly hand-edited) settings with defaults.
				const current = yield* readSettings;
				const mergedSettings = { ...(Option.getOrUndefined(current) ?? DEFAULTS), ...newSettings };

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
				// Write to a temp file and rename so a crash mid-write never leaves a
				// truncated settings file behind.
				const tmpFile = `${SETTINGS_FILE}.${process.pid}.tmp`;
				yield* fs.writeFile(tmpFile, data);
				yield* fs
					.rename(tmpFile, SETTINGS_FILE)
					.pipe(Effect.tapError(() => fs.remove(tmpFile).pipe(Effect.ignore)));
				yield* logger.info("Settings saved successfully");
			}).pipe(
				Effect.tapError((err) => logger.error("Failed to save settings", err)),
				Effect.mapError((err) => new Error(`Failed to save settings: ${err}`)),
			);

		return SettingsService.of({
			loadSettings,
			saveSettings,
		});
	}),
);
