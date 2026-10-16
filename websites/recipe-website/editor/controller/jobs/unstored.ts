/**
 * Jobs that run with no record (39a, closing 38-Tb5).
 *
 * When the jobs directory cannot be written (37-T6), `startJob` runs the
 * job anyway and answers `stored: false`: `/api/jobs/<id>` has nothing to
 * say for it, and a panel that polled it would take the 404 as the end.
 * The form's import keeps such a job's outcome here, by id, and a second
 * server action (`importResultAction`) awaits it — so the panel stays
 * "running, can't be followed live" until the job really ends, then the
 * form is filled as it is for a followed job.
 *
 * Process-local, as the job itself is: on `globalThis`, since an action and
 * the next one may be separate bundles (T5's registry). An outcome nobody
 * asks for is forgotten after `UNSTORED_KEEP_MS`; one asked for is taken.
 */

/** How long an unclaimed outcome is kept. */
export const UNSTORED_KEEP_MS = 30 * 60 * 1000;

interface UnstoredGlobal {
  __discontentUnstoredJobs?: Map<string, Promise<unknown>>;
}

function unstored(): Map<string, Promise<unknown>> {
  const global = globalThis as UnstoredGlobal;
  return (global.__discontentUnstoredJobs ??= new Map());
}

/** Keep `done` for `job` until it is taken, or for `keepMs`. */
export function keepUnstored(
  job: string,
  done: Promise<unknown>,
  keepMs = UNSTORED_KEEP_MS,
): void {
  /* Handled here: an outcome nobody takes must not be an unhandled rejection. */
  done.catch(() => undefined);
  const jobs = unstored();
  jobs.set(job, done);
  const timer = setTimeout(() => {
    if (jobs.get(job) === done) jobs.delete(job);
  }, keepMs);
  timer.unref?.();
}

/** The kept outcome of `job`, taken (asked once), or `undefined`. */
export function takeUnstored<T = unknown>(job: string): Promise<T> | undefined {
  const jobs = unstored();
  const done = jobs.get(job);
  if (!done) return undefined;
  jobs.delete(job);
  return done as Promise<T>;
}
