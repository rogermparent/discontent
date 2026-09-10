import type { Key } from "lmdb";
import { syncPaginationItems } from "./syncContentItems";
import type { SyncDerivedResult, SyncPaginationOptions } from "./types";

/**
 * The single call the content layer makes after writing one item.
 *
 * Runs phase 1 for every declared index, then phase 2 once, then records the
 * dirty pages, then folds every declared aggregate. A content type that
 * declares neither returns empty lists having opened nothing and written
 * nothing — which is what makes wiring this into the shared write path a no-op
 * for every content type that has not opted in.
 *
 * A one-item delegation to `syncPaginationItems` rather than its own
 * implementation, so the batched path and the single-item path cannot drift.
 *
 * Must be called *after* the content index environment is closed: the rebuild
 * path inside phase 2 opens that environment itself to re-read the corpus.
 *
 * @example
 * ```ts
 * const { pagination, aggregates } = await syncPaginationIndexes({
 *   config: recipeConfig,
 *   contentDirectory,
 *   id: "chocolate-cake",
 *   entry: { key: indexKey, value: indexValue },
 * });
 * ```
 */
export async function syncPaginationIndexes<TIndexValue, TKey extends Key>(
  options: SyncPaginationOptions<TIndexValue, TKey>,
): Promise<SyncDerivedResult> {
  const { config, contentDirectory, id, previousId, entry } = options;
  return syncPaginationItems({
    config,
    contentDirectory,
    items: [{ id, previousId, entry }],
  });
}

export default syncPaginationIndexes;
