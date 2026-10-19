/**
 * The reader's "three columns on wide screens" preference for the recipe page
 * (epic 42c1) — the constants and the pre-paint script, with no `"use client"`
 * and no React, for the same reason as `stickyChrome.ts`: `AppLayout/index.tsx`
 * is an async server component and must be able to call the script builder.
 *
 * At 1600px and wider the recipe page lays out as ingredients | steps | notes,
 * schedule and "Appears in". On by default; a reader who prefers two columns
 * turns it off in the Appearance panel. Below the breakpoint nothing changes
 * either way. The layout itself is CSS (`View/recipe.css`), keyed on the
 * attribute below and a min-width media query, so it never depends on
 * hydration.
 */

export type WideRecipe = "on" | "off";

/** On: the point of the layout is the wide screen nobody configures. */
export const DEFAULT_WIDE_RECIPE: WideRecipe = "on";

export const WIDE_RECIPE_STORAGE_KEY = "recipe-wide-columns";

/** Same-tab change signal; `storage` covers the cross-tab case. */
export const WIDE_RECIPE_EVENT = "recipe-wide-columns-storage";

/** Set on `<html>` only when off; absent means on. Read by CSS, never by JS layout. */
export const WIDE_RECIPE_ATTRIBUTE = "data-recipe-columns";

/** The attribute's value when the reader turned three columns off. */
export const WIDE_RECIPE_OFF_VALUE = "two";

/** Read a stored value; anything but "off" (or nothing) is the default. */
export function parseWideRecipe(stored: string | null | undefined): WideRecipe {
  return stored === "off" ? "off" : DEFAULT_WIDE_RECIPE;
}

/**
 * Blocking pre-paint script: stamp the stored "off" onto `<html>` before first
 * paint. Here the reason *is* flash avoidance — unlike a sticky box, the
 * column count changes the layout, and a three-column page that reflows to
 * two after hydration would jump. Dependency-free and swallowing every error,
 * like `stickyChromePrePaintScript`.
 */
export function wideRecipePrePaintScript(): string {
  return `(function(){try{if(localStorage.getItem(${JSON.stringify(
    WIDE_RECIPE_STORAGE_KEY,
  )})==="off"){document.documentElement.setAttribute(${JSON.stringify(
    WIDE_RECIPE_ATTRIBUTE,
  )},${JSON.stringify(WIDE_RECIPE_OFF_VALUE)});}}catch(e){}})();`;
}
