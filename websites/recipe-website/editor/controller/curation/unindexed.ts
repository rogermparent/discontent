/**
 * HEAD moves that no index reads (35c review).
 *
 * The shopping list (`shopping/`) and the on-hand inventory (`inventory/`)
 * are committed files that are not content types: no index, no aggregate, no
 * page cache holds them, and their signed-in pages read them per request.
 * Yet a commit to them that arrives from elsewhere — the Pi's ticks pulled by
 * the workstation's sync, or the workstation's pushed to the Pi — moves HEAD
 * past the index stamp, which reads as "foreign" and costs a full reindex
 * and a whole-site revalidate (epic 28's D12) for a tick.
 *
 * `changesOnlyUnindexed` answers whether every path that differs between two
 * commits is under one of those two directories. When it is, the indexes
 * still describe the new HEAD and the stamp can simply be moved to it. Any
 * doubt — no recorded stamp, a failed diff, one other path — answers false
 * and the caller rebuilds as before.
 */
import simpleGit from "simple-git";
import {
  readIndexFreshness,
  writeIndexedHead,
} from "@discontent/cms/git/indexStamp";
import { withWriteLock } from "@discontent/cms/git/writeLock";

/** Top-level directories whose files no index reads. */
export const UNINDEXED_DIRECTORIES = ["shopping", "inventory"] as const;

function isUnindexed(path: string): boolean {
  return UNINDEXED_DIRECTORIES.some((directory) =>
    path.startsWith(`${directory}/`),
  );
}

export async function changesOnlyUnindexed(
  contentDirectory: string,
  from: string | null,
  to: string | null,
): Promise<boolean> {
  if (!from || !to) return false;
  if (from === to) return true;
  try {
    const out = await simpleGit({ baseDir: contentDirectory }).raw([
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      from,
      to,
    ]);
    return String(out).split("\0").filter(Boolean).every(isUnindexed);
  } catch {
    return false;
  }
}

/**
 * If the indexes are stale only by commits that touch unindexed files, move
 * the stamp to HEAD and answer true: there is nothing to rebuild and nothing
 * to revalidate. Under the write lock, as a rebuild is, so no write lands
 * between the check and the stamp.
 */
export async function advanceStampPastUnindexed(
  contentDirectory: string,
): Promise<boolean> {
  return withWriteLock(contentDirectory, "index stamp: unindexed", async () => {
    const { stale, indexedHead, head } =
      await readIndexFreshness(contentDirectory);
    if (!stale) return false;
    if (!(await changesOnlyUnindexed(contentDirectory, indexedHead, head))) {
      return false;
    }
    await writeIndexedHead(contentDirectory, head);
    return true;
  });
}
