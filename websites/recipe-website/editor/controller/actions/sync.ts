"use server";

import { auth } from "@/auth";
import { access } from "fs-extra";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import simpleGit, { SimpleGit, DefaultLogFields } from "simple-git";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  directoryIsGitRepo,
  commitContentChanges,
} from "@discontent/cms/git/commit";
import { rebuildRecipeIndex } from "./index";
import type {
  CommitLogPage,
  CommitSummary,
  SyncStatus,
} from "../../src/app/(editor)/(settings)/git/types";

const LOG_PAGE_SIZE = 30;
const MAX_DIFF_CHARS = 50_000;
const MERGE_COMMIT_MESSAGE = "Merge remote content";

function getGit(contentDirectory: string): SimpleGit {
  return simpleGit({ baseDir: contentDirectory });
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function mergeInProgress(contentDirectory: string): Promise<boolean> {
  return fileExists(join(contentDirectory, ".git", "MERGE_HEAD"));
}

/** Map a tracked path to a friendly label for the conflict resolver. */
function labelForPath(path: string): string {
  const recipeData = path.match(/^recipes\/data\/([^/]+)\/recipe\.json$/);
  if (recipeData) return `Recipe: ${recipeData[1]}`;
  const recipeUpload = path.match(/^recipes\/data\/([^/]+)\/(.+)$/);
  if (recipeUpload) {
    return `Upload (${recipeUpload[1]}): ${recipeUpload[2].split("/").pop()}`;
  }
  const upload = path.match(/^uploads\/(.+)$/);
  if (upload) return `Upload: ${upload[1]}`;
  return path;
}

function toSummary(entry: DefaultLogFields): CommitSummary {
  return {
    hash: entry.hash,
    message: entry.message,
    author_name: entry.author_name,
    date: entry.date,
  };
}

const EMPTY_STATUS: SyncStatus = {
  isRepo: false,
  detached: false,
  ahead: 0,
  behind: 0,
  remotes: [],
  branches: [],
  merge: { inProgress: false, conflicted: [], resolvedCount: 0 },
  dirty: false,
  dirtyCount: 0,
  log: [],
  hasMore: false,
};

async function readSyncStatus(contentDirectory: string): Promise<SyncStatus> {
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return EMPTY_STATUS;
  }

  const git = getGit(contentDirectory);
  const status = await git.status();
  const inMerge = await mergeInProgress(contentDirectory);
  const remotesRaw = await git.getRemotes(true);
  const remotes = remotesRaw.map((remote) => ({
    name: remote.name,
    fetchUrl: remote.refs.fetch,
  }));
  const branchSummary = await git.branchLocal();
  const branches = Object.values(branchSummary.branches).map((b) => ({
    name: b.name,
    current: b.current,
  }));

  let log: CommitSummary[] = [];
  let hasMore = false;
  try {
    const logResult = await git.log({ maxCount: LOG_PAGE_SIZE + 1 });
    hasMore = logResult.all.length > LOG_PAGE_SIZE;
    log = logResult.all.slice(0, LOG_PAGE_SIZE).map(toSummary);
  } catch {
    // Repository has no commits yet — leave the log empty.
  }

  const conflicted = status.conflicted.map((path) => ({
    path,
    label: labelForPath(path),
  }));

  const dirtyCount =
    status.created.length +
    status.deleted.length +
    status.modified.length +
    status.not_added.length +
    status.renamed.length;

  return {
    isRepo: true,
    branch: status.current ?? undefined,
    detached: status.detached,
    upstream: status.tracking ?? undefined,
    ahead: status.ahead,
    behind: status.behind,
    remotes,
    branches,
    merge: {
      inProgress: inMerge,
      conflicted,
      resolvedCount: inMerge ? status.staged.length : 0,
    },
    dirty: !inMerge && dirtyCount > 0,
    dirtyCount,
    log,
    hasMore,
  };
}

/** Read the cheap sync status for the page. Auth is enforced by the route. */
export async function getSyncStatus(): Promise<SyncStatus> {
  return readSyncStatus(getContentDirectory());
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

async function doPush(
  git: SimpleGit,
  {
    remote,
    branch,
    setUpstream,
  }: { remote?: string; branch?: string; setUpstream?: boolean },
): Promise<string | null> {
  try {
    const status = await git.status();
    if (status.tracking && !setUpstream) {
      await git.raw(["push"]);
    } else {
      const targetRemote = remote ?? "origin";
      const targetBranch = branch ?? status.current;
      if (!targetBranch) {
        return "Cannot determine the current branch to push.";
      }
      await git.raw(["push", "-u", targetRemote, targetBranch]);
    }
    return null;
  } catch (e) {
    const message = normalizeError(e);
    if (/rejected|non-fast-forward|fetch first/i.test(message)) {
      return "Push rejected — the remote has commits you don't have. Pull first to merge, then push.";
    }
    return message;
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
    const error = await doPush(git, { remote });
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
        const error = await doPush(git, { remote });
        if (error) return error;
        break;
      }
      case "pushSetUpstream": {
        const error = await doPush(git, { remote, setUpstream: true });
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
    const diff = String(await getGit(contentDirectory).show([hash]));
    if (diff.length > MAX_DIFF_CHARS) {
      return `${diff.slice(0, MAX_DIFF_CHARS)}\n\n… diff truncated …`;
    }
    return diff;
  } catch (e) {
    return normalizeError(e);
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
    const logResult = await getGit(contentDirectory).log({
      maxCount: LOG_PAGE_SIZE + 1,
      "--skip": offset,
    });
    return {
      commits: logResult.all.slice(0, LOG_PAGE_SIZE).map(toSummary),
      hasMore: logResult.all.length > LOG_PAGE_SIZE,
    };
  } catch {
    return { commits: [], hasMore: false };
  }
}
