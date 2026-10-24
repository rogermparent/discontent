/**
 * The recipe page's kitchen timers (42c2), as pure state: a list of timers
 * and what each action makes of it. The page's `TimersProvider` holds the
 * list and the clock; everything here takes `now` (ms since the epoch) and
 * answers a new list, so it is testable without a DOM or a fake timer.
 *
 * A running timer stores **when it ends**, not how long it has left: the
 * remaining time is always `endsAt - now`, so a tab the browser throttled or
 * put to sleep reads right the moment it wakes, however few intervals fired
 * meanwhile. A paused timer stores what was left instead.
 */

export type KitchenTimerStatus = "running" | "paused" | "done";

export interface KitchenTimer {
  /** One per timer button: the step number and the time's place in it. */
  id: string;
  /** What the tray calls it: "Step 5 · 25 minutes". */
  label: string;
  /** The words the step used: "45 to 50 minutes". */
  text: string;
  /** How long it runs, in seconds. */
  seconds: number;
  status: KitchenTimerStatus;
  /** While running: when it ends. */
  endsAt?: number;
  /** While paused: what was left, in ms. */
  remainingMs?: number;
}

export interface KitchenTimerStart {
  id: string;
  label: string;
  text: string;
  seconds: number;
}

/**
 * Start a timer, or start it again from the top: a timer already in the list
 * under this id is replaced in place (its row keeps its spot in the tray);
 * a new one joins the end.
 */
export function startTimer(
  timers: readonly KitchenTimer[],
  start: KitchenTimerStart,
  now: number,
): KitchenTimer[] {
  const timer: KitchenTimer = {
    ...start,
    status: "running",
    endsAt: now + start.seconds * 1000,
  };
  return timers.some(({ id }) => id === start.id)
    ? timers.map((existing) => (existing.id === start.id ? timer : existing))
    : [...timers, timer];
}

/** Time left on a timer, in ms: 0 once done, never negative. */
export function remainingMs(timer: KitchenTimer, now: number): number {
  if (timer.status === "done") return 0;
  if (timer.status === "paused") return Math.max(0, timer.remainingMs ?? 0);
  return Math.max(0, (timer.endsAt ?? now) - now);
}

/** Pause a running timer, keeping what is left. Anything else is unchanged. */
export function pauseTimer(
  timers: readonly KitchenTimer[],
  id: string,
  now: number,
): KitchenTimer[] {
  return timers.map((timer) =>
    timer.id === id && timer.status === "running"
      ? {
          ...timer,
          status: "paused",
          remainingMs: remainingMs(timer, now),
          endsAt: undefined,
        }
      : timer,
  );
}

/** Resume a paused timer from what it had left. */
export function resumeTimer(
  timers: readonly KitchenTimer[],
  id: string,
  now: number,
): KitchenTimer[] {
  return timers.map((timer) =>
    timer.id === id && timer.status === "paused"
      ? {
          ...timer,
          status: "running",
          endsAt: now + (timer.remainingMs ?? 0),
          remainingMs: undefined,
        }
      : timer,
  );
}

/** Take a timer out of the list — cancelled, or a finished one dismissed. */
export function removeTimer(
  timers: readonly KitchenTimer[],
  id: string,
): KitchenTimer[] {
  return timers.filter((timer) => timer.id !== id);
}

/**
 * Mark every running timer whose end has passed as done. Answers the new list
 * and the timers that finished on this call, so the caller rings once per
 * timer however late the check comes. The same list (by identity) when
 * nothing finished, so a React state update can skip the render.
 */
export function finishDue(
  timers: readonly KitchenTimer[],
  now: number,
): { timers: readonly KitchenTimer[]; finished: KitchenTimer[] } {
  const finished = timers.filter(
    (timer) => timer.status === "running" && (timer.endsAt ?? 0) <= now,
  );
  if (finished.length === 0) return { timers, finished };
  const ids = new Set(finished.map(({ id }) => id));
  return {
    timers: timers.map((timer) =>
      ids.has(timer.id)
        ? { ...timer, status: "done", endsAt: undefined, remainingMs: 0 }
        : timer,
    ),
    finished: finished.map((timer) => ({ ...timer, status: "done" })),
  };
}

/** Whether any timer still needs the clock to tick. */
export function anyRunning(timers: readonly KitchenTimer[]): boolean {
  return timers.some((timer) => timer.status === "running");
}

/**
 * The id of a step's nth time: the same on the page and in the cook view.
 * `step` is its page number, or inside an option of a set of alternatives
 * (45e, G4) the option's key and number (`bagels-6`), so two options' sixth
 * steps never share a timer.
 */
export function stepTimerId(step: number | string, index: number): string {
  return `step-${step}-${index}`;
}
