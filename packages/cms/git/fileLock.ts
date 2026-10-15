/**
 * A cross-process lock file, created whole with `link()` — the primitive
 * under the write lock (epic 34, D6), extracted so other locks (epic 37's
 * queue slots) share it rather than copy it.
 *
 * - **Created whole.** The record is written to a temp file and `link`ed to
 *   the lock path, which fails if the path exists: there is never an empty
 *   or half-written lock to misjudge.
 * - **The record** names its owner: an id (under a key the caller chooses —
 *   the write lock's is `writeId`), the pid, the host, the pid namespace
 *   (`/proc/self/ns/pid`) and a per-process nonce, plus whatever else the
 *   caller adds (`op`, `startedAt`).
 * - **Stale** when its mtime is older than `staleMs`, or — only when the
 *   owner shares this host *and* this pid namespace — when its pid is dead,
 *   or is this process's own pid without this process's nonce or a hold it
 *   still has (`ownHold`). A host match alone is not enough: the Pi's editor
 *   runs in Docker with `--network host`, so the same hostname, its own pid
 *   namespace.
 * - **Heartbeat**: the owner touches the file's mtime while it holds it.
 * - **Taken over** by renaming it aside first, so of two processes taking
 *   over one stale lock exactly one moves it.
 * - **Released** only while the file still holds the owner's id.
 */
import { readlinkSync } from "node:fs";
import {
  link,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { ulid } from "../util/ulid";

/** The fields every lock record carries; callers add their own. */
export interface LockRecord {
  pid: number;
  host: string;
  /** `/proc/self/ns/pid`'s target, or null where there is none. */
  pidns?: string | null;
  /** Random per process: tells a reused pid from the process that wrote it. */
  nonce?: string;
}

/** A record's field by name — its id lives under a key the caller chooses. */
function field(record: LockRecord | null | undefined, key: string): unknown {
  return record
    ? (record as unknown as Record<string, unknown>)[key]
    : undefined;
}

export interface LockFileState<R extends LockRecord = LockRecord> {
  raw: string;
  /** The parsed record, or null for a file that is not one of ours. */
  owner: R | null;
  mtimeMs: number;
}

/** This process's nonce: one per process, shared by every lock it takes. */
export const PROCESS_NONCE = ulid();

let pidNamespace: string | null | undefined;
export function ownPidNamespace(): string | null {
  if (pidNamespace === undefined) {
    try {
      pidNamespace = readlinkSync("/proc/self/ns/pid");
    } catch {
      pidNamespace = null;
    }
  }
  return pidNamespace;
}

/** This process, as a lock record (or a job's meta) names it. */
export function processIdentity(): Required<
  Pick<LockRecord, "pid" | "host" | "pidns" | "nonce">
> {
  return {
    pid: process.pid,
    host: hostname(),
    pidns: ownPidNamespace(),
    nonce: PROCESS_NONCE,
  };
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Whether the process a record names is gone: `true` when it can be judged
 * from here and is dead (or is a previous process that had this pid), `false`
 * when it is alive, `undefined` when it cannot be judged — another host, or
 * another pid namespace (a container). `ownHold` answers for a record with
 * this process's pid and nonce: does this process still hold what the
 * record says it holds? Without it, this process counts as alive.
 */
export function processGone(
  record: Pick<LockRecord, "pid" | "host" | "pidns" | "nonce">,
  ownHold?: () => boolean,
): boolean | undefined {
  if (record.host !== hostname()) return undefined;
  const ns = ownPidNamespace();
  if (!ns || record.pidns !== ns) return undefined;
  if (!Number.isInteger(record.pid) || record.pid <= 0) return undefined;
  if (record.pid === process.pid) {
    if (record.nonce !== PROCESS_NONCE) return true;
    return ownHold ? !ownHold() : false;
  }
  return !pidAlive(record.pid);
}

/**
 * The lock at `path`, or null when there is none. A file that does not
 * parse, or has no string `idKey`, has a null `owner`: it is judged by its
 * mtime alone.
 */
export async function readLockFile<R extends LockRecord = LockRecord>(
  path: string,
  idKey: string,
): Promise<LockFileState<R> | null> {
  try {
    const [raw, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    let owner: R | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed[idKey] === "string") owner = parsed;
    } catch {
      /* Not ours (hand-made, or torn by a full disk). */
    }
    return { raw, owner, mtimeMs: info.mtimeMs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export interface StaleOptions {
  staleMs: number;
  /** This process still holds the lock (see `processGone`). */
  ownHold?: () => boolean;
}

export function isLockStale(
  state: LockFileState,
  { staleMs, ownHold }: StaleOptions,
): boolean {
  if (Date.now() - state.mtimeMs > staleMs) return true;
  if (!state.owner) return false;
  return processGone(state.owner, ownHold) === true;
}

/**
 * Create the lock whole, or report that one exists. The temp file is
 * `<path>.<tag>.new`, so a sweep can recognise a waiter's leftovers.
 */
export async function tryCreateLock(
  path: string,
  record: LockRecord,
  tag: string,
): Promise<boolean> {
  const temporary = `${path}.${tag}.new`;
  await writeFile(temporary, JSON.stringify(record));
  try {
    await link(temporary, path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    /*
     * Our temp file vanished before the link — a sweep, or a hand cleanup.
     * Nothing was taken; the caller's loop writes it again.
     */
    if (code === "ENOENT") return false;
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * Move a stale lock aside and delete it. The rename is atomic, so of two
 * processes taking over the same stale lock one moves it; the other finds it
 * gone — or, in a microsecond window, moves the winner's fresh lock, which it
 * notices and links back. A failed link-back is logged; the winner's
 * ownership check (the file still holds its id) then stops it.
 */
export async function takeOverLock(
  path: string,
  stale: LockFileState,
): Promise<void> {
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
          `[discontent] lock ${path}: moved a live lock aside while taking over a stale one, and could not put it back (${
            (error as NodeJS.ErrnoException).code ?? error
          }); its holder will find it is no longer the owner.`,
        );
      });
    }
  } finally {
    await rm(aside, { force: true });
  }
}

/** Waiting for a lock ran out of time; `state` is who held it last. */
export class LockTimeoutError extends Error {
  constructor(
    readonly path: string,
    readonly state: LockFileState | null,
  ) {
    super(`Timed out waiting for the lock ${path}`);
    this.name = "LockTimeoutError";
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

export interface AcquireOptions extends StaleOptions {
  /** The record's id field, and this acquisition's id under it. */
  idKey: string;
  /** Epoch milliseconds; past it, `LockTimeoutError`. */
  deadline: number;
  signal?: AbortSignal;
}

/**
 * Take the lock: create it, or take a stale one over, or wait with jittered
 * backoff (20 ms doubling to 500 ms) until `deadline`. Resolves with whether
 * a stale lock had to be taken over; throws `LockTimeoutError`, or the
 * signal's reason when it aborts.
 */
export async function acquireLock(
  path: string,
  record: LockRecord,
  { idKey, deadline, staleMs, ownHold, signal }: AcquireOptions,
): Promise<{ tookOver: boolean }> {
  const tag = String(field(record, idKey));
  let tookOver = false;
  let delay = 20;
  for (;;) {
    signal?.throwIfAborted();
    if (await tryCreateLock(path, record, tag)) return { tookOver };
    const state = await readLockFile(path, idKey);
    if (!state) continue;
    if (isLockStale(state, { staleMs, ownHold })) {
      await takeOverLock(path, state);
      tookOver = true;
      continue;
    }
    const now = Date.now();
    if (now >= deadline) throw new LockTimeoutError(path, state);
    await sleep(Math.min(delay * (0.5 + Math.random()), deadline - now));
    delay = Math.min(delay * 2, 500);
  }
}

/** Remove the lock, but only while it still holds `id`. */
export async function releaseLock(
  path: string,
  idKey: string,
  id: string,
): Promise<void> {
  const state = await readLockFile(path, idKey).catch(() => null);
  if (field(state?.owner, idKey) === id) await rm(path, { force: true });
}

/**
 * Touch the lock's mtime every `everyMs` while it still holds `id`; the
 * returned function stops it. The timer is `unref`ed: a heartbeat never
 * keeps a process alive.
 */
export function startLockHeartbeat(
  path: string,
  idKey: string,
  id: string,
  everyMs: number,
): () => void {
  const timer = setInterval(() => {
    void readLockFile(path, idKey)
      .then((state) => {
        if (field(state?.owner, idKey) !== id) return;
        const now = new Date();
        return utimes(path, now, now);
      })
      .catch(() => undefined);
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Whether the lock at `path` holds `id` now. */
export async function lockHeldBy(
  path: string,
  idKey: string,
  id: string,
): Promise<boolean> {
  const state = await readLockFile(path, idKey).catch(() => null);
  return field(state?.owner, idKey) === id;
}
