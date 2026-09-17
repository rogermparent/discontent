import { createCachedTaxonomyReads } from "@discontent/cms/taxonomies/next/cachedReads";
import { noteTagTaxonomy } from "./noteTaxonomy";
import { noteConfig } from "./notes";

/**
 * The cached reads for the note tag vocabulary: `terms` and `byTerm`.
 *
 * Built at module scope rather than per request so the `React.cache` wrapper
 * inside survives long enough to dedupe anything — a factory called per render
 * would hand back a fresh, empty memo table every time. Same reasoning as
 * `notePaginationReads.ts`.
 *
 * Two entries under two tags, not one: adding a note carrying a tag that
 * already exists moves `by-tag` and leaves `tags` byte-identical, and the tag
 * cloud must not be invalidated by it. That is the property `aggregates.spec.ts`
 * asserts.
 */
export const noteTagReads = createCachedTaxonomyReads({
  config: noteConfig,
  taxonomy: noteTagTaxonomy,
});

export default noteTagReads;
