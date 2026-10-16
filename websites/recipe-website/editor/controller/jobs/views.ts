/**
 * The job store as its surfaces read it (epic 37, 37c): `GET /api/jobs`,
 * `GET /api/jobs/<id>`, the cancel and retry routes, `recipes jobs …`, MCP
 * `job_list` / `job_get`, and the `/jobs` page — one shape for all of them,
 * so the CLI's `--remote` and its local store answer alike.
 *
 * - **A list row is small** (`JobSummary`): no spec, no result — a page of
 *   300 rows must not carry 300 recipes.
 * - **A job's view** (`JobView`) is its record with the spec summarised
 *   (`summarizeSpec`: pasted text and the picker's readings as their sizes —
 *   the record keeps them for Retry, a reader needs only what they were),
 *   the log from a byte offset (`readJobLog`'s `from` and `next`), and,
 *   while it waits in the queue, its place in line **now** — the meta's
 *   `waiting.position` is the one at enqueue.
 */
import {
  CurationError,
  NotFoundError,
  ValidationError,
} from "../curation/errors";
import type { CurationContext } from "../curation/context";
import type { JobLine } from "./log";
import {
  JOB_LIST_DEFAULT_LIMIT,
  JOB_LIST_MAX_LIMIT,
  JOB_STATUS_NAMES,
} from "./listing";
import { jobsDirectory, queueDirectory } from "./location";
import { queueSnapshot, queueSnapshots } from "./queue";
import { retryJob } from "./kinds";
import { requestJobCancel, type CancelOutcome } from "./run";
import {
  LIVE_STATUSES,
  findJob,
  listJobs,
  readJobLog,
  readJobMeta,
  type JobError,
  type JobMeta,
  type JobStatus,
} from "./store";

export { JOB_LIST_DEFAULT_LIMIT, JOB_LIST_MAX_LIMIT };

const JOB_STATUSES: readonly JobStatus[] = JOB_STATUS_NAMES;

export interface JobSummary {
  id: string;
  kind: string;
  label: string;
  status: JobStatus;
  tier: JobMeta["tier"];
  /** Epoch ms. */
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  /** Its wall time so far, or in all once it ended. */
  durationMs?: number;
  error?: Pick<JobError, "code" | "message">;
  waiting?: JobMeta["waiting"];
  retryOf?: string;
  /** The process that runs (or ran) it. */
  pid: number;
  host: string;
}

export interface JobListOptions {
  /** One status, or `live` for `queued` and `running`. */
  status?: JobStatus | "live";
  kind?: string;
  limit?: number;
}

export interface JobListResult {
  jobs: JobSummary[];
  /** How many matched before the limit. */
  total: number;
  more: boolean;
}

/** A record as a reader gets it: the spec summarised (`summarizeSpec`). */
export type JobRecord = Omit<JobMeta, "spec"> & { spec?: unknown };

export interface JobView {
  /** The job's id, as `job` is in every other result. */
  job: string;
  meta: JobRecord;
  /** The log's lines from byte `from` on. */
  lines: JobLine[];
  /** The offset to ask from next (`?from=`). */
  next: number;
  /** Still `queued` or `running`. */
  live: boolean;
}

export interface JobCancelResult {
  job: string;
  /**
   * `cancelled` (it ran here and is stopped), `requested` (another process
   * runs it and will see the request within a second), `ended` (it had
   * already finished).
   */
  outcome: Exclude<CancelOutcome, "not_found">;
  status: JobStatus;
}

export interface JobRetryResult {
  /** The new job. */
  job: string;
  /** The job it runs again. */
  retryOf: string;
  /** `running` when answered at once (the API); its end when awaited. */
  status: JobStatus;
  result?: unknown;
  error?: JobError;
}

function durationOf(meta: JobMeta, now: number): number | undefined {
  const start = meta.startedAt ?? meta.queuedAt;
  if (meta.endedAt !== undefined) return meta.endedAt - start;
  return LIVE_STATUSES.includes(meta.status) ? now - start : undefined;
}

export function summarizeJob(meta: JobMeta, now = Date.now()): JobSummary {
  const duration = durationOf(meta, now);
  return {
    id: meta.id,
    kind: meta.kind,
    label: meta.label,
    status: meta.status,
    tier: meta.tier,
    queuedAt: meta.queuedAt,
    ...(meta.startedAt !== undefined ? { startedAt: meta.startedAt } : {}),
    ...(meta.endedAt !== undefined ? { endedAt: meta.endedAt } : {}),
    ...(duration !== undefined ? { durationMs: duration } : {}),
    ...(meta.error
      ? { error: { code: meta.error.code, message: meta.error.message } }
      : {}),
    ...(meta.waiting ? { waiting: meta.waiting } : {}),
    ...(meta.retryOf ? { retryOf: meta.retryOf } : {}),
    pid: meta.pid,
    host: meta.host,
  };
}

/**
 * The spec as a reader sees it: pasted text as its length, the picker's
 * readings as their names. The record keeps both for Retry.
 */
export function summarizeSpec(spec: unknown): unknown {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return spec;
  const { text, picks, ...rest } = spec as {
    text?: unknown;
    picks?: unknown;
  } & Record<string, unknown>;
  return {
    ...rest,
    ...(typeof text === "string" ? { textChars: text.length } : {}),
    ...(Array.isArray(picks)
      ? {
          picks: picks.map((pick) => {
            const { n, recipe } = (pick ?? {}) as {
              n?: unknown;
              recipe?: { name?: unknown };
            };
            return {
              n,
              ...(typeof recipe?.name === "string"
                ? { name: recipe.name }
                : {}),
            };
          }),
        }
      : {}),
  };
}

/** A status filter as a query string or a flag gives it. */
export function parseStatusFilter(
  value: string | undefined | null,
): JobListOptions["status"] {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "live" || (JOB_STATUSES as readonly string[]).includes(value)) {
    return value as JobListOptions["status"];
  }
  throw new ValidationError(
    `status is one of ${[...JOB_STATUSES, "live"].join(", ")} — not "${value}".`,
  );
}

/** A limit as a query string or a flag gives it: 1–`JOB_LIST_MAX_LIMIT`. */
export function parseLimit(
  value: string | number | undefined | null,
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > JOB_LIST_MAX_LIMIT) {
    throw new ValidationError(
      `limit is a whole number from 1 to ${JOB_LIST_MAX_LIMIT} — not "${value}".`,
    );
  }
  return number;
}

/**
 * `?from=` as the job route takes it (37c): a whole byte offset, ≥ 0.
 * Absent is 0; anything else — `-1`, `1.5`, `abc` — is `validation`.
 */
export function parseFrom(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  const text = String(value);
  if (!/^\d{1,15}$/.test(text)) {
    throw new ValidationError(
      `from is a byte offset — a whole number, 0 or more — not "${text}".`,
    );
  }
  return Number(text);
}

/** Newest first, filtered. */
export async function listJobSummaries(
  { status, kind, limit = JOB_LIST_DEFAULT_LIMIT }: JobListOptions = {},
  dir: string = jobsDirectory(),
): Promise<JobListResult> {
  const now = Date.now();
  const matching = (await listJobs(dir)).filter(
    (meta) =>
      (status === undefined ||
        (status === "live"
          ? LIVE_STATUSES.includes(meta.status)
          : meta.status === status)) &&
      (kind === undefined || meta.kind === kind),
  );
  const capped = Math.min(Math.max(1, limit), JOB_LIST_MAX_LIMIT);
  return {
    jobs: matching.slice(0, capped).map((meta) => summarizeJob(meta, now)),
    total: matching.length,
    more: matching.length > capped,
  };
}

/** A holder or a waiter, as `/jobs` shows it. */
export interface QueueEntryView {
  /** The job it is for, when it is one (a seat called outside a job is not). */
  jobId?: string;
  /** The job's label and kind, when the job is in this store. */
  label?: string;
  kind?: string;
  tier: JobMeta["tier"];
  /** Epoch ms: when it was granted (a holder) or joined (a waiter). */
  since: number;
  pid: number;
  host: string;
  /** Why a holder that is no caller holds it (the GPU's release hook). */
  purpose?: string;
}

export interface ResourceView {
  resource: string;
  holder?: QueueEntryView;
  /** First in line first. */
  waiters: QueueEntryView[];
}

/**
 * The queue per resource (37c's `/jobs`): `gpu` and `ytdlp` always, and
 * each `site:` with a holder or a line — the holder, then the waiters in
 * order with their tiers. A job from another checkout's store (the queue is
 * machine-wide, the records are not) shows by its process.
 */
export async function queueOverview(
  dir: string = jobsDirectory(),
  queueDir: string = queueDirectory(),
): Promise<ResourceView[]> {
  const [gpu, ytdlp, active] = await Promise.all([
    queueSnapshot("gpu", queueDir),
    queueSnapshot("ytdlp", queueDir),
    queueSnapshots(queueDir),
  ]);
  const sites = active
    .filter((snapshot) => snapshot.resource.startsWith("site:"))
    .sort((a, b) => a.resource.localeCompare(b.resource));
  const metas = new Map<string, JobMeta | undefined>();
  const metaOf = async (id: string | undefined) => {
    if (!id) return undefined;
    if (!metas.has(id)) {
      metas.set(id, await readJobMeta(dir, id).catch(() => undefined));
    }
    return metas.get(id);
  };
  const entry = async (record: {
    jobId?: string;
    tier: JobMeta["tier"];
    since: number;
    pid: number;
    host: string;
    purpose?: string;
  }): Promise<QueueEntryView> => {
    const meta = await metaOf(record.jobId);
    return {
      ...(record.jobId ? { jobId: record.jobId } : {}),
      ...(meta ? { label: meta.label, kind: meta.kind } : {}),
      tier: record.tier,
      since: record.since,
      pid: record.pid,
      host: record.host,
      ...(record.purpose ? { purpose: record.purpose } : {}),
    };
  };
  const out: ResourceView[] = [];
  for (const snapshot of [gpu, ytdlp, ...sites]) {
    out.push({
      resource: snapshot.resource,
      ...(snapshot.holder ? { holder: await entry(snapshot.holder) } : {}),
      waiters: await Promise.all(snapshot.waiters.map(entry)),
    });
  }
  return out;
}

/** A job by its id (or the mirror's eight characters), or `not_found`. */
export async function requireJob(
  id: string,
  dir: string = jobsDirectory(),
): Promise<JobMeta> {
  const meta = await findJob(dir, id);
  if (!meta) {
    throw new NotFoundError(
      `No job "${id}" (or more than one matches: give more of its id).`,
    );
  }
  return meta;
}

/** Where a waiting job stands in its line now: how many are ahead of it. */
async function livePosition(
  meta: JobMeta,
  queueDir: string,
): Promise<number | undefined> {
  if (!meta.waiting) return undefined;
  try {
    const snapshot = await queueSnapshot(meta.waiting.resource, queueDir);
    const index = snapshot.waiters.findIndex(
      (waiter) => waiter.jobId === meta.id,
    );
    if (index < 0) return undefined;
    return index + (snapshot.holder ? 1 : 0);
  } catch {
    return undefined;
  }
}

/** One job: its record, its log from `from`, and whether it is still live. */
export async function getJobView(
  id: string,
  {
    from = 0,
    dir = jobsDirectory(),
    queueDir = queueDirectory(),
  }: { from?: number; dir?: string; queueDir?: string } = {},
): Promise<JobView> {
  const meta = await requireJob(id, dir);
  const [{ lines, next }, position] = await Promise.all([
    readJobLog(dir, meta.id, from),
    livePosition(meta, queueDir),
  ]);
  const { spec, ...rest } = meta;
  const record: JobRecord = {
    ...rest,
    ...(spec !== undefined ? { spec: summarizeSpec(spec) } : {}),
    ...(meta.waiting && position !== undefined
      ? { waiting: { ...meta.waiting, position } }
      : {}),
  };
  return {
    job: meta.id,
    meta: record,
    lines,
    next,
    live: LIVE_STATUSES.includes(meta.status),
  };
}

/**
 * Cancel a job wherever it runs (`requestJobCancel`): here through its
 * abort, in another process through `<id>.cancel`.
 */
export async function cancelJobById(
  id: string,
  { dir = jobsDirectory(), reason }: { dir?: string; reason?: string } = {},
): Promise<JobCancelResult> {
  const meta = await requireJob(id, dir);
  const outcome = await requestJobCancel(meta.id, {
    dir,
    reason: reason ?? "cancelled",
  });
  if (outcome === "not_found") {
    throw new NotFoundError(`No job "${id}".`);
  }
  return {
    job: meta.id,
    outcome,
    status: outcome === "ended" ? meta.status : "running",
  };
}

/**
 * Run a job again with `ctx` (`retryJob`: the caller's own context, and a
 * spec recorded against another content directory refused). `wait` awaits
 * the new job (the CLI's local run, whose process would end otherwise);
 * without it the new job's id comes back at once (the API, `/jobs`).
 */
export async function retryJobById(
  id: string,
  ctx: CurationContext,
  {
    dir = jobsDirectory(),
    wait = false,
  }: { dir?: string; wait?: boolean } = {},
): Promise<JobRetryResult> {
  const meta = await requireJob(id, dir);
  const started = await retryJob(meta, ctx, { dir });
  const base = { job: started.job, retryOf: meta.id };
  if (!wait) return { ...base, status: "running" };
  try {
    const result = await started.done;
    const ended = await findJob(dir, started.job);
    const { job: _job, ...rest } = (result ?? {}) as { job?: unknown };
    return {
      ...base,
      status: ended?.status ?? "done",
      result: rest,
      ...(ended?.error ? { error: ended.error } : {}),
    };
  } catch (error) {
    const ended = await findJob(dir, started.job);
    const code = error instanceof CurationError ? error.code : "internal";
    return {
      ...base,
      status: ended?.status ?? "failed",
      error: ended?.error ?? {
        code,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
