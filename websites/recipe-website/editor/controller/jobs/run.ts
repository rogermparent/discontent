/**
 * Run work as a job (epic 37, 37a): a meta and a step log in the store, the
 * work run **inline** — no queue yet (37b) — so every import has a job id
 * and a step log, whatever surface started it.
 *
 * `runJob(init, fn)` writes the meta (`running`), opens the log, runs
 * `fn(job)` — the job's `JobContext`: its log, signal, tier and id — inside
 * a top-level `job` step, and writes the outcome:
 *
 * - `done` with the result;
 * - `failed` with the error, rethrown — a copy carrying the job's surfaced
 *   warnings (`log.surface`, D6's placement) as `warnings`, so a CPU-bound
 *   model's timeout still tells the caller why;
 * - `failed` with the result, returned, when `failureOf` says the result is
 *   a failure (the form's import answers its errors as a state);
 * - `cancelled` whenever its signal was aborted (`cancelJob`, or the
 *   caller's own `signal`) — thrown or not.
 *
 * Surfaced warnings are merged into the result's `warnings`.
 *
 * While it runs, the meta's `updatedAt` is refreshed every
 * `JOB_HEARTBEAT_MS` and at each step boundary (the sweep's way to tell a
 * quiet job from a lost one when it cannot judge the pid).
 *
 * The store never fails the work: a jobs directory that cannot be written
 * (a read-only disk, a bad `RECIPE_JOBS_DIR`) is said once on stderr and the
 * job runs with a log that writes nowhere — an import is worth more than its
 * record.
 *
 * The first job in a process sweeps the store first (D5: dead writers'
 * jobs become `interrupted`); every job asks for a prune (D1), which runs at
 * most hourly by its stamp. The editor also sweeps at boot
 * (`src/instrumentation.ts`).
 */
import { rm } from "node:fs/promises";
import { ulid } from "@discontent/cms/util/ulid";
import {
  CancelledError,
  toErrorObject,
  withJob,
  withWarnings,
} from "../curation/errors";
import type { JobContext, JobWaiting } from "./context";
import { jobsDirectory, queueDirectory } from "./location";
import { sweepQueue } from "./queue";
import {
  createJobLog,
  defaultJobMirror,
  redactText,
  type JobMirror,
} from "./log";
import {
  JOB_HEARTBEAT_MS,
  LIVE_STATUSES,
  cancelPath,
  logPath,
  metaPath,
  newJobMeta,
  pruneJobs,
  readCancelRequest,
  readJobMeta,
  sweepJobs,
  transcriptPath,
  updateJobMeta,
  writeCancelRequest,
  writeJobMeta,
  type JobError,
  type JobMeta,
  type JobTier,
} from "./store";

export interface JobInit {
  kind: string;
  label: string;
  /** JSON, no secrets, enough to run it again (`kinds.ts`). */
  spec: unknown;
  tier?: JobTier;
  resources?: string[];
  /** The job this one runs again (37c's Retry). */
  retryOf?: string;
}

export interface RunJobOptions<T = unknown> {
  /** Default `jobsDirectory()`. */
  dir?: string;
  /** Default the process's (`defaultJobMirror`); `null` mirrors nowhere. */
  mirror?: JobMirror | null;
  /** An outside abort (a request's signal); `cancelJob` aborts the job too. */
  signal?: AbortSignal;
  /**
   * Whether a result is a failure all the same — the job ends `failed` with
   * this error, and the result is still returned.
   */
  failureOf?: (result: T) => JobError | undefined;
  /** Default `JOB_HEARTBEAT_MS` (tests). */
  heartbeatMs?: number;
  /** How often to look for another process's cancel; default `JOB_CANCEL_POLL_MS`. */
  cancelPollMs?: number;
  /**
   * Whether a finished job leaves no record (39b: a git sync that found
   * nothing to do, so `/jobs` is not flooded by the sync after every
   * commit). Asked only of a `done` result; the meta and log are deleted.
   */
  discardIf?: (result: T) => boolean;
}

/**
 * How often a running job looks for a cancel asked from another process
 * (`<id>.cancel`, 37b): one `readFile` — an ENOENT when none was asked, the
 * reason when one was.
 */
export const JOB_CANCEL_POLL_MS = 1_000;

export interface JobOutcome<T> {
  job: string;
  result: T;
}

/* ------------------------------------------------------------------ */
/* Housekeeping                                                        */
/* ------------------------------------------------------------------ */

/** Directories this process has swept. */
const swept = new Map<string, Promise<void>>();

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sweep `dir` once per process (D5): its dead processes' jobs end — and the
 * queue's dead waiters and stale slots go (37b).
 */
function sweepOnce(dir: string): Promise<void> {
  let done = swept.get(dir);
  if (!done) {
    const queue = queueDirectory();
    done = Promise.all([
      sweepJobs(dir).catch((error) => {
        console.warn(`[jobs] could not sweep ${dir}: ${describe(error)}`);
      }),
      sweepQueue(queue).catch((error) => {
        console.warn(`[queue] could not sweep ${queue}: ${describe(error)}`);
      }),
    ]).then(() => undefined);
    swept.set(dir, done);
  }
  return done;
}

/**
 * Sweep `dir` (once per process) and prune it (the prune's own stamp makes
 * it at most hourly, however often this is called). Housekeeping only: a
 * failure is a line on stderr.
 */
export async function maintainJobs(
  dir: string = jobsDirectory(),
): Promise<void> {
  await sweepOnce(dir);
  try {
    await pruneJobs(dir);
  } catch (error) {
    console.warn(`[jobs] could not prune ${dir}: ${describe(error)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Cancellation: this process's running jobs                           */
/* ------------------------------------------------------------------ */

interface RegistryGlobal {
  /** On `globalThis`: a cancel route and the job's action are separate bundles (T5). */
  __discontentRunningJobs?: Map<string, AbortController>;
  /** Jobs this process runs that are past cancelling (`beyondCancel`, 39b). */
  __discontentSealedJobs?: Set<string>;
}

function registry(): Map<string, AbortController> {
  const global = globalThis as RegistryGlobal;
  return (global.__discontentRunningJobs ??= new Map());
}

function sealedJobs(): Set<string> {
  const global = globalThis as RegistryGlobal;
  return (global.__discontentSealedJobs ??= new Set());
}

/**
 * Abort a job this process is running (37b/37c's Cancel). False when it is
 * not running here — finished, or another process's — or when it is past
 * the point a cancel may stop it (`beyondCancel`).
 */
export function cancelJob(id: string, reason?: unknown): boolean {
  const controller = registry().get(id);
  if (!controller || sealedJobs().has(id)) return false;
  controller.abort(reason ?? new Error("the job was cancelled"));
  return true;
}

/** The ids of the jobs this process is running now. */
export function runningJobIds(): string[] {
  return [...registry().keys()];
}

export type CancelOutcome =
  /** It ran here and is aborted. */
  | "cancelled"
  /** Another process runs it; it will see the request within a second. */
  | "requested"
  /** It has already ended. */
  | "ended"
  /**
   * It is past the point a cancel may stop it (39b: a reindex that has begun
   * swapping indexes) and runs to its end.
   */
  | "refused"
  | "not_found";

/**
 * Cancel a job wherever it runs (37b; 37c's Cancel button and route): here,
 * through its abort controller; in another process, by leaving
 * `<id>.cancel` for it to find (it polls every `JOB_CANCEL_POLL_MS`, while
 * it runs or waits in the queue).
 */
export async function requestJobCancel(
  id: string,
  { dir = jobsDirectory(), reason }: { dir?: string; reason?: string } = {},
): Promise<CancelOutcome> {
  if (sealedJobs().has(id)) return "refused";
  if (cancelJob(id, reason ? new Error(reason) : undefined)) {
    return "cancelled";
  }
  const meta = await readJobMeta(dir, id);
  if (!meta) return "not_found";
  if (!LIVE_STATUSES.includes(meta.status)) return "ended";
  if (meta.cancellable === false) return "refused";
  await writeCancelRequest(dir, id, reason);
  return "requested";
}

/* ------------------------------------------------------------------ */
/* Running                                                             */
/* ------------------------------------------------------------------ */

/** The result with the surfaced warnings added to its `warnings`, once each. */
export function withSurfacedWarnings<T>(
  result: T,
  surfaced: readonly string[],
): T {
  if (surfaced.length === 0) return result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }
  const own = (result as { warnings?: unknown }).warnings;
  const warnings = Array.isArray(own) ? [...(own as string[])] : [];
  for (const message of surfaced) {
    if (!warnings.includes(message)) warnings.push(message);
  }
  return { ...result, warnings };
}

/** An error as a meta keeps it: the log's redaction on its message. */
function recordedError(error: JobError): JobError {
  return {
    ...error,
    message: redactText(error.message),
    ...(error.warnings
      ? { warnings: error.warnings.map((warning) => redactText(warning)) }
      : {}),
  };
}

/** A cancelled job's error, from its abort reason. */
function cancelledError(reason: unknown): JobError {
  return {
    code: "cancelled",
    message: reason instanceof Error ? reason.message : "the job was cancelled",
  };
}

let storeWarned = false;

/**
 * Run `fn` as a job. Resolves with the job's id and its result; a failure
 * is recorded and rethrown with the job's surfaced warnings and its id as
 * `job` (37c) — a cancelled job's as a `CancelledError` (code `cancelled`).
 */
export async function runJob<T>(
  init: JobInit,
  fn: (job: JobContext) => Promise<T>,
  options: RunJobOptions<T> = {},
): Promise<JobOutcome<T>> {
  return (await startJob(init, fn, options)).done;
}

/** A job started and still running (`startJob`). */
export interface StartedJob<T> {
  /** Its id: the meta is written, so `/api/jobs/<id>` answers at once. */
  job: string;
  /**
   * Whether its record was written. False when the store could not be
   * (37-T6): the job runs anyway, but nothing answers for its id — a caller
   * that would have followed it must await `done` instead (38b review).
   */
  stored: boolean;
  /** Its outcome, as `runJob` answers it. */
  done: Promise<JobOutcome<T>>;
}

/**
 * Start `fn` as a job and answer as soon as its record exists (37c, D7: the
 * form's import enqueues and returns `{jobId}`; Retry on `/jobs`). The work
 * goes on in this process; `done` settles as `runJob` would — a caller that
 * does not await it must still handle its rejection.
 */
export async function startJob<T>(
  init: JobInit,
  fn: (job: JobContext) => Promise<T>,
  {
    dir = jobsDirectory(),
    mirror,
    signal: outside,
    failureOf,
    discardIf,
    heartbeatMs = JOB_HEARTBEAT_MS,
    cancelPollMs = JOB_CANCEL_POLL_MS,
  }: RunJobOptions<T> = {},
): Promise<StartedJob<T>> {
  await maintainJobs(dir);
  const id = ulid();
  const now = Date.now();
  const meta: JobMeta = {
    ...newJobMeta(id, { ...init, status: "running" }, now),
    startedAt: now,
  };
  let stored = true;
  try {
    await writeJobMeta(dir, meta);
  } catch (error) {
    stored = false;
    if (!storeWarned) {
      storeWarned = true;
      console.warn(
        `[jobs] could not write to ${dir} (${describe(error)}); jobs run without a record`,
      );
    }
  }

  /* The heartbeat: coalesced, and never over an outcome already written. */
  let beating = false;
  let beatAgain = false;
  const beat = (): void => {
    if (!stored) return;
    if (beating) {
      beatAgain = true;
      return;
    }
    beating = true;
    void updateJobMeta(dir, id, (current) =>
      LIVE_STATUSES.includes(current.status)
        ? { updatedAt: Date.now() }
        : undefined,
    )
      .catch(() => undefined)
      .finally(() => {
        beating = false;
        if (beatAgain) {
          beatAgain = false;
          beat();
        }
      });
  };

  const log = createJobLog({
    id,
    ...(stored ? { file: logPath(dir, id) } : {}),
    mirror: mirror === null ? undefined : (mirror ?? defaultJobMirror()),
    onLine: (line) => {
      if (line.phase !== "note") beat();
    },
  });
  const record = async (patch: Partial<JobMeta>) => {
    if (!stored) return;
    await updateJobMeta(dir, id, {
      ...patch,
      waiting: undefined,
      updatedAt: Date.now(),
    }).catch((error) => {
      console.warn(
        `[job ${id}] could not record its outcome: ${describe(error)}`,
      );
    });
  };

  const controller = new AbortController();
  /* Past cancelling (`beyondCancel`): nothing may abort it any more. */
  let sealed = false;
  const fromOutside = () => {
    if (!sealed) controller.abort(outside?.reason);
  };
  if (outside?.aborted) fromOutside();
  else outside?.addEventListener("abort", fromOutside, { once: true });
  registry().set(id, controller);
  const timer = setInterval(beat, heartbeatMs);
  timer.unref?.();

  /* A cancel asked from another process (37b): `<id>.cancel`. */
  let looking = false;
  const cancelPoll = stored
    ? setInterval(() => {
        if (looking || sealed || controller.signal.aborted) return;
        looking = true;
        void readCancelRequest(dir, id)
          .then((reason) => {
            if (reason === undefined || sealed || controller.signal.aborted) {
              return;
            }
            controller.abort(
              new Error(reason || "the job was cancelled from another process"),
            );
          })
          .catch(() => undefined)
          .finally(() => {
            looking = false;
          });
      }, cancelPollMs)
    : undefined;
  cancelPoll?.unref?.();

  /* The queue says what the job waits for; the meta shows it (37b). */
  const waiting = (state: JobWaiting | undefined): void => {
    if (!stored) return;
    void updateJobMeta(dir, id, (current) =>
      LIVE_STATUSES.includes(current.status)
        ? { waiting: state, updatedAt: Date.now() }
        : undefined,
    ).catch(() => undefined);
  };

  /*
   * 39b: past this point a cancel is refused. A cancel already asked —
   * here, or by another process's `<id>.cancel` the poll has not read yet —
   * still wins: it is checked once more before the seal.
   */
  const beyondCancel = async (reason: string): Promise<void> => {
    if (sealed) return;
    controller.signal.throwIfAborted();
    if (stored) {
      const asked = await readCancelRequest(dir, id).catch(() => undefined);
      if (asked !== undefined && !controller.signal.aborted) {
        controller.abort(
          new Error(asked || "the job was cancelled from another process"),
        );
      }
    }
    controller.signal.throwIfAborted();
    sealed = true;
    sealedJobs().add(id);
    log.info("job.sealed", reason);
    if (stored) {
      await updateJobMeta(dir, id, (current) =>
        LIVE_STATUSES.includes(current.status)
          ? { cancellable: false, updatedAt: Date.now() }
          : undefined,
      ).catch(() => undefined);
    }
  };

  const job: JobContext = {
    log,
    signal: controller.signal,
    tier: meta.tier,
    jobId: id,
    waiting,
    beyondCancel,
  };
  const done = (async (): Promise<JobOutcome<T>> => {
    try {
      let failure: JobError | undefined;
      const value = await log.step(
        "job",
        { kind: init.kind, label: init.label },
        async (step) => {
          const answer = await fn(job);
          failure = failureOf?.(answer);
          if (failure) step.fail(failure.message);
          return answer;
        },
      );
      const result = withSurfacedWarnings(value, log.surfaced);
      /* Cancelled is cancelled, even when the work came back anyway. */
      const cancelled = controller.signal.aborted;
      const error = cancelled
        ? cancelledError(controller.signal.reason)
        : failure;
      if (stored && !error && discardIf?.(value)) {
        /*
         * 39b: nothing worth a row on `/jobs` (a sync with nothing to do).
         * No heartbeat writes from here on (`stored`), and the delete waits
         * behind any meta write already in flight, so none lands after it.
         */
        stored = false;
        await updateJobMeta(dir, id, () => undefined).catch(() => undefined);
        await Promise.all([
          rm(metaPath(dir, id), { force: true }),
          rm(logPath(dir, id), { force: true }),
          rm(cancelPath(dir, id), { force: true }),
          rm(transcriptPath(dir, id), { force: true }),
        ]).catch(() => undefined);
        return { job: id, result };
      }
      await record({
        status: cancelled ? "cancelled" : failure ? "failed" : "done",
        endedAt: Date.now(),
        result,
        ...(error ? { error: recordedError(error) } : {}),
      });
      return { job: id, result };
    } catch (error) {
      const cancelled = controller.signal.aborted;
      /*
       * A cancel is `cancelled` on every transport (37c), not the abort
       * reason's plain `Error` — which `toErrorObject` would call `internal`.
       */
      const thrown = withJob(
        withWarnings(
          cancelled
            ? new CancelledError(
                cancelledError(controller.signal.reason).message,
              )
            : error,
          log.surfaced,
        ),
        id,
      );
      const { error: object } = toErrorObject(thrown);
      const { job: _job, ...kept } = object;
      await record({
        status: cancelled ? "cancelled" : "failed",
        endedAt: Date.now(),
        error: recordedError(kept),
      });
      throw thrown;
    } finally {
      clearInterval(timer);
      if (cancelPoll) clearInterval(cancelPoll);
      registry().delete(id);
      sealedJobs().delete(id);
      outside?.removeEventListener("abort", fromOutside);
      if (stored)
        await rm(cancelPath(dir, id), { force: true }).catch(() => {});
    }
  })();
  return { job: id, stored, done };
}
