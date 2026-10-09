import { exists, readdir } from "fs-extra";
import type { Key } from "lmdb";
import { getContentDirectory } from "../fs/getContentDirectory";
import { getContentDatabase, replaceIndex } from "./database";
import { recordPaginationChanges } from "../pagination/changes";
import { updateAggregates } from "../aggregates/updateAggregates";
import { updatePaginationIndexes } from "../pagination/updatePaginationIndexes";
import { getDataDirectory, readContentFromFilesystem } from "./filesystem";
import {
  createReferenceResolver,
  resolveReferences,
  type ReferenceResolver,
} from "./references";
import type { ContentTypeConfig, RebuildIndexOptions } from "./types";

export interface CollectedIndexEntries<TIndexValue, TKey extends Key> {
  /** In `readdir` order, whatever order the reads finished in. */
  entries: { key: TKey; value: TIndexValue }[];
  /** Slugs whose data file failed to read, parse, resolve or project. */
  skipped: string[];
}

/**
 * Read, resolve and project every item of one content type — everything a
 * rebuild does before it writes.
 *
 * Split out of `rebuildIndex` (epic 29, 29a) so the write can be one
 * transaction (`replaceIndex`): an LMDB write transaction cannot hold an
 * `await`, and every step here is one.
 *
 * The reads run through a bounded pool rather than one at a time. That is
 * safe because the resolver caches the *promise* per target, so two items
 * borrowing from the same target still share one read; and it is bounded
 * because each item holds its data file and resolved references in memory
 * until the pool drains. The entries come back in `readdir` order regardless,
 * so put order — and with it msgpackr's shared-structure table — does not
 * depend on which read finished first.
 *
 * A slug that fails anywhere is warned about and skipped, as before: a
 * malformed data file must not take the rest of the index down with it.
 */
export async function collectIndexEntries<TData, TIndexValue, TKey extends Key>(
  config: ContentTypeConfig<TData, TIndexValue, TKey>,
  contentDirectory: string,
  resolver: ReferenceResolver,
  { concurrency = 8 }: { concurrency?: number } = {},
): Promise<CollectedIndexEntries<TIndexValue, TKey>> {
  const dataDirectory = getDataDirectory(
    config as ContentTypeConfig,
    contentDirectory,
  );
  if (!(await exists(dataDirectory))) return { entries: [], skipped: [] };

  const slugs = await readdir(dataDirectory);
  const results: ({ key: TKey; value: TIndexValue } | undefined)[] = new Array(
    slugs.length,
  );
  let next = 0;
  const worker = async () => {
    while (next < slugs.length) {
      const index = next;
      next += 1;
      const slug = slugs[index];
      try {
        const data = await readContentFromFilesystem<TData>(
          config as ContentTypeConfig<TData>,
          slug,
          contentDirectory,
        );
        const refs = await resolveReferences({ config, data, resolver });
        results[index] = {
          key: config.buildIndexKey(slug, data),
          value: config.buildIndexValue(data, refs),
        };
      } catch {
        // Skip entries that fail to read
        console.warn(
          `Failed to read ${config.contentType} at ${slug}, skipping`,
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );

  const entries: { key: TKey; value: TIndexValue }[] = [];
  const skipped: string[] = [];
  results.forEach((entry, index) => {
    if (entry) entries.push(entry);
    else skipped.push(slugs[index]);
  });
  return { entries, skipped };
}

/**
 * Rebuild the LMDB index from filesystem data
 *
 * This function scans the data directory and rebuilds the entire index by
 * reading each content file, resolving the references it declares and adding
 * it to the index, then rebuilds every pagination index declared on the
 * content type — and then does the same for every type that borrows from it.
 *
 * This is what gives a fresh checkout its pagination indexes: the ~10 callers
 * of `rebuildIndex` — the export action, the sync command, the seed scripts —
 * all inherit it without changing.
 *
 * @example
 * ```ts
 * await rebuildIndex({
 *   config: recipeConfig,
 * });
 * ```
 */
export async function rebuildIndex<TData, TIndexValue, TKey extends Key>(
  options: RebuildIndexOptions<TData, TIndexValue, TKey>,
): Promise<void> {
  const {
    config,
    contentDirectory: providedContentDirectory,
    cascadeDependents = true,
    visited = new Set<string>(),
  } = options;

  const contentDirectory = providedContentDirectory || getContentDirectory();
  visited.add(config.contentType);

  /*
   * Hoisted out of the item loop, so a corpus of N items referencing the same
   * target reads that target's data file once rather than N times.
   */
  const resolver = createReferenceResolver(contentDirectory);

  const db = getContentDatabase<TIndexValue, TKey>(
    config as ContentTypeConfig,
    contentDirectory,
  );
  /*
   * Read everything first, then swap the whole index in one transaction
   * (29a). This used to drop the index and then `await` one put per item —
   * one synced commit each, and an empty-then-partial index for any reader
   * in between. A missing data directory collects nothing, and so clears.
   */
  const { entries } = await collectIndexEntries(
    config,
    contentDirectory,
    resolver,
  );
  await replaceIndex(db, entries);

  /*
   * Forced, because this call just dropped and re-derived the content index
   * without touching the sorted keyspace, so meta still matches a spec hash
   * that vouches for nothing — phase 2 alone would walk stale entries for
   * items that are no longer on disk.
   *
   * This used to have to sit outside a `finally` that closed the content
   * environment, since phase 2 opens that environment itself; since F1 both
   * calls get the same cached one and the ordering constraint is gone.
   */
  const results = await updatePaginationIndexes({
    config,
    contentDirectory,
    force: true,
  });
  /*
   * Aggregates too. Its own call rather than one inside `syncPaginationItems`,
   * exactly as `recordPaginationChanges` is — a rebuild has no items to sync.
   *
   * Nothing to force: the pass re-reads the corpus and re-folds it every time,
   * so it cannot be holding a value vouched for by a stale keyspace the way
   * phase 2 can. And an aggregate whose value survives the rebuild unchanged
   * still reports `changed: false` and fires no tag — the honest answer, and
   * the one F12's incremental reconciliation will want.
   */
  const aggregates = await updateAggregates({ config, contentDirectory });

  await recordPaginationChanges({
    contentType: config.contentType,
    contentDirectory,
    results,
    aggregates,
  });

  /*
   * Then everything that borrows from what we just re-derived.
   *
   * `rebuildRecipeIndex()` rebuilds recipes and nothing else, and it is what
   * the export action, the sync command and the maintenance button call. A
   * dependent's index value holds fields copied out of recipe data files, and
   * the content index carries no spec hash to notice they went stale — so
   * without this, "rebuild everything" would quietly not.
   *
   * `visited` bounds it: an edge declared in both directions between two types
   * is a cycle, and this is the one place that walks edges transitively.
   */
  if (!cascadeDependents) return;
  for (const spec of config.referencedBy ?? []) {
    const dependentConfig = spec.config();
    if (visited.has(dependentConfig.contentType)) continue;
    await rebuildIndex({
      config: dependentConfig,
      contentDirectory,
      cascadeDependents,
      visited,
    });
  }
}

export default rebuildIndex;
