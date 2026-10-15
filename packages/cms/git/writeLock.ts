/**
 * One exclusive, cross-process write lock per content repository (epic 34,
 * D6).
 *
 * Every engine write — files, LMDB indexes, `.pagination-changes.json`, the
 * commit — runs inside `withWriteLock`, so two writers (the editor, the CLI,
 * the MCP server, a script) never interleave their steps on one repository.
 *
 * - **The file** is `discontent-write.lock` in the git directory (per
 *   worktree), holding `{writeId, pid, host, pidns, nonce, op, startedAt}`.
 *   It is created whole: the record is written to a temp file and `link`ed to
 *   the lock path, which fails if it exists — so there is never an empty or
 *   half-written lock to misjudge.
 * - **Re-entrant** through `AsyncLocalStorage`: a nested call in the same
 *   async context just runs, so a seat that locks can call a write that locks
 *   (and the site's batch can wrap many writes in one scope).
 * - **In-process FIFO**: same-process waiters queue on a promise chain instead
 *   of polling the file against each other.
 * - **Heartbeat**: the holder touches the file's mtime every 10 s.
 * - **Stale** when its mtime is older than 60 s, or — only when the holder
 *   shares this host *and* this pid namespace (`/proc/self/ns/pid`) — when its
 *   pid is dead, or is this process's own pid without this process's nonce or
 *   hold. A host match alone is not enough: the Pi's editor runs in Docker
 *   with `--network host`, so the same hostname, its own pid namespace.
 * - **Waits** with jittered backoff up to `DISCONTENT_WRITE_LOCK_TIMEOUT_MS`
 *   (default 30 s), then throws `RepositoryBusyError` naming the holder.
 * - **Released** only while the file still holds this write's id.
 * - Not a repository (no `.git`): `fn` just runs, as a commit no-ops there.
 *
 * Lock order: the sync's repo lock (`instance/lock.ts`) first, then this
 * one. Writes never take the repo lock.
 *
 * Taking the lock fresh (not re-entrantly) also sweeps what a dead writer can
 * leave: private indexes (`discontent-index-<id>`, `commit.ts`) and lock temp
 * files older than the stale age — a waiter's `.new` file and the
 * as-if-flushed status's index are made outside the lock, so a young one may
 * be live — and, after a takeover or on this
 * process's first acquisition, untracked atomic-write temp files
 * (`.<name>.<writeId>.<n>.tmp`, `fs/atomicWrite.ts`) older than the stale age.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { realpathSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ulid } from "../util/ulid";
import {
  LockTimeoutError,
  acquireLock,
  processIdentity,
  readLockFile,
  releaseLock,
  startLockHeartbeat,
  type LockFileState,
} from "./fileLock";
import { directoryIsGitRepo, gitDirectory, runGit } from "./run";

export const WRITE_LOCK_NAME = "discontent-write.lock";
const GIT_DIR_LEFTOVER =
  /^(discontent-index-[0-9A-HJKMNP-TV-Z]{26}(\.lock)?|discontent-write\.lock\.[0-9A-HJKMNP-TV-Z]{26}\.(new|stale))$/;
/** `fs/atomicWrite.ts`'s temp names. */
export const ATOMIC_TEMP = /^\..+\.[0-9A-HJKMNP-TV-Z]{26}\.\d+\.tmp$/;

export interface WriteLockHolder {
  writeId: string;
  pid: number;
  host: string;
  /** `/proc/self/ns/pid`'s target, or null where there is none. */
  pidns?: string | null;
  /** Random per process: tells a reused pid from the process that wrote it. */
  nonce?: string;
  op: string;
  /** Epoch milliseconds. */
  startedAt: number;
}

export interface WriteLockOptions {
  /** Default `DISCONTENT_WRITE_LOCK_TIMEOUT_MS`, else 30 000. */
  timeoutMs?: number;
  /** Default 60 000. */
  staleMs?: number;
  /** Default 10 000. */
  heartbeatMs?: number;
}

function describeHolder(holder: WriteLockHolder | null) {
  if (!holder) return "another write";
  const age = Date.now() - holder.startedAt;
  return `"${holder.op}" (pid ${holder.pid} on ${holder.host}${
    Number.isFinite(age) ? `, ${(age / 1000).toFixed(1)} s old` : ""
  }, write ${holder.writeId})`;
}

export class RepositoryBusyError extends Error {
  constructor(
    readonly holder: WriteLockHolder | null,
    readonly waitedMs: number,
  ) {
    super(
      `The content repository is busy: ${describeHolder(holder)} holds its write lock; gave up after ${(
        waitedMs / 1000
      ).toFixed(1)} s. Retry shortly.`,
    );
    this.name = "RepositoryBusyError";
  }
}

/**
 * lock file → the hold this async context runs under. `active` drops at
 * release, so a task `fn` left running in the background cannot re-enter a
 * lock it no longer holds.
 */
interface Hold {
  writeId: string;
  active: boolean;
  /** `serialInHold`'s queue. */
  serial: Promise<void>;
}
const held = new AsyncLocalStorage<Map<string, Hold>>();
/** Lock files this process holds right now. */
const activeHolds = new Set<string>();
/** lock file → the tail of this process's queue for it. */
const queues = new Map<string, Promise<void>>();
/** Lock files whose work trees this process has swept for temp files. */
const sweptTemps = new Set<string>();

function currentHold(): Hold | undefined {
  let found: Hold | undefined;
  for (const hold of held.getStore()?.values() ?? []) {
    if (hold.active) found = hold;
  }
  return found;
}

/**
 * The write id of the lock this async context holds (the innermost
 * repository's, should it hold two). Undefined outside a lock, and outside a
 * repository, where `withWriteLock` takes none.
 */
export function currentWriteId(): string | undefined {
  return currentHold()?.writeId;
}

/**
 * Run `fn` after every earlier `serialInHold` call of the same hold, so two
 * commits started concurrently inside one lock scope cannot interleave.
 * Outside a hold it just runs.
 */
export function serialInHold<T>(fn: () => Promise<T>): Promise<T> {
  const hold = currentHold();
  if (!hold) return fn();
  const run = hold.serial.then(fn);
  hold.serial = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Run `fn` outside any hold — for work scheduled to outlive the scope. */
export function outsideWriteLock<T>(fn: () => T): T {
  return held.exit(fn);
}

export async function writeLockPath(contentDirectory: string): Promise<string> {
  return join(await gitDirectory(contentDirectory), WRITE_LOCK_NAME);
}

function timeoutFromEnv(): number {
  const raw = Number(process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
}

/** The lock record's id field (`fileLock.ts`). */
const ID_KEY = "writeId";

/**
 * The lock file as `fileLock.ts` reads it. A stale lock is taken over by
 * `takeOverLock`; a live lock moved aside in its microsecond window is
 * linked back, and should that fail, the winner's pre-commit ownership
 * check (`writeLockStillHeld`) stops its commit.
 */
function readLock(
  path: string,
): Promise<LockFileState<WriteLockHolder> | null> {
  return readLockFile<WriteLockHolder>(path, ID_KEY);
}

/** Our pid on the record: a previous process's (reused), or a hold we no longer have. */
function staleOptions(path: string, staleMs: number) {
  return { staleMs, ownHold: () => activeHolds.has(path) };
}

/** Wait for this process's earlier writers; resolve with this turn's release. */
async function queueTurn(
  path: string,
  deadline: number,
  started: number,
): Promise<() => void> {
  const previous = queues.get(path) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  queues.set(path, tail);
  void tail.then(() => {
    if (queues.get(path) === tail) queues.delete(path);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    previous.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(
        () => resolve(true),
        Math.max(0, deadline - Date.now()),
      );
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) {
    /* Keep the chain moving: our turn passes straight through. */
    void previous.then(release);
    const state = await readLock(path).catch(() => null);
    throw new RepositoryBusyError(state?.owner ?? null, Date.now() - started);
  }
  return release;
}

/**
 * Acquire the file (`fileLock.ts`: created whole with `link`, a stale one
 * taken over, jittered backoff to the deadline); true when a stale lock had
 * to be taken over.
 */
async function acquireFile(
  path: string,
  holder: WriteLockHolder,
  deadline: number,
  started: number,
  staleMs: number,
): Promise<boolean> {
  try {
    const { tookOver } = await acquireLock(path, holder, {
      idKey: ID_KEY,
      deadline,
      ...staleOptions(path, staleMs),
    });
    return tookOver;
  } catch (error) {
    if (error instanceof LockTimeoutError) {
      throw new RepositoryBusyError(
        (error.state?.owner as WriteLockHolder | null) ?? null,
        Date.now() - started,
      );
    }
    throw error;
  }
}

/**
 * Leftovers older than `staleMs` only: a waiter's `.new` lock file and a
 * private index made outside the lock (the as-if-flushed status) are live
 * while young, and deleting them broke a concurrent waiter (#217's CI).
 */
async function sweepGitDir(path: string, staleMs: number): Promise<void> {
  const directory = join(path, "..");
  try {
    for (const name of await readdir(directory)) {
      if (!GIT_DIR_LEFTOVER.test(name)) continue;
      const full = join(directory, name);
      const info = await stat(full).catch(() => null);
      if (info && Date.now() - info.mtimeMs > staleMs) {
        await rm(full, { force: true });
      }
    }
  } catch {
    /* Housekeeping only. */
  }
}

/** Untracked atomic-write temp files older than `staleMs`. */
async function sweepTempFiles(
  contentDirectory: string,
  staleMs: number,
): Promise<void> {
  try {
    const listed = await runGit(contentDirectory, [
      "ls-files",
      "-o",
      "-z",
      "--exclude-standard",
      "--",
      ":(glob)**/.*.tmp",
    ]);
    for (const file of listed.split("\0").filter(Boolean)) {
      if (!ATOMIC_TEMP.test(file.split("/").at(-1) ?? "")) continue;
      const full = join(contentDirectory, file);
      const info = await stat(full).catch(() => null);
      if (info && Date.now() - info.mtimeMs > staleMs) {
        await rm(full, { force: true });
      }
    }
  } catch {
    /* Housekeeping only. */
  }
}

/** real content directory → the tail of its in-order entry chain. */
const entries = new Map<string, Promise<void>>();
/** content directory as spelled → its real path, once it exists. */
const realDirectories = new Map<string, string>();

/**
 * The entry chain's key, synchronously (it must be taken before any await):
 * the real path, as the lock file's is, so a symlinked spelling and the real
 * one share one chain as they share one lock. Cached per spelling; a path
 * that does not exist yet keys on `resolve` and is looked up again next time.
 */
function entryKey(contentDirectory: string): string {
  const cached = realDirectories.get(contentDirectory);
  if (cached) return cached;
  try {
    const real = realpathSync(contentDirectory);
    realDirectories.set(contentDirectory, real);
    return real;
  } catch {
    return resolve(contentDirectory);
  }
}

/** `work`'s value, or null once `deadline` passes first. */
async function beforeDeadline<T>(
  work: Promise<T>,
  deadline: number,
): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then((value) => ({ value })),
      new Promise<null>((resolveTimer) => {
        timer = setTimeout(
          () => resolveTimer(null),
          Math.max(0, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The lock file, or null outside a repository. */
async function lockPathFor(contentDirectory: string): Promise<string | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  return writeLockPath(contentDirectory);
}

/**
 * Join the queue in call order. The lookups (`access`, the git directory)
 * resolve in any order, so a writer that enqueued once they finished could
 * pass one called before it — #223's CI saw a, b, d, c. Here the lookup
 * starts at once, but each call applies its result — `enqueue`, which must
 * take its queue place synchronously — only after every earlier call to the
 * same directory has applied its own. The chain is released right after
 * that, never held through a turn, so a re-entrant call cannot wait on it
 * behind its own hold. Null when there is nothing to queue for: outside a
 * repository, or when `enqueue` returns null (re-entry).
 *
 * **Bounded by the write's deadline.** Waiting on earlier callers is what can
 * take long — one whose lookup is stuck (a git subprocess on a loaded box)
 * holds up everyone behind it — so that wait races the deadline and ends in
 * `RepositoryBusyError`, like a wait for the queue or the file. A caller that
 * gives up leaves the chain at once, so the ones behind it wait on the stuck
 * caller only until their own deadlines, not forever. This call's own lookup
 * is not raced: it is one `access` and a cached git-dir lookup, no more
 * bounded than any other git call on the write path.
 */
async function takePlace(
  contentDirectory: string,
  deadline: number,
  started: number,
  enqueue: (path: string) => Promise<() => void> | null,
): Promise<{ path: string; turn: Promise<() => void> } | null> {
  const lookup = lockPathFor(contentDirectory);
  /* An unawaited rejection would be unhandled until our turn comes. */
  lookup.catch(() => undefined);
  const key = entryKey(contentDirectory);
  const previous = entries.get(key) ?? Promise.resolve();
  let leave!: () => void;
  /* Not `previous.then(...)`: a caller that times out must free the rest. */
  const tail = new Promise<void>((done) => (leave = done));
  entries.set(key, tail);
  void tail.then(() => {
    if (entries.get(key) === tail) entries.delete(key);
  });
  try {
    if (!(await beforeDeadline(previous, deadline))) {
      throw new RepositoryBusyError(null, Date.now() - started);
    }
    const path = await lookup;
    if (path === null) return null;
    const turn = enqueue(path);
    return turn ? { path, turn } : null;
  } finally {
    leave();
  }
}

/**
 * Run `fn` holding `contentDirectory`'s write lock. `op` names the write in
 * the lock file and in a `RepositoryBusyError` another writer sees.
 */
export async function withWriteLock<T>(
  contentDirectory: string,
  op: string,
  fn: () => Promise<T>,
  options: WriteLockOptions = {},
): Promise<T> {
  const store = held.getStore();
  const started = Date.now();
  const deadline = started + (options.timeoutMs ?? timeoutFromEnv());
  const staleMs = options.staleMs ?? 60_000;
  const heartbeatMs = options.heartbeatMs ?? 10_000;

  const place = await takePlace(contentDirectory, deadline, started, (path) =>
    store?.get(path)?.active ? null : queueTurn(path, deadline, started),
  );
  if (!place) return fn();
  const { path } = place;
  const releaseTurn = await place.turn;
  try {
    const writeId = ulid();
    const tookOver = await acquireFile(
      path,
      { writeId, ...processIdentity(), op, startedAt: Date.now() },
      deadline,
      started,
      staleMs,
    );
    activeHolds.add(path);
    const stopHeartbeat = startLockHeartbeat(
      path,
      ID_KEY,
      writeId,
      heartbeatMs,
    );
    const hold: Hold = { writeId, active: true, serial: Promise.resolve() };
    try {
      await sweepGitDir(path, staleMs);
      if (tookOver || !sweptTemps.has(path)) {
        sweptTemps.add(path);
        await sweepTempFiles(contentDirectory, staleMs);
      }
      const next = new Map(store ?? []);
      next.set(path, hold);
      return await held.run(next, fn);
    } finally {
      hold.active = false;
      activeHolds.delete(path);
      stopHeartbeat();
      await releaseLock(path, ID_KEY, writeId);
    }
  } finally {
    releaseTurn();
  }
}

/**
 * Whether this async context still holds `contentDirectory`'s lock — its hold
 * is active and the file still names it. `commit.ts` checks it right before
 * moving HEAD, so a write whose lock was taken over as stale (a 60 s stall)
 * never commits over the new holder. True outside a repository.
 */
export async function writeLockStillHeld(
  contentDirectory: string,
): Promise<boolean> {
  if (!(await directoryIsGitRepo(contentDirectory))) return true;
  const path = await writeLockPath(contentDirectory);
  const hold = held.getStore()?.get(path);
  if (!hold?.active) return false;
  const state = await readLock(path).catch(() => null);
  return state?.owner?.writeId === hold.writeId;
}

/** Who holds `contentDirectory`'s write lock now, if anyone (for status UIs). */
export async function readWriteLock(
  contentDirectory: string,
): Promise<WriteLockHolder | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  const state = await readLock(await writeLockPath(contentDirectory));
  return state?.owner ?? null;
}
