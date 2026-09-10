import { createCachedAggregateRead } from "@discontent/cms/aggregates/next/cachedReads";
import { groupsByRecipe } from "../groupAggregateConfigs";
import { groupContentConfig } from "../groupContentConfig";

/**
 * The cached read behind the recipe view's "Appears in" block, shared by the
 * editor and the export.
 *
 * Built at module scope so the `React.cache` wrapper inside survives long
 * enough to dedupe — the same reasoning as `readRecipeTagIndex.ts`. It matters
 * on `/recipe/<slug>`, which is rendered once for metadata and once for the
 * body, and on the export build, where every recipe page in the corpus asks for
 * the same single value.
 *
 * `null` means the aggregate has never been folded — an unbuilt content
 * directory, or a fixture captured before groups existed. Callers render that
 * as "appears in nothing", which is also what it looks like.
 */
export const groupsByRecipeReads = createCachedAggregateRead({
  config: groupContentConfig,
  aggregateConfig: groupsByRecipe,
});

export default groupsByRecipeReads;
