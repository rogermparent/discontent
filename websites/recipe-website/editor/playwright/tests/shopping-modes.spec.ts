import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { snapshotPage } from "../support/visual";

/*
 * 42g: `/shopping`'s two jobs against the `shopping` fixture (see
 * shopping.spec.ts). "Week of Oct 19" merges to ten rows by aisle — Produce:
 * 6 onions, 1 lb potatoes; Dairy & eggs: 10 eggs, 1½ cups buttermilk, 2 tbsp
 * butter; Pantry: flour, sugar, olive oil, beef stock; Spices: salt. With On
 * hand switched on, olive oil (the shared list) and salt (a staple) fold away.
 *
 * Shop (in the store) is a phone's default: the `@mobile` tests. Plan (at
 * home) is a wide screen's.
 */

const page$ = (page: Page) => page.getByTestId("shopping-page");
const list = (page: Page) => page.getByTestId("shopping-list");

/** Signed in, the given things on the list, on `/shopping` and hydrated. */
async function openWith(
  page: Page,
  adds: object[],
  settings?: { features: Record<string, boolean> },
) {
  await page.goto("/shopping");
  await fillSignInForm(page);
  await expect(
    page.getByRole("heading", { name: "Shopping list" }),
  ).toBeAttached();
  for (const data of adds) {
    const added = await page.request.post("/api/shopping", { data });
    expect(added.ok()).toBe(true);
  }
  if (settings) {
    const saved = await page.request.patch("/api/shopping/settings", {
      data: settings,
    });
    expect(saved.ok()).toBe(true);
  }
  await page.reload();
  await expect(page$(page)).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

const PLAN = { group: "week-of-oct-19" };

test.describe("Shopping list: in the store @mobile", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData("shopping");
    await initializeContentGit();
  });

  test("opens in Shop, and the aisle rail jumps to an aisle", async ({
    page,
  }) => {
    await openWith(page, [PLAN]);
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
    const rail = page.getByRole("navigation", { name: "Aisles" });
    await expect(rail.getByRole("link")).toHaveText([
      /^Produce/,
      /^Dairy & eggs/,
      /^Pantry/,
      /^Spices/,
    ]);
    await expect(
      rail.getByRole("link", { name: /^Pantry/ }),
    ).toHaveAccessibleName("Pantry, 4 left");
    await rail.getByRole("link", { name: /^Spices/ }).click();
    const spices = list(page).getByRole("region", { name: "Spices" });
    await expect(spices).toBeInViewport();
    await expect(spices).toBeFocused();
    await expect(rail.getByRole("link", { name: /^Spices/ })).toHaveAttribute(
      "aria-current",
      "location",
    );
    /* The pinned bar does not cover the aisle it jumped to. */
    const bar = await page.getByTestId("shopping-shop-bar").boundingBox();
    const heading = await spices.getByRole("heading").boundingBox();
    expect(heading!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test("a ticked line stays struck in place until its aisle is done", async ({
    page,
    getContentGitLog,
  }) => {
    await openWith(page, [PLAN]);
    const dairy = list(page).getByRole("region", { name: "Dairy & eggs" });
    const eggs = page.getByLabel("10 eggs", { exact: true });
    await eggs.check();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: ✓egg");
    /* Still in Dairy & eggs, first as before, struck through. */
    await expect(dairy.getByTestId("shopping-row").first()).toHaveAttribute(
      "data-checked",
      "true",
    );
    await expect(dairy.getByText("10 eggs", { exact: true })).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
    await expect(dairy.getByRole("heading")).toContainText("1 of 3 ticked");
    await expect(page.getByTestId("shopping-progress")).toContainText(
      "1 of 10 ticked",
    );
    await expect(page.getByTestId("shopping-progress")).toContainText("9 left");

    await dairy
      .getByRole("button", { name: "Aisle done: Dairy & eggs" })
      .click();
    const folded = page.getByTestId("shopping-aisle-done");
    await expect(folded).toContainText("Dairy & eggs — done");
    await expect(folded).toContainText("1 of 3");
    await expect(eggs).toBeHidden();
    await expect(
      page
        .getByRole("navigation", { name: "Aisles" })
        .getByRole("link", { name: "Dairy & eggs, done" }),
    ).toBeVisible();
    /* Open it to look, then undo it. */
    await folded.getByRole("button", { name: /Dairy & eggs — done/ }).click();
    await expect(eggs).toBeVisible();
    /* It is this browser's: a reload keeps it. */
    await page.reload();
    await expect(page$(page)).toHaveAttribute("data-ready", "true");
    await expect(folded).toContainText("Dairy & eggs — done");
    await folded
      .getByRole("button", { name: "Undo: Dairy & eggs done" })
      .click();
    await expect(folded).toHaveCount(0);
    await expect(eggs).toBeVisible();
    await expect(eggs).toBeChecked();
    /* Nothing of it was written. */
    expect((await getContentGitLog())[0]).toBe("Update shopping list: ✓egg");
  });

  test("on-hand lines sit in their aisle as one quiet line, with Buy anyway", async ({
    page,
    getContentGitLog,
  }) => {
    await openWith(page, [PLAN], { features: { onHand: true } });
    const pantry = list(page).getByRole("region", { name: "Pantry" });
    const line = pantry.getByTestId("shopping-onhand-line");
    await expect(line).toContainText("Probably at home already");
    await expect(line).toContainText("olive oil");
    await expect(
      list(page)
        .getByRole("region", { name: "Spices" })
        .getByTestId("shopping-onhand-line"),
    ).toContainText("salt");
    /* Not a row to tick until it is wanted. */
    await expect(
      page.getByLabel("¼ cup olive oil", { exact: true }),
    ).toHaveCount(0);
    const show = line.getByRole("button", {
      name: "Show what is probably on hand in Pantry",
    });
    await expect(show).toHaveAttribute("aria-expanded", "false");
    await show.click();
    await line
      .getByRole("button", { name: "Buy anyway: ¼ cup olive oil" })
      .click();
    await expect(
      page.getByLabel("¼ cup olive oil", { exact: true }),
    ).toBeVisible();
    await expect(pantry.getByTestId("shopping-onhand-line")).toHaveCount(0);
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: need:olive oil");
  });

  test("one store at a time, with the stores switch on", async ({ page }) => {
    await openWith(page, [PLAN], { features: { stores: true } });
    const store = page.getByLabel("Store", { exact: true });
    await store.selectOption({ label: "Market Basket (2 left)" });
    await expect(list(page)).toContainText("6 onions");
    await expect(list(page)).not.toContainText("10 eggs");
    await expect(page.getByTestId("shopping-progress")).toContainText(
      "0 of 2 ticked here",
    );
    await store.selectOption({ label: "Hannaford (8 left)" });
    await expect(list(page)).toContainText("10 eggs");
    await expect(list(page)).not.toContainText("6 onions");
  });

  test("Done shopping clears what was ticked, with Undo (holdTicks off)", async ({
    page,
    getContentGitLog,
  }) => {
    await openWith(page, [PLAN]);
    await page.getByLabel("10 eggs", { exact: true }).check();
    await page.getByLabel("6 onions", { exact: true }).check();
    await expect
      .poll(async () => (await getContentGitLog()).slice(0, 2).join(" | "), {
        timeout: 15_000,
      })
      .toMatch(/✓egg[\s\S]*✓onion|✓onion[\s\S]*✓egg/);
    const bar = page.getByTestId("shopping-done");
    await expect(bar).toContainText("2 ticked");

    await bar.getByRole("button", { name: "Done shopping" }).click();
    await expect(bar).toContainText("Cleared 2 lines.");
    await expect(page.getByLabel("10 eggs", { exact: true })).toHaveCount(0);
    await bar.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("10 eggs", { exact: true })).toBeChecked();
    await expect(page.getByLabel("6 onions", { exact: true })).toBeChecked();

    await bar.getByRole("button", { name: "Done shopping" }).click();
    await expect(page.getByLabel("10 eggs", { exact: true })).toHaveCount(0);
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 20_000 })
      .toBe("Update shopping list: −egg −onion");
    await expect(bar.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await page.reload();
    await expect(page$(page)).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("shopping-progress")).toContainText(
      "0 of 8 ticked",
    );
  });

  test("Plan on the phone: what is on it, then Start shopping", async ({
    page,
  }) => {
    await openWith(page, [PLAN]);
    await page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Plan" })
      .click();
    await expect(page$(page)).toHaveAttribute("data-mode", "plan");
    await expect(page.getByTestId("shopping-on-list")).toContainText(
      "Week of Oct 19",
    );
    /* The list itself is Shop's on a phone. */
    await expect(list(page)).toBeHidden();
    await page
      .getByTestId("shopping-start")
      .getByRole("button", { name: /Start shopping/ })
      .click();
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
    await expect(page.getByLabel("10 eggs", { exact: true })).toBeVisible();
  });

  test("the in-store view @visual", async ({ page }) => {
    await openWith(page, [PLAN, { recipe: "lemonade" }], {
      features: { onHand: true },
    });
    await page.getByLabel("10 eggs", { exact: true }).check();
    await expect(page.getByTestId("shopping-done")).not.toContainText(
      "Saving",
      { timeout: 15_000 },
    );
    await snapshotPage(page, "shopping-shop.png");
  });

  test("the at-home view on a phone @visual", async ({ page }) => {
    await openWith(page, [PLAN, { recipe: "lemonade" }], {
      features: { onHand: true },
    });
    await page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Plan" })
      .click();
    await expect(page.getByTestId("shopping-on-list")).toBeVisible();
    await snapshotPage(page, "shopping-plan.png");
  });
});

test.describe("Shopping list: at home", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData("shopping");
    await initializeContentGit();
  });

  test("opens in Plan, with what is on the list by plan and recipe", async ({
    page,
  }) => {
    await openWith(page, [PLAN, { recipe: "lemonade" }]);
    await expect(page$(page)).toHaveAttribute("data-mode", "plan");
    const entries = page
      .getByTestId("shopping-on-list")
      .getByTestId("shopping-on-list-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText("Week of Oct 19");
    await expect(entries.nth(0)).toContainText("plan · 3 recipes · 10 lines");
    await expect(
      entries.nth(0).getByRole("list", { name: "Recipes in Week of Oct 19" }),
    ).toContainText("Buttermilk Pancakes");
    await expect(entries.nth(0)).toContainText("Onion Soup");
    await expect(entries.nth(1)).toContainText("Lemonade");
    await expect(entries.nth(1)).toContainText("with Simple Syrup");
    await expect(
      entries.nth(0).getByRole("link", { name: "Week of Oct 19" }),
    ).toHaveAttribute("href", "/group/week-of-oct-19");
  });

  test("Remove these takes a plan, then a recipe, one commit each", async ({
    page,
    getContentGitLog,
  }) => {
    await openWith(page, [PLAN, { recipe: "lemonade" }]);
    const panel = page.getByTestId("shopping-on-list");
    const removePlan = panel.getByRole("button", {
      name: "Remove these lines from Week of Oct 19",
    });
    await removePlan.click();
    const question = panel.getByRole("group", {
      name: /^Remove what Week of Oct 19 added to \d+ lines\?$/,
    });
    await expect(
      question.getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await question.getByRole("button", { name: "Remove", exact: true }).click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: -Week of Oct 19 (12 items)");
    await expect(page.getByLabel("10 eggs", { exact: true })).toHaveCount(0);
    await expect(list(page)).toContainText("1 cup lemon juice");
    await expect(panel.getByTestId("shopping-on-list-entry")).toHaveCount(1);

    await panel
      .getByRole("button", { name: "Remove these lines from Lemonade" })
      .click();
    await panel
      .getByRole("group", { name: /^Remove what Lemonade added/ })
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: -Lemonade (5 items)");
    await expect(list(page)).toContainText("The list is empty.");
    await expect(panel).toHaveCount(0);
  });

  test("Buy anyway puts an on-hand line back on the list", async ({
    page,
    getContentGitLog,
  }) => {
    await openWith(page, [PLAN], { features: { onHand: true } });
    const onHand = page.getByTestId("shopping-probably-have");
    await expect(onHand).toContainText("Probably on hand (2)");
    await onHand
      .getByRole("button", { name: "Buy anyway: 2 tsp salt" })
      .click();
    await expect(onHand).toContainText("Probably on hand (1)");
    const salt = list(page).getByTestId("shopping-row").filter({
      hasText: "2 tsp salt",
    });
    await expect(salt.getByTestId("shopping-row-note")).toHaveText(
      "buy anyway",
    );
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: need:salt");
  });

  test("the switches beside the list write on change", async ({
    page,
    getContentGitLog,
  }) => {
    await openWith(page, [PLAN]);
    const switches = page.getByTestId("shopping-switches");
    const aisles = switches.getByRole("switch", { name: /^Aisles/ });
    await expect(aisles).toBeChecked();
    await expect(
      list(page).getByRole("heading", { name: "Produce" }),
    ).toBeVisible();
    await aisles.uncheck();
    await expect(list(page).getByRole("heading")).toHaveCount(0);
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list settings");
    await expect(aisles).not.toBeChecked();
    /* The sheet keeps the stores and aisles. */
    await switches.getByRole("button", { name: "Stores and aisles" }).click();
    const sheet = page.getByTestId("shopping-settings");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel(/^Aisles/)).not.toBeChecked();
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toHaveCount(0);
  });

  test("Shop on a wide screen is remembered", async ({ page }) => {
    await openWith(page, [PLAN]);
    await page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Shop" })
      .click();
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
    await expect(
      page.getByRole("navigation", { name: "Aisles" }),
    ).toBeVisible();
    await page.reload();
    await expect(page$(page)).toHaveAttribute("data-ready", "true");
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
  });

  test("the at-home view @visual", async ({ page }) => {
    await openWith(page, [PLAN, { recipe: "lemonade" }], {
      features: { onHand: true },
    });
    await expect(page.getByTestId("shopping-on-list")).toBeVisible();
    await snapshotPage(page, "shopping-plan.png");
  });

  test("the in-store view on a wide screen @visual", async ({ page }) => {
    await openWith(page, [PLAN, { recipe: "lemonade" }], {
      features: { onHand: true },
    });
    await page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Shop" })
      .click();
    await expect(
      page.getByRole("navigation", { name: "Aisles" }),
    ).toBeVisible();
    await snapshotPage(page, "shopping-shop.png");
  });
});
