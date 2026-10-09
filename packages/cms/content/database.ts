import { RootDatabase, Key, RangeIterable } from "lmdb";
import { resolve } from "path";
import { getContentDirectory } from "../fs/getContentDirectory";
import { openCachedEnvironment } from "../lmdb/environmentCache";
import type { ContentTypeConfig } from "./types";

/**
 * Get the path to the LMDB index directory for a content type
 */
export function getIndexDirectory(
  /*
   * Only `indexDirectory` is read, and it does not depend on the generics —
   * but naming the whole `ContentTypeConfig` pins it to the *default*
   * instantiation, so passing a real typed config is a variance error. Same
   * narrowing, and for the same reason, as `getUploadsDirectory`.
   */
  config: Pick<ContentTypeConfig, "indexDirectory">,
  contentDirectory?: string,
): string {
  const baseDir = contentDirectory || getContentDirectory();
  return resolve(baseDir, config.indexDirectory);
}

/**
 * Open a database for a specific content type configuration
 * The key type is flexible to support different content types (can be string, number, array, etc.)
 *
 * Cached per process (F1), which is what makes a static export stop mapping and
 * unmapping the same file once per `generateStaticParams` and once per rendered
 * page. The environment is therefore *shared*: no caller may close it, because
 * a close hands every later reader in the process a closed environment. Tests
 * that build an index under a tmpdir use `closeCachedEnvironments`.
 */
export function getContentDatabase<
  TIndexValue = unknown,
  TKey extends Key = Key,
>(
  config: Pick<ContentTypeConfig, "indexDirectory">,
  contentDirectory?: string,
): RootDatabase<TIndexValue, TKey> {
  return openCachedEnvironment<TIndexValue, TKey>(
    getIndexDirectory(config, contentDirectory),
  );
}

/**
 * Write an entry to the content index
 */
export async function writeToIndex<
  TIndexValue = unknown,
  TKey extends Key = Key,
>(
  db: RootDatabase<TIndexValue, TKey>,
  key: TKey,
  value: TIndexValue,
): Promise<void> {
  await db.put(key, value);
}

/**
 * Remove an entry from the content index
 */
export async function removeFromIndex<
  TIndexValue = unknown,
  TKey extends Key = Key,
>(db: RootDatabase<TIndexValue, TKey>, key: TKey): Promise<void> {
  await db.remove(key);
}

/**
 * Read entries from the content index with pagination
 */
export function readFromIndex<TIndexValue = unknown, TKey extends Key = Key>(
  db: RootDatabase<TIndexValue, TKey>,
  options: {
    limit?: number;
    offset?: number;
    reverse?: boolean;
  } = {},
): RangeIterable<{ key: TKey; value: TIndexValue }> {
  const { limit, offset, reverse = true } = options;
  const range = db.getRange({ limit, offset, reverse });
  return range;
}

/**
 * Get the total count of entries in the index
 */
export function getIndexCount<TIndexValue = unknown, TKey extends Key = Key>(
  db: RootDatabase<TIndexValue, TKey>,
): number {
  return db.getCount();
}

/**
 * Replace every entry in the index with `entries`, in one write transaction.
 *
 * What a full rebuild writes through (epic 29, D2). The clear and the puts
 * commit together, so a reader — in this process or another — sees the old
 * index or the new one and never an empty or half-written one; and the
 * rebuild pays one synced commit instead of one per item, which was most of
 * its wall-clock time (`agent-epic-29.md`, "Measured").
 *
 * `clearSync` nests: inside an open write transaction lmdb-js runs it inline
 * (`transactionSync` with flags that skip the child transaction), so the drop
 * is part of this commit rather than one of its own. Nothing in the callback
 * awaits — the entries are collected before the transaction opens.
 */
export async function replaceIndex<
  TIndexValue = unknown,
  TKey extends Key = Key,
>(
  db: RootDatabase<TIndexValue, TKey>,
  entries: readonly { key: TKey; value: TIndexValue }[],
): Promise<void> {
  await db.transaction(() => {
    db.clearSync();
    for (const { key, value } of entries) db.putSync(key, value);
  });
}

/**
 * Drop all entries from the index (for rebuilding)
 */
export async function dropIndex<TIndexValue = unknown, TKey extends Key = Key>(
  db: RootDatabase<TIndexValue, TKey>,
): Promise<void> {
  await db.drop();
}
