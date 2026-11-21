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
 * 50a: with a `compose`, the list is composed — base → rules → layers
 * (`shoppingLayers.ts`): the leave-off rules (water) take rows off, then
 * this list's layers, in order, merge, rename, drop, re-amount, note and
 * re-aisle rows by item id. Each changed row carries its chain
 * (`changes`) and the base labels it came from (`asWritten`); what was
 * taken off is `leftOff`, with why and who said so.
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
  keepsItsForm,
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
  amountInUnit,
  consolidateAmounts,
  countsAs,
  equivalenceOf,
  gramsPerCupFor,
  type ShoppingMerge,
} from "./shoppingMerges";
import {
  isStaleLayer,
  leaveOffVerdicts,
  sortLayers,
  type ShoppingLayer,
  type ShoppingLayerBy,
  type ShoppingLayerOp,
  type ShoppingLayerOpKind,
  type ShoppingRule,
} from "./shoppingLayers";
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
  /* 50a: "sprinkles", "oats", "grits" are already the plural. */
  if (keepsItsForm(word)) return word;
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
  /**
   * 50a: a volume and a weight of one name added through a density
   * (`GRAMS_PER_CUP`), or an amount converted into another unit: the amount
   * reads "≈".
   */
  estimated?: boolean;
  /** 50a: a layer's notes, shown under the row ("or make from ~4 pears"). */
  notes?: string[];
  /**
   * 50a (composed lists only): what changed the row since the items made
   * it, in order — a rule's merge, then each layer's op, with who and why.
   */
  changes?: ShoppingChange[];
  /** 50a: with `changes`, the base rows' labels it came from ("as written"). */
  asWritten?: string[];
}

/** 50a: one step of a row's chain (Da5). */
export interface ShoppingChange {
  /** A layer of this list, or a rule for every list (49a's merge decisions). */
  source: "layer" | "rule";
  /** The layer's id, or the merge decision's. */
  id: string;
  op: ShoppingLayerOpKind;
  /** A layer's maker. Absent for a rule. */
  by?: ShoppingLayerBy;
  /** The layer's reason. */
  reason?: string;
  /** What it did, as a person reads it: "renamed to vanilla". */
  text: string;
  /** It applied to nothing on this row, and why ("2 cans is a count…"). */
  skipped?: string;
}

/** 50a: a row taken off the list, and who said so (Da5). */
export interface ShoppingLeftOff {
  /** The row as it would read. */
  row: ShoppingRow;
  reason: string;
  /** Water (`built-in`), a leave-off rule, or one of this list's layers. */
  source: "built-in" | "rule" | "layer";
  /** A layer's maker. */
  by?: ShoppingLayerBy;
  /** The layer's id, or the rule's. */
  id?: string;
  /** The name key a rule (or a built-in) matched: what Restore restores. */
  key?: string;
}

/** 50a: what composes the list over its base rows (Da4). */
export interface ShoppingCompose {
  /** This list's layers, any order (applied by id). */
  layers?: readonly ShoppingLayer[];
  /** The rules for every list: leave-off. */
  rules?: readonly ShoppingRule[];
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
  /**
   * 50a: rows taken off the list — a leave-off rule's (water) or a layer's
   * drop. Empty without a `compose`.
   */
  leftOff: ShoppingLeftOff[];
  counts: {
    /** Stored items. */
    items: number;
    /** Rows, folds included. */
    rows: number;
    /** Rows still to buy: on the store lists. */
    remaining: number;
    checked: number;
    onHand: number;
    /** 50a: rows left off (a composed list only). */
    leftOff?: number;
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
 * weight). 50a: a layer's merge or rename too, with no `decision`.
 */
interface MergeContext {
  /** 49a's decision; absent for a layer's merge or rename (50a). */
  decision?: ShoppingMerge;
  /** The row's name: the person's, the curated set's, or the commonest. */
  label: string;
  /** `label` is the person's: shown as typed, never made plural. */
  named: boolean;
  gramsPerCup?: number;
  countUnits: Readonly<Record<string, string>>;
}

/**
 * The density a row's sum uses: its merge's (49a), else — 50a, "4 cups +
 * 10 g all purpose flour" — its own name's, so one name in cups and grams
 * adds up too.
 */
function densityOf(entries: Entry[], merge?: MergeContext): number | undefined {
  if (merge) return merge.gramsPerCup;
  const key = entries[0]?.name.key;
  return key && isNamed(key) ? gramsPerCupFor(key) : undefined;
}

function amountsOf(entries: Entry[], merge?: MergeContext): Amount[] {
  return entries.flatMap((entry) =>
    entry.amount && !entry.alternative
      ? [
          countsAs(
            scaleAmount(entry.amount, entry.factor),
            merge?.countUnits[entry.name.key],
          ),
        ]
      : [],
  );
}

function sumOf(
  entries: Entry[],
  merge?: MergeContext,
): { amount: Amount; estimated: boolean } {
  return consolidateAmounts(
    amountsOf(entries, merge),
    densityOf(entries, merge),
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

  if (!features.merge && !merge) {
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
    if (merge?.decision) {
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
        if (estimated) {
          row.estimated = true;
          if (row.merge) row.merge.estimated = true;
        }
      }
      const raw = entries.filter((entry) => entry.amount === null).map(rawLine);
      if (raw.length > 0) row.raw = raw;
      const own = merge?.decision?.amount;
      if (own && row.merge) {
        /*
         * 49a (Da4): the person's amount holds while the row covers exactly
         * the items it was given for; otherwise the sum, and a note.
         */
        if (sameIds(own.ids, row.ids)) {
          row.merge.amountEdited = true;
          delete row.merge.estimated;
          delete row.estimated;
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

// --- composition (50a) -------------------------------------------------------

/**
 * One row on its way to the list (50a): its items, how it reads (a merge
 * decision's or a layer's name), and what the layers set on it. `render`
 * makes the row.
 */
interface Draft {
  key: string;
  entries: Entry[];
  merge?: MergeContext;
  /** The name it routes, ticks by name and is kept on hand by. */
  routeName: ShoppingName;
  /** A layer's amount: the person's own, or the sum in another unit. */
  amount?: { text: string; estimated: boolean };
  /** A layer's aisle. */
  aisle?: Aisle;
  notes: string[];
  changes: ShoppingChange[];
}

function byItemId(a: Entry, b: Entry): number {
  return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
}

/** The unique name keys of a draft's own lines (not its `OR:` lines). */
function draftKeys(draft: Draft): string[] {
  return [
    ...new Set(
      draft.entries
        .filter((entry) => !entry.alternative)
        .map((entry) => entry.name.key),
    ),
  ];
}

/** A draft's label context for a layer to change: its merge's, or its name's. */
function ownContext(draft: Draft): MergeContext {
  if (draft.merge) return draft.merge;
  const first = draft.entries.find((entry) => !entry.alternative)!;
  return {
    label: first.name.label,
    named: false,
    gramsPerCup: isNamed(first.name.key)
      ? gramsPerCupFor(first.name.key)
      : undefined,
    countUnits: {},
  };
}

/** Why an amount would not convert, in the words 49c's panel uses. */
function cannotConvert(
  why: "count" | "density" | "none",
  name: string,
  part?: string,
): string {
  if (why === "count") {
    return `${part ?? "it"} is a count, not a weight or a volume`;
  }
  if (why === "density") {
    return `no weight for a cup of ${name} on file, so ${part ?? "it"} can't be converted`;
  }
  return "no amount to convert";
}

/**
 * Apply one op of a layer to the drafts (Da4): the rows its ids reach,
 * in list order. A merged row is reached by any of its ids; a row taken off
 * is reached by none.
 */
function applyOp(
  op: ShoppingLayerOp,
  index: number,
  layer: ShoppingLayer,
  state: {
    drafts: Draft[];
    reach: Map<string, Draft>;
    leftOff: { draft: Draft; reason: string; layer: ShoppingLayer }[];
    features: ShoppingFeatures;
  },
): void {
  const { drafts, reach, features } = state;
  const reached = [
    ...new Set(
      op.ids.flatMap((id) => {
        const draft = reach.get(id);
        return draft ? [draft] : [];
      }),
    ),
  ].sort((a, b) => drafts.indexOf(a) - drafts.indexOf(b));
  if (reached.length === 0) return;
  const change = (text: string, skipped?: string): ShoppingChange => ({
    source: "layer",
    id: layer.id,
    op: op.op,
    by: { ...layer.by },
    ...(layer.reason ? { reason: layer.reason } : {}),
    text,
    ...(skipped ? { skipped } : {}),
  });
  const labelOf = (draft: Draft) =>
    buildRow(draft.key, draft.entries, features, draft.merge).label;

  switch (op.op) {
    case "merge": {
      if (reached.length < 2) {
        reached[0].changes.push(
          change("merge", "only one of its rows is on the list"),
        );
        return;
      }
      const [first] = reached;
      const own = ownContext(first);
      const label = op.name ?? own.label;
      const entries = reached.flatMap((draft) => draft.entries).sort(byItemId);
      const keys = [
        ...new Set(
          entries
            .filter((entry) => !entry.alternative)
            .map((entry) => entry.name.key),
        ),
      ];
      const named = shoppingNameOf(label);
      /*
       * 50a review: what an earlier layer set on a part — its amount, or
       * another part's aisle — is the part's, not the merged row's: the
       * chain says so.
       */
      const changesOf = (draft: Draft, isFirst: boolean) =>
        draft.changes.map((step) =>
          !step.skipped &&
          step.source === "layer" &&
          (step.op === "amount" || (step.op === "aisle" && !isFirst))
            ? { ...step, skipped: "merged into another row later" }
            : step,
        );
      const merged: Draft = {
        key: `layer:${layer.id}:${index}`,
        entries,
        merge: {
          label,
          named: op.name !== undefined || own.named,
          gramsPerCup: gramsPerCupFor(
            isNamed(named.key) ? named.key : "",
            keys,
          ),
          countUnits: Object.assign(
            {},
            ...reached.map((draft) => draft.merge?.countUnits ?? {}),
          ),
        },
        routeName: first.routeName,
        ...(op.amount && features.quantities
          ? { amount: { text: op.amount, estimated: false } }
          : {}),
        ...(first.aisle ? { aisle: first.aisle } : {}),
        notes: reached.flatMap((draft) => draft.notes),
        changes: [
          ...reached.flatMap((draft, at) => changesOf(draft, at === 0)),
          change(`merged ${reached.map(labelOf).join(" + ")}`),
        ],
      };
      drafts.splice(drafts.indexOf(first), 1, merged);
      for (const other of reached.slice(1)) {
        drafts.splice(drafts.indexOf(other), 1);
      }
      for (const entry of entries) reach.set(entry.item.id, merged);
      return;
    }
    case "rename":
      for (const draft of reached) {
        draft.merge = { ...ownContext(draft), label: op.name, named: true };
        draft.changes.push(change(`renamed to ${op.name}`));
      }
      return;
    case "drop":
      for (const draft of reached) {
        drafts.splice(drafts.indexOf(draft), 1);
        for (const entry of draft.entries) reach.delete(entry.item.id);
        state.leftOff.push({ draft, reason: op.reason, layer });
      }
      return;
    case "amount":
      for (const draft of reached) {
        if (!features.quantities) {
          draft.changes.push(change("amount", "amounts are switched off"));
          continue;
        }
        /* A raw line (merge off) shows as written: no amount of its own. */
        if (
          !draft.merge &&
          !(features.merge && isNamed(draft.entries[0].name.key))
        ) {
          draft.changes.push(
            change("amount", "this line shows as written (merge is off)"),
          );
          continue;
        }
        if (op.amount) {
          draft.amount = { text: op.amount, estimated: false };
          draft.changes.push(change(`amount: ${op.amount}`));
          continue;
        }
        const context = ownContext(draft);
        const total = addAmounts(...amountsOf(draft.entries, draft.merge));
        const converted = amountInUnit(total, op.unit!, context.gramsPerCup);
        if (converted.ok) {
          draft.amount = {
            text: converted.text,
            estimated: converted.estimated,
          };
          draft.changes.push(
            change(
              `in ${op.unit}: ${converted.estimated ? "≈ " : ""}${converted.text}`,
            ),
          );
        } else {
          draft.changes.push(
            change(
              `in ${op.unit}`,
              cannotConvert(converted.why, context.label, converted.part),
            ),
          );
        }
      }
      return;
    case "note":
      for (const draft of reached) {
        draft.notes.push(op.text);
        draft.changes.push(change(`note: ${op.text}`));
      }
      return;
    case "aisle":
      for (const draft of reached) {
        draft.aisle = op.aisle;
        draft.changes.push(change(`aisle: ${AISLE_LABELS[op.aisle]}`));
      }
      return;
  }
}

/**
 * The list, from the stored items and settings, the shared inventory's
 * items and the staples (`DEFAULT_STAPLES`).
 *
 * 50a: with `compose`, the list is composed — the leave-off rules (water,
 * built in; a person's own) take rows off, then this list's layers apply in
 * id order, each op to the rows its item ids reach. Without it the view is
 * the base and 49a's merges, as it always was.
 */
export function buildShoppingView(
  items: ShoppingItem[],
  settings: ShoppingSettings,
  inventory: string[] = [],
  staples: string[] = DEFAULT_STAPLES,
  /** 49a: the stored merge decisions; only `merged` ones change the view. */
  merges: readonly ShoppingMerge[] = [],
  /** 50a: the rules and this list's layers over the base rows. */
  compose?: ShoppingCompose,
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
  /* 50a: the base rows' groups (no decisions), for a changed row's "as written". */
  const baseGroups = new Map<string, Entry[]>();
  /* Item id → the group its row is keyed by, for the `OR:` lines that follow. */
  const groupOf = new Map<string, string>();
  const baseGroupOf = new Map<string, string>();
  const push = (map: Map<string, Entry[]>, key: string, entry: Entry) => {
    const group = map.get(key);
    if (group) group.push(entry);
    else map.set(key, [entry]);
  };
  for (const item of sorted) {
    const parent = alternativeOf.get(item.id);
    const parentKey = parent === undefined ? undefined : groupOf.get(parent);
    if (parentKey !== undefined) {
      const entry: Entry = {
        item,
        name: nameOf(item.text),
        factor: factorOf(item),
        amount: null,
        alternative: true,
      };
      groupOf.set(item.id, parentKey);
      groups.get(parentKey)!.push(entry);
      if (compose) {
        const baseKey = baseGroupOf.get(parent!)!;
        baseGroupOf.set(item.id, baseKey);
        push(baseGroups, baseKey, entry);
      }
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
    const baseKey = features.merge ? `name:${name.key}` : item.id;
    const key = decision ? `merge:${decision.id}` : baseKey;
    groupOf.set(item.id, key);
    push(groups, key, entry);
    if (compose) {
      baseGroupOf.set(item.id, baseKey);
      push(baseGroups, baseKey, entry);
    }
  }

  const drafts: Draft[] = [];
  for (const [key, entries] of groups) {
    const decision = key.startsWith("merge:")
      ? mergeOf.get(entries[0].name.key)
      : undefined;
    const merge = decision ? mergeContext(decision, entries) : undefined;
    drafts.push({
      key,
      entries,
      merge,
      /*
       * 49a (Da5): a merged row is routed, ticked by name and kept on hand
       * by its merged name — "all-purpose flour" — so one aisle override
       * covers it, whichever of its names a later list brings.
       */
      routeName: merge ? shoppingNameOf(merge.label) : entries[0].name,
      notes: [],
      /* 50a: a rule's merge is the first step of a composed row's chain. */
      changes:
        compose && decision
          ? [
              {
                source: "rule",
                id: decision.id,
                op: "merge",
                text: `merged ${decision.keys.join(" + ")} (a rule for every list)`,
              },
            ]
          : [],
    });
  }

  const leftOffDrafts: {
    draft: Draft;
    reason: string;
    source: ShoppingLeftOff["source"];
    by?: ShoppingLayerBy;
    id?: string;
    key?: string;
  }[] = [];
  if (compose) {
    /*
     * Rules (Da3): a row every one of whose names is left off goes off —
     * every alternative too: "2 cups water or chicken stock" stays.
     */
    const verdicts = leaveOffVerdicts(compose.rules ?? []);
    for (const draft of [...drafts]) {
      const keys = draftKeys(draft);
      if (keys.length === 0 || !keys.every((key) => verdicts.has(key))) {
        continue;
      }
      const alternatives = draft.entries.every(
        (entry) =>
          entry.alternative ||
          (entry.name.requirement?.alternatives ?? []).every((name) =>
            verdicts.has(nameKey(name)),
          ),
      );
      if (!alternatives) continue;
      const verdict = verdicts.get(keys[0])!;
      drafts.splice(drafts.indexOf(draft), 1);
      leftOffDrafts.push({
        draft,
        reason: verdict.reason,
        source: verdict.builtIn ? "built-in" : "rule",
        ...(verdict.rule ? { id: verdict.rule } : {}),
        key: keys[0],
      });
    }

    /* Layers (Da4), in id order: on, and naming an item still on the list. */
    const present = new Set(items.map((item) => item.id));
    const reach = new Map<string, Draft>();
    for (const draft of drafts) {
      for (const entry of draft.entries) reach.set(entry.item.id, draft);
    }
    const dropped: { draft: Draft; reason: string; layer: ShoppingLayer }[] =
      [];
    for (const layer of sortLayers(compose.layers ?? [])) {
      if (!layer.on || isStaleLayer(layer, present)) continue;
      layer.ops.forEach((op, index) =>
        applyOp(op, index, layer, {
          drafts,
          reach,
          leftOff: dropped,
          features,
        }),
      );
    }
    for (const { draft, reason, layer } of dropped) {
      leftOffDrafts.push({
        draft,
        reason,
        source: "layer",
        by: { ...layer.by },
        id: layer.id,
      });
    }
  }

  /* 50a: item id → the base row's label it is part of ("as written"). */
  let baseLabels: Map<string, string> | undefined;
  const asWrittenOf = (entries: Entry[]): string[] => {
    if (!baseLabels) {
      baseLabels = new Map();
      for (const [key, group] of baseGroups) {
        const { label } = buildRow(key, group, features);
        for (const entry of group) baseLabels.set(entry.item.id, label);
      }
    }
    const labels = new Set<string>();
    for (const entry of entries) {
      if (entry.alternative) continue;
      const label = baseLabels.get(entry.item.id);
      if (label !== undefined) labels.add(label);
    }
    return [...labels];
  };

  const render = (draft: Draft): ShoppingRow => {
    const { entries, merge, routeName } = draft;
    const row = buildRow(draft.key, entries, features, merge);
    if (merge?.decision && isNamed(routeName.key)) {
      row.nameKey = routeName.key;
    }
    /* A layer's amount stands as the person's own does (49a, Da4). */
    const named =
      merge !== undefined || (features.merge && isNamed(entries[0].name.key));
    if (draft.amount && features.quantities && named) {
      const text = draft.amount.estimated
        ? `≈ ${draft.amount.text}`
        : draft.amount.text;
      row.quantity = text;
      row.label = `${text} ${row.name}`;
      delete row.remaining;
      if (draft.amount.estimated) row.estimated = true;
      else delete row.estimated;
      if (row.merge) {
        delete row.merge.estimated;
        delete row.merge.amountStale;
      }
    }
    /*
     * An override is keyed by `shoppingNameOf(...).key`, `text:` keys
     * included — which `aisleFor`'s own lookup (by words) never meets.
     */
    const override = settings.aisleOverrides[routeName.key];
    const aisle =
      draft.aisle ??
      (isAisle(override)
        ? override
        : aisleFor(
            isNamed(routeName.key) ? routeName.key : routeName.label,
            settings.aisleOverrides,
          ));
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
    if (draft.notes.length > 0) row.notes = [...draft.notes];
    if (compose && draft.changes.length > 0) {
      row.changes = draft.changes.map((step) => ({ ...step }));
      row.asWritten = asWrittenOf(entries);
    }
    return row;
  };

  const inventoryItems = features.onHand
    ? inventory.map(parseInventoryItem)
    : [];
  const stapleItems = features.onHand ? staples.map(parseInventoryItem) : [];

  const storeLists = new Map<string | undefined, ShoppingRow[]>();
  const onHand: ShoppingRow[] = [];
  const checked: ShoppingRow[] = [];
  let rowCount = 0;

  for (const draft of drafts) {
    const row = render(draft);
    rowCount += 1;
    if (row.checked) {
      checked.push(row);
      continue;
    }
    if (
      features.onHand &&
      !row.need &&
      draft.routeName.requirement &&
      probablyOnHand(draft.routeName.requirement, inventoryItems, stapleItems)
    ) {
      onHand.push(row);
      continue;
    }
    const listKey = features.stores ? row.store : undefined;
    const list = storeLists.get(listKey);
    if (list) list.push(row);
    else storeLists.set(listKey, [row]);
  }

  const leftOff: ShoppingLeftOff[] = leftOffDrafts.map(
    ({ draft, ...rest }) => ({ row: render(draft), ...rest }),
  );

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
    leftOff,
    counts: {
      items: items.length,
      rows: rowCount,
      remaining,
      checked: checked.length,
      onHand: onHand.length,
      ...(compose ? { leftOff: leftOff.length } : {}),
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
  const leftOff = view.leftOff.filter((off) => off.row.store === store);
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
    leftOff,
    counts: {
      items: rows.reduce((sum, row) => sum + row.total, 0),
      rows: rows.length,
      remaining: stores.reduce((sum, list) => sum + list.count, 0),
      checked: checked.length,
      onHand: onHand.length,
      ...(view.counts.leftOff !== undefined ? { leftOff: leftOff.length } : {}),
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
    /* 50a: a layer's note reads under its row, as on the page. */
    ...(row.notes ?? []).map((note) => `  · ${note}`),
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
