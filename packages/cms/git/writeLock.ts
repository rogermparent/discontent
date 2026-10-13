/**
 * One exclusive, cross-process write lock per content repository (epic 34,
 * D6).
 *
 * Every engine write — files, LMDB indexes, `.pagination-changes.json`, the
 * commit — runs inside `withWriteLock`, so two writers (the editor, the CLI,
 * the MCP server, a script) never interleave their steps on one repository.
 *
 * - **The file** is `discontent-write.lock` in the git directory (per
 *   worktree), created with `O_EXCL` and holding
 *   `{writeId, pid, host, op, startedAt}`.
 * - **Re-entrant** through `AsyncLocalStorage`: a nested call in the same
 *   async context just runs, so a seat that locks can call a write that locks
 *   (and the site's batch can wrap many writes in one scope).
 * - **In-process FIFO**: same-process waiters queue on a promise chain instead
 *   of polling the file against each other.
 * - **Heartbeat**: the holder touches the file's mtime every 10 s.
 * - **Stale** when its host is this host and its pid is dead, or its mtime is
 *   older than 60 s (which covers a holder in another pid namespace — the
 *   Pi's Docker container). A stale lock is taken over.
 * - **Waits** with jittered backoff up to `DISCONTENT_WRITE_LOCK_TIMEOUT_MS`
 *   (default 30 s), then throws `RepositoryBusyError` naming the holder.
 * - **Released** only while the file still holds this write's id.
 * - Not a repository (no `.git`): `fn` just runs, as a commit no-ops there.
 *
 * Lock order: the sync's repo lock (`instance/lock.ts`) first, then this
 * one. Writes never take the repo lock.
 *
 * Taking the lock fresh (not re-entrantly) also sweeps private indexes a dead
 * writer left behind (`discontent-index-<writeId>`, `commit.ts`): only a
 * holder makes them, so with the lock held none of them is live.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  link,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { ulid } from "../util/ulid";
import { directoryIsGitRepo, gitDirectory } from "./run";

export const WRITE_LOCK_NAME = "discontent-write.lock";
const PRIVATE_INDEX = /^discontent-index-[0-9A-HJKMNP-TV-Z]{26}(\.lock)?$/;

export interface WriteLockHolder {
  writeId: string;
  pid: number;
  host: string;
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
}
const held = new AsyncLocalStorage<Map<string, Hold>>();
/** lock file → the tail of this process's queue for it. */
const queues = new Map<string, Promise<void>>();

/**
 * The write id of the lock this async context holds (the innermost
 * repository's, should it hold two). Undefined outside a lock, and outside a
 * repository, where `withWriteLock` takes none.
 */
export function currentWriteId(): string | undefined {
  let id: string | undefined;
  for (const hold of held.getStore()?.values() ?? []) {
    if (hold.active) id = hold.writeId;
  }
  return id;
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
      /* Created but not yet written, or torn: judged by its mtime alone. */
    }
    return { raw, holder, mtimeMs: info.mtimeMs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isStale(state: LockState, staleMs: number): boolean {
  if (Date.now() - state.mtimeMs > staleMs) return true;
  const { holder } = state;
  return (
    holder !== null &&
    holder.host === hostname() &&
    Number.isInteger(holder.pid) &&
    holder.pid > 0 &&
    !alive(holder.pid)
  );
}

/**
 * Move a stale lock aside and delete it. The rename is atomic, so of two
 * processes taking over the same stale lock one moves it; the other finds it
 * gone (or, in a microsecond window, moves the winner's fresh lock — which it
 * notices and links back).
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
    if (moved !== stale.raw) await link(aside, path).catch(() => undefined);
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

async function acquireFile(
  path: string,
  holder: WriteLockHolder,
  deadline: number,
  started: number,
  staleMs: number,
): Promise<void> {
  let delay = 20;
  for (;;) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(JSON.stringify(holder));
      } finally {
        await handle.close();
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const state = await readLock(path);
    if (!state) continue;
    if (isStale(state, staleMs)) {
      await takeOver(path, state);
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

async function sweepPrivateIndexes(path: string): Promise<void> {
  const directory = join(path, "..");
  try {
    for (const name of await readdir(directory)) {
      if (PRIVATE_INDEX.test(name)) {
        await rm(join(directory, name), { force: true });
      }
    }
  } catch {
    /* Housekeeping only. */
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
  if (!(await directoryIsGitRepo(contentDirectory))) return fn();
  const path = await writeLockPath(contentDirectory);
  const store = held.getStore();
  if (store?.get(path)?.active) return fn();

  const started = Date.now();
  const deadline = started + (options.timeoutMs ?? timeoutFromEnv());
  const staleMs = options.staleMs ?? 60_000;
  const heartbeatMs = options.heartbeatMs ?? 10_000;

  const releaseTurn = await queueTurn(path, deadline, started);
  try {
    const writeId = ulid();
    await acquireFile(
      path,
      {
        writeId,
        pid: process.pid,
        host: hostname(),
        op,
        startedAt: Date.now(),
      },
      deadline,
      started,
      staleMs,
    );
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
    const hold: Hold = { writeId, active: true };
    try {
      await sweepPrivateIndexes(path);
      const next = new Map(store ?? []);
      next.set(path, hold);
      return await held.run(next, fn);
    } finally {
      hold.active = false;
      clearInterval(heartbeat);
      await releaseFile(path, writeId);
    }
  } finally {
    releaseTurn();
  }
}

/** Who holds `contentDirectory`'s write lock now, if anyone (for status UIs). */
export async function readWriteLock(
  contentDirectory: string,
): Promise<WriteLockHolder | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  const state = await readLock(await writeLockPath(contentDirectory));
  return state?.holder ?? null;
}
