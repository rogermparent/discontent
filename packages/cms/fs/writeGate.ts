/**
 * A per-process gate in front of every write into a content directory (41b).
 *
 * `withWriteLock` (`git/writeLock.ts`) keeps two *writers* from interleaving.
 * This answers a different question: "is anything in this process writing
 * into the directory right now, and can I stop new writes while I replace
 * it?" The Playwright harnesses need exactly that. Their `resetData` removes
 * `test-content` and copies a fixture over it between tests, while work the
 * previous test started — a server action whose page was already closed, a
 * page render still transforming an image — can be landing files there. The
 * removal then failed `ENOTEMPTY`, the copy `EEXIST`, and worse, a late file
 * survived into the next test's corpus (40-Tf5). `withWriteLock` alone could
 * not close that: outside a git repository it takes no lock at all, and most
 * fixtures are not repositories.
 *
 * - **`trackContentWrite`** wraps a write. Every `withWriteLock` call goes
 *   through it, as does the image transform cache. It waits while the gate
 *   is closed, then counts itself in flight. Re-entrant: a write nested in a
 *   tracked one (same async context, same directory) just runs, so a closed
 *   gate never deadlocks a write against itself.
 * - **`pauseContentWrites`** closes the gate and waits for the writes in
 *   flight to finish; it answers the function that reopens it. Writes that
 *   arrive meanwhile wait at the gate.
 * - **`holdContentWrites` / `releaseContentWrites`** are the same pause split
 *   across two requests, for a harness that resets the directory from
 *   another process: hold, reset, release. A hold whose release never comes
 *   reopens by itself after `holdMs`.
 *
 * **Keyed by the directory as spelled**, not by its resolved path: a
 * `path.resolve` of a runtime path reads to Turbopack as "trace the whole
 * project" (#269, `getContentDirectory.ts`), and every caller in a server
 * spells the directory the same way, from `getContentDirectory()`.
 *
 * **State lives on `globalThis`**, because Next can bundle one module into
 * more than one layer of a server (route handlers, server actions, pages), and
 * a module-level map per copy would let a route pause a gate the server
 * actions never look at.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** The writes `pauseContentWrites` gave up waiting for. */
export class WritesStillRunningError extends Error {
  constructor(
    readonly contentDirectory: string,
    readonly running: string[],
    readonly waitedMs: number,
  ) {
    super(
      `Writes into ${contentDirectory} still running after ${(
        waitedMs / 1000
      ).toFixed(1)} s: ${running.join(", ") || "(unnamed)"}.`,
    );
    this.name = "WritesStillRunningError";
  }
}

interface Gate {
  /** What each write in flight is doing (`op`), for the timeout's message. */
  inflight: Set<{ op: string }>;
  /** Called each time `inflight` empties. */
  drained: Set<() => void>;
  /** Set while paused: new writes wait on `promise`. */
  closed: { promise: Promise<void> } | null;
  /** A cross-request hold's release (`holdContentWrites`). */
  held: (() => void) | null;
}

interface GateState {
  gates: Map<string, Gate>;
  /** The directories this async context is already writing into. */
  inside: AsyncLocalStorage<ReadonlySet<string>>;
}

const STATE = Symbol.for("@discontent/cms/fs/writeGate");

function state(): GateState {
  const slot = globalThis as unknown as Record<symbol, GateState | undefined>;
  return (slot[STATE] ??= {
    gates: new Map(),
    inside: new AsyncLocalStorage(),
  });
}

function gateFor(contentDirectory: string): Gate {
  const { gates } = state();
  let gate = gates.get(contentDirectory);
  if (!gate) {
    gate = {
      inflight: new Set(),
      drained: new Set(),
      closed: null,
      held: null,
    };
    gates.set(contentDirectory, gate);
  }
  return gate;
}

/**
 * Run `fn`, a write into `contentDirectory`, through the gate: after any
 * pause in force, and counted until it settles.
 */
export async function trackContentWrite<T>(
  contentDirectory: string,
  op: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { inside } = state();
  const entered = inside.getStore();
  if (entered?.has(contentDirectory)) return fn();
  const gate = gateFor(contentDirectory);
  while (gate.closed) await gate.closed.promise;
  const entry = { op };
  gate.inflight.add(entry);
  try {
    return await inside.run(
      new Set([...(entered ?? []), contentDirectory]),
      fn,
    );
  } finally {
    gate.inflight.delete(entry);
    if (gate.inflight.size === 0) {
      for (const done of [...gate.drained]) done();
    }
  }
}

/**
 * Run `fn` as if no write were in progress — for work scheduled from inside a
 * write that outlives it (`writeLock.ts`'s `outsideWriteLock`), which must
 * meet the gate like any other write rather than pass as a nested one.
 */
export function outsideContentWrite<T>(fn: () => T): T {
  return state().inside.exit(fn);
}

/** How many writes into `contentDirectory` are in flight in this process. */
export function contentWritesInFlight(contentDirectory: string): number {
  return state().gates.get(contentDirectory)?.inflight.size ?? 0;
}

/**
 * Close the gate on `contentDirectory` and wait for the writes in flight to
 * finish. Answers the function that reopens it (idempotent). Writes that
 * arrive while it is closed wait, and run once it reopens.
 *
 * Throws `WritesStillRunningError` (and reopens the gate) when the writes in
 * flight outlast `timeoutMs`; never call it from inside a write, which would
 * wait for itself.
 */
export async function pauseContentWrites(
  contentDirectory: string,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<() => void> {
  if (state().inside.getStore()?.has(contentDirectory)) {
    throw new Error(
      `pauseContentWrites: called from inside a write into ${contentDirectory}`,
    );
  }
  const gate = gateFor(contentDirectory);
  /* One pause at a time: a second waits for the first to reopen. */
  while (gate.closed) await gate.closed.promise;

  let open!: () => void;
  const closed = { promise: new Promise<void>((done) => (open = done)) };
  gate.closed = closed;
  let reopened = false;
  const resume = () => {
    if (reopened) return;
    reopened = true;
    if (gate.closed === closed) gate.closed = null;
    open();
  };

  if (gate.inflight.size > 0) {
    const started = Date.now();
    const drained = await new Promise<boolean>((settle) => {
      const timer = setTimeout(() => {
        gate.drained.delete(done);
        settle(false);
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        gate.drained.delete(done);
        settle(true);
      };
      gate.drained.add(done);
    });
    if (!drained) {
      const running = [...gate.inflight].map(({ op }) => op);
      resume();
      throw new WritesStillRunningError(
        contentDirectory,
        running,
        Date.now() - started,
      );
    }
  }
  return resume;
}

/**
 * `pauseContentWrites`, held until `releaseContentWrites` — or `holdMs`, so a
 * harness that died between the two cannot leave the server unable to write.
 * A hold taken while one is in force replaces it.
 */
export async function holdContentWrites(
  contentDirectory: string,
  { timeoutMs, holdMs = 30_000 }: { timeoutMs?: number; holdMs?: number } = {},
): Promise<void> {
  const gate = gateFor(contentDirectory);
  gate.held?.();
  const resume = await pauseContentWrites(contentDirectory, { timeoutMs });
  const release = () => {
    clearTimeout(timer);
    if (gate.held === release) gate.held = null;
    resume();
  };
  const timer = setTimeout(release, holdMs);
  timer.unref?.();
  gate.held = release;
}

/** End `holdContentWrites`' hold; false when none was in force. */
export function releaseContentWrites(contentDirectory: string): boolean {
  const release = state().gates.get(contentDirectory)?.held;
  if (!release) return false;
  release();
  return true;
}
