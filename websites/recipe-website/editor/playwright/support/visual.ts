import { expect, type Locator, type Page } from "@playwright/test";

export interface SnapshotOptions {
  fullPage?: boolean;
  mask?: Locator[];
  clip?: { x: number; y: number; width: number; height: number };
  /** A page-specific allowance over the config's `maxDiffPixels`; say why. */
  maxDiffPixels?: number;
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );
  });
}

/**
 * The day the homepage baselines were drawn: Wednesday 18 November 2026,
 * noon. Since 48e the homepage reads the browser's day (Tonight says "the
 * weekend" on Friday and Saturday, and the date line's width follows the
 * day's name), so a homepage snapshot pins the browser's clock to it with
 * `page.clock.setFixedTime(BASELINE_DAY)` before the first `goto`, or CI
 * fails every Friday and Saturday (found 2026-11-20).
 */
export const BASELINE_DAY = new Date(2026, 10, 18, 12);

function defaultMasks(page: Page): Locator[] {
  return [
    page.locator("time"),
    page.locator("[data-testid='commit-hash']"),
    page.locator("[data-testid='recipe-date']"),
    /* Sync & upkeep's "Today · Wed 18 Nov": the server's day (48d). */
    page.locator("[data-testid='commit-day']"),
  ];
}

export async function snapshotPage(
  page: Page,
  name: string,
  opts: SnapshotOptions = {},
): Promise<void> {
  await waitForReady(page);
  const options: Record<string, unknown> = {
    fullPage: opts.fullPage ?? true,
    mask: [...defaultMasks(page), ...(opts.mask ?? [])],
  };
  if (opts.clip) options.clip = opts.clip;
  if (opts.maxDiffPixels !== undefined)
    options.maxDiffPixels = opts.maxDiffPixels;
  await expect(page).toHaveScreenshot(name, options);
}

export async function snapshotLocator(
  locator: Locator,
  name: string,
  opts: Omit<SnapshotOptions, "fullPage" | "clip"> = {},
): Promise<void> {
  await waitForReady(locator.page());
  const options: Record<string, unknown> = {
    mask: [...defaultMasks(locator.page()), ...(opts.mask ?? [])],
  };
  if (opts.maxDiffPixels !== undefined)
    options.maxDiffPixels = opts.maxDiffPixels;
  await expect(locator).toHaveScreenshot(name, options);
}
