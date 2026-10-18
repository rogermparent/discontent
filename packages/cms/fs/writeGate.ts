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
 *   through it, as does the image transform cache. It counts itself in flight
 *   until it settles. **A closed gate refuses it** with
 *   `ContentWritesHeldError`: it does not wait and run after the gate
 *   reopens, because by then the directory is the next test's fixture and a
 *   deferred write would land in it — the very leak the gate exists to stop.
 * - **Re-entrant**: a write nested in a tracked one (same async context, same
 *   directory, the outer one still running) is counted but not refused, so a
 *   closed gate never fails a write half-way, nor deadlocks a pause. As in
 *   `writeLock.ts`, the scope's `active` flag drops when the outer write
 *   settles, so work it left running in the background meets the gate like
 *   any other write.
 * - **`pauseContentWrites`** closes the gate and waits for the writes in
 *   flight to finish; it answers the function that reopens it.
 * - **`holdContentWrites` / `releaseContentWrites`** are the same pause split
 *   across two requests, for a harness that resets the directory from
 *   another process: hold, reset, release. The hold answers an id and only a
 *   release naming it ends the hold, so a late or repeated release cannot end
 *   a newer one. A hold whose release never comes reopens by itself after
 *   `holdMs`, with a warning.
 *
 * Nothing outside the test harnesses closes the gate, so in a normal server
 * every write passes it untouched: one counter on the write path.
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
import { ulid } from "../util/ulid";

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

/** A write that met a closed gate: refused, not queued. */
export class ContentWritesHeldError extends Error {
  constructor(
    readonly contentDirectory: string,
    readonly op: string,
  ) {
    super(
      `Content writes into ${contentDirectory} are held for a test reset: "${op}" was refused, not queued.`,
    );
    this.name = "ContentWritesHeldError";
  }
}

interface Gate {
  /** What each write in flight is doing (`op`), for the timeout's message. */
  inflight: Set<{ op: string }>;
  /** Called each time `inflight` empties. */
  drained: Set<() => void>;
  /** Set while paused: new writes are refused; a second pause waits on it. */
  closed: { promise: Promise<void> } | null;
  /** The cross-request hold in force (`holdContentWrites`). */
  held: { id: string; release: () => void } | null;
}

/** A tracked write's scope; `active` drops when it settles. */
interface Scope {
  active: boolean;
}

interface GateState {
  gates: Map<string, Gate>;
  /** The directories this async context is writing into. */
  inside: AsyncLocalStorage<ReadonlyMap<string, Scope>>;
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

/** Whether this async context is inside a running write into the directory. */
function insideWrite(contentDirectory: string): boolean {
  return state().inside.getStore()?.get(contentDirectory)?.active === true;
}

/**
 * Run `fn`, a write into `contentDirectory`, through the gate: refused with
 * `ContentWritesHeldError` while it is closed (unless nested in a write
 * already running), and counted until it settles.
 */
export async function trackContentWrite<T>(
  contentDirectory: string,
  op: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { inside } = state();
  const entered = inside.getStore();
  const nested = entered?.get(contentDirectory)?.active === true;
  const gate = gateFor(contentDirectory);
  if (!nested && gate.closed) {
    throw new ContentWritesHeldError(contentDirectory, op);
  }
  const entry = { op };
  gate.inflight.add(entry);
  const scope: Scope | null = nested ? null : { active: true };
  try {
    if (!scope) return await fn();
    const next = new Map(entered ?? []);
    next.set(contentDirectory, scope);
    return await inside.run(next, fn);
  } finally {
    if (scope) scope.active = false;
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
 * arrive while it is closed are refused (`ContentWritesHeldError`).
 *
 * Throws `WritesStillRunningError` (and reopens the gate) when the writes in
 * flight outlast `timeoutMs`; never call it from inside a write, which would
 * wait for itself.
 */
export async function pauseContentWrites(
  contentDirectory: string,
  { timeoutMs = 20_000 }: { timeoutMs?: number } = {},
): Promise<() => void> {
  if (insideWrite(contentDirectory)) {
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
 * `pauseContentWrites`, held until `releaseContentWrites` names the id this
 * answers — or for `holdMs`, so a harness that died between the two cannot
 * leave the server unable to write. A hold taken while one is in force
 * replaces it: the old one's id goes stale.
 */
export async function holdContentWrites(
  contentDirectory: string,
  { timeoutMs, holdMs = 30_000 }: { timeoutMs?: number; holdMs?: number } = {},
): Promise<string> {
  const gate = gateFor(contentDirectory);
  gate.held?.release();
  const resume = await pauseContentWrites(contentDirectory, { timeoutMs });
  const id = ulid();
  const hold = {
    id,
    release: () => {
      clearTimeout(timer);
      if (gate.held === hold) gate.held = null;
      resume();
    },
  };
  const timer = setTimeout(() => {
    console.warn(
      `Content write hold ${id} on ${contentDirectory} ended by itself after ${(
        holdMs / 1000
      ).toFixed(1)} s: its release never came.`,
    );
    hold.release();
  }, holdMs);
  timer.unref?.();
  gate.held = hold;
  return id;
}

/**
 * End the hold `holdContentWrites` answered `id` for. False, and nothing
 * changes, when that hold is not the one in force — it ended by itself, or a
 * newer hold replaced it.
 */
export function releaseContentWrites(
  contentDirectory: string,
  id: string,
): boolean {
  const held = state().gates.get(contentDirectory)?.held;
  if (!held || held.id !== id) return false;
  held.release();
  return true;
}
