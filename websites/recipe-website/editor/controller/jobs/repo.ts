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
 * re-entrancy). Every holder is bounded: a rebuild by its lock wait plus
 * ~1–5 s, a sync by its 60 s lock wait plus the network.
 */
import { currentWriteId } from "@discontent/cms/git/writeLock";
import type { JobContext } from "./context";
import { repoResource, withResource } from "./queue";

export async function withRepoSlot<T>(
  contentDirectory: string,
  job: JobContext,
  fn: () => Promise<T>,
): Promise<T> {
  if (currentWriteId() !== undefined) {
    job.log.info(
      "queue.skip",
      "inside the repository's write lock: the rebuild runs in that scope, not in line",
    );
    return fn();
  }
  return withResource(repoResource(contentDirectory), job, () => fn());
}
