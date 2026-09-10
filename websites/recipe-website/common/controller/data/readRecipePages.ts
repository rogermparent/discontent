import { createCachedPaginationReads } from "@discontent/cms/pagination/next/cachedReads";
import { readAllIds } from "@discontent/cms/pagination/readAllIds";
import { recipesByDate, type RecipeListEntry } from "../paginationConfigs";
import { recipeContentConfig } from "../recipeContentConfig";
import type { RecipeEntryKey, RecipeEntryValue } from "../types";

/**
 * The cached reads for the recipe index, shared by the editor and the export.
 *
 * Built at module scope rather than per request so the `React.cache` wrappers
 * inside survive long enough to dedupe anything — a factory called per render
 * would hand back fresh, empty memo tables every time.
 *
 * These serve every recipe surface that renders a list: the `/recipes`
 * landing and its numbered pages, and — since the homepage strips moved onto
 * `readHead` — the newest-six strip too. What is left on `getRecipes` wants
 * the whole index rather than one page of it: `getAllTags` and the
 * search corpus routes (`search/all`, `search/ingredients`), all of which need
 * the values.
 */
export const recipePages = createCachedPaginationReads<
  RecipeEntryValue,
  RecipeEntryKey,
  RecipeListEntry
>({
  config: recipeContentConfig,
  paginationConfig: recipesByDate,
});

/**
 * Every recipe slug, for the export's `recipe/[slug]` `generateStaticParams`
 * (F7).
 *
 * Deliberately not one of the cached reads above. `generateStaticParams` runs
 * once per build, so a `unstable_cache` entry would be written and never read
 * again — and it would be a fourth tagged read to keep in step with §7's three
 * invalidation seats, bought for nothing.
 *
 * The order is the sorted keyspace's — ascending, where `getRecipes` returned
 * newest-first. `generateStaticParams` is a set, not a sequence: it decides
 * which pages exist, not what any of them contains.
 */
export function readAllRecipeIds(): Promise<string[]> {
  return readAllIds<RecipeEntryValue, RecipeEntryKey, RecipeListEntry>({
    config: recipeContentConfig,
    paginationConfig: recipesByDate,
  });
}

export default recipePages;
