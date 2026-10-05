import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { openPalette } from "../support/helpers";
import { expectNoViolations } from "../support/a11y";

/*
 * `/make` — "What can I make?" (25c), against `make-drinks`: five drinks
 * (Vodka Sour, Gin and Tonic, Zero-Proof G&T, Lavender Gnista Tonic,
 * Chamomile Collins), the Lavender Syrup the Gnista tonic links to, and Hand
 * Pies, whose `Filling` and `Dough` lines are stored headings that
 * `detectHeading` would not catch.
 *
 * Everything runs in the browser; the inventory lives in `localStorage`, so
 * each test starts from a fresh context with none.
 */

const ticker = (page: Page) => page.getByTestId("make-ticker");
const section = (page: Page, id: string) => page.getByTestId(id);

/** The page has its corpus, its ingredients and its storage. */
async function ready(page: Page) {
  await expect(ticker(page)).toHaveText(/can make/i, { timeout: 20_000 });
}

async function addItems(page: Page, text: string) {
  const input = page.getByTestId("inventory-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test.describe("What can I make?", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("make-drinks");
  });

  test("defaults to drinks and asks what you have", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    /* The two G&Ts are honestly two away from nothing: gin (or its
     * non-alcoholic twin) and tonic. */
    await expect(ticker(page)).toHaveText(
      /5 recipes · 0 can make · 0 one away · 2 two away · “tag:drink”/i,
    );
    await expect(page.getByTestId("make-query")).toHaveValue("tag:drink");
    await expect(page.getByText("Start with what you have")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Drinks", pressed: true }),
    ).toBeVisible();
  });

  test("adding items moves cards between sections", async ({ page }) => {
    await page.goto("/make");
    await ready(page);

    await addItems(page, "vodka, simple syrup");
    await expect(section(page, "make-one-away")).toContainText("Vodka Sour");
    await expect(
      section(page, "make-one-away").getByTestId("make-missing").first(),
    ).toHaveText("Missing: lime juice");

    await addItems(page, "lime");
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    /* The section itself goes when nothing is one away. */
    await expect(
      section(page, "make-one-away").getByText("Vodka Sour"),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Remove lime" }).click();
    await expect(section(page, "make-one-away")).toContainText("Vodka Sour");
  });

  test("gin never stands in for non-alcoholic gin", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "gin, tonic");

    await expect(section(page, "make-can")).toContainText("Gin and Tonic");
    const oneAway = section(page, "make-one-away");
    await expect(oneAway).toContainText("Zero-Proof G&T");
    await expect(oneAway).toContainText("Missing: non-alcoholic gin");
  });

  test("a line can be met by making its recipe first", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "Gnista, tonic water");
    await expect(section(page, "make-one-away")).toContainText(
      "Lavender Gnista Tonic",
    );

    await addItems(page, "sugar, lavender");
    const can = section(page, "make-can");
    await expect(can).toContainText("Lavender Gnista Tonic");
    await expect(can.getByTestId("make-via")).toHaveText(
      "Make lavender syrup first",
    );
  });

  test("buy next names what one more item unlocks", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, simple syrup");

    const buyNext = page.getByTestId("buy-next");
    await expect(buyNext.getByRole("listitem").first()).toContainText(
      "lime juice",
    );
    await buyNext.getByRole("button", { name: "I have lime juice" }).click();
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    await expect(page.getByTestId("inventory-chips")).toContainText(
      "lime juice",
    );
  });

  test("exports and imports the list as text", async ({ page, browser }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, lime, simple syrup");

    await page.getByRole("button", { name: "Import / export" }).click();
    const exported = await page.getByTestId("inventory-export").inputValue();
    expect(exported).toBe("lime\nsimple syrup\nvodka");

    /* A second browser — another site, or another device. A context made by
     * hand doesn't inherit the config's `baseURL`, hence the absolute URL. */
    const other = await browser.newPage();
    await other.goto(new URL("/make", page.url()).toString());
    await ready(other);
    await other.getByRole("button", { name: "Import / export" }).click();
    await other.getByTestId("inventory-import").fill(exported);
    await expect(other.getByTestId("inventory-import-preview")).toHaveText(
      "3 items: lime, simple syrup, vodka",
    );
    await other.getByRole("button", { name: "Replace what I have" }).click();
    await expect(other.getByTestId("inventory-chips")).toContainText("vodka");
    await expect(section(other, "make-can")).toContainText("Vodka Sour");
    await other.close();
  });

  test("the list survives a reload", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, lime, simple syrup");
    await page.reload();
    await ready(page);
    await expect(page.getByTestId("inventory-chips")).toContainText(
      "simple syrup",
    );
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
  });

  test("a ?q= deep link sets the scope", async ({ page }) => {
    await page.goto("/make?q=tag:zero-proof");
    await ready(page);
    await expect(ticker(page)).toHaveText(/^2 recipes/i);
    await expect(page.getByTestId("make-query")).toHaveValue("tag:zero-proof");
  });

  test("the scope is remembered, and a chip narrows it", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await page.getByRole("button", { name: "highball", exact: true }).click();
    await expect(page.getByTestId("make-query")).toHaveValue(
      "tag:drink tag:highball",
    );
    await expect(page).toHaveURL(/q=tag%3Adrink\+tag%3Ahighball/);
    await expect(ticker(page)).toHaveText(/^3 recipes/i);

    await page.goto("/make");
    await ready(page);
    await expect(page.getByTestId("make-query")).toHaveValue(
      "tag:drink tag:highball",
    );
  });

  test("stored headings are never listed as missing", async ({ page }) => {
    await page.goto("/make?q=tag:dessert");
    await ready(page);
    await addItems(page, "jam, flour");
    const oneAway = section(page, "make-one-away");
    await expect(oneAway).toContainText("Hand Pies");
    await expect(oneAway.getByTestId("make-missing")).toHaveText(
      "Missing: butter",
    );
  });

  test("an empty scope offers to clear it", async ({ page }) => {
    await page.goto("/make?q=tag:nothing-here");
    await ready(page);
    await expect(page.getByText("Nothing in scope")).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByTestId("make-query")).toHaveValue("");
    await expect(ticker(page)).toHaveText(/^7 recipes/i);
  });

  test("a term page links to /make for its recipes", async ({ page }) => {
    await page.goto("/tags/drink");
    const link = page.getByRole("link", {
      name: "What can I make with these?",
    });
    await expect(link).toHaveAttribute("href", "/make?q=tag%3Adrink");
    await link.click();
    await expect(page).toHaveURL(/\/make\?q=tag%3Adrink$/);
    await ready(page);
  });

  test("the palette goes to /make", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await page.getByRole("option", { name: "What can I make?" }).click();
    await expect(page).toHaveURL(/\/make$/);
  });

  test("has no WCAG2AA violations, empty or filled", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await expectNoViolations(page);

    await addItems(page, "vodka, simple syrup, gin, tonic");
    await expect(section(page, "make-can")).toBeVisible();
    await expectNoViolations(page);
  });
});
