/**
 * What the workstation tells a mirror about their sync (epic 39, D4).
 *
 * Within 28-D1 the workstation is the only merger, so a conflict is always
 * found there — by its own sync (startup, its ref watcher, Sync now) as
 * often as by a mirror's ping. Before 39d the mirror learned only its own
 * ping's outcome, so a conflict hit by the workstation's own sync never
 * reached it, and a later ping could answer `busy` or `blocked` with the
 * conflict still standing. Now the workstation's **standing** state for the
 * mirror — a conflict since `<time>`, or clear — travels two ways:
 *
 * - **in every `/api/git/sync` answer** (`standing`), whatever that run's
 *   outcome, so each ping refreshes it;
 * - **pushed** to the mirror's editor (`PUT /api/git/standing`) after any
 *   sync whose standing differs from what the mirror last accepted — the
 *   same URL and token the site settings already go to (28-D7). That is
 *   how a conflict the workstation hit by itself reaches the mirror, and
 *   how its clearing does when no ping follows.
 *
 * The mirror keeps the newest it was told (`asOf`, the workstation's own
 * time, so a late ping answer cannot undo a newer push) in
 * `.git/discontent-workstation.json`, beside the ping state, and its `/git`
 * and Maintenance say so. Nothing on the mirror merges or pushes because of
 * it: its edits keep committing locally and are merged by the workstation's
 * next sync after the conflict is resolved there (the existing behaviour).
 */
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "fs/promises";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";
import {
  patchMirrorState,
  readSyncState,
  type MirrorSyncState,
} from "@discontent/cms/git/syncState";
import { readSettings } from "../../src/settings";
import type { MirrorTarget } from "./mirrors";
import { mirrorEditorUrl } from "./siteSettings";

export interface StandingConflict {
  /** ISO time the workstation first hit it. */
  since: string;
  /** The workstation's `git-sync` job that last hit it (its `/jobs/<id>`). */
  job?: string;
}

export interface WorkstationStanding {
  /**
   * The workstation's time for this state — its record's last attempt with
   * the mirror. The mirror keeps the newest it has been told.
   */
  asOf: string;
  /** A conflict that stands, or `null`: clear. */
  conflict: StandingConflict | null;
}

/** On the mirror: what it was told, and how. */
export interface StoredStanding extends WorkstationStanding {
  receivedAt: string;
  via: "ping" | "push";
}

/** The standing state in a sync record (`conflictSince`, `conflictJob`). */
export function standingOf(
  state: MirrorSyncState | undefined,
  now: Date = new Date(),
): WorkstationStanding {
  return {
    asOf: state?.lastAttempt ?? now.toISOString(),
    conflict: state?.conflictSince
      ? {
          since: state.conflictSince,
          ...(state.conflictJob ? { job: state.conflictJob } : {}),
        }
      : null,
  };
}

/** What the mirror shows, as a key: a new conflict is a new key. */
export function standingKey(standing: WorkstationStanding): string {
  return standing.conflict ? `conflict:${standing.conflict.since}` : "clear";
}

const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * ISO-8601 in UTC, as `toISOString` writes it (milliseconds optional) — not
 * whatever `Date.parse` takes (39d review: "tomorrow"-ish spellings, local
 * times, years past 9999).
 */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_UTC.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * How far ahead of the mirror's clock an `asOf` may be. Newest wins, so one
 * from the far future would freeze the banner until that time; a day covers
 * any honest drift between two machines on NTP.
 */
export const MAX_AHEAD_MS = 24 * 60 * 60_000;

/** Whether `standing` claims a time too far past this machine's clock. */
export function standingTooFarAhead(
  standing: WorkstationStanding,
  now: Date = new Date(),
): boolean {
  return Date.parse(standing.asOf) - now.getTime() > MAX_AHEAD_MS;
}

/**
 * A standing state off the wire, or `undefined` when it is not one. Strict
 * about shapes (the mirror renders it): times parse, a job id is an id.
 */
export function parseStanding(value: unknown): WorkstationStanding | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const { asOf, conflict } = value as Record<string, unknown>;
  if (!isTime(asOf)) return;
  if (conflict === null) return { asOf, conflict: null };
  if (!conflict || typeof conflict !== "object" || Array.isArray(conflict))
    return;
  const { since, job } = conflict as Record<string, unknown>;
  if (!isTime(since)) return;
  if (job !== undefined && (typeof job !== "string" || !JOB_ID.test(job)))
    return;
  return { asOf, conflict: { since, ...(job ? { job } : {}) } };
}

/* --- the mirror's copy ---------------------------------------------- */

const STANDING_FILE = "discontent-workstation.json";

async function standingPath(contentDirectory: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-path",
      STANDING_FILE,
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

export async function readStanding(
  contentDirectory: string,
): Promise<StoredStanding | null> {
  try {
    const parsed = JSON.parse(
      await readFile(await standingPath(contentDirectory), "utf8"),
    );
    const standing = parseStanding(parsed);
    if (!standing) return null;
    return {
      ...standing,
      receivedAt: isTime(parsed.receivedAt) ? parsed.receivedAt : standing.asOf,
      via: parsed.via === "push" ? "push" : "ping",
    };
  } catch {
    return null;
  }
}

/* One write at a time in this process: the pinger and the route both write. */
let writes: Promise<unknown> = Promise.resolve();

/**
 * Keep `standing` unless the mirror already holds a newer one (`asOf`).
 * Answers whether it was kept. A lost write is a lost status line, not an
 * error: the next ping or push says it again.
 */
export function recordStanding(
  contentDirectory: string,
  standing: WorkstationStanding,
  via: StoredStanding["via"],
  now: Date = new Date(),
): Promise<boolean> {
  const result = writes.then(async () => {
    const previous = await readStanding(contentDirectory);
    /* A stored time too far ahead (from before the receivers refused one)
     * would win forever: it is not counted as newer. */
    if (
      previous &&
      !standingTooFarAhead(previous, now) &&
      Date.parse(previous.asOf) > Date.parse(standing.asOf)
    ) {
      return false;
    }
    const stored: StoredStanding = {
      asOf: standing.asOf,
      conflict: standing.conflict,
      receivedAt: now.toISOString(),
      via,
    };
    try {
      const path = await standingPath(contentDirectory);
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`);
        await rename(temporary, path);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      return true;
    } catch {
      return false;
    }
  });
  writes = result.catch(() => undefined);
  return result;
}

/* --- the workstation's push ----------------------------------------- */

/**
 * Short (39d review): the send waits inside the sync's turn, and a mirror's
 * editor on the LAN answers in milliseconds or not at all.
 */
export const STANDING_TIMEOUT_MS = 5_000;

export type StandingPushOutcome =
  | { status: "sent"; key: string }
  | { status: "unchanged" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; repeated: boolean };

/**
 * Tell one mirror's editor the standing state when it differs from what that
 * editor last accepted. Nothing sent yet counts as `clear` (a mirror shows
 * nothing until told), so a workstation that never hits a conflict never
 * sends. Never throws; a failure is recorded on the mirror's sync record
 * (`standingSent`) and retried after the next sync.
 *
 * A `200 {kept: false}` is a failure too (39d review): the mirror holds a
 * newer state than this one, so it was not told this — the Mirrors card must
 * not say it was. The next sync's state is newer and is sent again; if the
 * mirror keeps refusing (its copy claims a later time than this clock), the
 * same error is logged once, like any repeated failure.
 */
export async function pushStanding(
  contentDirectory: string,
  target: MirrorTarget,
  { timeoutMs = STANDING_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<StandingPushOutcome> {
  const record = (await readSyncState(contentDirectory))[target.remote];
  if (!record) return { status: "skipped", reason: "no sync recorded yet" };
  const standing = standingOf(record);
  const key = standingKey(standing);
  const previous = record.standingSent;
  if ((previous?.key ?? "clear") === key && !previous?.error) {
    return { status: "unchanged" };
  }
  const url = mirrorEditorUrl(target, await readSettings());
  const token = process.env.MIRROR_SYNC_TOKEN;
  if (!url || !token) {
    const reason = !url
      ? `no editor URL for ${target.remote} (set mirrorUrls.${target.remote} in settings)`
      : "MIRROR_SYNC_TOKEN is not set on this workstation";
    if (previous?.error !== reason) {
      await patchMirrorState(contentDirectory, target.remote, {
        standingSent: {
          at: new Date().toISOString(),
          ...(previous?.key ? { key: previous.key } : {}),
          error: reason,
        },
      });
    }
    return { status: "skipped", reason };
  }
  let error: string | undefined;
  try {
    const response = await fetch(`${url}/api/git/standing`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(standing),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    const body = (await response.json().catch(() => ({}))) as {
      kept?: unknown;
      error?: { message?: string };
    };
    if (!response.ok) {
      error = `${response.status}: ${body.error?.message ?? response.statusText}`;
    } else if (body.kept === false) {
      /* Without this send's time, so a refusal that persists reads as
       * repeated and is logged once. */
      error = "it holds a newer state than this one";
    }
  } catch (caught) {
    error = `${new URL(url).host} not reached: ${
      caught instanceof Error ? caught.message : String(caught)
    }`;
  }
  await patchMirrorState(contentDirectory, target.remote, {
    standingSent: error
      ? {
          at: new Date().toISOString(),
          ...(previous?.key ? { key: previous.key } : {}),
          error,
        }
      : { at: new Date().toISOString(), key },
  });
  return error
    ? { status: "failed", error, repeated: previous?.error === error }
    : { status: "sent", key };
}
