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
 * 49a adds `<content>/shopping/merges/<id>.json`: one file per merge
 * decision ("same thing, different names"), on the same rules. 50a adds
 * this list's layers (`layers/<ulid>.json`, one per change) and the rules
 * for every list (`rules/<id>.json`, leave-off) — every path in
 * `SHOPPING_LIST_PATHS` / `SHOPPING_RULE_PATHS` below, which 50d moves
 * under a directory per list.
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
import { walkGroupRecipes } from "recipe-website-common/util/groupShoppingWalk";
import { DEFAULT_STAPLES } from "recipe-website-common/util/makeable";
import { expandRecipeLines } from "recipe-website-common/util/shoppingLines";
import type { Picks } from "recipe-website-common/util/alternatives";
import { parseScale } from "recipe-website-common/util/scale";
import {
  canonicalShoppingItem,
  normalizeShoppingSettings,
  parseShoppingItem,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import {
  findShoppingProposals,
  type ShoppingProposal,
} from "recipe-website-common/util/shoppingConsolidate";
import {
  MERGE_ID_PATTERN,
  activeMerges,
  canonicalShoppingMerge,
  mergeIdOf,
  normalizeMergeKeys,
  parseShoppingMerge,
  type ShoppingMerge,
} from "recipe-website-common/util/shoppingMerges";
import {
  canonicalShoppingLayer,
  canonicalShoppingRule,
  BUILT_IN_LEAVE_OFF,
  MAX_SHOPPING_LAYERS,
  isStaleLayer,
  parseShoppingLayer,
  parseShoppingRule,
  ruleIdOf,
  type ShoppingLayer,
  type ShoppingRule,
} from "recipe-website-common/util/shoppingLayers";
import { listLayers } from "recipe-website-common/util/shoppingChanges";
import {
  TIDY_RUN_ID_PATTERN,
  parseTidyRun,
  runIdOfSuggestion,
  serializeTidyRun,
  sortTidyRuns,
  tidyStatusOf,
  type TidyRun,
  type TidySuggestion,
} from "recipe-website-common/util/shoppingTidy";
import {
  buildShoppingView,
  formatShoppingText,
  itemsForSubRecipe,
  orParents,
  shoppingNameOf,
  viewForStore,
  type ShoppingView,
} from "recipe-website-common/util/shoppingView";
import type { CurationContext } from "./context";
import {
  NotFoundError,
  UnknownGroupError,
  UnknownRecipeError,
  ValidationError,
} from "./errors";
import { readInventory } from "./inventory";
import {
  ShoppingAddSchema,
  ShoppingClearSchema,
  ShoppingLayerAddSchema,
  ShoppingLayerRemoveSchema,
  ShoppingLayerSetSchema,
  ShoppingLeaveOffSchema,
  ShoppingMergeSchema,
  ShoppingPatchSchema,
  ShoppingSettingsPatchSchema,
  ShoppingSplitSchema,
  parseInput,
  type ShoppingAddInput,
  type ShoppingMergeInput,
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
/** 49a: one file per merge decision, `<id>.json`. */
export const SHOPPING_MERGES_DIRECTORY = path.join(
  SHOPPING_DIRECTORY,
  "merges",
);
/** Decisions the list may hold: far more than a person ever makes. */
export const MAX_SHOPPING_MERGES = 1000;
/** 50a: this list's layers, one file per change, `<ulid>.json`. */
export const SHOPPING_LAYERS_DIRECTORY = path.join(
  SHOPPING_DIRECTORY,
  "layers",
);
/**
 * 50b (Db5): this list's "Tidy with the model" runs, one file per run,
 * `<ulid>.json` — kept, newest first, so a later run never loses an
 * earlier one.
 */
export const SHOPPING_TIDY_DIRECTORY = path.join(SHOPPING_DIRECTORY, "tidy");
/** 50b: runs a list keeps; the oldest goes in the commit that adds one more. */
export const MAX_TIDY_RUNS = 100;
/** 50a: the rules for every list (leave-off), one file per rule, `<id>.json`. */
export const SHOPPING_RULES_DIRECTORY = path.join(SHOPPING_DIRECTORY, "rules");
/**
 * 50a (Da6): every path that belongs to **this** list — its items and its
 * layers — in one place, so 50d's saved lists move them under a directory
 * per list together. The rules, merges and settings are every list's.
 */
export const SHOPPING_LIST_PATHS = {
  items: SHOPPING_ITEMS_DIRECTORY,
  layers: SHOPPING_LAYERS_DIRECTORY,
  tidy: SHOPPING_TIDY_DIRECTORY,
} as const;
export const SHOPPING_RULE_PATHS = {
  merges: SHOPPING_MERGES_DIRECTORY,
  rules: SHOPPING_RULES_DIRECTORY,
  settings: SHOPPING_SETTINGS_FILE,
} as const;
/** 50a: leave-off rules the list may hold. */
export const MAX_SHOPPING_RULES = 1000;

/**
 * Caps (35c review). A plan walk counts repeats (D6), so a plan listing a
 * sub-plan twice at every level fans out as 2^depth — 2^31 rows at the depth
 * limit, inside the write lock. The walk stops at `MAX_WALKED_RECIPES` recipe
 * rows or `MAX_WALKED_GROUPS` group visits and the add is refused; and no add
 * may take the list past `MAX_SHOPPING_ITEMS`. A real week is ~20 recipes and
 * ~100 lines; the real-content check's plan was 7 recipes, 86 lines.
 */
export const MAX_WALKED_RECIPES = 500;
export const MAX_WALKED_GROUPS = 2000;
export const MAX_SHOPPING_ITEMS = 5000;
/** Entries each override map may hold. */
export const MAX_SHOPPING_OVERRIDES = 1000;

/**
 * Test seams, unset in production. `beforeFile` runs before each item file is
 * written or deleted, so a test can fail a write part-way. `maxItems` stands
 * in for `MAX_SHOPPING_ITEMS`, so a test reaches the cap with a handful of
 * files instead of laying down 5 000 and reading them back on every add —
 * which took 60 s under a loaded machine (40f).
 */
export const shoppingTestHooks: {
  beforeFile?: (relativePath: string, index: number) => Promise<void> | void;
  maxItems?: number;
} = {};

/** An item file's stem: a ULID, as this module writes it, or close enough. */
const ITEM_FILE = /^([0-9a-z]{10,64})\.json$/i;

export interface ShoppingResult {
  /** In the order they were added (by id). */
  items: ShoppingItem[];
  settings: ShoppingSettings;
  /** 49a: the merge decisions, by id. */
  merges: ShoppingMerge[];
  /** 50a: this list's layers, in the order they apply (by id). */
  layers: ShoppingLayer[];
  /** 50a: the leave-off rules, by id. */
  rules: ShoppingRule[];
  /** Absolute path of the `shopping/` directory (which may not exist yet). */
  path: string;
}

export interface ShoppingViewResult extends ShoppingResult {
  view: ShoppingView;
  /** `formatShoppingText(view)`: what a person copies. */
  text: string;
  /** 49a: the open "same thing, different names" proposals (whole list). */
  proposals: ShoppingProposal[];
  /**
   * 50a: the view is the base — no merges, rules or layers — as the page's
   * "As written" shows it (`shopping list --as-written`).
   */
  asWritten?: boolean;
}

/** 50a: a layer written, switched or removed. */
export interface ShoppingLayerResult {
  layers: ShoppingLayer[];
  changed: boolean;
  /** The layer written (absent for a removal). */
  layer?: ShoppingLayer;
  /** Ids of layers this call deleted. */
  removed: string[];
}

/** 50a: a leave-off rule written or deleted. */
export interface ShoppingRuleResult {
  rules: ShoppingRule[];
  changed: boolean;
  /** The rule as stored now (absent when the built-in set says it). */
  rule?: ShoppingRule;
}

/** 49a: a merge decision written or deleted. */
export interface ShoppingMergeResult {
  merges: ShoppingMerge[];
  changed: boolean;
  /** The decision written (absent for a split). */
  decision?: ShoppingMerge;
  /** Ids of decisions this call deleted: split, or replaced by a wider one. */
  removed: string[];
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
  /** 50a: layers deleted with their last items (Da4). */
  removedLayers?: string[];
}

export interface ShoppingClearResult {
  items: ShoppingItem[];
  changed: boolean;
  removed: string[];
  /** 50a: layers deleted with their last items (Da4). */
  removedLayers?: string[];
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

function mergeFile(id: string): string {
  return path.join(SHOPPING_MERGES_DIRECTORY, `${id}.json`);
}

function layerFile(id: string): string {
  return path.join(SHOPPING_LIST_PATHS.layers, `${id}.json`);
}

function ruleFile(id: string): string {
  return path.join(SHOPPING_RULE_PATHS.rules, `${id}.json`);
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

/**
 * 49a: every merge decision, sorted by id. A file that does not parse is
 * skipped, as an item's is; the file name is the decision's id.
 */
export async function readShoppingMerges(
  ctx: CurationContext,
): Promise<ShoppingMerge[]> {
  let names: string[];
  try {
    names = await readdir(absolute(ctx, SHOPPING_MERGES_DIRECTORY));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const merges: ShoppingMerge[] = [];
  for (const name of names) {
    const match = /^([0-9a-f]{16})\.json$/.exec(name);
    if (!match) continue;
    try {
      const raw = JSON.parse(
        await readFile(absolute(ctx, mergeFile(match[1])), "utf8"),
      ) as unknown;
      const merge = parseShoppingMerge(raw, match[1]);
      if (merge) merges.push(merge);
    } catch (error) {
      if (isMissing(error)) continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return merges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 50a: every file of one directory a parse reads, by its stem — a file that
 * does not parse is skipped, as an item's is.
 */
async function readRecords<T>(
  ctx: CurationContext,
  directory: string,
  stem: RegExp,
  parse: (raw: unknown, id: string) => T | null,
): Promise<T[]> {
  let names: string[];
  try {
    names = await readdir(absolute(ctx, directory));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const out: { id: string; record: T }[] = [];
  for (const name of names) {
    const match = stem.exec(name);
    if (!match) continue;
    try {
      const raw = JSON.parse(
        await readFile(absolute(ctx, path.join(directory, name)), "utf8"),
      ) as unknown;
      const record = parse(raw, match[1]);
      if (record) out.push({ id: match[1], record });
    } catch (error) {
      if (isMissing(error)) continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return out
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((entry) => entry.record);
}

/** 50a: this list's layers, in the order they apply (by id). */
export function readShoppingLayers(
  ctx: CurationContext,
): Promise<ShoppingLayer[]> {
  return readRecords(
    ctx,
    SHOPPING_LIST_PATHS.layers,
    /^([0-9a-hjkmnp-tv-z]{26})\.json$/,
    parseShoppingLayer,
  );
}

/** 50a: the leave-off rules, by id. */
export function readShoppingRules(
  ctx: CurationContext,
): Promise<ShoppingRule[]> {
  return readRecords(
    ctx,
    SHOPPING_RULE_PATHS.rules,
    /^([0-9a-f]{16})\.json$/,
    parseShoppingRule,
  );
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
  const [items, settings, merges, layers, rules] = await Promise.all([
    readShoppingItems(ctx),
    readShoppingSettings(ctx),
    readShoppingMerges(ctx),
    readShoppingLayers(ctx),
    readShoppingRules(ctx),
  ]);
  return { items, settings, merges, layers, rules, path: shoppingPath(ctx) };
}

/**
 * 42g: the names of the meal plans the list's lines came through (each
 * item's outermost plan, `via[0]`), for the page's "What's on it". Items
 * keep plan slugs only; a plan deleted since reads as missing here, and the
 * page names it from its slug.
 */
export async function readShoppingPlanNames(
  ctx: CurationContext,
  items: readonly ShoppingItem[],
): Promise<Record<string, string>> {
  const slugs = [
    ...new Set(items.flatMap((item) => (item.via?.[0] ? [item.via[0]] : []))),
  ];
  const groups = await Promise.all(slugs.map((slug) => readGroup(ctx, slug)));
  const names: Record<string, string> = {};
  slugs.forEach((slug, index) => {
    const name = groups[index]?.name;
    if (name) names[slug] = name;
  });
  return names;
}

/**
 * The list as a person reads it: the stored items and settings, the view
 * (`buildShoppingView` over the shared on-hand list and the staples) and its
 * copy text. `store` narrows to one store's list — with stores switched on
 * for this answer, so "what's left at Market Basket" works whatever the
 * page's switch says.
 *
 * 50a: the view is composed — the merges, the leave-off rules and this
 * list's layers over the base rows. `asWritten` answers the base instead.
 */
export async function readShoppingView(
  ctx: CurationContext,
  { store, asWritten = false }: { store?: string; asWritten?: boolean } = {},
): Promise<ShoppingViewResult> {
  const [shopping, inventory] = await Promise.all([
    readShopping(ctx),
    readInventory(ctx),
  ]);
  const { items, settings, layers, rules } = shopping;
  const merges = asWritten ? [] : shopping.merges;
  const compose = asWritten ? undefined : { layers, rules };
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
        merges,
        compose,
      ),
      store,
    );
  } else {
    view = buildShoppingView(
      items,
      settings,
      inventory.items,
      DEFAULT_STAPLES,
      merges,
      compose,
    );
  }
  return {
    ...shopping,
    view,
    text: formatShoppingText(view),
    proposals: findShoppingProposals(items, settings, shopping.merges),
    ...(asWritten ? { asWritten: true } : {}),
  };
}

// --- writes ----------------------------------------------------------------

function serializeItem(item: ShoppingItem): string {
  return `${JSON.stringify(canonicalShoppingItem(item), null, 2)}\n`;
}

/** A file's bytes before a write touched it; `null` when it did not exist. */
async function backup(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** Put files back as `backup` read them. Best effort: errors are swallowed. */
async function restore(
  ctx: CurationContext,
  backups: Map<string, string | null>,
): Promise<void> {
  for (const [relative, bytes] of backups) {
    const file = absolute(ctx, relative);
    await (
      bytes === null ? rm(file, { force: true }) : writeFileAtomic(file, bytes)
    ).catch(() => undefined);
  }
}

/**
 * Write and delete item files, then commit exactly those paths — one commit,
 * or none when there was nothing to do. Called under the write lock.
 *
 * A failure never leaves files behind uncommitted (35c review). One part-way
 * through the files commits what was done as `<message> (partial)` and
 * rethrows, as `withBatchCommit` does (F34/D3), so `git_revert` undoes
 * exactly what landed. A commit that fails — the final one, or that partial
 * one — puts every touched file back as it was, so the tree is as before the
 * call.
 */
async function applyItems(
  ctx: CurationContext,
  {
    write = [],
    remove = [],
    removeLayers = [],
  }: { write?: ShoppingItem[]; remove?: string[]; removeLayers?: string[] },
  message: string,
): Promise<boolean> {
  return applyFiles(
    ctx,
    [
      ...write.map((item) => ({
        relative: itemFile(item.id),
        bytes: serializeItem(item),
      })),
      ...remove.map((id) => ({ relative: itemFile(id), bytes: null })),
      /* 50a: a layer goes with its last items, in the same commit (Da4). */
      ...removeLayers.map((id) => ({ relative: layerFile(id), bytes: null })),
    ],
    message,
  );
}

/**
 * 50a (Da4): the layers none of whose items would be left once `removed`
 * goes — "Done shopping" and Clear take this list's changes with its lines.
 */
async function layersGoingWith(
  ctx: CurationContext,
  items: readonly ShoppingItem[],
  removed: ReadonlySet<string>,
): Promise<string[]> {
  if (removed.size === 0) return [];
  const layers = await readShoppingLayers(ctx);
  if (layers.length === 0) return [];
  const left = new Set(
    items.filter((item) => !removed.has(item.id)).map((item) => item.id),
  );
  return layers
    .filter((layer) => isStaleLayer(layer, left))
    .map((layer) => layer.id);
}

/**
 * `applyItems`' body, for any of the list's files: each step writes its
 * bytes atomically, or deletes the file (`bytes: null`), in order; then one
 * commit of exactly those paths. 49a's merge decisions go through it too.
 */
async function applyFiles(
  ctx: CurationContext,
  steps: { relative: string; bytes: string | null }[],
  message: string,
): Promise<boolean> {
  const done: string[] = [];
  const backups = new Map<string, string | null>();
  const commit = async (subject: string) => {
    try {
      await commitContentChanges(
        subject,
        ctx.author,
        done,
        ctx.contentDirectory,
      );
    } catch (error) {
      await restore(ctx, backups);
      throw error;
    }
  };
  const step = async (
    relative: string,
    run: (file: string) => Promise<void>,
  ) => {
    await shoppingTestHooks.beforeFile?.(relative, done.length);
    const file = absolute(ctx, relative);
    backups.set(relative, await backup(file));
    await run(file);
    done.push(relative);
  };
  try {
    for (const { relative, bytes } of steps) {
      /* Atomic (D8): a reader never sees half an item, a crash never leaves one. */
      await step(relative, (file) =>
        bytes === null
          ? rm(file, { force: true })
          : writeFileAtomic(file, bytes),
      );
    }
  } catch (error) {
    if (done.length > 0) {
      /* The partial commit's own failure restored the files; the first error is the one to report. */
      await commit(`${message} (partial)`).catch(() => undefined);
    } else {
      await restore(ctx, backups);
    }
    throw error;
  }
  if (done.length === 0) return false;
  await commit(message);
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

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/** How an item reads in a commit subject: its name, else its line. */
function labelOf(item: ShoppingItem): string {
  const { key, label } = shoppingNameOf(item.text);
  return clip(key.startsWith("text:") ? item.text.trim() : label);
}

/** A multiplier as stored: `"2"`, `"1/2"`; absent for 1. */
type Scale = NonNullable<ReturnType<typeof parseScale>>;

function scaleText(scale: Scale | null): string | undefined {
  return scale && !scale.equals(1) ? scale.toFraction() : undefined;
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

/** One add's sub-recipe expansion: the switch, and reads shared across it. */
interface Expansion {
  expand: boolean;
  readRecipe(slug: string): Promise<Recipe | null>;
  cache: Map<string, Promise<Recipe | null>>;
  warnings: string[];
}

/**
 * A recipe's lines as items, at `scale` (`null`: 1). With sub-recipes on
 * (38-D4), a line that is another recipe goes on as that recipe's lines,
 * each scaled by the batches it asks for and carrying the path in `for`;
 * what had to stay as written is a warning on the add.
 */
async function itemsFor(
  slug: string,
  recipe: Recipe,
  scale: Scale | null,
  expansion: Expansion,
  via?: string[],
  picks?: Picks,
): Promise<ShoppingItem[]> {
  const { lines, warnings } = await expandRecipeLines(slug, recipe, {
    readRecipe: expansion.readRecipe,
    expand: expansion.expand,
    scale: scale ?? undefined,
    cache: expansion.cache,
    picks,
  });
  for (const warning of warnings) {
    if (!expansion.warnings.includes(warning)) {
      expansion.warnings.push(warning);
    }
  }
  return lines.map(({ text, line, optional, factor, for: path }) =>
    canonicalShoppingItem({
      id: newId(),
      text,
      recipe: slug,
      recipeName: recipe.name,
      line,
      scale: scaleText(scale ? scale.mul(factor) : factor),
      via,
      optional,
      for: path,
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
  const expansion: Expansion = {
    expand:
      input.items === undefined &&
      (await readShoppingSettings(ctx)).features.subRecipes,
    readRecipe: (slug) => readRecipe(ctx, slug),
    cache: new Map(),
    warnings: [],
  };

  if (input.recipe !== undefined) {
    const recipe = await readRecipe(ctx, input.recipe);
    if (!recipe) {
      throw new UnknownRecipeError([input.recipe], { forceHint: false });
    }
    /* The reader's pick among its alternatives (45e); else the defaults. */
    added = await itemsFor(
      input.recipe,
      recipe,
      scale,
      expansion,
      undefined,
      input.picks,
    );
    if (added.length === 0) {
      warnings.push(`${recipe.name} has no ingredient lines.`);
    }
    message = `+${recipe.name}${factor} (${count(added.length)})`;
  } else if (input.group !== undefined) {
    const root = await readGroup(ctx, input.group);
    if (!root) throw new UnknownGroupError([input.group]);
    const walk = await walkGroupRecipes(
      input.group,
      (slug) =>
        slug === input.group ? Promise.resolve(root) : readGroup(ctx, slug),
      { maxRecipes: MAX_WALKED_RECIPES, maxVisits: MAX_WALKED_GROUPS },
    );
    if (walk.truncated) {
      throw new ValidationError(
        `${root.name} expands to more than ${MAX_WALKED_RECIPES} recipe rows ` +
          `(or ${MAX_WALKED_GROUPS} sub-plan visits): a sub-plan listed more ` +
          "than once at several levels multiplies. Nothing was added.",
      );
    }
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
        ...(await itemsFor(
          walked.slug,
          recipe,
          effective,
          expansion,
          walked.via,
        )),
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
    /* As typed: `+eggs`, not the singular name key. */
    message = describe(added.map((item) => `+${clip(item.text.trim())}`));
  }
  warnings.push(...expansion.warnings);

  const existing = (await readShoppingItems(ctx)).length;
  const cap = shoppingTestHooks.maxItems ?? MAX_SHOPPING_ITEMS;
  if (existing + added.length > cap) {
    throw new ValidationError(
      `The list would hold ${existing + added.length} items; it holds at most ${cap}.${
        added.some((item) => item.for?.length)
          ? " Sub-recipes went on as their own lines — turn off features.subRecipes to add them as written."
          : ""
      } Clear what was bought first. Nothing was added.`,
    );
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
 * Each item → the `OR:` items folded into its row (38d), through a chain of
 * `OR:` lines too.
 */
function orAlternatives(
  items: readonly ShoppingItem[],
): Map<string, ShoppingItem[]> {
  const parents = orParents(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const out = new Map<string, ShoppingItem[]>();
  for (const [child, parent] of parents) {
    const item = byId.get(child)!;
    for (let at: string | undefined = parent; at; at = parents.get(at)) {
      out.set(at, [...(out.get(at) ?? []), item]);
    }
  }
  return out;
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
  /* Each part names the item it describes, so a net no-op drops out. */
  const parts: { id?: string; text: string }[] = [];

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
    parts.push({ id: item.id, text: part });
  };
  /* 38d: an `OR:` item ticks with the line it folds into, as on the page. */
  const alternatives = orAlternatives(items);
  /*
   * 49a: a merged row ticks by any of its names, or by its merged name —
   * "I bought flour" ticks the white flour beside the all-purpose — as a
   * tap on the row does.
   */
  const mergedKeys = await mergedKeysFor(ctx, items, settings);
  const named = (names: string[] | undefined) =>
    (names ?? []).map((name) => {
      const key = shoppingNameOf(name).key;
      const keys = mergedKeys.get(key) ?? new Set([key]);
      const matches = items.filter((item) =>
        keys.has(shoppingNameOf(item.text).key),
      );
      if (matches.length === 0) unmatched.push(name);
      const ids = new Set(matches.map((item) => item.id));
      const folded = matches.flatMap((item) =>
        (alternatives.get(item.id) ?? []).filter((alt) => !ids.has(alt.id)),
      );
      return {
        name: name.trim(),
        matches: [...matches, ...new Set(folded)].map(current),
      };
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
    parts.push({ id: item.id, text: `−${labelOf(item)}` });
  }
  if (input.removeSource) {
    const { recipe, group, for: sub } = input.removeSource;
    const source = (recipe ?? group ?? sub) as string;
    let from: ShoppingItem[];
    let label: string;
    if (sub !== undefined) {
      /*
       * 39c, undo a sub-recipe expansion: every item whose `for` path names
       * it, whole — a merged row keeps the recipe's own line of that name.
       */
      from = itemsForSubRecipe(items, sub);
      const name = from
        .flatMap((item) => item.for ?? [])
        .find((entry) => entry.slug === sub)?.name;
      label = `for ${name ?? sub}`;
    } else if (recipe !== undefined) {
      from = items.filter((item) => item.recipe === recipe);
      label = from.find((item) => item.recipeName)?.recipeName ?? recipe;
    } else {
      from = items.filter((item) => (item.via ?? []).includes(source));
      label = (await readGroup(ctx, source))?.name ?? source;
    }
    const fresh = from.filter((item) => !removed.has(item.id));
    for (const item of fresh) removed.add(item.id);
    if (from.length === 0) unmatched.push(source);
    else if (fresh.length > 0) {
      parts.push({ text: `-${label} (${count(fresh.length)})` });
    }
  }

  /*
   * Only items that end up different from what is stored: `{check: [x],
   * uncheck: [x]}` changes nothing, so it writes and reports nothing.
   */
  const stored = new Map(items.map((item) => [item.id, serializeItem(item)]));
  const write = [...next.values()].filter(
    (item) =>
      !removed.has(item.id) && serializeItem(item) !== stored.get(item.id),
  );
  const touched = new Set([...write.map((item) => item.id), ...removed]);
  const removeLayers = await layersGoingWith(ctx, items, removed);
  const changed = await applyItems(
    ctx,
    { write, remove: [...removed], removeLayers },
    `Update shopping list: ${describe(
      parts
        .filter((part) => part.id === undefined || touched.has(part.id))
        .map((part) => part.text),
    )}`,
  );
  return {
    items: changed ? await readShoppingItems(ctx) : items,
    changed,
    updated: write.map((item) => item.id),
    removed: [...removed],
    ...(unknown.length > 0 ? { unknown } : {}),
    ...(unmatched.length > 0 ? { unmatched } : {}),
    ...(changed && removeLayers.length > 0
      ? { removedLayers: removeLayers }
      : {}),
  };
}

/**
 * 49a: name key → every name key of the merged row it is in, for the merged
 * decisions that apply to these items — keyed by each name and by the
 * merged row's own name ("all-purpose flour").
 */
async function mergedKeysFor(
  ctx: CurationContext,
  items: readonly ShoppingItem[],
  settings: ShoppingSettings,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!settings.features.merge) return out;
  const merges = await readShoppingMerges(ctx);
  if (merges.length === 0) return out;
  const parents = orParents(items);
  const present = new Set(
    items
      .filter((item) => !parents.has(item.id))
      .map((item) => shoppingNameOf(item.text).key),
  );
  const byKey = activeMerges(merges, present);
  const rows = new Map<string, Set<string>>();
  for (const [key, merge] of byKey) {
    let keys = rows.get(merge.id);
    if (!keys) {
      keys = new Set();
      rows.set(merge.id, keys);
    }
    keys.add(key);
  }
  for (const [key, merge] of byKey) out.set(key, rows.get(merge.id)!);
  /* The merged row's own name, as the view labels it. */
  const view = buildShoppingView([...items], settings, [], [], merges);
  for (const row of [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.checked,
  ]) {
    if (row.merge && !out.has(row.nameKey)) {
      out.set(row.nameKey, rows.get(row.merge.id) ?? new Set(row.merge.keys));
    }
  }
  return out;
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
    /* 38d: an `OR:` item goes with the line it folds into — never left as
     * a row of its own. */
    const goneIds = new Set(gone.map((item) => item.id));
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const [child, parent] of orParents(items)) {
      if (goneIds.has(parent) && !goneIds.has(child)) {
        goneIds.add(child);
        gone.push(byId.get(child)!);
      }
    }
    const message =
      scope === "all"
        ? `Clear shopping list: all ${count(gone.length)}`
        : `Clear shopping list: ${gone.length} checked`;
    const removeLayers = await layersGoingWith(ctx, items, goneIds);
    const changed = await applyItems(
      ctx,
      { remove: gone.map((item) => item.id), removeLayers },
      message,
    );
    return {
      items: changed ? await readShoppingItems(ctx) : items,
      changed,
      removed: gone.map((item) => item.id),
      ...(changed && removeLayers.length > 0
        ? { removedLayers: removeLayers }
        : {}),
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
  for (const [name, map] of [
    ["aisleOverrides", next.aisleOverrides],
    ["storeOverrides", next.storeOverrides],
  ] as const) {
    if (Object.keys(map).length > MAX_SHOPPING_OVERRIDES) {
      throw new ValidationError(
        `\`${name}\` would hold more than ${MAX_SHOPPING_OVERRIDES} entries.`,
      );
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
    const before = await backup(file);
    await writeFileAtomic(file, serializeSettings(settings));
    try {
      await commitContentChanges(
        "Update shopping list settings",
        ctx.author,
        [SHOPPING_SETTINGS_FILE],
        ctx.contentDirectory,
      );
    } catch (error) {
      /* Never leave the change behind uncommitted (35c review). */
      await restore(ctx, new Map([[SHOPPING_SETTINGS_FILE, before]]));
      throw error;
    }
    return { settings, path: file, changed: true };
  });
}

// --- merge decisions (49a) ---------------------------------------------------

function serializeMerge(merge: ShoppingMerge): string {
  return `${JSON.stringify(canonicalShoppingMerge(merge), null, 2)}\n`;
}

/** A decision's bytes without its time: what "nothing changed" compares. */
function mergeSubstance(merge: ShoppingMerge): string {
  return serializeMerge({ ...merge, decidedAt: "" });
}

/** "white flour + all purpose flour", shortened to fit a commit subject. */
function keysText(keys: readonly string[]): string {
  return describe([keys.join(" + ")]);
}

function overlaps(a: readonly string[], b: readonly string[]): boolean {
  return a.some((key) => b.includes(key));
}

/**
 * Answer a "same thing, different names" proposal (49a, Da4) — or change a
 * merge already made — as one commit.
 *
 * - `{id}` names an open proposal (`findShoppingProposals` over the list
 *   now) or a stored decision; `{keys}` names the set directly.
 * - **merged**: the rows show as one from now on. A merged decision that
 *   shares a name with this one is folded in and its file deleted, and an
 *   `apart` decision whose names this one covers goes too — the wider
 *   answer replaces the narrower. `name` labels the row; `amount` is held
 *   for exactly the items the merged row covers now (Da4: when they change,
 *   the row falls back to the sum and says so). Fields left out keep what a
 *   stored decision of the same id said.
 * - **apart**: that proposal never shows again. An `apart` decision whose
 *   names this one covers is replaced.
 *
 * Nothing changes — and nothing commits — when the stored decision already
 * says the same.
 */
export async function decideShoppingMerge(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingMergeResult> {
  const input = parseInput(ShoppingMergeSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: merge", () =>
    decideLocked(ctx, input),
  );
}

async function decideLocked(
  ctx: CurationContext,
  input: ShoppingMergeInput,
): Promise<ShoppingMergeResult> {
  await assertNoMergeInProgress(ctx.contentDirectory);
  const [items, settings, onDisk] = await Promise.all([
    readShoppingItems(ctx),
    readShoppingSettings(ctx),
    readShoppingMerges(ctx),
  ]);
  /*
   * 49b: the decision this answer replaces (a merged row the model split or
   * kept apart) is gone before anything else is worked out — so it neither
   * absorbs the new keys back nor carries its name — and its file goes in
   * the same commit.
   */
  const replaced = input.replaces
    ? onDisk.find((merge) => merge.id === input.replaces)
    : undefined;
  /*
   * 49b review: a `replaces` that names no merged row sharing a name with
   * this answer is stale (another device split or regrew it) or made up —
   * refused, so it can neither delete an unrelated decision nor be absorbed
   * back into a merge it did not see.
   */
  if (
    input.replaces &&
    (!replaced ||
      replaced.status !== "merged" ||
      (input.keys !== undefined &&
        !overlaps(replaced.keys, normalizeMergeKeys(input.keys))))
  ) {
    throw new ValidationError(
      "The merged row this answer replaces has changed since the model was asked: ask again.",
    );
  }
  const merges = replaced
    ? onDisk.filter((merge) => merge.id !== replaced.id)
    : onDisk;

  let keys: string[];
  if (input.keys) {
    keys = normalizeMergeKeys(input.keys);
    if (keys.length < 2) {
      throw new ValidationError("A merge needs two different names.");
    }
  } else {
    const id = input.id!;
    const stored = merges.find((merge) => merge.id === id);
    const proposal = findShoppingProposals(items, settings, merges).find(
      (each) => each.id === id,
    );
    if (stored) keys = stored.keys;
    else if (proposal) {
      keys = normalizeMergeKeys(proposal.rows.map((row) => row.key));
    } else {
      throw new NotFoundError(
        `No proposal or merge "${id}" on the shopping list. \`shopping merges\` lists them.`,
      );
    }
  }

  if (input.status === "merged") {
    /* A merge sharing a name is part of this one now (Da4). */
    let grown = true;
    while (grown) {
      grown = false;
      for (const merge of merges) {
        if (
          merge.status === "merged" &&
          overlaps(merge.keys, keys) &&
          merge.keys.some((key) => !keys.includes(key))
        ) {
          keys = normalizeMergeKeys([...keys, ...merge.keys]);
          grown = true;
        }
      }
    }
  }
  const id = mergeIdOf(keys);
  /* Replacing a decision with itself (the same names) is an update of it. */
  const previous =
    replaced?.id === id ? replaced : merges.find((merge) => merge.id === id);
  const removed = new Set<string>(
    replaced && replaced.id !== id ? [replaced.id] : [],
  );
  for (const merge of merges) {
    if (merge.id === id) continue;
    /*
     * The wider answer replaces the narrower: an apart decision this one
     * covers, and (merging) every merged one it absorbed. Keeping a wider
     * set apart leaves a narrower merge as it is.
     */
    const covered =
      merge.status === "apart" && merge.keys.every((key) => keys.includes(key));
    const absorbed =
      input.status === "merged" &&
      merge.status === "merged" &&
      overlaps(merge.keys, keys);
    if (covered || absorbed) removed.add(merge.id);
  }
  if (onDisk.length - removed.size + (previous ? 0 : 1) > MAX_SHOPPING_MERGES) {
    throw new ValidationError(
      `The list holds at most ${MAX_SHOPPING_MERGES} merge decisions.`,
    );
  }

  const carried = previous?.status === input.status ? previous : undefined;
  /*
   * 49a review: a merge that grows (a third name joining) keeps what the
   * person said of the merge it absorbs — its name and note; its amount was
   * for the old items, so it goes.
   */
  const absorbedMerges = merges.filter(
    (merge) => removed.has(merge.id) && merge.status === "merged",
  );
  const absorbedName = absorbedMerges.find((merge) => merge.name)?.name;
  const absorbedNote = absorbedMerges.find((merge) => merge.note)?.note;
  const decision: ShoppingMerge = {
    id,
    keys,
    status: input.status,
    decidedAt: new Date().toISOString(),
  };
  if (input.status === "merged") {
    const name =
      input.name ??
      carried?.name ??
      (input.status === "merged" ? absorbedName : undefined);
    if (name) decision.name = name;
    if (input.amount !== undefined) {
      /* The items the merged row covers once this decision applies. */
      const others = merges.filter(
        (merge) => merge.id !== id && !removed.has(merge.id),
      );
      const view = buildShoppingView(
        items,
        settings,
        [],
        [],
        [...others, decision],
      );
      const row = [
        ...view.stores.flatMap((list) =>
          list.sections.flatMap((section) => section.rows),
        ),
        ...view.onHand,
        ...view.checked,
      ].find((each) => each.key === `merge:${id}`);
      if (!row) {
        throw new ValidationError(
          "An amount needs two or more of these names on the list (with merge switched on).",
        );
      }
      /* 49c review: an ask's sum holds to the lines it was worked out for. */
      decision.amount = {
        text: input.amount,
        ids: [...new Set(input.amountFor ?? row.ids)].sort(),
      };
    } else if (carried?.amount) {
      decision.amount = carried.amount;
    }
  }
  const note =
    input.note ??
    carried?.note ??
    (input.status === "merged" ? absorbedNote : undefined);
  if (note) decision.note = note;

  const unchanged =
    previous !== undefined &&
    mergeSubstance(previous) === mergeSubstance(decision) &&
    removed.size === 0;
  if (unchanged) {
    return { merges: onDisk, changed: false, decision: previous, removed: [] };
  }
  const verb =
    input.status === "merged"
      ? `merge ${keysText(keys)}${decision.name ? ` → ${decision.name}` : ""}`
      : `keep apart ${keysText(keys)}`;
  const changed = await applyFiles(
    ctx,
    [
      { relative: mergeFile(id), bytes: serializeMerge(decision) },
      ...[...removed].map((gone) => ({
        relative: mergeFile(gone),
        bytes: null,
      })),
    ],
    `Update shopping list: ${verb}`,
  );
  return {
    merges: changed ? await readShoppingMerges(ctx) : onDisk,
    changed,
    decision: canonicalShoppingMerge(decision),
    removed: [...removed],
  };
}

/**
 * Split (49a, Da5): delete a decision — a merged one shows its rows apart
 * again (and the proposal comes back), an apart one lets the proposal show
 * again. One commit; none when no such decision is stored.
 */
export async function splitShoppingMerge(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingMergeResult> {
  const { id } = parseInput(ShoppingSplitSchema, raw);
  if (!MERGE_ID_PATTERN.test(id)) {
    throw new ValidationError("A merge id is 16 hex characters.");
  }
  return withWriteLock(ctx.contentDirectory, "shopping: split", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const merges = await readShoppingMerges(ctx);
    const stored = merges.find((merge) => merge.id === id);
    if (!stored) return { merges, changed: false, removed: [] };
    const verb = stored.status === "merged" ? "split" : "ask again about";
    const changed = await applyFiles(
      ctx,
      [{ relative: mergeFile(id), bytes: null }],
      `Update shopping list: ${verb} ${stored.name ?? keysText(stored.keys)}`,
    );
    return {
      merges: changed ? await readShoppingMerges(ctx) : merges,
      changed,
      removed: changed ? [id] : [],
    };
  });
}

// --- this list's layers, and the rules for every list (50a) -------------------

function serializeLayer(layer: ShoppingLayer): string {
  return `${JSON.stringify(canonicalShoppingLayer(layer), null, 2)}\n`;
}

function serializeRule(rule: ShoppingRule): string {
  return `${JSON.stringify(canonicalShoppingRule(rule), null, 2)}\n`;
}

/** A layer in a commit subject: its ops in words, shortened. */
function layerText(
  layer: ShoppingLayer,
  items: readonly ShoppingItem[],
): string {
  return describe([listLayers([layer], items)[0].text]);
}

/**
 * 50a (Da2): put a change on this list — one layer of ops tied to item ids,
 * on from now (unless `on: false`) — one commit. Every id must be on the
 * list now: a change is about the list as it is.
 */
export async function addShoppingLayer(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingLayerResult> {
  const input = parseInput(ShoppingLayerAddSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: change", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const [items, layers] = await Promise.all([
      readShoppingItems(ctx),
      readShoppingLayers(ctx),
    ]);
    const present = new Set(items.map((item) => item.id));
    const unknown = [...new Set(input.ops.flatMap((op) => op.ids))].filter(
      (id) => !present.has(id),
    );
    if (unknown.length > 0) {
      throw new ValidationError(
        `Not on the shopping list: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ` (+${unknown.length - 5} more)` : ""}. A change names items on the list now (\`shopping list --json\` lists their ids).`,
      );
    }
    if (layers.length >= MAX_SHOPPING_LAYERS) {
      throw new ValidationError(
        `The list holds at most ${MAX_SHOPPING_LAYERS} changes: remove some first.`,
      );
    }
    const id = newId();
    const layer = parseShoppingLayer(
      {
        id,
        ops: input.ops,
        reason: input.reason,
        note: input.note,
        by: input.by ?? { kind: "you" },
        at: new Date().toISOString(),
        on: input.on ?? true,
        from: input.from,
      },
      id,
    );
    /* The stored form must read back as it was given (a merge of one id). */
    if (!layer || layer.ops.length !== input.ops.length) {
      throw new ValidationError(
        "A merge names two or more different items; every op names at least one.",
      );
    }
    await applyFiles(
      ctx,
      [{ relative: layerFile(id), bytes: serializeLayer(layer) }],
      `Update shopping list: change: ${layerText(layer, items)}`,
    );
    return {
      layers: await readShoppingLayers(ctx),
      changed: true,
      layer,
      removed: [],
    };
  });
}

/** 50a: turn a change off (undo: the file stays) or on again — one commit. */
export async function setShoppingLayer(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingLayerResult> {
  const { id, on } = parseInput(ShoppingLayerSetSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: change", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const [items, layers] = await Promise.all([
      readShoppingItems(ctx),
      readShoppingLayers(ctx),
    ]);
    const stored = layers.find((layer) => layer.id === id);
    if (!stored) {
      throw new NotFoundError(
        `No change "${id}" on the shopping list. \`shopping changes\` lists them.`,
      );
    }
    if (stored.on === on) {
      return { layers, changed: false, layer: stored, removed: [] };
    }
    const layer = canonicalShoppingLayer({ ...stored, on });
    await applyFiles(
      ctx,
      [{ relative: layerFile(id), bytes: serializeLayer(layer) }],
      `Update shopping list: change ${on ? "on" : "off"}: ${layerText(layer, items)}`,
    );
    return {
      layers: await readShoppingLayers(ctx),
      changed: true,
      layer,
      removed: [],
    };
  });
}

/** 50a: remove a change (its file) — one commit; none when it is not stored. */
export async function removeShoppingLayer(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingLayerResult> {
  const { id } = parseInput(ShoppingLayerRemoveSchema, raw);
  return withWriteLock(ctx.contentDirectory, "shopping: change", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const [items, layers] = await Promise.all([
      readShoppingItems(ctx),
      readShoppingLayers(ctx),
    ]);
    const stored = layers.find((layer) => layer.id === id);
    if (!stored) return { layers, changed: false, removed: [] };
    await applyFiles(
      ctx,
      [{ relative: layerFile(id), bytes: null }],
      `Update shopping list: remove change: ${layerText(stored, items)}`,
    );
    return {
      layers: await readShoppingLayers(ctx),
      changed: true,
      removed: [id],
    };
  });
}

/**
 * 50a (Da3): leave a name off every list, or bring one back (Restore) — one
 * commit, none when nothing changes. A built-in name (water) brought back is
 * a rule saying so; a rule that would only repeat the built-in set (or a
 * person's own leave-off restored) is deleted instead.
 */
export async function setShoppingLeaveOff(
  ctx: CurationContext,
  raw: unknown,
): Promise<ShoppingRuleResult> {
  const input = parseInput(ShoppingLeaveOffSchema, raw);
  /* A name is keyed as the list keys rows; a `key` (Restore's) is taken as is. */
  const named =
    input.name !== undefined ? shoppingNameOf(input.name) : undefined;
  const key = named?.key ?? input.key!;
  const label = named?.label ?? key;
  const typed = input.name ?? key;
  const id = ruleIdOf("leave-off", key);
  return withWriteLock(ctx.contentDirectory, "shopping: rule", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const rules = await readShoppingRules(ctx);
    const stored = rules.find((rule) => rule.id === id);
    const builtIn = BUILT_IN_LEAVE_OFF.has(key);
    const name = key.startsWith("text:") ? typed.trim() : label;
    const verb = input.leaveOff ? `leave off ${name}` : `buy ${name} again`;
    if (input.leaveOff === builtIn && !(input.leaveOff && input.reason)) {
      /* The built-in set says it already: no rule. */
      if (!stored) return { rules, changed: false };
      await applyFiles(
        ctx,
        [{ relative: ruleFile(id), bytes: null }],
        `Update shopping list: ${verb}`,
      );
      return { rules: await readShoppingRules(ctx), changed: true };
    }
    const rule = canonicalShoppingRule({
      id,
      kind: "leave-off",
      key,
      name,
      leaveOff: input.leaveOff,
      ...(input.reason ? { reason: input.reason } : {}),
      decidedAt: new Date().toISOString(),
    });
    if (
      stored &&
      serializeRule({ ...stored, decidedAt: "" }) ===
        serializeRule({ ...rule, decidedAt: "" })
    ) {
      return { rules, changed: false, rule: stored };
    }
    if (!stored && rules.length >= MAX_SHOPPING_RULES) {
      throw new ValidationError(
        `The list holds at most ${MAX_SHOPPING_RULES} rules.`,
      );
    }
    await applyFiles(
      ctx,
      [{ relative: ruleFile(id), bytes: serializeRule(rule) }],
      `Update shopping list: ${verb}`,
    );
    return { rules: await readShoppingRules(ctx), changed: true, rule };
  });
}

// --- 50b: tidy runs ----------------------------------------------------------

function tidyFile(id: string): string {
  return path.join(SHOPPING_LIST_PATHS.tidy, `${id}.json`);
}

/** 50b: this list's tidy runs, newest first. */
export async function readTidyRuns(ctx: CurationContext): Promise<TidyRun[]> {
  return sortTidyRuns(
    await readRecords(
      ctx,
      SHOPPING_LIST_PATHS.tidy,
      /^([0-9a-hjkmnp-tv-z]{26})\.json$/,
      parseTidyRun,
    ),
  );
}

/** 50b: one run, or `not_found`. */
export async function readTidyRun(
  ctx: CurationContext,
  id: string,
): Promise<TidyRun> {
  const runId = id.trim().toLowerCase();
  const run = TIDY_RUN_ID_PATTERN.test(runId)
    ? (await readTidyRuns(ctx)).find((each) => each.id === runId)
    : undefined;
  if (!run) {
    throw new NotFoundError(
      `No tidy run "${id}" on the shopping list. \`shopping suggestions\` lists the latest.`,
    );
  }
  return run;
}

function tidyModelText(run: TidyRun): string {
  return run.model;
}

/**
 * 50b (Db5): keep a run — one commit, "Update shopping list: tidy with
 * qwen3:8b: 7 suggestions". The oldest run goes in the same commit past
 * `MAX_TIDY_RUNS`.
 */
export async function writeTidyRun(
  ctx: CurationContext,
  run: TidyRun,
): Promise<TidyRun> {
  if (!TIDY_RUN_ID_PATTERN.test(run.id)) {
    throw new ValidationError(`A tidy run's id is a ULID, not "${run.id}".`);
  }
  return withWriteLock(ctx.contentDirectory, "shopping: tidy", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const runs = await readTidyRuns(ctx);
    const others = runs.filter((each) => each.id !== run.id);
    const dropped = others.slice(MAX_TIDY_RUNS - 1);
    const n = run.suggestions.length;
    await applyFiles(
      ctx,
      [
        { relative: tidyFile(run.id), bytes: serializeTidyRun(run) },
        ...dropped.map((each) => ({
          relative: tidyFile(each.id),
          bytes: null,
        })),
      ],
      `Update shopping list: tidy with ${tidyModelText(run)} (${run.on}): ${n === 1 ? "1 suggestion" : `${n} suggestions`}`,
    );
    return run;
  });
}

/** The run and suggestion a suggestion id names, or `not_found`. */
function findSuggestion(
  runs: readonly TidyRun[],
  id: string,
): { run: TidyRun; suggestion: TidySuggestion } {
  const wanted = id.trim().toLowerCase();
  const runId = runIdOfSuggestion(wanted);
  const run = runId ? runs.find((each) => each.id === runId) : undefined;
  const suggestion = run?.suggestions.find((each) => each.id === wanted);
  if (!run || !suggestion) {
    throw new NotFoundError(
      `No suggestion "${id}" on the shopping list. \`shopping suggestions\` lists them.`,
    );
  }
  return { run, suggestion };
}

export interface TidyDecisionResult {
  run: TidyRun;
  suggestion: TidySuggestion;
  changed: boolean;
  /** Accept: the layer written. */
  layer?: ShoppingLayer;
}

/**
 * 50b (Db5): **Accept** writes the suggestion as one layer of this list
 * (`from` its id, `by` the run's model, the title as its reason) and marks
 * it accepted; **Skip** marks it skipped — each one commit. A suggestion
 * already decided answers unchanged; a stale one (an item has left the
 * list) is refused.
 */
export async function decideTidySuggestion(
  ctx: CurationContext,
  id: string,
  action: "accept" | "skip",
): Promise<TidyDecisionResult> {
  return withWriteLock(ctx.contentDirectory, "shopping: tidy", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const [runs, items, layers] = await Promise.all([
      readTidyRuns(ctx),
      readShoppingItems(ctx),
      readShoppingLayers(ctx),
    ]);
    const { run, suggestion } = findSuggestion(runs, id);
    const present = new Set(items.map((item) => item.id));
    const status = tidyStatusOf(run, suggestion, present);
    const wanted = action === "accept" ? "accepted" : "skipped";
    if (status === wanted) return { run, suggestion, changed: false };
    if (status === "accepted") {
      throw new ValidationError(
        `"${suggestion.title}" is accepted already: turn its change off or remove it in Changes.`,
      );
    }
    if (status === "stale" && action === "accept") {
      throw new ValidationError(
        `"${suggestion.title}" names lines no longer on the list: run Tidy again.`,
      );
    }
    const at = new Date().toISOString();
    if (action === "skip") {
      const next: TidyRun = {
        ...run,
        status: { ...run.status, [suggestion.id]: { status: "skipped", at } },
      };
      await applyFiles(
        ctx,
        [{ relative: tidyFile(run.id), bytes: serializeTidyRun(next) }],
        `Update shopping list: skip: ${suggestion.title}`,
      );
      return { run: next, suggestion, changed: true };
    }
    if (layers.length >= MAX_SHOPPING_LAYERS) {
      throw new ValidationError(
        `The list holds at most ${MAX_SHOPPING_LAYERS} changes: remove some first.`,
      );
    }
    /* The seat's own check on a layer, as a person's would be (Da2). */
    const input = parseInput(ShoppingLayerAddSchema, {
      ops: suggestion.ops,
      reason: suggestion.title.slice(0, 300),
      by: { kind: "model", model: run.model },
      from: suggestion.id,
    });
    const layerId = newId();
    const layer = parseShoppingLayer(
      {
        id: layerId,
        ops: input.ops,
        reason: input.reason,
        by: input.by,
        at,
        on: true,
        from: input.from,
      },
      layerId,
    );
    if (!layer || layer.ops.length !== input.ops.length) {
      throw new ValidationError(
        `"${suggestion.title}" does not read back as a change: skip it.`,
      );
    }
    const next: TidyRun = {
      ...run,
      status: {
        ...run.status,
        [suggestion.id]: { status: "accepted", at, layer: layerId },
      },
    };
    await applyFiles(
      ctx,
      [
        { relative: layerFile(layerId), bytes: serializeLayer(layer) },
        { relative: tidyFile(run.id), bytes: serializeTidyRun(next) },
      ],
      `Update shopping list: accept: ${suggestion.title} (${run.model})`,
    );
    return { run: next, suggestion, changed: true, layer };
  });
}

/**
 * 50b (Db6): a card asked again with a note — its answer takes the old
 * suggestion's place (same id, `revised`), pending again; one commit.
 * Refused once it is accepted.
 */
export async function reviseTidySuggestion(
  ctx: CurationContext,
  revised: TidySuggestion,
): Promise<TidyRun> {
  return withWriteLock(ctx.contentDirectory, "shopping: tidy", async () => {
    await assertNoMergeInProgress(ctx.contentDirectory);
    const runs = await readTidyRuns(ctx);
    const { run, suggestion } = findSuggestion(runs, revised.id);
    if (run.status[suggestion.id]?.status === "accepted") {
      throw new ValidationError(
        `"${suggestion.title}" was accepted while the model was asked: turn its change off first.`,
      );
    }
    const { [suggestion.id]: _old, ...status } = run.status;
    void _old;
    const next: TidyRun = {
      ...run,
      suggestions: run.suggestions.map((each) =>
        each.id === suggestion.id ? revised : each,
      ),
      status,
    };
    await applyFiles(
      ctx,
      [{ relative: tidyFile(run.id), bytes: serializeTidyRun(next) }],
      `Update shopping list: revise: ${suggestion.title} → ${revised.title}`,
    );
    return next;
  });
}
