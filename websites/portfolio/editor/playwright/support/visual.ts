import { expect, type Locator, type Page } from "@playwright/test";

export interface SnapshotOptions {
  fullPage?: boolean;
  mask?: Locator[];
  clip?: { x: number; y: number; width: number; height: number };
  maxDiffPixelRatio?: number;
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

function defaultMasks(page: Page): Locator[] {
  return [
    page.locator("time"),
    page.locator("[data-testid='commit-hash']"),
    // The year rail and any rendered dates are the two things that move on
    // their own; masking them keeps a baseline from expiring with the calendar.
    page.locator("[data-testid='project-date']"),
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
  if (opts.maxDiffPixelRatio !== undefined)
    options.maxDiffPixelRatio = opts.maxDiffPixelRatio;
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
  if (opts.maxDiffPixelRatio !== undefined)
    options.maxDiffPixelRatio = opts.maxDiffPixelRatio;
  await expect(locator).toHaveScreenshot(name, options);
}
