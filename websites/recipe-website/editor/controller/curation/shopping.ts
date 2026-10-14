/**
 * The editor's shared shopping list (epic 35, D1/D7): one committed file per
 * item, `<content>/shopping/items/<ulid>.json`, and the switches in
 * `<content>/shopping/settings.json`.
 *
 * **One file per item, and no timestamps**, so the Pi and the workstation
 * merge in git without conflicts: two devices adding items, or ticking
 * different ones, never touch the same file — and ticking the same item on
 * both writes the same bytes.
 *
 * **Not a content type**, like the inventory (`inventory.ts`): no config, no
 * index, no registry entry, so no rebuild and no export build ever sees it.
 * A boundary test pins that nothing under `common/` or `export/` names the
 * item directory. What the list *shows* — merged rows, amounts, aisles,
 * stores, the on-hand fold — is `common/util/shoppingView.ts`, computed on
 * every read (D3); this module stores raw lines and flags only.
 *
 * Every write is one write-lock scope (34-D6) that refuses mid-merge before
 * touching a file, writes atomically (34-D8) and lands as exactly one commit
 * — "Update shopping list: +Chili ×2 (12 items)" — through the engine's
 * `commitContentChanges` with the literal paths it wrote or deleted. A write
 * that changes nothing commits nothing.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { writeFileAtomic } from "@discontent/cms/fs/atomicWrite";
import {
  assertNoMergeInProgress,
  commitContentChanges,
} from "@discontent/cms/git/commit";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import { ulid } from "@discontent/cms/util/ulid";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  Group,
  GroupEntryKey,
  GroupEntryValue,
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";
import { AISLES } from "recipe-website-common/util/aisles";
import { detectHeading } from "recipe-website-common/util/detectHeading";
import { walkGroupRecipes } from "recipe-website-common/util/groupShoppingWalk";
import { parseIngredientList } from "recipe-website-common/util/ingredientNames";
import { DEFAULT_STAPLES } from "recipe-website-common/util/makeable";
import { parseScale } from "recipe-website-common/util/scale";
import {
  canonicalShoppingItem,
  normalizeShoppingSettings,
  parseShoppingItem,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import {
  buildShoppingView,
  formatShoppingText,
  shoppingNameOf,
  viewForStore,
  type ShoppingView,
} from "recipe-website-common/util/shoppingView";
import type { CurationContext } from "./context";
import {
  UnknownGroupError,
  UnknownRecipeError,
  ValidationError,
} from "./errors";
import { readInventory } from "./inventory";
import {
  ShoppingAddSchema,
  ShoppingClearSchema,
  ShoppingPatchSchema,
  ShoppingSettingsPatchSchema,
  parseInput,
  type ShoppingAddInput,
  type ShoppingPatchInput,
  type ShoppingSettingsPatch,
} from "./schema";

/** Relative to the content directory — the paths `git add` is given. */
export const SHOPPING_DIRECTORY = "shopping";
export const SHOPPING_ITEMS_DIRECTORY = path.join(SHOPPING_DIRECTORY, "items");
export const SHOPPING_SETTINGS_FILE = path.join(
  SHOPPING_DIRECTORY,
  "settings.json",
);

/** An item file's stem: a ULID, as this module writes it, or close enough. */
const ITEM_FILE = /^([0-9a-z]{10,64})\.json$/i;

export interface ShoppingResult {
  /** In the order they were added (by id). */
  items: ShoppingItem[];
  settings: ShoppingSettings;
  /** Absolute path of the `shopping/` directory (which may not exist yet). */
  path: string;
}

export interface ShoppingViewResult extends ShoppingResult {
  view: ShoppingView;
  /** `formatShoppingText(view)`: what a person copies. */
  text: string;
}

export interface ShoppingAddResult {
  /** The items this call put on the list. */
  added: ShoppingItem[];
  items: ShoppingItem[];
  /** False when there was nothing to add: nothing written or committed. */
  changed: boolean;
  /** A plan's recipes or sub-groups that do not exist, skipped. */
  missing?: { recipes: string[]; groups: string[] };
  /** A plan's cycles, each the path that closes it; skipped. */
  cycles?: string[][];
  warnings?: string[];
}

export interface ShoppingPatchResult {
  items: ShoppingItem[];
  changed: boolean;
  /** Ids of items this call rewrote (ticked, unticked, flagged, moved). */
  updated: string[];
  /** Ids of items this call removed. */
  removed: string[];
  /** Ids the call named that are not on the list (already removed, say). */
  unknown?: string[];
  /** Names that match no item on the list. */
  unmatched?: string[];
}

export interface ShoppingClearResult {
  items: ShoppingItem[];
  changed: boolean;
  removed: string[];
}

export interface ShoppingSettingsResult {
  settings: ShoppingSettings;
  path: string;
  changed?: boolean;
}

export function shoppingPath(ctx: CurationContext): string {
  return path.join(ctx.contentDirectory, SHOPPING_DIRECTORY);
}

function itemFile(id: string): string {
  return path.join(SHOPPING_ITEMS_DIRECTORY, `${id}.json`);
}

function absolute(ctx: CurationContext, relative: string): string {
  return path.join(ctx.contentDirectory, relative);
}

// --- reads -----------------------------------------------------------------

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Every item, sorted by id. A file that does not parse — a hand edit gone
 * wrong, or conflict markers mid-merge — is skipped rather than failing the
 * list. The file name is the item's id, whatever the file says.
 */
export async function readShoppingItems(
  ctx: CurationContext,
): Promise<ShoppingItem[]> {
  let names: string[];
  try {
    names = await readdir(absolute(ctx, SHOPPING_ITEMS_DIRECTORY));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const items: ShoppingItem[] = [];
  for (const name of names) {
    const match = ITEM_FILE.exec(name);
    if (!match) continue;
    try {
      const raw = JSON.parse(
        await readFile(absolute(ctx, itemFile(match[1])), "utf8"),
      ) as unknown;
      const item = parseShoppingItem(raw, match[1]);
      if (item) items.push({ ...item, id: match[1] });
    } catch (error) {
      if (isMissing(error)) continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The settings over the defaults; the defaults when there is no file. */
export async function readShoppingSettings(
  ctx: CurationContext,
): Promise<ShoppingSettings> {
  try {
    return normalizeShoppingSettings(
      JSON.parse(
        await readFile(absolute(ctx, SHOPPING_SETTINGS_FILE), "utf8"),
      ) as unknown,
    );
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) {
      return normalizeShoppingSettings(undefined);
    }
    throw error;
  }
}

export async function readShopping(
  ctx: CurationContext,
): Promise<ShoppingResult> {
  const [items, settings] = await Promise.all([
    readShoppingItems(ctx),
    readShoppingSettings(ctx),
  ]);
  return { items, settings, path: shoppingPath(ctx) };
}

/**
 * The list as a person reads it: the stored items and settings, the view
 * (`buildShoppingView` over the shared on-hand list and the staples) and its
 * copy text. `store` narrows to one store's list — with stores switched on
 * for this answer, so "what's left at Market Basket" works whatever the
 * page's switch says.
 */
export async function readShoppingView(
  ctx: CurationContext,
  { store }: { store?: string } = {},
): Promise<ShoppingViewResult> {
  const [shopping, inventory] = await Promise.all([
    readShopping(ctx),
    readInventory(ctx),
  ]);
  const { items, settings } = shopping;
  let view: ShoppingView;
  if (store !== undefined) {
    if (!settings.stores.some((known) => known.id === store)) {
      throw new ValidationError(
        `No store "${store}". Stores: ${settings.stores.map((known) => known.id).join(", ")}.`,
      );
    }
    view = viewForStore(
      buildShoppingView(
        items,
        { ...settings, features: { ...settings.features, stores: true } },
        inventory.items,
        DEFAULT_STAPLES,
      ),
      store,
    );
  } else {
    view = buildShoppingView(items, settings, inventory.items, DEFAULT_STAPLES);
  }
  return { ...shopping, view, text: formatShoppingText(view) };
}

// --- writes ----------------------------------------------------------------

function serializeItem(item: ShoppingItem): string {
  return `${JSON.stringify(canonicalShoppingItem(item), null, 2)}\n`;
}

/**
 * Write and delete item files, then commit exactly those paths — one commit,
 * or none when there was nothing to do. Called under the write lock.
 */
async function applyItems(
  ctx: CurationContext,
  { write = [], remove = [] }: { write?: ShoppingItem[]; remove?: string[] },
  message: string,
): Promise<boolean> {
  const paths: string[] = [];
  for (const item of write) {
    /* Atomic (D8): a reader never sees half an item, a crash never leaves one. */
    await writeFileAtomic(
      absolute(ctx, itemFile(item.id)),
      serializeItem(item),
    );
    paths.push(itemFile(item.id));
  }
  for (const id of remove) {
    await rm(absolute(ctx, itemFile(id)), { force: true });
    paths.push(itemFile(id));
  }
  if (paths.length === 0) return false;
  await commitContentChanges(message, ctx.author, paths, ctx.contentDirectory);
  return true;
}

/** "+eggs +lemons ✓flour", shortened to fit a commit subject. */
function describe(parts: string[]): string {
  const unique = [...new Set(parts)];
  let text = "";
  for (let i = 0; i < unique.length; i++) {
    const next = text ? `${text} ${unique[i]}` : unique[i];
    if (text && next.length > 56) return `${text} (+${unique.length - i} more)`;
    text = next;
  }
  return text;
}

function count(n: number): string {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

/** How an item reads in a commit subject: its name, else its line. */
function labelOf(item: ShoppingItem): string {
  const { key, label } = shoppingNameOf(item.text);
  const text = key.startsWith("text:") ? item.text.trim() : label;
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** A multiplier as stored: `"2"`, `"1/2"`; absent for 1. */
type Scale = NonNullable<ReturnType<typeof parseScale>>;

function scaleText(scale: Scale | null): string | undefined {
  return scale && !scale.equals(1) ? scale.toFraction() : undefined;
}

interface Line {
  text: string;
  line: number;
  optional: boolean;
}

/**
 * A recipe's ingredient lines as list items: markup flattened (as the index
 * flattens it), headings — stored or detected — skipped, a line marked
 * optional when the recipe makes it so (a garnish section, "to taste").
 */
function linesOf(recipe: Recipe): Line[] {
  const ingredients = recipe.ingredients ?? [];
  const texts = ingredients.map(({ ingredient }) =>
    flattenMarkdown(ingredient),
  );
  const headings = new Set(
    ingredients.flatMap(({ type }, line) => (type === "heading" ? [line] : [])),
  );
  const optional = new Map<number, boolean>();
  for (const requirement of parseIngredientList(texts, [...headings])) {
    optional.set(
      requirement.line,
      (optional.get(requirement.line) ?? true) && requirement.optional,
    );
  }
  return texts.flatMap((text, line) =>
    !text.trim() || headings.has(line) || detectHeading(text)
      ? []
      : [{ text: text.trim(), line, optional: optional.get(line) === true }],
  );
}

function readRecipe(ctx: CurationContext, slug: string) {
  return readContentFileOrNull<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
}

function readGroup(ctx: CurationContext, slug: string) {
  return readContentFileOrNull<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
}

function newId(): string {
  return ulid().toLowerCase();
}

function itemsFor(
  slug: string,
  recipe: Recipe,
  scale: string | undefined,
  via?: string[],
): ShoppingItem[] {
  return linesOf(recipe).map(({ text, line, optional }) =>
    canonicalShoppingItem({
      id: newId(),
      text,
      recipe: slug,
      recipeName: recipe.name,
      line,
      scale,
      via,
      optional,
    }),
  );
}

/**
 * Put a recipe's lines, a meal plan's (through its nested plans, D6) or
 * typed lines on the list — one commit. Adding the same recipe twice adds
 * it twice: two lots of cooking.
 */
export async function addToShopping(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingAddResult> {
  const input = parseInput(ShoppingAddSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: add", () =>
    addLocked(ctx, input),
  );
}

async function addLocked(
  ctx: CurationContext,
  input: ShoppingAddInput,
): Promise<ShoppingAddResult> {
  /* Refuse mid-merge before any file is written (34-D6). */
  await assertNoMergeInProgress(ctx.contentDirectory);
  const scale = parseScale(input.scale);
  const factor = scale && !scale.equals(1) ? ` ×${scale.toFraction()}` : "";

  let added: ShoppingItem[] = [];
  let message: string;
  const result: Partial<ShoppingAddResult> = {};
  const warnings: string[] = [];

  if (input.recipe !== undefined) {
    const recipe = await readRecipe(ctx, input.recipe);
    if (!recipe) {
      throw new UnknownRecipeError([input.recipe], { forceHint: false });
    }
    added = itemsFor(input.recipe, recipe, scaleText(scale));
    if (added.length === 0) {
      warnings.push(`${recipe.name} has no ingredient lines.`);
    }
    message = `+${recipe.name}${factor} (${count(added.length)})`;
  } else if (input.group !== undefined) {
    const root = await readGroup(ctx, input.group);
    if (!root) throw new UnknownGroupError([input.group]);
    const walk = await walkGroupRecipes(input.group, (slug) =>
      slug === input.group ? Promise.resolve(root) : readGroup(ctx, slug),
    );
    const recipes = new Map<string, Recipe | null>();
    const missingRecipes: string[] = [];
    for (const walked of walk.recipes) {
      if (!recipes.has(walked.slug)) {
        recipes.set(walked.slug, await readRecipe(ctx, walked.slug));
      }
      const recipe = recipes.get(walked.slug);
      if (!recipe) {
        if (!missingRecipes.includes(walked.slug)) {
          missingRecipes.push(walked.slug);
        }
        continue;
      }
      const effective = scale ? walked.scale.mul(scale) : walked.scale;
      added.push(
        ...itemsFor(walked.slug, recipe, scaleText(effective), walked.via),
      );
    }
    if (missingRecipes.length > 0 || walk.missing.length > 0) {
      result.missing = { recipes: missingRecipes, groups: walk.missing };
    }
    if (walk.cycles.length > 0) result.cycles = walk.cycles;
    if (missingRecipes.length > 0) {
      warnings.push(
        `Skipped recipes that do not exist: ${missingRecipes.join(", ")}.`,
      );
    }
    if (walk.missing.length > 0) {
      warnings.push(
        `Skipped sub-groups that do not exist: ${walk.missing.join(", ")}.`,
      );
    }
    for (const cycle of walk.cycles) {
      warnings.push(`Skipped a cycle: ${cycle.join(" → ")}.`);
    }
    for (const cut of walk.tooDeep) {
      warnings.push(`Skipped a plan nested too deep: ${cut.join(" → ")}.`);
    }
    if (walk.recipes.length === 0) {
      warnings.push(`${root.name} lists no recipes.`);
    }
    message = `+${root.name}${factor} (${count(added.length)})`;
  } else {
    added = (input.items ?? []).map((text) =>
      canonicalShoppingItem({ id: newId(), text, manual: true }),
    );
    message = describe(added.map((item) => `+${labelOf(item)}`));
  }

  const changed = await applyItems(
    ctx,
    { write: added },
    `Update shopping list: ${message}`,
  );
  return {
    added,
    items: await readShoppingItems(ctx),
    changed,
    ...result,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Tick, untick, flag, move or remove items already on the list — one commit,
 * or none when nothing changes. Removal wins over every other change in the
 * same call. Ids not on the list are reported, not refused: a page's batched
 * ticks may name an item another device has just cleared.
 */
export async function patchShopping(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingPatchResult> {
  const input = parseInput(ShoppingPatchSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: update", () =>
    patchLocked(ctx, input),
  );
}

async function patchLocked(
  ctx: CurationContext,
  input: ShoppingPatchInput,
): Promise<ShoppingPatchResult> {
  await assertNoMergeInProgress(ctx.contentDirectory);
  const [items, settings] = await Promise.all([
    readShoppingItems(ctx),
    readShoppingSettings(ctx),
  ]);
  const byId = new Map(items.map((item) => [item.id.toLowerCase(), item]));
  const next = new Map<string, ShoppingItem>();
  const removed = new Set<string>();
  const unknown: string[] = [];
  const unmatched: string[] = [];
  const parts: string[] = [];

  const current = (item: ShoppingItem) => next.get(item.id) ?? item;
  const lookup = (ids: string[] | undefined): ShoppingItem[] =>
    (ids ?? []).flatMap((id) => {
      const item = byId.get(id.trim().toLowerCase());
      if (!item) {
        if (!unknown.includes(id)) unknown.push(id);
        return [];
      }
      return [current(item)];
    });
  const change = (
    item: ShoppingItem,
    patch: Partial<ShoppingItem>,
    part: string,
  ) => {
    const updated = canonicalShoppingItem({ ...item, ...patch });
    if (serializeItem(updated) === serializeItem(current(item))) return;
    next.set(item.id, updated);
    parts.push(part);
  };
  const named = (names: string[] | undefined) =>
    (names ?? []).map((name) => {
      const key = shoppingNameOf(name).key;
      const matches = items.filter(
        (item) => shoppingNameOf(item.text).key === key,
      );
      if (matches.length === 0) unmatched.push(name);
      return { name: name.trim(), matches: matches.map(current) };
    });

  for (const item of lookup(input.check)) {
    change(item, { checked: true }, `✓${labelOf(item)}`);
  }
  for (const { name, matches } of named(input.names)) {
    for (const item of matches) change(item, { checked: true }, `✓${name}`);
  }
  for (const item of lookup(input.uncheck)) {
    change(item, { checked: false }, `☐${labelOf(item)}`);
  }
  for (const { name, matches } of named(input.uncheckNames)) {
    for (const item of matches) change(item, { checked: false }, `☐${name}`);
  }
  for (const item of lookup(input.need)) {
    change(item, { need: true }, `need:${labelOf(item)}`);
  }
  for (const item of lookup(input.unneed)) {
    change(item, { need: false }, `-need:${labelOf(item)}`);
  }
  if (input.set) {
    const { store } = input.set;
    if (
      store !== null &&
      !settings.stores.some((known) => known.id === store)
    ) {
      throw new ValidationError(
        `No store "${store}". Stores: ${settings.stores.map((known) => known.id).join(", ")}.`,
      );
    }
    for (const item of lookup(input.set.ids)) {
      change(
        item,
        { store: store ?? undefined },
        `${labelOf(item)}→${store ?? "any store"}`,
      );
    }
  }

  for (const item of lookup(input.remove)) {
    if (removed.has(item.id)) continue;
    removed.add(item.id);
    parts.push(`−${labelOf(item)}`);
  }
  if (input.removeSource) {
    const { recipe, group } = input.removeSource;
    const from = items.filter((item) =>
      recipe !== undefined
        ? item.recipe === recipe
        : (item.via ?? []).includes(group as string),
    );
    let label = recipe ?? (group as string);
    if (recipe !== undefined) {
      label = from.find((item) => item.recipeName)?.recipeName ?? recipe;
    } else {
      label = (await readGroup(ctx, group as string))?.name ?? label;
    }
    const fresh = from.filter((item) => !removed.has(item.id));
    for (const item of fresh) removed.add(item.id);
    if (from.length === 0) unmatched.push(recipe ?? (group as string));
    else if (fresh.length > 0) parts.push(`-${label} (${count(fresh.length)})`);
  }

  const write = [...next.values()].filter((item) => !removed.has(item.id));
  const changed = await applyItems(
    ctx,
    { write, remove: [...removed] },
    `Update shopping list: ${describe(parts)}`,
  );
  return {
    items: changed ? await readShoppingItems(ctx) : items,
    changed,
    updated: write.map((item) => item.id),
    removed: [...removed],
    ...(unknown.length > 0 ? { unknown } : {}),
    ...(unmatched.length > 0 ? { unmatched } : {}),
  };
}

/** Clear what was bought (`checked`, the default) or everything — one commit. */
export async function clearShopping(
  ctx: CurationContext,
  raw: unknown = {},
): Promise<ShoppingClearResult> {
  const { scope = "checked" } = parseInput(ShoppingClearSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: clear", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const items = await readShoppingItems(ctx);
    const gone = items.filter((item) => scope === "all" || item.checked);
    const message =
      scope === "all"
        ? `Clear shopping list: all ${count(gone.length)}`
        : `Clear shopping list: ${gone.length} checked`;
    const changed = await applyItems(
      ctx,
      { remove: gone.map((item) => item.id) },
      message,
    );
    return {
      items: changed ? await readShoppingItems(ctx) : items,
      changed,
      removed: gone.map((item) => item.id),
    };
  });
}

// --- settings --------------------------------------------------------------

export async function getShoppingSettings(
  ctx: CurationContext,
): Promise<ShoppingSettingsResult> {
  return {
    settings: await readShoppingSettings(ctx),
    path: absolute(ctx, SHOPPING_SETTINGS_FILE),
  };
}

/** Override maps sorted by key, so the file diffs line by line. */
function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function serializeSettings(settings: ShoppingSettings): string {
  const ordered: ShoppingSettings = {
    features: settings.features,
    aisleOrder: settings.aisleOrder,
    stores: settings.stores,
    defaultStore: settings.defaultStore,
    storeByAisle: Object.fromEntries(
      AISLES.flatMap((aisle) =>
        settings.storeByAisle[aisle]
          ? [[aisle, settings.storeByAisle[aisle]]]
          : [],
      ),
    ),
    aisleOverrides: sortedRecord(settings.aisleOverrides),
    storeOverrides: sortedRecord(settings.storeOverrides),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** An override's key: the name key the view routes rows by ("Eggs" → `egg`). */
function overrideKey(name: string): string {
  return shoppingNameOf(name).key;
}

function applySettingsPatch(
  current: ShoppingSettings,
  patch: ShoppingSettingsPatch,
): ShoppingSettings {
  const next: ShoppingSettings = structuredClone(current);
  if (patch.features) {
    for (const [name, value] of Object.entries(patch.features)) {
      if (typeof value === "boolean") {
        next.features[name as keyof ShoppingSettings["features"]] = value;
      }
    }
  }
  if (patch.aisleOrder) next.aisleOrder = [...patch.aisleOrder];
  if (patch.stores) {
    next.stores = patch.stores.map((store) => ({ ...store }));
    /* A store taken away takes its routes with it. */
    const kept = new Set(next.stores.map((store) => store.id));
    for (const aisle of AISLES) {
      const store = next.storeByAisle[aisle];
      if (store && !kept.has(store)) delete next.storeByAisle[aisle];
    }
    for (const [key, store] of Object.entries(next.storeOverrides)) {
      if (!kept.has(store)) delete next.storeOverrides[key];
    }
    if (!kept.has(next.defaultStore)) next.defaultStore = next.stores[0].id;
  }

  const known = new Set(next.stores.map((store) => store.id));
  const unknownStores = new Set<string>();
  const checkStore = (store: string) => {
    if (!known.has(store)) unknownStores.add(store);
  };
  if (patch.defaultStore !== undefined) {
    checkStore(patch.defaultStore);
    next.defaultStore = patch.defaultStore;
  }
  for (const [aisle, store] of Object.entries(patch.storeByAisle ?? {})) {
    const key = aisle as keyof ShoppingSettings["storeByAisle"];
    if (store === null || store === undefined) delete next.storeByAisle[key];
    else {
      checkStore(store);
      next.storeByAisle[key] = store;
    }
  }
  for (const [name, aisle] of Object.entries(patch.aisleOverrides ?? {})) {
    const key = overrideKey(name);
    if (aisle === null) delete next.aisleOverrides[key];
    else next.aisleOverrides[key] = aisle;
  }
  for (const [name, store] of Object.entries(patch.storeOverrides ?? {})) {
    const key = overrideKey(name);
    if (store === null) delete next.storeOverrides[key];
    else {
      checkStore(store);
      next.storeOverrides[key] = store;
    }
  }
  if (unknownStores.size > 0) {
    throw new ValidationError(
      `No ${unknownStores.size === 1 ? "store" : "stores"} ${[...unknownStores].map((id) => `"${id}"`).join(", ")}. Stores: ${[...known].join(", ")}.`,
    );
  }
  return normalizeShoppingSettings(next);
}

/**
 * Change the switches, the stores and the routes — merged into what is
 * stored, validated, one commit ("Update shopping list settings"), none when
 * nothing changes.
 */
export async function updateShoppingSettings(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingSettingsResult> {
  const patch = parseInput(ShoppingSettingsPatchSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: settings", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const current = await readShoppingSettings(ctx);
    const settings = applySettingsPatch(current, patch);
    const file = absolute(ctx, SHOPPING_SETTINGS_FILE);
    if (serializeSettings(settings) === serializeSettings(current)) {
      return { settings: current, path: file, changed: false };
    }
    await writeFileAtomic(file, serializeSettings(settings));
    await commitContentChanges(
      "Update shopping list settings",
      ctx.author,
      [SHOPPING_SETTINGS_FILE],
      ctx.contentDirectory,
    );
    return { settings, path: file, changed: true };
  });
}
