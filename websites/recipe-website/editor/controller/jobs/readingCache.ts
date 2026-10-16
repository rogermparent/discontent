/**
 * The last model reading of an import, kept in the job store (38c; the 36e
 * backlog row "Re-reading after a several-recipe refusal").
 *
 * `recipes import <video>` with neither `--all` nor `--pick` reads every
 * recipe (60–80 s on qwen3:8b), refuses (`usage`, naming them), and the
 * retry with `--pick "Stuffing"` used to read them all again. Now the
 * reading the first job made is kept under its **reading key** — the job
 * spec's reading half (the URL, or the pasted text and its source; the
 * `llm` mode; `asOne`), the model (its name, API and server) and the
 * **reading version** (a hash of every prompt and schema the reading uses,
 * and `READING_CODE_VERSION` for the code around them) — so a changed model
 * or prompt never meets an old reading. What only decides what to *do* with
 * a reading (`pick`, `all`, `dryRun`, tags, slug, name) is not in the key:
 * a dry run, a refusal and the `--pick` after them share one reading.
 *
 * Bounds (38-Dc6): one file per key, `<jobs dir>/readings/<key>.json`,
 * overwritten by the next reading; reused for `READING_MAX_AGE_MS` (half an
 * hour — the retry is minutes away, and a page or description edited since
 * should be read again); removed by the job store's prune (`pruneJobs`)
 * once older than that. Only a reading the model answered is kept: no model,
 * `off`, a failed call or a page's own schema leave nothing.
 *
 * Only the CLI, API and MCP import kinds (`import-url`, `import-text`, and
 * `import-photo` by its transcription) use it; the form never re-reads (its
 * picker sends the readings back).
 *
 * **`fresh`** (39a: `--fresh`, `fresh: true`, "Read it again" on Retry)
 * skips the read — no kept reading is looked at — and still saves the new
 * reading, so the `--pick` after a fresh run reuses that one.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "@discontent/cms/fs/atomicWrite";

/** How long a kept reading is reused, and kept. */
export const READING_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Bump when the code that turns the model's answers into a reading changes
 * what it makes — the tidy rules, the grounding, the split's cutting — so a
 * kept reading made by the old code is not reused. Prompt and schema edits
 * change the key by themselves (`readingVersion`).
 */
export const READING_CODE_VERSION = "39a-1";

/** The directory the readings live in, inside the job store. */
export const READINGS_DIR = "readings";

/** A JSON value with its object keys sorted: one spelling per value. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** A reading key: the hash of what a reading depends on. */
export function readingKey(parts: Record<string, unknown>): string {
  return sha256(JSON.stringify(stable(parts))).slice(0, 32);
}

/**
 * Every prompt and schema a reading is made with, hashed, with
 * `READING_CODE_VERSION`: the extractor's, the several-recipe list's and
 * its one-dish question's. Loads the extractor (it runs next anyway).
 */
export async function readingVersion(): Promise<string> {
  const extract = await import("../llm/extractRecipe");
  const split = await import("../llm/splitRecipes");
  return sha256(
    JSON.stringify([
      READING_CODE_VERSION,
      extract.LLM_RECIPE_SYSTEM_PROMPT,
      extract.LLM_RECIPE_SCHEMA,
      split.LLM_LIST_SYSTEM_PROMPT,
      split.LLM_LIST_SCHEMA,
      split.LLM_ONE_DISH_SYSTEM_PROMPT,
      split.LLM_ONE_DISH_SCHEMA,
    ]),
  ).slice(0, 16);
}

/** A kept reading, as read back. */
export interface KeptReading<T> {
  value: T;
  /** Epoch ms. */
  savedAt: number;
  /** The job that made it. */
  job?: string;
}

/** One reading key's slot in the store. */
export interface ReadingCache<T> {
  readonly key: string;
  /** `fresh` (39a): `load` answers nothing; `save` still keeps the reading. */
  readonly fresh: boolean;
  /** The kept reading, if one is younger than the limit (never when `fresh`). */
  load(): Promise<KeptReading<T> | undefined>;
  /** Keep `value` as this key's reading (best effort: a failure is ignored). */
  save(value: T): Promise<void>;
}

function readingPath(dir: string, key: string): string {
  return path.join(dir, READINGS_DIR, `${key}.json`);
}

export function readingCache<T>(
  dir: string,
  key: string,
  {
    job,
    maxAgeMs = READING_MAX_AGE_MS,
    now = Date.now,
    fresh = false,
  }: {
    job?: string;
    maxAgeMs?: number;
    now?: () => number;
    /** Skip the read, keep the save (39a). */
    fresh?: boolean;
  } = {},
): ReadingCache<T> {
  const file = readingPath(dir, key);
  return {
    key,
    fresh,
    async load() {
      if (fresh) return undefined;
      let kept: Partial<KeptReading<T>> & { key?: string };
      try {
        kept = JSON.parse(await readFile(file, "utf8"));
      } catch {
        return undefined;
      }
      if (
        !kept ||
        kept.key !== key ||
        typeof kept.savedAt !== "number" ||
        now() - kept.savedAt > maxAgeMs ||
        !kept.value ||
        typeof kept.value !== "object"
      ) {
        return undefined;
      }
      return {
        value: kept.value as T,
        savedAt: kept.savedAt,
        ...(typeof kept.job === "string" ? { job: kept.job } : {}),
      };
    },
    async save(value) {
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeJsonAtomic(file, {
          key,
          savedAt: now(),
          ...(job ? { job } : {}),
          value,
        });
      } catch {
        /* A store that cannot be written: the next retry reads again. */
      }
    },
  };
}

/**
 * Remove kept readings older than `maxAgeMs` (the job store's prune calls
 * this). Answers how many it removed.
 */
export async function pruneReadings(
  dir: string,
  {
    now = Date.now(),
    maxAgeMs = READING_MAX_AGE_MS,
  }: { now?: number; maxAgeMs?: number } = {},
): Promise<number> {
  const readings = path.join(dir, READINGS_DIR);
  let removed = 0;
  for (const name of await readdir(readings).catch(() => [] as string[])) {
    const file = path.join(readings, name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > maxAgeMs) {
      await rm(file, { force: true });
      removed += 1;
    }
  }
  return removed;
}
