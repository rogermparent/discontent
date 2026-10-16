/**
 * Jobs that run with no record (39a, closing 38-Tb5).
 *
 * When the jobs directory cannot be written (37-T6), `startJob` runs the
 * job anyway and answers `stored: false`: `/api/jobs/<id>` has nothing to
 * say for it, and a panel that polled it would take the 404 as the end.
 * The form's import keeps such a job's outcome here, by id, and a second
 * server action (`importResultAction`) asks for it — so the panel stays
 * "running, can't be followed live" until the job really ends, then the
 * form is filled as it is for a followed job.
 *
 * **A bounded long-poll** (39a review): each ask waits at most
 * `UNSTORED_WAIT_MS` and answers `pending` or the outcome — never the whole
 * job, since Next's App Router runs one tab's server actions one at a
 * time, and an action that awaited a GPU-queued import would hold a
 * hand-typed Create behind it. The client asks again until the outcome, or
 * until `UNSTORED_KEEP_MS` has gone by.
 *
 * Process-local, as the job itself is: on `globalThis`, since an action and
 * the next one may be separate bundles (T5's registry). An outcome is
 * dropped once an ask has answered it (a `pending` answer drops nothing, so
 * an ask whose request was lost is asked again), and in any case after
 * `UNSTORED_KEEP_MS`.
 */

/** How long an outcome is kept, answered or not; the client's overall cap. */
export const UNSTORED_KEEP_MS = 30 * 60 * 1000;

/** How long one ask waits before it answers `pending`. */
export const UNSTORED_WAIT_MS = 15_000;

interface UnstoredGlobal {
  __discontentUnstoredJobs?: Map<string, Promise<unknown>>;
}

function unstored(): Map<string, Promise<unknown>> {
  const global = globalThis as UnstoredGlobal;
  return (global.__discontentUnstoredJobs ??= new Map());
}

/** Keep `done` for `job` until an ask answers it, or for `keepMs`. */
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

/** Whether this process keeps an outcome for `job` (it runs here, unrecorded). */
export function isUnstored(job: string): boolean {
  return unstored().has(job);
}

/** What one ask for a kept outcome answers (`waitUnstored`). */
export type UnstoredAnswer<T> =
  /** Not kept here: another instance's, answered already, or expired. */
  | { status: "missing" }
  /** Still running after the wait: ask again. */
  | { status: "pending" }
  | { status: "done"; value: T }
  | { status: "failed"; error: unknown };

/**
 * Wait at most `waitMs` for `job`'s kept outcome. A settled outcome is
 * answered and dropped; `pending` leaves it for the next ask.
 */
export async function waitUnstored<T = unknown>(
  job: string,
  waitMs = UNSTORED_WAIT_MS,
): Promise<UnstoredAnswer<T>> {
  const jobs = unstored();
  const done = jobs.get(job) as Promise<T> | undefined;
  if (!done) return { status: "missing" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const answer = await Promise.race<UnstoredAnswer<T>>([
    done.then(
      (value) => ({ status: "done", value }),
      (error: unknown) => ({ status: "failed", error }),
    ),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ status: "pending" }), waitMs);
    }),
  ]);
  clearTimeout(timer);
  if (answer.status !== "pending" && jobs.get(job) === done) jobs.delete(job);
  return answer;
}
