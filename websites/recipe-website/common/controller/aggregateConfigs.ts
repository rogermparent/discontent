import type { AggregateConfig } from "@discontent/cms/aggregates/types";
import type { RecipeListEntry } from "./paginationConfigs";
import { tagSlug } from "./tagSlug";
import type { RecipeEntryKey, RecipeEntryValue } from "./types";

/**
 * Every tag in the corpus, deduped and sorted.
 *
 * Its own module rather than a field inside `recipeContentConfig.ts`: the
 * content config imports this, and this imports only *types* back, so there is
 * no cycle — the same split `paginationConfigs.ts` uses.
 *
 * Folds the content index *value*, which already carries `tags` because
 * `buildIndexValue` copies it for the search corpus. So adopting this needed no
 * index-shape change and therefore no forced rebuild — the fixtures only have
 * to gain the aggregate record itself.
 */
export const recipeTags: AggregateConfig<
  RecipeEntryValue,
  RecipeEntryKey,
  Set<string>,
  string[]
> = {
  name: "tags",
  /*
   * The whole of this aggregate's spec hash, for the reason
   * `recipesByDate.version` spells out at length: a hash derived from
   * `fn.toString()` is not stable across a minified production build and a dev
   * server, so a value folded by one and read by the other rewrote itself on
   * every pass (F16). Bump by hand when the fold changes.
   */
  version: "1",
  /*
   * A `Set` accumulator, a sorted array as the value. Sorting in `finalize`
   * rather than at the call site is load-bearing: the value is hashed, and an
   * unstable order would read as a change on every write.
   */
  initial: () => new Set<string>(),
  fold: (tags, { value }) => {
    for (const tag of value.tags ?? []) tags.add(tag);
    return tags;
  },
  finalize: (tags) => [...tags].sort(),
};

/** One tag's page: the label to print, and the recipes to list. */
export interface TagIndexEntry {
  /** The tag as authored, for display. `slugify` cannot be inverted. */
  label: string;
  /** Newest first, matching every other list surface. */
  recipes: RecipeListEntry[];
}

/**
 * Every tag mapped to the recipes carrying it — what `/tags/<slug>` renders.
 *
 * **A deliberate trade, and the one thing to understand before extending it.**
 * This is a single aggregate holding every tag's list, so it is a single cache
 * entry: a write that changes any tag's contents invalidates every tag page,
 * and the value grows as `recipes x tags-per-recipe`. That is the
 * corpus-document shape §2 names, not the precise one — the precise version is
 * a *partitioned* pagination index, where each tag is its own range with its
 * own pages and its own tag (§11.1, F8b).
 *
 * It is still a large improvement on what it replaces: `/search?q=tag:x`
 * needed the client search bundle and the whole corpus to render anything at
 * all, and could not be indexed. And the trade is bounded by the corpus — the
 * richest tag in the test corpus carries three recipes against a `perPage` of
 * twelve, so nothing here is close to wanting pagination yet. Move to
 * partitions when a tag actually exceeds `perPage`.
 *
 * Projects `RecipeListEntry`, the same five fields the paginated pages carry,
 * so `RecipeList` renders a tag page and a `/recipes` page from the same rows.
 */
export const recipesByTag: AggregateConfig<
  RecipeEntryValue,
  RecipeEntryKey,
  Map<string, TagIndexEntry>,
  Record<string, TagIndexEntry>
> = {
  name: "by-tag",
  /* Pinned by hand, for the reason `recipeTags.version` spells out. */
  version: "1",
  initial: () => new Map<string, TagIndexEntry>(),
  fold: (byTag, { key: [date], value, id }) => {
    for (const tag of value.tags ?? []) {
      const slug = tagSlug(tag);
      if (!slug) continue;
      /*
       * First label seen wins a collision — two distinct tags can slugify the
       * same ("half & half" and "half-and-half"), and their recipes merge onto
       * one page. Rare, harmless, and cheaper than carrying a disambiguator
       * through every link.
       */
      const entry = byTag.get(slug) ?? { label: tag, recipes: [] };
      entry.recipes.push({
        slug: id,
        date,
        name: value.name,
        image: value.image,
        tags: value.tags,
      });
      byTag.set(slug, entry);
    }
    return byTag;
  },
  /*
   * The walk is ascending by `[date, slug]`, so each list arrives oldest
   * first and is reversed here. Sorting the keys too keeps the hash stable:
   * an object whose keys arrived in a different order must not read as a
   * change, and `stableStringify` sorts keys but not the arrays inside them.
   */
  finalize: (byTag) =>
    Object.fromEntries(
      [...byTag.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([slug, entry]) => [
          slug,
          { label: entry.label, recipes: [...entry.recipes].reverse() },
        ]),
    ),
};

export default recipeTags;
