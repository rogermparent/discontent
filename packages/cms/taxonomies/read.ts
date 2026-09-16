import type { Key } from "lmdb";
import { readAggregate } from "../aggregates/readAggregate";
import type { ContentTypeConfig } from "../content/types";
import { byTermAggregate, termsAggregate } from "./aggregates";
import type { TaxonomyByTerm, TaxonomyConfig, TaxonomyTerm } from "./types";

/**
 * Node-safe reads of the two derived values — no Next, no React, so the CLI,
 * the MCP seats and a test can call them.
 *
 * Both are `readAggregate` underneath, which means both inherit its contract:
 * O(1), and **`null` for "never folded"** rather than an empty value. A caller
 * that only wants to render writes `?? []`; a caller deciding whether the
 * corpus needs a `reindex` wants the distinction (T5).
 */
export interface TaxonomyReadOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = unknown,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;
  taxonomy: TaxonomyConfig<TIndexValue, TKey, TItem>;
  contentDirectory?: string;
}

/**
 * The vocabulary: every term with its label and carrier count, sorted by slug.
 *
 * @example
 * ```ts
 * const terms = (await readTaxonomyTerms({
 *   config: noteConfig,
 *   taxonomy: noteTagTaxonomy,
 * })) ?? [];
 * ```
 */
export function readTaxonomyTerms<TIndexValue, TKey extends Key, TItem>(
  options: TaxonomyReadOptions<TIndexValue, TKey, TItem>,
): Promise<TaxonomyTerm[] | null> {
  const { config, taxonomy, contentDirectory } = options;
  return readAggregate({
    config,
    aggregateConfig: termsAggregate(taxonomy),
    contentDirectory,
  });
}

/** The inverted index: every term slug mapped to its label and carriers. */
export function readTaxonomyByTerm<TIndexValue, TKey extends Key, TItem>(
  options: TaxonomyReadOptions<TIndexValue, TKey, TItem>,
): Promise<TaxonomyByTerm<TItem> | null> {
  const { config, taxonomy, contentDirectory } = options;
  return readAggregate({
    config,
    aggregateConfig: byTermAggregate(taxonomy),
    contentDirectory,
  });
}
