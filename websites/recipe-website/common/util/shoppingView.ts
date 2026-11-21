/**
 * The shopping list as a person reads it (epic 35, D3): stored items in,
 * merged, quantified, sectioned, split by store and folded out.
 *
 * Nothing here is stored. `buildShoppingView` runs on every render — the
 * editor's `/shopping` page, `recipes shopping`, the `shopping_get` tool — so
 * each feature in `settings.features` is a switch that changes only what is
 * shown, and a better amount parser or aisle table improves lists already
 * written. `formatShoppingText` makes the plain text a person copies into a
 * message or a notes app.
 *
 * Every feature off is a plain checklist of the lines as written, in the
 * order they were added (Roger's "only use features needed at the time").
 *
 * 49a: a person's merge decisions (`shoppingMerges.ts`) join rows of
 * different names — "1 cup white flour" and "2 cups all-purpose flour" —
 * into one, with the merge switch on. The decisions are stored; the rows
 * they make are worked out here like every other row.
 *
 * Pure, and safe in the browser.
 */
import Fraction from "fraction.js";
import { fold } from "../components/SearchForm/queryLanguage";
import { AISLE_LABELS, AISLES, aisleFor, isAisle, type Aisle } from "./aisles";
import {
  addAmounts,
  formatAmount,
  parseAmount,
  scaleAmount,
  type Amount,
} from "./ingredientAmount";
import {
  nameKey,
  nameLabel,
  parseIngredientLine,
  stripOrLabel,
  type Requirement,
} from "./ingredientNames";
import {
  DEFAULT_STAPLES,
  parseInventoryItem,
  probablyOnHand,
} from "./makeable";
import { formatScale, parseScale } from "./scale";
import {
  activeMerges,
  consolidateAmounts,
  countsAs,
  equivalenceOf,
  gramsPerCupFor,
  type ShoppingMerge,
} from "./shoppingMerges";
import type {
  ShoppingFeatures,
  ShoppingItem,
  ShoppingSettings,
  ShoppingStore,
  ShoppingSubRecipe,
} from "./shoppingTypes";

// --- names -----------------------------------------------------------------

/** What a line names, as the list keys and labels it. */
export interface ShoppingName {
  /**
   * `nameKey` of the line's first name (`egg`, `all purpose flour`), or —
   * for a line no name can be read from — `text:` and the folded line, so
   * only identical lines share it.
   */
  key: string;
  /** `nameLabel` of that name, or the line as written. */
  label: string;
  /** The parsed requirement, which the "probably on hand" check judges. */
  requirement?: Requirement;
}

/**
 * 43a: "optional: gel food coloring & sprinkles for decorating" is a list of
 * things to buy, but the name reader (which never splits on `and`, for
 * "mac and cheese") took the whole of it as one name — so it never met the
 * same recipe's comma form, "gel food coloring, sprinkles, …", which keys by
 * its first item, and the list showed two rows for one jar. A line that
 * joins its items with `&` or `and` and ends in a decorating tail is read
 * the way the comma form is: by its first item. Any other line is untouched.
 */
const DECORATING_LIST_RE =
  /^(.+?)\s+(?:&|and)\s+[^,;]+?\s+for\s+(?:decorat|garnish|top|dust|dipp|sprinkl|serv)\w*\s*$/i;

function decoratingListHead(text: string): string {
  const match = DECORATING_LIST_RE.exec(text.trim());
  return match ? match[1] : text;
}

/**
 * The name a line (or a typed name, "eggs") is merged, ticked and routed by.
 * A line with alternatives (`lemon or lime juice`) goes by its first, as the
 * aisle measure counts it (35b).
 */
export function shoppingNameOf(text: string): ShoppingName {
  const [requirement] = parseIngredientLine(decoratingListHead(text));
  const name = requirement?.alternatives[0];
  if (requirement && name && name.words.length > 0) {
    return { key: nameKey(name), label: nameLabel(name), requirement };
  }
  return {
    key: `text:${fold(text).replace(/\s+/g, " ").trim()}`,
    label: text.trim(),
  };
}

export function isNamed(key: string): boolean {
  return !key.startsWith("text:");
}

/** `egg` → `eggs`, `berry` → `berries`, `leaf` → `leaves`: enough for a list. */
function pluralWord(word: string): string {
  if (/(?:s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(?:tomato|potato)$/.test(word)) return `${word}es`;
  if (/(?:leaf|loaf|half)$/.test(word)) return `${word.slice(0, -1)}ves`;
  if (/knife$/.test(word)) return `${word.slice(0, -2)}ves`;
  return `${word}s`;
}

/**
 * How a merged name reads beside its amount. `ingredientNames` keeps names
 * singular; a list reads `3 eggs` and `1 cup chocolate chips`, so the last
 * word goes plural when the amount is a count above one, or when a source
 * line wrote it that way (`semi-sweet chocolate chips`) — but never for one
 * of a thing.
 */
function displayName(
  name: string,
  amount: Amount,
  texts: string[],
  exact = false,
): string {
  /* 49a: a name the person typed for a merged row reads as typed. */
  if (exact) return name;
  /* `2 cans tomatoes`, not `2 cans canned tomatoes` (43n, Dn2): the key
   * keeps `canned`, the line says it once. */
  const label =
    name.startsWith("canned ") &&
    amount.parts.length > 0 &&
    amount.parts.every((part) => part.unit === "can")
      ? name.slice("canned ".length)
      : name;
  const words = label.split(" ");
  const last = words[words.length - 1];
  if (!last || !/^\p{L}+$/u.test(last)) return label;
  const counts = amount.parts.filter((part) => part.family === "count");
  const onlyCount = counts.length === 1 && amount.parts.length === 1;
  if (onlyCount && counts[0].qty <= 1) return label;
  const plural = pluralWord(last);
  const pluralRe = new RegExp(`\\b${plural}\\b`);
  const written = texts.some((text) => pluralRe.test(fold(text)));
  if (!written && !(onlyCount && counts[0].qty > 1)) return label;
  return [...words.slice(0, -1), plural].join(" ");
}

/**
 * A merged row's line: the amount, then the name — `2 cups flour`, `3 eggs`,
 * `1 lb + 2 cups butter`. A bare count beside a measure goes first, with the
 * noun it counts (35d): `2 onions + 1 cup`, `1 carrot + 2 lb` — where
 * `formatAmount` alone would read `2 + 1 cup onion`.
 */
export function lineFor(
  label: string,
  amount: Amount,
  texts: string[],
  extras: string[] = [],
  exact = false,
): string {
  const counts = amount.parts.filter((part) => part.family === "count");
  const measures = amount.parts.filter((part) => part.family !== "count");
  const suffix = extras.map((extra) => ` + ${extra}`).join("");
  if (counts.length === 0 || measures.length === 0) {
    return `${formatAmount(amount)} ${displayName(label, amount, texts, exact)}${suffix}`;
  }
  const counted: Amount = { parts: counts };
  return `${formatAmount(counted)} ${displayName(label, counted, texts, exact)} + ${formatAmount({ parts: measures })}${suffix}`;
}

/** A row's `quantity`, joined the way its line is: the count first. */
export function quantityFor(amount: Amount, extras: string[] = []): string {
  const counts = amount.parts.filter((part) => part.family === "count");
  const measures = amount.parts.filter((part) => part.family !== "count");
  const suffix = extras.map((extra) => ` + ${extra}`).join("");
  if (counts.length === 0 || measures.length === 0) {
    return `${formatAmount(amount)}${suffix}`;
  }
  return `${formatAmount({ parts: counts })} + ${formatAmount({ parts: measures })}${suffix}`;
}

/**
 * What a line with no amount adds beside a measured one of the same name
 * (38d): "pinch salt" and "2 tsp salt" are "2 tsp salt + a pinch". A pinch
 * and a dash say so; "to taste", "for garnish" and a bare name are "as
 * needed". In this order, each once.
 */
const AS_NEEDED_EXTRAS = ["a pinch", "a dash", "as needed"] as const;

function asNeededExtra(text: string): (typeof AS_NEEDED_EXTRAS)[number] {
  const plain = stripOrLabel(text) ?? text;
  if (/\bpinch(?:es)?\b/i.test(plain)) return "a pinch";
  if (/\bdash(?:es)?\b/i.test(plain)) return "a dash";
  return "as needed";
}

// --- the view model ----------------------------------------------------------

/** One item behind a row, when `sources` is on. */
export interface ShoppingRowSource {
  id: string;
  /** The line as written, at 1×. */
  text: string;
  recipe?: string;
  recipeName?: string;
  /** The meal plan path, root first. */
  via?: string[];
  /** `"2"`, `"1/2"`, when not 1. */
  scale?: string;
  manual?: boolean;
  checked?: boolean;
  /** 38d: the sub-recipes the line came through, outermost first. */
  for?: ShoppingSubRecipe[];
  /** 38d: an `OR:` line folded into the row (its `text` keeps the label). */
  alternative?: boolean;
}

/** 49a: one item behind a merged row, for "merged from: …". */
export interface ShoppingMergedLine {
  id: string;
  /** The line as written, with its scale when not 1×. */
  text: string;
  recipe?: string;
  recipeName?: string;
  manual?: boolean;
}

/** 49a: what a merge decision made of a row. */
export interface ShoppingRowMerge {
  /** The decision's id: Split deletes it. */
  id: string;
  /** The decision's name keys. */
  keys: string[];
  /** Each item the row merges (not its `OR:` lines), in the order added. */
  from: ShoppingMergedLine[];
  /** A volume and a weight added through a density: the amount reads "≈". */
  estimated?: boolean;
  /** The amount is the person's own (the decision's `amount`). */
  amountEdited?: boolean;
  /**
   * The person's amount was for other items than the row holds now: the row
   * shows the sum, and says so.
   */
  amountStale?: boolean;
  /** The label is the name the person typed. */
  named?: boolean;
}

/** One line on the list: one item, or (merge on) every item of one name. */
export interface ShoppingRow {
  /** Stable across renders: `name:<nameKey>` merged, else the item id. */
  key: string;
  /** The items behind the row, in the order they were added. Tick these. */
  ids: string[];
  /**
   * The line as shown and copied: `2 cups flour`, `3 eggs`, the raw line
   * (merge off, or a line with no readable name), or the name alone
   * (quantities off). A partly ticked merged row shows what is left to buy.
   */
  label: string;
  /** The ingredient name (merged) or the raw line. */
  name: string;
  /** The name key the row merges, ticks and routes by. */
  nameKey: string;
  /** Quantities on: the whole row's amount, formatted, when one was read. */
  quantity?: string;
  /** Partly ticked (and quantities on): what the unticked items still need. */
  remaining?: string;
  /**
   * Merge and quantities on: lines whose amount could not be read, as
   * written (with their scale), listed under the merged name.
   */
  raw?: string[];
  /** Merge off: the item's scale when not 1, as a badge (`2×`, `½×`). */
  scale?: string;
  /**
   * 38d: `OR:` lines under one of the row's lines — another way to buy it —
   * without the label and with their scale: "¼ cup (50g) green sanding
   * sugar and ¼ cup (50g) red sanding sugar". Their items are in `ids` (a
   * tick ticks them too) but not in the amounts or the counts.
   */
  alternatives?: string[];
  /**
   * 38d: which sub-recipes the row's lines are for — "for Simple Syrup",
   * "partly for Pie Crust" when the row also holds the recipe's own lines,
   * with what a line called for when it was not a number of batches.
   */
  forNote?: string;
  /** Aisles on: the row's aisle. */
  aisle?: Aisle;
  /** Stores on: the store id the row is bought at. */
  store?: string;
  /** Stores on: an item of the row names its store itself (not routed). */
  storePinned?: boolean;
  /** Every item ticked. */
  checked: boolean;
  /** Some items ticked, not all. */
  partial: boolean;
  checkedCount: number;
  total: number;
  /** Some item says "buy anyway". */
  need: boolean;
  /** Every item is optional in its recipe. */
  optional: boolean;
  /**
   * 46h (43-Da1): some items optional, not all. "optional for Lemon Bars"
   * when the optional lines come from recipes that need it nowhere else,
   * otherwise "partly optional". Absent when `optional` or nothing is.
   */
  partlyOptional?: string;
  /** Every item was typed in by hand. */
  manual: boolean;
  /** Sources on: where each item came from. */
  sources?: ShoppingRowSource[];
  /**
   * 49a: the row is a merge decision's — several names as one (`key` is
   * `merge:<id>`).
   */
  merge?: ShoppingRowMerge;
}

export interface ShoppingSection {
  /** Absent when aisles are off: the whole list is one section. */
  aisle?: Aisle;
  label?: string;
  rows: ShoppingRow[];
}

export interface ShoppingStoreList {
  /** Absent when stores are off: one list for everything. */
  store?: ShoppingStore;
  sections: ShoppingSection[];
  /** Rows on this list. */
  count: number;
}

export interface ShoppingView {
  features: ShoppingFeatures;
  /** One per store when stores are on (settings order, empty ones too), else one. */
  stores: ShoppingStoreList[];
  /** onHand on: unticked rows the inventory or the staples probably cover. */
  onHand: ShoppingRow[];
  /** Rows with every item ticked. */
  checked: ShoppingRow[];
  counts: {
    /** Stored items. */
    items: number;
    /** Rows, folds included. */
    rows: number;
    /** Rows still to buy: on the store lists. */
    remaining: number;
    checked: number;
    onHand: number;
  };
}

interface Entry {
  item: ShoppingItem;
  name: ShoppingName;
  factor: number;
  /** `null`: numbers the amount parser could not read. */
  amount: Amount | null;
  /** 38d: an `OR:` line folded into the line before it. */
  alternative?: boolean;
}

export function factorOf(item: ShoppingItem): number {
  const scale = parseScale(item.scale);
  return scale ? Number(scale.valueOf()) : 1;
}

function scaleBadge(item: ShoppingItem): string | undefined {
  const scale = parseScale(item.scale);
  return scale && !scale.equals(1) ? formatScale(scale) : undefined;
}

export function sourceOf(item: ShoppingItem): ShoppingRowSource {
  const scale = parseScale(item.scale);
  return {
    id: item.id,
    text: item.text,
    ...(item.recipe ? { recipe: item.recipe } : {}),
    ...(item.recipeName ? { recipeName: item.recipeName } : {}),
    ...(item.via?.length ? { via: [...item.via] } : {}),
    ...(scale && !scale.equals(1) ? { scale: item.scale } : {}),
    ...(item.manual ? { manual: true } : {}),
    ...(item.checked ? { checked: true } : {}),
    ...(item.for?.length ? { for: item.for.map((sub) => ({ ...sub })) } : {}),
  };
}

/** "for Simple Syrup", "partly for Pie Crust (½ oz called for)". */
function forNoteOf(entries: Entry[]): string | undefined {
  const subs = new Set<string>();
  for (const { item } of entries) {
    const inner = item.for?.[item.for.length - 1];
    if (!inner) continue;
    subs.add(
      inner.called ? `${inner.name} (${inner.called} called for)` : inner.name,
    );
  }
  if (subs.size === 0) return undefined;
  const joined = joinNames([...subs]);
  const every = entries.every((entry) => entry.item.for?.length);
  return `${every ? "for" : "partly for"} ${joined}`;
}

/** Joins names as prose: "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * 46h (43-Da1): a row of some optional and some required lines is still
 * bought (a recipe needs it), but says whose lines were optional.
 */
function partlyOptionalOf(entries: Entry[]): string | undefined {
  const optional = entries.filter((entry) => entry.item.optional);
  if (optional.length === 0 || optional.length === entries.length) {
    return undefined;
  }
  const whose = (entry: Entry) =>
    entry.item.recipeName ?? entry.item.recipe ?? undefined;
  const required = new Set(
    entries.filter((entry) => !entry.item.optional).map(whose),
  );
  const names = [...new Set(optional.map(whose))];
  if (names.some((name) => !name || required.has(name))) {
    return "partly optional";
  }
  return `optional for ${joinNames(names as string[])}`;
}

/** The unique as-needed extras of the entries read as needed, in order. */
function extrasOf(entries: Entry[]): string[] {
  const found = new Set(
    entries
      .filter((entry) => entry.amount && entry.amount.parts.length === 0)
      .map((entry) => asNeededExtra(entry.item.text)),
  );
  return AS_NEEDED_EXTRAS.filter((extra) => found.has(extra));
}

/**
 * 49a: a merge decision applied to a row — the label, and how its names'
 * amounts add (a container for a counted name, a density for volume and
 * weight).
 */
interface MergeContext {
  decision: ShoppingMerge;
  /** The row's name: the person's, the curated set's, or the commonest. */
  label: string;
  /** `label` is the person's: shown as typed, never made plural. */
  named: boolean;
  gramsPerCup?: number;
  countUnits: Readonly<Record<string, string>>;
}

function sumOf(
  entries: Entry[],
  merge?: MergeContext,
): { amount: Amount; estimated: boolean } {
  if (!merge) {
    return {
      amount: addAmounts(
        ...entries.flatMap((entry) =>
          entry.amount ? [scaleAmount(entry.amount, entry.factor)] : [],
        ),
      ),
      estimated: false,
    };
  }
  return consolidateAmounts(
    entries.flatMap((entry) =>
      entry.amount
        ? [
            countsAs(
              scaleAmount(entry.amount, entry.factor),
              merge.countUnits[entry.name.key],
            ),
          ]
        : [],
    ),
    merge.gramsPerCup,
  );
}

/** A raw line under a merged name: as written, with its scale. */
function rawLine(entry: Entry): string {
  const badge = scaleBadge(entry.item);
  return badge ? `${entry.item.text} (${badge})` : entry.item.text;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((id, index) => id === sorted[index]);
}

function buildRow(
  key: string,
  group: Entry[],
  features: ShoppingFeatures,
  merge?: MergeContext,
): ShoppingRow {
  /* `OR:` lines ride along (their ids tick with the row) but count for nothing. */
  const entries = group.filter((entry) => !entry.alternative);
  const alternatives = group.filter((entry) => entry.alternative);
  const items = entries.map((entry) => entry.item);
  const checkedCount = items.filter((item) => item.checked).length;
  const first = entries[0];
  const row: ShoppingRow = {
    key,
    ids: [...items, ...alternatives.map((entry) => entry.item)].map(
      (item) => item.id,
    ),
    label: first.item.text,
    name: first.item.text,
    nameKey: first.name.key,
    checked: checkedCount === items.length,
    partial: checkedCount > 0 && checkedCount < items.length,
    checkedCount,
    total: items.length,
    need: items.some((item) => item.need),
    optional: items.every((item) => item.optional),
    manual: items.every((item) => item.manual),
  };

  if (!features.merge) {
    /* One item: the line as written, its scale a badge. */
    const badge = scaleBadge(first.item);
    if (features.quantities) {
      if (first.amount && first.amount.parts.length > 0) {
        row.quantity = formatAmount(scaleAmount(first.amount, first.factor));
      }
      if (badge) {
        row.scale = badge;
        row.label = `${first.item.text} (${badge})`;
      }
    }
  } else if (!merge && !isNamed(first.name.key)) {
    /* Identical unnamed lines: the line once, with how many lots. */
    const lots = entries.reduce((sum, entry) => sum + entry.factor, 0);
    if (features.quantities && Math.abs(lots - 1) > 1e-9) {
      row.label = `${first.item.text} (${formatScale(new Fraction(lots))})`;
    }
  } else {
    const texts = items.map((item) => item.text);
    const base = merge?.label ?? first.name.label;
    const exact = merge?.named ?? false;
    const { amount: total, estimated } = sumOf(entries, merge);
    /* 49a: a density's sum is an estimate, and reads as one. */
    const approx = (text: string, estimate: boolean) =>
      estimate ? `≈ ${text}` : text;
    row.name = displayName(base, total, texts, exact);
    row.label = row.name;
    if (merge) {
      row.merge = {
        id: merge.decision.id,
        keys: [...merge.decision.keys],
        from: entries.map((entry) => ({
          id: entry.item.id,
          text: rawLine(entry),
          ...(entry.item.recipe ? { recipe: entry.item.recipe } : {}),
          ...(entry.item.recipeName
            ? { recipeName: entry.item.recipeName }
            : {}),
          ...(entry.item.manual ? { manual: true } : {}),
        })),
        ...(merge.named ? { named: true } : {}),
      };
    }
    if (features.quantities) {
      /* "pinch salt" beside "2 tsp salt": "2 tsp salt + a pinch" (38d). */
      const extras = extrasOf(entries);
      if (total.parts.length > 0) {
        row.quantity = approx(quantityFor(total, extras), estimated);
        row.label = approx(
          lineFor(base, total, texts, extras, exact),
          estimated,
        );
        if (estimated && row.merge) row.merge.estimated = true;
      }
      const raw = entries.filter((entry) => entry.amount === null).map(rawLine);
      if (raw.length > 0) row.raw = raw;
      const own = merge?.decision.amount;
      if (own && row.merge) {
        /*
         * 49a (Da4): the person's amount holds while the row covers exactly
         * the items it was given for; otherwise the sum, and a note.
         */
        if (sameIds(own.ids, row.ids)) {
          row.merge.amountEdited = true;
          delete row.merge.estimated;
          row.quantity = own.text;
          row.label = `${own.text} ${row.name}`;
        } else {
          row.merge.amountStale = true;
        }
      }
      /* The person's own amount stands, partly ticked or not (49a review):
       * its note still says how many lines are ticked. */
      if (row.partial && !row.merge?.amountEdited) {
        const unticked = entries.filter((entry) => !entry.item.checked);
        const left = sumOf(unticked, merge);
        if (left.amount.parts.length > 0) {
          const leftExtras = extrasOf(unticked);
          row.remaining = approx(
            quantityFor(left.amount, leftExtras),
            left.estimated,
          );
          row.label = approx(
            lineFor(base, left.amount, texts, leftExtras, exact),
            left.estimated,
          );
        }
      }
    }
  }

  if (alternatives.length > 0) {
    /* A row merged from several recipes: say whose the other way is. */
    const several =
      new Set(entries.map((entry) => entry.item.recipe ?? "")).size > 1;
    row.alternatives = alternatives.map((entry) => {
      const text = (stripOrLabel(entry.item.text) ?? entry.item.text).trim();
      const badge = scaleBadge(entry.item);
      const line = features.quantities && badge ? `${text} (${badge})` : text;
      const whose = entry.item.recipeName ?? entry.item.recipe;
      return several && whose ? `${line} — in ${whose}` : line;
    });
  }
  const forNote = forNoteOf(entries);
  if (forNote) row.forNote = forNote;
  const partlyOptional = partlyOptionalOf(entries);
  if (partlyOptional) row.partlyOptional = partlyOptional;
  if (features.sources) {
    row.sources = [
      ...items.map(sourceOf),
      ...alternatives.map((entry) => ({
        ...sourceOf(entry.item),
        alternative: true,
      })),
    ];
  }
  return row;
}

/**
 * 38d: each `OR:` line's item → the item of the line just above it in the
 * same lot — one recipe, added once, through one plan path and sub-recipe
 * path at one scale — so "OR: ¼ cup green sanding sugar …" shows on the
 * granulated sugar's row as "or …" instead of a row of its own. The nearest
 * earlier such item, since ids sort by when they were added: a second lot
 * of the same recipe finds its own. A line typed by hand, or one whose line
 * above is gone, keeps its own row. Exported for the seat, whose name
 * ticks and Clear take a row's alternatives along as a tap on the row does.
 */
export function orParents(
  items: readonly ShoppingItem[],
  sorted = false,
): Map<string, string> {
  if (!sorted) {
    items = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  const parents = new Map<string, string>();
  /* Lot → line index → the latest item of that line. */
  const lots = new Map<string, Map<number, string>>();
  for (const item of items) {
    if (item.recipe === undefined || item.line === undefined) continue;
    const lot = JSON.stringify([
      item.recipe,
      item.via ?? [],
      item.scale ?? "",
      (item.for ?? []).map((sub) => sub.slug),
    ]);
    let lines = lots.get(lot);
    if (!lines) {
      lines = new Map();
      lots.set(lot, lines);
    }
    if (stripOrLabel(item.text)?.trim()) {
      const parent = lines.get(item.line - 1);
      if (parent !== undefined) parents.set(item.id, parent);
    }
    lines.set(item.line, item.id);
  }
  return parents;
}

/**
 * 49a: how a merged row reads and adds. Its name is the person's, else the
 * curated set's when every name of the decision is in one set, else the
 * label of the name with the most lines (the first of a tie).
 */
function mergeContext(decision: ShoppingMerge, entries: Entry[]): MergeContext {
  const sets = new Set(decision.keys.map((key) => equivalenceOf(key)));
  const set = sets.size === 1 ? [...sets][0] : undefined;
  let label = set?.name;
  if (!label) {
    const counts = new Map<string, { label: string; count: number }>();
    for (const entry of entries) {
      if (entry.alternative) continue;
      const seen = counts.get(entry.name.key);
      if (seen) seen.count += 1;
      else counts.set(entry.name.key, { label: entry.name.label, count: 1 });
    }
    let best: { label: string; count: number } | undefined;
    for (const each of counts.values()) {
      if (!best || each.count > best.count) best = each;
    }
    label = best?.label ?? entries[0].name.label;
  }
  const named = decision.name !== undefined;
  const canonical = set?.key ?? shoppingNameOf(label).key;
  return {
    decision,
    label: decision.name ?? label,
    named,
    gramsPerCup: gramsPerCupFor(canonical, decision.keys),
    countUnits: set?.countUnits ?? {},
  };
}

/** D2's store order: item → name override → aisle → default. */
function routeStore(
  entries: Entry[],
  key: string,
  aisle: Aisle,
  settings: ShoppingSettings,
): string | undefined {
  const known = new Set(settings.stores.map((store) => store.id));
  const pick = (id: string | undefined) =>
    id !== undefined && known.has(id) ? id : undefined;
  for (const entry of entries) {
    const own = pick(entry.item.store);
    if (own) return own;
  }
  return (
    pick(settings.storeOverrides[key]) ??
    pick(settings.storeByAisle[aisle]) ??
    pick(settings.defaultStore) ??
    settings.stores[0]?.id
  );
}

/**
 * The list, from the stored items and settings, the shared inventory's
 * items and the staples (`DEFAULT_STAPLES`).
 */
export function buildShoppingView(
  items: ShoppingItem[],
  settings: ShoppingSettings,
  inventory: string[] = [],
  staples: string[] = DEFAULT_STAPLES,
  /** 49a: the stored merge decisions; only `merged` ones change the view. */
  merges: readonly ShoppingMerge[] = [],
): ShoppingView {
  const features = settings.features;
  /* Insertion order: ids are ULIDs. */
  const sorted = [...items].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const names = new Map<string, ShoppingName>();
  const nameOf = (text: string) => {
    let name = names.get(text);
    if (!name) {
      name = shoppingNameOf(text);
      names.set(text, name);
    }
    return name;
  };

  const alternativeOf = orParents(sorted, true);
  /*
   * 49a: merged decisions with two or more of their names on the list (an
   * `OR:` line folds into its parent's row, so its own name is no row).
   */
  const mergeOf = features.merge
    ? activeMerges(
        merges,
        new Set(
          sorted
            .filter((item) => !alternativeOf.has(item.id))
            .map((item) => nameOf(item.text).key),
        ),
      )
    : new Map<string, ShoppingMerge>();
  const groups = new Map<string, Entry[]>();
  /* Item id → the group its row is keyed by, for the `OR:` lines that follow. */
  const groupOf = new Map<string, string>();
  for (const item of sorted) {
    const parent = alternativeOf.get(item.id);
    const parentKey = parent === undefined ? undefined : groupOf.get(parent);
    if (parentKey !== undefined) {
      groupOf.set(item.id, parentKey);
      groups.get(parentKey)!.push({
        item,
        name: nameOf(item.text),
        factor: factorOf(item),
        amount: null,
        alternative: true,
      });
      continue;
    }
    const name = nameOf(item.text);
    const entry: Entry = {
      item,
      name,
      factor: factorOf(item),
      amount: features.quantities ? parseAmount(item.text) : null,
    };
    const decision = mergeOf.get(name.key);
    const key = decision
      ? `merge:${decision.id}`
      : features.merge
        ? `name:${name.key}`
        : item.id;
    groupOf.set(item.id, key);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  const inventoryItems = features.onHand
    ? inventory.map(parseInventoryItem)
    : [];
  const stapleItems = features.onHand ? staples.map(parseInventoryItem) : [];

  const storeLists = new Map<string | undefined, ShoppingRow[]>();
  const onHand: ShoppingRow[] = [];
  const checked: ShoppingRow[] = [];
  let rowCount = 0;

  for (const [key, entries] of groups) {
    const decision = key.startsWith("merge:")
      ? mergeOf.get(entries[0].name.key)
      : undefined;
    const merge = decision ? mergeContext(decision, entries) : undefined;
    const row = buildRow(key, entries, features, merge);
    rowCount += 1;
    /*
     * 49a (Da5): a merged row is routed, ticked by name and kept on hand by
     * its merged name — "all-purpose flour" — so one aisle override covers
     * it, whichever of its names a later list brings.
     */
    const routeName = merge ? shoppingNameOf(merge.label) : entries[0].name;
    if (merge && isNamed(routeName.key)) row.nameKey = routeName.key;
    /*
     * An override is keyed by `shoppingNameOf(...).key`, `text:` keys
     * included — which `aisleFor`'s own lookup (by words) never meets.
     */
    const override = settings.aisleOverrides[routeName.key];
    const aisle = isAisle(override)
      ? override
      : aisleFor(
          isNamed(routeName.key) ? routeName.key : routeName.label,
          settings.aisleOverrides,
        );
    if (features.aisles) row.aisle = aisle;
    if (features.stores) {
      row.store = routeStore(entries, routeName.key, aisle, settings);
      if (
        entries.some((entry) =>
          settings.stores.some((store) => store.id === entry.item.store),
        )
      ) {
        row.storePinned = true;
      }
    }

    if (row.checked) {
      checked.push(row);
      continue;
    }
    if (
      features.onHand &&
      !row.need &&
      routeName.requirement &&
      probablyOnHand(routeName.requirement, inventoryItems, stapleItems)
    ) {
      onHand.push(row);
      continue;
    }
    const listKey = features.stores ? row.store : undefined;
    const list = storeLists.get(listKey);
    if (list) list.push(row);
    else storeLists.set(listKey, [row]);
  }

  const order = [
    ...settings.aisleOrder,
    ...AISLES.filter((aisle) => !settings.aisleOrder.includes(aisle)),
  ];
  const sectioned = (rows: ShoppingRow[]): ShoppingSection[] => {
    if (!features.aisles) return rows.length > 0 ? [{ rows }] : [];
    return order.flatMap((aisle) => {
      const inAisle = rows.filter((row) => row.aisle === aisle);
      return inAisle.length > 0
        ? [{ aisle, label: AISLE_LABELS[aisle], rows: inAisle }]
        : [];
    });
  };

  const stores: ShoppingStoreList[] = features.stores
    ? settings.stores.map((store) => {
        const rows = storeLists.get(store.id) ?? [];
        return { store, sections: sectioned(rows), count: rows.length };
      })
    : [
        {
          sections: sectioned(storeLists.get(undefined) ?? []),
          count: storeLists.get(undefined)?.length ?? 0,
        },
      ];
  const remaining = stores.reduce((sum, list) => sum + list.count, 0);

  return {
    features: { ...features },
    stores,
    onHand,
    checked,
    counts: {
      items: items.length,
      rows: rowCount,
      remaining,
      checked: checked.length,
      onHand: onHand.length,
    },
  };
}

/**
 * Only one store's list (and the folds), for "what's left at Market Basket".
 * The counts are the narrowed view's own.
 */
export function viewForStore(view: ShoppingView, store: string): ShoppingView {
  const stores = view.stores.filter((list) => list.store?.id === store);
  const onHand = view.onHand.filter((row) => row.store === store);
  const checked = view.checked.filter((row) => row.store === store);
  const rows = [
    ...stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...onHand,
    ...checked,
  ];
  return {
    ...view,
    stores,
    onHand,
    checked,
    counts: {
      items: rows.reduce((sum, row) => sum + row.total, 0),
      rows: rows.length,
      remaining: stores.reduce((sum, list) => sum + list.count, 0),
      checked: checked.length,
      onHand: onHand.length,
    },
  };
}

// --- text ------------------------------------------------------------------

export interface ShoppingTextOptions {
  /** List the ticked rows at the end (default no). */
  checked?: boolean;
  /** List the "probably on hand" fold at the end (default yes, when on). */
  onHand?: boolean;
}

function rowLines(row: ShoppingRow): string[] {
  return [
    row.label,
    ...(row.raw ?? []).map((line) => `  · ${line}`),
    ...(row.alternatives ?? []).map((line) => `  · or ${line}`),
  ];
}

/**
 * The list as plain text for copying: a heading per store (stores on) and
 * per aisle (aisles on), then one simple line per row — `2 cups flour` —
 * with unread lines and `OR:` alternatives (`· or …`) indented under their
 * name. Ticked rows are left out unless `checked`; the "probably on hand"
 * fold comes last, under its own heading.
 */
export function formatShoppingText(
  view: ShoppingView,
  { checked = false, onHand = true }: ShoppingTextOptions = {},
): string {
  const blocks: string[] = [];
  for (const list of view.stores) {
    if (list.count === 0) continue;
    const lines: string[] = [];
    if (list.store) lines.push(list.store.name.toUpperCase());
    list.sections.forEach((section, index) => {
      if (section.label) {
        if (index > 0 || list.store) lines.push("");
        lines.push(`${section.label}:`);
      }
      for (const row of section.rows) lines.push(...rowLines(row));
    });
    blocks.push(lines.join("\n"));
  }
  if (onHand && view.onHand.length > 0) {
    blocks.push(
      ["Probably on hand:", ...view.onHand.flatMap(rowLines)].join("\n"),
    );
  }
  if (checked && view.checked.length > 0) {
    blocks.push(["Checked:", ...view.checked.flatMap(rowLines)].join("\n"));
  }
  if (blocks.length > 0) return blocks.join("\n\n");
  return view.counts.items > 0 ? "Nothing left to buy." : "The list is empty.";
}

// --- sub-recipe groups (39c) -------------------------------------------------

/**
 * The items a sub-recipe's expansion put on the list (38-Dd1): every item
 * whose `for` path names `slug`, at any depth. `for` is a path, not a set —
 * a line under Lavender Syrup under Simple Syrup is the lavender syrup's,
 * and it goes with either — so an item is taken whole, never trimmed.
 */
export function itemsForSubRecipe(
  items: readonly ShoppingItem[],
  slug: string,
): ShoppingItem[] {
  return items.filter((item) => item.for?.some((sub) => sub.slug === slug));
}

/** One sub-recipe expanded onto the list: what "Remove these" takes (39c). */
export interface ShoppingSubRecipeGroup {
  slug: string;
  /** Its name, as the first of its lines recorded it. */
  name: string;
  /** Every item `itemsForSubRecipe` finds for it, ticked ones too. */
  ids: string[];
  /**
   * What it was expanded for, in order: the recipe's name for a sub-recipe
   * the recipe links itself, the outer sub-recipe's for one inside another.
   */
  usedBy: string[];
}

/**
 * Every sub-recipe on the list, in the order its first line was added, with
 * the items it put there — the `/shopping` page's "Remove these" rows. Read
 * from the items alone, whatever the `subRecipes` switch says now: the
 * switch governs adds (38-Dd1), and these lines are already on the list.
 */
export function subRecipeGroups(
  items: readonly ShoppingItem[],
): ShoppingSubRecipeGroup[] {
  const sorted = [...items].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const groups = new Map<string, ShoppingSubRecipeGroup>();
  for (const item of sorted) {
    (item.for ?? []).forEach((sub, depth) => {
      let group = groups.get(sub.slug);
      if (!group) {
        group = { slug: sub.slug, name: sub.name, ids: [], usedBy: [] };
        groups.set(sub.slug, group);
      }
      if (!group.ids.includes(item.id)) group.ids.push(item.id);
      const parent =
        depth > 0
          ? item.for![depth - 1].name
          : (item.recipeName ?? item.recipe);
      if (parent && !group.usedBy.includes(parent)) group.usedBy.push(parent);
    });
  }
  return [...groups.values()];
}
