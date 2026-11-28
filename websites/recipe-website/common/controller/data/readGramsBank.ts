/**
 * The gram bank's entries (51f), `<content>/conversions/grams.json`: what
 * the recipe page's "Show grams" works its estimates out from, in the
 * editor and — read at build time — the static export (Roger's answer 6).
 * The bank is conversion arithmetic, not anything personal, so the export
 * may read it as it reads the recipes (unlike the inventory, which only
 * reaches it when the operator opts in).
 *
 * The editor writes it through `controller/curation/conversions.ts`; this
 * module only reads. A missing file is an empty bank: the built-in seed
 * alone. A hand edit gone wrong (not JSON, bad entries) is its good entries
 * over the seed, the problem logged; any other read error (EISDIR, EACCES)
 * is thrown, for the page to decide.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  GRAMS_BANK_FILE,
  readGramsBankText,
  type GramsBankEntry,
} from "../../util/gramsBank";

export function gramsBankPath(contentDirectory: string): string {
  /* A runtime content-repo path, never a build input (#269). */
  return path.join(/*turbopackIgnore: true*/ contentDirectory, GRAMS_BANK_FILE);
}

/** The person's entries, or none. */
export async function readGramsBankEntries(
  contentDirectory: string = getContentDirectory(),
): Promise<GramsBankEntry[]> {
  try {
    const raw = await readFile(
      /*turbopackIgnore: true*/ gramsBankPath(contentDirectory),
      "utf8",
    );
    const read = readGramsBankText(raw);
    if (read.problem) {
      console.warn(`The gram bank: ${read.problem}; the rest is read.`);
    }
    return read.entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** For a page: the entries, or none (the seed alone) when the file can't be read, said in the log. */
export function gramsBankOrSeed(error: unknown): GramsBankEntry[] {
  console.error(
    "The gram bank could not be read; the built-in seed stands in.",
    error,
  );
  return [];
}
