"use client";

import { useSyncExternalStore } from "react";
import { dayKey, localDay } from "../../util/holidays";

/**
 * Today on the reader's calendar, as `YYYY-MM-DD`.
 *
 * The homepage's date line and countdowns are computed in the browser because
 * the export is static: a date baked in at build time is wrong by the next
 * morning. The server snapshot is whatever the caller passes (`fallback`), so
 * hydration matches the server's HTML and the browser's own day takes over
 * right after. A string snapshot is stable between calls, which is all
 * `useSyncExternalStore` asks; nothing subscribes, so a tab left open past
 * midnight keeps its day until the next render.
 */
export function useToday(fallback: string | null): string | null {
  return useSyncExternalStore(subscribe, todayKey, () => fallback);
}

const subscribe = () => () => {};

function todayKey(): string {
  return dayKey(localDay(new Date()));
}
