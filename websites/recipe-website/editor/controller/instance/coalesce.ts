/**
 * Run `task` at most once at a time, never dropping a call (epic 28, D12).
 *
 * A call while the task runs — or while `blocked()` says to wait — is
 * remembered, and the task runs again once it is free. Any number of such
 * calls is one more run. The first D12 reindex returned early instead, and on
 * the Pi (a rebuild takes 15–25 s) a push that landed mid-rebuild was never
 * indexed: the stamp stayed one commit behind until someone pressed Rebuild.
 *
 * `blocked` callers must call `kick()` when they unblock (the sync runner does
 * at the end of every run).
 */
export interface CoalescedTask {
  (): Promise<void>;
  /** Run now if something was deferred while blocked. */
  kick(): Promise<void>;
  readonly running: boolean;
}

export function createCoalescedTask(
  task: () => Promise<void>,
  { blocked = () => false }: { blocked?: () => boolean } = {},
): CoalescedTask {
  let running = false;
  let again = false;

  async function call(): Promise<void> {
    if (running || blocked()) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        try {
          await task();
        } catch (error) {
          console.error("[instance] task failed:", error);
        }
      } while (again && !blocked());
    } finally {
      running = false;
    }
  }

  const coalesced = call as CoalescedTask;
  coalesced.kick = async () => {
    if (again) {
      again = false;
      await call();
    }
  };
  Object.defineProperty(coalesced, "running", { get: () => running });
  return coalesced;
}
