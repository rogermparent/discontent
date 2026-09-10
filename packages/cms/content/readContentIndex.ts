import type { Key } from "lmdb";
import { getContentDirectory } from "../fs/getContentDirectory";
import { getContentDatabase, getIndexCount, readFromIndex } from "./database";
import type {
  ContentTypeConfig,
  ReadContentIndexOptions,
  ReadContentIndexResult,
} from "./types";

/**
 * Read entries from the content index with pagination
 *
 * @example
 * ```ts
 * const { entries, total, more } = await readContentIndex({
 *   config: recipeConfig,
 *   limit: 10,
 *   offset: 0,
 *   reverse: true,
 * });
 * ```
 */
export async function readContentIndex<
  TIndexValue,
  TKey extends Key,
  TResult = { key: TKey; value: TIndexValue },
>(
  options: ReadContentIndexOptions<TIndexValue, TKey, TResult>,
): Promise<ReadContentIndexResult<TIndexValue, TKey, TResult>> {
  const {
    config,
    limit,
    offset,
    reverse = true,
    contentDirectory: providedContentDirectory,
    map = ({ key, value }) => ({ key, value }),
  } = options;

  const contentDirectory = providedContentDirectory || getContentDirectory();

  const db = getContentDatabase<TIndexValue, TKey>(
    config as ContentTypeConfig,
    contentDirectory,
  );
  const entriesIterator = readFromIndex<TIndexValue, TKey>(db, {
    limit,
    offset,
    reverse,
  }).map(map as (entry: { key: TKey; value: TIndexValue }) => TResult);
  /*
   * Counted before the await, not after. Both reads are valid either way now
   * that a retired environment outlives its readers (F24), but taking the count
   * while the handle is known-current keeps this function from depending on
   * that grace period at all — and it costs nothing, since the count cannot
   * change under a read that has already been issued.
   */
  const total = getIndexCount(db);
  const entriesPromise = entriesIterator.asArray;
  const entries = await entriesPromise;
  /*
   * How many entries this read *returned*, not how many it asked for. The old
   * form added `limit`, so an unlimited read computed `0 < total` — "there is
   * more" for every non-empty corpus, however much of it had just been handed
   * back (F2). Every caller that renders `more` passes a limit, where the two
   * forms agree.
   */
  const more = (offset || 0) + entries.length < total;

  return { entries, total, more };
}

export default readContentIndex;
