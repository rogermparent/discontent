/**
 * The `/shopping` page's tick batching (epic 35, D9), as pure functions.
 *
 * A tick is optimistic: it changes what the page shows at once and joins a
 * `pending` map of item id → the `checked` it should end as. The page sends
 * the whole map as one PATCH after a quiet spell (`FLUSH_DELAY_MS`) or when
 * the page is hidden — so a run round the shop is a handful of commits, not
 * one per item. A tick and an untick of the same item before a flush cancel
 * out in the map, and a flush that fails puts nothing back: the entries stay
 * until the server has them.
 *
 * Pure, and safe in the browser; the hook in
 * `components/ShoppingPage/useShoppingList.ts` owns the timers and fetches.
 */
import type { ShoppingItem } from "./shoppingTypes";

/** Item id → the `checked` the page has promised it. */
export type PendingTicks = ReadonlyMap<string, boolean>;

/** How long the page waits after the last tick before it sends the batch. */
export const FLUSH_DELAY_MS = 1500;

/** The longest wait between retries of a refused (`busy`) or failed flush. */
export const MAX_RETRY_MS = 30_000;

/** `ids` ticked (or unticked): the newest wish for each id wins. */
export function queueTicks(
  pending: PendingTicks,
  ids: readonly string[],
  checked: boolean,
): Map<string, boolean> {
  const next = new Map(pending);
  for (const id of ids) next.set(id, checked);
  return next;
}

/** The batch as `patchShopping`'s body. */
export function toPatch(pending: PendingTicks): {
  check: string[];
  uncheck: string[];
} {
  const check: string[] = [];
  const uncheck: string[] = [];
  for (const [id, checked] of pending) (checked ? check : uncheck).push(id);
  return { check, uncheck };
}

/** The items as the page shows them: the server's, with the pending ticks over them. */
export function applyPending(
  items: readonly ShoppingItem[],
  pending: PendingTicks,
): ShoppingItem[] {
  if (pending.size === 0) return [...items];
  return items.map((item) => {
    const wanted = pending.get(item.id);
    if (wanted === undefined || Boolean(item.checked) === wanted) return item;
    const next: ShoppingItem = { ...item };
    if (wanted) next.checked = true;
    else delete next.checked;
    return next;
  });
}

/**
 * After a flush of `sent` succeeded: drop each entry the server now has —
 * unless it was ticked again since (its value differs from what was sent) —
 * and the ids the server no longer knows (cleared on another device).
 */
export function settle(
  pending: PendingTicks,
  sent: PendingTicks,
  unknown: readonly string[] = [],
): Map<string, boolean> {
  const gone = new Set(unknown);
  const next = new Map<string, boolean>();
  for (const [id, checked] of pending) {
    if (gone.has(id)) continue;
    if (sent.get(id) === checked) continue;
    next.set(id, checked);
  }
  return next;
}

/** The wait before retry `attempt` (0-based): 1 s, 2 s, 4 s … up to 30 s. */
export function retryDelay(attempt: number): number {
  return Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.max(0, attempt));
}

/**
 * How long ticks kept in `sessionStorage` stay worth sending. A tab restored
 * hours later would otherwise replay old ticks over what another device has
 * done since.
 */
export const STORED_TICKS_MAX_AGE_MS = 10 * 60_000;

/** For `sessionStorage`: the map as JSON pairs, with when it was written. */
export function serializePending(pending: PendingTicks, at: number): string {
  return JSON.stringify({ at, ticks: [...pending] });
}

/**
 * Back from `sessionStorage`; anything malformed, or older than `maxAgeMs`
 * at `now`, reads as nothing pending.
 */
export function parsePending(
  raw: string | null,
  now: number,
  maxAgeMs: number = STORED_TICKS_MAX_AGE_MS,
): Map<string, boolean> {
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; ticks?: unknown };
    if (
      typeof parsed?.at !== "number" ||
      !Array.isArray(parsed.ticks) ||
      now - parsed.at > maxAgeMs
    ) {
      return new Map();
    }
    return new Map(
      parsed.ticks.filter(
        (entry): entry is [string, boolean] =>
          Array.isArray(entry) &&
          typeof entry[0] === "string" &&
          typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return new Map();
  }
}

/**
 * 39-D3: how long a tick held for "Done shopping" (38d) stays worth sending.
 * A shop can outlast `STORED_TICKS_MAX_AGE_MS` many times over, but a tick
 * left on a phone for weeks would replay over everything every other device
 * has done since. Each tick is aged from when it was made, not from the last
 * write of the whole set.
 */
export const HELD_TICKS_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/** Held ticks as read: what is still worth sending, and what expired. */
export interface HeldTicks {
  ticks: Map<string, boolean>;
  /** Item id → when its tick was made (ms). */
  times: Map<string, number>;
  /** Item ids whose ticks were dropped for being older than the limit. */
  expired: string[];
  /** Some tick's time was in the future and now reads as `now`. */
  clamped: boolean;
}

/**
 * For the held storage: `serializePending`'s shape — so an older page still
 * reads it — plus `times`, when each tick was made (`at` where unknown).
 */
export function serializeHeld(
  pending: PendingTicks,
  times: ReadonlyMap<string, number>,
  at: number,
): string {
  return JSON.stringify({
    at,
    ticks: [...pending],
    times: Object.fromEntries(
      [...pending.keys()].map((id) => [id, times.get(id) ?? at]),
    ),
  });
}

/**
 * Back from the held storage. A tick with no time of its own (written before
 * 39c) is as old as the set's `at`; a time in the future reads as `now`; a
 * tick older than `maxAgeMs` at `now` is dropped and counted. Anything malformed reads as nothing held.
 */
export function parseHeld(
  raw: string | null,
  now: number,
  maxAgeMs: number = HELD_TICKS_MAX_AGE_MS,
): HeldTicks {
  const empty = (): HeldTicks => ({
    ticks: new Map(),
    times: new Map(),
    expired: [],
    clamped: false,
  });
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw) as {
      at?: unknown;
      ticks?: unknown;
      times?: unknown;
    };
    if (typeof parsed?.at !== "number" || !Array.isArray(parsed.ticks)) {
      return empty();
    }
    const stamps =
      typeof parsed.times === "object" &&
      parsed.times !== null &&
      !Array.isArray(parsed.times)
        ? (parsed.times as Record<string, unknown>)
        : {};
    const out = empty();
    for (const entry of parsed.ticks) {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== "string" ||
        typeof entry[1] !== "boolean"
      ) {
        continue;
      }
      const [id, checked] = entry as [string, boolean];
      const stamp = stamps[id];
      /* A clock that ran ahead when the tick was made cannot extend it. */
      const stamped = typeof stamp === "number" ? stamp : parsed.at;
      const at = Math.min(stamped, now);
      if (stamped > now) out.clamped = true;
      if (now - at > maxAgeMs) {
        out.expired.push(id);
        continue;
      }
      out.ticks.set(id, checked);
      out.times.set(id, at);
    }
    return out;
  } catch {
    return empty();
  }
}
