import { expect, type Locator } from "@playwright/test";

/**
 * Resolves once React has hydrated the element behind `locator` (40f).
 *
 * A server-rendered control is visible, enabled and clickable before its page
 * hydrates, and an interaction in that window is lost or worse: a click on a
 * client-only button does nothing (menus' Append), a `selectOption` on a
 * controlled `<select>` is reset when React adopts it (`/jobs`' filters), and
 * a submit on a server-action form posts natively and reloads the page with
 * every `<details>` closed again (the git page). Playwright's actionability
 * checks cannot see any of that.
 *
 * React marks each DOM node it adopts with a `__reactProps$<random>` key —
 * the props its root listener dispatches events from — in the same hydration
 * pass that makes the node's handlers live. That key is the signal: a
 * render-time fact about this element, not a timer or a page-wide guess (a
 * marker in the root layout says nothing about a Suspense boundary that
 * hydrates later). An internal of React's, but one every React DOM since 17
 * has kept, and test-only here.
 *
 * Waits for attachment, not visibility, so it works on a control inside a
 * closed `<details>` too.
 */
export async function expectHydrated(
  locator: Locator,
  { timeout = 15_000 }: { timeout?: number } = {},
): Promise<void> {
  await locator.waitFor({ state: "attached", timeout });
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      { timeout, message: "the element was never hydrated by React" },
    )
    .toBe(true);
}
