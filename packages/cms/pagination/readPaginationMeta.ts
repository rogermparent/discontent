import type { Key } from "lmdb";
import {
  getPaginationDatabase,
  numberedPageCount,
  readMeta,
  versionOf,
} from "./database";
import type { PaginationMetaResult, ReadPaginationMetaOptions } from "./types";

/**
 * The counts a route needs, in O(1) — one key read, no corpus load.
 *
 * `generateStaticParams` is the caller this exists for: today it loads the
 * entire index into an array purely to count it, once per build and once per
 * content type.
 */
export async function readPaginationMeta<TIndexValue, TKey extends Key, TItem>(
  options: ReadPaginationMetaOptions<TIndexValue, TKey, TItem>,
): Promise<PaginationMetaResult> {
  const { config, paginationConfig, contentDirectory } = options;
  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  const meta = readMeta(db);

  if (!meta) {
    return {
      total: 0,
      headPage: 0,
      perPage: paginationConfig.perPage,
      numberedPages: [],
      version: "",
      updatedAt: 0,
    };
  }

  const count = meta.total === 0 ? 0 : numberedPageCount(meta.headPage);
  return {
    total: meta.total,
    headPage: meta.headPage,
    perPage: meta.perPage,
    numberedPages: Array.from({ length: count }, (_, index) => index),
    version: versionOf(meta),
    updatedAt: meta.updatedAt,
  };
}

export default readPaginationMeta;
