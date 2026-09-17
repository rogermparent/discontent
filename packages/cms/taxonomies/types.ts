import type { Key } from "lmdb";
import type { AggregateEntry } from "../aggregates/types";
import type { AnyContentTypeConfig } from "../content/types";

/**
 * One term as the terms aggregate reports it.
 *
 * `slug` is the identity — `slugOf(normalizeTerm(raw))` — and `label` is the
 * first normalised spelling the fold saw for it, because the slug mapping is
 * lossy and deliberately not inverted. `count` is the number of *carriers*, so
 * a carrier naming the same term twice still counts once.
 */
export interface TaxonomyTerm {
  slug: string;
  label: string;
  count: number;
}

/** One term's row in the inverted map: what to print, and what carries it. */
export interface TaxonomyByTermEntry<TItem = unknown> {
  label: string;
  /** Newest first, matching every other list surface in the repo. */
  items: TItem[];
}

/**
 * The inverted index, keyed by term slug.
 *
 * One record holding every term's list — the corpus-document trade F8 argues
 * for and F8b would eventually partition. See `TaxonomyConfig.project` for the
 * lever that keeps it small.
 */
export type TaxonomyByTerm<TItem = unknown> = Record<
  string,
  TaxonomyByTermEntry<TItem>
>;

/**
 * Declares that one of a content type's index-value fields is a **vocabulary**
 * rather than a bare `string[]`.
 *
 * The third derived kind by declaration and the *second* by implementation: a
 * taxonomy is not its own pass, it expands into two ordinary aggregates
 * (`taxonomyAggregates`) that `aggregatesOf` appends after whatever the type
 * declares by hand. So it inherits the aggregate kind's whole contract for
 * free — one walk for all of them, a stored hash, `changed: false` on a write
 * that moves nothing, one cache tag each.
 *
 * Loosely typed at the `ContentTypeConfig` seat for the variance reason
 * `paginationIndexes` documents; the precise generics live at the declaration
 * site.
 *
 * @example
 * ```ts
 * export const noteTagTaxonomy: TaxonomyConfig<NoteIndexValue, NoteIndexKey> = {
 *   name: "tag",
 *   field: "tags",
 *   version: "1",
 * };
 * ```
 */
export interface TaxonomyConfig<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = unknown,
> {
  /**
   * The vocabulary's singular stem, and the *only* naming input.
   *
   * It fixes the search operator (`tag:`), both derived aggregate names
   * (`${name}s` and `by-${name}`, so `tags` and `by-tag`), and by convention
   * the route family (`/tags`). Naming it after what the recipe site already
   * uses is what lets that site adopt this without moving a cache tag or an
   * LMDB directory.
   */
  name: string;

  /**
   * The index-value field holding the raw terms, as `string[]`.
   *
   * **It must already be on the index value**: a fold reads the content index
   * and never a data file (`AggregateConfig.fold`), so a field only the data
   * file carries folds as empty rather than failing. A value that is not an
   * array is treated as no terms at all, which is what makes declaring this on
   * a type whose corpus predates the field harmless.
   */
  field: string;

  /**
   * The declared spec version of **both** derived aggregates, for the reason
   * `AggregateConfig.version` gives at length: a hash over `fn.toString()` is
   * not build-stable, so the version is written by hand and
   * `test/specVersions.test.ts` asks about every edit to the module declaring
   * it.
   *
   * What gets stored is `` `${TAXONOMY_FOLD_VERSION}.${version}` ``, so an edit
   * to the engine's fold bumps one constant and invalidates every site's
   * taxonomy at once, while a site changing its own projection bumps only its
   * own.
   */
  version: string;

  /**
   * Term identity: the slug of an already-normalised label. Defaults to
   * `termSlug` (`@sindresorhus/slugify`), which is exactly what the recipe
   * site's `tagSlug` is.
   *
   * Two labels that slugify alike **merge**, and the first one seen wins the
   * label — rare, harmless, and cheaper than carrying a disambiguator through
   * every link.
   */
  slugOf?: (term: string) => string;

  /**
   * What one carrier looks like in the by-term map. Defaults to `{ id }` — the
   * slug alone.
   *
   * The size lever for the whole kind: the by-term record holds
   * `carriers x terms-per-carrier` of these, and F8b's ~150 KB threshold is
   * measured against it. Project the fields the term page renders and nothing
   * else.
   */
  project?: (entry: AggregateEntry<TIndexValue, TKey>) => TItem;

  /**
   * The vocabulary's term-record content type, when it has one — a thunk, for
   * the reason every reference edge in the engine is one (`ReferenceSpec`).
   *
   * Declared here rather than derived so a *site* owns the record type: one
   * vocabulary is shared by every carrier type that declares this taxonomy, so
   * exactly one of them can own the records. Nothing in the engine reads it
   * yet — the term page's record/fold join is 24c's.
   */
  terms?: () => AnyContentTypeConfig;
}
