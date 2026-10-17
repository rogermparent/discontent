/**
 * Commit a content write (epic 34, D7).
 *
 * Every write commits only the paths it touched, through a **private index**,
 * landing with a **compare-and-swap on HEAD**. Until epic 34 it was
 * `git add <paths>` and a bare `git commit` through the shared index, so a
 * file someone had staged by hand rode along, and a workstation sync's
 * `git status`/`merge` holding `index.lock` failed the write (epic 33's ninth).
 *
 * Under the write lock (`writeLock.ts`, D6), one commit at a time per hold
 * (`serialInHold`), each with its own private index:
 *
 * 1. Copy the shared index to `<gitdir>/discontent-index-<id>` and, with
 *    `GIT_INDEX_FILE` on it, `read-tree -m HEAD`: foreign staged entries drop
 *    out, stat info stays (so annexed files are not re-hashed). An unborn
 *    branch starts from `read-tree --empty`.
 * 2. Drop paths that are neither on disk nor tracked (a delete of something
 *    never committed), then `add -A -- <paths>` (`.` when none were given).
 *    Pathspecs are `:(literal)`, and atomic-write temp files are dropped
 *    from the private index after it, so a dead writer's leftover never
 *    rides along.
 * 3. `write-tree`; no commit when it equals HEAD's tree.
 * 4. `commit-tree` with the author from the environment (`--author`'s
 *    semantics: the committer stays git's configured identity; it honours
 *    `commit.gpgSign` itself), check the lock is still ours, then
 *    `update-ref -m "discontent <writeId>: <subject>" HEAD <new> <old>`.
 *    `HEAD` itself, so a detached HEAD moves and a branch moves through it.
 *    The index stamp advances at once — before step 6, so a slow refresh
 *    cannot make the instance's foreign-HEAD check read our commit as foreign.
 * 5. If HEAD moved underneath (the CAS failed): when what moved does not
 *    overlap these paths — or overlaps them with exactly the content this
 *    write would commit — redo on the new HEAD (up to three times; identical
 *    content then ends as the no-change skip); otherwise `CommitConflictError`.
 * 6. Bring the shared index up to the commit for the paths it changed
 *    (`reset -q -- <paths>`), retrying while `index.lock` is held for up to
 *    `DISCONTENT_INDEX_REFRESH_MS` (10 s) — at once, without retrying, when a
 *    refresh is already pending or the lock is older than 5 s. Failing that,
 *    the paths go to `<gitdir>/discontent-index-pending`, applied by the next
 *    locked commit, by `flushPendingIndex`, and by a background retry. The
 *    write never fails here. **Until applied, those paths show as changed in
 *    `git status`, and a plain `git commit` (without `-a`) of anything else
 *    would write their old versions back** — `readPendingIndex` names them.
 * 7. The private index is removed in `finally`; the lock sweeps any a dead
 *    writer left.
 *
 * Refuses while a merge, cherry-pick, revert or rebase is in progress
 * (`MergeInProgressError`). Any other git failure is a `CommitFailedError`
 * carrying the write id and its paths.
 *
 * **Hooks do not run.** `commit-tree` + `update-ref` skip `pre-commit`,
 * `commit-msg` and `post-commit`. The content repositories' only hooks are
 * git-annex's, and its `pre-commit` (`git annex pre-commit .`) fixes up
 * *locked* (symlinked) annexed files; the engine's large files are unlocked
 * (smudge/clean, epic 28 D9), which `git add` annexes through the clean
 * filter — `GIT_INDEX_FILE` and all (`test/annex.test.ts`). `gc --auto`
 * no longer runs after each write either; fetch and merge still run it.
 */
import {
  access,
  appendFile,
  copyFile,
  lstat,
  readFile,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { getContentDirectory } from "../fs/getContentDirectory";
import { ulid } from "../util/ulid";
import { advanceIndexedHead } from "./indexStamp";
import {
  directoryIsGitRepo,
  GitCommandError,
  gitDirectory,
  runGit,
} from "./run";
import {
  ATOMIC_TEMP,
  currentWriteId,
  outsideWriteLock,
  serialInHold,
  withWriteLock,
  writeLockStillHeld,
} from "./writeLock";

export { directoryIsGitRepo };

const PENDING_NAME = "discontent-index-pending";
const CAS_RETRIES = 3;
/** An `index.lock` older than this is not a command that will finish soon. */
const OLD_INDEX_LOCK_MS = 5_000;

/** A path as a pathspec that means exactly that path, whatever it contains. */
const literal = (path: string) => `:(literal)${path}`;

/*
 * No `:(exclude)` pathspec to keep temp files out: git 2.55, given one with a
 * `GIT_INDEX_FILE` path past ~60 bytes, silently matches nothing — `add`
 * stages nothing and `ls-files` lists nothing (34c, Traps). `stagePaths`
 * drops temp files from the private index after `add` instead.
 */
function pathspecs(paths: string[] | null): string[] {
  return (paths ?? ["."]).map(literal);
}

/** The markers of git operations a write must not land in the middle of. */
const IN_PROGRESS: [marker: string, operation: string][] = [
  ["MERGE_HEAD", "merge"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"],
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase (or am)"],
];

/**
 * A merge — or a cherry-pick, revert or rebase — is underway; the site
 * answers `dirty_tree`. The name is the common case's.
 */
export class MergeInProgressError extends Error {
  constructor(
    readonly operation = "merge",
    readonly marker = "MERGE_HEAD",
  ) {
    super(
      `The content repository is mid-${operation} (${marker} exists) — finish or abort it in /git first.`,
    );
    this.name = "MergeInProgressError";
  }
}

/** HEAD moved underneath this write, over the same paths; the site answers `git_conflict`. */
export class CommitConflictError extends Error {
  constructor(
    readonly writeId: string,
    readonly touchedPaths: string[],
    readonly conflictingPaths: string[],
  ) {
    super(
      `Another commit changed ${conflictingPaths.slice(0, 5).join(", ")}${
        conflictingPaths.length > 5 ? ", …" : ""
      } while this write was committing; its files are on disk, uncommitted: ${touchedPaths.join(", ")}`,
    );
    this.name = "CommitConflictError";
  }
}

/** Any other git failure while committing. The write's files are on disk. */
export class CommitFailedError extends Error {
  constructor(
    readonly writeId: string,
    readonly touchedPaths: string[],
    readonly cause: unknown,
  ) {
    super(
      `Commit failed (write ${writeId}): ${
        cause instanceof Error ? cause.message : String(cause)
      } — uncommitted: ${touchedPaths.join(", ")}`,
    );
    this.name = "CommitFailedError";
  }
}

/**
 * Test seam: runs once per attempt between `commit-tree` and the CAS, which is
 * the only way a test can move HEAD at exactly the wrong moment. Unset in
 * production.
 */
export const commitTestHooks: { beforeUpdateRef?: () => Promise<void> } = {};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function operationInProgress(
  gitDir: string,
): Promise<MergeInProgressError | null> {
  for (const [marker, operation] of IN_PROGRESS) {
    /* A runtime path: without the ignore comment Turbopack (Next 16.4)
       traces the whole project from it — getContentDirectory.ts says why. */
    if (await pathExists(join(/*turbopackIgnore: true*/ gitDir, marker))) {
      return new MergeInProgressError(operation, marker);
    }
  }
  return null;
}

/**
 * Refuse a write while a merge, cherry-pick, revert or rebase is underway. A
 * no-op outside a repository.
 */
export async function assertNoMergeInProgress(
  contentDirectory: string,
): Promise<void> {
  if (!(await directoryIsGitRepo(contentDirectory))) return;
  const refusal = await operationInProgress(
    await gitDirectory(contentDirectory),
  );
  if (refusal) throw refusal;
}

/**
 * Paths relative to the repository, `/`-separated, deduplicated; `null` for
 * "everything" (none given, or one that names the top).
 */
function normalizePaths(
  contentDirectory: string,
  paths: string[] | undefined,
): string[] | null {
  if (!paths || paths.length === 0) return null;
  const out = new Set<string>();
  for (const path of paths) {
    const rel = (isAbsolute(path) ? relative(contentDirectory, path) : path)
      .split(sep)
      .join("/")
      .replace(/^(\.\/)+/, "")
      .replace(/\/+$/, "");
    if (rel === "" || rel === ".") return null;
    out.add(rel);
  }
  return [...out];
}

/** git's `--cleanup=whitespace`, which `git commit -m` applies. */
function cleanMessage(message: string): string {
  const lines: string[] = [];
  for (const line of message.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.replace(/\s+$/, "");
    if (trimmed === "" && (lines.length === 0 || lines.at(-1) === "")) {
      continue;
    }
    lines.push(trimmed);
  }
  while (lines.at(-1) === "") lines.pop();
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

async function readHeadCommit(
  contentDirectory: string,
): Promise<string | null> {
  try {
    return (
      await runGit(contentDirectory, ["rev-parse", "--verify", "-q", "HEAD"])
    ).trim();
  } catch (error) {
    /* `--verify -q` exits 1, silently, on an unborn branch. */
    if (error instanceof GitCommandError && error.exitCode === 1) return null;
    throw error;
  }
}

function covers(path: string, other: string): boolean {
  return (
    path === other ||
    other.startsWith(`${path}/`) ||
    path.startsWith(`${other}/`)
  );
}

async function changedBetween(
  contentDirectory: string,
  from: string | null,
  to: string | null,
): Promise<string[]> {
  if (!to) return [];
  const out = from
    ? await runGit(contentDirectory, [
        "diff",
        "--name-only",
        "-z",
        "--no-renames",
        from,
        to,
      ])
    : await runGit(contentDirectory, [
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        to,
      ]);
  return out.split("\0").filter(Boolean);
}

/** Whether two trees (or commits) hold the same entries at `paths`. */
async function sameAt(
  contentDirectory: string,
  a: string,
  b: string,
  paths: string[],
): Promise<boolean> {
  const list = (rev: string) =>
    runGit(contentDirectory, [
      "ls-tree",
      "-r",
      "-z",
      rev,
      "--",
      ...paths.map(literal),
    ]);
  const [left, right] = await Promise.all([list(a), list(b)]);
  return left === right;
}

/** Retry `fn` while git reports a held `index.lock`, up to `timeoutMs`. */
async function retryIndexLock<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let delay = 25;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const locked =
        error instanceof GitCommandError && error.stderr.includes("index.lock");
      const now = Date.now();
      if (!locked || now >= deadline) throw error;
      await sleep(Math.min(delay * (0.5 + Math.random()), deadline - now));
      delay = Math.min(delay * 2, 250);
    }
  }
}

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(raw) && raw >= 0
    ? raw
    : fallback;
}

function resetArgs(paths: string[]): string[] {
  return ["reset", "-q", "--", ...pathspecs(paths)];
}

async function readPendingFile(gitDir: string): Promise<string[] | null> {
  try {
    const raw = await readFile(join(gitDir, PENDING_NAME), "utf8");
    return [...new Set(raw.split("\0").filter(Boolean))];
  } catch {
    return null;
  }
}

/**
 * The paths whose shared-index entries are behind HEAD because a commit could
 * not refresh them (step 6), or `[]`. While any are listed, `git status` shows
 * them as changed and a plain `git commit` of other staged work would revert
 * them — `git_status` and /git should say so (34d).
 */
export async function readPendingIndex(
  contentDirectory: string,
): Promise<string[]> {
  if (!(await directoryIsGitRepo(contentDirectory))) return [];
  return (await readPendingFile(await gitDirectory(contentDirectory))) ?? [];
}

/** Apply the pending shared-index refresh, if any. Must hold the lock. */
async function flushPendingLocked(
  contentDirectory: string,
  timeoutMs: number,
): Promise<boolean> {
  const gitDir = await gitDirectory(contentDirectory);
  const entries = await readPendingFile(gitDir);
  if (entries === null) return true;
  try {
    if (entries.length > 0) {
      await retryIndexLock(
        () => runGit(contentDirectory, resetArgs(entries)),
        timeoutMs,
      );
    }
  } catch {
    return false;
  }
  await rm(join(gitDir, PENDING_NAME), { force: true });
  return true;
}

/**
 * Bring the shared index up to HEAD for every path a commit could not refresh
 * (step 6). True when nothing is left pending. Takes the write lock; the site's
 * `requireCleanTree` calls it before reading `git status`. Resetting to HEAD
 * is idempotent, so calling it again is always safe.
 */
export async function flushPendingIndex(
  contentDirectory: string,
  {
    timeoutMs = 2_000,
    lockTimeoutMs,
  }: { timeoutMs?: number; lockTimeoutMs?: number } = {},
): Promise<boolean> {
  if (!(await directoryIsGitRepo(contentDirectory))) return true;
  return withWriteLock(
    contentDirectory,
    "flush pending index",
    () => flushPendingLocked(contentDirectory, timeoutMs),
    { timeoutMs: lockTimeoutMs },
  );
}

const backgroundFlushes = new Set<string>();

/**
 * Retry a pending refresh in the background, a few times with backoff
 * (`DISCONTENT_INDEX_FLUSH_RETRY_MS` × 1, 3, 10, 30, 60; default 1 s), so a
 * repository nobody writes to again does not stay "changed" in `git status`.
 * Unref'd, outside the current hold, one chain per repository.
 */
function scheduleBackgroundFlush(contentDirectory: string): void {
  if (backgroundFlushes.has(contentDirectory)) return;
  backgroundFlushes.add(contentDirectory);
  const base = envMs("DISCONTENT_INDEX_FLUSH_RETRY_MS", 1_000);
  const delays = [1, 3, 10, 30, 60].map((n) => n * base);
  const attempt = (i: number) => {
    const timer = setTimeout(() => {
      void flushPendingIndex(contentDirectory, { lockTimeoutMs: 5_000 })
        .catch(() => false)
        .then((done) => {
          if (done || i + 1 >= delays.length) {
            backgroundFlushes.delete(contentDirectory);
          } else {
            attempt(i + 1);
          }
        });
    }, delays[i]);
    timer.unref?.();
  };
  outsideWriteLock(() => attempt(0));
}

/** How long step 6 may wait for `index.lock`. */
async function refreshBudget(gitDir: string): Promise<number> {
  if (await pathExists(join(gitDir, PENDING_NAME))) return 0;
  const lock = await stat(join(gitDir, "index.lock")).catch(() => null);
  if (lock && Date.now() - lock.mtimeMs > OLD_INDEX_LOCK_MS) return 0;
  return envMs("DISCONTENT_INDEX_REFRESH_MS", 10_000);
}

async function buildPrivateIndex(
  contentDirectory: string,
  gitDir: string,
  env: Record<string, string>,
  privateIndex: string,
  parent: string | null,
): Promise<void> {
  await rm(privateIndex, { force: true });
  if (!parent) {
    await runGit(contentDirectory, ["read-tree", "--empty"], { env });
    return;
  }
  const shared = join(gitDir, "index");
  try {
    await copyFile(shared, privateIndex);
    /* Keep its mtime too: git's racy-entry check is relative to it. */
    const { atime, mtime } = await stat(shared);
    await utimes(privateIndex, atime, mtime);
    await runGit(contentDirectory, ["read-tree", "-m", parent], { env });
    return;
  } catch {
    /* No shared index yet, or one `-m` refuses (unmerged entries). */
    await rm(privateIndex, { force: true });
  }
  await runGit(contentDirectory, ["read-tree", parent], { env });
}

async function listIndex(
  contentDirectory: string,
  env: Record<string, string>,
  paths: string[] | null,
): Promise<string[]> {
  return (
    await runGit(
      contentDirectory,
      ["ls-files", "-z", "--", ...pathspecs(paths)],
      {
        env,
      },
    )
  )
    .split("\0")
    .filter(Boolean);
}

async function stagePaths(
  contentDirectory: string,
  env: Record<string, string>,
  paths: string[] | null,
): Promise<void> {
  let keep: string[] | null = null;
  if (paths !== null) {
    const tracked = await listIndex(contentDirectory, env, paths);
    keep = [];
    for (const path of paths) {
      const onDisk = await lstat(join(contentDirectory, path)).then(
        () => true,
        () => false,
      );
      if (onDisk || tracked.some((entry) => covers(path, entry))) {
        keep.push(path);
      }
    }
    if (keep.length === 0) return;
  }
  await runGit(contentDirectory, ["add", "-A", "--", ...pathspecs(keep)], {
    env,
  });
  /* An atomic-write temp file a dead writer left never rides along. */
  const temps = (await listIndex(contentDirectory, env, keep)).filter((file) =>
    ATOMIC_TEMP.test(basename(file)),
  );
  if (temps.length > 0) {
    await runGit(
      contentDirectory,
      ["update-index", "--force-remove", "-z", "--stdin"],
      { env, input: `${temps.join("\0")}\0` },
    );
  }
}

export async function commitChanges(
  contentDirectory: string,
  message: string,
  author?: { name: string; email: string },
  paths?: string[],
) {
  const text = cleanMessage(message);
  const subject = text.split("\n")[0] ?? "";
  await withWriteLock(contentDirectory, `commit: ${subject}`, () =>
    serialInHold(() =>
      commitLocked(contentDirectory, text, subject, author, paths),
    ),
  );
}

async function commitLocked(
  contentDirectory: string,
  text: string,
  subject: string,
  author: { name: string; email: string } | undefined,
  paths: string[] | undefined,
): Promise<void> {
  const writeId = currentWriteId() ?? ulid();
  const touched = normalizePaths(contentDirectory, paths);
  const touchedList = touched ?? ["."];
  const gitDir = await gitDirectory(contentDirectory);
  const refusal = await operationInProgress(gitDir);
  if (refusal) throw refusal;
  await flushPendingLocked(contentDirectory, 0);

  /* Its own id, so two commits in one hold never share an index file. */
  const privateIndex = join(gitDir, `discontent-index-${ulid()}`);
  const env = { GIT_INDEX_FILE: privateIndex };
  const authorEnv: Record<string, string> = author
    ? { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email }
    : {};
  try {
    if (!text) throw new Error("empty commit message");
    let landed: { parent: string | null; commit: string } | undefined;
    for (let attempt = 0; ; attempt++) {
      const parent = await readHeadCommit(contentDirectory);
      await buildPrivateIndex(
        contentDirectory,
        gitDir,
        env,
        privateIndex,
        parent,
      );
      await stagePaths(contentDirectory, env, touched);
      const tree = (
        await runGit(contentDirectory, ["write-tree"], { env })
      ).trim();
      const parentTree = parent
        ? await runGit(contentDirectory, ["rev-parse", `${parent}^{tree}`])
        : await runGit(
            contentDirectory,
            ["hash-object", "-t", "tree", "--stdin"],
            { input: "" },
          );
      /* The no-change skip: these paths already say what HEAD says. */
      if (tree === parentTree.trim()) return;

      const commit = (
        await runGit(
          contentDirectory,
          ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-F", "-"],
          { env: authorEnv, input: text },
        )
      ).trim();
      await commitTestHooks.beforeUpdateRef?.();
      if (!(await writeLockStillHeld(contentDirectory))) {
        throw new Error(
          "this write's lock was taken over as stale before it could commit",
        );
      }
      try {
        await runGit(contentDirectory, [
          "update-ref",
          "-m",
          `discontent ${writeId}: ${subject}`,
          "HEAD",
          commit,
          parent ?? "",
        ]);
        landed = { parent, commit };
        break;
      } catch (error) {
        const now = await readHeadCommit(contentDirectory);
        if (now && now !== parent) {
          const conflicting = (
            await changedBetween(contentDirectory, parent, now)
          ).filter((changed) =>
            touched === null
              ? true
              : touched.some((path) => covers(path, changed)),
          );
          /*
           * Overlapping is a conflict only if the other commit put something
           * else there; the same content (two writers making the same edit,
           * or a sync bringing in this very change) is a redo and, most
           * likely, a no-change skip.
           */
          if (
            conflicting.length > 0 &&
            !(await sameAt(contentDirectory, tree, now, conflicting))
          ) {
            throw new CommitConflictError(writeId, touchedList, conflicting);
          }
        }
        /* HEAD moved elsewhere, or a ref lock was briefly held: redo. */
        if (attempt >= CAS_RETRIES) throw error;
        await sleep(25 * (attempt + 1));
      }
    }
    if (!landed) return;

    /*
     * The engine keeps its indexes current on every write, so this commit
     * does not make them stale: carry the index stamp forward if it named
     * the HEAD this commit landed on (`indexStamp.ts`). Right away, before
     * the refresh below can wait on `index.lock`.
     */
    await advanceIndexedHead(contentDirectory, landed.parent, landed.commit);

    /* Step 6: the paths the commit changed — never "everything". */
    const refresh =
      touched ??
      (await changedBetween(contentDirectory, landed.parent, landed.commit));
    if (refresh.length === 0) return;
    try {
      const budget = await refreshBudget(gitDir);
      await retryIndexLock(
        () => runGit(contentDirectory, resetArgs(refresh)),
        budget,
      );
    } catch {
      await appendFile(
        join(gitDir, PENDING_NAME),
        `${refresh.join("\0")}\0`,
      ).catch(() => undefined);
      scheduleBackgroundFlush(contentDirectory);
    }
  } catch (error) {
    if (
      error instanceof CommitConflictError ||
      error instanceof CommitFailedError
    ) {
      throw error;
    }
    throw new CommitFailedError(writeId, touchedList, error);
  } finally {
    await rm(privateIndex, { force: true });
    await rm(`${privateIndex}.lock`, { force: true });
  }
}

/**
 * Commit a content write, if the content directory is a git repository.
 *
 * `contentDirectory` is trailing and optional because it arrived late (F17):
 * until then this read `getContentDirectory()` unconditionally, so a write
 * given an explicit directory committed against whatever the ambient
 * environment named — and `paths`, which the caller computed relative to *its*
 * directory, went to a repository they may not belong to. Latent rather than
 * live: the two agree in every configuration that runs today.
 */
export async function commitContentChanges(
  message: string,
  author?: { name: string; email: string },
  paths?: string[],
  contentDirectory: string = getContentDirectory(),
) {
  /*
   * The repository check runs inside the lock and the hold's serial queue,
   * not before them: an `access` awaited first resolves in any order, so two
   * commits started together in one scope could land in either order (35q).
   */
  const text = cleanMessage(message);
  const subject = text.split("\n")[0] ?? "";
  await withWriteLock(contentDirectory, `commit: ${subject}`, () =>
    serialInHold(async () => {
      if (!(await directoryIsGitRepo(contentDirectory))) return;
      await commitLocked(contentDirectory, text, subject, author, paths);
    }),
  );
}
