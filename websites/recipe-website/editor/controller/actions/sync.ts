"use server";

/**
 * The `/git` page's server actions.
 *
 * Since 23d the `simple-git` reads and the push live in
 * `controller/curation/git.ts`, which is plain Node and therefore reachable
 * from a route handler, the CLI and the MCP registry (T22). What stays here is
 * what only a *page* needs: the `auth()` gate, `revalidatePath("/git")`, and
 * the fetch/pull/sync/merge/conflict flows, which are interactive by nature
 * (D22). Since 27b agents have their own fetch and pull (`gitFetch`,
 * `gitPull`), which never leave a merge half-done; resolving a conflict stays
 * the page's, because that is a person's job.
 *
 * Every path below that moves the tree rebuilds **every** index
 * (`rebuildAllIndexes`, epic-27 D2). They used to rebuild recipes and featured
 * only, which left groups, term records and pages describing the tree from
 * before the pull.
 *
 * Since 34d (epic 34 D6) every action that writes the work tree, the index or
 * HEAD holds the repository's write lock together with its rebuild — see
 * `locked` — and network (fetch, push) stays outside it.
 *
 * The wrappers below are deliberately shape-preserving: `getCommitDiff` still
 * answers with its error *as the diff string* and `getCommitLogPage` still
 * swallows failures into an empty page, because the components render those
 * values directly and `git.spec.ts` is the gate that says so.
 */
import { isMirror, mirrorRefusal } from "recipe-website-common/config/role";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import simpleGit, { SimpleGit } from "simple-git";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  directoryIsGitRepo,
  commitContentChanges,
  flushPendingIndex,
} from "@discontent/cms/git/commit";
import {
  RepositoryBusyError,
  withWriteLock,
} from "@discontent/cms/git/writeLock";
import { readContext } from "../apiContext";
import type { CurationContext } from "../curation/context";
import { CurationError } from "../curation/errors";
import {
  gitLog,
  gitPush,
  gitShow,
  gitStatus,
  indexFreshness,
  mergeInProgress,
} from "../curation/git";
import { rebuildAllIndexes } from "./index";
import type {
  CommitLogPage,
  SyncStatus,
} from "../../src/app/(editor)/(settings)/git/types";

const LOG_PAGE_SIZE = 30;
const MERGE_COMMIT_MESSAGE = "Merge remote content";

function getGit(contentDirectory: string): SimpleGit {
  return simpleGit({ baseDir: contentDirectory });
}

/**
 * The curation context these actions read with.
 *
 * No `author`: the two actions that commit (`commitMerge`,
 * `commitWorkingChanges`) pass the session's email themselves, and everything
 * delegated here either reads or pushes.
 */
function readCtx(): CurationContext {
  return readContext();
}

function normalizeError(e: unknown): string {
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  return String(e);
}

/** Read the cheap sync status for the page. Auth is enforced by the route. */
export async function getSyncStatus(): Promise<SyncStatus> {
  return gitStatus(readCtx());
}

/**
 * Whether the indexes describe HEAD, for the stale-index banner (27b/D3).
 *
 * Its own read rather than `getSyncStatus().indexStale` because Settings →
 * Maintenance shows the banner too, and has no use for the rest of a status.
 */
export async function getIndexFreshness() {
  return indexFreshness(readCtx());
}

/**
 * The banner's one button: rebuild every index, which also stamps HEAD.
 *
 * Auth-gated here because it is a form action a page renders; the two pages
 * that show it are revalidated so the banner goes away on the next render.
 */
export async function rebuildIndexesAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.email) return;
  try {
    await rebuildAllIndexes();
  } catch (error) {
    /*
     * A form action with no message slot: a write holding the lock past the
     * wait (34d, `busy`) leaves the banner up for another click, rather than
     * throwing the page into its error boundary.
     */
    if (!(error instanceof RepositoryBusyError)) throw error;
    console.warn(`[git] rebuild skipped: ${error.message}`);
    return;
  }
  revalidatePath("/git");
  revalidatePath("/settings/maintenance");
}

async function doFetch(git: SimpleGit, remote?: string): Promise<void> {
  const args = ["fetch", "--prune"];
  if (remote) args.push(remote);
  await git.raw(args);
}

/**
 * Run `fn` under the content repository's write lock (34d, epic 34 D6): every
 * page action below that writes the work tree, the index or HEAD — the merge
 * half of a pull, a conflict resolution, the merge commit, an abort, "Commit
 * working changes" — together with the rebuild that follows it. A write in
 * another process (the CLI, MCP, a script) waits for it rather than landing
 * files mid-merge; one that waits too long gets `busy`, and so does this
 * action, whose message then names the holder.
 */
function locked<T>(
  contentDirectory: string,
  op: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withWriteLock(contentDirectory, op, fn);
}

/**
 * `git pull --no-rebase --no-edit`, in its two halves (34d): the fetch over
 * the network, unlocked, then the merge and the rebuild under the write lock.
 *
 * `--no-rebase` was not a preference, it is what made the old single `git
 * pull` deterministic. A bare `git pull` consults the *user's* `pull.rebase`:
 * unset, git ≥2.34 refuses divergent branches outright ("you need to specify
 * how to reconcile them"); set to true, it rebases. Either way the merge this
 * UI is built around never happens — `mergeInProgress` stays false, the
 * conflict resolver never appears, and `merge --abort` has nothing to abort.
 * Fetch-then-`merge` keeps that (it passed locally only because the
 * developer's global config happened to say `pull.rebase=false`; in a
 * container with no git config, three conflict-resolution tests failed on an
 * empty page). The upstream case merges `@{upstream}`; a named remote without
 * one merges what `fetch <remote> <branch>` left in `FETCH_HEAD`, as `git
 * pull <remote> <branch>` does.
 *
 * Unlike the agents' `gitPull`, a conflict is left in place for the page's
 * resolver — the lock is released with `MERGE_HEAD` present, and every engine
 * write refuses (`dirty_tree`) until it is committed or aborted.
 */
async function doPull(
  git: SimpleGit,
  contentDirectory: string,
  remote?: string,
): Promise<{ conflict: boolean; error?: string }> {
  let target: string;
  try {
    const status = await git.status();
    if (status.tracking) {
      await git.raw(["fetch", "--prune"]);
      target = "@{upstream}";
    } else if (remote && status.current) {
      await git.raw(["fetch", remote, status.current]);
      target = "FETCH_HEAD";
    } else {
      return {
        conflict: false,
        error:
          "No upstream configured. Choose a remote and use “Set upstream & push” first.",
      };
    }
  } catch (e) {
    return { conflict: false, error: normalizeError(e) };
  }

  return locked(contentDirectory, "git pull (Git page)", async () => {
    try {
      /* Committed paths the shared index is behind on would block the merge. */
      await flushPendingIndex(contentDirectory);
      await git.raw(["merge", "--no-edit", target]);
      /*
       * A conflicted merge can *resolve*: git prints the CONFLICT lines on
       * stdout and exits 1, and `simple-git`'s `raw` only rejects on stderr
       * (epic-27 T3). So ask the repository, or the rebuild below runs over
       * files full of conflict markers.
       */
      if (await mergeInProgress(contentDirectory)) return { conflict: true };
    } catch (e) {
      const inMerge = await mergeInProgress(contentDirectory);
      const status = await git.status().catch(() => null);
      if (inMerge || (status && status.conflicted.length > 0)) {
        return { conflict: true };
      }
      return { conflict: false, error: normalizeError(e) };
    }
    await rebuildAllIndexes();
    return { conflict: false };
  });
}

/**
 * The push seat, as a string-or-null the form action renders.
 *
 * `gitPush` owns the contract now (D22), including the "Push rejected" sentence
 * — which arrives as a `git_conflict` `CurationError` whose message is that
 * same sentence, so the panel's copy is unchanged.
 */
async function doPush({
  remote,
  setUpstream,
}: {
  remote?: string;
  setUpstream?: boolean;
}): Promise<string | null> {
  try {
    await gitPush(readCtx(), { remote, setUpstream });
    return null;
  } catch (e) {
    return e instanceof CurationError ? e.message : normalizeError(e);
  }
}

async function doSync(
  git: SimpleGit,
  contentDirectory: string,
  remote?: string,
): Promise<string | null> {
  try {
    await doFetch(git, remote);
  } catch (e) {
    return normalizeError(e);
  }

  let status = await git.status();
  if (!status.tracking && !remote) {
    return "No upstream configured. Choose a remote and use “Set upstream & push”.";
  }

  if (status.behind > 0 || (!status.tracking && remote)) {
    /* The merge rebuilds every index, under the same lock. */
    const result = await doPull(git, contentDirectory, remote);
    if (result.error) return result.error;
    if (result.conflict) {
      // Stop here — the conflict resolver renders on reload.
      revalidatePath("/git");
      return null;
    }
  }

  if (await mergeInProgress(contentDirectory)) {
    return null;
  }

  status = await git.status();
  if (status.ahead > 0 || !status.tracking) {
    const error = await doPush({ remote });
    if (error) return error;
  }
  return null;
}

/** Primary sync entry point. Reads `command` and `remote` from the form. */
export async function remoteCommandAction(
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }

  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return "Content directory is not a Git repository.";
  }

  const command = formData.get("command");
  const remote = (formData.get("remote") as string) || undefined;
  const git = getGit(contentDirectory);

  /*
   * A mirror (epic 28, D1/D2) fetches and fast-forwards; it never pushes and
   * never merges — the workstation does both. The page hides these buttons;
   * this is the guard.
   */
  if (isMirror()) {
    if (
      command === "push" ||
      command === "pushSetUpstream" ||
      command === "sync"
    ) {
      return mirrorRefusal("pushing and syncing");
    }
    if (command === "pull" && (await git.status()).ahead > 0) {
      return mirrorRefusal("merging this mirror's own changes");
    }
  }

  try {
    switch (command) {
      case "fetch":
        await doFetch(git, remote);
        break;
      case "pull": {
        const result = await doPull(git, contentDirectory, remote);
        if (result.error) return result.error;
        if (result.conflict) {
          revalidatePath("/git");
          return null;
        }
        break;
      }
      case "push": {
        const error = await doPush({ remote });
        if (error) return error;
        break;
      }
      case "pushSetUpstream": {
        const error = await doPush({ remote, setUpstream: true });
        if (error) return error;
        break;
      }
      case "sync": {
        const error = await doSync(git, contentDirectory, remote);
        if (error) return error;
        break;
      }
      default:
        return `Invalid command: ${String(command)}`;
    }
  } catch (e) {
    return normalizeError(e);
  }

  revalidatePath("/git");
  return null;
}

export async function resolveConflict(
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }

  const path = formData.get("path");
  const choice = formData.get("choice");
  if (typeof path !== "string" || !path) {
    return "Invalid file path";
  }
  if (choice !== "ours" && choice !== "theirs") {
    return "Invalid resolution choice";
  }

  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return "Content directory is not a Git repository.";
  }

  try {
    const git = getGit(contentDirectory);
    await locked(contentDirectory, `resolve conflict: ${path}`, async () => {
      await git.raw(["checkout", `--${choice}`, "--", path]);
      await git.add(path);
    });
  } catch (e) {
    return normalizeError(e);
  }

  revalidatePath("/git");
  return null;
}

export async function commitMerge(
  _previousState: string | null,
  _formData: FormData,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }
  const { email } = session.user;

  const contentDirectory = getContentDirectory();
  const git = getGit(contentDirectory);
  let refusal: string | null = null;
  try {
    /*
     * A raw `git commit` through the shared index — a merge commit needs
     * `MERGE_HEAD`, which the engine's private-index commits refuse — so it
     * and the rebuild after it hold the write lock (34c's "For 34d").
     */
    refusal = await locked(contentDirectory, "commit merge", async () => {
      if (!(await mergeInProgress(contentDirectory))) {
        return "No merge in progress.";
      }
      const status = await git.status();
      if (status.conflicted.length > 0) {
        return "Resolve all conflicts before completing the merge.";
      }
      await git.commit(MERGE_COMMIT_MESSAGE, {
        "--author": `${email} <${email}>`,
      });
      await rebuildAllIndexes();
      return null;
    });
  } catch (e) {
    return normalizeError(e);
  }
  if (refusal) return refusal;

  revalidatePath("/git");
  return null;
}

export async function abortMerge(
  _previousState: string | null,
  _formData: FormData,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }

  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return "Content directory is not a Git repository.";
  }

  try {
    await locked(contentDirectory, "abort merge", async () => {
      await getGit(contentDirectory).raw(["merge", "--abort"]);
      await rebuildAllIndexes();
    });
  } catch (e) {
    return normalizeError(e);
  }

  revalidatePath("/git");
  return null;
}

export async function commitWorkingChanges(
  _previousState: string | null,
  _formData: FormData,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }
  const { email } = session.user;

  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return "Content directory is not a Git repository.";
  }

  try {
    /*
     * The commit takes the lock itself; holding it here too keeps the rebuild
     * in the same scope, so it indexes exactly the tree that was committed.
     */
    await locked(contentDirectory, "commit working changes", async () => {
      await commitContentChanges(
        "Commit working changes",
        { name: email, email },
        undefined,
        contentDirectory,
      );
      await rebuildAllIndexes();
    });
  } catch (e) {
    return normalizeError(e);
  }

  revalidatePath("/git");
  return null;
}

export async function getCommitDiff(hash: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
    return "Invalid commit hash";
  }

  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return "Content directory is not a Git repository.";
  }

  try {
    /* Truncation, marker included, is `gitShow`'s (D19/D22). */
    return (await gitShow({ contentDirectory }, hash)).diff;
  } catch (e) {
    return e instanceof CurationError ? e.message : normalizeError(e);
  }
}

export async function getCommitLogPage(offset: number): Promise<CommitLogPage> {
  const session = await auth();
  if (!session?.user?.email) {
    return { commits: [], hasMore: false };
  }

  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return { commits: [], hasMore: false };
  }

  try {
    const { commits, hasMore } = await gitLog(
      { contentDirectory },
      { limit: LOG_PAGE_SIZE, offset },
    );
    /*
     * The entries' `files` are dropped rather than forwarded: the log list does
     * not render them, and they would ride every "Load more" over the RSC wire.
     */
    return {
      commits: commits.map(({ hash, message, author_name, date }) => ({
        hash,
        message,
        author_name,
        date,
      })),
      hasMore,
    };
  } catch {
    return { commits: [], hasMore: false };
  }
}
