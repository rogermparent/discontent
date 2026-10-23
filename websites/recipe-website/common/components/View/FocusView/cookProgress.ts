/**
 * The cook view's ticks, kept per recipe in sessionStorage (42c2, D1): which
 * steps are done, which ingredient lines are gathered, the step on screen and
 * the layout. A reload, or closing and reopening the view, finds them where
 * they were; a new tab or a new session starts clean — sessionStorage, not
 * localStorage, because yesterday's half-made recipe should not greet today's
 * cook.
 *
 * Storage is passed in (the page passes `window.sessionStorage`), and every
 * read and write is guarded: a private window, blocked storage or a stale
 * shape reads as nothing ticked.
 */

export type CookLayout = "step" | "list";

export interface CookProgress {
  /** Flattened step indices that are done. */
  done: number[];
  /** Ingredient line indices that are gathered. */
  gathered: number[];
  /** The flattened index of the step on screen in one-step layout. */
  step: number;
  layout: CookLayout;
}

/**
 * The key one recipe's progress lives under. `variant` is the path through
 * its alternatives (45e: `then-make=bagels`), so each option keeps its own
 * ticks; a recipe without alternatives has none and keeps its old key.
 */
export function cookProgressKey(slug: string, variant?: string): string {
  return variant ? `cook-view:${slug}|${variant}` : `cook-view:${slug}`;
}

/** Indices in range, each once, in order. */
function indices(value: unknown, length: number): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter(
      (index): index is number =>
        Number.isInteger(index) && index >= 0 && index < length,
    )
    .sort((a, b) => a - b);
}

/** The first step not yet done, or the last step when every one is. */
export function firstOpenStep(done: readonly number[], steps: number): number {
  if (steps <= 0) return 0;
  const ticked = new Set(done);
  for (let i = 0; i < steps; i++) if (!ticked.has(i)) return i;
  return steps - 1;
}

/**
 * A recipe's saved progress, fitted to its current shape: indices past the
 * end are dropped (the recipe was edited meanwhile), and a missing step
 * opens at the first one not done. `fallbackLayout` is the layout when none
 * was saved.
 */
export function readCookProgress(
  storage: Pick<Storage, "getItem"> | undefined,
  slug: string,
  shape: { steps: number; ingredients: number; fallbackLayout: CookLayout },
  variant?: string,
): CookProgress {
  let saved: Record<string, unknown> = {};
  try {
    const raw = storage?.getItem(cookProgressKey(slug, variant));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed === "object") {
      saved = parsed as Record<string, unknown>;
    }
  } catch {
    /* Unreadable: nothing ticked. */
  }
  const done = indices(saved.done, shape.steps);
  const gathered = indices(saved.gathered, shape.ingredients);
  const step =
    Number.isInteger(saved.step) &&
    (saved.step as number) >= 0 &&
    (saved.step as number) < shape.steps
      ? (saved.step as number)
      : firstOpenStep(done, shape.steps);
  const layout =
    saved.layout === "step" || saved.layout === "list"
      ? saved.layout
      : shape.fallbackLayout;
  return { done, gathered, step, layout };
}

/** Save a recipe's progress; a full or blocked store is ignored. */
export function writeCookProgress(
  storage: Pick<Storage, "setItem"> | undefined,
  slug: string,
  progress: CookProgress,
  variant?: string,
): void {
  try {
    storage?.setItem(cookProgressKey(slug, variant), JSON.stringify(progress));
  } catch {
    /* Quota or blocked storage: the view still works for this visit. */
  }
}

/** `window.sessionStorage`, or `undefined` where touching it throws. */
export function sessionStore(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
