"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { MonitorSmartphoneIcon, PinIcon, PinOffIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@discontent/component-library/components/ui/toggle-group";
import {
  DEFAULT_STICKY_CHROME,
  STICKY_CHROME_ATTRIBUTE,
  STICKY_CHROME_EVENT,
  STICKY_CHROME_STORAGE_KEY,
  type StickyChrome,
} from "./stickyChrome";

/*
 * The same `localStorage` + `useSyncExternalStore` shape as
 * `RecipeIndexPage/useListMode.ts`, down to the `storage` listener that carries
 * a change between tabs. A second mechanism for the same job would be one more
 * thing to keep in step.
 *
 * The file is named `useStickyChrome.tsx` rather than `stickyChrome.tsx` so it
 * cannot case-collide with `stickyChrome.ts` on a case-insensitive filesystem.
 */

function subscribe(callback: () => void) {
  window.addEventListener(STICKY_CHROME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(STICKY_CHROME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(STICKY_CHROME_STORAGE_KEY);
}

/* `null` on the server: there is no preference to read, so the first render is
 * the default — the same markup a reader with JS off keeps. The pre-paint
 * script, not this hook, is what gets an override onto <html> in time. */
const getServerSnapshot = (): string | null => null;

/** The reader's remembered sticky-chrome preference, and a setter that persists it. */
export function useStickyChrome(): [
  StickyChrome,
  (next: StickyChrome) => void,
] {
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const chrome: StickyChrome =
    stored === "always" || stored === "off" ? stored : DEFAULT_STICKY_CHROME;

  const setChrome = useCallback((next: StickyChrome) => {
    if (next === DEFAULT_STICKY_CHROME) {
      /* Don't persist the default — an absent key and "auto" mean the same
       * thing, and clearing it lets a future change to the 600px threshold
       * reach readers who never expressed a preference. */
      localStorage.removeItem(STICKY_CHROME_STORAGE_KEY);
    } else {
      localStorage.setItem(STICKY_CHROME_STORAGE_KEY, next);
    }
    window.dispatchEvent(new Event(STICKY_CHROME_EVENT));
  }, []);

  return [chrome, setChrome];
}

/**
 * Renders nothing; mirrors the stored preference onto `<html>` as
 * `data-sticky-chrome`, which is what theme.css's policy reads.
 *
 * It **cannot** live beside the toggle. Radix unmounts both `PopoverContent`
 * and `SheetContent` when closed, so an effect mounted with the control would
 * hold the preference only while the menu was open — the moment the reader
 * dismissed the panel their choice would revert. Mounted in `AppProviders`
 * instead, which is alive for the life of the page.
 */
export function StickyChromeSync() {
  const [chrome] = useStickyChrome();

  useEffect(() => {
    const el = document.documentElement;
    if (chrome === DEFAULT_STICKY_CHROME) {
      el.removeAttribute(STICKY_CHROME_ATTRIBUTE);
    } else {
      el.setAttribute(STICKY_CHROME_ATTRIBUTE, chrome);
    }
  }, [chrome]);

  return null;
}

/*
 * Deliberate vocabulary mismatch, so nobody "fixes" one half of it: the
 * internal name is `stickyChrome` ("chrome" is house usage — see globals.css
 * and the "Owner-chrome pass" heading in docs/ui-overhaul.md), while the
 * visible label is "Sticky headers", because "chrome" is jargon to a reader.
 */
const OPTIONS = [
  { value: "auto", label: "Auto", Icon: MonitorSmartphoneIcon },
  { value: "always", label: "On", Icon: PinIcon },
  { value: "off", label: "Off", Icon: PinOffIcon },
] as const;

/**
 * Three-way sticky-header control (Auto / On / Off), styled as the same
 * segmented control as `ThemeToggle` so the Appearance panel reads as one
 * instrument.
 *
 * Two deliberate divergences from `ThemeToggle`:
 *
 * - **No per-item `aria-label`, and `aria-hidden` icons.** The visible word is
 *   the accessible name; an `aria-label` would replace it, leaving a control
 *   whose spoken name is nothing a reader can see or say. `RecipeIndexList`
 *   argues the same at its own `ToggleGroup`. `ThemeToggle` labels redundantly —
 *   don't propagate that.
 * - **No mounted-gate placeholder.** `ThemeToggle` needs one only because
 *   next-themes resolves `system` in an effect. `useSyncExternalStore` hydrates
 *   against the server snapshot and re-renders with the client one in the same
 *   commit, and this only ever renders inside an already-open popover or sheet.
 */
export function StickyChromeToggle({ className }: { className?: string }) {
  const [chrome, setChrome] = useStickyChrome();

  return (
    <ToggleGroup
      type="single"
      variant="default"
      size="sm"
      value={chrome}
      /* Radix clears the value when the active item is pressed again; keep the
         current choice rather than falling into an empty group. */
      onValueChange={(value) => value && setChrome(value as StickyChrome)}
      aria-label="Sticky headers"
      className={cn("w-full gap-0.5 rounded-md bg-muted p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="flex-1 gap-1.5 rounded-sm text-xs data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs"
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
