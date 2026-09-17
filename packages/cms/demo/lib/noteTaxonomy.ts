import type { TaxonomyConfig } from "@discontent/cms/taxonomies/types";
import type { NoteIndexKey, NoteIndexValue } from "./notes";

/**
 * Notes' tag vocabulary — the reference implementation of the taxonomy kind.
 *
 * Its own module rather than a field inside `notes.ts`, for the same reason
 * `notePagination.ts` and the `noteAggregates.ts` this replaces were: the
 * content config imports this, and this imports only *types* back, so there is
 * no cycle.
 *
 * This is the whole declaration. It replaces the hand-written `noteTags`
 * aggregate and adds the inverted one the demo never had: the engine derives
 * `notes/tags` (`Array<{slug, label, count}>`) and `notes/by-tag`
 * (`Record<slug, {label, items}>`) from these three lines, with the same cache
 * tag, the same LMDB directory and the same `changed: false` behaviour the
 * hand-written fold had — which is what lets `aggregates.spec.ts` keep every
 * assertion it had before.
 *
 * No `slugOf` and no `project`: the defaults are `@sindresorhus/slugify` and
 * `{ id }`, which is exactly what the demo would have written.
 */
export const noteTagTaxonomy: TaxonomyConfig<
  NoteIndexValue,
  NoteIndexKey,
  { id: string }
> = {
  name: "tag",
  field: "tags",
  /*
   * The site's half of the stored spec version; the engine's
   * `TAXONOMY_FOLD_VERSION` is the other. Bump this when `slugOf` or `project`
   * changes what it produces — for the reason `notesByDate.version` spells
   * out, a hash over `fn.toString()` is not build-stable (F16).
   */
  version: "1",
};

export default noteTagTaxonomy;
