import type { Key } from "lmdb";
import type { AggregateUpdateResult } from "../aggregates/types";
import type { ContentTypeConfig } from "../content/types";

/**
 * One entry as the pagination layer sees it: the content index key and value,
 * plus the item's stable id (its slug).
 */
export interface PaginationEntry<
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  key: TKey;
  value: TIndexValue;
  id: string;
}

/**
 * Declares one pre-baked query over a content type.
 *
 * The keyspace it materializes is stored in its own LMDB environment, so any
 * number of these can coexist for a single content type without contending.
 */
export interface PaginationIndexConfig<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> {
  /** Directory name for this index, unique within its content type. */
  name: string;

  /** Items per page. Changing it re-cuts every boundary and forces a rebuild. */
  perPage: number;

  /**
   * The sort key, in ascending *stable* order — oldest first. Page assignment
   * walks this, and an item's position in the walk is its rank.
   *
   * Display direction is `newestFirst`, not this. Authors write the plain
   * ascending key and never think about negation.
   */
  key: (entry: PaginationEntry<TIndexValue, TKey>) => Key;

  /**
   * Display direction, baked into the paged keyspace at write time so a page
   * is read with a single forward seek. Defaults to true.
   */
  newestFirst?: boolean;

  /**
   * What a list item renders. Stored inline in the paged keyspace, so
   * iterating a page yields render-ready items with no further reads.
   *
   * Sourced from the content index value plus the id, synchronously — it must
   * not read data files. If a list item renders it, it belongs in the content
   * type's `buildIndexValue` and the projection selects from there.
   */
  project?: (entry: PaginationEntry<TIndexValue, TKey>) => TItem;

  /** Restricts the index to a subset of the corpus. */
  filter?: (entry: PaginationEntry<TIndexValue, TKey>) => boolean;

  /**
   * What "this item changed" means for the page hash. Defaults to the whole
   * projected item, so a page is dirty exactly when what it renders changed
   * and a field nobody projects can never dirty anything.
   */
  fingerprint?: (item: TItem) => unknown;

  /**
   * Declares the shape of what the functions above produce. Bump it whenever
   * you edit one of them, and every reader rebuilds instead of trusting an
   * index built by the old shape.
   *
   * Required, because the alternative — hashing `fn.toString()` — is not
   * build-stable: a production build minifies those functions and a dev server
   * does not, so the same config hashed differently depending on who wrote the
   * index (F16). `test/specVersions.test.ts` is what catches a forgotten bump.
   */
  version: string;

  /**
   * Extracts the item's id from its content index key. Defaults to the last
   * component of a tuple key, which is what every config in this repo uses.
   */
  getId?: (key: TKey) => string;
}

/**
 * Common options: which content type, which index, and where the content lives.
 * Mirrors the shape of `readContentIndex` / `rebuildIndex`.
 */
export interface PaginationIndexOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;
  paginationConfig: PaginationIndexConfig<TIndexValue, TKey, TItem>;
  contentDirectory?: string;
}

/** What the meta record holds. One key, so head reads and counts are O(1). */
export interface PaginationMeta {
  total: number;
  headPage: number;
  perPage: number;
  specHash: string;
  updatedAt: number;
  /**
   * Set for the duration of a rebuild. An index found with it still set is
   * rebuilt rather than trusted — the same rule as a spec hash mismatch.
   */
  rebuildInProgress: boolean;
}

/** The per-item record in the sorted keyspace. */
export interface SortedEntryValue<TItem = unknown> {
  item: TItem;
  fingerprint: unknown;
}

/** The reverse lookup: what page is this item on, and where does it sort? */
export interface PaginationLookup {
  sortKey: Key[];
  pageIndex?: number;
}

/** The per-page summary that the diff reads. */
export interface PageSummary {
  hash: string;
  count: number;
}

export interface WriteSortedEntryOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> extends PaginationIndexOptions<TIndexValue, TKey, TItem> {
  /** The item's stable id (its slug). */
  id: string;
  /**
   * The item's current content index key and value. Omit to delete the item
   * from this index.
   */
  entry?: { key: TKey; value: TIndexValue };
}

export interface UpdatePaginationIndexOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> extends PaginationIndexOptions<TIndexValue, TKey, TItem> {
  /**
   * Rebuild the sorted keyspace from the content index even when meta says the
   * index is current.
   *
   * Meta cannot detect every reason to distrust an index. `rebuildIndex` drops
   * and re-derives the *content* index without touching this one, and
   * `updateReferences` writes content index entries directly — after either,
   * the sorted keyspace can hold entries for items that no longer exist, or
   * miss ones that do, while the spec hash still matches. The caller knows; the
   * index does not.
   */
  force?: boolean;
}

export interface UpdatePaginationIndexesOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;
  contentDirectory?: string;
  /**
   * Overrides `config.paginationIndexes`. Useful for tests and for callers
   * that declare their indexes elsewhere.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paginationConfigs?: PaginationIndexConfig<any, any, any>[];
  /** Forces a rebuild of every index. See `UpdatePaginationIndexOptions`. */
  force?: boolean;
}

/**
 * One item's new state, as phase 1 needs to see it.
 *
 * The id *is* the slug, so a rename is a delete plus an insert in the sorted
 * keyspace — hence `previousId` rather than a dedicated move.
 */
export interface SyncPaginationItem<
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The item's stable id (its slug), after any rename. */
  id: string;
  /** The id the item had before, when this write renamed it. */
  previousId?: string;
  /** The item's new content index key and value. Omit to delete the item. */
  entry?: { key: TKey; value: TIndexValue };
}

/**
 * One item changed in the content index; bring every declared pagination index
 * back in step with it.
 */
export interface SyncPaginationOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
> extends SyncPaginationItem<TIndexValue, TKey> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;
  contentDirectory?: string;
}

/**
 * Several items of one content type changed; bring its indexes back in step
 * with all of them in one pass.
 */
export interface SyncPaginationItemsOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;
  contentDirectory?: string;
  items: SyncPaginationItem<TIndexValue, TKey>[];
}

/**
 * Everything one sync pass brought back in step, one list per derived kind.
 *
 * The shape §2 asks for — "one result per derived kind, per content type" —
 * arriving with the second kind. `syncPaginationItems` returned a bare
 * `PaginationUpdateResult[]` while pagination was the only kind that produced
 * a regeneration set; a third kind adds a field here rather than a parameter
 * everywhere.
 */
export interface SyncDerivedResult {
  pagination: PaginationUpdateResult[];
  aggregates: AggregateUpdateResult[];
}

/**
 * What one pass over an index changed. For the common create, `dirtyPages` is
 * `[headPage]` and nothing else — that is the thesis of the whole design.
 */
export interface PaginationUpdateResult {
  name: string;
  total: number;
  headPage: number;
  previousHeadPage: number;
  /** Stable page ids whose rendered content changed. */
  dirtyPages: number[];
  /** Pages that no longer exist. */
  removedPages: number[];
  unchanged: boolean;
  /** True when the pass rebuilt the index rather than reconciling it. */
  rebuilt: boolean;
}

/**
 * One page of results, shaped for both server rendering and
 * `useInfiniteQuery`.
 */
export interface PaginationPage<TItem = unknown> {
  items: TItem[];
  /** null for a cursor read, which does not correspond to a numbered page. */
  pageIndex: number | null;
  headPage: number;
  total: number;
  /** -> getNextPageParam; scrolling down walks toward older content. */
  olderPage: number | null;
  /** -> getPreviousPageParam. */
  newerPage: number | null;
  /** The sort key of the last entry, for a keyset resume. */
  nextCursor: Key[] | null;
  /** Changes when the config or the corpus changes. */
  version: string;
}

export interface ReadPageOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> extends PaginationIndexOptions<TIndexValue, TKey, TItem> {
  pageIndex: number;
}

export type ReadHeadOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> = PaginationIndexOptions<TIndexValue, TKey, TItem>;

export interface ReadAfterOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> extends PaginationIndexOptions<TIndexValue, TKey, TItem> {
  /** The sort key of the last entry already seen. Omit to start at the top. */
  after?: Key[];
  limit?: number;
}

export type ReadPaginationMetaOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = TIndexValue,
> = PaginationIndexOptions<TIndexValue, TKey, TItem>;

export interface PaginationMetaResult {
  total: number;
  headPage: number;
  perPage: number;
  /**
   * The numbered routes that exist: `0 … headPage - 2`. The head page and the
   * page folded into it are reachable only through the landing page, so they
   * are never duplicated across two URLs.
   */
  numberedPages: number[];
  version: string;
  updatedAt: number;
}
