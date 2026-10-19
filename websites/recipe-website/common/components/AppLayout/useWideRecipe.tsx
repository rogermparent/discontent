"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Columns2Icon, Columns3Icon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@discontent/component-library/components/ui/toggle-group";
import {
  DEFAULT_WIDE_RECIPE,
  parseWideRecipe,
  WIDE_RECIPE_ATTRIBUTE,
  WIDE_RECIPE_EVENT,
  WIDE_RECIPE_OFF_VALUE,
  WIDE_RECIPE_STORAGE_KEY,
  type WideRecipe,
} from "./wideRecipe";

/*
 * Modelled exactly on `useStickyChrome.tsx` (42c1): `localStorage` +
 * `useSyncExternalStore`, a sync component mounted in `AppProviders` (Radix
 * unmounts the Appearance panel when it closes), and a segmented control
 * with the visible words as the accessible names.
 */

function subscribe(callback: () => void) {
  window.addEventListener(WIDE_RECIPE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(WIDE_RECIPE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): string | null {
  try {
    return localStorage.getItem(WIDE_RECIPE_STORAGE_KEY);
  } catch {
    return null;
  }
}

const getServerSnapshot = (): string | null => null;

/** The reader's remembered wide-layout preference, and a setter that persists it. */
export function useWideRecipe(): [WideRecipe, (next: WideRecipe) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const wide = parseWideRecipe(stored);

  const setWide = useCallback((next: WideRecipe) => {
    try {
      /* The default is never persisted — the `useListMode` convention. */
      if (next === DEFAULT_WIDE_RECIPE) {
        localStorage.removeItem(WIDE_RECIPE_STORAGE_KEY);
      } else {
        localStorage.setItem(WIDE_RECIPE_STORAGE_KEY, next);
      }
    } catch {
      /* Storage blocked: nothing is saved and the snapshot still reads the
         default, so the switch stays on — the page keeps working, the
         choice just cannot be made in this browser. */
    }
    window.dispatchEvent(new Event(WIDE_RECIPE_EVENT));
  }, []);

  return [wide, setWide];
}

/**
 * Renders nothing; mirrors the stored preference onto `<html>` as
 * `data-recipe-columns`. Mounted in `AppProviders`, never beside the toggle
 * (see `StickyChromeSync`).
 */
export function WideRecipeSync() {
  const [wide] = useWideRecipe();

  useEffect(() => {
    const el = document.documentElement;
    if (wide === DEFAULT_WIDE_RECIPE) {
      el.removeAttribute(WIDE_RECIPE_ATTRIBUTE);
    } else {
      el.setAttribute(WIDE_RECIPE_ATTRIBUTE, WIDE_RECIPE_OFF_VALUE);
    }
  }, [wide]);

  return null;
}

const OPTIONS = [
  { value: "on", label: "On", Icon: Columns3Icon },
  { value: "off", label: "Off", Icon: Columns2Icon },
] as const;

/**
 * On / Off for the recipe page's three columns on wide screens, the same
 * segmented control as `StickyChromeToggle`.
 */
export function WideRecipeToggle({ className }: { className?: string }) {
  const [wide, setWide] = useWideRecipe();

  return (
    <ToggleGroup
      type="single"
      variant="default"
      size="sm"
      value={wide}
      onValueChange={(value) => value && setWide(value as WideRecipe)}
      /* The field's visible label, as `StickyChromeToggle` does. */
      aria-label="Wide recipe columns"
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
