import { createCachedTaxonomyReads } from "@discontent/cms/taxonomies/next/cachedReads";
import { recipeContentConfig } from "../recipeContentConfig";
import { recipeTagTaxonomy } from "../recipeTagTaxonomy";

/**
 * Both cached reads of the recipe tag vocabulary: `terms` (the cloud) and
 * `byTerm` (what `/tags/<slug>` renders). Shared by the editor and the export.
 *
 * One module since 24b, where there were two — `readRecipeTags.ts` held the
 * cloud and this held the inverted map — because both now come from the one
 * `recipeTagTaxonomy` declaration and building them apart would mean naming
 * that declaration twice.
 *
 * Built at module scope so the `React.cache` wrapper inside survives long
 * enough to dedupe: a tag page asks for the inverted value once to resolve its
 * label and once to list its recipes, `generateStaticParams` asks again for the
 * same value the pages then render from, and the homepage renders
 * `BrowseChips` from the term list. A factory called per render would hand back
 * a fresh, empty memo table every time.
 *
 * Still two `unstable_cache` entries under two tags, not one: adding a recipe
 * that carries an existing tag moves `by-tag`, and a page rendering only the
 * cloud should not be invalidated by it.
 */
export const recipeTagReads = createCachedTaxonomyReads({
  config: recipeContentConfig,
  taxonomy: recipeTagTaxonomy,
});

export default recipeTagReads;
