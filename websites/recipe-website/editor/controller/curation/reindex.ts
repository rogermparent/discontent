/**
 * Rebuild an index from the data files — the CLI's half of Settings →
 * Maintenance.
 *
 * `rebuildAllIndexes()` in `controller/actions/index.ts` is the same loop with
 * a `revalidateDerivedState` at the end; that half cannot come along, because
 * invalidating a Next cache from outside the Next process is not a thing. So a
 * CLI write leaves a *running* editor serving what it had — which is what the
 * local backend's stderr hint says, and what 22d's `--notify` closes.
 *
 * `cascadeDependents: false` for the all-types pass, because the loop already
 * covers every type and the default would rebuild featured recipes twice.
 *
 * The all-types pass is also the one that writes the index stamp (27b): it is
 * the only rebuild that leaves *every* index describing the tree, so it is the
 * only one entitled to say which commit that tree was. HEAD is read before the
 * loop, so a commit that lands mid-rebuild is not claimed as indexed. A
 * one-type rebuild leaves the stamp alone.
 *
 * `timings` (29a) is wall-clock milliseconds per type rebuilt, plus `total`,
 * so `--json` and `/api/reindex` can say where a slow sync went without a
 * profiler.
 *
 * Epic 39: the all-types pass also writes the **index version** (D1,
 * `currentIndexVersion`) beside the HEAD stamp, and inside a job (D2,
 * `jobs/kinds.ts`'s `reindex` and `git-sync`) each type is a
 * `reindex.<type>` step, so `/jobs` shows where the time went. The job's
 * cancel is honoured only until the rebuild begins (`beyondCancel`): each
 * type ends in an atomic swap, and a rebuild stopped between two swaps
 * would leave the indexes from two trees and the stamp unwritten.
 */
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import {
  readHead,
  readIndexFreshness,
  writeIndexedHead,
  writeIndexVersion,
} from "@discontent/cms/git/indexStamp";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import { recipeContentTypes } from "../contentTypes";
import { currentIndexVersion } from "../indexVersion";
import { jobContext, type JobRun } from "../jobs/context";
import type { CurationContext } from "./context";
import { NotFoundError } from "./errors";

export interface ReindexResult {
  rebuilt: string[];
  timings?: Record<string, number>;
  /** The job it ran as (epic 39, D2), when it ran as one. */
  job?: string;
  /**
   * Nothing was rebuilt: asked only if stale, it found the indexes built
   * from HEAD by this code (39b review, L3; the `reindex` job's `ifStale`).
   */
  skipped?: "fresh";
}

/**
 * HEAD and the index version, when the indexes were built from this HEAD by
 * this code; `null` when anything is stale — or there is no HEAD to say.
 */
export async function freshIndexes(
  contentDirectory: string,
): Promise<{ head: string; version: string } | null> {
  const version = currentIndexVersion();
  const freshness = await readIndexFreshness(contentDirectory, { version });
  if (!freshness.head || freshness.stale || freshness.versionStale) {
    return null;
  }
  return { head: freshness.head, version };
}

export interface ReindexOptions {
  /** The job this rebuild runs in: per-type steps, and the cancel point. */
  job?: JobRun;
}

/** The step note a job's log gets when its cancel stops being honoured. */
const BEGUN =
  "the rebuild has begun: each index is swapped whole, so it runs to its end";

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

/**
 * Under the repository's write lock (34d, epic 34 D6): a rebuild replaces
 * every index from the data files, so a write landing in the middle would be
 * indexed by one half and missed by the other, and the stamp would claim a
 * HEAD whose files the loop never read. Re-entrant, so a pull, revert or
 * restore that already holds the lock rebuilds inside its own scope. The
 * engine measured a full rebuild of the real corpus at 0.8–0.9 s on the
 * workstation (2.5 s on the Pi), far inside the lock's 30 s wait.
 */
export async function reindex(
  ctx: CurationContext,
  contentType?: string,
  { job }: ReindexOptions = {},
): Promise<ReindexResult> {
  return withWriteLock(
    ctx.contentDirectory,
    contentType ? `reindex ${contentType}` : "reindex",
    () => reindexLocked(ctx, contentType, job),
  );
}

async function reindexLocked(
  ctx: CurationContext,
  contentType: string | undefined,
  run: JobRun | undefined,
): Promise<ReindexResult> {
  const job = jobContext(run);
  if (contentType) {
    const config = recipeContentTypes.find(
      (candidate) => candidate.contentType === contentType,
    );
    if (!config) {
      throw new NotFoundError(
        `Unknown content type "${contentType}". Known types: ${recipeContentTypes
          .map((candidate) => candidate.contentType)
          .join(", ")}`,
      );
    }
    await job.beyondCancel?.(BEGUN);
    /* One type named: let the cascade reach whatever borrows from it. */
    const start = performance.now();
    await job.log.step(`reindex.${config.contentType}`, () =>
      rebuildIndex({ config, contentDirectory: ctx.contentDirectory }),
    );
    const total = elapsed(start);
    return {
      rebuilt: [config.contentType],
      timings: { [config.contentType]: total, total },
    };
  }

  await job.beyondCancel?.(BEGUN);
  const start = performance.now();
  const timings: Record<string, number> = {};
  const head = await readHead(ctx.contentDirectory);
  for (const config of recipeContentTypes) {
    const typeStart = performance.now();
    await job.log.step(`reindex.${config.contentType}`, () =>
      rebuildIndex({
        config,
        contentDirectory: ctx.contentDirectory,
        cascadeDependents: false,
      }),
    );
    timings[config.contentType] = elapsed(typeStart);
  }
  await writeIndexedHead(ctx.contentDirectory, head);
  /* After the loop and the HEAD: a rebuild that threw part-way claims neither. */
  await writeIndexVersion(ctx.contentDirectory, currentIndexVersion());
  timings.total = elapsed(start);
  return {
    rebuilt: recipeContentTypes.map((config) => config.contentType),
    timings,
  };
}
