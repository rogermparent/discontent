/**
 * The editor's shared inventory (25d/D10): one committed file,
 * `<content>/inventory/on-hand.json` = `{"items": [...]}`.
 *
 * **Not a content type, on purpose.** No config, no index, no registry entry —
 * so no rebuild, no aggregate and above all no export build ever sees it. The
 * static export is browser-only and must never read or serve this list; the
 * only readers are this module and the editor's signed-in `/make`. A boundary
 * test pins that nothing under `common/` or `export/` names the file.
 *
 * Every write is one commit, like every other curation write — "Update
 * inventory: +Gnista" — through the engine's `commitContentChanges`, so the
 * list has a history `git_log` can show and `git_revert` can undo. The local
 * CLI backend preflights the committer identity before calling in, exactly as
 * it does for `feature`.
 *
 * `makeable` judges the list against a search-language scope with the same
 * pure `analyzeMakeable` the `/make` page runs in the browser, over the same
 * index lines — so the two cannot disagree. Since 41i the scope is the
 * page's too: `scopeRecipes` with 24d's term resolver, the featured
 * ingredients through `featureScope`, and the editor's saved staples.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomic } from "@discontent/cms/fs/atomicWrite";
import {
  assertNoMergeInProgress,
  commitContentChanges,
} from "@discontent/cms/git/commit";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";
import {
  dedupeItems,
  inventoryKey,
} from "recipe-website-common/util/inventoryText";
import {
  canonicalItem,
  canonicalItems,
} from "recipe-website-common/util/matchers";
import { readSettings } from "@discontent/cms/settings";
import {
  featuredOfQuery,
  withFeature,
  withoutFeatures,
} from "recipe-website-common/components/MakePage/kinds";
import { featureScope } from "recipe-website-common/components/MakePage/makeMath";
import { scopeRecipes } from "recipe-website-common/components/MakePage/scope";
import { parseQuery } from "recipe-website-common/components/SearchForm/queryLanguage";
import {
  analyzeMakeable,
  assumedStaples,
  DEFAULT_MAKE_QUERY,
  DEFAULT_STAPLES,
  prepareCorpus,
  type BuyNext,
  type MakeRecipe,
  type RecipeMatch,
  requirementLabel,
} from "recipe-website-common/util/makeable";
import type { CurationContext } from "./context";
import { toRecipeRow, type RecipeRow } from "./recipes";
import {
  InventoryMakeQuerySchema,
  InventoryPatchSchema,
  InventorySetSchema,
  parseInput,
} from "./schema";
import { hasFieldTerm, readGroupsByRecipe } from "./search";
import { readTagResolver } from "./tagResolver";

/** Relative to the content directory — the path `git add` is given. */
export const INVENTORY_FILE = path.join("inventory", "on-hand.json");

export interface InventoryResult {
  items: string[];
  /** Absolute path of the file (which may not exist yet). */
  path: string;
}

export interface InventoryWriteResult extends InventoryResult {
  /** Items this write actually added — absent ones only. */
  added: string[];
  /** Items this write actually removed — present ones only. */
  removed: string[];
  /** False when the list was already as asked: nothing written or committed. */
  changed: boolean;
}

export function inventoryPath(ctx: CurationContext): string {
  return path.join(ctx.contentDirectory, INVENTORY_FILE);
}

/** The shared list; empty when the file has never been written. */
export async function readInventory(
  ctx: CurationContext,
): Promise<InventoryResult> {
  const file = inventoryPath(ctx);
  let items: string[] = [];
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as {
      items?: unknown;
    };
    if (Array.isArray(parsed.items)) {
      items = dedupeItems(
        parsed.items.filter((item): item is string => typeof item === "string"),
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return { items, path: file };
}

/** Case-insensitive alphabetical, so the committed file diffs line by line. */
function sorted(items: string[]): string[] {
  return [...items].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** "+Gnista +lime −vodka", shortened to fit a commit subject. */
function describe(added: string[], removed: string[]): string {
  const parts = [
    ...added.map((item) => `+${item}`),
    ...removed.map((item) => `−${item}`),
  ];
  let text = "";
  for (let i = 0; i < parts.length; i++) {
    const next = text ? `${text} ${parts[i]}` : parts[i];
    if (next.length > 56) return `${text} (+${parts.length - i} more)`;
    text = next;
  }
  return text;
}

/** Two spellings of one item share this key: a matcher's are canonical first. */
function itemKey(item: string): string {
  return inventoryKey(canonicalItem(item));
}

/** Called under the write lock, which `patchInventory` / `setInventory` hold. */
async function writeInventory(
  ctx: CurationContext,
  items: string[],
  message: string,
): Promise<void> {
  /* Atomic (D8): a reader never sees half a list, a crash never leaves one. */
  await writeFileAtomic(
    inventoryPath(ctx),
    `${JSON.stringify({ items }, null, 2)}\n`,
  );
  await commitContentChanges(
    message,
    ctx.author,
    [INVENTORY_FILE],
    ctx.contentDirectory,
  );
}

/**
 * Remove first, then add; one commit, or none when nothing moved.
 *
 * The read, the diff, the write and the commit are one write-lock scope (34d,
 * epic 34 D6): a read-modify-write of one shared file, so two saves at once —
 * `/make` and an agent's `inventory_add` — must not both read the old list.
 */
export async function patchInventory(
  ctx: CurationContext,
  raw: unknown,
): Promise<InventoryWriteResult> {
  const input = parseInput(InventoryPatchSchema, raw);
  return withWriteLock(ctx.contentDirectory, "inventory: update", () =>
    patchInventoryLocked(ctx, input),
  );
}

async function patchInventoryLocked(
  ctx: CurationContext,
  input: ReturnType<typeof InventoryPatchSchema.parse>,
): Promise<InventoryWriteResult> {
  /*
   * Mid-merge, every engine commit refuses (`dirty_tree`); refuse before the
   * file is written, not after, so a refusal leaves nothing behind.
   */
  await assertNoMergeInProgress(ctx.contentDirectory);
  const { items: current, path: file } = await readInventory(ctx);

  /*
   * A matcher is one item however it is spelled (42m2): `beans`, `any
   * beans` and `any bean` are all `any bean` — added in that spelling, and
   * removing any of them removes a stored "beans" from before.
   */
  const removeKeys = new Set((input.remove ?? []).map(itemKey));
  const removed = current.filter((item) => removeKeys.has(itemKey(item)));
  const kept = current.filter((item) => !removeKeys.has(itemKey(item)));
  const keptKeys = new Set(kept.map(itemKey));
  const added = dedupeItems(canonicalItems(input.add ?? [])).filter(
    (item) => !keptKeys.has(itemKey(item)),
  );
  /* Removed and re-added in one patch: neither, as far as the list goes. */
  const readded = new Set(added.map(itemKey));
  const netRemoved = removed.filter((item) => !readded.has(itemKey(item)));
  const netAdded = added.filter(
    (item) => !removed.some((gone) => itemKey(gone) === itemKey(item)),
  );

  if (netAdded.length === 0 && netRemoved.length === 0) {
    return {
      items: current,
      path: file,
      added: [],
      removed: [],
      changed: false,
    };
  }
  const items = sorted([...kept, ...added]);
  await writeInventory(
    ctx,
    items,
    `Update inventory: ${describe(netAdded, netRemoved)}`,
  );
  return {
    items,
    path: file,
    added: netAdded,
    removed: netRemoved,
    changed: true,
  };
}

/**
 * Replace the whole list. The one inventory write held back from agents.
 * Locked like `patchInventory`, so its added/removed are against the list it
 * replaced.
 */
export async function setInventory(
  ctx: CurationContext,
  raw: unknown,
): Promise<InventoryWriteResult> {
  const input = parseInput(InventorySetSchema, raw);
  return withWriteLock(ctx.contentDirectory, "inventory: replace", () =>
    setInventoryLocked(ctx, input),
  );
}

async function setInventoryLocked(
  ctx: CurationContext,
  input: ReturnType<typeof InventorySetSchema.parse>,
): Promise<InventoryWriteResult> {
  /*
   * Mid-merge, every engine commit refuses (`dirty_tree`); refuse before the
   * file is written, not after, so a refusal leaves nothing behind.
   */
  await assertNoMergeInProgress(ctx.contentDirectory);
  const { items: current, path: file } = await readInventory(ctx);
  const items = sorted(dedupeItems(canonicalItems(input.items)));
  /* By `itemKey`, as `patchInventory` compares (42m2 review): `any bean`
   * over a stored "beans" is no change. */
  const nextKeys = new Set(items.map(itemKey));
  const currentKeys = new Set(current.map(itemKey));
  const added = items.filter((item) => !currentKeys.has(itemKey(item)));
  const removed = current.filter((item) => !nextKeys.has(itemKey(item)));
  if (added.length === 0 && removed.length === 0) {
    return { items: current, path: file, added, removed, changed: false };
  }
  await writeInventory(
    ctx,
    items,
    `Replace inventory: ${items.length} ${items.length === 1 ? "item" : "items"}`,
  );
  return { items, path: file, added, removed, changed: true };
}

// --- makeable ---------------------------------------------------------------

export interface MakeableRow {
  slug: string;
  name: string;
  /** Required lines the list doesn't meet, as names. */
  missing?: string[];
  /** Recipes to make first ("lavender-syrup"), by slug. */
  makeFirst?: string[];
  /**
   * Lines met only by a close item (32j), counted as had: what the line
   * needs, and the list's entry standing in for it.
   */
  close?: { needs: string; have: string }[];
}

export interface MakeableResult {
  /** The scope as given (`""`: every recipe). */
  query: string;
  /**
   * The scope `/make` would read (41i): `query` with each `feature` written
   * in as an `ingredient:` term, as featuring on the page writes it.
   */
  scope: string;
  /**
   * The featured ingredients (41i, Dh7): `scope`'s top-level `ingredient:`
   * terms. A recipe is judged only when every one meets a required line.
   */
  features: string[];
  /** The page that shows the same answer: `/make?q=<scope>`. */
  link: string;
  /** Whether pantry staples counted as on hand (U5; on by default). */
  staples: boolean;
  /**
   * "Assume I always have" (41i): the editor's saved list (38a,
   * `settings.makeStaples`) when there is one, else `DEFAULT_STAPLES`.
   */
  alwaysHave: string[];
  /** How many items the judged list holds. */
  inventory: number;
  /** Recipes in scope — after the features narrowed it. */
  total: number;
  /** In scope, but with no ingredient lines to judge. */
  unjudged: number;
  canMake: MakeableRow[];
  oneAway: MakeableRow[];
  twoAway: MakeableRow[];
  /** Three or more away — a count, since a list of them says little. */
  further: number;
  buyNext: BuyNext[];
}

function toRow(match: RecipeMatch): MakeableRow {
  return {
    slug: match.recipe.slug,
    name: match.recipe.name,
    ...(match.missing.length > 0
      ? { missing: match.missing.map(requirementLabel) }
      : {}),
    ...(match.via.length > 0
      ? { makeFirst: match.via.map(({ slug }) => slug) }
      : {}),
    ...(match.close.length > 0
      ? {
          close: match.close.map(({ requirement, item }) => ({
            needs: requirementLabel(requirement),
            have: item,
          })),
        }
      : {}),
  };
}

/** A corpus row both the scope (`RecipeRow`) and the judge (`MakeRecipe`) read. */
export type MakeRow = RecipeRow & MakeRecipe & { groups?: string[] };

/**
 * The whole corpus, newest first: the search row plus the two 25c fields
 * `RecipeRow` leaves out — one read for the scope and the judge.
 */
export async function readMakeCorpus(ctx: CurationContext): Promise<MakeRow[]> {
  const { entries } = await readContentIndex<
    RecipeEntryValue,
    RecipeEntryKey,
    MakeRow
  >({
    config: recipeContentConfig,
    reverse: true,
    contentDirectory: ctx.contentDirectory,
    map: ({ key, value }) => ({
      ...toRecipeRow(key, value),
      ingredientHeadings: value.ingredientHeadings,
      ingredientRecipeLinks: value.ingredientRecipeLinks,
      ingredientAlternates: value.ingredientAlternates,
    }),
  });
  return entries;
}

/**
 * The editor's saved "Assume I always have" list (38a, Da2), or `undefined`
 * when none is saved — read from `SETTINGS_DIRECTORY/settings.json` (the CLI
 * and the stdio MCP run in the editor package, whose `settings/` the
 * workstation editor uses). A missing, unreadable or malformed value reads
 * as "nothing saved".
 */
async function readSavedStaples(): Promise<string[] | undefined> {
  const { makeStaples } = await readSettings<{ makeStaples?: unknown }>();
  if (!Array.isArray(makeStaples)) return undefined;
  const items = makeStaples.filter(
    (item): item is string => typeof item === "string" && !!item.trim(),
  );
  return items.length === makeStaples.length ? items : undefined;
}

/**
 * What the shared list can make in `query`'s scope — every recipe by default
 * (32j) — judged the way `/make` judges it (41i):
 *
 * - **The scope** is `scopeRecipes` over the query without its features
 *   (`withoutFeatures`): every free-text word must appear, `tag:` reaches a
 *   term's subtree, `group:` a group's members — the page's narrowing, not
 *   `recipe_search`'s ranked any-word match.
 * - **The features** (`feature`, plus any top-level `ingredient:` term the
 *   query already has) narrow through the matcher (`featureScope`, Dh7): a
 *   recipe stays only when each one meets a required line, so `gin` is gin
 *   and never ginger beer, and a garnish doesn't count.
 * - **The staples** are the editor's saved "Assume I always have"
 *   (`settings.makeStaples`) or `DEFAULT_STAPLES`, plus `PANTRY_STAPLES`
 *   unless `staples: false` (U5); close matches count as had.
 * - **Pattern items** (43m) on the list — `bean*`, `/may(o|onnaise)/` — meet
 *   lines as on the page: `parseInventoryItem` reads the stored text.
 *   42m's bean-swap tier is gone (patterns replaced it): a `beanSwaps`
 *   input is accepted and ignored, and the answer has no `beanSwap`.
 *
 * Buy next is computed inside the narrowed scope, as the page's "Buy next
 * for lime drinks" is.
 */
export async function makeable(
  ctx: CurationContext,
  raw: unknown = {},
): Promise<MakeableResult> {
  const {
    query = DEFAULT_MAKE_QUERY,
    feature = [],
    limit = 20,
    staples = true,
  } = parseInput(InventoryMakeQuerySchema, raw);
  const scope = feature.reduce(withFeature, query);
  const features = featuredOfQuery(scope);
  const base = withoutFeatures(scope);
  const { filter } = parseQuery(base);
  const [{ items }, corpus, saved, resolver, groupsByRecipe] =
    await Promise.all([
      readInventory(ctx),
      readMakeCorpus(ctx),
      readSavedStaples(),
      hasFieldTerm(filter, "tag") ? readTagResolver(ctx) : undefined,
      hasFieldTerm(filter, "group") ? readGroupsByRecipe(ctx) : undefined,
    ]);
  const rows = groupsByRecipe
    ? corpus.map((row) => {
        const groups = groupsByRecipe.get(row.slug);
        return groups ? { ...row, groups } : row;
      })
    : corpus;
  const prepared = prepareCorpus(corpus);
  const scoped = featureScope(
    scopeRecipes(rows, base, resolver),
    prepared,
    features,
  );
  const alwaysHave = saved ?? DEFAULT_STAPLES;
  const analysis = analyzeMakeable(scoped, prepared, items, {
    staples: assumedStaples(alwaysHave, staples),
  });
  return {
    query,
    scope,
    features,
    link: `/make?${new URLSearchParams({ q: scope })}`,
    staples,
    alwaysHave,
    inventory: items.length,
    total: scoped.length,
    unjudged: analysis.unjudged,
    canMake: analysis.canMake.slice(0, limit).map(toRow),
    oneAway: analysis.oneAway.slice(0, limit).map(toRow),
    twoAway: analysis.twoAway.slice(0, limit).map(toRow),
    further: analysis.further.length,
    buyNext: analysis.buyNext,
  };
}
