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
import { readlinkSync } from "node:fs";
import {
  link,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { ulid } from "../util/ulid";
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

const NONCE = ulid();
let pidNamespace: string | null | undefined;
function ownPidNamespace(): string | null {
  if (pidNamespace === undefined) {
    try {
      pidNamespace = readlinkSync("/proc/self/ns/pid");
    } catch {
      pidNamespace = null;
    }
  }
  return pidNamespace;
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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

interface LockState {
  raw: string;
  holder: WriteLockHolder | null;
  mtimeMs: number;
}

async function readLock(path: string): Promise<LockState | null> {
  try {
    const [raw, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    let holder: WriteLockHolder | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.writeId === "string") holder = parsed;
    } catch {
      /* Not ours (hand-made, or torn by a full disk): judged by mtime alone. */
    }
    return { raw, holder, mtimeMs: info.mtimeMs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isStale(path: string, state: LockState, staleMs: number): boolean {
  if (Date.now() - state.mtimeMs > staleMs) return true;
  const { holder } = state;
  if (!holder || holder.host !== hostname()) return false;
  /* Pids only mean something inside one pid namespace. */
  const ns = ownPidNamespace();
  if (!ns || holder.pidns !== ns) return false;
  if (!Number.isInteger(holder.pid) || holder.pid <= 0) return false;
  if (holder.pid === process.pid) {
    /* Our pid: a previous process's (reused), or a hold we no longer have. */
    return holder.nonce !== NONCE || !activeHolds.has(path);
  }
  return !alive(holder.pid);
}

/**
 * Move a stale lock aside and delete it. The rename is atomic, so of two
 * processes taking over the same stale lock one moves it; the other finds it
 * gone — or, in a microsecond window, moves the winner's fresh lock, which it
 * notices and links back. A failed link-back is logged: the winner's
 * pre-commit ownership check (`writeLockStillHeld`) then stops its commit.
 */
async function takeOver(path: string, stale: LockState): Promise<void> {
  const aside = `${path}.${ulid()}.stale`;
  try {
    await rename(path, aside);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  try {
    const moved = await readFile(aside, "utf8").catch(() => stale.raw);
    if (moved !== stale.raw) {
      await link(aside, path).catch((error) => {
        console.warn(
          `[discontent] write lock: moved a live lock aside while taking over a stale one, and could not put it back (${
            (error as NodeJS.ErrnoException).code ?? error
          }); its holder will refuse to commit.`,
        );
      });
    }
  } finally {
    await rm(aside, { force: true });
  }
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
    throw new RepositoryBusyError(state?.holder ?? null, Date.now() - started);
  }
  return release;
}

/** Create the lock whole, or report that one exists. */
async function tryCreate(
  path: string,
  holder: WriteLockHolder,
): Promise<boolean> {
  const temporary = `${path}.${holder.writeId}.new`;
  await writeFile(temporary, JSON.stringify(holder));
  try {
    await link(temporary, path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    /*
     * Our temp file vanished before the link — an older build's sweep, or a
     * hand cleanup. Nothing was taken; the caller's loop writes it again.
     */
    if (code === "ENOENT") return false;
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Acquire the file; true when a stale lock had to be taken over. */
async function acquireFile(
  path: string,
  holder: WriteLockHolder,
  deadline: number,
  started: number,
  staleMs: number,
): Promise<boolean> {
  let tookOver = false;
  let delay = 20;
  for (;;) {
    if (await tryCreate(path, holder)) return tookOver;
    const state = await readLock(path);
    if (!state) continue;
    if (isStale(path, state, staleMs)) {
      await takeOver(path, state);
      tookOver = true;
      continue;
    }
    const now = Date.now();
    if (now >= deadline) {
      throw new RepositoryBusyError(state.holder, now - started);
    }
    await sleep(Math.min(delay * (0.5 + Math.random()), deadline - now));
    delay = Math.min(delay * 2, 500);
  }
}

async function releaseFile(path: string, writeId: string): Promise<void> {
  const state = await readLock(path).catch(() => null);
  if (state?.holder?.writeId === writeId) await rm(path, { force: true });
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

/** resolved content directory → the tail of its in-order entry chain. */
const entries = new Map<string, Promise<void>>();

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
 */
async function takePlace(
  contentDirectory: string,
  enqueue: (path: string) => Promise<() => void> | null,
): Promise<{ path: string; turn: Promise<() => void> } | null> {
  const lookup = lockPathFor(contentDirectory);
  /* An unawaited rejection would be unhandled until our turn comes. */
  lookup.catch(() => undefined);
  const key = resolve(contentDirectory);
  const previous = entries.get(key) ?? Promise.resolve();
  let leave!: () => void;
  const mine = new Promise<void>((done) => (leave = done));
  const tail = previous.then(() => mine);
  entries.set(key, tail);
  void tail.then(() => {
    if (entries.get(key) === tail) entries.delete(key);
  });
  try {
    await previous;
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

  const place = await takePlace(contentDirectory, (path) =>
    store?.get(path)?.active ? null : queueTurn(path, deadline, started),
  );
  if (!place) return fn();
  const { path } = place;
  const releaseTurn = await place.turn;
  try {
    const writeId = ulid();
    const tookOver = await acquireFile(
      path,
      {
        writeId,
        pid: process.pid,
        host: hostname(),
        pidns: ownPidNamespace(),
        nonce: NONCE,
        op,
        startedAt: Date.now(),
      },
      deadline,
      started,
      staleMs,
    );
    activeHolds.add(path);
    const heartbeat = setInterval(() => {
      void readLock(path)
        .then((state) => {
          if (state?.holder?.writeId !== writeId) return;
          const now = new Date();
          return utimes(path, now, now);
        })
        .catch(() => undefined);
    }, heartbeatMs);
    heartbeat.unref?.();
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
      clearInterval(heartbeat);
      await releaseFile(path, writeId);
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
  return state?.holder?.writeId === hold.writeId;
}

/** Who holds `contentDirectory`'s write lock now, if anyone (for status UIs). */
export async function readWriteLock(
  contentDirectory: string,
): Promise<WriteLockHolder | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  const state = await readLock(await writeLockPath(contentDirectory));
  return state?.holder ?? null;
}
