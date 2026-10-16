import { mkdir, readFile } from "node:fs/promises";
import { readJson } from "fs-extra";
import { resolve } from "path";
import { writeJsonAtomic } from "../fs/atomicWrite";
import {
  acquireLock,
  processIdentity,
  releaseLock,
  type LockRecord,
} from "../git/fileLock";
import { ulid } from "../util/ulid";

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
 *
 * Writes are atomic (temp file + rename, `atomicWrite.ts`), so a reader never
 * sees a truncated file and takes it for "no settings" (38a review). A
 * read-modify-write goes through `updateSettings`, which also holds a
 * cross-process lock beside the file, so two writers (a mirror's
 * `PUT /api/settings/site`, the theme form, `/make`'s staples) never lose
 * each other's keys.
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
  await writeJsonAtomic(getSettingsFilePath(), settings, { spaces: 2 });
}

/** Seconds, not minutes: an update is one read and one write. */
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_ID_KEY = "settingsWriteId" as const;

/**
 * The settings for a read-modify-write: a missing file is `{}`, but one that
 * does not parse is an error — writing `update`'s answer over it would drop
 * every key the file held.
 */
async function readSettingsStrict<T extends object>(
  path: string,
): Promise<Partial<T>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return JSON.parse(raw) as Partial<T>;
}

/**
 * Read, change and write `settings.json` under a cross-process lock
 * (`fileLock.ts`, the write lock's primitive) at `.settings.json.lock`
 * beside it. `update` answers the new settings, or `undefined` to leave the
 * file as it is (nothing changed: no write). Resolves with what the file
 * holds afterwards. Throws when the lock cannot be had within ten seconds,
 * or when the current file does not parse.
 */
export async function updateSettings<T extends object>(
  update: (
    current: Partial<T>,
  ) => Partial<T> | undefined | Promise<Partial<T> | undefined>,
): Promise<Partial<T>> {
  const path = getSettingsFilePath();
  const lockPath = resolve(getSettingsDirectory(), ".settings.json.lock");
  await mkdir(getSettingsDirectory(), { recursive: true });
  const id = ulid();
  const record: LockRecord & { [LOCK_ID_KEY]: string } = {
    ...processIdentity(),
    [LOCK_ID_KEY]: id,
  };
  await acquireLock(lockPath, record, {
    idKey: LOCK_ID_KEY,
    deadline: Date.now() + LOCK_TIMEOUT_MS,
    staleMs: LOCK_STALE_MS,
  });
  try {
    const current = await readSettingsStrict<T>(path);
    const next = await update(current);
    if (next === undefined) return current;
    await writeJsonAtomic(path, next, { spaces: 2 });
    return next;
  } finally {
    await releaseLock(lockPath, LOCK_ID_KEY, id);
  }
}
