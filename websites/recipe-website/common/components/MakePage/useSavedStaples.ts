"use client";

import { useEffect, useMemo, useRef } from "react";
import { dedupeItems } from "../../util/inventoryText";
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
    : { kind: "upload", items: browser.alwaysHave };
}

/**
 * `settings` with the saved list wired in: once storage is read, the first
 * load applies `staplesSync`, and every change to the list (an add, a
 * remove, "Reset") saves it too. Without `saved` it is `settings` itself.
 */
export function useSavedStaples(
  settings: MakeSettings,
  saved?: SavedStaples,
): MakeSettings {
  const { ready, defaultStaples, alwaysHave, setStaples, resetStaples } =
    settings;
  const settled = useRef(false);
  useEffect(() => {
    if (!saved || !ready || settled.current) return;
    settled.current = true;
    const sync = staplesSync({ defaultStaples, alwaysHave }, saved.items);
    if (sync.kind === "seed") setStaples(sync.items);
    else if (sync.kind === "upload") void saved.save(sync.items).catch(noop);
  }, [saved, ready, defaultStaples, alwaysHave, setStaples]);

  return useMemo(() => {
    if (!saved) return settings;
    return {
      ...settings,
      setStaples: (items: string[]) => {
        setStaples(items);
        void saved.save(dedupeItems(items)).catch(noop);
      },
      resetStaples: () => {
        resetStaples();
        void saved.save(null).catch(noop);
      },
    };
  }, [settings, saved, setStaples, resetStaples]);
}

/* A failed save leaves this browser's list as it is: it is the primary one. */
function noop() {}
