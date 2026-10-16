/**
 * The job store (epic 37, D1): files every process shares — the editor, the
 * CLI, the stdio MCP server — in `jobsDirectory()`.
 *
 * - `<id>.meta.json`: `JobMeta`, written whole through the engine's atomic
 *   write (34-D8), so a reader sees the old meta or the new, never half.
 *   Only the process that runs a job writes its meta — and the boot sweep,
 *   for a job whose process is gone.
 * - `<id>.log.jsonl`: the step log (`log.ts`), appended a line at a time.
 *
 * Ids are the engine's ULIDs (34-D5), so a directory listing sorts by start.
 *
 * **The heartbeat**: a running job's process refreshes `updatedAt` every
 * `JOB_HEARTBEAT_MS` and at each step boundary (`run.ts`), so a reader can
 * tell a job that is still going from one whose process vanished where this
 * one cannot see it.
 *
 * **The boot sweep** (`sweepJobs`, D5): a `queued` or `running` job whose
 * process is gone — same host, same pid namespace, pid dead or reused
 * (`processGone`, the write lock's rule) — becomes `interrupted`. A job from
 * another host or another pid namespace (the Pi's container) cannot be
 * judged by its pid; it becomes `interrupted` only once its heartbeat is
 * older than `JOB_STALE_MS`. Nothing is replayed: Retry is a person's
 * choice.
 *
 * **Retention** (`pruneJobs`): the newest `JOB_RETENTION_COUNT` jobs, none
 * older than `JOB_RETENTION_MS`. A live job is kept while its process is
 * alive, or while its heartbeat is younger than `JOB_RETENTION_MS`. At most
 * once an hour per directory — a stamp file's mtime says when it last ran;
 * every job start asks (`runJob`), so a long-lived editor keeps pruning.
 *
 * **Writes to one meta are serialised** within a process (a promise chain
 * per file): the heartbeat and the outcome, both read-modify-write, never
 * lose each other's change.
 */
import { processGone, processIdentity } from "@discontent/cms/git/fileLock";
import { writeJsonAtomic } from "@discontent/cms/fs/atomicWrite";
import { ulidTime } from "@discontent/cms/util/ulid";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { JobTier, JobWaiting } from "./context";
import type { JobLine } from "./log";

export type { JobTier } from "./context";

export type JobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "interrupted";

export const LIVE_STATUSES: readonly JobStatus[] = ["queued", "running"];

export interface JobError {
  code: string;
  message: string;
  /** What the job surfaced before it failed (D6's placement). */
  warnings?: string[];
}

export interface JobMeta {
  id: string;
  /** What runs it (`kinds.ts`): `import-url`, `import-text`, `inspect`, … */
  kind: string;
  /** What a person reads in a list: the URL, "pasted text (1 234 chars)". */
  label: string;
  status: JobStatus;
  tier: JobTier;
  /** The contended resources it may take (D4, 37b). */
  resources: string[];
  /** The process running it, as the write lock names one. */
  pid: number;
  host: string;
  pidns: string | null;
  nonce: string;
  /** Epoch milliseconds. */
  queuedAt: number;
  startedAt?: number;
  /** The running process's last sign of life (the heartbeat). */
  updatedAt?: number;
  endedAt?: number;
  /** JSON, no secrets, enough to run the job again (`kinds.ts`). */
  spec: unknown;
  /** What the job answered, `job` aside. */
  result?: unknown;
  error?: JobError;
  /**
   * What it is waiting for in the queue now (37b), mirrored from its waiter
   * file for display; absent when it waits for nothing.
   */
  waiting?: JobWaiting;
  /** The job this one ran again (37c's Retry). */
  retryOf?: string;
}

/** D1: how many jobs are kept, and for how long. */
export const JOB_RETENTION_COUNT = 300;
export const JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
/** Pruned at most this often per directory. */
export const JOB_PRUNE_EVERY_MS = 60 * 60 * 1000;
/** A running job refreshes `updatedAt` this often (and at each step). */
export const JOB_HEARTBEAT_MS = 30 * 1000;
/**
 * A live job whose process cannot be judged (another host, another pid
 * namespace) and whose heartbeat is older than this is `interrupted`.
 */
export const JOB_STALE_MS = 10 * 60 * 1000;
const PRUNE_STAMP = ".prune-stamp";

const META = ".meta.json";
const LOG = ".log.jsonl";
const CANCEL = ".cancel";
const JOB_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function metaPath(dir: string, id: string): string {
  return path.join(dir, `${id}${META}`);
}

export function logPath(dir: string, id: string): string {
  return path.join(dir, `${id}${LOG}`);
}

/**
 * A cancel asked of a job from another process (37b): `<id>.cancel`. Its
 * own file rather than a meta field — only the running process writes the
 * meta, and its heartbeat's read-modify-write would race a flag written
 * there by someone else. The running process polls for it (`runJob`).
 */
export function cancelPath(dir: string, id: string): string {
  return path.join(dir, `${id}${CANCEL}`);
}

/** Ask the process running `id` to cancel it (37c's Cancel, any process). */
export async function writeCancelRequest(
  dir: string,
  id: string,
  reason?: string,
): Promise<void> {
  await writeFile(
    cancelPath(dir, id),
    JSON.stringify({ at: Date.now(), ...(reason ? { reason } : {}) }),
  );
}

/** The cancel asked of `id`, if any: its reason (or "" for none). */
export async function readCancelRequest(
  dir: string,
  id: string,
): Promise<string | undefined> {
  try {
    const raw = await readFile(cancelPath(dir, id), "utf8");
    try {
      const parsed = JSON.parse(raw) as { reason?: unknown };
      return typeof parsed.reason === "string" ? parsed.reason : "";
    } catch {
      return "";
    }
  } catch {
    return undefined;
  }
}

/** A new job's meta: this process runs it. */
export function newJobMeta(
  id: string,
  init: Pick<JobMeta, "kind" | "label" | "spec"> &
    Partial<Pick<JobMeta, "tier" | "resources" | "status" | "retryOf">>,
  now = Date.now(),
): JobMeta {
  const self = processIdentity();
  return {
    ...(init.retryOf ? { retryOf: init.retryOf } : {}),
    id,
    kind: init.kind,
    label: init.label,
    status: init.status ?? "queued",
    tier: init.tier ?? "interactive",
    resources: init.resources ?? [],
    pid: self.pid,
    host: self.host,
    pidns: self.pidns,
    nonce: self.nonce,
    queuedAt: now,
    updatedAt: now,
    spec: init.spec,
  };
}

/** When the job's process last showed life: its heartbeat, else its start. */
export function lastSeen(meta: JobMeta): number {
  return meta.updatedAt ?? meta.startedAt ?? meta.queuedAt;
}

export async function writeJobMeta(dir: string, meta: JobMeta): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeJsonAtomic(metaPath(dir, meta.id), meta, { spaces: 2 });
}

export async function readJobMeta(
  dir: string,
  id: string,
): Promise<JobMeta | undefined> {
  if (!JOB_ID.test(id)) return undefined;
  try {
    return JSON.parse(await readFile(metaPath(dir, id), "utf8")) as JobMeta;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

interface ChainGlobal {
  /** Per meta file, the tail of its writes (shared by the editor's bundles). */
  __discontentJobMetaChains?: Map<string, Promise<unknown>>;
}

function metaChains(): Map<string, Promise<unknown>> {
  const global = globalThis as ChainGlobal;
  return (global.__discontentJobMetaChains ??= new Map());
}

/**
 * Read, change and write a job's meta; undefined when it is gone. `patch`
 * may be a function of the meta as read, answering undefined to leave it
 * alone. Updates to one meta run one after another in this process.
 */
export function updateJobMeta(
  dir: string,
  id: string,
  patch: Partial<JobMeta> | ((meta: JobMeta) => Partial<JobMeta> | undefined),
): Promise<JobMeta | undefined> {
  const key = metaPath(dir, id);
  const chains = metaChains();
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.then(async () => {
    const meta = await readJobMeta(dir, id);
    if (!meta) return undefined;
    const change = typeof patch === "function" ? patch(meta) : patch;
    if (!change) return meta;
    const updated = { ...meta, ...change };
    await writeJobMeta(dir, updated);
    return updated;
  });
  const tail = next.catch(() => undefined);
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return next;
}

/** Every job id in the store, newest first. */
export async function listJobIds(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => name.endsWith(META))
    .map((name) => name.slice(0, -META.length))
    .filter((id) => JOB_ID.test(id))
    .sort()
    .reverse();
}

/** Every job's meta, newest first (an unreadable one is skipped). */
export async function listJobs(dir: string): Promise<JobMeta[]> {
  const metas = await Promise.all(
    (await listJobIds(dir)).map((id) =>
      readJobMeta(dir, id).catch(() => undefined),
    ),
  );
  return metas.filter((meta): meta is JobMeta => !!meta);
}

/**
 * A job by its full id, or by the end of it (the mirror's eight characters)
 * or its start, when exactly one job matches.
 */
export async function findJob(
  dir: string,
  idOrPart: string,
): Promise<JobMeta | undefined> {
  const wanted = idOrPart.trim().toUpperCase();
  if (JOB_ID.test(wanted)) return readJobMeta(dir, wanted);
  if (wanted.length < 4) return undefined;
  const matches = (await listJobIds(dir)).filter(
    (id) => id.endsWith(wanted) || id.startsWith(wanted),
  );
  return matches.length === 1 ? readJobMeta(dir, matches[0]) : undefined;
}

/**
 * A job's log lines from byte `from` on, and the offset to ask from next
 * (37c's `?from=`). A last line still being written is left for next time.
 */
export async function readJobLog(
  dir: string,
  id: string,
  rawFrom = 0,
): Promise<{ lines: JobLine[]; next: number }> {
  /* A query string's `?from=` may be anything: a whole byte offset, ≥ 0. */
  const from =
    Number.isFinite(rawFrom) && rawFrom > 0 ? Math.floor(rawFrom) : 0;
  let buffer: Buffer;
  try {
    buffer = await readFile(logPath(dir, id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { lines: [], next: from };
    }
    throw error;
  }
  const chunk = buffer.subarray(from);
  const end = chunk.lastIndexOf(0x0a);
  if (end < 0) return { lines: [], next: from };
  const lines = chunk
    .subarray(0, end)
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((text): JobLine[] => {
      try {
        return [JSON.parse(text) as JobLine];
      } catch {
        return [];
      }
    });
  return { lines, next: from + end + 1 };
}

/** Append a note from outside the job's own process (the sweep). */
async function appendNote(dir: string, id: string, line: JobLine) {
  await appendFile(logPath(dir, id), `${JSON.stringify(line)}\n`).catch(
    () => undefined,
  );
}

/**
 * Why a live job is over: its process is gone, or — when this process
 * cannot judge it (another host or pid namespace) — its heartbeat is older
 * than `staleMs`. Undefined while it may still be running.
 */
function endedWhy(
  meta: JobMeta,
  now: number,
  staleMs: number,
): string | undefined {
  const gone = processGone(meta);
  if (gone === true) {
    return `the process that ran it (pid ${meta.pid} on ${meta.host}) ended before it finished`;
  }
  if (gone === undefined && now - lastSeen(meta) > staleMs) {
    return `no sign of life from its process (pid ${meta.pid} on ${meta.host}) for ${Math.round((now - lastSeen(meta)) / 60_000)} min`;
  }
  return undefined;
}

/**
 * The boot sweep (D5): every `queued`/`running` job whose process is gone,
 * or that this process cannot judge and has gone quiet (`staleMs`), becomes
 * `interrupted`. Answers the ids it closed.
 */
export async function sweepJobs(
  dir: string,
  now = Date.now(),
  { staleMs = JOB_STALE_MS }: { staleMs?: number } = {},
): Promise<string[]> {
  const closed: string[] = [];
  for (const meta of await listJobs(dir)) {
    if (!LIVE_STATUSES.includes(meta.status)) continue;
    const message = endedWhy(meta, now, staleMs);
    if (!message) continue;
    let closedIt = false;
    /* One meta that cannot be written does not stop the sweep. */
    const written = await updateJobMeta(dir, meta.id, (current) => {
      /* Finished while we looked: leave it. */
      if (!LIVE_STATUSES.includes(current.status)) return undefined;
      closedIt = true;
      return {
        status: "interrupted",
        endedAt: now,
        error: { code: "interrupted", message },
      };
    }).then(
      () => true,
      (error) => {
        console.warn(
          `[jobs] could not close ${meta.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      },
    );
    if (!written || !closedIt) continue;
    await appendNote(dir, meta.id, {
      t: new Date(now).toISOString(),
      step: "job",
      phase: "note",
      level: "warn",
      msg: `interrupted — ${message}`,
    });
    closed.push(meta.id);
  }
  return closed;
}

/**
 * Retention (D1): keep the newest `count` jobs, none older than `maxAgeMs`;
 * a live job only while its process is alive or its heartbeat is younger
 * than `maxAgeMs` (one whose process cannot be judged would otherwise live
 * forever). Runs at most once per `everyMs` per directory
 * (`force` skips the check). Answers the ids it removed.
 */
export async function pruneJobs(
  dir: string,
  {
    now = Date.now(),
    count = JOB_RETENTION_COUNT,
    maxAgeMs = JOB_RETENTION_MS,
    everyMs = JOB_PRUNE_EVERY_MS,
    force = false,
  }: {
    now?: number;
    count?: number;
    maxAgeMs?: number;
    everyMs?: number;
    force?: boolean;
  } = {},
): Promise<string[]> {
  const stamp = path.join(dir, PRUNE_STAMP);
  if (!force) {
    const last = await stat(stamp).catch(() => null);
    if (last && now - last.mtimeMs < everyMs) return [];
  }
  await mkdir(dir, { recursive: true });
  await writeFile(stamp, "");
  const when = new Date(now);
  await utimes(stamp, when, when);

  const removed: string[] = [];
  const ids = await listJobIds(dir);
  for (const [index, id] of ids.entries()) {
    const age = now - ulidTime(id);
    if (index < count && age <= maxAgeMs) continue;
    const meta = await readJobMeta(dir, id).catch(() => undefined);
    if (
      meta &&
      LIVE_STATUSES.includes(meta.status) &&
      (processGone(meta) === false || now - lastSeen(meta) <= maxAgeMs)
    ) {
      continue;
    }
    await rm(metaPath(dir, id), { force: true });
    await rm(logPath(dir, id), { force: true });
    await rm(cancelPath(dir, id), { force: true });
    removed.push(id);
  }
  /*
   * A log whose meta never landed, a temp file a killed write left, or a
   * cancel request nobody picked up (its job ended, or never ran).
   */
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const orphanLog =
      name.endsWith(LOG) && !ids.includes(name.slice(0, -LOG.length));
    if (!orphanLog && !name.endsWith(".tmp") && !name.endsWith(CANCEL)) {
      continue;
    }
    const info = await stat(path.join(dir, name)).catch(() => null);
    if (info && now - info.mtimeMs > (orphanLog ? maxAgeMs : everyMs)) {
      await rm(path.join(dir, name), { force: true });
    }
  }
  return removed;
}
