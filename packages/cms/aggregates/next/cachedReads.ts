import type { Key } from "lmdb";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { getContentDirectory } from "../../fs/getContentDirectory";
import { readAggregate, readAggregateKey } from "../readAggregate";
import type { AggregateOptions, KeyedEntryOf } from "../types";
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
 * An ordinary aggregate has no catch-all tag beside the specific one, unlike
 * pagination's `tags.all`. It has exactly one cached entry, so a second tag
 * would name the same thing twice — and the invalidation seats that expire
 * `tags.all` to clear a whole index have a single tag to expire here.
 *
 * A **keyed** aggregate (32e) has one entry per key read plus the whole value,
 * so it gets pagination's shape: the plain tag is on all of them and only a
 * repair fires it, `whole` is on the whole value, and `key(k)` is on key `k`'s
 * read (`readKey`).
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
  /*
   * `version` is in the key because Next's data cache outlives a build:
   * `.next/cache` survives `next build`, so a production server started after
   * a value-shape change would otherwise be handed the old shape under the
   * same name — a `string[]` where `{slug, label, count}[]` is expected, which
   * is how 24b's `terms` crashed the homepage. A version bump is already the
   * contract for a shape change; this makes it a new cache entry too.
   */
  const keyBase = [
    "aggregate",
    config.contentType,
    aggregateConfig.name,
    aggregateConfig.version,
    contentDirectory,
  ];

  const reader = cache(
    unstable_cache(
      () => readAggregate<TIndexValue, TKey, TAccumulator, TValue>(readOptions),
      keyBase,
      /*
       * A keyed aggregate's whole value expires when any key moves, so it
       * carries the `whole` tag the write path fires — and the catch-all
       * beside it, which only a repair fires (32e).
       */
      { tags: aggregateConfig.keyed ? [tags.value, tags.whole] : [tags.value] },
    ),
  );

  /*
   * Tags are fixed per wrapper, so a key's tag needs a wrapper per key — built
   * on demand and kept, as pagination keeps one per page. The set is bounded
   * by the keys a render asks for.
   */
  const keyReaders = new Map<
    string,
    () => Promise<KeyedEntryOf<TValue> | null>
  >();

  function keyReader(key: string) {
    const existing = keyReaders.get(key);
    if (existing) return existing;
    const created = cache(
      unstable_cache(
        () =>
          readAggregateKey<TIndexValue, TKey, TAccumulator, TValue>({
            ...readOptions,
            key,
          }),
        [...keyBase, "key", key],
        { tags: [tags.value, tags.key(key)] },
      ),
    );
    keyReaders.set(key, created);
    return created;
  }

  return {
    tags,
    /**
     * The stored value; null when it has never been computed. For a keyed
     * aggregate, every key reassembled, expiring when any of them moves.
     */
    read: (): Promise<TValue | null> => reader(),
    /**
     * One key of a **keyed** aggregate, expiring only when that key moves;
     * null when it was never computed or has no such key. Throws for an
     * aggregate that is not keyed.
     */
    readKey: (key: string): Promise<KeyedEntryOf<TValue> | null> =>
      keyReader(key)(),
  };
}

export default createCachedAggregateRead;
