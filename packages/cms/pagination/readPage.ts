import type { Key } from "lmdb";
import {
  LOOKUP,
  PAGED,
  SORTED,
  getPaginationDatabase,
  pagedPageRange,
  readMeta,
  versionOf,
} from "./database";
import type {
  PaginationIndexOptions,
  PaginationLookup,
  PaginationMeta,
  PaginationPage,
  ReadAfterOptions,
  ReadHeadOptions,
  ReadPageOptions,
  SortedEntryValue,
} from "./types";

const EMPTY_META: PaginationMeta = {
  total: 0,
  headPage: 0,
  perPage: 0,
  specHash: "",
  updatedAt: 0,
  rebuildInProgress: false,
};

type Database = ReturnType<typeof getPaginationDatabase>;

/** One page's items, in display order, from a single forward range seek. */
function seekPage<TItem>(
  db: Database,
  pageIndex: number,
): { items: TItem[]; lastId: string | null } {
  const items: TItem[] = [];
  let lastId: string | null = null;
  for (const { key, value } of db.getRange(pagedPageRange(pageIndex))) {
    const fullKey = key as Key[];
    lastId = String(fullKey[fullKey.length - 1]);
    items.push(value as TItem);
  }
  return { items, lastId };
}

/** The keyset cursor for an item: its full sorted-keyspace suffix. */
function cursorFor(db: Database, id: string | null): Key[] | null {
  if (id === null) return null;
  const lookup = db.get([LOOKUP, id]) as PaginationLookup | undefined;
  if (!lookup) return null;
  return [...lookup.sortKey, id];
}

/**
 * Read one numbered page.
 *
 * Numbered routes cover `0 … headPage - 2`; `readPage` will still serve the
 * head and the folded page if asked, so a caller that wants the canonical
 * landing content should use `readHead`.
 *
 * Returns null when the index has not been built or the page does not exist.
 */
export async function readPage<TIndexValue, TKey extends Key, TItem>(
  options: ReadPageOptions<TIndexValue, TKey, TItem>,
): Promise<PaginationPage<TItem> | null> {
  const { config, paginationConfig, contentDirectory, pageIndex } = options;
  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  const meta = readMeta(db);
  if (!meta || meta.total === 0) return null;
  const { headPage } = meta;
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > headPage) {
    return null;
  }

  const { items, lastId } = seekPage<TItem>(db, pageIndex);
  if (items.length === 0) return null;

  return {
    items,
    pageIndex,
    headPage,
    total: meta.total,
    olderPage: pageIndex > 0 ? pageIndex - 1 : null,
    // Past `headPage - 2` the next-newer page is the landing page, not a route.
    newerPage: pageIndex + 1 <= headPage - 2 ? pageIndex + 1 : null,
    nextCursor: cursorFor(db, lastId),
    version: versionOf(meta),
  };
}

/**
 * The landing page: the head page folded together with the one below it.
 *
 * The head alone holds between 1 and `perPage` items, which makes a poor
 * landing page, so this returns `perPage + 1` to `2 * perPage` items from two
 * bounded range seeks. The folded page is excluded from the numbered routes,
 * so no content appears at two URLs.
 */
export async function readHead<TIndexValue, TKey extends Key, TItem>(
  options: ReadHeadOptions<TIndexValue, TKey, TItem>,
): Promise<PaginationPage<TItem>> {
  const { config, paginationConfig, contentDirectory } = options;
  const newestFirst = paginationConfig.newestFirst ?? true;
  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  const meta = readMeta(db) ?? EMPTY_META;
  const { headPage } = meta;

  const head = seekPage<TItem>(db, headPage);
  const folded =
    headPage > 0
      ? seekPage<TItem>(db, headPage - 1)
      : { items: [], lastId: null };

  /*
   * Newest-first reads the head page first, since it holds the newest items.
   * An ascending index reads the other way round — though such an index is
   * better served by `readPage(0)` as its landing.
   */
  const items = newestFirst
    ? [...head.items, ...folded.items]
    : [...folded.items, ...head.items];
  const lastId = newestFirst
    ? (folded.lastId ?? head.lastId)
    : (head.lastId ?? folded.lastId);

  return {
    items,
    pageIndex: headPage,
    headPage,
    total: meta.total,
    olderPage: headPage - 2 >= 0 ? headPage - 2 : null,
    newerPage: null,
    nextCursor: cursorFor(db, lastId),
    version: versionOf(meta),
  };
}

/**
 * Keyset read: everything after a cursor, in display order.
 *
 * The one reverse read in the module, and bounded by `limit`. It exists for
 * the case ids cannot cover — a backdated insert between two fetches shifts
 * later positions, so resuming from a page number would be approximate where
 * resuming from the last entry's own key is exact.
 */
export async function readAfter<TIndexValue, TKey extends Key, TItem>(
  options: ReadAfterOptions<TIndexValue, TKey, TItem>,
): Promise<PaginationPage<TItem>> {
  const {
    config,
    paginationConfig,
    contentDirectory,
    after,
    limit = 20,
  } = options;
  const newestFirst = paginationConfig.newestFirst ?? true;
  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  const meta = readMeta(db) ?? EMPTY_META;

  const bounds = after
    ? newestFirst
      ? { start: [SORTED, ...after], end: [SORTED], reverse: true }
      : { start: [SORTED, ...after], end: [PAGED], reverse: false }
    : newestFirst
      ? { start: [PAGED], end: [SORTED], reverse: true }
      : { start: [SORTED], end: [PAGED], reverse: false };

  /*
   * One extra to see whether anything follows this batch, plus one more when
   * resuming: an inclusive range start returns the cursor entry itself, which
   * is dropped below and would otherwise eat the lookahead.
   */
  const raw = [...db.getRange({ ...bounds, limit: limit + (after ? 2 : 1) })];
  const cursorKey = after ? JSON.stringify([SORTED, ...after]) : null;
  const entries = raw.filter(
    ({ key }) => cursorKey === null || JSON.stringify(key) !== cursorKey,
  );
  const page = entries.slice(0, limit);

  const items = page.map(
    ({ value }) => (value as SortedEntryValue<TItem>).item,
  );
  const last = page[page.length - 1];
  const lastKey = last ? (last.key as Key[]).slice(1) : null;
  const exhausted = entries.length <= limit;

  return {
    items,
    pageIndex: null,
    headPage: meta.headPage,
    total: meta.total,
    olderPage: null,
    newerPage: null,
    nextCursor: exhausted ? null : lastKey,
    version: versionOf(meta),
  };
}

/** What page an item is on, or null if it is not in this index. */
export async function readItemPage<TIndexValue, TKey extends Key, TItem>(
  options: PaginationIndexOptions<TIndexValue, TKey, TItem> & { id: string },
): Promise<number | null> {
  const { config, paginationConfig, contentDirectory, id } = options;
  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  const lookup = db.get([LOOKUP, id]) as PaginationLookup | undefined;
  return lookup?.pageIndex ?? null;
}

export default readPage;
