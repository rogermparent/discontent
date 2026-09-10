import type { Key } from "lmdb";
import type { ContentTypeConfig } from "../content/types";

/**
 * One entry as the aggregate layer sees it: the content index key and value,
 * plus the item's stable id (its slug).
 *
 * Identical in shape to `PaginationEntry`, and deliberately its own type: the
 * two kinds are computed by separate passes over separate sources, and sharing
 * a type would be the first step toward sharing a walk (§2, F10b).
 */
export interface AggregateEntry<TIndexValue = unknown, TKey extends Key = Key> {
  key: TKey;
  value: TIndexValue;
  id: string;
}

/**
 * Declares one value folded from a whole content index.
 *
 * The second derived kind (§2). Where a pagination index answers "which pages
 * changed", an aggregate answers a question with no page in it at all — "did
 * this value change" — and the answer is usually **no**. A tag cloud is the
 * motivating case: most writes touch the corpus it is computed from and leave
 * it identical, so the pass stores a hash and reports nothing when the hash
 * holds.
 *
 * Folded from the content index **value**, not from a pagination projection.
 * That is what lets a content type with no pagination index declare one, and
 * what keeps the two modules independent — at the cost of a second O(N) walk
 * per write, which §3.7 prices as milliseconds at this corpus size and which is
 * in any case strictly better than the once-per-render it replaces.
 *
 * @example
 * ```ts
 * export const noteTags: AggregateConfig<
 *   NoteIndexValue, NoteIndexKey, Set<string>, string[]
 * > = {
 *   name: "tags",
 *   version: "1",
 *   initial: () => new Set(),
 *   fold: (tags, { value }) => {
 *     for (const tag of value.tags ?? []) tags.add(tag);
 *     return tags;
 *   },
 *   finalize: (tags) => [...tags].sort(),
 * };
 * ```
 */
export interface AggregateConfig<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TAccumulator = unknown,
  TValue = TAccumulator,
> {
  /** Directory name for this aggregate, unique within its content type. */
  name: string;

  /**
   * A fresh accumulator, built once per pass.
   *
   * A function rather than a value so the pass cannot accumulate into a shared
   * object across calls — the bug that would make an aggregate grow monotonically
   * and never notice a deletion.
   */
  initial: () => TAccumulator;

  /**
   * Fold one entry in. Called once per item in ascending content-index key
   * order, which for every config in this repo is oldest first.
   *
   * Synchronous by contract, for the same reason `project` is (§3.4): it runs
   * inside a walk, and a data-file read per item would make a write O(N) in
   * file opens.
   */
  fold: (
    accumulator: TAccumulator,
    entry: AggregateEntry<TIndexValue, TKey>,
  ) => TAccumulator;

  /**
   * Turns the accumulator into the value that gets stored, hashed and served.
   *
   * Where sorting, deduping and slicing belong. The stored value must be
   * JSON-serializable; the accumulator need not be, which is why these are two
   * types — a `Set` accumulator finalizing to a sorted array is the common case.
   *
   * Omit it only when the accumulator is already the value.
   */
  finalize?: (accumulator: TAccumulator) => TValue;

  /**
   * Declares the shape of what the functions above produce. Bump it whenever
   * you edit one of them, and every reader recomputes instead of trusting a
   * value folded by the old shape.
   *
   * Required, for the reason `PaginationIndexConfig.version` gives: hashing
   * `fn.toString()` is not build-stable across a minified production build and
   * a dev server (F16). `test/specVersions.test.ts` catches a forgotten bump.
   */
  version: string;
}

/**
 * Common options: which content type, which aggregate, and where content lives.
 * Mirrors `PaginationIndexOptions`.
 */
export interface AggregateOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TAccumulator = unknown,
  TValue = TAccumulator,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;
  aggregateConfig: AggregateConfig<TIndexValue, TKey, TAccumulator, TValue>;
  contentDirectory?: string;
}

/** What the stored record holds. One key, so a read is O(1). */
export interface AggregateRecord<TValue = unknown> {
  value: TValue;
  /** Of `value`. The whole basis for reporting `changed: false`. */
  hash: string;
  /** Of the config that produced it; a mismatch recomputes. */
  specHash: string;
  updatedAt: number;
}

/**
 * What one aggregate's pass reports.
 *
 * `changed` is the field this kind exists for. A write that leaves the value
 * identical reports false and fires no tag, which is the entire difference
 * between an aggregate and a pagination page (§11.1).
 */
export interface AggregateUpdateResult {
  name: string;
  changed: boolean;
  /** Items folded. Reported for the same reason `total` is on pagination. */
  total: number;
}

/**
 * No `force`, unlike `updatePaginationIndexes`.
 *
 * Phase 2 needs one because it trusts its own sorted keyspace, which a content
 * rebuild can invalidate behind its back. An aggregate pass has nothing to
 * trust: it re-reads the corpus and re-folds it every time. What it compares is
 * the *result*, so a rebuild and an ordinary write take exactly the same path
 * and a forced flag would have nothing to change.
 */
export interface UpdateAggregatesOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;
  contentDirectory?: string;
}
