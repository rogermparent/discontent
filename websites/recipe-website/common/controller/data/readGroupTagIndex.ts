import { createCachedTaxonomyReads } from "@discontent/cms/taxonomies/next/cachedReads";
import { groupContentConfig } from "../groupContentConfig";
import { groupTagTaxonomy } from "../groupTagTaxonomy";

/**
 * Both cached reads of the *group* half of the site's tag vocabulary.
 *
 * The recipe half lives in `readRecipeTagIndex.ts`, and `/tags` unions the two
 * at read time (D4): one vocabulary, one term page, as many carrier types as
 * declare it. Two readers rather than one union reader because the two values
 * move independently — tagging a group must not invalidate a page that lists
 * only recipes, and the engine already gives each its own cache tag.
 *
 * Built at module scope, for the reason `readRecipeTagIndex.ts` gives.
 */
export const groupTagReads = createCachedTaxonomyReads({
  config: groupContentConfig,
  taxonomy: groupTagTaxonomy,
});

export default groupTagReads;
