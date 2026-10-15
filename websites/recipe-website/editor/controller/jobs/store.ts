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
 * **The boot sweep** (`sweepJobs`, D5): a `queued` or `running` job whose
 * process is gone — same host, same pid namespace, pid dead or reused
 * (`processGone`, the write lock's rule) — becomes `interrupted`. A job from
 * another host or another pid namespace (the Pi's container) is never
 * judged. Nothing is replayed: Retry is a person's choice.
 *
 * **Retention** (`pruneJobs`): the newest `JOB_RETENTION_COUNT` jobs, none
 * older than `JOB_RETENTION_MS`; a live job is never removed. At most once
 * an hour per directory — a stamp file's mtime says when it last ran.
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
import type { JobLine } from "./log";

export type JobStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled"
  | "interrupted";

/** `interactive` (form, API, MCP) goes ahead of `batch` (D4, 37b). */
export type JobTier = "interactive" | "batch";

export const LIVE_STATUSES: readonly JobStatus[] = ["queued", "running"];

export interface JobError {
  code: string;
  message: string;
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
  endedAt?: number;
  /** JSON, no secrets, enough to run the job again (`kinds.ts`). */
  spec: unknown;
  /** What the job answered, `job` aside. */
  result?: unknown;
  error?: JobError;
}

/** D1: how many jobs are kept, and for how long. */
export const JOB_RETENTION_COUNT = 300;
export const JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
/** Pruned at most this often per directory. */
export const JOB_PRUNE_EVERY_MS = 60 * 60 * 1000;
const PRUNE_STAMP = ".prune-stamp";

const META = ".meta.json";
const LOG = ".log.jsonl";
const JOB_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function metaPath(dir: string, id: string): string {
  return path.join(dir, `${id}${META}`);
}

export function logPath(dir: string, id: string): string {
  return path.join(dir, `${id}${LOG}`);
}

/** A new job's meta: this process runs it. */
export function newJobMeta(
  id: string,
  init: Pick<JobMeta, "kind" | "label" | "spec"> &
    Partial<Pick<JobMeta, "tier" | "resources" | "status">>,
  now = Date.now(),
): JobMeta {
  const self = processIdentity();
  return {
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
    spec: init.spec,
  };
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

/** Read, change and write a job's meta; undefined when it is gone. */
export async function updateJobMeta(
  dir: string,
  id: string,
  patch: Partial<JobMeta>,
): Promise<JobMeta | undefined> {
  const meta = await readJobMeta(dir, id);
  if (!meta) return undefined;
  const next = { ...meta, ...patch };
  await writeJobMeta(dir, next);
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
  from = 0,
): Promise<{ lines: JobLine[]; next: number }> {
  let buffer: Buffer;
  try {
    buffer = await readFile(logPath(dir, id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { lines: [], next: from };
    }
    throw error;
  }
  const chunk = buffer.subarray(Math.max(0, from));
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
 * The boot sweep (D5): every `queued`/`running` job whose process is gone
 * becomes `interrupted`. Answers the ids it closed.
 */
export async function sweepJobs(
  dir: string,
  now = Date.now(),
): Promise<string[]> {
  const closed: string[] = [];
  for (const meta of await listJobs(dir)) {
    if (!LIVE_STATUSES.includes(meta.status)) continue;
    if (processGone(meta) !== true) continue;
    const message = `the process that ran it (pid ${meta.pid} on ${meta.host}) ended before it finished`;
    await updateJobMeta(dir, meta.id, {
      status: "interrupted",
      endedAt: now,
      error: { code: "interrupted", message },
    });
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
 * Retention (D1): keep the newest `count` jobs, none older than `maxAgeMs`,
 * and never a live one. Runs at most once per `everyMs` per directory
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
    if (meta && LIVE_STATUSES.includes(meta.status)) continue;
    await rm(metaPath(dir, id), { force: true });
    await rm(logPath(dir, id), { force: true });
    removed.push(id);
  }
  /* A log whose meta never landed, or a temp file a killed write left. */
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const orphanLog =
      name.endsWith(LOG) && !ids.includes(name.slice(0, -LOG.length));
    if (!orphanLog && !name.endsWith(".tmp")) continue;
    const info = await stat(path.join(dir, name)).catch(() => null);
    if (info && now - info.mtimeMs > (orphanLog ? maxAgeMs : everyMs)) {
      await rm(path.join(dir, name), { force: true });
    }
  }
  return removed;
}
