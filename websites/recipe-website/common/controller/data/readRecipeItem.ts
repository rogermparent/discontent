import { createCachedItemRead } from "@discontent/cms/content/next/cachedItemRead";
import { recipeContentConfig } from "../recipeContentConfig";
import type { Recipe, RecipeEntryKey, RecipeEntryValue } from "../types";

/**
 * The cached by-slug read for a recipe's whole data file, shared by the editor
 * and the export.
 *
 * Built at module scope rather than per request so the `React.cache` wrapper
 * inside survives long enough to dedupe — the same reasoning as
 * `readRecipeTags.ts` and `readRecipePages.ts`. The dedupe is not incidental
 * here: `/recipe/<slug>` reads this file **twice per request** today, once in
 * `generateMetadata` and once in the body, and `/featured-recipe/<slug>` does
 * the same for two records.
 *
 * Read sites only. The write path in `editor/controller/actions/index.ts` keeps
 * the raw `getRecipeBySlug`, which is the split F10c used for `getAllTags` and
 * matters more here: `buildUpdateData` reads the current record to carry
 * `image` and `video` forward, and a stale read there would write the stale
 * values back to disk. A read site missing the cache is a performance miss; a
 * write site hitting it is data loss.
 */
export const recipeItems = createCachedItemRead<
  Recipe,
  RecipeEntryValue,
  RecipeEntryKey
>({
  config: recipeContentConfig,
});

export default recipeItems;
