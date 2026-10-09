import type { Key } from "lmdb";
import { environmentExists } from "../lmdb/environmentCache";
import {
  PAGED,
  SORTED,
  getPaginationDatabase,
  getPaginationDirectory,
} from "./database";
import type { PaginationIndexOptions } from "./types";

/**
 * Every id in the index, in ascending sort order.
 *
 * A keys-only walk: the sorted keyspace *is* the id list, so listing slugs for
 * `generateStaticParams` costs no value deserialization at all, where reading
 * the content index deserializes the whole corpus to throw all of it away.
 */
export async function readAllIds<TIndexValue, TKey extends Key, TItem>(
  options: PaginationIndexOptions<TIndexValue, TKey, TItem>,
): Promise<string[]> {
  const { config, paginationConfig, contentDirectory } = options;
  // Unbuilt reads as empty and stays unbuilt: opening would create it (F30).
  if (
    !environmentExists(
      getPaginationDirectory(config, paginationConfig, contentDirectory),
    )
  ) {
    return [];
  }
  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  const ids: string[] = [];
  for (const key of db.getKeys({ start: [SORTED], end: [PAGED] })) {
    const fullKey = key as Key[];
    ids.push(String(fullKey[fullKey.length - 1]));
  }
  return ids;
}

export default readAllIds;
