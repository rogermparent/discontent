import { createCachedAggregateRead } from "@discontent/cms/aggregates/next/cachedReads";
import { recipesByTag } from "../aggregateConfigs";
import { recipeContentConfig } from "../recipeContentConfig";

/**
 * The cached read behind `/tags` and `/tags/<slug>`, shared by the editor and
 * the export.
 *
 * Built at module scope so the `React.cache` wrapper inside survives long
 * enough to dedupe: a tag page asks for the value once to resolve its label and
 * once to list its recipes, and `generateStaticParams` asks again for the same
 * value the pages then render from.
 */
export const recipeTagIndexReads = createCachedAggregateRead({
  config: recipeContentConfig,
  aggregateConfig: recipesByTag,
});

export default recipeTagIndexReads;
