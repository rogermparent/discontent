/**
 * `gitSync` — one sync with one mirror, from the workstation (epic 28, D3).
 *
 * The workstation is the only place a merge happens (D1): it fetches the
 * mirror, merges the mirror's commits in, and pushes the result back. The
 * mirror never pushes. The CLI (`recipes git sync`), the API
 * (`POST /api/git/sync`), MCP (`git_sync`, held back) and — from 28c — the
 * workstation's event-driven runner all call this.
 *
 * Steps, in order, each recorded in the result:
 *
 * 1. `preflight` — refuse on a mirror; a merge already in progress here is
 *    `blocked`; with `mirror.sshHost`, the mirror's own tree is checked over
 *    ssh, so uncommitted work there (a failed import, a shell edit) is
 *    reported as `mirror_dirty` instead of surfacing later as a refused push.
 * 2. `fetch` the mirror's remote. Unreachable → `unreachable`.
 * 3. `merge` when the mirror has commits we don't — `gitPull`, which rebuilds
 *    every index and fires `onBulkChange`, and aborts a conflict, leaving the
 *    tree as it was → `conflict`. Never auto-resolved: a person pulls from
 *    `/git`, where the resolver is.
 * 4. `media` — nothing yet; git-annex content moves here in 28e.
 * 5. `push` when we have commits the mirror doesn't. The mirror's
 *    `updateInstead` refusing because its tree is dirty → `mirror_dirty`; a
 *    non-fast-forward (it committed after our fetch) → `raced`, which the
 *    commit's own trigger retries.
 *
 * The outcome is folded into `.git/discontent-sync.json` (`syncState.ts`) and
 * returned. Expected failures are outcomes, not throws: an unattended caller
 * wants a status, not an exception. Only a misuse throws (a mirror calling it,
 * an unknown remote, no repository).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import simpleGit, { type SimpleGit } from "simple-git";
import {
  recordSyncAttempt,
  type MirrorSyncState,
  type SyncOutcome,
} from "@discontent/cms/git/syncState";
import { isMirror, mirrorRefusal } from "recipe-website-common/config/role";
import type { CurationContext } from "./context";
import {
  CurationError,
  DirtyTreeError,
  ForbiddenError,
  GitConflictError,
  NotARepoError,
  ValidationError,
} from "./errors";
import { gitPull, mergeInProgress } from "./git";
import { directoryIsGitRepo } from "@discontent/cms/git/commit";

export interface SyncMirrorTarget {
  /** ssh host for the mirror-dirty preflight, e.g. `uraninite`. */
  sshHost?: string;
  /** The mirror's content directory on that host, e.g. `~/recipes`. */
  dir?: string;
}

export interface GitSyncOptions {
  /** The mirror's remote name here. Defaults to the upstream's remote. */
  remote?: string;
  mirror?: SyncMirrorTarget;
}

export type SyncStepName = "preflight" | "fetch" | "merge" | "media" | "push";

export interface SyncStep {
  step: SyncStepName;
  status: "ok" | "skipped" | "failed";
  detail?: string;
}

export interface SyncResult {
  remote: string;
  branch: string;
  outcome: SyncOutcome;
  message?: string;
  /** Commits brought in from the mirror. */
  pulled: number;
  /** Commits sent to the mirror. */
  pushed: number;
  steps: SyncStep[];
  /** HEAD after the sync. */
  head: string;
  state: MirrorSyncState;
}

/* `execFile`, not `execa`: execa is ESM-only and the CLI runs under `tsx` as
 * CommonJS (the same reason as `controller/ytdlp.ts`). */
const run = promisify(execFile);

const REMOTE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HOST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const DIR_PATTERN = /^~?[A-Za-z0-9._/-]+$/;

const UNREACHABLE =
  /could not read from remote|connection (refused|timed out|closed)|could not resolve|no route to host|network is unreachable|operation timed out|host key verification failed|permission denied \(publickey/i;
const MIRROR_DIRTY =
  /unstaged changes|uncommitted|working (directory|tree) .*(dirty|changes)|would be overwritten/i;
const NON_FAST_FORWARD = /non-fast-forward|fetch first|\[rejected\]/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

async function count(git: SimpleGit, range: string): Promise<number> {
  const raw = String(await git.raw(["rev-list", "--count", range])).trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/** The mirror's `git status --porcelain`, over ssh; `null` when not configured. */
async function mirrorDirtyFiles(
  mirror: SyncMirrorTarget | undefined,
): Promise<string[] | null> {
  if (!mirror?.sshHost || !mirror.dir) return null;
  if (!HOST_PATTERN.test(mirror.sshHost) || !DIR_PATTERN.test(mirror.dir)) {
    throw new ValidationError("Invalid mirror ssh host or directory.", [
      { path: "mirror", message: "Unsafe ssh host or directory" },
    ]);
  }
  const { stdout } = await run(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      mirror.sshHost,
      `git -C ${mirror.dir} status --porcelain`,
    ],
    { timeout: 30_000 },
  );
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export async function gitSync(
  ctx: CurationContext,
  { remote, mirror }: GitSyncOptions = {},
): Promise<SyncResult> {
  if (isMirror()) {
    throw new ForbiddenError(mirrorRefusal("syncing"));
  }
  if (!(await directoryIsGitRepo(ctx.contentDirectory))) {
    throw new NotARepoError(ctx.contentDirectory);
  }
  const git = simpleGit({ baseDir: ctx.contentDirectory });
  const status = await git.status();
  const branch = status.current;
  if (!branch || status.detached) {
    throw new ValidationError("Sync needs a branch checked out.", [
      { path: "branch", message: "Detached HEAD" },
    ]);
  }
  const target = remote ?? status.tracking?.split("/")[0];
  if (!target) {
    throw new ValidationError(
      "No mirror to sync with: pass `remote`, or set an upstream.",
      [{ path: "remote", message: "No remote" }],
    );
  }
  if (!REMOTE_PATTERN.test(target)) {
    throw new ValidationError(`Invalid remote "${target}".`, [
      { path: "remote", message: "Invalid remote name" },
    ]);
  }
  const remotes = (await git.getRemotes()).map((entry) => entry.name);
  if (!remotes.includes(target)) {
    throw new ValidationError(`No remote named "${target}".`, [
      { path: "remote", message: "Unknown remote" },
    ]);
  }
  const remoteBranch = `${target}/${branch}`;

  const steps: SyncStep[] = [];
  let pulled = 0;
  let pushed = 0;

  async function finish(
    outcome: SyncOutcome,
    message?: string,
  ): Promise<SyncResult> {
    const head = String(await git.revparse(["HEAD"])).trim();
    const state = await recordSyncAttempt(ctx.contentDirectory, {
      remote: target as string,
      outcome,
      message,
      pulled,
      pushed,
    });
    return {
      remote: target as string,
      branch: branch as string,
      outcome,
      ...(message ? { message } : {}),
      pulled,
      pushed,
      steps,
      head,
      state,
    };
  }

  /* 1. preflight ---------------------------------------------------------- */
  if (await mergeInProgress(ctx.contentDirectory)) {
    steps.push({
      step: "preflight",
      status: "failed",
      detail: "merge in progress",
    });
    return finish(
      "blocked",
      "A merge is in progress here. Finish or abort it on the Git page, then sync.",
    );
  }
  let mirrorDirty: string[] | null = null;
  try {
    mirrorDirty = await mirrorDirtyFiles(mirror);
  } catch (error) {
    if (error instanceof CurationError) throw error;
    steps.push({
      step: "preflight",
      status: "failed",
      detail: firstLine(messageOf(error)),
    });
    return finish(
      "unreachable",
      `Could not reach ${mirror?.sshHost} over ssh: ${firstLine(messageOf(error))}`,
    );
  }
  steps.push({
    step: "preflight",
    status: "ok",
    ...(mirrorDirty === null ? { detail: "mirror tree not checked" } : {}),
  });

  /* 2. fetch -------------------------------------------------------------- */
  try {
    await git.raw(["fetch", "--prune", target]);
    steps.push({ step: "fetch", status: "ok" });
  } catch (error) {
    const line = firstLine(messageOf(error));
    steps.push({ step: "fetch", status: "failed", detail: line });
    return finish(
      UNREACHABLE.test(messageOf(error)) ? "unreachable" : "error",
      `Fetching ${target} failed: ${line}`,
    );
  }

  /* 3. merge -------------------------------------------------------------- */
  const behind = await count(git, `HEAD..${remoteBranch}`).catch(() => 0);
  if (behind > 0) {
    try {
      const result = await gitPull(ctx, { remote: target });
      pulled = result.newCommits;
      steps.push({
        step: "merge",
        status: "ok",
        detail: `${result.fastForward ? "fast-forwarded" : "merged"} ${result.newCommits}`,
      });
    } catch (error) {
      steps.push({
        step: "merge",
        status: "failed",
        detail: firstLine(messageOf(error)),
      });
      if (error instanceof GitConflictError) {
        return finish("conflict", error.message);
      }
      if (error instanceof DirtyTreeError) {
        return finish(
          "blocked",
          `Uncommitted changes here stop the merge: ${error.message}`,
        );
      }
      throw error;
    }
  } else {
    steps.push({ step: "merge", status: "skipped" });
  }

  /* 4. media -------------------------------------------------------------- */
  steps.push({
    step: "media",
    status: "skipped",
    detail: "no large-media store yet",
  });

  /* 5. push --------------------------------------------------------------- */
  const ahead = await count(git, `${remoteBranch}..HEAD`).catch(() => 0);
  if (ahead === 0) {
    steps.push({ step: "push", status: "skipped" });
  } else if (mirrorDirty && mirrorDirty.length > 0) {
    steps.push({
      step: "push",
      status: "skipped",
      detail: "mirror tree dirty",
    });
    return finish(
      "mirror_dirty",
      `${mirror?.sshHost} has uncommitted changes (${mirrorDirty.slice(0, 3).join("; ")}${mirrorDirty.length > 3 ? "; …" : ""}), so ${ahead} commit${ahead === 1 ? "" : "s"} could not be sent. Commit or discard them there.`,
    );
  } else {
    try {
      await git.raw(["push", target, `${branch}:${branch}`]);
      pushed = ahead;
      steps.push({ step: "push", status: "ok", detail: `${ahead}` });
    } catch (error) {
      const text = messageOf(error);
      steps.push({ step: "push", status: "failed", detail: firstLine(text) });
      if (MIRROR_DIRTY.test(text)) {
        return finish(
          "mirror_dirty",
          `${target} refused the push: its working tree has uncommitted changes.`,
        );
      }
      if (NON_FAST_FORWARD.test(text)) {
        return finish(
          "raced",
          `${target} committed while syncing; the next sync brings it in.`,
        );
      }
      return finish(
        UNREACHABLE.test(text) ? "unreachable" : "error",
        `Pushing to ${target} failed: ${firstLine(text)}`,
      );
    }
  }

  return finish(pulled > 0 || pushed > 0 ? "synced" : "nothing");
}
