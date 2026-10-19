/**
 * The `/shopping` page's own groupings (42g): presentation only (42-D5).
 *
 * `buildShoppingView` stays the one source of the list's rows, counts and
 * copy text — the CLI, the MCP `shopping_get` and the page all read it. The
 * page then regroups what it shows in two ways, both here so they can be
 * tested without a browser:
 *
 * - **In the store** (`shopAisles`): one section per aisle, ticked rows put
 *   back where they were rather than moved to a fold, the "probably on
 *   hand" rows beside their aisle, and the per-browser "aisle done" state.
 * - **At home** (`listOrigins`, `removalPatch`): what is on the list by plan
 *   and recipe, read from the items' `via` and `recipe`, as
 *   `subRecipeGroups` reads their `for` — and the one write that takes an
 *   origin's lines off.
 *
 * Pure, and safe in the browser.
 */
import { AISLES, AISLE_LABELS, type Aisle } from "./aisles";
import type { ShoppingItem } from "./shoppingTypes";
import type { ShoppingRow, ShoppingView } from "./shoppingView";

// --- counting ----------------------------------------------------------------

/** Every row the view shows: the store lists, then the folds. */
export function allRows(view: ShoppingView): ShoppingRow[] {
  return [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.onHand,
    ...view.checked,
  ];
}

/**
 * How many rows hold any of `ids` — lines as the page counts them, so a row
 * merged from two recipes counts once for each (39-Dc7).
 */
export function rowsHolding(
  view: ShoppingView,
  ids: { has(id: string): boolean; size: number },
): number {
  if (ids.size === 0) return 0;
  return allRows(view).filter((row) => row.ids.some((id) => ids.has(id)))
    .length;
}

// --- in the store --------------------------------------------------------------

/** One aisle on the in-store list (or the whole list, aisles off). */
export interface ShopAisle {
  /** The aisle, or `"all"` when aisles are off. */
  id: string;
  aisle?: Aisle;
  label?: string;
  /** Rows to buy and rows ticked, each where it was before it was ticked. */
  rows: ShoppingRow[];
  /** Unticked rows the inventory or the staples probably cover. */
  onHand: ShoppingRow[];
  /** Rows not yet ticked (a partly ticked row counts as left). */
  left: number;
  /** Rows with every line ticked. */
  ticked: number;
}

/**
 * The order a row was first added in: its first item's id. Rows are built in
 * that order (`buildShoppingView` groups items sorted by id), so sorting by it
 * puts a ticked row back between the same neighbours it had unticked.
 */
function placeOf(row: ShoppingRow): string {
  return row.ids[0] ?? row.key;
}

function byPlace(a: ShoppingRow, b: ShoppingRow): number {
  const left = placeOf(a);
  const right = placeOf(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The in-store list (42g): the view's rows to buy, ticked rows and "probably
 * on hand" rows, by aisle in `aisleOrder` (aisles on) or as one section. A
 * ticked row stays in place, struck through, until its aisle is marked done
 * — so nothing jumps under a thumb. Pass a view already narrowed to one
 * store (`viewForStore`) for one store's list. Aisles with nothing in them
 * are left out.
 */
export function shopAisles(
  view: ShoppingView,
  aisleOrder: readonly Aisle[] = AISLES,
): ShopAisle[] {
  const listed = view.stores.flatMap((list) =>
    list.sections.flatMap((section) => section.rows),
  );
  const rows = [...listed, ...view.checked];
  if (!view.features.aisles) {
    if (rows.length === 0 && view.onHand.length === 0) return [];
    return [
      {
        id: "all",
        rows: rows.sort(byPlace),
        onHand: [...view.onHand].sort(byPlace),
        left: rows.filter((row) => !row.checked).length,
        ticked: rows.filter((row) => row.checked).length,
      },
    ];
  }
  const order = [
    ...aisleOrder,
    ...AISLES.filter((aisle) => !aisleOrder.includes(aisle)),
  ];
  return order.flatMap((aisle): ShopAisle[] => {
    const inAisle = rows.filter((row) => row.aisle === aisle).sort(byPlace);
    const onHand = view.onHand
      .filter((row) => row.aisle === aisle)
      .sort(byPlace);
    if (inAisle.length === 0 && onHand.length === 0) return [];
    return [
      {
        id: aisle,
        aisle,
        label: AISLE_LABELS[aisle],
        rows: inAisle,
        onHand,
        left: inAisle.filter((row) => !row.checked).length,
        ticked: inAisle.filter((row) => row.checked).length,
      },
    ];
  });
}

// --- "aisle done", per browser ---------------------------------------------------

/** Where this browser keeps which aisles are done (localStorage, 42-Dg2). */
export const DONE_AISLES_KEY = "shopping-aisles-done";

/** A trip: an aisle marked done longer ago than this is not done any more. */
export const DONE_AISLE_TTL_MS = 12 * 60 * 60_000;

/** One aisle marked done: when, and the items its rows held then. */
export interface DoneAisle {
  at: number;
  ids: string[];
}

/** Scope (a store id, `"all"`, or `"list"` with stores off) → aisle → done. */
export type DoneAisles = Record<string, Record<string, DoneAisle>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What a browser stored, read safely: anything malformed reads as nothing,
 * and an aisle marked done over `DONE_AISLE_TTL_MS` ago is dropped — last
 * week's trip never folds this week's eggs away.
 */
export function readDoneAisles(raw: string | null, now: number): DoneAisles {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const result: DoneAisles = {};
  for (const [scope, aisles] of Object.entries(parsed)) {
    if (!isRecord(aisles)) continue;
    for (const [aisle, entry] of Object.entries(aisles)) {
      if (!isRecord(entry)) continue;
      const { at, ids } = entry;
      if (typeof at !== "number" || !Array.isArray(ids)) continue;
      if (now - at > DONE_AISLE_TTL_MS || at > now + 60_000) continue;
      (result[scope] ??= {})[aisle] = {
        at,
        ids: ids.filter((id): id is string => typeof id === "string"),
      };
    }
  }
  return result;
}

/**
 * An aisle shows as done while every line in it was there when it was marked
 * done: a line added since — more eggs put on the list from home mid-trip,
 * even onto the eggs' merged row — opens it again, so nothing new hides in a
 * fold. Lines taken off leave it done.
 */
export function aisleIsDone(
  entry: DoneAisle | undefined,
  aisle: ShopAisle,
): boolean {
  /* An aisle with no lines to tick (on-hand rows only) is never "done". */
  if (!entry || aisle.rows.length === 0) return false;
  const known = new Set(entry.ids);
  return aisle.rows.every((row) => row.ids.every((id) => known.has(id)));
}

/** The stored map with one aisle marked done (or not), for one scope. */
export function markAisle(
  done: DoneAisles,
  scope: string,
  aisle: ShopAisle,
  value: boolean,
  now: number,
): DoneAisles {
  const aisles = { ...(done[scope] ?? {}) };
  if (value) {
    aisles[aisle.id] = { at: now, ids: aisle.rows.flatMap((row) => row.ids) };
  } else {
    delete aisles[aisle.id];
  }
  const next = { ...done };
  if (Object.keys(aisles).length > 0) next[scope] = aisles;
  else delete next[scope];
  return next;
}

// --- at home: what is on the list, by plan and recipe --------------------------

/** A recipe inside a plan on the list. */
export interface ShoppingOriginRecipe {
  slug: string;
  name: string;
  ids: string[];
}

/** One thing that put lines on the list: a plan, a recipe, or typing. */
export interface ShoppingOrigin {
  kind: "plan" | "recipe" | "typed";
  /** `plan:<slug>`, `recipe:<slug>`, or `typed`. */
  key: string;
  slug?: string;
  name: string;
  /** Every item it put on the list, ticked ones too, in the order added. */
  ids: string[];
  /** A plan's recipes, in the order their first line was added. */
  recipes?: ShoppingOriginRecipe[];
  /** The sub-recipes its lines were expanded through (38d), by name. */
  subRecipes: string[];
}

/** `week-of-oct-19` → `Week of oct 19`, for a plan whose name is unknown. */
function nameFromSlug(slug: string): string {
  const words = slug.replace(/-+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
}

/**
 * What is on the list, by where it came from (42g's "What's on it"): each
 * meal plan the list was given (its outermost plan, `via[0]`) with the
 * recipes it brought, then each recipe added on its own, then lines typed
 * in — in the order each was first added. `planNames` maps a plan's slug to
 * its name (the server reads them); an unknown one reads from its slug.
 */
export function listOrigins(
  items: readonly ShoppingItem[],
  planNames: Readonly<Record<string, string>> = {},
): ShoppingOrigin[] {
  const sorted = [...items].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const origins = new Map<string, ShoppingOrigin>();
  const recipesOf = new Map<string, Map<string, ShoppingOriginRecipe>>();
  for (const item of sorted) {
    const plan = item.via?.[0];
    let key: string;
    let origin: ShoppingOrigin | undefined;
    if (plan) {
      key = `plan:${plan}`;
      origin = origins.get(key);
      if (!origin) {
        origin = {
          kind: "plan",
          key,
          slug: plan,
          name: planNames[plan] ?? nameFromSlug(plan),
          ids: [],
          recipes: [],
          subRecipes: [],
        };
        origins.set(key, origin);
        recipesOf.set(key, new Map());
      }
      if (item.recipe) {
        const recipes = recipesOf.get(key)!;
        let recipe = recipes.get(item.recipe);
        if (!recipe) {
          recipe = {
            slug: item.recipe,
            name: item.recipeName ?? item.recipe,
            ids: [],
          };
          recipes.set(item.recipe, recipe);
          origin.recipes!.push(recipe);
        }
        recipe.ids.push(item.id);
      }
    } else if (item.recipe) {
      key = `recipe:${item.recipe}`;
      origin = origins.get(key);
      if (!origin) {
        origin = {
          kind: "recipe",
          key,
          slug: item.recipe,
          name: item.recipeName ?? item.recipe,
          ids: [],
          subRecipes: [],
        };
        origins.set(key, origin);
      }
    } else {
      key = "typed";
      origin = origins.get(key);
      if (!origin) {
        origin = {
          kind: "typed",
          key,
          name: "Typed in",
          ids: [],
          subRecipes: [],
        };
        origins.set(key, origin);
      }
    }
    origin.ids.push(item.id);
    for (const sub of item.for ?? []) {
      if (!origin.subRecipes.includes(sub.name))
        origin.subRecipes.push(sub.name);
    }
  }
  /* Plans first, then recipes on their own, then typed lines (the canvas). */
  const rank = { plan: 0, recipe: 1, typed: 2 } as const;
  return [...origins.values()].sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** The `PATCH` body that takes an origin's lines off the list. */
export type ShoppingRemoval =
  | { removeSource: { group: string } | { recipe: string } }
  | { remove: string[] };

function sameIds(a: readonly ShoppingItem[], ids: readonly string[]): boolean {
  if (a.length !== ids.length) return false;
  const set = new Set(ids);
  return a.every((item) => set.has(item.id));
}

/**
 * One write for "Remove these": the seat's `removeSource` (39c, a commit
 * that reads "-Week of Oct 19 (12 items)") when it takes exactly the lines
 * the page shows for the origin, otherwise those ids. `{recipe}` takes the
 * recipe's lines that came through a plan too, and `{group}` a plan's lines
 * wherever it is nested — so a recipe also on a plan, or a plan also inside
 * another, goes by ids. Typed lines always go by ids.
 */
export function removalPatch(
  origin: ShoppingOrigin,
  items: readonly ShoppingItem[],
): ShoppingRemoval {
  if (origin.kind === "plan" && origin.slug) {
    const slug = origin.slug;
    const taken = items.filter((item) => (item.via ?? []).includes(slug));
    if (sameIds(taken, origin.ids)) return { removeSource: { group: slug } };
  }
  if (origin.kind === "recipe" && origin.slug) {
    const slug = origin.slug;
    const taken = items.filter((item) => item.recipe === slug);
    if (sameIds(taken, origin.ids)) return { removeSource: { recipe: slug } };
  }
  return { remove: [...origin.ids] };
}
