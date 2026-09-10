import type { Key, RootDatabase } from "lmdb";
import { getContentDatabase } from "../content/database";
import { getContentDirectory } from "../fs/getContentDirectory";
import {
  LOOKUP,
  META,
  META_KEY,
  PAGED,
  PAGE_SUMMARY,
  SORTED,
  computeHeadPage,
  computeSpecHash,
  getId,
  getPaginationDatabase,
  pagedKey,
  pagedPageRange,
  readMeta,
} from "./database";
import { hashValue } from "./hash";
import { writeSortedEntryTo } from "./writeSortedEntry";
import type {
  PageSummary,
  PaginationIndexConfig,
  PaginationLookup,
  PaginationUpdateResult,
  SortedEntryValue,
  UpdatePaginationIndexOptions,
} from "./types";

/**
 * The one seat where "which page does this item land on" is decided.
 *
 * Everything else — the keyspaces, the projection, the hashing, the diff — is
 * independent of the answer, so swapping in key buckets (`/2026/03`) or
 * content-defined chunking is a change to this function and nothing else.
 */
export type AssignPage = (position: number, perPage: number) => number;

/**
 * Fixed-size pages counted from the oldest item. Optimises the common write —
 * an append lands at the natural end of the keyspace and moves no existing
 * position — and keeps page sizes uniform, so "page N of M" is honest.
 */
export const fixedSizeFromStableEnd: AssignPage = (position, perPage) =>
  Math.floor(position / perPage);

const assignPage: AssignPage = fixedSizeFromStableEnd;

interface WalkEntry {
  id: string;
  item: unknown;
  fingerprint: unknown;
  sortKey: Key[];
  position: number;
}

/**
 * Drops the whole keyspace and rewrites the sorted entries from the content
 * index. Reached when there is no meta record, when the spec hash no longer
 * matches, or when a previous rebuild did not finish.
 */
async function rebuildSortedKeyspace<TIndexValue, TKey extends Key, TItem>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
  options: UpdatePaginationIndexOptions<TIndexValue, TKey, TItem>,
  specHash: string,
): Promise<void> {
  const { config, paginationConfig, contentDirectory } = options;

  /*
   * The flag goes down before anything is destroyed. A crash from here on
   * leaves an index that is visibly mid-rebuild rather than one that looks
   * complete and is not.
   */
  await db.put(META_KEY, {
    total: 0,
    headPage: 0,
    perPage: paginationConfig.perPage,
    specHash,
    updatedAt: Date.now(),
    rebuildInProgress: true,
  });

  const stale = [...db.getKeys({ start: [SORTED], end: [META] })];
  if (stale.length > 0) {
    await db.transaction(() => {
      for (const key of stale) db.remove(key);
    });
  }

  const contentDb = getContentDatabase<TIndexValue, TKey>(
    config,
    contentDirectory || getContentDirectory(),
  );
  /*
   * Materialized rather than streamed into the transaction below: the range is
   * read from one environment and written into another, and the write is a
   * single transaction.
   */
  const entries: { key: TKey; value: TIndexValue }[] = [
    ...contentDb.getRange({}),
  ];

  await db.transaction(() => {
    for (const { key, value } of entries) {
      writeSortedEntryTo(db, paginationConfig, getId(paginationConfig, key), {
        key,
        value,
      });
    }
  });
}

/**
 * Phase 2: assign every item to a page, materialize the paged keyspace, and
 * report which pages a reader would now render differently.
 *
 * The walk is O(N) by design — a full pass is much easier to get right than an
 * incremental one, and at this corpus size it is milliseconds. Ascending
 * storage leaves the door open: sealed pages are a prefix of the walk, so a
 * later version can seek straight to `headPage * perPage`.
 *
 * @example
 * ```ts
 * const { dirtyPages } = await updatePaginationIndex({
 *   config: recipeConfig,
 *   paginationConfig: recipesByDate,
 * });
 * ```
 */
export async function updatePaginationIndex<
  TIndexValue,
  TKey extends Key,
  TItem,
>(
  options: UpdatePaginationIndexOptions<TIndexValue, TKey, TItem>,
): Promise<PaginationUpdateResult> {
  const { config, paginationConfig, contentDirectory, force } = options;
  const { name, perPage, newestFirst = true } = paginationConfig;

  if (!Number.isInteger(perPage) || perPage < 1) {
    throw new Error(
      `Pagination index "${name}" has an invalid perPage: ${perPage}`,
    );
  }

  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  const specHash = computeSpecHash(
    paginationConfig as unknown as PaginationIndexConfig<never, Key, never>,
  );

  const previousMeta = readMeta(db);
  const previousHeadPage = previousMeta?.headPage ?? 0;
  const rebuilt =
    force === true ||
    !previousMeta ||
    previousMeta.specHash !== specHash ||
    previousMeta.rebuildInProgress === true;

  if (rebuilt) {
    await rebuildSortedKeyspace(db, options, specHash);
  }

  // Page count is small, so the whole diff source fits in memory.
  const oldSummaries = new Map<number, PageSummary>();
  for (const { key, value } of db.getRange({
    start: [PAGE_SUMMARY],
    end: [LOOKUP],
  })) {
    oldSummaries.set(key[1] as number, value as PageSummary);
  }

  const dirtyPages: number[] = [];
  const dirtyPageEntries = new Map<number, WalkEntry[]>();
  const pageHashes = new Map<number, string>();

  let position = 0;
  let currentPage = 0;
  let buffer: WalkEntry[] = [];

  /*
   * A page is dirty exactly when the ordered `(id, fingerprint)` sequence it
   * renders changed. Key-diffing would miss the most common edit — a retitle
   * moves neither the key nor the page, but the rendered page is different.
   */
  const flushPage = () => {
    if (buffer.length === 0) return;
    const entries = buffer;
    buffer = [];
    const hash = hashValue(
      entries.map((entry) => [entry.id, entry.fingerprint]),
    );
    const old = oldSummaries.get(currentPage);
    oldSummaries.delete(currentPage);
    if (old && old.hash === hash && old.count === entries.length) return;
    dirtyPages.push(currentPage);
    dirtyPageEntries.set(currentPage, entries);
    pageHashes.set(currentPage, hash);
  };

  /*
   * Iterating while buffering mutations is safe: LMDB read transactions are
   * snapshots, so the walk cannot see writes made from the same pass.
   */
  for (const { key, value } of db.getRange({
    start: [SORTED],
    end: [PAGED],
  })) {
    const fullKey = key as Key[];
    const entryValue = value as SortedEntryValue;
    const pageIndex = assignPage(position, perPage);
    if (pageIndex !== currentPage) {
      flushPage();
      currentPage = pageIndex;
    }
    buffer.push({
      id: String(fullKey[fullKey.length - 1]),
      item: entryValue.item,
      fingerprint: entryValue.fingerprint,
      sortKey: fullKey.slice(1, -1),
      position,
    });
    position += 1;
  }
  flushPage();

  const total = position;
  const headPage = computeHeadPage(total, perPage);
  const removedPages = [...oldSummaries.keys()].sort((a, b) => a - b);

  /*
   * `rebuilt` leads because `rebuildSortedKeyspace` sets `rebuildInProgress`
   * and only the transaction below clears it. Every other way to reach a
   * rebuild also makes one of the clauses that follow true, but a *forced*
   * one need not: forcing a rebuild of an index that turns out to be current
   * would otherwise skip the write and leave the index flagged mid-rebuild
   * forever, rebuilding itself on every subsequent pass.
   */
  const metaStale =
    rebuilt ||
    !previousMeta ||
    previousMeta.specHash !== specHash ||
    previousMeta.total !== total ||
    previousMeta.headPage !== headPage ||
    previousMeta.perPage !== perPage ||
    previousMeta.rebuildInProgress;

  const changed = dirtyPages.length > 0 || removedPages.length > 0 || metaStale;

  /*
   * A pass that changed nothing leaves `updatedAt` alone. The version string
   * is derived from it, so a no-op update does not invalidate a single cached
   * page.
   */
  if (changed) {
    await db.transaction(() => {
      for (const pageIndex of dirtyPages) {
        const entries = dirtyPageEntries.get(pageIndex) as WalkEntry[];
        for (const key of [...db.getKeys(pagedPageRange(pageIndex))]) {
          db.remove(key);
        }
        for (const entry of entries) {
          db.put(
            pagedKey(pageIndex, entry.position, entry.id, newestFirst),
            entry.item,
          );
          db.put([LOOKUP, entry.id], {
            sortKey: entry.sortKey,
            pageIndex,
          } satisfies PaginationLookup);
        }
        db.put([PAGE_SUMMARY, pageIndex], {
          hash: pageHashes.get(pageIndex) as string,
          count: entries.length,
        } satisfies PageSummary);
      }
      for (const pageIndex of removedPages) {
        for (const key of [...db.getKeys(pagedPageRange(pageIndex))]) {
          db.remove(key);
        }
        db.remove([PAGE_SUMMARY, pageIndex]);
      }
      db.put(META_KEY, {
        total,
        headPage,
        perPage,
        specHash,
        updatedAt: Date.now(),
        rebuildInProgress: false,
      });
    });
  }

  return {
    name,
    total,
    headPage,
    previousHeadPage,
    dirtyPages,
    removedPages,
    unchanged: !changed,
    rebuilt,
  };
}

export default updatePaginationIndex;
