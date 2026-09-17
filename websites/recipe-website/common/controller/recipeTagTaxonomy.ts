import type {
  TaxonomyByTermEntry,
  TaxonomyConfig,
} from "@discontent/cms/taxonomies/types";
import type { RecipeListEntry } from "./paginationConfigs";
import type { RecipeEntryKey, RecipeEntryValue } from "./types";

/**
 * The recipe corpus's one vocabulary — `tag`, whose root terms are the facets
 * (diet, meal, speed, cuisine, kind).
 *
 * Its own module rather than a field inside `recipeContentConfig.ts`: the
 * content config imports this, and this imports only *types* back, so there is
 * no cycle — the same split `paginationConfigs.ts` uses (T1/T3).
 *
 * This declaration replaces the two hand-written aggregates it used to take
 * (`recipeTags`, `recipesByTag`). The engine derives both from these four
 * lines, under the **same names** — `tags` and `by-tag` — so every cache tag
 * (`aggregate:recipes:tags`, `aggregate:recipes:by-tag`), every LMDB directory
 * (`recipes/aggregates/…`) and every route stays exactly where it was. What
 * moves is the *shape* of the terms value: `string[]` became
 * `Array<{slug, label, count}>`, which is what the version bump below is for.
 *
 * No `slugOf`: the engine's default `termSlug` is `@sindresorhus/slugify`,
 * which is precisely this site's `tagSlug`, so no `/tags/<slug>` URL moves.
 */
export const recipeTagTaxonomy: TaxonomyConfig<
  RecipeEntryValue,
  RecipeEntryKey,
  RecipeListEntry
> = {
  name: "tag",
  /**
   * Already on the index value — `buildIndexValue` copies `tags` verbatim for
   * the search corpus — which is why adopting this is not an index-shape change
   * and forces no content rebuild. Only the two aggregate records recompute.
   */
  field: "tags",
  /*
   * `"2"`, not `"1"`, and that is the whole migration. The hand-written pair
   * declared `"1"`; the stored spec version is now
   * `` `${TAXONOMY_FOLD_VERSION}.${version}` `` = `"1.2"`, so every record
   * folded by the old configs reads as stale and is recomputed at the next
   * write — which is exactly what the changed terms shape requires. A corpus
   * reads `null` (empty) in between, so the real repo gets one `reindex` (T5).
   *
   * Bump this when `project` or `slugOf` changes what it produces, for the
   * reason `recipesByDate.version` spells out at length: a hash over
   * `fn.toString()` is not build-stable (F16).
   */
  version: "2",
  /*
   * The same five fields the paginated pages carry, so `RecipeList` renders a
   * tag page and a `/recipes` page from identical rows — and, more to the
   * point, so the by-term record stays the size it already was. It is the
   * single lever on that record's growth (F8b's ~150 KB threshold, T9).
   *
   * `image` and `tags` are **spread rather than assigned**, which is the one
   * place this is deliberately *not* what `recipesByTag` did: that fold wrote
   * `image: value.image` unconditionally, so every row for a recipe without a
   * picture carried an `image` key holding `undefined`. The JSON is the same
   * either way and the stored object is not, so the rows move — which is free
   * here only because the version bump above rewrites the whole record anyway.
   * Spreading is the shape a *future* field can be added in without moving
   * every row again.
   */
  project: ({ key: [date], value, id }) => ({
    slug: id,
    date,
    name: value.name,
    ...(value.image ? { image: value.image } : {}),
    ...(value.tags ? { tags: value.tags } : {}),
  }),
};

/**
 * One tag's page: the label to print, and the recipes to list.
 *
 * An alias rather than a declaration since 24b — the engine owns the shape now,
 * and the rows are `RecipeListEntry`s exactly as they were. The field that
 * carried them is `items` rather than `recipes`, because one generic entry type
 * serves every carrier a vocabulary has (a tag page lists groups too).
 */
export type TagIndexEntry = TaxonomyByTermEntry<RecipeListEntry>;

export default recipeTagTaxonomy;
