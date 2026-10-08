/**
 * The workstation's sync runner (epic 28, D4): every trigger — startup, a
 * local HEAD move, a mirror's ping, "Sync now" — feeds one queue.
 *
 * - **Debounced:** triggers within `debounceMs` of each other are one run, so
 *   a bulk retag (dozens of commits) syncs once.
 * - **Serialised:** one run at a time.
 * - **Coalesced:** any number of triggers during a run queue exactly one more.
 * - **Own HEAD ignored:** a run's merge moves HEAD, and the ref watcher would
 *   report it; `headMoved` drops the event for the HEAD a run produced, so it
 *   dropped instead of starting a pointless second run.
 *
 * `runNow` skips the debounce for callers that want the result (a mirror's
 * ping, the Mirrors card's button) but still waits its turn behind a run in
 * progress.
 *
 * Pure scheduling: what a run *does* is the injected `run`, so this is tested
 * with fake timers and no git.
 */

export type SyncTrigger =
  | "startup"
  | "change"
  | "ping"
  | "manual"
  /** The workstation's site settings were saved (D7). */
  | "settings";

export interface RunnerOptions<T> {
  run: (triggers: SyncTrigger[]) => Promise<T>;
  debounceMs?: number;
  /** HEAD after a run, so the watcher's event for it can be ignored. */
  headAfterRun?: () => Promise<string | null>;
  onError?: (error: unknown) => void;
}

export interface SyncRunner<T> {
  /** Debounced. */
  request(trigger: SyncTrigger): void;
  /** Immediate (after any run in progress); resolves with that run's result. */
  runNow(trigger: SyncTrigger): Promise<T>;
  /** A watcher event: dropped when `head` is the one the last run produced. */
  headMoved(head: string): void;
  /** A sync that ran outside the runner (a ping) produced this HEAD. */
  noteOwnHead(head: string): void;
  readonly busy: boolean;
  /** Resolves when nothing is running or scheduled (tests). */
  idle(): Promise<void>;
  dispose(): void;
}

export function createSyncRunner<T>({
  run,
  debounceMs = 3000,
  headAfterRun,
  onError = (error) => console.error("[sync] run failed:", error),
}: RunnerOptions<T>): SyncRunner<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: SyncTrigger[] = [];
  let running: Promise<T | undefined> | null = null;
  let rerun = false;
  let ownHead: string | null = null;
  let disposed = false;
  const idleWaiters: (() => void)[] = [];

  function settleIdle() {
    if (!running && !timer && !rerun) {
      for (const resolve of idleWaiters.splice(0)) resolve();
    }
  }

  async function execute(): Promise<T | undefined> {
    const triggers =
      pending.length > 0 ? pending : (["change"] as SyncTrigger[]);
    pending = [];
    try {
      const result = await run(triggers);
      try {
        ownHead = (await headAfterRun?.()) ?? ownHead;
      } catch {
        /* Only an optimisation. */
      }
      return result;
    } catch (error) {
      onError(error);
      return undefined;
    }
  }

  function start(): Promise<T | undefined> {
    const current = (async () => {
      try {
        return await execute();
      } finally {
        running = null;
        if (rerun && !disposed) {
          rerun = false;
          running = start();
        } else {
          settleIdle();
        }
      }
    })();
    running = current;
    return current;
  }

  function fire() {
    timer = undefined;
    if (disposed) return;
    if (running) {
      rerun = true;
      return;
    }
    void start();
  }

  return {
    request(trigger) {
      if (disposed) return;
      pending.push(trigger);
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, debounceMs);
      (timer as { unref?: () => void }).unref?.();
    },
    async runNow(trigger) {
      pending.push(trigger);
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      while (running) {
        await running.catch(() => undefined);
      }
      const result = await start();
      if (result === undefined) {
        throw new Error("The sync run failed; see the editor's log.");
      }
      return result;
    },
    headMoved(head) {
      if (head === ownHead) return;
      this.request("change");
    },
    noteOwnHead(head) {
      ownHead = head;
    },
    get busy() {
      return running !== null;
    },
    idle() {
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
        settleIdle();
      });
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      /* A queued rerun never starts now, so `idle()` must not wait for it. */
      rerun = false;
      settleIdle();
    },
  };
}
