/**
 * One ingredient under two names on the shopping list (epic 49, 49a): the
 * decisions a person stores, the curated table that proposes them, and the
 * amount arithmetic a merged row needs.
 *
 * - **Decisions are stored, proposals are derived** (Da1). A decision is one
 *   file per id in the list's `merges/` directory (the seat writes it), so the
 *   workstation and the Pi never touch the same file for two decisions. The
 *   id is a stable hash of the sorted name keys: the same proposal always
 *   has the same id, on every device.
 * - **The table only proposes** (Da2). `SHOPPING_EQUIVALENTS` lists name
 *   keys (`shoppingNameOf(...).key`) that buy the same thing; the finder in
 *   `shoppingConsolidate.ts` puts their rows side by side as a proposal, and
 *   nothing merges until a person says so. Judgement calls — salted and
 *   unsalted butter, kosher and table salt — are left out on purpose.
 * - **Volume and weight** (Da3): a merged row with both a volume and a
 *   weight part converts through `GRAMS_PER_CUP`, a small table of baking
 *   staples, and is marked estimated ("≈"). Without a density the parts stay
 *   side by side, "1 cup + 120 g", as an unmerged row shows them.
 *
 * Pure, and safe in the browser: nothing here names a file.
 */
import {
  addAmounts,
  unitSize,
  type Amount,
  type AmountPart,
} from "./ingredientAmount";

// --- decisions -------------------------------------------------------------

/** What a person decided about a set of names (Da4). */
export type ShoppingMergeStatus = "merged" | "apart";

/**
 * One decision (Da4), stored by the editor's seat as `merges/<id>.json`.
 *
 * - `merged`: the rows of these names show as one row from now on — a rule,
 *   like `aisleOverrides`, so a later list with the same names merges too.
 * - `apart`: the proposal for these names never shows again.
 */
export interface ShoppingMerge {
  /** `mergeIdOf(keys)`: 16 hex characters. Names the file. */
  id: string;
  /** Name keys, sorted and unique, at least two. */
  keys: string[];
  status: ShoppingMergeStatus;
  /** Merged: the row's label, when the person changed it. */
  name?: string;
  /**
   * Merged: the person's own amount, good only while the row covers exactly
   * these item ids. When the items change the row falls back to the sum and
   * says so.
   */
  amount?: { text: string; ids: string[] };
  /** For a model to follow up on (49b). Stored only; 49a never reads it. */
  note?: string;
  /** ISO time of the decision. */
  decidedAt: string;
}

export const SHOPPING_MERGE_KEYS = [
  "id",
  "keys",
  "status",
  "name",
  "amount",
  "note",
  "decidedAt",
] as const satisfies readonly (keyof ShoppingMerge)[];

/** A decision's id: what `mergeIdOf` makes. */
export const MERGE_ID_PATTERN = /^[0-9a-f]{16}$/;

/** Bounds a stored decision is read within (and the seat's schema writes). */
export const MERGE_LIMITS = {
  keys: 20,
  key: 160,
  name: 120,
  amount: 60,
  note: 2000,
  ids: 5000,
} as const;

/** Sorted, trimmed, unique: the form keys are stored and hashed in. */
export function normalizeMergeKeys(keys: readonly string[]): string[] {
  return [
    ...new Set(keys.map((key) => key.trim()).filter((key) => key.length > 0)),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** FNV-1a over UTF-16 code units, 32 bits, from `seed`. */
function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The stable id of a set of name keys (Da1): two 32-bit FNV-1a hashes of the
 * sorted keys, as 16 hex characters. The order the keys come in, or a
 * repeat, does not change it.
 */
export function mergeIdOf(keys: readonly string[]): string {
  const text = normalizeMergeKeys(keys).join("\n");
  const hex = (value: number) => value.toString(16).padStart(8, "0");
  return `${hex(fnv1a(text, 0x811c9dc5))}${hex(fnv1a(text, 0x050c5d1f))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text && text.length <= max ? text : undefined;
}

/** A decision as stored: known keys only, in `SHOPPING_MERGE_KEYS` order. */
export function canonicalShoppingMerge(merge: ShoppingMerge): ShoppingMerge {
  const out: Record<string, unknown> = {};
  for (const key of SHOPPING_MERGE_KEYS) {
    const value = merge[key];
    if (value === undefined || value === null) continue;
    if (value === "" && key !== "decidedAt") continue;
    out[key] = value;
  }
  return out as unknown as ShoppingMerge;
}

/**
 * A stored decision, read leniently, as `parseShoppingItem` reads an item:
 * `null` when it has no usable id, fewer than two keys or no status. The
 * file name is the id, whatever the file says (`fallbackId`). A merged
 * decision keeps its name and amount; an apart one drops them.
 */
export function parseShoppingMerge(
  raw: unknown,
  fallbackId?: string,
): ShoppingMerge | null {
  if (!isRecord(raw)) return null;
  const id = (
    fallbackId ?? (typeof raw.id === "string" ? raw.id : "")
  ).toLowerCase();
  if (!MERGE_ID_PATTERN.test(id)) return null;
  if (!Array.isArray(raw.keys)) return null;
  const keys = normalizeMergeKeys(
    raw.keys.filter(
      (key): key is string =>
        typeof key === "string" && key.length <= MERGE_LIMITS.key,
    ),
  );
  if (keys.length < 2 || keys.length > MERGE_LIMITS.keys) return null;
  const status = raw.status;
  if (status !== "merged" && status !== "apart") return null;
  const merge: ShoppingMerge = {
    id,
    keys,
    status,
    decidedAt: typeof raw.decidedAt === "string" ? raw.decidedAt : "",
  };
  if (status === "merged") {
    const name = boundedText(raw.name, MERGE_LIMITS.name);
    if (name) merge.name = name;
    if (isRecord(raw.amount)) {
      const text = boundedText(raw.amount.text, MERGE_LIMITS.amount);
      const ids = Array.isArray(raw.amount.ids)
        ? raw.amount.ids.filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          )
        : [];
      if (text && ids.length > 0 && ids.length <= MERGE_LIMITS.ids) {
        merge.amount = { text, ids: [...new Set(ids)].sort() };
      }
    }
  }
  if (typeof raw.note === "string") {
    const note = raw.note.trim();
    if (note && note.length <= MERGE_LIMITS.note) merge.note = note;
  }
  return canonicalShoppingMerge(merge);
}

/**
 * The merged decisions that apply to a list (Da4): those with at least two
 * of their names on it — one name alone is just that row, as it reads
 * without the decision. Name key → its decision; a name two decisions claim
 * (a hand edit) goes to the first by id.
 */
export function activeMerges(
  merges: readonly ShoppingMerge[],
  present: ReadonlySet<string>,
): Map<string, ShoppingMerge> {
  const byKey = new Map<string, ShoppingMerge>();
  const sorted = [...merges]
    .filter((merge) => merge.status === "merged")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const merge of sorted) {
    const keys = merge.keys.filter(
      (key) => present.has(key) && !byKey.has(key),
    );
    if (keys.length < 2) continue;
    for (const key of keys) byKey.set(key, merge);
  }
  return byKey;
}

// --- the table -------------------------------------------------------------

/** Name keys a shopper buys as one thing (Da2). */
export interface ShoppingEquivalence {
  /** The name key of what the merged row is (the first of `members`). */
  key: string;
  /** How the merged row reads: the more generic or common name. */
  name: string;
  /** Every name key of the set, `key` first. */
  members: readonly string[];
  /**
   * A member whose bare count means a container: "3 garlic cloves" is three
   * cloves, as "3 cloves garlic" is.
   */
  countUnits?: Readonly<Record<string, string>>;
}

/**
 * The curated sets (Da2), grounded in `measure-ingredient-dupes.ts` over a
 * scratch clone of the content repo (2026-11-21: 1,003 recipes, 10,214
 * lines). Names `ingredientNames` already reads as one — scallions and
 * green onions, cilantro and fresh coriander, heavy and heavy whipping
 * cream, confectioners' and powdered sugar, white and granulated sugar —
 * merge today and need no row. Each set here is a pair of names that still
 * key apart.
 *
 * Left out, deliberately (Roger to confirm): salted, unsalted and plain
 * butter; kosher, table, sea and plain salt; light and dark brown sugar and
 * brown sugar (46g kept them apart); vegetable, canola and neutral oil;
 * olive and extra virgin olive oil; a bare "chocolate chips" beside
 * semisweet; rice and long-grain rice; cornmeal and yellow cornmeal; canned
 * and carton coconut milk.
 */
export const SHOPPING_EQUIVALENTS: readonly ShoppingEquivalence[] = [
  {
    /* Not bread, cake, pastry, whole-wheat or almond flour. */
    key: "all purpose flour",
    name: "all-purpose flour",
    members: [
      "all purpose flour",
      "white flour",
      "unbleached flour",
      "bleached flour",
      "unbleached white flour",
      "bleached all purpose flour",
      "unbleached all purpose flour",
      "all purpose unbleached flour",
      "all purpose",
      "unbleached all purpose",
      "flour",
    ],
  },
  {
    /* Not superfine, caster or coarse sugar. */
    key: "granulated sugar",
    name: "granulated sugar",
    members: [
      "granulated sugar",
      "cane sugar",
      "granulated cane sugar",
      "white cane sugar",
    ],
  },
  {
    /* "2 extra-large eggs" reads as `extra egg` today. */
    key: "egg",
    name: "egg",
    members: ["egg", "large egg", "extra egg", "extra large egg", "jumbo egg"],
  },
  {
    key: "garlic",
    name: "garlic",
    members: ["garlic", "garlic clove"],
    countUnits: { "garlic clove": "clove" },
  },
  {
    /* Not quick or steel-cut oats. */
    key: "rolled oats",
    name: "rolled oats",
    members: [
      "rolled oats",
      "old fashioned oats",
      "old fashioned rolled oats",
      "rolled oat",
      "old fashioned oat",
    ],
  },
  {
    /* Not vanilla bean paste or a vanilla bean. */
    key: "vanilla extract",
    name: "vanilla extract",
    members: ["vanilla extract", "vanilla"],
  },
  {
    key: "semisweet chocolate chip",
    name: "semisweet chocolate chip",
    members: [
      "semisweet chocolate chip",
      "semi sweet chocolate chip",
      "semisweet chocolate morsel",
      "semi sweet chocolate morsel",
    ],
  },
  {
    key: "panko",
    name: "panko",
    members: [
      "panko",
      "panko breadcrumb",
      "panko bread crumb",
      "japanese panko",
    ],
  },
  {
    key: "kosher salt",
    name: "kosher salt",
    members: ["kosher salt", "coarse kosher salt"],
  },
  {
    /* One jar of peppercorns, whatever the grind. Not white pepper. */
    key: "black pepper",
    name: "black pepper",
    members: ["black pepper", "cracked black pepper", "coarse black pepper"],
  },
];

const EQUIVALENCE_OF = new Map<string, ShoppingEquivalence>(
  SHOPPING_EQUIVALENTS.flatMap((set) =>
    set.members.map((member) => [member, set] as const),
  ),
);

/** The curated set a name key belongs to, if any. */
export function equivalenceOf(key: string): ShoppingEquivalence | undefined {
  return EQUIVALENCE_OF.get(key);
}

// --- amounts ---------------------------------------------------------------

/**
 * Grams in one US cup of a baking staple (Da3), by name key: what turns "1
 * cup + 120 g" of flour into "≈ 2 cups". King Arthur's ingredient weight
 * chart, rounded; spooned and levelled, not packed (brown sugar is packed,
 * as recipes mean it).
 */
export const GRAMS_PER_CUP: Readonly<Record<string, number>> = {
  "all purpose flour": 120,
  "bread flour": 120,
  "wheat flour": 120,
  flour: 120,
  "granulated sugar": 200,
  "brown sugar": 213,
  "light brown sugar": 213,
  "dark brown sugar": 213,
  "powdered sugar": 120,
  butter: 227,
  "unsalted butter": 227,
  "salted butter": 227,
  rice: 185,
  "rolled oats": 90,
  "semisweet chocolate chip": 170,
};

/**
 * The density a merged row converts with: its own name's, else one every
 * one of its names shares. None when they disagree or none has one.
 */
export function gramsPerCupFor(
  key: string,
  keys: readonly string[] = [],
): number | undefined {
  const own = GRAMS_PER_CUP[key];
  if (own !== undefined) return own;
  const known = new Set(
    keys.flatMap((each) =>
      GRAMS_PER_CUP[each] !== undefined ? [GRAMS_PER_CUP[each]] : [],
    ),
  );
  return known.size === 1 && keys.every((each) => GRAMS_PER_CUP[each])
    ? [...known][0]
    : undefined;
}

const ML_PER_CUP = 236.588;
const GRAMS_PER_OZ = 28.3495;

/** Grams per family base unit (tsp, ml, oz, g), at a density. */
function gramsPerBase(
  family: AmountPart["family"],
  gramsPerCup: number,
): number | undefined {
  switch (family) {
    case "us-volume":
      return gramsPerCup / 48;
    case "metric-volume":
      return gramsPerCup / ML_PER_CUP;
    case "us-weight":
      return GRAMS_PER_OZ;
    case "metric-weight":
      return 1;
    default:
      return undefined;
  }
}

function isVolume(part: AmountPart): boolean {
  return part.family === "us-volume" || part.family === "metric-volume";
}

function isWeight(part: AmountPart): boolean {
  return part.family === "us-weight" || part.family === "metric-weight";
}

/** A count read as a container: "3 garlic cloves" → 3 cloves. */
export function countsAs(amount: Amount, unit: string | undefined): Amount {
  if (!unit) return amount;
  return {
    parts: amount.parts.map((part) =>
      part.family === "count" ? { ...part, unit, family: "container" } : part,
    ),
  };
}

export interface ConsolidatedAmount {
  amount: Amount;
  /** A volume and a weight were added through a density: show it with "≈". */
  estimated: boolean;
}

/**
 * The amounts together (Da3). Within a family, `addAmounts` as always (US
 * and metric stay apart, 35-D4). When the sum holds a volume **and** a
 * weight and `gramsPerCup` is known, every volume and weight part becomes
 * grams and the total is written in the family and unit of the largest
 * share, marked `estimated`. Counts and containers stay as they are.
 */
export function consolidateAmounts(
  amounts: readonly Amount[],
  gramsPerCup?: number,
): ConsolidatedAmount {
  const total = addAmounts(...amounts);
  if (gramsPerCup === undefined || !(gramsPerCup > 0)) {
    return { amount: total, estimated: false };
  }
  const measured = total.parts.filter(
    (part) => isVolume(part) || isWeight(part),
  );
  if (!measured.some(isVolume) || !measured.some(isWeight)) {
    return { amount: total, estimated: false };
  }
  const grams = (part: AmountPart) =>
    part.qty * unitSize(part.unit) * gramsPerBase(part.family, gramsPerCup)!;
  let largest = measured[0];
  for (const part of measured) if (grams(part) > grams(largest)) largest = part;
  const sum = measured.reduce((all, part) => all + grams(part), 0);
  const qty =
    sum / (unitSize(largest.unit) * gramsPerBase(largest.family, gramsPerCup)!);
  const merged: AmountPart = {
    qty,
    unit: largest.unit,
    family: largest.family,
  };
  const parts: AmountPart[] = [];
  let placed = false;
  for (const part of total.parts) {
    if (isVolume(part) || isWeight(part)) {
      if (!placed) parts.push(merged);
      placed = true;
    } else parts.push(part);
  }
  return { amount: { parts }, estimated: true };
}
