import { test, expect } from "../support/test";
import { searchFor } from "../support/helpers";
import { snapshotPage } from "../support/visual";

test.describe("Mobile @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("homepage renders on a small viewport @visual", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await snapshotPage(page, "homepage-mobile.png");
  });

  /* 42f: the season's rows and their strips on a phone (dates masked). */
  test("homepage season on a small viewport @visual", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(new Date(2026, 9, 18, 12));
    await page.goto("/");
    await expect(page.getByTestId("season-countdown")).toHaveCount(2);
    await snapshotPage(page, "homepage-season-mobile.png");
  });

  test("recipe view reflows ingredients on mobile @visual", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6");
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe 6" }),
    ).toBeVisible();
    await snapshotPage(page, "recipe-mobile.png");
  });

  test("search input is reachable on mobile", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByLabel("Search recipes")).toBeVisible();
    await searchFor(page, "Second");
    await expect(
      page.getByRole("listitem").first().getByRole("heading"),
    ).toContainText("Second");
  });

  /* 43s: a term and its bands on a phone, the Narrow button beside Sort. */
  test("search opens on a term on a small viewport @visual", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(new Date(2026, 9, 18, 12));
    await page.goto("/search?q=tag%3Avodka");
    await expect(page.getByTestId("season-band")).toHaveCount(2, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Narrow", exact: true }),
    ).toBeVisible();
    await snapshotPage(page, "search-term-mobile.png");
  });

  test("featured recipes grid collapses on mobile", async ({
    page,
    resetData,
  }) => {
    await resetData("many-featured-recipes");
    await page.goto("/featured-recipes");
    await expect(page.getByRole("listitem").first()).toBeVisible();
  });

  // 41h: `/make` on a phone — the question, the shelf stacked above the
  // results, a featured label, and nothing scrolling sideways.
  test("make page stacks the shelf above the results @visual", async ({
    page,
    resetData,
  }) => {
    await resetData("make-drinks");
    await page.goto("/make?q=tag:drink");
    await expect(page.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    const input = page.getByTestId("inventory-input");
    await input.fill("vodka, simple syrup, gin, tonic water");
    await input.press("Enter");
    await page
      .getByTestId("inventory-chips")
      .getByRole("button", { name: "gin", exact: true })
      .click();
    await expect(page.getByTestId("make-question")).toHaveText(
      "What drinks can I make with gin?",
    );
    await expect(page.getByTestId("make-toast")).toBeEmpty({
      timeout: 5_000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    /* Folded, the shelf says what it holds. */
    const toggle = page.getByRole("button", { name: /^4 on hand/ });
    await expect(toggle).toHaveText("4 on hand · gin featured");
    await snapshotPage(page, "make-mobile.png");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("inventory-chips")).toBeHidden();
  });
});
