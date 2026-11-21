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
 * - **An asked-for unit** (49c, Dc1): "use grams" names a unit, and
 *   `amountInUnit` does the arithmetic — a model never does.
 * - **Known different** (49c, Dc3): `SHOPPING_KNOWN_DIFFERENT`, names that
 *   look alike and are not one thing to buy (baking powder and soda, salted
 *   and unsalted butter), read by the table's finder and the model's check.
 *
 * Pure, and safe in the browser: nothing here names a file.
 */
import {
  addAmounts,
  formatAmount,
  normalizeUnit,
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
// --- 49c: an amount in the unit a person asked for (Dc1) -------------------

/**
 * The units a note may ask a merged row in (Dc1) — what the model names
 * instead of working out an amount: `""` keeps the list's own.
 */
export const ASKABLE_UNITS = [
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
] as const;

export type AskableUnit = (typeof ASKABLE_UNITS)[number];

/** An amount in an asked-for unit, or why it can't be. */
export type InUnit =
  | {
      ok: true;
      /** As the list writes it ("890 g", "2 lb"), without the "≈". */
      text: string;
      /** A volume became a weight (or back) through a density. */
      estimated: boolean;
      /** Every part was in that unit's family already: nothing to convert. */
      unchanged: boolean;
    }
  | {
      ok: false;
      /**
       * `count`: a part is a count or a container (cloves, eggs, cans);
       * `density`: volume and weight with no weight for a cup on file;
       * `none`: nothing to convert (as needed).
       */
      why: "count" | "density" | "none";
      /** The part that would not convert, as the list writes it. */
      part?: string;
    };

type Kind = "volume" | "weight" | "other";

function kindOf(family: AmountPart["family"]): Kind {
  if (family === "us-volume" || family === "metric-volume") return "volume";
  if (family === "us-weight" || family === "metric-weight") return "weight";
  return "other";
}

/** Millilitres or grams in one of a family's base units (tsp, ml, oz, g). */
function metricPerBase(family: AmountPart["family"]): number {
  if (family === "us-volume") return ML_PER_CUP / 48;
  if (family === "us-weight") return GRAMS_PER_OZ;
  return 1;
}

/**
 * Grams or millilitres the way a cook writes a converted amount: whole
 * under 20, to the nearest 5 under 100 and 10 under 1,000, then tenths of a
 * kilo or litre — "≈ 890 g", not "≈ 990.75 g".
 */
export function roundMetric(
  base: number,
  small: string,
  large: string,
): string {
  if (base >= 995) return `${Math.round(base / 100) / 10} ${large}`;
  const step = base < 20 ? 1 : base < 100 ? 5 : 10;
  return `${Math.max(step, Math.round(base / step) * step)} ${small}`;
}

/**
 * An amount in the unit a note asked for (Dc1): every part converted into
 * that unit's family — US and metric of one kind exactly, a volume and a
 * weight through `gramsPerCup` (then `estimated`) — and written the way a
 * cook writes it (`roundMetric`; US units as `formatAmount` writes them).
 * Not for a count or a container (cloves, eggs, cans), nor for a volume and
 * a weight with no density on file: it says which.
 */
export function amountInUnit(
  amount: Amount,
  unit: AskableUnit,
  gramsPerCup?: number,
): InUnit {
  const target = normalizeUnit(unit);
  const parts = amount.parts.filter((part) => part.qty > 0);
  if (!target || parts.length === 0) return { ok: false, why: "none" };
  const want = kindOf(target.family);
  let metric = 0;
  let estimated = false;
  let unchanged = true;
  for (const part of parts) {
    const kind = kindOf(part.family);
    if (kind === "other") {
      return { ok: false, why: "count", part: formatAmount({ parts: [part] }) };
    }
    if (part.family !== target.family || part.unit !== target.unit) {
      unchanged = false;
    }
    let value = part.qty * unitSize(part.unit) * metricPerBase(part.family);
    if (kind !== want) {
      if (!(gramsPerCup && gramsPerCup > 0)) {
        return {
          ok: false,
          why: "density",
          part: formatAmount({ parts: [part] }),
        };
      }
      /* ml → g, or g → ml, at the density. */
      value =
        kind === "volume"
          ? (value * gramsPerCup) / ML_PER_CUP
          : (value * ML_PER_CUP) / gramsPerCup;
      estimated = true;
    }
    metric += value;
  }
  const text =
    target.family === "metric-weight"
      ? roundMetric(metric, "g", "kg")
      : target.family === "metric-volume"
        ? roundMetric(metric, "ml", "l")
        : inUsUnit(
            metric / metricPerBase(target.family) / unitSize(target.unit),
            target,
          );
  if (target.family.startsWith("metric")) {
    /* g and kg are one family: the list writes whichever the size asks. */
    unchanged = parts.every((part) => part.family === target.family);
  }
  return { ok: true, text, estimated, unchanged };
}

/**
 * A US amount in the very unit asked for ("32 oz", "¾ lb", "12 tbsp"), to
 * the eighth as the list writes fractions; below an eighth of it, the list's
 * own ladder (`formatAmount`), never "0 lb".
 */
function inUsUnit(
  qty: number,
  target: { unit: string; family: AmountPart["family"] },
): string {
  if (qty < 1 / 16) {
    return formatAmount({
      parts: [{ qty, unit: target.unit, family: target.family }],
    });
  }
  const number = formatAmount({ parts: [{ qty, unit: "", family: "count" }] });
  const plural = target.unit === "cup" && qty > 1 + 1 / 16;
  return `${number} ${plural ? "cups" : target.unit}`;
}
// --- 49c: names that are never one thing to buy (Dc3) ---------------------

/**
 * Names that look alike and are not the same thing to buy (Dc3): each entry
 * is a few kinds of one thing, and two names in different kinds are known
 * different — "Look for more" drops a group holding such a pair, and the
 * table (`SHOPPING_EQUIVALENTS`) never proposes one. A member is a name key,
 * or `*word` for every key that is that word or ends with it ("*oil": olive
 * oil, canola oil). 49a's judgement calls, and the pairs qwen3:8b grouped in
 * 49c's real check.
 */
export interface KnownDifferent {
  /** What they all are, for the line saying why ("salt", "a fat and an oil"). */
  what: string;
  kinds: readonly (readonly string[])[];
}

export const SHOPPING_KNOWN_DIFFERENT: readonly KnownDifferent[] = [
  {
    what: "leavening",
    kinds: [
      [
        "baking powder",
        "double acting baking powder",
        "aluminum free baking powder",
      ],
      ["baking soda"],
      ["yeast", "*yeast"],
      ["cream of tartar"],
    ],
  },
  {
    what: "butter",
    kinds: [["salted butter"], ["unsalted butter"]],
  },
  {
    what: "a fat and an oil",
    kinds: [
      [
        "butter",
        "salted butter",
        "unsalted butter",
        "ghee",
        "margarine",
        "shortening",
        "vegetable shortening",
        "lard",
      ],
      ["*oil", "cooking spray", "nonstick cooking spray"],
    ],
  },
  {
    what: "salt",
    kinds: [
      ["salt", "table salt", "iodized salt", "fine salt"],
      ["kosher salt", "coarse kosher salt"],
      ["sea salt", "fine sea salt", "coarse sea salt"],
      /* A finishing salt, not one to bake with (the 49c review). */
      ["flaky sea salt", "flaky salt", "maldon salt"],
      ["*seasoned salt", "garlic salt", "celery salt", "onion salt"],
    ],
  },
  {
    what: "sugar",
    kinds: [
      [
        "granulated sugar",
        "cane sugar",
        "granulated cane sugar",
        "white cane sugar",
      ],
      ["superfine sugar", "caster sugar"],
      ["brown sugar", "light brown sugar", "dark brown sugar"],
      ["powdered sugar"],
      [
        "coarse sugar",
        "sanding sugar",
        "turbinado sugar",
        "demerara sugar",
        "pearl sugar",
      ],
    ],
  },
  {
    what: "olive oil",
    kinds: [["olive oil", "light olive oil"], ["extra virgin olive oil"]],
  },
  {
    what: "oil",
    kinds: [
      ["vegetable oil"],
      ["canola oil"],
      ["olive oil", "light olive oil", "extra virgin olive oil"],
      ["coconut oil"],
      ["sesame oil", "toasted sesame oil"],
      ["avocado oil"],
      ["peanut oil"],
    ],
  },
  {
    what: "a spice and a blend",
    kinds: [
      [
        "cinnamon",
        "nutmeg",
        "ground ginger",
        "clove",
        "ground clove",
        "allspice",
        "cumin",
        "ground cumin",
        "cardamom",
        "paprika",
        "smoked paprika",
        "coriander",
        "ground coriander",
        "turmeric",
        "black pepper",
        "cayenne pepper",
        "oregano",
        "thyme",
        "mace",
      ],
      [
        "*spice",
        "*seasoning",
        "garam masala",
        "chili powder",
        "curry powder",
        "five spice powder",
        "herbes de provence",
        "za atar",
      ],
    ],
  },
  {
    what: "fresh and dried",
    kinds: [["ginger", "fresh ginger"], ["ground ginger"]],
  },
  {
    what: "garlic",
    kinds: [
      ["garlic", "garlic clove"],
      ["garlic powder", "granulated garlic", "garlic salt"],
    ],
  },
  {
    what: "onion",
    kinds: [
      ["onion", "yellow onion", "white onion"],
      ["onion powder", "onion salt"],
    ],
  },
  {
    /* 49a's own exclusions from the all-purpose set. */
    what: "flour",
    kinds: [
      equivalenceOf("all purpose flour")?.members ?? ["all purpose flour"],
      ["bread flour"],
      ["cake flour", "pastry flour"],
      ["wheat flour", "white wheat flour", "whole wheat pastry flour"],
      ["almond flour", "almond meal"],
      ["self rising flour"],
      ["rye flour"],
    ],
  },
  {
    what: "oats",
    kinds: [
      equivalenceOf("rolled oats")?.members ?? ["rolled oats"],
      ["quick oats", "quick cooking oats", "instant oats"],
      ["steel cut oats"],
    ],
  },
  {
    what: "milk",
    kinds: [
      ["milk"],
      ["buttermilk", "low fat buttermilk"],
      ["coconut milk", "canned coconut milk"],
      ["almond milk"],
      ["oat milk"],
      ["soy milk"],
      ["evaporated milk", "canned evaporated milk"],
      ["sweetened condensed milk", "canned sweetened condensed milk"],
    ],
  },
  {
    what: "cream",
    kinds: [
      ["cream", "heavy cream", "whipping cream"],
      ["sour cream"],
      ["cream cheese"],
      ["ice cream"],
      ["creme fraiche"],
    ],
  },
  {
    what: "broth",
    kinds: [
      ["chicken broth", "chicken stock"],
      ["beef broth", "beef stock"],
      ["vegetable broth", "vegetable stock"],
    ],
  },
  {
    what: "vinegar",
    kinds: [
      ["white vinegar", "distilled white vinegar"],
      ["red wine vinegar"],
      ["white wine vinegar"],
      ["apple cider vinegar", "cider vinegar"],
      ["balsamic vinegar"],
      ["rice vinegar", "rice wine vinegar", "seasoned rice vinegar"],
      ["sherry vinegar"],
    ],
  },
];

function memberMatches(member: string, key: string): boolean {
  if (!member.startsWith("*")) return member === key;
  const word = member.slice(1);
  return key === word || key.endsWith(` ${word}`);
}

/** Which kind of `entry` a name key is: the first that names it, or -1. */
function kindIndex(entry: KnownDifferent, key: string): number {
  return entry.kinds.findIndex((kind) =>
    kind.some((member) => memberMatches(member, key)),
  );
}

/**
 * Whether two name keys are known different things to buy (Dc3): the entry
 * that puts them in different kinds, if any.
 */
export function knownDifferent(
  a: string,
  b: string,
): KnownDifferent | undefined {
  if (a === b) return undefined;
  return SHOPPING_KNOWN_DIFFERENT.find((entry) => {
    const left = kindIndex(entry, a);
    const right = kindIndex(entry, b);
    return left >= 0 && right >= 0 && left !== right;
  });
}

/**
 * Whether two name keys are kinds-alike in the list (49c review): one entry
 * puts both in the same kind — salt and table salt, heavy and whipping
 * cream.
 */
export function knownSameKind(a: string, b: string): boolean {
  /* Named members only: "*spice" holds every blend, not one product. */
  const named = (entry: KnownDifferent, key: string) =>
    entry.kinds.findIndex((kind) => kind.includes(key));
  return SHOPPING_KNOWN_DIFFERENT.some((entry) => {
    const left = named(entry, a);
    return left >= 0 && left === named(entry, b);
  });
}

/** The first known-different pair among these name keys, and why. */
export function knownDifferentPair(
  keys: readonly string[],
): { a: string; b: string; what: string } | undefined {
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const entry = knownDifferent(keys[i], keys[j]);
      if (entry) return { a: keys[i], b: keys[j], what: entry.what };
    }
  }
  return undefined;
}
