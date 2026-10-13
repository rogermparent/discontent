/**
 * Commit a content write (epic 34, D7).
 *
 * Every write commits only the paths it touched, through a **private index**,
 * landing with a **compare-and-swap on HEAD**. Until epic 34 it was
 * `git add <paths>` and a bare `git commit` through the shared index, so a
 * file someone had staged by hand rode along, and a workstation sync's
 * `git status`/`merge` holding `index.lock` failed the write (epic 33's ninth).
 *
 * Under the write lock (`writeLock.ts`, D6), with the write's id:
 *
 * 1. Copy the shared index to `<gitdir>/discontent-index-<writeId>` and, with
 *    `GIT_INDEX_FILE` on it, `read-tree -m HEAD`: foreign staged entries drop
 *    out, stat info stays (so annexed files are not re-hashed). An unborn
 *    branch starts from `read-tree --empty`.
 * 2. Drop paths that are neither on disk nor tracked (a delete of something
 *    never committed), then `add -A -- <paths>` (`.` when none were given).
 * 3. `write-tree`; no commit when it equals HEAD's tree.
 * 4. `commit-tree` with the author from the environment (`--author`'s
 *    semantics: the committer stays git's configured identity), then
 *    `update-ref -m "discontent <writeId>: <subject>" HEAD <new> <old>`.
 *    `HEAD` itself, so a detached HEAD moves and a branch moves through it.
 * 5. If HEAD moved underneath (the CAS failed): when what moved does not
 *    overlap these paths, redo on the new HEAD (up to three times); when it
 *    does, `CommitConflictError`.
 * 6. Bring the shared index up to the commit for these paths
 *    (`reset -q -- <paths>`), retrying while `index.lock` is held for up to
 *    `DISCONTENT_INDEX_REFRESH_MS` (10 s); failing that, the paths go to
 *    `<gitdir>/discontent-index-pending`, which the next locked commit (or
 *    `flushPendingIndex`) applies. The write never fails here — the commit has
 *    landed, and a stale index entry only makes `git status` look dirty.
 * 7. The private index is removed in `finally`; the lock sweeps any a dead
 *    writer left.
 *
 * Refuses while `MERGE_HEAD` exists (`MergeInProgressError`). Any other git
 * failure is a `CommitFailedError` carrying the write id and its paths.
 *
 * **Hooks do not run.** `commit-tree` + `update-ref` skip `pre-commit`,
 * `commit-msg` and `post-commit`. The content repositories' only hooks are
 * git-annex's, and its `pre-commit` (`git annex pre-commit .`) fixes up
 * *locked* (symlinked) annexed files; the engine's large files are unlocked
 * (smudge/clean, epic 28 D9), which `git add` annexes through the clean
 * filter — `GIT_INDEX_FILE` and all (`test/curationGit.test.ts`). `gc --auto`
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
import { isAbsolute, join, relative, sep } from "node:path";
import { getContentDirectory } from "../fs/getContentDirectory";
import { ulid } from "../util/ulid";
import { advanceIndexedHead } from "./indexStamp";
import {
  directoryIsGitRepo,
  GitCommandError,
  gitDirectory,
  runGit,
} from "./run";
import { currentWriteId, withWriteLock } from "./writeLock";

export { directoryIsGitRepo };

const PENDING_NAME = "discontent-index-pending";
/** Pathspecs are paths, never globs or magic, whatever a slug contains. */
const LITERAL = { GIT_LITERAL_PATHSPECS: "1" };
const CAS_RETRIES = 3;

/** A merge is underway (`MERGE_HEAD`); the site answers `dirty_tree`. */
export class MergeInProgressError extends Error {
  constructor() {
    super(
      "The content repository is mid-merge (MERGE_HEAD exists) — finish or abort it in /git first.",
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

/** Refuse a write while a merge is underway. A no-op outside a repository. */
export async function assertNoMergeInProgress(
  contentDirectory: string,
): Promise<void> {
  if (!(await directoryIsGitRepo(contentDirectory))) return;
  const gitDir = await gitDirectory(contentDirectory);
  if (await pathExists(join(gitDir, "MERGE_HEAD"))) {
    throw new MergeInProgressError();
  }
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

function refreshTimeout(): number {
  const raw = Number(process.env.DISCONTENT_INDEX_REFRESH_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10_000;
}

function resetArgs(paths: string[] | null): string[] {
  return paths === null ? ["reset", "-q"] : ["reset", "-q", "--", ...paths];
}

/** Apply the pending shared-index refresh, if any. Must hold the lock. */
async function flushPendingLocked(
  contentDirectory: string,
  timeoutMs: number,
): Promise<boolean> {
  const file = join(await gitDirectory(contentDirectory), PENDING_NAME);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return true;
  }
  const entries = [...new Set(raw.split("\0").filter(Boolean))];
  try {
    if (entries.length > 0) {
      await retryIndexLock(
        () =>
          runGit(
            contentDirectory,
            resetArgs(entries.includes(".") ? null : entries),
            { env: LITERAL },
          ),
        timeoutMs,
      );
    }
  } catch {
    return false;
  }
  await rm(file, { force: true });
  return true;
}

/**
 * Bring the shared index up to HEAD for every path a commit could not refresh
 * (step 6). True when nothing is left pending. Takes the write lock; the site's
 * `requireCleanTree` calls it before reading `git status`.
 */
export async function flushPendingIndex(
  contentDirectory: string,
  { timeoutMs = 2_000 }: { timeoutMs?: number } = {},
): Promise<boolean> {
  if (!(await directoryIsGitRepo(contentDirectory))) return true;
  return withWriteLock(contentDirectory, "flush pending index", () =>
    flushPendingLocked(contentDirectory, timeoutMs),
  );
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

async function stagePaths(
  contentDirectory: string,
  env: Record<string, string>,
  paths: string[] | null,
): Promise<void> {
  if (paths === null) {
    await runGit(contentDirectory, ["add", "-A", "--", "."], { env });
    return;
  }
  const tracked = (
    await runGit(contentDirectory, ["ls-files", "-z", "--", ...paths], { env })
  )
    .split("\0")
    .filter(Boolean);
  const keep: string[] = [];
  for (const path of paths) {
    const onDisk = await lstat(join(contentDirectory, path)).then(
      () => true,
      () => false,
    );
    if (onDisk || tracked.some((entry) => covers(path, entry))) keep.push(path);
  }
  if (keep.length > 0) {
    await runGit(contentDirectory, ["add", "-A", "--", ...keep], { env });
  }
}

async function signingArgs(contentDirectory: string): Promise<string[]> {
  try {
    const value = await runGit(contentDirectory, [
      "config",
      "--type=bool",
      "--get",
      "commit.gpgsign",
    ]);
    return value.trim() === "true" ? ["-S"] : [];
  } catch {
    return [];
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
  await withWriteLock(contentDirectory, `commit: ${subject}`, async () => {
    const writeId = currentWriteId() ?? ulid();
    const touched = normalizePaths(contentDirectory, paths);
    const touchedList = touched ?? ["."];
    const gitDir = await gitDirectory(contentDirectory);
    if (await pathExists(join(gitDir, "MERGE_HEAD"))) {
      throw new MergeInProgressError();
    }
    await flushPendingLocked(contentDirectory, 0);

    const privateIndex = join(gitDir, `discontent-index-${writeId}`);
    const env = { ...LITERAL, GIT_INDEX_FILE: privateIndex };
    const authorEnv: Record<string, string> = author
      ? { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email }
      : {};
    try {
      if (!text) throw new Error("empty commit message");
      const sign = await signingArgs(contentDirectory);
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
            [
              "commit-tree",
              tree,
              ...(parent ? ["-p", parent] : []),
              ...sign,
              "-F",
              "-",
            ],
            { env: authorEnv, input: text },
          )
        ).trim();
        await commitTestHooks.beforeUpdateRef?.();
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
          if (now !== parent) {
            const conflicting = (
              await changedBetween(contentDirectory, parent, now)
            ).filter((changed) =>
              touched === null
                ? true
                : touched.some((path) => covers(path, changed)),
            );
            if (conflicting.length > 0) {
              throw new CommitConflictError(writeId, touchedList, conflicting);
            }
          }
          /* HEAD moved elsewhere, or a ref lock was briefly held: redo. */
          if (attempt >= CAS_RETRIES) throw error;
          await sleep(25 * (attempt + 1));
        }
      }

      if (!landed) return;

      /* Step 6: never fails the write. */
      try {
        await retryIndexLock(
          () => runGit(contentDirectory, resetArgs(touched), { env: LITERAL }),
          refreshTimeout(),
        );
      } catch {
        await appendFile(
          join(gitDir, PENDING_NAME),
          `${touchedList.join("\0")}\0`,
        ).catch(() => undefined);
      }
      /*
       * The engine keeps its indexes current on every write, so this commit
       * does not make them stale: carry the index stamp forward if it named
       * the HEAD this commit landed on (`indexStamp.ts`).
       */
      await advanceIndexedHead(contentDirectory, landed.parent, landed.commit);
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
  });
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
  if (await directoryIsGitRepo(contentDirectory)) {
    await commitChanges(contentDirectory, message, author, paths);
  }
}
