/**
 * Drop every cached read of every derived kind a site owns — the repair seat.
 *
 * Its caller is the one that has to undo state it did not create: a Playwright
 * harness rolling the content directory back to a fixture. That is not a write,
 * so it fires no tags, and nothing in a running server can know the corpus went
 * backwards. Without this a page cached during one test is served to the next,
 * and the suite becomes order-dependent in a way that only appears when tests
 * are resharded — which is to say, as a flake.
 *
 * Before F21b each site's route enumerated its cached *reads* by hand:
 * `recipePages`, `featuredRecipePages`, `recipeTagReads`, `recipeTagIndexReads`,
 * `recipeItems`. That is the second of the "three invalidation seats, and the
 * third gets forgotten" rule, and it enumerated the wrong thing — a read is a
 * consequence of a declaration, and the declaration is what the config already
 * holds. Portfolio's route expired nothing at all, which was correct only
 * because portfolio has no derived state yet.
 *
 * All three tag families are pure functions of what a config declares, so this
 * needs no per-site list beyond the registry itself.
 */
import { revalidateTag } from "next/cache";
import { aggregateTags } from "../../aggregates/next/tags";
import { paginationTags } from "../../pagination/next/tags";
import type { AnyContentTypeConfig } from "../types";
import { itemTags } from "./itemTags";

/**
 * Expire now rather than serving stale while refreshing. See
 * `pagination/next/revalidate.ts` for why the second argument is required in
 * Next 16 and why a named profile is wrong.
 */
const EXPIRE_NOW = { expire: 0 } as const;

/**
 * Every tag one content type's derived state is cached under.
 *
 * The pure half, so what fires is assertable without a running server — the
 * same argument `itemTagsForWrite` won at F19a. Order is stable: indexes, then
 * aggregates, then the item catch-all.
 */
export function derivedTagsOf(config: AnyContentTypeConfig): string[] {
  const { contentType } = config;
  return [
    /*
     * One tag per index, not four. `tags.all` is on every cached entry the
     * keyspace produces — head, meta and each numbered page — so it is the
     * whole index in one expiry. The precise tags exist for the *write* path,
     * which knows which pages moved; a repair seat knows nothing and wants
     * everything.
     */
    ...(config.paginationIndexes ?? []).map(
      (index) => paginationTags(contentType, index.name).all,
    ),
    /*
     * An aggregate has exactly one tag, because it is one value with one answer
     * to "did it change". It is nonetheless a *separate* tag from any
     * keyspace's, so a rollback that expired only the pagination tags would
     * serve a tag cloud folded from the previous fixture.
     */
    ...(config.aggregates ?? []).map(
      (aggregate) => aggregateTags(contentType, aggregate.name).value,
    ),
    /*
     * And every cached item record (F19) — the catch-all, fired for every type
     * whether or not it has cached item reads today, where it is a harmless
     * no-op.
     *
     * Worth stating because §11.4 carries the opposite rule for the write path:
     * a *write* must never fire this, since it knows exactly which slugs it
     * touched and expiring the type would be the over-invalidation §6.4 exists
     * to prevent. A repair seat is precisely what the catch-all is for. Unlike
     * a keyspace or an aggregate, the set of cached item entries cannot be
     * enumerated — the slugs are whatever URLs the suite happened to visit — so
     * there is nothing to iterate instead.
     */
    itemTags(contentType).all,
  ];
}

/** Every derived tag of every content type a site declares. */
export function derivedTagsOfAll(
  configs: readonly AnyContentTypeConfig[],
): string[] {
  return configs.flatMap(derivedTagsOf);
}

/**
 * Expire all of them.
 *
 * @example
 * ```ts
 * revalidateDerivedState(recipeContentTypes);
 * ```
 */
export function revalidateDerivedState(
  configs: readonly AnyContentTypeConfig[],
): void {
  for (const tag of derivedTagsOfAll(configs)) {
    revalidateTag(tag, EXPIRE_NOW);
  }
}

export default revalidateDerivedState;
