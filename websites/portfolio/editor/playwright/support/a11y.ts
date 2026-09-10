import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import {
  resolveThemeVarMaps,
  THEME_VARS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  MODE_STORAGE_KEY,
  type Theme,
} from "@discontent/component-library/theming";

/**
 * Accessibility-sweep helpers.
 *
 * These lived inside `accessibility.spec.ts` as file-local functions. They moved
 * here when portfolio needed the same sweep, because the alternative was a third
 * copy of the same subtle localStorage seeding — and the subtlety is the whole
 * reason they exist.
 */

export const WCAG_TAGS = ["wcag2a", "wcag2aa"];

export type Mode = "light" | "dark";

/**
 * Seed a visitor theme override + color mode before first paint, exactly the way
 * the app itself does: the resolved {light,dark} var maps and the Theme knobs in
 * localStorage (read by the pre-paint script and ThemeVarsProvider), the
 * next-themes mode key, and the emulated OS color scheme as a belt-and-suspenders
 * signal. Call before navigating.
 */
export async function seedTheme(
  page: Page,
  theme: Theme,
  mode: Mode,
): Promise<void> {
  await page.addInitScript(
    ([vars, themeStr, varsKey, themeKey, modeKey, modeVal]) => {
      localStorage.setItem(varsKey, vars);
      localStorage.setItem(themeKey, themeStr);
      localStorage.setItem(modeKey, modeVal);
    },
    [
      JSON.stringify(resolveThemeVarMaps(theme)),
      JSON.stringify(theme),
      THEME_VARS_STORAGE_KEY,
      THEME_STORAGE_KEY,
      MODE_STORAGE_KEY,
      mode,
    ] as const,
  );
  await page.emulateMedia({ colorScheme: mode });
}

/**
 * Assert the seeded mode actually took.
 *
 * Without this a mis-seed fails *silently*: the page renders in light mode, axe
 * passes, and the dark-mode sweep reports green while never having run.
 */
export async function expectMode(page: Page, mode: Mode): Promise<void> {
  if (mode === "dark") {
    await expect(page.locator("html")).toHaveClass(/dark/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }
}

export async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
