/**
 * The CLI's own Ctrl-C (37c review): a signal a command's long wait can
 * watch, tripped by `index.ts`'s SIGINT/SIGTERM handler before it waits
 * for the command to wind down. A job this process runs stops through its
 * own abort (37a's registry); a command that only *follows* something —
 * `jobs log --follow` asking an editor every second — has no job to
 * cancel, and without this it would sleep on to its next read while the
 * handler's grace period ran out.
 *
 * Dependency-free, so the command table can load it at startup (35q).
 */
const controller = new AbortController();

/** Aborted once the CLI was asked to stop. */
export function cliSignal(): AbortSignal {
  return controller.signal;
}

/** Trip it: every wait that watches `cliSignal()` ends now. */
export function interruptCli(reason?: unknown): void {
  controller.abort(reason ?? new Error("interrupted"));
}

/**
 * Wait `ms`, or less when the CLI is interrupted first: true when the wait
 * ran its course, false when it was cut short.
 */
export function interruptibleSleep(ms: number): Promise<boolean> {
  const signal = cliSignal();
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
