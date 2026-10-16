/**
 * A content repository's line in the queue (39b, epic 39 D2): reindexes and
 * git syncs of one repository run one at a time, first come first served
 * (interactive ahead of batch), across every process — and `/jobs` shows
 * who holds it and who waits.
 *
 * ## Lock order, and why this cannot deadlock
 *
 * Three locks touch a repository, always taken in this order:
 *
 * 1. **the `repo:` slot** (this module) — reindex and git-sync jobs only;
 * 2. **the sync lock** (`instance/lock.ts`) — syncs only, and it never
 *    waits: a second sync is `LockBusyError` / `busy`;
 * 3. **the write lock** (34-D6) — every write, the merge, every rebuild;
 *    waits at most `DISCONTENT_WRITE_LOCK_TIMEOUT_MS` (30 s; a sync's merge
 *    60 s), then `busy`.
 *
 * Nothing that holds a later lock ever waits for an earlier one: a write
 * never takes the slot or the sync lock, and the slot is taken only at the
 * outermost level. The one place a reindex job can be asked for *inside*
 * the write lock — the `/git` page's pull, merge and checkout call
 * `rebuildAllIndexes` in their locked scope — skips the slot
 * (`currentWriteId()`): that caller already holds the lock every rebuild
 * needs, and waiting there for a sync that is itself waiting for the write
 * lock would be the deadlock. A reindex inside a sync (28-D12: the merge's
 * rebuild) is the sync's own `reindex.<type>` steps, never a second job,
 * and a job started inside a held slot passes through it (`withResource`'s
 * re-entrancy) — only while the slot is held (`queue.ts`, M1).
 *
 * ## How long anything waits (39b review, M2)
 *
 * Every holder is bounded: a rebuild by its write-lock wait plus ~1–5 s; a
 * sync by the ssh preflight (30 s), the fetch and push (each cut off after
 * `SYNC_NETWORK_IDLE_MS` without a word from the remote, and over ssh after
 * a minute of unanswered keepalives — `curation/sync.ts`), the merge's 60 s
 * lock wait, and annex's own 30-minute cap on media. That last one is long,
 * so a **person's or a script's rebuild does not wait it out**: it leaves
 * the line after `REINDEX_QUEUE_WAIT_MS` (30 s, the write lock's wait before
 * 39b) and answers `busy`, as a rebuild behind a long write always has. The
 * instance's own rebuild (start, a foreign HEAD move) runs in the
 * background and waits up to `REINDEX_INSTANCE_QUEUE_WAIT_MS`.
 */
import { currentWriteId } from "@discontent/cms/git/writeLock";
import { CurationError } from "../curation/errors";
import type { JobContext } from "./context";
import { QueueTimeoutError, repoResource, withResource } from "./queue";

/** A person's or a script's rebuild: then `busy` (39b review, M2). */
export const REINDEX_QUEUE_WAIT_MS = 30_000;
/** The instance's own, background rebuild. */
export const REINDEX_INSTANCE_QUEUE_WAIT_MS = 15 * 60_000;

/** `RECIPE_REINDEX_QUEUE_WAIT_MS` (tests), else `fallback`. */
export function reindexQueueWaitMs(fallback: number): number {
  const raw = Number(process.env.RECIPE_REINDEX_QUEUE_WAIT_MS?.trim());
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export async function withRepoSlot<T>(
  contentDirectory: string,
  job: JobContext,
  fn: () => Promise<T>,
  {
    maxWaitMs,
  }: {
    /** Leave the line after this long and answer `busy`; unbounded when absent. */
    maxWaitMs?: number;
  } = {},
): Promise<T> {
  if (currentWriteId() !== undefined) {
    job.log.info(
      "queue.skip",
      "inside the repository's write lock: the rebuild runs in that scope, not in line",
    );
    return fn();
  }
  try {
    return await withResource(
      repoResource(contentDirectory),
      { ...job, ...(maxWaitMs !== undefined ? { maxWaitMs } : {}) },
      () => fn(),
    );
  } catch (error) {
    if (error instanceof QueueTimeoutError) {
      throw new CurationError(
        "busy",
        `The repository is busy: ${error.message} Nothing was rebuilt; try again shortly.`,
      );
    }
    throw error;
  }
}
