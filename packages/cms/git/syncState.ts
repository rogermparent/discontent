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
  /**
   * Another write held this repository's write lock past the merge's wait
   * (epic 34, 34d), so nothing was merged. Not a failure — like `raced` it
   * neither adds to nor resets the tally — and the workstation retries.
   */
  | "busy"
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
  /** Failures in a row, reset by a success. `raced` and `busy` neither add nor reset. */
  consecutiveFailures: number;
  /** Commits brought in / sent on the last attempt. */
  pulled?: number;
  pushed?: number;
  /** The last time site settings were sent to this mirror (D7). */
  settings?: SettingsPushState;
  /**
   * When the conflict that still stands with this mirror was first hit
   * (epic 39, D4). Set by a `conflict`, kept through every outcome that
   * cannot tell whether it is resolved (`blocked` while a person merges,
   * `busy`, `raced`, `unreachable`, `mirror_dirty`, `error`), and cleared
   * only by a `nothing` or `synced`.
   */
  conflictSince?: string;
  /** The `git-sync` job that last hit that conflict, for a link (39d). */
  conflictJob?: string;
  /**
   * The attention state a person was last told about (39d, D5): kept here,
   * not in memory, so a restart neither notifies again nor loses the daily
   * reminder's clock.
   */
  attention?: AttentionRecord;
  /** The standing state last sent to the mirror's editor (39d, D4). */
  standingSent?: StandingPushState;
}

/** 39d, D5: what was last notified about one mirror, and when. */
export interface AttentionRecord {
  /** `attentionKey`'s key, e.g. `uraninite:conflict`. */
  key: string;
  /** ISO time it was first notified. */
  since: string;
  /** ISO time of the last notification or reminder. */
  at: string;
}

/**
 * 39d, D4: the workstation tells the mirror's editor when a conflict starts
 * or clears. `key` is what the mirror last accepted (`conflict:<since>` or
 * `clear`); a failed send keeps the previous key and records `error`, so the
 * next sync tries again.
 */
export interface StandingPushState {
  at: string;
  key?: string;
  error?: string;
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
  /** The `git-sync` job this attempt ran in (39d: a conflict links it). */
  job?: string;
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
    ...conflictFields(attempt, previous, at, success),
    ...(previous?.attention ? { attention: previous.attention } : {}),
    ...(previous?.standingSent ? { standingSent: previous.standingSent } : {}),
  };
  file[attempt.remote] = next;
  await writeStateFile(contentDirectory, file);
  return next;
}

/** 39d, D4: a conflict stands from the first `conflict` until a success. */
function conflictFields(
  attempt: SyncAttempt,
  previous: MirrorSyncState | undefined,
  at: string,
  success: boolean,
): Pick<MirrorSyncState, "conflictSince" | "conflictJob"> {
  if (success) return {};
  if (attempt.outcome === "conflict") {
    const job = attempt.job ?? previous?.conflictJob;
    return {
      conflictSince: previous?.conflictSince ?? at,
      ...(job ? { conflictJob: job } : {}),
    };
  }
  return {
    ...(previous?.conflictSince
      ? { conflictSince: previous.conflictSince }
      : {}),
    ...(previous?.conflictSince && previous.conflictJob
      ? { conflictJob: previous.conflictJob }
      : {}),
  };
}

/**
 * Set (or, with `undefined`, remove) fields of one mirror's record, keeping
 * the rest (39d: the attention record, the standing send). A remote with no
 * record gets none: these follow a sync, never stand alone. Answers the new
 * record.
 */
export async function patchMirrorState(
  contentDirectory: string,
  remote: string,
  fields: Partial<
    Pick<MirrorSyncState, "attention" | "standingSent" | "settings">
  >,
): Promise<MirrorSyncState | undefined> {
  const file = await readSyncState(contentDirectory);
  const previous = file[remote];
  if (!previous) return undefined;
  const next: MirrorSyncState = { ...previous };
  for (const [key, value] of Object.entries(fields) as [
    keyof typeof fields,
    unknown,
  ][]) {
    if (value === undefined) delete next[key];
    else (next as unknown as Record<string, unknown>)[key] = value;
  }
  file[remote] = next;
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
