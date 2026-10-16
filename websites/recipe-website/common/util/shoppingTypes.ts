/**
 * The shopping list's stored shapes and their defaults (epic 35, D1/D2).
 *
 * What is stored is only what a person or a recipe said: one item per line,
 * a few flags, and the settings. Everything a list *shows* — merged rows,
 * quantities, aisles, stores, what is probably on hand — is worked out on
 * every render by `shoppingView.ts` (D3), so each feature is a switch and a
 * better parser improves old lists.
 *
 * Pure, and safe in the browser: the editor's shopping seat reads and
 * writes the files (never anything under `common/` or `export/` — a boundary
 * test pins it), and the page and the CLI share these types and
 * `normalizeShoppingSettings`.
 */
import { AISLES, isAisle, type Aisle } from "./aisles";

/**
 * One line on the list (D2). `text` is the ingredient line with its markup
 * flattened, **at 1×**: the scale lives in `scale`, so the line still reads as
 * the recipe wrote it and the view does the arithmetic.
 */
export interface ShoppingItem {
  /** A lowercase ULID: sorts by when it was added, and names the item's file. */
  id: string;
  text: string;
  /** The recipe the line came from. */
  recipe?: string;
  /** Its name when the line was added, so a list reads without a lookup. */
  recipeName?: string;
  /**
   * The line's index in the ingredient list it was written in: the recipe's,
   * or — for a line from a sub-recipe (`for`) — that sub-recipe's.
   */
  line?: number;
  /** How much of the recipe: `"2"`, `"1/2"` — what `parseScale` reads. */
  scale?: string;
  /** The meal plan path the recipe came through, root first (D6). */
  via?: string[];
  /** The recipe marks the line optional (a garnish, "to taste", …). */
  optional?: boolean;
  /** Typed in by hand, not from a recipe. */
  manual?: boolean;
  checked?: boolean;
  /** Buy it anyway, whatever the inventory says. */
  need?: boolean;
  /** A store id this one item is bought at, over every other rule. */
  store?: string;
  /**
   * 38d: the line came from a sub-recipe that `recipe` links in an
   * ingredient line ("1 batch [Simple Syrup](/recipe/simple-syrup)"),
   * outermost first — a sub-recipe's own sub-recipe makes two. Shown as
   * "for Simple Syrup".
   */
  for?: ShoppingSubRecipe[];
}

/** One sub-recipe a line was expanded through (38d). */
export interface ShoppingSubRecipe {
  slug: string;
  /** Its name when the line was added. */
  name: string;
  /**
   * When the linking line's amount is not a number of batches ("½ oz
   * [simple syrup]"): what it calls for, at the scale added. One batch per
   * batch of the recipe above is listed.
   */
  called?: string;
}

/** The keys an item file is written with, in this order (stable diffs). */
export const SHOPPING_ITEM_KEYS = [
  "id",
  "text",
  "recipe",
  "recipeName",
  "line",
  "scale",
  "via",
  "optional",
  "manual",
  "checked",
  "need",
  "store",
  "for",
] as const satisfies readonly (keyof ShoppingItem)[];

/** Every switch (D2). Everything off is a plain checklist of the raw lines. */
export interface ShoppingFeatures {
  /** One row per ingredient name, amounts added together. */
  merge: boolean;
  /** Show amounts (summed and scaled when merged). */
  quantities: boolean;
  /** Section the list by aisle. */
  aisles: boolean;
  /** Split the list by store. */
  stores: boolean;
  /** Fold away what the inventory (and the staples) probably cover. */
  onHand: boolean;
  /** Keep which recipe (and plan) each row came from. */
  sources: boolean;
  /**
   * 38d: a line that links another recipe ("1 batch [Simple Syrup](…)")
   * goes on the list as that recipe's lines. Read when a recipe or a plan is
   * added: lines already on the list stay as they are.
   */
  subRecipes: boolean;
  /**
   * 38d: ticks stay in this browser until "Done shopping", which saves them
   * as one change, instead of being saved every few seconds.
   */
  holdTicks: boolean;
}

export const SHOPPING_FEATURES = [
  "merge",
  "quantities",
  "aisles",
  "stores",
  "onHand",
  "sources",
  "subRecipes",
  "holdTicks",
] as const satisfies readonly (keyof ShoppingFeatures)[];

export type ShoppingFeature = (typeof SHOPPING_FEATURES)[number];

export interface ShoppingStore {
  /** A slug: `market-basket`. */
  id: string;
  name: string;
}

export interface ShoppingSettings {
  features: ShoppingFeatures;
  /** The aisles in the order a walk round the shop meets them. */
  aisleOrder: Aisle[];
  stores: ShoppingStore[];
  /** Where a row goes when nothing else says (D2's last step). */
  defaultStore: string;
  /** Aisle → store id: produce from Market Basket. */
  storeByAisle: Partial<Record<Aisle, string>>;
  /** Ingredient name key → aisle, over the built-in table. */
  aisleOverrides: Record<string, Aisle>;
  /** Ingredient name key → store id ("always buy eggs at Hannaford"). */
  storeOverrides: Record<string, string>;
}

/**
 * Roger's defaults (D2): merge, quantities, aisles and sources on; and
 * 38-D4's sub-recipes on, held ticks off.
 */
export const DEFAULT_SHOPPING_SETTINGS: ShoppingSettings = {
  features: {
    merge: true,
    quantities: true,
    aisles: true,
    stores: false,
    onHand: false,
    sources: true,
    subRecipes: true,
    holdTicks: false,
  },
  aisleOrder: [...AISLES],
  stores: [
    { id: "market-basket", name: "Market Basket" },
    { id: "hannaford", name: "Hannaford" },
  ],
  defaultStore: "hannaford",
  storeByAisle: { produce: "market-basket" },
  aisleOverrides: {},
  storeOverrides: {},
};

/** A store id: lowercase words joined by hyphens. */
export const STORE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Settings as stored, over the defaults: a missing or malformed key reads as
 * its default, so a file written before a setting existed keeps working, and
 * a hand edit gone wrong degrades to the defaults rather than an error.
 *
 * Also self-consistent: every aisle appears once in `aisleOrder` (missing
 * ones appended in `AISLES` order), store references name a store that
 * exists, and `defaultStore` falls back to the first store.
 */
export function normalizeShoppingSettings(raw: unknown): ShoppingSettings {
  const source = isRecord(raw) ? raw : {};
  const defaults = DEFAULT_SHOPPING_SETTINGS;

  const featureSource = isRecord(source.features) ? source.features : {};
  const features = { ...defaults.features };
  for (const name of SHOPPING_FEATURES) {
    const value = featureSource[name];
    if (typeof value === "boolean") features[name] = value;
  }

  const order: Aisle[] = [];
  if (Array.isArray(source.aisleOrder)) {
    for (const aisle of source.aisleOrder) {
      if (isAisle(aisle) && !order.includes(aisle)) order.push(aisle);
    }
  }
  for (const aisle of AISLES) if (!order.includes(aisle)) order.push(aisle);

  let stores: ShoppingStore[] = [];
  if (Array.isArray(source.stores)) {
    for (const store of source.stores) {
      if (
        isRecord(store) &&
        typeof store.id === "string" &&
        STORE_ID_PATTERN.test(store.id) &&
        typeof store.name === "string" &&
        store.name.trim() &&
        !stores.some((known) => known.id === store.id)
      ) {
        stores.push({ id: store.id, name: store.name.trim() });
      }
    }
  }
  if (!Array.isArray(source.stores) || stores.length === 0) {
    stores = defaults.stores.map((store) => ({ ...store }));
  }
  const storeIds = new Set(stores.map((store) => store.id));

  const defaultStore =
    typeof source.defaultStore === "string" && storeIds.has(source.defaultStore)
      ? source.defaultStore
      : storeIds.has(defaults.defaultStore)
        ? defaults.defaultStore
        : stores[0].id;

  const storeByAisle: Partial<Record<Aisle, string>> = {};
  const byAisle = isRecord(source.storeByAisle)
    ? source.storeByAisle
    : defaults.storeByAisle;
  for (const [aisle, store] of Object.entries(byAisle)) {
    if (isAisle(aisle) && typeof store === "string" && storeIds.has(store)) {
      storeByAisle[aisle] = store;
    }
  }

  const aisleOverrides: Record<string, Aisle> = {};
  if (isRecord(source.aisleOverrides)) {
    for (const [key, aisle] of Object.entries(source.aisleOverrides)) {
      if (key.trim() && isAisle(aisle)) aisleOverrides[key] = aisle;
    }
  }

  const storeOverrides: Record<string, string> = {};
  if (isRecord(source.storeOverrides)) {
    for (const [key, store] of Object.entries(source.storeOverrides)) {
      if (key.trim() && typeof store === "string" && storeIds.has(store)) {
        storeOverrides[key] = store;
      }
    }
  }

  return {
    features,
    aisleOrder: order,
    stores,
    defaultStore,
    storeByAisle,
    aisleOverrides,
    storeOverrides,
  };
}

/**
 * An item as stored: known keys only, in `SHOPPING_ITEM_KEYS` order, falsy
 * flags and empty values left out — so two devices writing the same item
 * write the same bytes.
 */
export function canonicalShoppingItem(item: ShoppingItem): ShoppingItem {
  const out: Record<string, unknown> = {};
  for (const key of SHOPPING_ITEM_KEYS) {
    const value = item[key];
    if (value === undefined || value === null || value === false) continue;
    if (value === "" && key !== "text") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as unknown as ShoppingItem;
}

/**
 * A stored item, read leniently: the shape checked field by field, anything
 * unknown dropped. `null` when it has no usable `id` or `text`.
 */
export function parseShoppingItem(
  raw: unknown,
  fallbackId?: string,
): ShoppingItem | null {
  if (!isRecord(raw)) return null;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim().toLowerCase()
      : fallbackId?.toLowerCase();
  if (!id || typeof raw.text !== "string") return null;
  const item: ShoppingItem = { id, text: raw.text };
  if (typeof raw.recipe === "string" && raw.recipe) item.recipe = raw.recipe;
  if (typeof raw.recipeName === "string" && raw.recipeName) {
    item.recipeName = raw.recipeName;
  }
  if (typeof raw.line === "number" && Number.isInteger(raw.line)) {
    item.line = raw.line;
  }
  if (typeof raw.scale === "string" && raw.scale.trim()) {
    item.scale = raw.scale.trim();
  }
  if (Array.isArray(raw.via)) {
    const via = raw.via.filter(
      (slug): slug is string => typeof slug === "string" && slug.length > 0,
    );
    if (via.length > 0) item.via = via;
  }
  for (const flag of ["optional", "manual", "checked", "need"] as const) {
    if (raw[flag] === true) item[flag] = true;
  }
  if (typeof raw.store === "string" && raw.store) item.store = raw.store;
  if (Array.isArray(raw.for)) {
    const path = raw.for.flatMap((entry): ShoppingSubRecipe[] =>
      isRecord(entry) &&
      typeof entry.slug === "string" &&
      entry.slug &&
      typeof entry.name === "string"
        ? [
            {
              slug: entry.slug,
              name: entry.name,
              ...(typeof entry.called === "string" && entry.called
                ? { called: entry.called }
                : {}),
            },
          ]
        : [],
    );
    if (path.length > 0) item.for = path;
  }
  return canonicalShoppingItem(item);
}
