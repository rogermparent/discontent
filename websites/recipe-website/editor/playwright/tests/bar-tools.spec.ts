import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";

/**
 * Bar tools (27c): the oz · ml · parts toggle, the batching note and the
 * focus view, on the `make-drinks` fixture's Vodka Sour — 2 oz vodka, 3/4 oz
 * lime, 3/4 oz simple syrup, shaken.
 *
 * The arithmetic is `test/barUnits.test.ts`'s; this pins what a reader sees.
 */
const VODKA_SOUR = "/recipe/vodka-sour";

function ingredientList(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Ingredients", exact: true }),
  });
}

async function lines(page: Page): Promise<string[]> {
  return (await ingredientList(page).locator("ul > li").allInnerTexts()).map(
    (text) => text.replace(/\s+/g, " ").trim(),
  );
}

test.describe("Bar tools", () => {
  /*
   * The unit choice lives in localStorage, and every test gets a fresh browser
   * context, so each one starts from oz without clearing anything — clearing
   * in an init script would also wipe it on the reload that checks it is kept.
   */
  test.beforeEach(async ({ resetData }) => {
    await resetData("make-drinks");
  });

  test("reads oz by default, ml at 30 per ounce, and scales ml", async ({
    page,
  }) => {
    await page.goto(VODKA_SOUR);
    const units = page.getByRole("group", { name: "Units" });
    await expect(units.getByRole("button", { name: "Ounces" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect
      .poll(() => lines(page))
      .toEqual(["2 oz vodka", "3/4 oz lime juice", "3/4 oz simple syrup"]);

    await units.getByRole("button", { name: "Millilitres" }).click();
    await expect
      .poll(() => lines(page))
      .toEqual(["60 ml vodka", "25 ml lime juice", "25 ml simple syrup"]);

    await page.getByRole("button", { name: "Double batch" }).click();
    await expect
      .poll(() => lines(page))
      .toEqual(["120 ml vodka", "45 ml lime juice", "45 ml simple syrup"]);

    /* Remembered across a reload. */
    await page.reload();
    await expect(
      page.getByRole("group", { name: "Units" }).getByRole("button", {
        name: "Millilitres",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("reads parts with the smallest line as 1, ignoring the multiplier", async ({
    page,
  }) => {
    await page.goto(VODKA_SOUR);
    await page.getByRole("button", { name: "Double batch" }).click();
    await page
      .getByRole("group", { name: "Units" })
      .getByRole("button", { name: "Parts" })
      .click();
    await expect
      .poll(() => lines(page))
      .toEqual([
        "2 2/3 parts vodka",
        "1 part lime juice",
        "1 part simple syrup",
      ]);
    await expect(page.getByText("parts don't scale")).toBeVisible();
    await expect(page.getByLabel("Multiply")).toBeDisabled();
  });

  test("offers a batching note for a scaled shaken drink", async ({ page }) => {
    await page.goto(VODKA_SOUR);
    await expect(page.getByTestId("batching-note")).toHaveCount(0);
    await page.getByLabel("Multiply").fill("4");
    /* 3 1/2 oz × 4 = 14 oz; shaken, ~25% → 3 1/2 oz water. */
    await expect(page.getByTestId("batching-note")).toContainText(
      "Stir in about 3 1/2 oz water",
    );
  });

  test("the bar view shows the spec in big type and keeps the screen awake", async ({
    page,
  }) => {
    /*
     * A stub wake lock, so the test sees exactly what the view asks for:
     * headless Chromium has none to grant, and the view is meant to work
     * either way.
     */
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as unknown as { __wakeLog: string[] }).__wakeLog = log;
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async (type: string) => {
            log.push(`request:${type}`);
            const listeners: (() => void)[] = [];
            return {
              released: false,
              type,
              addEventListener: (_: string, fn: () => void) =>
                listeners.push(fn),
              release: async () => {
                log.push("release");
                listeners.forEach((fn) => fn());
              },
            };
          },
        },
      });
    });

    /*
     * Locks held = requests − releases. Counted rather than matched against an
     * exact log because `next dev` runs effects twice under StrictMode
     * (request, release, request) and a production build once.
     */
    const held = () =>
      page.evaluate(() => {
        const log = (window as unknown as { __wakeLog: string[] }).__wakeLog;
        return (
          log.filter((entry) => entry === "request:screen").length -
          log.filter((entry) => entry === "release").length
        );
      });

    await page.goto(VODKA_SOUR);
    await page.getByRole("button", { name: "Bar view" }).click();
    const view = page.getByRole("dialog", { name: "Bar view: Vodka Sour" });
    await expect(view).toBeVisible();
    await expect(view.getByTestId("drink-spec")).toContainText("Shake");
    await expect(view.getByText("2 oz vodka")).toBeVisible();
    await expect(view.getByTestId("wake-lock-status")).toBeVisible();
    await expect.poll(held).toBe(1);

    /* Steps and ingredients are checklists, as on the page. */
    const step = view.getByRole("checkbox", { name: /Make it\./ });
    await view.getByText(/Make it\./).click();
    await expect(step).toBeChecked();
    const ingredient = view.getByRole("checkbox", { name: /2 oz vodka/ });
    await ingredient.click();
    await expect(ingredient).toBeChecked();

    await page.keyboard.press("Escape");
    await expect(view).toHaveCount(0);
    await expect.poll(held).toBe(0);
  });

  test("a food recipe gets a Cook view, and no unit toggle", async ({
    page,
  }) => {
    await page.goto("/recipe/hand-pies");
    await expect(page.getByRole("button", { name: "Cook view" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Units" })).toHaveCount(0);
  });
});
