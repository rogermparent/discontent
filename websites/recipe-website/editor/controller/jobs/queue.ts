/**
 * The global queue (epic 37, D4; 37b): one slot per contended resource,
 * shared by every process of this user — the editor, the CLI, the stdio MCP
 * server — whatever checkout it runs from (`queueDirectory()`).
 *
 * Resources:
 *
 * - `gpu` — every `chatJson` call (the one GPU; D6's hooks run here);
 * - `ytdlp` — every `fetchYtdlpMetadata`;
 * - `site:<site>` — every paced request to a site (`SitePacer`), with the
 *   polite gap (30-D5) measured from the previous holder's release, in any
 *   process;
 * - `repo:<name>-<hash>` — one content repository's reindexes and git syncs
 *   (39b, `repoResource`), held for the whole job, not per call.
 *
 * A resource is taken **around each call that uses it** (`withResource`),
 * never for a whole job, so a page fetch never waits behind another job's
 * model call.
 *
 * **On disk**, under `<queue dir>/<resource>/`:
 *
 * - `waiters/<id>.json` — one small file per waiter (pid, host, pid
 *   namespace, nonce, tier, since, the job's id). One file each, not the
 *   job meta's `waiting` (D4 amended): a waiter need not be a job, and a
 *   reader lists one directory instead of every meta. The job's meta mirrors
 *   it (`JobContext.waiting`) for display.
 * - `slot.lock` — the holder, through `fileLock` (created whole with
 *   `link()`, heartbeat every `SLOT_HEARTBEAT_MS`).
 * - `state.json` — `lastRelease`, the clock the gap is measured from.
 * - `dropped.json` — a site's only (38b): refused twice, so dropped until
 *   `until` (`SitePacer`'s drop, shared by every process). A file of its
 *   own, not a field of `state.json`: `touchResource` rewrites that one
 *   without holding the slot, and would race a drop away.
 *
 * **The grant rule** (D4): a waiter takes the slot when it is the first
 * live waiter by `(tier, since)` — `interactive` before `batch` — and it
 * creates the slot lock. A waiter is dead when its process is provably gone
 * (`processGone`: same host and pid namespace, pid dead or reused), or when
 * its file has not been touched for `WAITER_STALE_MS` (it touches it at every
 * poll) — the rule that judges a waiter from another pid namespace (the Pi's
 * container after a restart) and never lets one block the line forever.
 * Whoever sees a dead waiter deletes it. A slot holder is stale when its
 * process is gone or its heartbeat is older than `SLOT_STALE_MS`; the next
 * waiter takes it over.
 *
 * Waiters poll every 250–500 ms (jittered; `RECIPE_QUEUE_POLL_MS` sets the
 * base, for tests). A wait honours the job's signal: a cancel removes the
 * waiter's file and rejects with the abort's reason.
 *
 * **Re-entrancy**: `withResource` runs its function with the resource marked
 * held in the async context, so a call that would take it again inside —
 * a `chatJson` inside a step that already holds `gpu` — passes straight
 * through instead of waiting for itself.
 *
 * **Logging**: a call that had to wait — for the slot, or for a site's gap —
 * is a `queue.wait` step (resource, tier, position at enqueue, `waitedMs`,
 * `gapMs`); a call granted at once logs nothing, as `pace.wait` does.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "@discontent/cms/fs/atomicWrite";
import {
  isLockStale,
  processGone,
  processIdentity,
  readLockFile,
  releaseLock,
  startLockHeartbeat,
  takeOverLock,
  tryCreateLock,
  type LockFileState,
  type LockRecord,
} from "@discontent/cms/git/fileLock";
import { ulid } from "@discontent/cms/util/ulid";
import { jobContext, type JobRun, type JobTier } from "./context";
import type { JobLog } from "./log";
import { gpuGranted, gpuReleased } from "./gpuHooks";
import { queueDirectory } from "./location";

/** `gpu`, `ytdlp`, or `site:<site>`. */
export type QueueResource = string;

/** The base poll interval; each wait is this plus up to this again. */
export const QUEUE_POLL_MS = 250;
/** A slot holder whose heartbeat is older than this is freed. */
export const SLOT_STALE_MS = 60_000;
/** How often a holder touches its slot lock. */
export const SLOT_HEARTBEAT_MS = 5_000;
/** A waiter whose file has not been touched for this long is dead. */
export const WAITER_STALE_MS = 30_000;

const SLOT = "slot.lock";
const STATE = "state.json";
const DROPPED = "dropped.json";
const WAITERS = "waiters";
/** The slot lock record's id field. */
export const SLOT_ID_KEY = "holderId";

const TIER_RANK: Record<JobTier, number> = { interactive: 0, batch: 1 };

/** One waiter's file. */
export interface WaiterRecord extends LockRecord {
  waiterId: string;
  resource: string;
  tier: JobTier;
  /** Epoch ms: when it joined the queue. */
  since: number;
  jobId?: string;
  pidns: string | null;
  nonce: string;
}

/** The slot lock's record: who holds it, since when. */
export interface SlotRecord extends LockRecord {
  holderId: string;
  resource: string;
  tier: JobTier;
  /** Epoch ms: when it was granted. */
  since: number;
  jobId?: string;
  /** Why a holder that is not a caller holds it (the release hook). */
  purpose?: string;
}

export interface ResourceState {
  /** Epoch ms: when the last holder let go (the gap's clock). */
  lastRelease?: number;
}

export function siteResource(site: string): QueueResource {
  return `site:${site}`;
}

/**
 * One content repository's line (39b, epic 39 D2): reindexes and git syncs
 * of that repository wait here, one at a time, in any process.
 *
 * **Keyed per repository**, not one `repo` slot: the queue is machine-wide
 * (37b), so a single slot would put a CLI reindex of a scratch clone behind
 * the workstation editor's sync of the real repository. The key is the
 * directory as the filesystem resolves it (the editor's `content` symlink
 * and the path it points at are one line), shown as its name plus a short
 * hash: `repo:recipe-content-1a2b3c4d`.
 */
export function repoResource(contentDirectory: string): QueueResource {
  const absolute = path.resolve(contentDirectory);
  let real = absolute;
  try {
    real = realpathSync.native(absolute);
  } catch {
    /* Not there (yet): the path as given. */
  }
  const hash = createHash("sha256").update(real).digest("hex").slice(0, 8);
  return `repo:${path.basename(real) || "root"}-${hash}`;
}

/** A resource as a directory name: anything but `[A-Za-z0-9.-]` escaped. */
export function resourceDirName(resource: QueueResource): string {
  return resource.replace(
    /[^A-Za-z0-9.-]/g,
    (char) => `_${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
}

export function resourceDirectory(
  resource: QueueResource,
  dir: string = queueDirectory(),
): string {
  return path.join(dir, resourceDirName(resource));
}

export function slotLockPath(resourceDir: string): string {
  return path.join(resourceDir, SLOT);
}

/* ------------------------------------------------------------------ */
/* This process's holds (on globalThis: Next's bundles share them)     */
/* ------------------------------------------------------------------ */

interface QueueGlobal {
  /** The slot ids this process holds now. */
  __discontentQueueHolds?: Set<string>;
  /** The waiter ids this process is waiting with now. */
  __discontentQueueWaiters?: Set<string>;
  /** The resources held in the current async context (re-entrancy). */
  __discontentQueueHeld?: AsyncLocalStorage<ReadonlySet<string>>;
  /** Said once: the queue dir could not be written. */
  __discontentQueueWarned?: boolean;
}

function queueGlobal(): QueueGlobal {
  return globalThis as QueueGlobal;
}

/** Slot ids this process holds: `ownHold` for its own records. */
export function processHolds(): Set<string> {
  return (queueGlobal().__discontentQueueHolds ??= new Set());
}

function processWaiters(): Set<string> {
  return (queueGlobal().__discontentQueueWaiters ??= new Set());
}

function heldStorage(): AsyncLocalStorage<ReadonlySet<string>> {
  return (queueGlobal().__discontentQueueHeld ??= new AsyncLocalStorage());
}

function heldKey(dir: string, resource: QueueResource): string {
  return `${dir}\0${resource}`;
}

/**
 * Run `fn` with no resource counted as held (39b): for work started inside
 * a hold that outlives it — a sync's `finally` kicking the instance's
 * rebuild — which would otherwise pass straight through the line as if it
 * still held the slot, after the slot is gone.
 */
export function outsideQueue<T>(fn: () => T): T {
  return heldStorage().exit(fn);
}

/** Whether the current async context already holds `resource`. */
export function holdsHere(
  resource: QueueResource,
  dir: string = queueDirectory(),
): boolean {
  return heldStorage().getStore()?.has(heldKey(dir, resource)) ?? false;
}

/**
 * Create `resource`'s slot lock as this process's hold. The id goes into
 * `processHolds` **before** the lock exists and leaves it only if the lock
 * was not created — so no look from this process (another waiter's poll, a
 * snapshot) ever sees the fresh lock, with this process's pid and nonce,
 * while the hold is unregistered, judges it a previous process's and takes
 * it over: a double grant (37b review). The release side keeps the same
 * order: the id is dropped only once the lock is gone (`letGo`,
 * `maybeReleaseGpu`).
 */
export async function createSlotLock(
  lockPath: string,
  record: SlotRecord,
): Promise<boolean> {
  const holds = processHolds();
  holds.add(record.holderId);
  let created = false;
  try {
    created = await tryCreateLock(lockPath, record, record.holderId);
    return created;
  } finally {
    if (!created) holds.delete(record.holderId);
  }
}

/* ------------------------------------------------------------------ */
/* Reading the queue                                                   */
/* ------------------------------------------------------------------ */

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const stop = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", stop);
        resolve();
      },
      Math.max(0, ms),
    );
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** `RECIPE_QUEUE_POLL_MS` (tests), else `QUEUE_POLL_MS`; jittered up to ×2. */
function pollDelay(): number {
  const raw = Number(process.env.RECIPE_QUEUE_POLL_MS?.trim());
  const base = Number.isFinite(raw) && raw > 0 ? raw : QUEUE_POLL_MS;
  return base + Math.random() * base;
}

function compareWaiters(a: WaiterRecord, b: WaiterRecord): number {
  return (
    TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
    a.since - b.since ||
    (a.waiterId < b.waiterId ? -1 : a.waiterId > b.waiterId ? 1 : 0)
  );
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code;
}

/**
 * The live waiters of a resource, first in line first. Dead ones — a gone
 * process, or a file untouched for `staleMs` — are deleted on the way.
 */
export async function liveWaiters(
  resourceDir: string,
  { now = Date.now(), staleMs = WAITER_STALE_MS } = {},
): Promise<WaiterRecord[]> {
  const waitersDir = path.join(resourceDir, WAITERS);
  let names: string[];
  try {
    names = await readdir(waitersDir);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
  const live: WaiterRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const file = path.join(waitersDir, name);
    let raw: string;
    let mtimeMs: number;
    try {
      [raw, { mtimeMs }] = await Promise.all([
        readFile(file, "utf8"),
        stat(file),
      ]);
    } catch {
      continue; /* Gone while we looked. */
    }
    let record: WaiterRecord | undefined;
    try {
      const parsed = JSON.parse(raw) as WaiterRecord;
      if (parsed && typeof parsed.waiterId === "string") record = parsed;
    } catch {
      /* Not one of ours: judged by its age alone. */
    }
    const stale = now - mtimeMs > staleMs;
    const gone =
      record &&
      processGone(record, () => processWaiters().has(record.waiterId)) === true;
    if (stale || gone) {
      await rm(file, { force: true });
      continue;
    }
    if (record && TIER_RANK[record.tier] !== undefined) live.push(record);
  }
  return live.sort(compareWaiters);
}

/**
 * The slot's holder, or null when it is free. A stale holder (its process
 * gone, or its heartbeat older than `staleMs`) is taken over — deleted —
 * and the slot answers free.
 */
export async function currentHolder(
  resourceDir: string,
  { staleMs = SLOT_STALE_MS } = {},
): Promise<LockFileState<SlotRecord> | null> {
  const lockPath = slotLockPath(resourceDir);
  const state = await readLockFile<SlotRecord>(lockPath, SLOT_ID_KEY);
  if (!state) return null;
  const stale = isLockStale(state, {
    staleMs,
    ownHold: () => !!state.owner && processHolds().has(state.owner.holderId),
  });
  if (!stale) return state;
  await takeOverLock(lockPath, state);
  return null;
}

export async function readResourceState(
  resourceDir: string,
): Promise<ResourceState> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(resourceDir, STATE), "utf8"),
    ) as ResourceState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeResourceState(
  resourceDir: string,
  state: ResourceState,
): Promise<void> {
  await writeJsonAtomic(path.join(resourceDir, STATE), state);
}

/**
 * Advance a resource's clock without holding it: a redirect's final site
 * was just requested too (`SitePacer`). Never moves it back.
 */
export async function touchResource(
  resource: QueueResource,
  at = Date.now(),
  dir: string = queueDirectory(),
): Promise<void> {
  const resourceDir = resourceDirectory(resource, dir);
  const state = await readResourceState(resourceDir);
  if ((state.lastRelease ?? 0) >= at) return;
  await mkdir(resourceDir, { recursive: true });
  await writeResourceState(resourceDir, { ...state, lastRelease: at });
}

/** A site refused twice (`SitePacer`, 30-D5): not asked again until `until`. */
export interface SiteDrop {
  /** Epoch ms. */
  until: number;
  reason: string;
}

/** A resource's drop, if it has one that has not run out (38b). */
export async function readSiteDrop(
  resource: QueueResource,
  dir: string = queueDirectory(),
  now = Date.now(),
): Promise<SiteDrop | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(
        path.join(resourceDirectory(resource, dir), DROPPED),
        "utf8",
      ),
    ) as Partial<SiteDrop> | null;
    if (
      parsed &&
      typeof parsed.until === "number" &&
      typeof parsed.reason === "string" &&
      parsed.until > now
    ) {
      return { until: parsed.until, reason: parsed.reason };
    }
  } catch {
    /* None, or not one of ours. */
  }
  return undefined;
}

/**
 * Drop a resource (a site) for every process until `drop.until` (38b). A
 * drop still running is kept, as a process keeps its first: the first
 * refusal's reason and clock stand.
 */
export async function writeSiteDrop(
  resource: QueueResource,
  drop: SiteDrop,
  dir: string = queueDirectory(),
): Promise<void> {
  if (await readSiteDrop(resource, dir)) return;
  const resourceDir = resourceDirectory(resource, dir);
  await mkdir(resourceDir, { recursive: true });
  await writeJsonAtomic(path.join(resourceDir, DROPPED), {
    until: drop.until,
    reason: drop.reason,
  });
}

export interface QueueSnapshot {
  resource: QueueResource;
  holder?: SlotRecord;
  /** Live waiters, first in line first. */
  waiters: WaiterRecord[];
  lastRelease?: number;
}

/** One resource's holder and line, as 37c's `/jobs` page shows them. */
export async function queueSnapshot(
  resource: QueueResource,
  dir: string = queueDirectory(),
): Promise<QueueSnapshot> {
  const resourceDir = resourceDirectory(resource, dir);
  const [holder, waiters, state] = await Promise.all([
    currentHolder(resourceDir),
    liveWaiters(resourceDir),
    readResourceState(resourceDir),
  ]);
  return {
    resource,
    ...(holder?.owner ? { holder: holder.owner } : {}),
    waiters,
    ...(state.lastRelease !== undefined
      ? { lastRelease: state.lastRelease }
      : {}),
  };
}

/** Every resource the queue has seen, by its directory. */
async function resourceDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
}

/** Every resource with a holder or a line (37c's per-resource view). */
export async function queueSnapshots(
  dir: string = queueDirectory(),
): Promise<QueueSnapshot[]> {
  const out: QueueSnapshot[] = [];
  for (const resourceDir of await resourceDirs(dir)) {
    const [holder, waiters] = await Promise.all([
      currentHolder(resourceDir),
      liveWaiters(resourceDir),
    ]);
    const resource = holder?.owner?.resource ?? waiters[0]?.resource;
    if (!resource) continue;
    out.push({
      resource,
      ...(holder?.owner ? { holder: holder.owner } : {}),
      waiters,
    });
  }
  return out;
}

/** A site's directory idle longer than this is pruned by the sweep. */
export const SITE_IDLE_PRUNE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a resource directory is a site's (`site:<site>`, escaped) that has
 * been idle for `SITE_IDLE_PRUNE_MS`: no holder, no waiter file at all, and
 * its clock — `lastRelease`, else the directory's own mtime — a day old.
 * `gpu` and `ytdlp` are never pruned (a handful of files, and `gpu` keeps
 * the hooks' spell).
 */
async function idleSiteDirectory(
  resourceDir: string,
  now: number,
): Promise<boolean> {
  /* A repository's line (39b) too: one per scratch clone ever reindexed. */
  const name = path.basename(resourceDir);
  if (
    !name.startsWith(resourceDirName("site:")) &&
    !name.startsWith(resourceDirName("repo:"))
  ) {
    return false;
  }
  if (await readLockFile(slotLockPath(resourceDir), SLOT_ID_KEY)) return false;
  const waiters = await readdir(path.join(resourceDir, WAITERS)).catch(
    () => [] as string[],
  );
  if (waiters.length > 0) return false;
  const { lastRelease } = await readResourceState(resourceDir);
  const clock =
    lastRelease ?? (await stat(resourceDir).catch(() => null))?.mtimeMs;
  return clock !== undefined && now - clock > SITE_IDLE_PRUNE_MS;
}

/**
 * The boot sweep's half for the queue (D5): dead waiters dropped, stale
 * slot locks freed, and sites idle for a day pruned (one small directory
 * per site ever fetched would otherwise pile up). Answers how many of each.
 *
 * A prune racing a process that joins that site's line in the same instant
 * is covered by the waiter's own recovery: a waiter that finds its file gone
 * writes it again (its parent directory too) and keeps its place. What is
 * left — the directory removed between a waiter's look and its slot lock's
 * temp write, which then fails that one request — needs a site idle for a
 * day to be fetched in the microseconds of a sweep: accepted.
 */
export async function sweepQueue(
  dir: string = queueDirectory(),
  { now = Date.now() }: { now?: number } = {},
): Promise<{ waiters: number; slots: number; sites: number }> {
  let waiters = 0;
  let slots = 0;
  let sites = 0;
  for (const resourceDir of await resourceDirs(dir)) {
    const waitersDir = path.join(resourceDir, WAITERS);
    const before = (
      await readdir(waitersDir).catch(() => [] as string[])
    ).filter((name) => name.endsWith(".json") && !name.startsWith(".")).length;
    waiters += before - (await liveWaiters(resourceDir)).length;
    const had = await readLockFile(slotLockPath(resourceDir), SLOT_ID_KEY);
    if (had && !(await currentHolder(resourceDir))) slots += 1;
    if (await idleSiteDirectory(resourceDir, now)) {
      await rm(resourceDir, { recursive: true, force: true });
      sites += 1;
    }
  }
  return { waiters, slots, sites };
}

/* ------------------------------------------------------------------ */
/* Taking a resource                                                   */
/* ------------------------------------------------------------------ */

export interface AcquireOptions extends JobRun {
  /**
   * The least time from the previous holder's release to this grant (a
   * site's polite gap); 0 for none.
   */
  gapMs?: number;
  /** Default `queueDirectory()`. */
  dir?: string;
}

/**
 * Said once per grant: a holder's heartbeat found the slot no longer its own
 * — taken over as stale while this process was suspended (a laptop lid, a
 * stopped terminal) past `SLOT_STALE_MS`. The call goes on; another holder
 * may be using the resource beside it.
 */
function lostSlot(
  resource: QueueResource,
  state: LockFileState | null,
  log: JobLog,
): void {
  const holder = (state?.owner as SlotRecord | null | undefined)?.holderId;
  const message = `the ${resource} slot was taken over while this process held it${
    holder ? ` (now ${holder})` : ""
  } — suspended past the stale limit? The call goes on unqueued`;
  if (log.live) log.warn("queue.lost", message, { resource });
  else console.warn(`[queue] ${message}`);
}

/** A held resource. `release` is idempotent. */
export interface ResourceGrant {
  resource: QueueResource;
  /** From joining the queue to the grant (0 when it was free). */
  waitedMs: number;
  /** D6: this grant started a GPU spell and ran the acquire hook. */
  hookRan: boolean;
  /** The caller's context already held it: nothing was taken. */
  passThrough: boolean;
  /**
   * Let go: the clock is stamped (unless `used: false` — nothing was done
   * with it, so the gap does not start again), the lock removed, the GPU's
   * idle timer set.
   */
  release(options?: { used?: boolean }): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

function passThroughGrant(resource: QueueResource): ResourceGrant {
  const release = async () => {};
  return {
    resource,
    waitedMs: 0,
    hookRan: false,
    passThrough: true,
    release,
    [Symbol.asyncDispose]: release,
  };
}

/**
 * Join `resource`'s queue and wait for the slot (D4). Resolves with the
 * grant — `release()` it in a `finally` (or `await using`), or use
 * `withResource`. Rejects with the signal's reason when the job is
 * cancelled while it waits; its place in line is removed.
 */
export async function acquire(
  resource: QueueResource,
  options: AcquireOptions = {},
): Promise<ResourceGrant> {
  const { dir = queueDirectory(), gapMs = 0 } = options;
  const job = jobContext(options);
  if (holdsHere(resource, dir)) return passThroughGrant(resource);
  const { signal, log, tier } = job;
  signal?.throwIfAborted();

  const resourceDir = resourceDirectory(resource, dir);
  const lockPath = slotLockPath(resourceDir);
  const waitersDir = path.join(resourceDir, WAITERS);

  const self = processIdentity();
  const enqueued = Date.now();
  const id = ulid(enqueued);
  const waiter: WaiterRecord = {
    ...self,
    waiterId: id,
    resource,
    tier,
    since: enqueued,
    ...(job.jobId ? { jobId: job.jobId } : {}),
  };
  const waiterFile = path.join(waitersDir, `${id}.json`);
  /*
   * Registered before the file exists, as the slot's hold is
   * (`createSlotLock`): a poll in this process that lands between the write
   * and the registration would judge our own waiter dead and delete it.
   */
  processWaiters().add(id);
  try {
    /* Twice on ENOENT: the sweep may prune an idle site's directory under us. */
    for (let tries = 1; ; tries += 1) {
      try {
        await mkdir(waitersDir, { recursive: true });
        await writeJsonAtomic(waiterFile, waiter);
        break;
      } catch (error) {
        if (tries >= 2 || errorCode(error) !== "ENOENT") throw error;
      }
    }
  } catch (error) {
    processWaiters().delete(id);
    /*
     * A queue dir that cannot be written (a read-only home, a bad
     * `RECIPE_QUEUE_DIR`): said once, and the work goes on unqueued — as a
     * job runs without its record (37a, T6). An import is worth more.
     */
    if (!queueGlobal().__discontentQueueWarned) {
      queueGlobal().__discontentQueueWarned = true;
      console.warn(
        `[queue] could not use ${dir} (${(error as Error)?.message ?? error}); going on without the queue`,
      );
    }
    return passThroughGrant(resource);
  }

  let stopBeat: (() => void) | undefined;
  let held = false;
  let showedWaiting = false;

  /** The slot lock exists, and `processHolds` has had `id` since before. */
  const take = (): void => {
    held = true;
    stopBeat = startLockHeartbeat(
      lockPath,
      SLOT_ID_KEY,
      id,
      SLOT_HEARTBEAT_MS,
      { onLost: (state) => lostSlot(resource, state, job.log) },
    );
  };

  /** Let go of the slot; `stamp`: the holder used it (the gap's clock moves). */
  const letGo = async (stamp: boolean): Promise<void> => {
    if (!held) return;
    held = false;
    stopBeat?.();
    try {
      if (stamp) {
        await writeResourceState(resourceDir, {
          ...(await readResourceState(resourceDir)),
          lastRelease: Date.now(),
        }).catch(() => undefined);
      }
      await releaseLock(lockPath, SLOT_ID_KEY, id);
    } finally {
      processHolds().delete(id);
    }
  };

  /** One look: granted, or how many are ahead. */
  const attempt = async (): Promise<
    { granted: true } | { granted: false; ahead: number }
  > => {
    const waiters = await liveWaiters(resourceDir);
    const index = waiters.findIndex((entry) => entry.waiterId === id);
    if (index < 0) {
      /* Judged stale while this process was blocked: back in line, same place. */
      await writeJsonAtomic(waiterFile, waiter);
      return { granted: false, ahead: waiters.length };
    }
    const holder = await currentHolder(resourceDir);
    if (index > 0 || holder) {
      return { granted: false, ahead: index + (holder ? 1 : 0) };
    }
    const record: SlotRecord = {
      ...self,
      holderId: id,
      resource,
      tier,
      since: Date.now(),
      ...(job.jobId ? { jobId: job.jobId } : {}),
    };
    if (!(await createSlotLock(lockPath, record))) {
      return { granted: false, ahead: 1 };
    }
    take();
    await rm(waiterFile, { force: true });
    return { granted: true };
  };

  /** What is left of the gap since the previous holder let go. */
  const gapLeft = async (): Promise<number> => {
    if (gapMs <= 0) return 0;
    const { lastRelease } = await readResourceState(resourceDir);
    return lastRelease === undefined ? 0 : lastRelease + gapMs - Date.now();
  };

  let hookRan = false;
  try {
    let outcome = await attempt();
    const position = outcome.granted ? 0 : outcome.ahead;
    let gap = outcome.granted ? await gapLeft() : 0;
    if (!outcome.granted || gap > 0) {
      showedWaiting = true;
      job.waiting?.({ resource, tier, since: enqueued, position });
      await log.step(
        "queue.wait",
        { resource, tier, position },
        async (step) => {
          /*
           * The place in line as it moves, into the job's meta (39b, the
           * 37c backlog row): `/jobs` and the panel read it from the record
           * rather than only from the position at enqueue.
           */
          let shown = position;
          while (!outcome.granted) {
            await sleep(pollDelay(), signal);
            await utimes(waiterFile, new Date(), new Date()).catch(
              () => undefined,
            );
            outcome = await attempt();
            if (!outcome.granted && outcome.ahead !== shown) {
              shown = outcome.ahead;
              job.waiting?.({
                resource,
                tier,
                since: enqueued,
                position: shown,
              });
            }
          }
          gap = await gapLeft();
          if (gap > 0) {
            step.set({ gapMs: Math.round(gap) });
            await sleep(gap, signal);
          }
          step.set({ waitedMs: Date.now() - enqueued });
        },
      );
    }
    if (resource === "gpu") hookRan = await gpuGranted(job, dir);
    /* Cancelled while the grant was being made: give it straight back. */
    signal?.throwIfAborted();
  } catch (error) {
    /* Cancelled while waiting, or in the gap: nothing was used. */
    const wasHeld = held;
    await letGo(false);
    if (wasHeld && resource === "gpu") gpuReleased(dir);
    throw error;
  } finally {
    /* The file first, then the registration (as `letGo` does). */
    await rm(waiterFile, { force: true }).catch(() => undefined);
    processWaiters().delete(id);
    if (showedWaiting) job.waiting?.(undefined);
  }

  let released = false;
  const release = async ({ used = true } = {}): Promise<void> => {
    if (released) return;
    released = true;
    await letGo(used);
    if (resource === "gpu") gpuReleased(dir);
  };
  return {
    resource,
    waitedMs: Date.now() - enqueued,
    hookRan,
    passThrough: false,
    release,
    [Symbol.asyncDispose]: () => release(),
  };
}

/**
 * Run `fn` holding `resource`, and let go after — the usual way in. Inside
 * `fn` the resource counts as held, so taking it again passes through.
 */
export async function withResource<T>(
  resource: QueueResource,
  options: AcquireOptions,
  fn: (grant: ResourceGrant) => Promise<T>,
): Promise<T> {
  const dir = options.dir ?? queueDirectory();
  const grant = await acquire(resource, { ...options, dir });
  if (grant.passThrough) return fn(grant);
  const held = new Set(heldStorage().getStore() ?? []);
  held.add(heldKey(dir, resource));
  try {
    return await heldStorage().run(held, () => fn(grant));
  } finally {
    await grant.release();
  }
}
