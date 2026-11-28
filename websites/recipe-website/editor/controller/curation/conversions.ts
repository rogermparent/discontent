/**
 * The gram bank's writes (51f): `<content>/conversions/grams.json`, a
 * person's grams-per-cup entries over the built-in seed (King Arthur's
 * chart, `common/util/gramsChart.ts`; the table is `gramsTableOf`).
 *
 * Like the inventory (25d) it is a committed file, not a content type: no
 * index reads it (`conversions` is in `UNINDEXED_DIRECTORIES`, so a commit
 * from the Pi moves the stamp without a rebuild), and every write is one
 * commit through `commitContentChanges`, under the write lock, written
 * atomically — `patchInventory`'s pattern. Only Settings › Conversions and
 * the edit page's "Save to the bank" write it: a model's or a paste's grams
 * are never saved here on their own (Roger's answer 5). No MCP tool reads
 * or writes it (59 / 45 stay).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "@discontent/cms/fs/atomicWrite";
import {
  assertNoMergeInProgress,
  commitContentChanges,
} from "@discontent/cms/git/commit";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import { z } from "zod";
import {
  GRAMS_BANK_FILE,
  GRAMS_NAME_MAX,
  GRAMS_PER_CUP_MAX,
  GRAMS_PER_CUP_MIN,
  builtInGramsOf,
  gramsEntriesOf,
  gramsKeyOf,
  gramsTableOf,
  type GramsBankEntry,
  type GramsDensity,
} from "recipe-website-common/util/gramsBank";
import type { CurationContext } from "./context";
import { NotFoundError, ValidationError } from "./errors";
import { parseInput } from "./schema";

/** Relative to the content directory — the path `git add` is given. */
export const CONVERSIONS_FILE = path.join(...GRAMS_BANK_FILE.split("/"));

function gramsBankPath(contentDirectory: string): string {
  /* A runtime content-repo path, never a build input (#269). */
  return path.join(
    /*turbopackIgnore: true*/ contentDirectory,
    CONVERSIONS_FILE,
  );
}

/**
 * The person's entries, or none (a missing or unreadable file). The recipe
 * pages read the same file through `common/controller/data/readGramsBank`;
 * this seat reads it itself, as `inventory.ts` does (D8).
 */
export async function readGramsBank(
  ctx: CurationContext,
): Promise<GramsBankEntry[]> {
  try {
    const raw = await readFile(
      /*turbopackIgnore: true*/ gramsBankPath(ctx.contentDirectory),
      "utf8",
    );
    return gramsEntriesOf(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

/** One row of Settings › Conversions. */
export interface GramsBankRow extends GramsDensity {
  key: string;
}

/**
 * The bank as Settings lists it: every key, A–Z, the person's first when
 * `query` is empty — narrowed to keys (or names) holding every word of it.
 */
export function gramsBankRows(
  entries: readonly GramsBankEntry[],
  query = "",
): GramsBankRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return [...gramsTableOf(entries)]
    .map(([key, density]) => ({ key, ...density }))
    .filter((row) =>
      words.every(
        (word) =>
          row.key.includes(word) ||
          (row.name ?? "").toLowerCase().includes(word),
      ),
    )
    .sort((a, b) => a.key.localeCompare(b.key));
}

export const GramsSetSchema = z.strictObject({
  name: z.string().trim().min(1).max(GRAMS_NAME_MAX),
  gramsPerCup: z.number().min(GRAMS_PER_CUP_MIN).max(GRAMS_PER_CUP_MAX),
});

export interface GramsWriteResult {
  entries: GramsBankEntry[];
  /** The key written or reset. */
  key: string;
  /** False when the bank was already so: nothing written or committed. */
  changed: boolean;
}

const gramsText = (grams: number) => `${Math.round(grams * 10) / 10} g a cup`;

/** Called under the write lock. */
async function writeBank(
  ctx: CurationContext,
  entries: GramsBankEntry[],
  message: string,
): Promise<void> {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  await writeFileAtomic(
    gramsBankPath(ctx.contentDirectory),
    `${JSON.stringify({ entries: sorted }, null, 2)}\n`,
  );
  await commitContentChanges(
    message,
    ctx.author,
    [CONVERSIONS_FILE],
    ctx.contentDirectory,
  );
}

/**
 * Set a name's grams in a cup: add it, or change it (over the built-in
 * value too). Keyed as a recipe line is (`gramsKeyOf`), so "packed light
 * brown sugar" is `light brown sugar`. One commit, or none when nothing
 * moved.
 */
export async function setGrams(
  ctx: CurationContext,
  raw: unknown,
): Promise<GramsWriteResult> {
  const input = parseInput(GramsSetSchema, raw);
  const key = gramsKeyOf(input.name);
  if (!key) {
    throw new ValidationError(
      `"${input.name}" doesn't read as an ingredient's name.`,
    );
  }
  const gramsPerCup = Math.round(input.gramsPerCup * 10) / 10;
  return withWriteLock(ctx.contentDirectory, "conversions: set", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const entries = await readGramsBank(ctx);
    const old = entries.find((entry) => entry.key === key);
    if (old && old.gramsPerCup === gramsPerCup && old.name === input.name) {
      return { entries, key, changed: false };
    }
    const builtIn = builtInGramsOf(key);
    const next: GramsBankEntry = {
      key,
      name: input.name,
      gramsPerCup,
      updatedAt: new Date().toISOString(),
    };
    const written = [...entries.filter((entry) => entry.key !== key), next];
    const was = old?.gramsPerCup ?? builtIn?.gramsPerCup;
    await writeBank(
      ctx,
      written,
      was === undefined
        ? `Add grams: ${key}, ${gramsText(gramsPerCup)}`
        : `Update grams: ${key}, ${gramsText(was)} → ${gramsText(gramsPerCup)}`,
    );
    return { entries: written, key, changed: true };
  });
}

/**
 * Reset a key: the person's entry goes, and the built-in value (if any)
 * is back. One commit; `not_found` when the key has no entry.
 */
export async function resetGrams(
  ctx: CurationContext,
  key: string,
): Promise<GramsWriteResult> {
  return withWriteLock(ctx.contentDirectory, "conversions: reset", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const entries = await readGramsBank(ctx);
    const old = entries.find((entry) => entry.key === key);
    if (!old) throw new NotFoundError(`No entry of yours for "${key}".`);
    const written = entries.filter((entry) => entry.key !== key);
    const builtIn = builtInGramsOf(key);
    await writeBank(
      ctx,
      written,
      builtIn
        ? `Reset grams: ${key}, back to the built-in ${gramsText(builtIn.gramsPerCup)}`
        : `Remove grams: ${key}`,
    );
    return { entries: written, key, changed: true };
  });
}
