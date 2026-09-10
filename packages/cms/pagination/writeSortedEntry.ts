import type { Key, RootDatabase } from "lmdb";
import { LOOKUP, getId, getPaginationDatabase, sortedKey } from "./database";
import { hashValue } from "./hash";
import type {
  PaginationEntry,
  PaginationIndexConfig,
  PaginationLookup,
  SortedEntryValue,
  WriteSortedEntryOptions,
} from "./types";

/**
 * Projects one entry and computes its fingerprint.
 *
 * Both happen here, at write time, so the pagination pass is pure data
 * movement: it never calls back into the content type's config.
 */
export function projectEntry<TIndexValue, TKey extends Key, TItem>(
  paginationConfig: PaginationIndexConfig<TIndexValue, TKey, TItem>,
  entry: PaginationEntry<TIndexValue, TKey>,
): SortedEntryValue<TItem> {
  const item = paginationConfig.project
    ? paginationConfig.project(entry)
    : (entry.value as unknown as TItem);
  const fingerprint = paginationConfig.fingerprint
    ? paginationConfig.fingerprint(item)
    : item;
  return { item, fingerprint: hashValue(fingerprint) };
}

/**
 * Phase 1, applied to a single item and a single index inside an already-open
 * environment. Writes, moves or deletes the item's sorted entry and its
 * lookup. No page is computed — that is phase 2's job.
 */
export function writeSortedEntryTo<TIndexValue, TKey extends Key, TItem>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, Key[]>,
  paginationConfig: PaginationIndexConfig<TIndexValue, TKey, TItem>,
  id: string,
  entry?: { key: TKey; value: TIndexValue },
): void {
  const previous = db.get([LOOKUP, id]) as PaginationLookup | undefined;

  const included =
    entry !== undefined &&
    (!paginationConfig.filter ||
      paginationConfig.filter({ key: entry.key, value: entry.value, id }));

  if (!included) {
    if (previous) {
      db.remove(sortedKey(previous.sortKey, id));
      db.remove([LOOKUP, id]);
    }
    return;
  }

  const fullEntry: PaginationEntry<TIndexValue, TKey> = {
    key: entry.key,
    value: entry.value,
    id,
  };
  const rawSortKey = paginationConfig.key(fullEntry);
  const sortKey: Key[] = Array.isArray(rawSortKey) ? rawSortKey : [rawSortKey];

  if (
    previous &&
    JSON.stringify(previous.sortKey) !== JSON.stringify(sortKey)
  ) {
    db.remove(sortedKey(previous.sortKey, id));
  }

  db.put(sortedKey(sortKey, id), projectEntry(paginationConfig, fullEntry));
  /*
   * The stored `pageIndex` is carried forward rather than cleared. It is only
   * ever a hint — phase 2 recomputes it — but keeping it means a lookup stays
   * answerable between the two phases.
   */
  db.put([LOOKUP, id], {
    sortKey,
    pageIndex: previous?.pageIndex,
  } satisfies PaginationLookup);
}

/**
 * Phase 1 for one item against one index, opening the environment itself.
 *
 * @example
 * ```ts
 * await writeSortedEntry({
 *   config: recipeConfig,
 *   paginationConfig: recipesByDate,
 *   id: "chocolate-cake",
 *   entry: { key: [1738438739783, "chocolate-cake"], value: indexValue },
 * });
 * ```
 */
export async function writeSortedEntry<TIndexValue, TKey extends Key, TItem>(
  options: WriteSortedEntryOptions<TIndexValue, TKey, TItem>,
): Promise<void> {
  const { config, paginationConfig, contentDirectory, id, entry } = options;
  const db = getPaginationDatabase(config, paginationConfig, contentDirectory);
  await db.transaction(() => {
    writeSortedEntryTo(db, paginationConfig, id, entry);
  });
}

export { getId };
export default writeSortedEntry;
