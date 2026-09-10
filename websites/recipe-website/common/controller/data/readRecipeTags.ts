import { createCachedAggregateRead } from "@discontent/cms/aggregates/next/cachedReads";
import { recipeTags } from "../aggregateConfigs";
import { recipeContentConfig } from "../recipeContentConfig";

/**
 * The cached read for the recipe tag cloud, shared by the editor and the
 * export.
 *
 * Built at module scope rather than per request so the `React.cache` wrapper
 * inside survives long enough to dedupe anything — the homepage renders
 * `BrowseChips` from it, and a factory called per render would hand back a
 * fresh, empty memo table every time. Same reasoning as `readRecipePages.ts`.
 */
export const recipeTagReads = createCachedAggregateRead({
  config: recipeContentConfig,
  aggregateConfig: recipeTags,
});

export default recipeTagReads;
