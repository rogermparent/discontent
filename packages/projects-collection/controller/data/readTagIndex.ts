import { createCachedTaxonomyReads } from "@discontent/cms/taxonomies/next/cachedReads";
import { projectContentConfig } from "../projectContentConfig";
import { projectTagTaxonomy } from "../projectTagTaxonomy";

/**
 * Both cached reads of the project tag vocabulary: `terms` (the `/tags` index)
 * and `byTerm` (what `/tags/<slug>` lists).
 *
 * Built at module scope rather than per request so the `React.cache` wrapper
 * inside survives long enough to dedupe — `generateStaticParams` asks for the
 * same value the pages then render from. Same reasoning as `readIndex.ts`.
 *
 * Two entries under two tags, not one: adding a project carrying a tag that
 * already exists moves `by-tag` and leaves `tags` byte-identical, and the index
 * page must not be invalidated by it.
 */
export const projectTagReads = createCachedTaxonomyReads({
  config: projectContentConfig,
  taxonomy: projectTagTaxonomy,
});

export default projectTagReads;
