import type { Key } from "lmdb";
import { updateAggregates } from "../aggregates/updateAggregates";
import { recordPaginationChanges } from "./changes";
import { getPaginationDatabase } from "./database";
import type {
  PaginationIndexConfig,
  SyncDerivedResult,
  SyncPaginationItemsOptions,
} from "./types";
import { updatePaginationIndexes } from "./updatePaginationIndexes";
import { writeSortedEntryTo } from "./writeSortedEntry";

/**
 * The call the content layer makes after writing *several* items of one type.
 *
 * **The one seat that brings derived state back in step**, for both kinds. It
 * runs pagination's two phases and then the aggregate pass, so the three write
 * paths and the dependent cascade all pick up a new kind by doing nothing.
 * Adding the aggregate call to five call sites instead would have made "did we
 * remember to run it everywhere" a standing question.
 *
 * Phase 1 runs for every item inside **one transaction per index**, then phase
 * 2 runs **once**. Phase 2 walks the whole sorted keyspace, so running it per
 * item would cost K walks to reach a state one walk already describes — and
 * the intermediate results would be diffs against states no build ever sees.
 * That is what makes a write with K dependents cost the same phase 2 as a
 * write with one.
 *
 * A content type that declares neither indexes nor aggregates, or a call with
 * no items, returns empty lists having opened nothing and written nothing.
 *
 * Must be called *after* the content index environment is closed: the rebuild
 * path inside phase 2 opens that environment itself.
 *
 * @example
 * ```ts
 * const pagination = await syncPaginationItems({
 *   config: featuredRecipeConfig,
 *   contentDirectory,
 *   items: [
 *     { id: "monday", entry: { key, value } },
 *     { id: "tuesday", entry: { key: otherKey, value: otherValue } },
 *   ],
 * });
 * ```
 */
export async function syncPaginationItems<TIndexValue, TKey extends Key>(
  options: SyncPaginationItemsOptions<TIndexValue, TKey>,
): Promise<SyncDerivedResult> {
  const { config, contentDirectory, items } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indexes: PaginationIndexConfig<any, any, any>[] =
    config.paginationIndexes ?? [];
  const hasAggregates = (config.aggregates ?? []).length > 0;
  if ((indexes.length === 0 && !hasAggregates) || items.length === 0) {
    return { pagination: [], aggregates: [] };
  }

  /*
   * Each index lives in its own environment, so phase 1 across indexes has
   * nothing to contend over — but every item of one index shares a single
   * transaction.
   */
  await Promise.all(
    indexes.map(async (paginationConfig) => {
      const db = getPaginationDatabase(
        config,
        paginationConfig,
        contentDirectory,
      );
      await db.transaction(() => {
        for (const { id, previousId, entry } of items) {
          /*
           * The id *is* the slug, so a rename is a delete plus an insert.
           * Removing first matters: both entries would otherwise sit in the
           * sorted keyspace at once, and the walk would count the item twice.
           */
          if (previousId !== undefined && previousId !== id) {
            writeSortedEntryTo(db, paginationConfig, previousId);
          }
          writeSortedEntryTo(db, paginationConfig, id, entry);
        }
      });
    }),
  );

  const results = await updatePaginationIndexes({ config, contentDirectory });

  /*
   * Aggregates after phase 2, not beside it. Both open the content environment
   * — phase 2's rebuild path does, and this pass always does — and the
   * sequencing note above is the reason: two passes racing to open and close
   * the same environment is the one interleaving that is not safe.
   */
  const aggregates = await updateAggregates({ config, contentDirectory });

  /* One artifact write covering both kinds, rather than one per kind. */
  await recordPaginationChanges({
    contentType: config.contentType,
    contentDirectory,
    results,
    aggregates,
  });

  return { pagination: results, aggregates };
}

export default syncPaginationItems;
