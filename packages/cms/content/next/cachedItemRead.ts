import type { Key } from "lmdb";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getContentDirectory } from "../../fs/getContentDirectory";
import { readContentFileOrNull } from "../readContentFile";
import type { ContentTypeConfig } from "../types";
import { itemTags } from "./itemTags";

export interface CachedItemReadOptions<TData, TIndexValue, TKey extends Key> {
  config: ContentTypeConfig<TData, TIndexValue, TKey>;
  contentDirectory?: string;
  /**
   * Pinned by hand, for the reason `recipesByDate.version` spells out at
   * length: `unstable_cache` folds `cb.toString()` into its key, and a
   * production build minifies where a dev server does not — so an entry
   * written by one and read by the other would never hit. Bump when the read
   * changes shape.
   */
  version?: string;
}

/**
 * Wrap one content type's by-slug read in Next's caching primitives.
 *
 * The same two layers the other kinds use, for the same reasons:
 * `unstable_cache` persists across requests and is dropped by tag, which is
 * what makes an item tag mean anything; `React.cache` dedupes within a render
 * pass, which is not incidental here — `/recipe/<slug>` reads the same file
 * twice per request today, once in `generateMetadata` and once in the body,
 * and `/featured-recipe/<slug>` reads two records twice each.
 *
 * Every entry carries **both** `tags.all` and `tags.item(slug)`, exactly as a
 * pagination page carries its index's catch-all alongside its page tag.
 *
 * **Why there is no reader `Map` here, where `createCachedPaginationReads` has
 * one.** That map exists because pagination's wrappers take no argument, so a
 * per-page tag needs a wrapper per page, built once and kept. Its comment says
 * the set is "bounded by the number of pages" — which does *not* transfer, and
 * that is the trap this note exists to prevent: slugs are supplied by the URL,
 * so a module-scope map keyed by slug is unbounded by anything the server
 * controls. It is also unnecessary. `unstable_cache` retains no state of its
 * own: it returns a closure over a key string, and every cache entry lives in
 * the incremental cache. So building the wrapper inside `React.cache`, keyed
 * by slug, gets the per-slug tag *and* the per-render dedupe while retaining
 * nothing past the request.
 *
 * **Never import a module built on this from a script.** `unstable_cache`
 * throws `Invariant: incrementalCache missing` outside a Next render or route
 * handler, so fixture generators and migrations must keep using the raw
 * `readContentFile`.
 *
 * @example
 * ```ts
 * const noteItems = createCachedItemRead({ config: noteConfig });
 * const note = await noteItems.read(slug);
 * if (!note) notFound();
 * ```
 */
export function createCachedItemRead<
  TData,
  TIndexValue = TData,
  TKey extends Key = Key,
>(options: CachedItemReadOptions<TData, TIndexValue, TKey>) {
  const { config, version = "1" } = options;
  const contentDirectory = options.contentDirectory || getContentDirectory();
  const tags = itemTags(config.contentType);
  const keyBase = ["item", config.contentType, contentDirectory, version];

  const reader = cache(
    (slug: string): Promise<TData | null> =>
      unstable_cache(
        () =>
          readContentFileOrNull<TData, TIndexValue, TKey>({
            config,
            slug,
            contentDirectory,
          }),
        [...keyBase, slug],
        { tags: [tags.all, tags.item(slug)] },
      )(),
  );

  return {
    tags,
    /** The item's whole record; null when there is no item at that slug. */
    read: (slug: string): Promise<TData | null> => reader(slug),
  };
}

export default createCachedItemRead;
