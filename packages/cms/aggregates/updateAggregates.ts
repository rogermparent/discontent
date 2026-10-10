import type { Key, RootDatabase } from "lmdb";
import { getContentDatabase } from "../content/database";
import type { AnyContentTypeConfig, ContentTypeConfig } from "../content/types";
import { getContentDirectory } from "../fs/getContentDirectory";
import { aggregatesOf } from "../taxonomies/aggregates";
import { hashValue } from "../pagination/hash";
import {
  KEYED_ENTRY_PREFIX,
  KEYED_HASHES_KEY,
  RECORD_KEY,
  computeAggregateSpecHash,
  getAggregateDatabase,
  keyedEntryKey,
  readAggregateRecord,
  readKeyedHashes,
} from "./database";
import type {
  AggregateConfig,
  AggregateRecord,
  AggregateUpdateResult,
  KeyedAggregateHeader,
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
  /*
   * Declared *and* derived (F33). A taxonomy is not its own pass: it expands
   * into two ordinary aggregates here, so it inherits this walk, the spec hash,
   * the `changed: false` report and the changes artifact without any of them
   * knowing it exists.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregates: AggregateConfig<any, any, any, any>[] = aggregatesOf(
    config as AnyContentTypeConfig,
  );
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
    const specHash = specHashes.get(aggregateConfig.name) as string;

    const db = getAggregateDatabase(config, aggregateConfig, contentDirectory);

    if (aggregateConfig.keyed) {
      results.push({
        name: aggregateConfig.name,
        total,
        ...(await storeKeyed(db, aggregateConfig.name, value, specHash)),
      });
      continue;
    }

    const hash = hashValue(value);
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

/**
 * Store a keyed aggregate's value one record per key (32e), and say which keys
 * moved.
 *
 * The walk above already folded the whole corpus — the kind trusts nothing it
 * stored, and the other aggregates need the walk anyway — so what this saves
 * is everything *after* the fold. Each key is hashed on its own and compared
 * with the hash the last pass stored for it. Only the keys that moved are
 * written, and only those are reported, so the write path invalidates those
 * keys' readers and nobody else's. Before, one moved term rewrote and fired
 * the whole value.
 *
 * One transaction, so a reader sees the old keys or the new ones and never a
 * header that disagrees with the entries beside it. A spec change clears the
 * environment first: it may hold a value in the old, single-record layout, or
 * keys a different fold produced.
 */
async function storeKeyed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
  name: string,
  value: unknown,
  specHash: string,
): Promise<Pick<AggregateUpdateResult, "changed" | "keys">> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Keyed aggregate "${name}" must finalize to a plain object, got ${Array.isArray(value) ? "an array" : typeof value}`,
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const hashes: Record<string, string> = {};
  for (const [key, entry] of entries) hashes[key] = hashValue(entry);
  const hash = hashValue(hashes);

  /*
   * **Every read and the diff happen inside the transaction callback**, not
   * before it. lmdb-js queues a `transaction` callback for a later batch, so
   * state read before the `await` can be stale by the time the callback runs:
   * two concurrent passes would diff against the same old hashes, and one
   * that adds key x and one that removes it could leave `[1, x]` behind with
   * nothing listing it. That was a permanent ghost: `readAggregateKey` stale,
   * `readAggregate` resurrecting x, and the header hash matching so nothing
   * ever looked again. Inside the callback, reads see the write transaction,
   * which LMDB serialises across processes too.
   */
  return db.transaction(() => {
    const previous = readAggregateRecord(db);
    const specMoved = !previous || previous.specHash !== specHash;
    const valueMoved = !previous || previous.hash !== hash;

    /*
     * The stored key **records**, scanned by key alone, are the truth about
     * what a reader would see. The hash map at `[2]` only says what the last
     * pass meant to write. So the delete set is every stored record the new
     * value lacks: a stray record from any earlier failure is removed on the
     * next pass, a reindex included. A key the value has but the records lack
     * is rewritten for the same reason.
     */
    const storedKeys = new Set<string>();
    for (const key of db.getKeys({
      start: [KEYED_ENTRY_PREFIX],
      end: [KEYED_ENTRY_PREFIX + 1],
    })) {
      storedKeys.add(String((key as Key[])[1]));
    }
    const removed = [...storedKeys].filter((key) => !(key in hashes));
    const missing = entries.some(([key]) => !storedKeys.has(key));

    if (!specMoved && !valueMoved && removed.length === 0 && !missing) {
      return { changed: false, keys: [] };
    }

    /*
     * After a spec change the stored hashes were made by another fold (or are
     * missing, in the old single-record layout), so no key's hash can be
     * trusted and every key counts as moved.
     */
    const storedHashes = specMoved ? {} : (readKeyedHashes(db) ?? {});
    const moved = new Set<string>();
    for (const [key, entryHash] of Object.entries(hashes)) {
      if (
        specMoved ||
        storedHashes[key] !== entryHash ||
        !storedKeys.has(key)
      ) {
        moved.add(key);
      }
    }

    if (specMoved) db.clearSync();
    for (const [key, entry] of entries) {
      if (moved.has(key)) db.putSync(keyedEntryKey(key), entry);
    }
    if (!specMoved) {
      for (const key of removed) db.removeSync(keyedEntryKey(key));
    }
    db.putSync(KEYED_HASHES_KEY, hashes);
    db.putSync(RECORD_KEY, {
      value: { keys: entries.length },
      hash,
      specHash,
      updatedAt: Date.now(),
    } satisfies AggregateRecord<KeyedAggregateHeader>);

    /*
     * A spec change that leaves every value as it was is a rewrite, not news.
     * Anything else a reader would see differently — a moved hash, a stray
     * removed, a missing record restored — is reported, with its keys.
     */
    const keys = [...moved, ...removed].sort();
    if (specMoved && !valueMoved && removed.length === 0) {
      return { changed: false, keys: [] };
    }
    return keys.length > 0 || valueMoved
      ? { changed: true, keys }
      : { changed: false, keys: [] };
  });
}

export default updateAggregates;
