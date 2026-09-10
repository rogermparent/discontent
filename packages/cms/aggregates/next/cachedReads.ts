import type { Key } from "lmdb";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getContentDirectory } from "../../fs/getContentDirectory";
import { readAggregate } from "../readAggregate";
import type { AggregateOptions } from "../types";
import { aggregateTags } from "./tags";

/**
 * Wrap one aggregate's read in Next's caching primitives.
 *
 * The same two layers `createCachedPaginationReads` uses, for the same
 * reasons: `unstable_cache` persists across requests and is dropped by tag,
 * which is what turns "did the value change" into real invalidation; and
 * `React.cache` dedupes within a render pass, which matters here because a
 * page that renders a tag cloud and a tag-filtered list asks for the same
 * value twice.
 *
 * There is no catch-all tag beside the specific one, unlike pagination's
 * `tags.all`. An aggregate has exactly one cached entry, so a second tag would
 * name the same thing twice — and the invalidation seats that expire
 * `tags.all` to clear a whole index have a single tag to expire here.
 *
 * @example
 * ```ts
 * const noteTagCloud = createCachedAggregateRead({
 *   config: noteConfig,
 *   aggregateConfig: noteTags,
 * });
 * const tags = (await noteTagCloud.read()) ?? [];
 * ```
 */
export function createCachedAggregateRead<
  TIndexValue,
  TKey extends Key,
  TAccumulator,
  TValue,
>(options: AggregateOptions<TIndexValue, TKey, TAccumulator, TValue>) {
  const { config, aggregateConfig } = options;
  const contentDirectory = options.contentDirectory || getContentDirectory();
  const tags = aggregateTags(config.contentType, aggregateConfig.name);
  const readOptions = { config, aggregateConfig, contentDirectory };

  const reader = cache(
    unstable_cache(
      () => readAggregate<TIndexValue, TKey, TAccumulator, TValue>(readOptions),
      ["aggregate", config.contentType, aggregateConfig.name, contentDirectory],
      { tags: [tags.value] },
    ),
  );

  return {
    tags,
    /** The stored value; null when it has never been computed. */
    read: (): Promise<TValue | null> => reader(),
  };
}

export default createCachedAggregateRead;
