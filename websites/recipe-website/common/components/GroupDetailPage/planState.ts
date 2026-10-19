"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { madeStorageKey, parseTicks } from "../../util/planPage";

/*
 * The plan page's per-browser state (43p1, D5), each a per-viewer
 * convenience kept in localStorage (and in memory where storage throws):
 * which mode the page is in — Plan at home, Cook through it — and which of a
 * plan's rows this browser has marked made. Read through
 * `useSyncExternalStore`, so the server and the first client render agree
 * (no ticks, Plan) and a change in another tab shows here.
 */

const listeners = new Set<() => void>();

const MODE_KEY = "plan-mode";
/** Wide enough for the list beside its rail: `lg`, as /shopping's. */
const WIDE = "(min-width: 1024px)";

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === MODE_KEY ||
      event.key.startsWith("plan-made:")
    ) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("popstate", listener);
  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia(WIDE);
    media.addEventListener("change", listener);
  } catch {
    media = undefined;
  }
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("popstate", listener);
    media?.removeEventListener("change", listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

const memory = new Map<string, string | null>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null): void {
  memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* In memory only. */
  }
  notify();
}

// --- the mode ---------------------------------------------------------------

export type PlanMode = "plan" | "cook";

function isMode(value: unknown): value is PlanMode {
  return value === "plan" || value === "cook";
}

/** `?mode=` in the address: the /groups list's Plan and Cook buttons. */
function urlMode(): PlanMode | undefined {
  try {
    const value = new URLSearchParams(window.location.search).get("mode");
    return isMode(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The address's `?mode=` first (a link chose it), then what this browser
 * chose last, then the viewport's job — planning on a wide screen, cooking
 * on a phone.
 */
function readMode(): PlanMode {
  const fromUrl = urlMode();
  if (fromUrl) return fromUrl;
  const stored = read(MODE_KEY);
  if (isMode(stored)) return stored;
  try {
    return window.matchMedia(WIDE).matches ? "plan" : "cook";
  } catch {
    return "plan";
  }
}

/**
 * The page's mode. The server renders Plan (Dp1-2): the list in order is the
 * document — the export's static HTML and a reader without scripts get the
 * whole plan — and a phone switches to Cook as it hydrates.
 */
export function usePlanMode(): [PlanMode, (mode: PlanMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "plan" as const);
  const setMode = useCallback((next: PlanMode) => {
    /* A link's `?mode=` would outrank the choice: say the new one there. */
    if (urlMode()) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("mode", next);
        window.history.replaceState(window.history.state, "", url);
      } catch {
        /* The stored choice still lands below. */
      }
    }
    write(MODE_KEY, next);
  }, []);
  return [mode, setMode];
}

// --- the made ticks ------------------------------------------------------------

const NO_TICKS: string[] = [];

/**
 * The rows this browser has marked made on plan `slug`, and the setters.
 * Empty on the server and in the first client render; the stored ticks
 * arrive right after hydration, so the HTML never disagrees with React.
 */
export function useMadeTicks(slug: string): {
  made: ReadonlySet<string>;
  toggle: (key: string) => void;
  clear: () => void;
} {
  const key = madeStorageKey(slug);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const made = useMemo(
    () => new Set(raw === null ? NO_TICKS : parseTicks(raw)),
    [raw],
  );
  const toggle = useCallback(
    (tick: string) => {
      const current = new Set(parseTicks(read(key)));
      if (current.has(tick)) current.delete(tick);
      else current.add(tick);
      write(key, current.size > 0 ? JSON.stringify([...current]) : null);
    },
    [key],
  );
  const clear = useCallback(() => write(key, null), [key]);
  return { made, toggle, clear };
}

/** Another plan's made count, read-only (a sub-plan row's "2 of 6 made"). */
export function useMadeCount(slug: string): number {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(madeStorageKey(slug)),
    () => null,
  );
  return raw === null ? 0 : parseTicks(raw).length;
}
