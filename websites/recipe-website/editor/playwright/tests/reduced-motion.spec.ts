import { test, expect, type Page } from "../support/test";

/**
 * The reduced-motion deliverable is a single global CSS guard in app globals.css
 * (`@media (prefers-reduced-motion: reduce)` collapsing every animation/transition
 * duration to 0.01ms). Rather than pixel-diff "no motion" (flaky), assert the
 * computed-style contract on a real always-present animated element: the Sign In
 * button carries `transition-all`, so its transition-duration is the observable.
 */

/** Computed transition-duration (seconds) of the homepage Sign In button. */
function signInTransitionSeconds(page: Page): Promise<number> {
  return page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Sign In",
    );
    if (!btn) throw new Error("Sign In button not found");
    // getComputedStyle returns e.g. "0.15s" normally, "1e-05s" when neutralized.
    return parseFloat(getComputedStyle(btn).transitionDuration);
  });
}

test.describe("Reduced motion", () => {
  test("neutralizes transition durations when the OS asks for no motion", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");

    // Baseline: with motion allowed the button keeps its real transition.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();
    const normal = await signInTransitionSeconds(page);
    expect(normal).toBeGreaterThan(0.01);

    // Under prefers-reduced-motion the global guard collapses it to ~0.01ms.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => signInTransitionSeconds(page)).toBeLessThan(0.001);
  });
});
