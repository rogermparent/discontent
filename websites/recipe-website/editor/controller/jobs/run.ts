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
import { ulid } from "@discontent/cms/util/ulid";
import { toErrorObject, withWarnings } from "../curation/errors";
import type { JobContext } from "./context";
import { jobsDirectory } from "./location";
import {
  createJobLog,
  defaultJobMirror,
  redactText,
  type JobMirror,
} from "./log";
import {
  JOB_HEARTBEAT_MS,
  LIVE_STATUSES,
  logPath,
  newJobMeta,
  pruneJobs,
  sweepJobs,
  updateJobMeta,
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
}

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

/** Sweep `dir` once per process (D5): its dead processes' jobs end. */
function sweepOnce(dir: string): Promise<void> {
  let done = swept.get(dir);
  if (!done) {
    done = sweepJobs(dir).then(
      () => undefined,
      (error) => {
        console.warn(`[jobs] could not sweep ${dir}: ${describe(error)}`);
      },
    );
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
}

function registry(): Map<string, AbortController> {
  const global = globalThis as RegistryGlobal;
  return (global.__discontentRunningJobs ??= new Map());
}

/**
 * Abort a job this process is running (37b/37c's Cancel). False when it is
 * not running here — finished, or another process's.
 */
export function cancelJob(id: string, reason?: unknown): boolean {
  const controller = registry().get(id);
  if (!controller) return false;
  controller.abort(reason ?? new Error("the job was cancelled"));
  return true;
}

/** The ids of the jobs this process is running now. */
export function runningJobIds(): string[] {
  return [...registry().keys()];
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
 * is recorded and rethrown as it was, with the job's surfaced warnings.
 */
export async function runJob<T>(
  init: JobInit,
  fn: (job: JobContext) => Promise<T>,
  {
    dir = jobsDirectory(),
    mirror,
    signal: outside,
    failureOf,
    heartbeatMs = JOB_HEARTBEAT_MS,
  }: RunJobOptions<T> = {},
): Promise<JobOutcome<T>> {
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
      updatedAt: Date.now(),
    }).catch((error) => {
      console.warn(
        `[job ${id}] could not record its outcome: ${describe(error)}`,
      );
    });
  };

  const controller = new AbortController();
  const fromOutside = () => controller.abort(outside?.reason);
  if (outside?.aborted) fromOutside();
  else outside?.addEventListener("abort", fromOutside, { once: true });
  registry().set(id, controller);
  const timer = setInterval(beat, heartbeatMs);
  timer.unref?.();

  const job: JobContext = {
    log,
    signal: controller.signal,
    tier: meta.tier,
    jobId: id,
  };
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
    await record({
      status: cancelled ? "cancelled" : failure ? "failed" : "done",
      endedAt: Date.now(),
      result,
      ...(error ? { error: recordedError(error) } : {}),
    });
    return { job: id, result };
  } catch (error) {
    const thrown = withWarnings(error, log.surfaced);
    const cancelled = controller.signal.aborted;
    const { error: object } = toErrorObject(thrown);
    await record({
      status: cancelled ? "cancelled" : "failed",
      endedAt: Date.now(),
      error: recordedError(
        cancelled ? { ...object, code: "cancelled" } : object,
      ),
    });
    throw thrown;
  } finally {
    clearInterval(timer);
    registry().delete(id);
    outside?.removeEventListener("abort", fromOutside);
  }
}
