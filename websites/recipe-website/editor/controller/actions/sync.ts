"use server";

/**
 * The `/git` page's server actions.
 *
 * Since 23d the `simple-git` reads and the push live in
 * `controller/curation/git.ts`, which is plain Node and therefore reachable
 * from a route handler, the CLI and the MCP registry (T22). What stays here is
 * what only a *page* needs: the `auth()` gate, `revalidatePath("/git")`, and
 * the fetch/pull/sync/merge/conflict flows, which are interactive by nature and
 * have no agent-facing seat (D22).
 *
 * The wrappers below are deliberately shape-preserving: `getCommitDiff` still
 * answers with its error *as the diff string* and `getCommitLogPage` still
 * swallows failures into an empty page, because the components render those
 * values directly and `git.spec.ts` is the gate that says so.
 */
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import simpleGit, { SimpleGit } from "simple-git";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  directoryIsGitRepo,
  commitContentChanges,
} from "@discontent/cms/git/commit";
import { readContext } from "../apiContext";
import type { CurationContext } from "../curation/context";
import { CurationError } from "../curation/errors";
import {
  gitLog,
  gitPush,
  gitShow,
  gitStatus,
  mergeInProgress,
} from "../curation/git";
import { rebuildRecipeIndex } from "./index";
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

async function doFetch(git: SimpleGit, remote?: string): Promise<void> {
  const args = ["fetch", "--prune"];
  if (remote) args.push(remote);
  await git.raw(args);
}

async function doPull(
  git: SimpleGit,
  contentDirectory: string,
  remote?: string,
): Promise<{ conflict: boolean; error?: string }> {
  try {
    const status = await git.status();
    // `--no-rebase` is not a preference, it is what makes this deterministic.
    // A bare `git pull` consults the *user's* `pull.rebase`: unset, git ≥2.34
    // refuses divergent branches outright ("you need to specify how to reconcile
    // them"); set to true, it rebases. Either way the merge this UI is built
    // around never happens — `mergeInProgress` stays false, the conflict
    // resolver never appears, and `merge --abort` has nothing to abort.
    //
    // It was passing locally only because the developer's global config happened
    // to say `pull.rebase=false`; in a container with no git config, three
    // conflict-resolution tests failed on an empty page.
    if (status.tracking) {
      await git.raw(["pull", "--no-rebase", "--no-edit"]);
    } else if (remote && status.current) {
      await git.raw([
        "pull",
        "--no-rebase",
        "--no-edit",
        remote,
        status.current,
      ]);
    } else {
      return {
        conflict: false,
        error:
          "No upstream configured. Choose a remote and use “Set upstream & push” first.",
      };
    }
    return { conflict: false };
  } catch (e) {
    const inMerge = await mergeInProgress(contentDirectory);
    const status = await git.status().catch(() => null);
    if (inMerge || (status && status.conflicted.length > 0)) {
      return { conflict: true };
    }
    return { conflict: false, error: normalizeError(e) };
  }
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
    const result = await doPull(git, contentDirectory, remote);
    if (result.error) return result.error;
    if (result.conflict) {
      // Stop here — the conflict resolver renders on reload.
      revalidatePath("/git");
      return null;
    }
    await rebuildRecipeIndex();
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
        await rebuildRecipeIndex();
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
    await git.raw(["checkout", `--${choice}`, "--", path]);
    await git.add(path);
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
  if (!(await mergeInProgress(contentDirectory))) {
    return "No merge in progress.";
  }

  const git = getGit(contentDirectory);
  const status = await git.status();
  if (status.conflicted.length > 0) {
    return "Resolve all conflicts before completing the merge.";
  }

  try {
    await git.commit(MERGE_COMMIT_MESSAGE, {
      "--author": `${email} <${email}>`,
    });
  } catch (e) {
    return normalizeError(e);
  }

  await rebuildRecipeIndex();
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
    await getGit(contentDirectory).raw(["merge", "--abort"]);
  } catch (e) {
    return normalizeError(e);
  }

  await rebuildRecipeIndex();
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
    await commitContentChanges("Commit working changes", {
      name: email,
      email,
    });
  } catch (e) {
    return normalizeError(e);
  }

  await rebuildRecipeIndex();
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
