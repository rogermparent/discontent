/**
 * What the last sync with each mirror did (epic 28, D3).
 *
 * Written by `gitSync` after every attempt, read by `/git`'s Mirrors card,
 * `/api/git/status` and (28c) the runner's notification logic. Lives beside
 * the index stamp (`indexStamp.ts`) in the repository's git directory, for the
 * same reasons: git never tracks it, so no content repository needs a
 * `.gitignore` line, and it describes this clone, not the content.
 *
 * One JSON file keyed by remote name. A write that fails is swallowed: the
 * sync itself already happened, and losing a status line is the right trade.
 */
import { readFile, rename, writeFile } from "fs/promises";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";

const STATE_NAME = "discontent-sync.json";

export type SyncOutcome =
  /** Fetched; nothing to bring in or send. */
  | "nothing"
  /** Brought commits in, sent commits out, or both. */
  | "synced"
  /** The merge conflicted and was aborted; a person resolves it on `/git`. */
  | "conflict"
  /** The mirror has uncommitted changes, so nothing could be pushed to it. */
  | "mirror_dirty"
  /** The mirror committed between our fetch and our push; the next run catches it. */
  | "raced"
  /** The mirror could not be reached. */
  | "unreachable"
  /** This repository could not sync: a dirty tree, a merge in progress. */
  | "blocked"
  /** Anything else. */
  | "error";

/** Outcomes that count as a failure for the consecutive-failure tally. */
export const FAILED_OUTCOMES: readonly SyncOutcome[] = [
  "conflict",
  "mirror_dirty",
  "unreachable",
  "blocked",
  "error",
];

export interface MirrorSyncState {
  remote: string;
  /** ISO time of the last attempt, whatever its outcome. */
  lastAttempt: string;
  outcome: SyncOutcome;
  /** A sentence for a person when the outcome is not `nothing`/`synced`. */
  message?: string;
  /** ISO time of the last `nothing` or `synced`. */
  lastSuccess?: string;
  /** Failures in a row, reset by a success. `raced` neither adds nor resets. */
  consecutiveFailures: number;
  /** Commits brought in / sent on the last attempt. */
  pulled?: number;
  pushed?: number;
  /** The last time site settings were sent to this mirror (D7). */
  settings?: SettingsPushState;
}

/**
 * D7: the workstation sends its site settings after a sync when they changed
 * since the last send. `hash` is what the mirror last accepted; a failed send
 * keeps the previous hash and records `error`, so the next sync tries again.
 */
export interface SettingsPushState {
  /** ISO time of the last attempt. */
  at: string;
  /** The hash of the site settings the mirror last accepted. */
  hash?: string;
  /** Why the last attempt failed, if it did. */
  error?: string;
}

export type SyncStateFile = Record<string, MirrorSyncState>;

async function statePath(contentDirectory: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-path",
      STATE_NAME,
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

export async function readSyncState(
  contentDirectory: string,
): Promise<SyncStateFile> {
  try {
    const parsed = JSON.parse(
      await readFile(await statePath(contentDirectory), "utf8"),
    );
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export interface SyncAttempt {
  remote: string;
  outcome: SyncOutcome;
  message?: string;
  pulled?: number;
  pushed?: number;
  at?: Date;
}

/** Fold one attempt into the file and return the remote's new state. */
export async function recordSyncAttempt(
  contentDirectory: string,
  attempt: SyncAttempt,
): Promise<MirrorSyncState> {
  const at = (attempt.at ?? new Date()).toISOString();
  const file = await readSyncState(contentDirectory);
  const previous = file[attempt.remote];
  const success = attempt.outcome === "nothing" || attempt.outcome === "synced";
  const failed = FAILED_OUTCOMES.includes(attempt.outcome);
  const next: MirrorSyncState = {
    remote: attempt.remote,
    lastAttempt: at,
    outcome: attempt.outcome,
    ...(attempt.message ? { message: attempt.message } : {}),
    ...(success
      ? { lastSuccess: at }
      : previous?.lastSuccess
        ? { lastSuccess: previous.lastSuccess }
        : {}),
    consecutiveFailures: success
      ? 0
      : (previous?.consecutiveFailures ?? 0) + (failed ? 1 : 0),
    ...(attempt.pulled !== undefined ? { pulled: attempt.pulled } : {}),
    ...(attempt.pushed !== undefined ? { pushed: attempt.pushed } : {}),
    ...(previous?.settings ? { settings: previous.settings } : {}),
  };
  file[attempt.remote] = next;
  await writeStateFile(contentDirectory, file);
  return next;
}

/**
 * Record a site-settings send to `remote` (D7). Only a mirror that has a sync
 * record gets one: settings follow a sync, never stand alone.
 */
export async function recordSettingsPush(
  contentDirectory: string,
  remote: string,
  push: { hash?: string; error?: string; at?: Date },
): Promise<SettingsPushState | undefined> {
  const file = await readSyncState(contentDirectory);
  const previous = file[remote];
  if (!previous) return undefined;
  const settings: SettingsPushState = {
    at: (push.at ?? new Date()).toISOString(),
    ...(push.error
      ? {
          ...(previous.settings?.hash ? { hash: previous.settings.hash } : {}),
          error: push.error,
        }
      : push.hash
        ? { hash: push.hash }
        : {}),
  };
  file[remote] = { ...previous, settings };
  await writeStateFile(contentDirectory, file);
  return settings;
}

async function writeStateFile(
  contentDirectory: string,
  file: SyncStateFile,
): Promise<void> {
  try {
    const path = await statePath(contentDirectory);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`);
    await rename(temporary, path);
  } catch {
    /* See the module comment. */
  }
}
