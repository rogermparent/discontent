/**
 * The gram bank (51f): grams in a US cup of an ingredient, by name.
 *
 * - **The seed is built in** (Roger's answer 3): King Arthur's ingredient
 *   weight chart (`gramsChart.ts`), with epic 49's own values kept where
 *   they differ. It shows as "Built in".
 * - **A person's edits** live in the content repo, `conversions/grams.json`
 *   (`{"entries": [{key, name, gramsPerCup, updatedAt?}]}`), one commit a
 *   change (the editor's `controller/curation/conversions.ts`). An entry
 *   whose key the seed has overrides it ("Yours"); Reset deletes the entry,
 *   and the built-in value is back. The file is laid over the seed as
 *   50a's leave-off rules are over `BUILT_IN_LEAVE_OFF`.
 * - **Keyed by name** (`gramsKeyOf`): the shopping list's name key
 *   (`shoppingNameOf`), so "packed light brown sugar" finds "light brown
 *   sugar" — but with the line's own preparation words put back when the
 *   key dropped them. The shopping list buys almonds whether they are
 *   sliced or whole; a cup of sliced almonds weighs 86 g, of whole ones
 *   142 g. So "1 cup sliced almonds" keys as `sliced almond`, and only an
 *   entry for that finds it (51f Df2).
 * - **Shopping totals read the same table** (`gramsTableOf`, passed to
 *   `buildShoppingView`), so a density edited here changes "≈ 3 cups" there.
 *
 * Pure, and safe in the browser: nothing here names a file's path.
 */
import { BUILT_IN_GRAMS, type BuiltInGrams } from "./gramsChart";
import type { GramsPerCupTable } from "./shoppingMerges";
import { plainLine } from "../components/Form/Ingredients/ingredientRows";
import { shoppingNameOf } from "./shoppingView";
import { fold } from "./fold";

/** Where the bank lives, relative to the content directory. */
export const GRAMS_BANK_DIRECTORY = "conversions";
export const GRAMS_BANK_FILE = `${GRAMS_BANK_DIRECTORY}/grams.json`;

/** The grams a cup may hold: Rice Krispies 28 g to marzipan 290 g, with room. */
export const GRAMS_PER_CUP_MIN = 1;
export const GRAMS_PER_CUP_MAX = 1000;

/** A name, as typed into the bank: at most this many characters. */
export const GRAMS_NAME_MAX = 80;

/** One of a person's entries. */
export interface GramsBankEntry {
  /** `gramsKeyOf(name)`. */
  key: string;
  /** As typed: "packed light brown sugar". */
  name: string;
  gramsPerCup: number;
  /** ISO time of the last change. */
  updatedAt?: string;
}

/** `conversions/grams.json`. */
export interface GramsBankFile {
  entries: GramsBankEntry[];
}

/**
 * Preparation words that change what a cup weighs, each written one way:
 * "diced" is "chopped", "shredded" is "grated", "dry" is "dried".
 */
const DENSITY_WORDS: Readonly<Record<string, string>> = {
  sliced: "sliced",
  slivered: "slivered",
  chopped: "chopped",
  diced: "chopped",
  grated: "grated",
  shredded: "grated",
  minced: "minced",
  crushed: "crushed",
  ground: "ground",
  mashed: "mashed",
  puree: "puree",
  pureed: "puree",
  dried: "dried",
  dry: "dried",
  powdered: "powdered",
  cooked: "cooked",
  popped: "popped",
  toasted: "toasted",
  candied: "candied",
};

function wordsOf(text: string): string[] {
  return fold(text)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * The bank's key for a line or a typed name (Df2): its shopping name key,
 * with the preparation words the key dropped put back in front, A–Z —
 * "1 cup chopped dried apricots" is `chopped dried apricot`. `undefined`
 * for a line with no name to key (`text:` keys).
 */
export function gramsKeyOf(text: string): string | undefined {
  const base = shoppingNameOf(text).key;
  if (base.startsWith("text:")) return undefined;
  const has = new Set(
    base.split(" ").map((word) => DENSITY_WORDS[word] ?? word),
  );
  const missing = [
    ...new Set(
      wordsOf(plainLine(text)).flatMap((word) =>
        DENSITY_WORDS[word] ? [DENSITY_WORDS[word]] : [],
      ),
    ),
  ]
    .filter((word) => !has.has(word))
    .sort();
  return missing.length ? `${missing.join(" ")} ${base}` : base;
}

/** One key's density, and where it comes from. */
export interface GramsDensity {
  gramsPerCup: number;
  /** "built-in" (the seed), "yours" (a person's own), "changed" (yours over the seed). */
  origin: "built-in" | "yours" | "changed";
  /** The seed's value under a change. */
  builtIn?: number;
  /** Why: the chart row, the house value, or the person's name for it. */
  from: string;
  /** The person's own name for it, when the entry is theirs. */
  name?: string;
}

/** Every key the bank answers, with where its value comes from. */
export type GramsTable = ReadonlyMap<string, GramsDensity>;

const isEntry = (value: unknown): value is GramsBankEntry => {
  const entry = value as GramsBankEntry;
  return (
    !!entry &&
    typeof entry.key === "string" &&
    entry.key.length > 0 &&
    typeof entry.name === "string" &&
    typeof entry.gramsPerCup === "number" &&
    entry.gramsPerCup >= GRAMS_PER_CUP_MIN &&
    entry.gramsPerCup <= GRAMS_PER_CUP_MAX
  );
};

/** A bank file read: its good entries, and what was wrong with it, if anything. */
export interface GramsBankRead {
  entries: GramsBankEntry[];
  /** A hand edit gone wrong: not JSON, no `entries` list, or bad entries left out. */
  problem?: string;
}

/**
 * `conversions/grams.json`'s text, checked (review finding 7): the good
 * entries, and the problem when it isn't JSON, has no `entries` list, or
 * holds entries that aren't `{key, name, gramsPerCup}` in range. A reader
 * goes on with the good entries (the seed under them); a write refuses
 * the file, so a hand edit is never overwritten.
 */
export function readGramsBankText(text: string): GramsBankRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { entries: [], problem: `${GRAMS_BANK_FILE} isn't valid JSON` };
  }
  const list = (raw as GramsBankFile | undefined)?.entries;
  if (!Array.isArray(list)) {
    return {
      entries: [],
      problem: `${GRAMS_BANK_FILE} has no "entries" list`,
    };
  }
  const entries = list.filter(isEntry);
  const bad = list.length - entries.length;
  return bad
    ? {
        entries,
        problem: `${bad} entr${bad === 1 ? "y" : "ies"} in ${GRAMS_BANK_FILE} ${bad === 1 ? "isn't" : "aren't"} a name with ${GRAMS_PER_CUP_MIN}–${GRAMS_PER_CUP_MAX} grams a cup, and ${bad === 1 ? "is" : "are"} left out`,
      }
    : { entries };
}

/** A file's entries, every malformed one dropped (a hand edit gone wrong). */
export function gramsEntriesOf(raw: unknown): GramsBankEntry[] {
  const entries = (raw as GramsBankFile | undefined)?.entries;
  return Array.isArray(entries) ? entries.filter(isEntry) : [];
}

function builtInDensity(builtIn: BuiltInGrams): GramsDensity {
  return {
    gramsPerCup: builtIn.gramsPerCup,
    origin: "built-in",
    from: builtIn.from,
  };
}

/** The seed with a person's entries laid over it. */
export function gramsTableOf(
  entries: readonly GramsBankEntry[] = [],
): GramsTable {
  const table = new Map<string, GramsDensity>(
    Object.entries(BUILT_IN_GRAMS).map(([key, builtIn]) => [
      key,
      builtInDensity(builtIn),
    ]),
  );
  for (const entry of entries) {
    const seed = Object.hasOwn(BUILT_IN_GRAMS, entry.key)
      ? BUILT_IN_GRAMS[entry.key]
      : undefined;
    table.set(entry.key, {
      gramsPerCup: entry.gramsPerCup,
      origin: seed ? "changed" : "yours",
      ...(seed ? { builtIn: seed.gramsPerCup } : {}),
      from: `Yours: ${entry.name}`,
      name: entry.name,
    });
  }
  return table;
}

/** The table as `gramsPerCupFor` reads it (the shopping list's densities). */
export function gramsPerCupTable(table: GramsTable): GramsPerCupTable {
  return Object.fromEntries(
    [...table].map(([key, density]) => [key, density.gramsPerCup]),
  );
}

/** A line's density in the bank, or none. */
export function densityOf(
  table: GramsTable,
  text: string,
): ({ key: string } & GramsDensity) | undefined {
  const key = gramsKeyOf(text);
  const density = key === undefined ? undefined : table.get(key);
  return key !== undefined && density ? { key, ...density } : undefined;
}

/** The built-in seed's value for a key, if it has one. */
export function builtInGramsOf(key: string): BuiltInGrams | undefined {
  return Object.hasOwn(BUILT_IN_GRAMS, key) ? BUILT_IN_GRAMS[key] : undefined;
}
