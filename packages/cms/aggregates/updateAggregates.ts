import type { Key } from "lmdb";
import { getContentDatabase } from "../content/database";
import type { ContentTypeConfig } from "../content/types";
import { getContentDirectory } from "../fs/getContentDirectory";
import { hashValue } from "../pagination/hash";
import {
  RECORD_KEY,
  computeAggregateSpecHash,
  getAggregateDatabase,
  readAggregateRecord,
} from "./database";
import type {
  AggregateConfig,
  AggregateRecord,
  AggregateUpdateResult,
  UpdateAggregatesOptions,
} from "./types";

/**
 * Recompute every aggregate a content type declares, and report which ones
 * actually moved.
 *
 * **One walk for all of them.** The cost this pass adds is a second O(N) read
 * of the content index per write, on top of pagination's walk of the sorted
 * keyspace. Folding every declared aggregate in the same pass keeps that at one
 * walk however many are declared, which is what makes declaring a second one
 * nearly free.
 *
 * The walk reads the content index rather than a pagination projection. That
 * costs the extra pass, and buys three things: a content type with no
 * pagination index can still have an aggregate, an aggregate can see fields no
 * projection carries, and the two modules stay independent (§11.1, F10b).
 *
 * **Reporting `changed: false` is the point.** Every aggregate depends on the
 * whole corpus, so "which items moved" is never the useful question — a tag
 * cloud is unchanged by most writes even though every write touches the corpus
 * it is folded from. The pass therefore recomputes unconditionally and compares
 * hashes, and the caller fires a tag only for the ones that moved.
 *
 * Must be called *after* the content index environment is closed: this opens it
 * itself, the same sequencing `syncPaginationItems` documents for phase 2.
 *
 * @example
 * ```ts
 * const aggregates = await updateAggregates({ config: noteConfig });
 * // -> [{ name: "tags", changed: false, total: 14 }]
 * ```
 */
export async function updateAggregates<TIndexValue, TKey extends Key>(
  options: UpdateAggregatesOptions<TIndexValue, TKey>,
): Promise<AggregateUpdateResult[]> {
  const { config, contentDirectory } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregates: AggregateConfig<any, any, any, any>[] =
    config.aggregates ?? [];
  if (aggregates.length === 0) return [];

  /*
   * Spec hashes first, so an aggregate whose config is unchanged *and* whose
   * stored record is present can still be recomputed — the value depends on
   * the corpus, not just the config, so there is no shortcut that skips the
   * walk. What the spec hash buys is correctness after a config edit, not a
   * fast path.
   */
  const specHashes = new Map<string, string>();
  for (const aggregateConfig of aggregates) {
    specHashes.set(
      aggregateConfig.name,
      computeAggregateSpecHash(
        aggregateConfig as unknown as AggregateConfig<never, Key, never, never>,
      ),
    );
  }

  const accumulators = new Map<string, unknown>(
    aggregates.map((aggregateConfig) => [
      aggregateConfig.name,
      aggregateConfig.initial(),
    ]),
  );

  const contentDb = getContentDatabase<TIndexValue, TKey>(
    config as ContentTypeConfig,
    contentDirectory || getContentDirectory(),
  );
  let total = 0;
  for (const { key, value } of contentDb.getRange({})) {
    /*
     * The id is the last component of a tuple key, the same default
     * `getId` applies for pagination — every content type in this repo keys
     * `[sortField, slug]`. No per-aggregate override: an aggregate that
     * needed a different id would be folding the wrong thing.
     */
    const entry = {
      key,
      value,
      id: Array.isArray(key) ? String(key[key.length - 1]) : String(key),
    };
    for (const aggregateConfig of aggregates) {
      accumulators.set(
        aggregateConfig.name,
        aggregateConfig.fold(accumulators.get(aggregateConfig.name), entry),
      );
    }
    total += 1;
  }

  const results: AggregateUpdateResult[] = [];
  for (const aggregateConfig of aggregates) {
    const accumulator = accumulators.get(aggregateConfig.name);
    const value = aggregateConfig.finalize
      ? aggregateConfig.finalize(accumulator)
      : accumulator;
    const hash = hashValue(value);
    const specHash = specHashes.get(aggregateConfig.name) as string;

    const db = getAggregateDatabase(config, aggregateConfig, contentDirectory);
    const previous = readAggregateRecord(db);

    /* The value a reader would render moved. The only thing that fires a tag. */
    const valueMoved = !previous || previous.hash !== hash;
    /*
     * A spec change is a reason to *rewrite* but not to report: the stored
     * record has to carry the new spec hash, or a reader comparing spec hashes
     * would go on seeing a mismatch forever — while the value it renders is
     * identical.
     */
    const specMoved = !previous || previous.specHash !== specHash;

    /*
     * A pass that moved neither writes nothing, `updatedAt` included. Nothing
     * downstream should be able to tell that a no-op pass ran — the rule phase
     * 2 follows for the meta record, and the reason this pass needs no `force`
     * flag: every pass is already a full recompute, so there is nothing a
     * forced one could do differently.
     */
    if (valueMoved || specMoved) {
      await db.put(RECORD_KEY, {
        value,
        hash,
        specHash,
        updatedAt: Date.now(),
      } satisfies AggregateRecord);
    }

    results.push({ name: aggregateConfig.name, changed: valueMoved, total });
  }

  return results;
}

export default updateAggregates;
