/**
 * The gram bank's entries (51f), `<content>/conversions/grams.json`: what
 * the recipe page's "Show grams" works its estimates out from, in the
 * editor and — read at build time — the static export (Roger's answer 6).
 * The bank is conversion arithmetic, not anything personal, so the export
 * may read it as it reads the recipes (unlike the inventory, which only
 * reaches it when the operator opts in).
 *
 * The editor writes it through `controller/curation/conversions.ts`; this
 * module only reads. A missing or unreadable file is an empty bank: the
 * built-in seed alone.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  GRAMS_BANK_FILE,
  gramsEntriesOf,
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
    return gramsEntriesOf(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}
