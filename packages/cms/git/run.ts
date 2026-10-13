/**
 * Plumbing for the write path (epic 34, D6/D7): run git directly, find the
 * repository's git directory.
 *
 * Not `simple-git`: the commit path needs a per-call environment
 * (`GIT_INDEX_FILE`, the author) and stdin, and it runs a dozen short commands
 * per write, so a thin `spawn` is both simpler and cheaper.
 */
import { spawn } from "node:child_process";
import { access, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

export class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(
      `git ${args[0] ?? ""} failed (${exitCode ?? "signal"}): ${stderr.trim().split("\n")[0] ?? ""}`,
    );
    this.name = "GitCommandError";
  }
}

/**
 * Inherited variables that would point an engine git command somewhere else
 * (a CLI run from inside a git hook sets the first three), or change how its
 * pathspecs read (`commit.ts` spells its magic out per pathspec).
 */
const STRIPPED = [
  "GIT_INDEX_FILE",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_LITERAL_PATHSPECS",
  "GIT_GLOB_PATHSPECS",
  "GIT_NOGLOB_PATHSPECS",
  "GIT_ICASE_PATHSPECS",
];

/** The process's environment minus `STRIPPED`, plus `extra`. */
function baseEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of STRIPPED) delete env[name];
  return { ...env, ...extra };
}

export function runGit(
  cwd: string,
  args: string[],
  { env, input }: { env?: Record<string, string>; input?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: baseEnv(env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString("utf8"));
      else
        reject(
          new GitCommandError(args, code, Buffer.concat(err).toString("utf8")),
        );
    });
    child.stdin.on("error", () => {
      /* A command that exits before reading its stdin; `close` reports it. */
    });
    child.stdin.end(input ?? "");
  });
}

/** Whether `contentDirectory` itself is a repository's top (has a `.git`). */
export async function directoryIsGitRepo(contentDirectory: string) {
  try {
    await access(join(contentDirectory, ".git"));
    return true;
  } catch {
    return false;
  }
}

const gitDirs = new Map<string, Promise<string>>();

/**
 * The absolute, real path of the repository's git directory — per worktree
 * for a linked worktree, which is where git keeps `index`, `HEAD` and
 * `MERGE_HEAD`, and so where the write lock and private indexes belong.
 *
 * Real path, so two spellings of one repository (a symlinked content
 * directory) share one lock key in this process. Cached per directory.
 */
export function gitDirectory(contentDirectory: string): Promise<string> {
  let found = gitDirs.get(contentDirectory);
  if (!found) {
    found = (async () => {
      const dotGit = join(contentDirectory, ".git");
      if ((await stat(dotGit)).isDirectory()) return realpath(dotGit);
      /* A gitfile: a linked worktree or a submodule. */
      const raw = await runGit(contentDirectory, [
        "rev-parse",
        "--absolute-git-dir",
      ]);
      return realpath(raw.trim());
    })();
    found.catch(() => gitDirs.delete(contentDirectory));
    gitDirs.set(contentDirectory, found);
  }
  return found;
}
