"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dedupeItems } from "../../util/inventoryText";
import { capStaples } from "./stapleLimits";
import type { MakeSettings } from "./useInventory";

/**
 * The signed-in editor's saved "Assume I always have" list (38a): the
 * `make-settings-v1.staples` value kept in the editor's settings, so a new
 * browser starts from the list the owner already made. The editor's `/make`
 * passes it only to a signed-in session; the export never has one, so its
 * staples stay this browser's alone (U6).
 */
export interface SavedStaples {
  /** The saved list, or `undefined` when nothing is saved yet. */
  items?: string[];
  /** Save a list, or clear it with `null` (the browser went back to the default). */
  save: (items: string[] | null) => Promise<{ ok: true } | { error: string }>;
}

/** The pure half: what a first signed-in load does with the two lists. */
export type StaplesSync =
  | { kind: "seed"; items: string[] }
  | { kind: "upload"; items: string[] }
  | { kind: "none" };

/**
 * The merge rule (38a, Da2): **this browser first** (U6). A browser still on
 * the default list takes the saved one; a browser with its own list keeps
 * it, and saves it when nothing is saved yet. Two different lists are never
 * merged on load — a union would bring back an item another browser
 * removed — and the next edit on this browser saves over the saved one.
 */
export function staplesSync(
  browser: { defaultStaples: boolean; alwaysHave: string[] },
  saved: string[] | undefined,
): StaplesSync {
  if (browser.defaultStaples) {
    return saved ? { kind: "seed", items: saved } : { kind: "none" };
  }
  return saved
    ? { kind: "none" }
    : { kind: "upload", items: capStaples(browser.alwaysHave) };
}

/** The one quiet line a failed save shows under the staples. */
export const STAPLES_NOT_SAVED =
  "Not saved to the editor — this browser keeps the list.";

/**
 * `settings` with the saved list wired in: once storage is read, the first
 * load applies `staplesSync`, and every change to the list (an add, a
 * remove, "Reset") saves it too, capped at the server's limits
 * (`capStaples`). A save that answers `{error}` (or throws) sets
 * `staplesNotice` until the next one succeeds. Without `saved` it is
 * `settings` itself.
 */
export function useSavedStaples(
  settings: MakeSettings,
  saved?: SavedStaples,
): MakeSettings {
  const { ready, defaultStaples, alwaysHave, setStaples, resetStaples } =
    settings;
  const settled = useRef(false);
  const [failed, setFailed] = useState(false);
  /* A failed save leaves this browser's list as it is — it is the primary
   * one — and says so once, quietly. */
  const send = useCallback(
    (items: string[] | null) => {
      if (!saved) return;
      void saved.save(items).then(
        (result) => setFailed("error" in result),
        () => setFailed(true),
      );
    },
    [saved],
  );
  useEffect(() => {
    if (!saved || !ready || settled.current) return;
    settled.current = true;
    const sync = staplesSync({ defaultStaples, alwaysHave }, saved.items);
    if (sync.kind === "seed") setStaples(sync.items);
    else if (sync.kind === "upload") send(sync.items);
  }, [saved, ready, defaultStaples, alwaysHave, setStaples, send]);

  return useMemo(() => {
    if (!saved) return settings;
    return {
      ...settings,
      staplesNotice: failed ? STAPLES_NOT_SAVED : undefined,
      setStaples: (items: string[]) => {
        setStaples(items);
        send(capStaples(dedupeItems(items)));
      },
      resetStaples: () => {
        resetStaples();
        send(null);
      },
    };
  }, [settings, saved, setStaples, resetStaples, send, failed]);
}
