import { createCachedAggregateRead } from "@discontent/cms/aggregates/next/cachedReads";
import { createCachedItemRead } from "@discontent/cms/content/next/cachedItemRead";
import { termTreeAggregate } from "@discontent/cms/taxonomies/tree";
import type { TermTree } from "@discontent/cms/taxonomies/tree";
import { tagTermContentConfig } from "../tagTermContentConfig";
import type { TagTerm, TagTermEntryKey, TagTermIndexValue } from "../types";

/**
 * Both cached reads of the `tag` vocabulary's **records**: one term by slug,
 * and the whole hierarchy in one value (24c).
 *
 * Two reads rather than one because they answer different questions and move
 * independently. `/tags/<slug>` needs *this* term's description, picture and
 * pinned front — a by-slug read of a data file, under `item:tag-terms:<slug>`,
 * so editing one term does not invalidate every term page. The breadcrumb and
 * the "Narrower" chips are questions about the whole vocabulary, which is what
 * the `tree` aggregate folds from the term index alone — one read for the
 * parent chain and the children, rather than the N+1 an index exists to remove.
 *
 * `tagTermContentConfig` directly, never through `recipeTagTaxonomy.terms`
 * (T17): a taxonomy module that imported this would reach a content config, and
 * `recipeContentConfig` reads its taxonomy as a direct value at module
 * evaluation — so the first import that touched a taxonomy module before a
 * content config would throw a temporal-dead-zone `ReferenceError`.
 *
 * Built at module scope so the `React.cache` wrappers inside survive long
 * enough to dedupe, the same reasoning `readRecipeTagIndex.ts` gives: a term
 * page asks the tree for its breadcrumb and again for its children, and
 * `generateStaticParams` asks for the same value the pages then render from.
 *
 * Read sites only, **never from a script or the CLI** (T5/D8):
 * `unstable_cache` throws outside a Next render.
 */
export const tagTermReads = {
  items: createCachedItemRead<TagTerm, TagTermIndexValue, TagTermEntryKey>({
    config: tagTermContentConfig,
  }),
  /*
   * The aggregate config is rebuilt here rather than reached for on the content
   * config, because `aggregates` is typed as the erased `AnyAggregateConfig`
   * and `createCachedAggregateRead` wants the value's real shape. The factory
   * takes nothing and returns the same `{name: "tree", version: "1"}` the
   * config declares, so the two cannot drift: it is one definition, called
   * twice.
   */
  tree: createCachedAggregateRead<
    TagTermIndexValue,
    TagTermEntryKey,
    Map<string, TermTree[string]>,
    TermTree
  >({
    config: tagTermContentConfig,
    aggregateConfig: termTreeAggregate(),
  }),
};

export default tagTermReads;
