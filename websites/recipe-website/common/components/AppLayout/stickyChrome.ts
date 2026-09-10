/**
 * The reader's sticky-header preference — the constants and the pre-paint
 * script, with no `"use client"` and no React.
 *
 * The split from `useStickyChrome.tsx` is forced, not stylistic:
 * `AppLayout/index.tsx` is an async *server* component, and a module carrying
 * `"use client"` imported across that boundary yields a client *reference*, not
 * a callable function — so `stickyChromePrePaintScript()` would throw at render.
 * `prePaint.ts` carries no directive for exactly the same reason.
 *
 * Lives beside its consumer rather than in the component library on purpose: a
 * sticky-header preference is a recipe product decision. Portfolio has its own
 * `AppLayout` with an identical sticky masthead and can adopt the `.sticky-chrome`
 * class (which *is* shared, in styles/theme.css) without inheriting the toggle.
 * If it ever wants the toggle too, promote this the way `prePaint.ts` was
 * promoted in portfolio-rebuild PR 01b.
 */

/**
 * Whether the masthead and the Ingredients header pin to the top while
 * scrolling. `auto` releases them below 600px of viewport height — see the
 * sticky-chrome policy in packages/component-library/styles/theme.css.
 */
export type StickyChrome = "auto" | "always" | "off";

/**
 * `auto` is the default, and it is the point of the feature rather than a
 * fallback: the reader on a phone held sideways loses 36% of the viewport to
 * chrome and will never open a menu to fix it. The two overrides exist for the
 * reader whose judgement differs from the threshold.
 */
export const DEFAULT_STICKY_CHROME: StickyChrome = "auto";

export const STICKY_CHROME_STORAGE_KEY = "recipe-sticky-chrome";

/** Same-tab change signal; `storage` covers the cross-tab case. */
export const STICKY_CHROME_EVENT = "recipe-sticky-chrome-storage";

/** Set on `<html>`; absent means `auto`. Read by theme.css, never by JS layout. */
export const STICKY_CHROME_ATTRIBUTE = "data-sticky-chrome";

/**
 * Blocking pre-paint script: stamp a stored override onto `<html>` before first
 * paint.
 *
 * The justification is **not** flash avoidance. A sticky box is already in
 * normal flow, so releasing one shifts nothing at scroll-top — the swap is
 * invisible there. It is **scroll restoration**: a reload restores the scroll
 * offset around first paint, and a masthead that was pinned for the
 * pre-hydration frames and then released by the sync effect visibly pops away
 * from the top of a mid-page view.
 *
 * Like `themePrePaintScript`, this is inlined into a `<script>`, so it must stay
 * dependency-free and swallow every error: it runs before hydration and a throw
 * would block paint on a page that renders fine with the default policy. Only
 * the two overrides are written through — anything else in storage (or nothing)
 * leaves the attribute absent, which reads as `auto`.
 */
export function stickyChromePrePaintScript(): string {
  return `(function(){try{var v=localStorage.getItem(${JSON.stringify(
    STICKY_CHROME_STORAGE_KEY,
  )});if(v==="always"||v==="off"){document.documentElement.setAttribute(${JSON.stringify(
    STICKY_CHROME_ATTRIBUTE,
  )},v);}}catch(e){}})();`;
}
