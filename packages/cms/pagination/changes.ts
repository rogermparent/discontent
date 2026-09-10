import { outputJson, pathExists, readJson, remove } from "fs-extra";
import { resolve } from "path";
import type { AggregateUpdateResult } from "../aggregates/types";
import { getContentDirectory } from "../fs/getContentDirectory";
import type { PaginationUpdateResult } from "./types";

/**
 * The dirty-page artifact's filename.
 *
 * A dotfile on purpose. `commitChanges` falls back to `git add "./*"` when it
 * is handed no explicit paths, and that glob does not match dotfiles — so a
 * content type whose write path commits everything cannot sweep build
 * bookkeeping into a content commit. Content repositories should gitignore it
 * regardless.
 */
export const PAGINATION_CHANGES_FILENAME = ".pagination-changes.json";

export const PAGINATION_CHANGES_VERSION = 1;

/** What changed in one index since the artifact was last cleared. */
export interface PaginationIndexChanges {
  /** Stable page ids a build would have to re-render. */
  dirtyPages: number[];
  /** Stable page ids a build would have to delete. */
  removedPages: number[];
  headPage: number;
  total: number;
}

/**
 * Accumulated dirty pages across every index of every content type, plus which
 * aggregates moved.
 *
 * Both keyed `<contentType>/<name>` so one file covers a whole content
 * directory and a consumer never has to go looking for more.
 *
 * `aggregates` is a flat list rather than a field on `PaginationIndexChanges`
 * because an aggregate belongs to a content type, not to an index — a type with
 * no pagination index can still declare one, and there would be no index entry
 * to hang it off. It stays optional so an artifact written before F10b still
 * reads.
 */
export interface PaginationChanges {
  version: number;
  updatedAt: number;
  indexes: Record<string, PaginationIndexChanges>;
  /** Names of aggregates whose value moved since the artifact was cleared. */
  aggregates?: string[];
}

export function getPaginationChangesPath(contentDirectory?: string): string {
  return resolve(
    contentDirectory || getContentDirectory(),
    PAGINATION_CHANGES_FILENAME,
  );
}

const EMPTY: PaginationChanges = {
  version: PAGINATION_CHANGES_VERSION,
  updatedAt: 0,
  indexes: {},
};

/**
 * Read the artifact, or an empty one if there is nothing to read.
 *
 * Deliberately forgiving: this is derived state whose worst failure is a build
 * that re-renders more than it had to, so a corrupt or half-written file reads
 * as "no recorded changes" rather than throwing into a content write.
 */
export async function readPaginationChanges(
  contentDirectory?: string,
): Promise<PaginationChanges> {
  const path = getPaginationChangesPath(contentDirectory);
  try {
    if (!(await pathExists(path))) return { ...EMPTY, indexes: {} };
    const parsed = (await readJson(path)) as Partial<PaginationChanges>;
    if (!parsed || typeof parsed !== "object" || !parsed.indexes) {
      return { ...EMPTY, indexes: {} };
    }
    return {
      version: parsed.version ?? PAGINATION_CHANGES_VERSION,
      updatedAt: parsed.updatedAt ?? 0,
      indexes: parsed.indexes,
      ...(parsed.aggregates ? { aggregates: parsed.aggregates } : {}),
    };
  } catch {
    return { ...EMPTY, indexes: {} };
  }
}

function union(a: number[] = [], b: number[] = []): number[] {
  return [...new Set([...a, ...b])].sort((left, right) => left - right);
}

/**
 * Merge one pass's results into the artifact.
 *
 * Merging rather than replacing is the whole point: the artifact records every
 * change since a build last consumed it, and a content directory can take any
 * number of writes between two builds. `headPage` and `total` are the current
 * state and are overwritten; the page lists are unioned.
 *
 * @example
 * ```ts
 * await recordPaginationChanges({
 *   contentType: "recipes",
 *   results: await updatePaginationIndexes({ config: recipeConfig }),
 * });
 * ```
 */
export async function recordPaginationChanges(options: {
  contentType: string;
  results: PaginationUpdateResult[];
  aggregates?: AggregateUpdateResult[];
  contentDirectory?: string;
}): Promise<void> {
  const { contentType, results, aggregates = [], contentDirectory } = options;
  /*
   * Aggregates that moved count as something to record, so a content type with
   * aggregates and no pagination index still writes an artifact.
   */
  const changedAggregates = aggregates.filter((result) => result.changed);
  if (results.length === 0 && changedAggregates.length === 0) return;

  const changes = await readPaginationChanges(contentDirectory);
  for (const result of results) {
    const key = `${contentType}/${result.name}`;
    const previous = changes.indexes[key];
    changes.indexes[key] = {
      dirtyPages: union(previous?.dirtyPages, result.dirtyPages),
      removedPages: union(previous?.removedPages, result.removedPages),
      headPage: result.headPage,
      total: result.total,
    };
  }
  if (changedAggregates.length > 0) {
    changes.aggregates = [
      ...new Set([
        ...(changes.aggregates ?? []),
        ...changedAggregates.map((result) => `${contentType}/${result.name}`),
      ]),
    ].sort();
  }
  changes.version = PAGINATION_CHANGES_VERSION;
  changes.updatedAt = Date.now();

  // `outputJson`, not `writeJson`: creates the content directory if a caller
  // records changes against one that does not exist yet.
  await outputJson(getPaginationChangesPath(contentDirectory), changes, {
    spaces: 2,
  });
}

/**
 * Drop the artifact. Whoever consumes it clears it — an incremental build that
 * has re-rendered the dirty pages, or a test asserting on the next write.
 */
export async function clearPaginationChanges(
  contentDirectory?: string,
): Promise<void> {
  await remove(getPaginationChangesPath(contentDirectory));
}
