/**
 * A rebuild button's index rebuild, under the content repository's write lock
 * (epic 34, 34d).
 *
 * `rebuildIndex` collects every data file, then replaces the index. A write
 * landing in between — another process's create, say — would be in neither
 * the collected set nor the replaced index, and its entry would vanish until
 * the next rebuild. The all-types rebuild (`curation/reindex.ts`) already
 * locks; Settings → Maintenance's per-type buttons come through here.
 *
 * Kept in the site rather than inside the engine's `rebuildIndex`, whose other
 * callers are build-time (fixture indexes, the Pi deploy's index build) and a
 * lock there would change what a pinned engine module does for all of them.
 *
 * Those buttons are plain form actions with no message slot, so a `busy`
 * (another write held the lock past the wait) answers `false` and is logged,
 * rather than throwing the page into its error boundary; the button can be
 * pressed again.
 */
import {
  RepositoryBusyError,
  withWriteLock,
} from "@discontent/cms/git/writeLock";

export async function lockedRebuild(
  contentDirectory: string,
  op: string,
  rebuild: () => Promise<void>,
): Promise<boolean> {
  try {
    await withWriteLock(contentDirectory, op, rebuild);
    return true;
  } catch (error) {
    if (!(error instanceof RepositoryBusyError)) throw error;
    console.warn(`[maintenance] ${op} skipped: ${error.message}`);
    return false;
  }
}
