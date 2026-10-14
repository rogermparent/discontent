import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";

/*
 * `/shopping` (epic 35, 35d) against the `shopping` fixture: Buttermilk
 * Pancakes, Spanish Omelette and Onion Soup — eggs, onions and flour overlap
 * — and the meal plan "Week of Oct 19", which lists the pancakes at ×2 and
 * the nested plan "Weeknight Dinners" (the omelette and the soup). Its
 * twelve lines merge to ten rows: eggs 2×2 + 6 = 10, onions 2 + 4 = 6. The
 * shared on-hand list holds olive oil (and salt is a staple).
 */

const rows = (page: Page) => page.getByTestId("shopping-row");
const list = (page: Page) => page.getByTestId("shopping-list");

/** Signed in, on `/shopping` (the page sends a guest to sign in first). */
async function openList(page: Page) {
  await page.goto("/shopping");
  await fillSignInForm(page);
  await expect(
    page.getByRole("heading", { name: "Shopping list" }),
  ).toBeVisible();
}

async function addPlan(page: Page) {
  await page.goto("/group/week-of-oct-19");
  await page.getByRole("button", { name: "Add to shopping list" }).click();
  await expect(page.getByTestId("shopping-add-result")).toContainText(
    "12 items added",
  );
  await page.getByRole("link", { name: "Open the list" }).click();
  await expect(list(page)).toContainText("10 eggs");
}

test.describe("Shopping list", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData("shopping");
    await initializeContentGit();
  });

  test("a guest is sent to sign in, and the API answers 401", async ({
    page,
    request,
  }) => {
    expect((await request.get("/api/shopping")).status()).toBe(401);
    await page.goto("/shopping");
    await expect(page.getByLabel("Password")).toBeVisible();
    /* And the add buttons are not offered to a guest. */
    await page.goto("/group/week-of-oct-19");
    await expect(
      page.getByRole("heading", { name: "Week of Oct 19" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add to shopping list" }),
    ).toHaveCount(0);
  });

  test("adds a meal plan from its page, merged by aisle, in one commit", async ({
    page,
    getContentGitLog,
  }) => {
    await openList(page);
    await expect(list(page)).toContainText("The list is empty.");
    await addPlan(page);

    await expect(
      list(page).getByRole("heading", { name: "Produce" }),
    ).toBeVisible();
    await expect(page.getByLabel("10 eggs", { exact: true })).toBeVisible();
    await expect(page.getByLabel("6 onions", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("4 cups all purpose flour", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("shopping-counts")).toHaveText(
      /^10 to buy · 0 checked/,
    );
    /* Where the eggs came from: two recipes, one at ×2 through the plan. */
    const eggs = rows(page).filter({ hasText: "10 eggs" });
    await eggs.getByText("from 2 recipes").click();
    await expect(eggs.getByTestId("shopping-sources")).toContainText(
      "Buttermilk Pancakes ×2 · week-of-oct-19",
    );
    expect((await getContentGitLog())[0]).toBe(
      "Update shopping list: +Week of Oct 19 (12 items)",
    );
  });

  test("ticks commit after a quiet spell, and Clear checked removes them", async ({
    page,
    getContentGitLog,
  }) => {
    await openList(page);
    await addPlan(page);

    await page.getByLabel("10 eggs", { exact: true }).check();
    await page.getByLabel("6 onions", { exact: true }).check();
    /* Optimistic: counted at once, committed together a moment later. */
    await expect(page.getByTestId("shopping-counts")).toHaveText(
      /^8 to buy · 2 checked/,
    );
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toMatch(/^Update shopping list: ✓egg ✓onion$/);

    /* A reload reads it back from the server. */
    await page.reload();
    const checked = page.getByTestId("shopping-checked");
    await expect(checked).toContainText("Checked (2)");
    await checked.getByText("Checked (2)").click();
    await checked.getByRole("button", { name: "Clear checked" }).click();
    await checked.getByRole("button", { name: "Clear 4" }).click();
    await expect(checked).toHaveCount(0);
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Clear shopping list: 4 checked");
    await expect(page.getByTestId("shopping-counts")).toHaveText(
      /^8 to buy · 0 checked/,
    );
  });

  test("copies the list as text", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openList(page);
    await addPlan(page);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("Produce:\n6 onions\n1 lb potatoes");
    expect(text).toContain("Dairy & eggs:\n10 eggs");
  });

  test("with every switch off, the list is the lines as written", async ({
    page,
    getContentGitLog,
  }) => {
    await openList(page);
    await addPlan(page);
    await page.getByRole("button", { name: "Settings" }).click();
    const sheet = page.getByTestId("shopping-settings");
    for (const name of [
      "Merge",
      "Quantities",
      "Aisles",
      "Stores",
      "On hand",
      "Sources",
    ]) {
      await sheet.getByLabel(new RegExp(`^${name}`)).uncheck();
    }
    await sheet.getByRole("button", { name: "Save settings" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(rows(page)).toHaveCount(12);
    await expect(rows(page).locator("label")).toHaveText([
      "2 cups all-purpose flour",
      "2 large eggs",
      "1 1/2 cups buttermilk",
      "2 tablespoons sugar",
      "1 teaspoon salt",
      "6 eggs",
      "2 onions, thinly sliced",
      "1 lb potatoes",
      "1/4 cup olive oil",
      "4 onions",
      "2 tablespoons butter",
      "6 cups beef stock",
    ]);
    await expect(list(page).getByRole("heading")).toHaveCount(0);
    expect((await getContentGitLog())[0]).toBe("Update shopping list settings");
  });

  test("stores split the list, and on hand folds olive oil away", async ({
    page,
  }) => {
    await openList(page);
    await addPlan(page);
    await page.getByRole("button", { name: "Settings" }).click();
    const sheet = page.getByTestId("shopping-settings");
    await sheet.getByLabel(/^Stores/).check();
    await sheet.getByLabel(/^On hand/).check();
    await sheet.getByRole("button", { name: "Save settings" }).click();

    /* Olive oil (on the shared list) and salt (a staple). */
    await expect(page.getByTestId("shopping-probably-have")).toContainText(
      "Probably on hand (2)",
    );
    await expect(page.getByTestId("shopping-counts")).toHaveText(
      /^8 to buy · 2 probably on hand · 0 checked/,
    );
    const stores = page.getByRole("group", { name: "Store" });
    await expect(
      stores.getByRole("button", { name: /Market Basket/ }),
    ).toBeVisible();
    await stores.getByRole("button", { name: /Market Basket/ }).click();
    /* Produce defaults to Market Basket. */
    await expect(list(page)).toContainText("6 onions");
    await expect(list(page)).not.toContainText("10 eggs");
    await stores.getByRole("button", { name: /Hannaford/ }).click();
    await expect(list(page)).toContainText("10 eggs");
    await expect(list(page)).not.toContainText("6 onions");
  });

  test("a recipe page adds at the scale the reader set", async ({
    page,
    getContentGitLog,
  }) => {
    await openList(page);
    await page.goto("/recipe/onion-soup?scale=2");
    await page.getByRole("button", { name: "Add ×2 to list" }).click();
    await expect(page.getByTestId("shopping-add-result")).toContainText(
      "3 items added",
    );
    expect((await getContentGitLog())[0]).toBe(
      "Update shopping list: +Onion Soup ×2 (3 items)",
    );
    await page.goto("/shopping");
    await expect(page.getByLabel("8 onions", { exact: true })).toBeVisible();
  });

  test("works at phone width: add, tick, no sideways scroll @mobile", async ({
    page,
    getContentGitLog,
  }) => {
    await openList(page);
    const add = page.getByTestId("shopping-add");
    await add.fill("paper towels\n2 lemons");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByLabel("2 lemons", { exact: true })).toBeVisible();
    await expect(add).toHaveValue("");

    const box = await rows(page).first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await page.getByLabel("2 lemons", { exact: true }).check();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: ✓lemon");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
