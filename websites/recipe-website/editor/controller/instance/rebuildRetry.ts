/**
 * The instance's own rebuild, retried a bounded number of times after it
 * fails (40c; 39b review, L5).
 *
 * Before 40c a failed start-time rebuild (the index version moved, or HEAD
 * moved while the editor was down) just failed: `failed` on `/jobs`, the
 * error on the log, and nothing asked again until the next HEAD move. On a
 * Pi nobody watches overnight, the stale-index banner could stand for hours.
 *
 * Now a failure schedules another attempt after `REBUILD_RETRY_DELAYS_MS[n]`
 * (1, 5 and 15 minutes: the n-th retry waits the n-th delay after the
 * failure before it), then gives up and says so. The schedule stops:
 *
 * - **on success** — a rebuild that ran, or a check that found nothing to do;
 * - **on a newer HEAD move** (`headMoved`) — that path asks again by itself,
 *   so the pending attempt is dropped and a failure of that ask starts the
 *   count again from the first delay;
 * - **on shutdown** (`dispose`).
 *
 * A `busy` answer (the repository's line or write lock held past the
 * rebuild's wait) is a failure like any other: it waits for the next
 * scheduled attempt, never a tight loop. Every attempt goes through the
 * coalesced task, so it never runs beside another rebuild here and waits
 * out a sync in progress like a HEAD move's would.
 */
import { isBusyError } from "../curation/errors";
import { outsideQueue } from "../jobs/queue";
import { createCoalescedTask, type CoalescedTask } from "./coalesce";

/** After the 1st, 2nd and 3rd failure in a row; then no more. */
export const REBUILD_RETRY_DELAYS_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  15 * 60_000,
];

export interface RetryingRebuild {
  /** Ask for a rebuild check now (coalesced, never dropped). */
  task: CoalescedTask;
  /** A HEAD move is about to ask: drop the pending retry, reset the count. */
  headMoved(): void;
  /** Shutdown: clear the pending retry; nothing is scheduled after this. */
  dispose(): void;
  /** Whether a retry is scheduled. */
  readonly pending: boolean;
  /** Failures in a row since the last success or HEAD move. */
  readonly failures: number;
}

function minutes(ms: number): string {
  const value = ms / 60_000;
  return value === 1 ? "1 minute" : `${value} minutes`;
}

export function createRetryingRebuild({
  rebuild,
  blocked,
  delaysMs = REBUILD_RETRY_DELAYS_MS,
}: {
  rebuild: () => Promise<unknown>;
  blocked?: () => boolean;
  delaysMs?: readonly number[];
}): RetryingRebuild {
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function clear(): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }

  function failed(error: unknown): void {
    if (disposed) return;
    clear();
    const busy = isBusyError(error);
    const what = busy ? "was busy" : "failed";
    if (failures >= delaysMs.length) {
      console.error(
        `[instance] the index rebuild ${what} again; no more retries ` +
          `(${delaysMs.length} made). The next HEAD move asks again, or ` +
          "Rebuild indexes on the editor's Git page.",
      );
      return;
    }
    const delay = delaysMs[failures];
    failures += 1;
    console.info(
      `[instance] the index rebuild ${what}; retrying in ${minutes(delay)} ` +
        `(retry ${failures} of ${delaysMs.length})`,
    );
    /*
     * Outside any queue hold: the failure may be noticed from a context
     * that a sync's `finally` started, and the retry must wait in the
     * repository's line like anyone (as `retryAfterBusy`'s timer does).
     */
    timer = outsideQueue(() =>
      setTimeout(() => {
        timer = undefined;
        if (!disposed) void task();
      }, delay),
    );
    (timer as { unref?: () => void }).unref?.();
  }

  const task = createCoalescedTask(
    async () => {
      try {
        await rebuild();
      } catch (error) {
        failed(error);
        throw error;
      }
      failures = 0;
      clear();
    },
    blocked ? { blocked } : {},
  );

  return {
    task,
    headMoved() {
      clear();
      failures = 0;
    },
    dispose() {
      disposed = true;
      clear();
    },
    get pending() {
      return timer !== undefined;
    },
    get failures() {
      return failures;
    },
  };
}
