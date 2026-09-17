import type { Key } from "lmdb";
import { createCachedAggregateRead } from "../../aggregates/next/cachedReads";
import { byTermAggregate, termsAggregate } from "../aggregates";
import type { TaxonomyReadOptions } from "../read";
import type { TaxonomyByTerm, TaxonomyTerm } from "../types";

/**
 * Both of a taxonomy's cached reads, built from the same declaration the folds
 * are.
 *
 * Nothing new underneath: each half is a `createCachedAggregateRead`, so each
 * carries its own `unstable_cache` entry under its own `aggregate:<type>:<name>`
 * tag and its own `React.cache` dedupe. Two entries and not one, because the
 * two values move independently — adding a carrier to a term that already
 * exists moves the by-term record and leaves the vocabulary byte-identical, and
 * a page rendering only the term list should not be invalidated by it.
 *
 * Call it at **module scope**, like `createCachedAggregateRead`: a factory
 * called per render hands back a fresh, empty memo table every time.
 *
 * @example
 * ```ts
 * export const noteTagReads = createCachedTaxonomyReads({
 *   config: noteConfig,
 *   taxonomy: noteTagTaxonomy,
 * });
 * const terms = (await noteTagReads.terms.read()) ?? [];
 * ```
 */
export function createCachedTaxonomyReads<TIndexValue, TKey extends Key, TItem>(
  options: TaxonomyReadOptions<TIndexValue, TKey, TItem>,
) {
  const { config, taxonomy, contentDirectory } = options;

  const terms = createCachedAggregateRead<
    TIndexValue,
    TKey,
    Map<string, { label: string; count: number }>,
    TaxonomyTerm[]
  >({
    config,
    aggregateConfig: termsAggregate(taxonomy),
    contentDirectory,
  });

  const byTerm = createCachedAggregateRead<
    TIndexValue,
    TKey,
    Map<string, { label: string; items: TItem[] }>,
    TaxonomyByTerm<TItem>
  >({
    config,
    aggregateConfig: byTermAggregate(taxonomy),
    contentDirectory,
  });

  return { terms, byTerm };
}

export default createCachedTaxonomyReads;
