import { type Key, type RootDatabase } from "lmdb";
import { dirname, resolve } from "path";
import { getContentDirectory } from "../fs/getContentDirectory";
import { openCachedEnvironment } from "../lmdb/environmentCache";
import type { ContentTypeConfig } from "../content/types";
import { hashValue } from "./hash";
import type { PaginationIndexConfig, PaginationMeta } from "./types";

/**
 * Keyspace prefixes. Every key in a pagination environment is a tuple whose
 * first component is one of these, so each keyspace is a contiguous range and
 * a range read never has to filter.
 */
export const SORTED = 0;
export const PAGED = 1;
export const PAGE_SUMMARY = 2;
export const LOOKUP = 3;
export const META = 4;

/** The key that holds the meta record. */
export const META_KEY: Key[] = [META];

/**
 * Where an index lives: a sibling of the content type's own index directory.
 *
 * Separate environments rather than named sub-databases, because the content
 * index stores its entries in the *root* database and lmdb's README warns
 * against mixing root entries with named-database metadata in one environment.
 * Separate environments also mean no migration of existing `*.mdb` files and
 * independent writers that never contend.
 */
export function getPaginationDirectory(
  config: Pick<ContentTypeConfig, "indexDirectory">,
  paginationConfig: Pick<PaginationIndexConfig, "name">,
  contentDirectory?: string,
): string {
  const baseDir = contentDirectory || getContentDirectory();
  return resolve(
    baseDir,
    dirname(config.indexDirectory),
    "pagination",
    paginationConfig.name,
  );
}

export function getPaginationDatabase<TValue = unknown>(
  config: Pick<ContentTypeConfig, "indexDirectory">,
  paginationConfig: Pick<PaginationIndexConfig, "name">,
  contentDirectory?: string,
): RootDatabase<TValue, Key[]> {
  return openCachedEnvironment<TValue>(
    getPaginationDirectory(config, paginationConfig, contentDirectory),
  );
}

/**
 * The display rank baked into a paged key.
 *
 * `-(position + 1)` rather than `-position`: `ordered-binary` does not encode
 * negative zero as a number at all — it falls out of the numeric encoding and
 * sorts after every other key — so a descending index must never produce it.
 */
export function displayRank(position: number, newestFirst: boolean): number {
  return newestFirst ? -(position + 1) : position;
}

/** The paged key for one item. */
export function pagedKey(
  pageIndex: number,
  position: number,
  id: string,
  newestFirst: boolean,
): Key[] {
  return [PAGED, pageIndex, displayRank(position, newestFirst), id];
}

/** Bounds covering exactly the paged entries of one page. */
export function pagedPageRange(pageIndex: number): {
  start: Key[];
  end: Key[];
} {
  return { start: [PAGED, pageIndex], end: [PAGED, pageIndex + 1] };
}

/** The sorted key for one item. */
export function sortedKey(sortKey: Key[], id: string): Key[] {
  return [SORTED, ...sortKey, id];
}

export function getId<TKey extends Key>(
  paginationConfig: { getId?: (key: TKey) => string },
  key: TKey,
): string {
  if (paginationConfig.getId) return paginationConfig.getId(key);
  if (Array.isArray(key)) return String(key[key.length - 1]);
  return String(key);
}

/**
 * Covers everything a reader would have to re-derive if it changed: the shape
 * of the keyspace (`perPage`, `newestFirst`), the identity of the index, and
 * the declared `version` of what its functions produce.
 *
 * Deliberately *not* the source text of those functions. A production build
 * minifies them and a dev server does not, so a source hash makes the same
 * config hash two ways and an index written by one build is rebuilt wholesale
 * by the other, every time (F16). A declared version is stable across builds;
 * `test/specVersions.test.ts` is what makes sure it gets bumped.
 */
export function computeSpecHash(
  paginationConfig: PaginationIndexConfig<never, Key, never>,
): string {
  const { name, perPage, newestFirst = true, version } = paginationConfig;
  return hashValue({ name, perPage, newestFirst, version });
}

export function readMeta(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
): PaginationMeta | undefined {
  return db.get(META_KEY) as PaginationMeta | undefined;
}

/** `total - 1` over `perPage`: the newest page, which is usually partial. */
export function computeHeadPage(total: number, perPage: number): number {
  if (total <= 0) return 0;
  return Math.floor((total - 1) / perPage);
}

/**
 * The numbered routes that exist: `0 … headPage - 2`. The head page and the
 * one folded into it are served by the landing page, so exposing them as
 * numbered routes too would put the same content at two URLs.
 */
export function numberedPageCount(headPage: number): number {
  return Math.max(0, headPage - 1);
}

/** Identifies both the index's shape and the state of its corpus. */
export function versionOf(meta: PaginationMeta): string {
  return `${meta.specHash.slice(0, 16)}:${meta.updatedAt}`;
}
