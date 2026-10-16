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
  JobLiveError,
  NotFoundError,
  ValidationError,
  withJob,
} from "../curation/errors";
import type { CurationContext } from "../curation/context";
import { redactUrlText, type JobLine } from "./log";
import {
  JOB_LIST_DEFAULT_LIMIT,
  JOB_LIST_MAX_LIMIT,
  JOB_STATUS_NAMES,
} from "./listing";
import { jobsDirectory, queueDirectory } from "./location";
import { queueSnapshot, queueSnapshots } from "./queue";
import { retryJob } from "./kinds";
import { cancelJob, requestJobCancel, type CancelOutcome } from "./run";
import {
  LIVE_STATUSES,
  findJob,
  listJobs,
  readJobLog,
  readJobMeta,
  settleOrphanedJob,
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
  /** `false` once a cancel is refused (39b: a reindex past its first swap). */
  cancellable?: false;
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
   * already finished), `refused` (it is past the point a cancel may stop it
   * — a reindex that has begun swapping — and runs to its end; 39b).
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
  /**
   * Echoed when the retry was asked to read again (39a): a pre-39a editor
   * never says it, and the CLI warns that it ran a plain retry.
   */
  fresh?: true;
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
    ...(meta.cancellable === false ? { cancellable: false as const } : {}),
    pid: meta.pid,
    host: meta.host,
  };
}

/**
 * The spec as a reader sees it: pasted text as its length, the picker's
 * readings as their names, a URL without its `user:password@` (the log's
 * redaction), and no `author` or `contentDirectory` — the committer's email
 * and a server path, which no surface shows and a read token need not
 * learn. The record keeps all of it for Retry.
 */
export function summarizeSpec(spec: unknown): unknown {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return spec;
  const {
    text,
    picks,
    url,
    source,
    author: _author,
    contentDirectory: _contentDirectory,
    ...rest
  } = spec as {
    text?: unknown;
    picks?: unknown;
    url?: unknown;
    source?: unknown;
    author?: unknown;
    contentDirectory?: unknown;
  } & Record<string, unknown>;
  return {
    ...rest,
    ...(typeof url === "string" ? { url: redactUrlText(url) } : {}),
    ...(typeof source === "string" ? { source: redactUrlText(source) } : {}),
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

/**
 * A meta as a reader should report it: a live one whose process is gone
 * (or silent past `JOB_STALE_MS`) is closed as `interrupted` first — and
 * written so, for every other reader (37c review). A failure to write it
 * leaves the meta as read.
 */
async function settledMeta(
  dir: string,
  meta: JobMeta,
  now = Date.now(),
): Promise<JobMeta> {
  if (!LIVE_STATUSES.includes(meta.status)) return meta;
  return settleOrphanedJob(dir, meta, now).then(
    (settled) => settled.meta,
    () => meta,
  );
}

/** Newest first, filtered (an orphaned live job is closed first). */
export async function listJobSummaries(
  { status, kind, limit = JOB_LIST_DEFAULT_LIMIT }: JobListOptions = {},
  dir: string = jobsDirectory(),
): Promise<JobListResult> {
  const now = Date.now();
  const metas = await Promise.all(
    (await listJobs(dir)).map((meta) => settledMeta(dir, meta, now)),
  );
  const matching = metas.filter(
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
  /* Each site's and each repository's line (39b) with a holder or waiters. */
  const sites = active
    .filter(
      (snapshot) =>
        snapshot.resource.startsWith("site:") ||
        snapshot.resource.startsWith("repo:"),
    )
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
  const meta = await settledMeta(dir, await requireJob(id, dir));
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
 *
 * A job this process runs **with no record** (39a, 38-Tb5: the jobs
 * directory cannot be written) is found by nothing but its full id in the
 * running registry: it is aborted there and answers `cancelled` — the
 * form's unfollowed panel offers Cancel through this.
 */
export async function cancelJobById(
  id: string,
  { dir = jobsDirectory(), reason }: { dir?: string; reason?: string } = {},
): Promise<JobCancelResult> {
  const found = await requireJob(id, dir).catch((error: unknown) => {
    if (cancelJob(id, new Error(reason ?? "cancelled"))) return undefined;
    throw error;
  });
  if (!found) return { job: id, outcome: "cancelled", status: "cancelled" };
  /* An orphan is `interrupted` first, so the cancel answers `ended`. */
  const meta = await settledMeta(dir, found);
  const outcome = await requestJobCancel(meta.id, {
    dir,
    reason: reason ?? "cancelled",
  });
  if (outcome === "not_found") {
    throw new NotFoundError(`No job "${id}".`);
  }
  /*
   * `cancelled`: it ran here and is stopped (its meta is written a moment
   * later). Otherwise the record's own: `queued`/`running` for a request
   * another process will see, the end it had for `ended` — read again,
   * since it may have ended while this was asked.
   */
  const status =
    outcome === "cancelled"
      ? "cancelled"
      : outcome === "ended"
        ? ((await readJobMeta(dir, meta.id).catch(() => undefined))?.status ??
          meta.status)
        : meta.status;
  return { job: meta.id, outcome, status };
}

interface RetryGuardGlobal {
  /**
   * Per job id, a retry being started in this process now: what it started
   * (its job), so a second press in the same instant is refused naming it.
   * On `globalThis`, as the running-jobs registry is (T5).
   */
  __discontentRetriesStarting?: Map<string, Promise<string | undefined>>;
}

function retriesStarting(): Map<string, Promise<string | undefined>> {
  const global = globalThis as RetryGuardGlobal;
  return (global.__discontentRetriesStarting ??= new Map());
}

/** A live job that runs `id` again, if one does (an orphan is closed first). */
async function liveRetryOf(
  id: string,
  dir: string,
): Promise<JobMeta | undefined> {
  for (const meta of await listJobs(dir)) {
    if (meta.retryOf !== id || !LIVE_STATUSES.includes(meta.status)) continue;
    const settled = await settledMeta(dir, meta);
    if (LIVE_STATUSES.includes(settled.status)) return settled;
  }
  return undefined;
}

function liveRetryError(id: string, live: string): JobLiveError {
  return withJob(
    new JobLiveError(
      `Job ${id} is already running again as ${live}: follow that one, or cancel it first.`,
    ),
    live,
  );
}

/**
 * Run a job again with `ctx` (`retryJob`: the caller's own context, and a
 * spec recorded against another content directory refused). `wait` awaits
 * the new job (the CLI's local run, whose process would end otherwise);
 * without it the new job's id comes back at once (the API, `/jobs`), and
 * `background` is handed the new job's outcome to keep the work — and
 * what it revalidates — alive past the answer (the route's `after()`).
 *
 * Refused with `job_live` (409), naming the live job as `job`, while the
 * job itself is still live, or while a live job already runs it again —
 * a second press, or a script's loop, starts nothing (37c review).
 */
export async function retryJobById(
  id: string,
  ctx: CurationContext,
  {
    dir = jobsDirectory(),
    wait = false,
    background,
    fresh = false,
  }: {
    dir?: string;
    wait?: boolean;
    background?: (done: Promise<unknown>) => void;
    /** Read it again (39a): an import skips its kept reading. */
    fresh?: boolean;
  } = {},
): Promise<JobRetryResult> {
  const meta = await settledMeta(dir, await requireJob(id, dir));
  const starting = retriesStarting();
  const inFlight = starting.get(meta.id);
  if (inFlight) {
    const other = await inFlight;
    if (other) throw liveRetryError(meta.id, other);
    /* That one did not start: this one may. */
    return retryJobById(id, ctx, {
      dir,
      wait,
      fresh,
      ...(background ? { background } : {}),
    });
  }
  let settle!: (job: string | undefined) => void;
  const marker = new Promise<string | undefined>((resolve) => {
    settle = resolve;
  });
  starting.set(meta.id, marker);
  let started: Awaited<ReturnType<typeof retryJob>> | undefined;
  try {
    if (LIVE_STATUSES.includes(meta.status)) {
      throw withJob(
        new JobLiveError(
          `Job ${meta.id} is still ${meta.status}: it can run again once it has ended (or been cancelled).`,
        ),
        meta.id,
      );
    }
    const live = await liveRetryOf(meta.id, dir);
    if (live) throw liveRetryError(meta.id, live.id);
    started = await retryJob(meta, ctx, { dir, fresh });
  } finally {
    settle(started?.job);
    if (starting.get(meta.id) === marker) starting.delete(meta.id);
  }
  const base = {
    job: started.job,
    retryOf: meta.id,
    ...(fresh ? { fresh: true as const } : {}),
  };
  if (!wait) {
    background?.(started.done);
    return { ...base, status: "running" };
  }
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
