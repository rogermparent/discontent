import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import { expectNoViolations } from "../support/a11y";
import { snapshotPage } from "../support/visual";

/*
 * `/drinks` (usability pass, U3 — the design's Bar home), against
 * `drinks-bar`: `make-drinks`' five drinks (Vodka Sour, Gin and Tonic,
 * Zero-Proof G&T, Lavender Gnista Tonic, Chamomile Collins), its Lavender
 * Syrup and Hand Pies, plus term records for a `spirit` root (Vodka, Gin),
 * `shaken`, a `gin-and-tonic` family and a `holidays` root — Halloween on
 * the Vodka Sour (and on Hand Pies, which is no drink), Christmas on the
 * Chamomile Collins. The saved inventory is gin and tonic water.
 *
 * The make panel judges this browser's list (U6); each test starts from a
 * fresh context with none, and `withBrowserList` seeds one.
 */

const panel = (page: Page) => page.getByTestId("drinks-make");

async function withBrowserList(page: Page, items: string[]) {
  await page.addInitScript((added) => {
    localStorage.setItem(
      "make-inventory-v1",
      JSON.stringify({ added, removed: [] }),
    );
  }, items);
}

/** The panel has its corpus, its ingredient lines and its storage. */
async function panelReady(page: Page) {
  await expect(panel(page).getByRole("heading", { level: 2 })).not.toHaveText(
    "What you can mix",
    { timeout: 20_000 },
  );
}

test.describe("Drinks", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("drinks-bar");
  });

  test("ways in: spirits, styles, classics and the newest", async ({
    page,
  }) => {
    await page.goto("/drinks");
    await expect(
      page.getByRole("heading", { name: "Drinks", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("drinks-count")).toHaveText("5 drinks");

    const spirits = page.getByRole("region", { name: "By spirit" });
    await expect(spirits.getByRole("link")).toHaveText([
      "Vodka2 drinks",
      "Gin1 drink",
    ]);
    await spirits.getByRole("link", { name: /Vodka/ }).click();
    await expect(page).toHaveURL(/\/tags\/vodka$/);
    await page.goBack();

    /* Most drinks first; a tie keeps the documented style order. */
    await expect(
      page.getByRole("region", { name: "By style" }).getByRole("link"),
    ).toHaveText(["Highball3", "Zero-proof2", "Sour1", "Collins1", "Shaken1"]);
    /* A child of `drink` that is no style is a classic. */
    await expect(
      page.getByRole("region", { name: "Classics" }).getByRole("link"),
    ).toHaveText(["Gin and Tonic2"]);

    const latest = page.getByRole("region", { name: "New drinks" });
    await expect(latest.getByRole("listitem")).toHaveCount(5);
    await expect(latest.getByRole("listitem").first()).toContainText(
      "Chamomile Collins",
    );
    await expect(latest.getByRole("listitem").first()).toContainText(
      "Vodka · Collins",
    );
    await expect(
      latest.getByRole("link", { name: "All 5 drinks" }),
    ).toHaveAttribute("href", "/tags/drink");
  });

  test("an empty list is an invitation, never the saved inventory", async ({
    page,
  }) => {
    await page.goto("/drinks");
    await panelReady(page);
    await expect(
      panel(page).getByRole("heading", { name: "What's on your shelf?" }),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("link", { name: "Add what you have" }),
    ).toHaveAttribute("href", "/make?q=tag%3Adrink");
    /* A guest never gets the saved inventory's group. */
    await expect(page.getByTestId("drinks-secondary")).toHaveCount(0);
  });

  test("the browser's list says what you can mix, and what to buy", async ({
    page,
  }) => {
    await withBrowserList(page, ["gin", "tonic water"]);
    await page.goto("/drinks");
    await panelReady(page);

    await expect(page.getByTestId("drinks-can-mix")).toHaveText(
      "You can mix 1 drink right now",
    );
    const ready = page.getByTestId("drinks-ready");
    await expect(ready.getByRole("link")).toHaveText(["Gin and Tonic"]);
    await expect(ready.getByRole("link")).toHaveAttribute(
      "href",
      "/recipe/gin-and-tonic",
    );
    await expect(panel(page).getByText("2 on hand")).toBeVisible();

    /* Gin never stands in for non-alcoholic gin (make.spec), so the
     * Zero-Proof G&T is one away and that is the first thing to buy. */
    const buyNext = page.getByTestId("drinks-buy-next");
    await expect(buyNext.getByRole("listitem").first()).toHaveText(
      /non-alcoholic gin\s*\+1 drink/,
    );
    await expect(
      panel(page).getByRole("link", { name: "See the 1 drink one item away" }),
    ).toHaveAttribute("href", "/make?q=tag%3Adrink");
  });

  test("signed in, the saved inventory is its own group, never the count", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/drinks");
    await panelReady(page);

    /* The browser's list is empty: the panel still invites, and counts
     * nothing from the saved list (gin, tonic water). */
    await expect(
      panel(page).getByRole("heading", { name: "What's on your shelf?" }),
    ).toBeVisible();
    const secondary = page.getByTestId("drinks-secondary");
    await expect(secondary.locator("summary")).toHaveText(
      "Also makeable with your saved inventory 1",
    );
    await secondary.locator("summary").click();
    await expect(secondary.getByRole("link")).toHaveText(["Gin and Tonic"]);
  });

  test("the saved group lists only what it adds", async ({ page }) => {
    await withBrowserList(page, ["gin", "tonic water"]);
    await page.goto("/");
    await signIn(page);
    await page.goto("/drinks");
    await panelReady(page);
    await expect(page.getByTestId("drinks-can-mix")).toHaveText(
      "You can mix 1 drink right now",
    );
    const secondary = page.getByTestId("drinks-secondary");
    await expect(secondary.locator("summary")).toHaveText(
      "Also makeable with your saved inventory 0",
    );
  });

  test("the seasonal row follows the browser's date", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
    await page.goto("/drinks");
    const seasonal = page.getByTestId("drinks-seasonal");
    await expect(
      seasonal.getByRole("heading", { name: "For Halloween" }),
    ).toBeVisible();
    /* Drinks only: the Halloween hand pies are not one. */
    await expect(seasonal.getByRole("listitem")).toHaveCount(1);
    await expect(seasonal.getByRole("listitem")).toContainText("Vodka Sour");
    await expect(
      seasonal.getByRole("link", { name: "All 1 Halloween drink" }),
    ).toHaveAttribute("href", "/search?q=tag%3Adrink%20tag%3Ahalloween");

    /* After Halloween, Christmas is next — there is no Thanksgiving term. */
    await page.clock.setFixedTime(new Date(2026, 10, 1, 12));
    await page.reload();
    await expect(
      seasonal.getByRole("heading", { name: "For Christmas" }),
    ).toBeVisible();
    await expect(seasonal.getByRole("listitem")).toContainText(
      "Chamomile Collins",
    );
  });

  test("the masthead marks Drinks as the current page", async ({ page }) => {
    await page.goto("/drinks");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Drinks" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle("Drinks");
  });

  test("has no WCAG2AA violations, empty or mixing, light or dark", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
    await page.goto("/drinks");
    await panelReady(page);
    await expectNoViolations(page);

    await withBrowserList(page, ["gin", "tonic water"]);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      await panelReady(page);
      await expect(page.getByTestId("drinks-ready")).toBeVisible();
      await expectNoViolations(page);
    }
  });

  test("the drinks page @visual", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
    await withBrowserList(page, ["gin", "tonic water"]);
    await page.goto("/drinks");
    await panelReady(page);
    await expect(page.getByTestId("drinks-seasonal")).toBeVisible();
    await snapshotPage(page, "drinks-page.png");
  });
});

test.describe("Drinks @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("drinks-bar");
  });

  test("fits a phone, with Drinks current in the tab bar", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
    await withBrowserList(page, ["gin", "tonic water"]);
    await page.goto("/drinks");
    await panelReady(page);
    await expect(
      page.getByTestId("phone-tab-bar").getByRole("link", { name: "Drinks" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await expectNoViolations(page);
    await snapshotPage(page, "drinks-page.png");
  });
});
