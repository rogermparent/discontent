/**
 * Which commit the indexes were last rebuilt from.
 *
 * The indexes are derived from the data files, and nothing used to record
 * *which* data files: a push that landed on a non-bare content repository
 * (`receive.denyCurrentBranch updateInstead` — the Pi editor) moved HEAD and
 * the working tree underneath a running editor, which went on serving the old
 * indexes with no sign anything had happened. The stamp is that sign. A full
 * rebuild writes the HEAD it indexed; `readIndexFreshness` compares it with the
 * HEAD there is now.
 *
 * ## Where it lives
 *
 * Inside the repository's git directory (`git rev-parse --git-path`), not in the
 * content tree. Git never tracks anything there, so no content repository needs
 * a `.gitignore` line for it, and a fresh clone — which has no indexes either —
 * correctly reads as stale.
 *
 * ## Why a commit advances it
 *
 * Every write the engine makes is a commit, and every one of those keeps the
 * indexes current incrementally. So a commit made *through the engine* moves
 * HEAD without making the indexes stale, and `commitChanges` advances the stamp
 * — but only when the stamp named the HEAD the commit was made on top of. A
 * stamp that was already behind stays behind: an incremental write does not
 * repair a corpus that changed underneath it.
 */
import { access, readFile, writeFile } from "fs/promises";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";

const STAMP_NAME = "discontent-indexed-head";

/** `commit.ts`'s check, repeated here because that module imports this one. */
async function directoryIsGitRepo(contentDirectory: string): Promise<boolean> {
  try {
    await access(join(contentDirectory, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function stampPath(contentDirectory: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-path",
      STAMP_NAME,
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

/** HEAD's commit, or `null` for a directory that is not a repo or has none. */
export async function readHead(
  contentDirectory: string,
): Promise<string | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  try {
    return String(
      await simpleGit({ baseDir: contentDirectory }).raw([
        "rev-parse",
        "--verify",
        "--quiet",
        "HEAD",
      ]),
    ).trim();
  } catch {
    /* An unborn branch: nothing has been committed yet. */
    return null;
  }
}

/** The commit the last full rebuild indexed, or `null` if none was recorded. */
export async function readIndexedHead(
  contentDirectory: string,
): Promise<string | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  try {
    const value = (
      await readFile(await stampPath(contentDirectory), "utf8")
    ).trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Record that the indexes now reflect `head` (HEAD when omitted).
 *
 * A no-op outside a repository and on an unborn branch: there is no commit to
 * name, and an absent stamp already reads as "unknown".
 */
export async function writeIndexedHead(
  contentDirectory: string,
  head?: string | null,
): Promise<void> {
  const value = head ?? (await readHead(contentDirectory));
  if (!value) return;
  await writeFile(await stampPath(contentDirectory), `${value}\n`);
}

/**
 * After a commit made on top of `previousHead`, carry a current stamp forward.
 *
 * Fire-and-forget in spirit: the commit has landed, and failing a write because
 * a bookkeeping file could not be written would be the wrong trade. A stamp
 * left behind only means a "Rebuild indexes" banner that a rebuild clears.
 */
export async function advanceIndexedHead(
  contentDirectory: string,
  previousHead: string | null,
): Promise<void> {
  if (!previousHead) return;
  try {
    if ((await readIndexedHead(contentDirectory)) !== previousHead) return;
    await writeIndexedHead(contentDirectory);
  } catch {
    /* See above: never fail a write that already committed. */
  }
}

export interface IndexFreshness {
  /** The commit the last full rebuild indexed; `null` if none was recorded. */
  indexedHead: string | null;
  /** HEAD now; `null` outside a repository or on an unborn branch. */
  head: string | null;
  /**
   * The indexes may not describe the working tree: HEAD moved without a full
   * rebuild (a pull, a push received into this repository, a checkout from a
   * shell), or no rebuild was ever recorded. Always false without a HEAD.
   */
  stale: boolean;
}

export async function readIndexFreshness(
  contentDirectory: string,
): Promise<IndexFreshness> {
  const head = await readHead(contentDirectory);
  const indexedHead = head ? await readIndexedHead(contentDirectory) : null;
  return { indexedHead, head, stale: head !== null && indexedHead !== head };
}
