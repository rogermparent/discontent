import type { Key } from "lmdb";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getContentDirectory } from "../../fs/getContentDirectory";
import { readHead, readPage } from "../readPage";
import { readPaginationMeta } from "../readPaginationMeta";
import type {
  PaginationIndexOptions,
  PaginationMetaResult,
  PaginationPage,
} from "../types";
import { paginationTags } from "./tags";

/**
 * Wrap one index's reads in Next's caching primitives.
 *
 * Two layers, each doing something the other cannot:
 *
 * - `unstable_cache` persists across requests and is dropped by tag, which is
 *   what turns the dirty-page diff into real invalidation. Every entry carries
 *   the index's catch-all tag alongside its specific one, so a rebuild clears
 *   the index with a single `revalidateTag`.
 * - `React.cache` dedupes within a single render pass. A page that renders a
 *   list and its pagination controls asks for the same data twice, and each
 *   ask would otherwise be a separate cache lookup.
 *
 * The options object holds functions, so it cannot be part of a cache key;
 * `contentDirectory` stands in for it, since it is the only part that varies
 * at runtime for a given index.
 *
 * @example
 * ```ts
 * const notes = createCachedPaginationReads({
 *   config: noteConfig,
 *   paginationConfig: notesByDate,
 * });
 * const landing = await notes.readHead();
 * ```
 */
export function createCachedPaginationReads<
  TIndexValue,
  TKey extends Key,
  TItem,
>(options: PaginationIndexOptions<TIndexValue, TKey, TItem>) {
  const { config, paginationConfig } = options;
  const contentDirectory = options.contentDirectory || getContentDirectory();
  const tags = paginationTags(config.contentType, paginationConfig.name);
  const keyBase = [
    "pagination",
    config.contentType,
    paginationConfig.name,
    contentDirectory,
  ];
  const readOptions = { config, paginationConfig, contentDirectory };

  /*
   * Tags are fixed per wrapper, so a page tag needs a wrapper per page. They
   * are built on demand and kept — the set is bounded by the number of pages,
   * and rebuilding one per call would throw away the per-render dedupe.
   */
  const pageReaders = new Map<
    number,
    () => Promise<PaginationPage<TItem> | null>
  >();

  function pageReader(pageIndex: number) {
    const existing = pageReaders.get(pageIndex);
    if (existing) return existing;
    const reader = cache(
      unstable_cache(
        () => readPage<TIndexValue, TKey, TItem>({ ...readOptions, pageIndex }),
        [...keyBase, "page", String(pageIndex)],
        { tags: [tags.all, tags.page(pageIndex)] },
      ),
    );
    pageReaders.set(pageIndex, reader);
    return reader;
  }

  const headReader = cache(
    unstable_cache(
      () => readHead<TIndexValue, TKey, TItem>(readOptions),
      [...keyBase, "head"],
      { tags: [tags.all, tags.head] },
    ),
  );

  const metaReader = cache(
    unstable_cache(
      () => readPaginationMeta<TIndexValue, TKey, TItem>(readOptions),
      [...keyBase, "meta"],
      { tags: [tags.all, tags.meta] },
    ),
  );

  return {
    tags,
    /** One numbered page; null when it does not exist. */
    readPage: (pageIndex: number): Promise<PaginationPage<TItem> | null> =>
      pageReader(pageIndex)(),
    /** The landing page: the head folded with the page below it. */
    readHead: (): Promise<PaginationPage<TItem>> => headReader(),
    /**
     * Counts and the numbered route list, for `generateStaticParams`. There is
     * no `staticParams` helper on purpose — `numberedPages` already *is* the
     * list, and `.map((page) => ({ page: String(page) }))` at the call site
     * reads better than a wrapper that hides which param name it picked.
     */
    readMeta: (): Promise<PaginationMetaResult> => metaReader(),
  };
}

export default createCachedPaginationReads;
