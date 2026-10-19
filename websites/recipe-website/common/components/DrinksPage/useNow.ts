"use client";

import { useSyncExternalStore } from "react";

/**
 * The browser's clock, read once per page load (42d: the NEW mark), and `0`
 * on the server — so the export's static HTML never marks anything NEW, and
 * a drink added earlier today is new in every time zone (a day key parsed
 * as UTC midnight would put it in the future west of UTC). One value per
 * load keeps `useSyncExternalStore`'s snapshot stable.
 */
let loadedAt: number | undefined;

const subscribe = () => () => {};
const getSnapshot = () => (loadedAt ??= Date.now());
const getServerSnapshot = () => 0;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
