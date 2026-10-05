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
 * index lines — so the two cannot disagree. The scope goes through
 * `searchRecipes`, which is what lets 24d's term resolver reach it later
 * without a change here.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { commitContentChanges } from "@discontent/cms/git/commit";
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
  analyzeMakeable,
  DEFAULT_MAKE_QUERY,
  type BuyNext,
  type MakeRecipe,
  type RecipeMatch,
  requirementLabel,
} from "recipe-website-common/util/makeable";
import type { CurationContext } from "./context";
import {
  InventoryMakeQuerySchema,
  InventoryPatchSchema,
  InventorySetSchema,
  parseInput,
} from "./schema";
import { searchRecipes } from "./search";

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

async function writeInventory(
  ctx: CurationContext,
  items: string[],
  message: string,
): Promise<void> {
  const file = inventoryPath(ctx);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ items }, null, 2)}\n`);
  await commitContentChanges(
    message,
    ctx.author,
    [INVENTORY_FILE],
    ctx.contentDirectory,
  );
}

/** Remove first, then add; one commit, or none when nothing moved. */
export async function patchInventory(
  ctx: CurationContext,
  raw: unknown,
): Promise<InventoryWriteResult> {
  const input = parseInput(InventoryPatchSchema, raw);
  const { items: current, path: file } = await readInventory(ctx);

  const removeKeys = new Set((input.remove ?? []).map(inventoryKey));
  const removed = current.filter((item) => removeKeys.has(inventoryKey(item)));
  const kept = current.filter((item) => !removeKeys.has(inventoryKey(item)));
  const keptKeys = new Set(kept.map(inventoryKey));
  const added = dedupeItems(input.add ?? []).filter(
    (item) => !keptKeys.has(inventoryKey(item)),
  );
  /* Removed and re-added in one patch: neither, as far as the list goes. */
  const readded = new Set(added.map(inventoryKey));
  const netRemoved = removed.filter((item) => !readded.has(inventoryKey(item)));
  const netAdded = added.filter(
    (item) =>
      !removed.some((gone) => inventoryKey(gone) === inventoryKey(item)),
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

/** Replace the whole list. The one inventory write held back from agents. */
export async function setInventory(
  ctx: CurationContext,
  raw: unknown,
): Promise<InventoryWriteResult> {
  const input = parseInput(InventorySetSchema, raw);
  const { items: current, path: file } = await readInventory(ctx);
  const items = sorted(dedupeItems(input.items));
  const nextKeys = new Set(items.map(inventoryKey));
  const currentKeys = new Set(current.map(inventoryKey));
  const added = items.filter((item) => !currentKeys.has(inventoryKey(item)));
  const removed = current.filter((item) => !nextKeys.has(inventoryKey(item)));
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
}

export interface MakeableResult {
  query: string;
  /** How many items the judged list holds. */
  inventory: number;
  /** Recipes in scope. */
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
  };
}

/** The whole corpus with the two 25c fields `RecipeRow` leaves out. */
async function readMakeCorpus(ctx: CurationContext): Promise<MakeRecipe[]> {
  const { entries } = await readContentIndex<
    RecipeEntryValue,
    RecipeEntryKey,
    MakeRecipe
  >({
    config: recipeContentConfig,
    reverse: true,
    contentDirectory: ctx.contentDirectory,
    map: ({ key: [, slug], value }) => ({
      slug,
      name: value.name,
      ingredients: value.ingredients,
      ingredientHeadings: value.ingredientHeadings,
      ingredientRecipeLinks: value.ingredientRecipeLinks,
    }),
  });
  return entries;
}

/** What the shared list can make in `query`'s scope (`tag:drink` by default). */
export async function makeable(
  ctx: CurationContext,
  raw: unknown = {},
): Promise<MakeableResult> {
  const { query = DEFAULT_MAKE_QUERY, limit = 20 } = parseInput(
    InventoryMakeQuerySchema,
    raw,
  );
  const [{ items }, corpus, scope] = await Promise.all([
    readInventory(ctx),
    readMakeCorpus(ctx),
    searchRecipes(ctx, query, { limit: Number.MAX_SAFE_INTEGER }),
  ]);
  const inScope = new Set(scope.recipes.map((row) => row.slug));
  const scoped = corpus.filter((recipe) => inScope.has(recipe.slug));
  const analysis = analyzeMakeable(scoped, corpus, items);
  return {
    query,
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
