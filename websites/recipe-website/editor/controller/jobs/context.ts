/**
 * The one thing a job hands its work (epic 37, 37a review): `JobContext`,
 * `{log, signal, tier, jobId}`. Every seat that can run in a job takes it as
 * one options object (`job`), never as positional parameters, so 37b's
 * queue (which needs the tier) and cancellation (the signal) reach the
 * whole import path without another signature change.
 *
 * Seats take a `JobRun` — the context with every field optional — and
 * default to `NO_JOB`: the no-op log, no signal, `interactive`. A seat
 * called outside a job (a unit test, a script) behaves exactly as before.
 */
import { NO_LOG, type JobLog } from "./log";

/** `interactive` (form, API, MCP) goes ahead of `batch` (D4, 37b). */
export type JobTier = "interactive" | "batch";

export interface JobContext {
  /** The job's step log; `NO_LOG` outside a job. */
  readonly log: JobLog;
  /** Aborted when the job is cancelled (37b/37c); none outside a job. */
  readonly signal?: AbortSignal;
  /** Where the job waits in the queue (D4). */
  readonly tier: JobTier;
  /** The job's id; none outside a job. */
  readonly jobId?: string;
  /**
   * Told when the job starts and stops waiting for a resource (37b): `runJob`
   * mirrors it into the meta's `waiting`, for the `/jobs` page.
   */
  readonly waiting?: (waiting: JobWaiting | undefined) => void;
  /**
   * The job has reached a point a cancel must not interrupt (39b: a
   * reindex's first atomic swap). Rejects with the abort's reason if a
   * cancel arrived before it — from this process or another's `<id>.cancel`;
   * after it, a cancel is **refused** (`requestJobCancel` answers `refused`,
   * the meta says `cancellable: false`) and the job runs to its end. Absent
   * outside a job.
   */
  readonly beyondCancel?: (reason: string) => Promise<void>;
}

/** What a job is waiting for in the queue (D4), as its meta shows it. */
export interface JobWaiting {
  resource: string;
  tier: JobTier;
  /** Epoch ms: when it joined the queue. */
  since: number;
  /** How many were ahead of it then (the holder counts as one). */
  position: number;
}

/** What a seat accepts: any part of a context (the rest is `NO_JOB`'s). */
export type JobRun = Partial<JobContext>;

/** No job: steps just run, nothing is written, nothing can cancel. */
export const NO_JOB: JobContext = Object.freeze({
  log: NO_LOG,
  tier: "interactive" as const,
});

/** A whole context from a partial one. */
export function jobContext(run: JobRun | undefined): JobContext {
  if (!run) return NO_JOB;
  const log = run.log ?? NO_LOG;
  const jobId = run.jobId ?? log.jobId;
  return {
    log,
    tier: run.tier ?? "interactive",
    ...(run.signal ? { signal: run.signal } : {}),
    ...(jobId ? { jobId } : {}),
    ...(run.waiting ? { waiting: run.waiting } : {}),
    ...(run.beyondCancel ? { beyondCancel: run.beyondCancel } : {}),
  };
}
