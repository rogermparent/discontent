import { readJson, outputJSON } from "fs-extra";
import { resolve } from "path";

/**
 * The owner-settings store: where `settings.json` lives, and how to read and
 * write it.
 *
 * This was recipe's `editor/src/settings/index.ts`, which contained no recipe
 * knowledge except one field name. It is generic over the settings *shape*
 * rather than declaring one, for a concrete reason: `Settings` wants a `theme`
 * typed as `Theme`, which lives in `@discontent/component-library` — and
 * component-library already depends on this package, so importing it back would
 * be a cycle. Each site declares its own shape and binds it here once.
 *
 * The read is deliberately forgiving. A missing or unparseable settings file
 * means "no settings yet", not an error: this is read during layout render on
 * every request, and a first-run site has no file at all.
 */
export function getSettingsDirectory(): string {
  if (process.env.SETTINGS_DIRECTORY) return process.env.SETTINGS_DIRECTORY;
  if (process.env.TEST_MODE) return resolve("test-settings");
  return resolve("settings");
}

export function getSettingsFilePath(): string {
  return resolve(getSettingsDirectory(), "settings.json");
}

export async function readSettings<T extends object>(): Promise<Partial<T>> {
  try {
    return await readJson(getSettingsFilePath());
  } catch {
    return {} as Partial<T>;
  }
}

export async function writeSettings<T extends object>(
  settings: T,
): Promise<void> {
  await outputJSON(getSettingsFilePath(), settings, { spaces: 2 });
}
