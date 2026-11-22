import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { snapshotLocator } from "../support/visual";

/*
 * 50a: the shopping list as layers, against the `shopping` fixture. The
 * Lemonade (its Simple Syrup expanded) brings "1 cup lemon juice", sugar
 * and water; water, from the tap, is left off built in. A change made
 * through `/api/shopping/layers` renames the lemon juice and notes it; the
 * row shows a marker and its chain, the Changes panel turns it off and on
 * and removes it, Restore brings the water back, and "As written" shows the
 * rows before any of it.
 */

const page$ = (page: Page) => page.getByTestId("shopping-page");
const rows = (page: Page) => page.getByTestId("shopping-row");
const changes = (page: Page) => page.getByTestId("shopping-changes");
const leftOff = (page: Page) => page.getByTestId("shopping-left-off");

interface Item {
  id: string;
  text: string;
}

/** Signed in, the Lemonade on the list, on `/shopping`: its items. */
async function openWithLemonade(page: Page): Promise<Item[]> {
  await page.goto("/shopping");
  await fillSignInForm(page);
  await expect(
    page.getByRole("heading", { name: "Shopping list" }),
  ).toBeAttached();
  const added = await page.request.post("/api/shopping", {
    data: { recipe: "lemonade" },
  });
  expect(added.ok()).toBe(true);
  return ((await added.json()) as { items: Item[] }).items;
}

async function ready(page: Page) {
  await page.reload();
  await expect(page$(page)).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

function idOf(items: Item[], text: string): string {
  const found = items.find((item) => item.text === text);
  expect(found, text).toBeDefined();
  return found!.id;
}

async function addLemonChange(page: Page, items: Item[]) {
  const lemon = idOf(items, "1 cup lemon juice");
  const response = await page.request.post("/api/shopping/layers", {
    data: {
      ops: [
        { op: "rename", ids: [lemon], name: "Meyer lemon juice" },
        { op: "note", ids: [lemon], text: "or 6 lemons" },
      ],
      reason: "the good ones",
    },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { layer: { id: string } }).layer.id;
}

test.describe("Shopping list: layers", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData("shopping");
    await initializeContentGit();
  });

  test("a change through the API shows its marker and chain, turns off and on, and goes", async ({
    page,
    getContentGitLog,
  }) => {
    const items = await openWithLemonade(page);
    await addLemonChange(page, items);
    expect((await getContentGitLog())[0]).toBe(
      "Update shopping list: change: Rename lemon juice to Meyer lemon juice; Note on lemon juice: or 6 lemons (the good ones)",
    );
    await ready(page);

    const lemon = rows(page).filter({ hasText: "Meyer lemon juice" });
    await expect(
      page.getByLabel("1 cup Meyer lemon juice", { exact: true }),
    ).toBeVisible();
    await expect(lemon.getByTestId("shopping-row-note")).toHaveText(
      "or 6 lemons",
    );
    await expect(lemon.getByTestId("shopping-row-changed")).toHaveText(
      "changed",
    );
    const chain = lemon.getByTestId("shopping-row-changes");
    await chain.getByText("2 changes").click();
    await expect(
      chain
        .getByRole("list", { name: "How this line changed" })
        .getByRole("listitem"),
    ).toHaveText([
      "As written: 1 cup lemon juice",
      "→ renamed to Meyer lemon juice — by you · the good ones",
      "→ note: or 6 lemons — by you · the good ones",
    ]);

    /* The Changes panel: off is undo, and the change stays to turn back on. */
    await expect(changes(page).getByRole("heading", { level: 2 })).toHaveText(
      "Changes (1)",
    );
    const change = changes(page).getByTestId("shopping-change");
    await expect(change).toContainText(
      "Rename lemon juice to Meyer lemon juice; Note on lemon juice: or 6 lemons (the good ones)",
    );
    const on = change.getByRole("switch");
    await expectHydrated(on);
    await expect(on).toBeChecked();
    await on.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toMatch(/^Update shopping list: change off: /);
    await expect(
      page.getByLabel("1 cup lemon juice", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("shopping-row-changed")).toHaveCount(0);
    await expect(change).toHaveAttribute("data-on", "false");
    await on.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toMatch(/^Update shopping list: change on: /);
    await expect(
      page.getByLabel("1 cup Meyer lemon juice", { exact: true }),
    ).toBeVisible();

    /* Shop shows the composed list only: no marker, no panels. */
    await page
      .getByTestId("shopping-mode")
      .getByRole("button", { name: "Shop" })
      .click();
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
    await expect(
      page.getByLabel("1 cup Meyer lemon juice", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("shopping-row-changes")).toHaveCount(0);
    await expect(leftOff(page)).toHaveCount(0);
    await expect(changes(page)).toHaveCount(0);
    await page
      .getByTestId("shopping-mode")
      .getByRole("button", { name: "Plan" })
      .click();
    await expect(page$(page)).toHaveAttribute("data-mode", "plan");

    const remove = changes(page).getByRole("button", {
      name: /^Remove change: Rename lemon juice/,
    });
    await expectHydrated(remove);
    await remove.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toMatch(/^Update shopping list: remove change: /);
    /* The panel stays to say so, with focus on its heading. */
    await expect(changes(page).getByRole("heading", { level: 2 })).toHaveText(
      "Changes (0)",
    );
    await expect(
      changes(page).getByRole("heading", { level: 2 }),
    ).toBeFocused();
    await expect(changes(page).getByRole("status")).toHaveText(
      /^Removed: Rename lemon juice to Meyer lemon juice/,
    );
    await expect(
      page.getByLabel("1 cup lemon juice", { exact: true }),
    ).toBeVisible();
    await ready(page);
    /* 50c: the panel stays, for its rules tier; this list has none. */
    await expect(changes(page).getByTestId("shopping-change")).toHaveCount(0);
    await expect(changes(page).getByRole("heading", { level: 2 })).toHaveText(
      "Changes (0)",
    );
  });

  test("water is left off with its reason, and Restore brings it back for every list", async ({
    page,
    getContentGitLog,
  }) => {
    await openWithLemonade(page);
    await ready(page);
    await expect(rows(page).filter({ hasText: "water" })).toHaveCount(0);
    const panel = leftOff(page);
    await panel.getByText("Left off the list (1)").click();
    const row = panel.getByTestId("shopping-left-off-row");
    await expect(row).toContainText("4½ cups water");
    await expect(row).toContainText("tap water · always left off");
    const restore = row.getByRole("button", { name: "Restore 4½ cups water" });
    await expectHydrated(restore);
    await restore.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: buy water again");
    await expect(
      page.getByLabel("4½ cups water", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText(
      "Back on the list: 4½ cups water.",
    );
    await expect(panel.getByTestId("shopping-left-off-row")).toHaveCount(0);
    /* The last one restored: focus is on the row now back on the list. */
    await expect(
      page.getByLabel("4½ cups water", { exact: true }),
    ).toBeFocused();
    /* A rule: it holds after a reload. */
    await ready(page);
    await expect(
      page.getByLabel("4½ cups water", { exact: true }),
    ).toBeVisible();
  });

  test("a change's drop is left off by you, and its Restore turns the change off", async ({
    page,
    getContentGitLog,
  }) => {
    const items = await openWithLemonade(page);
    const response = await page.request.post("/api/shopping/layers", {
      data: {
        ops: [
          {
            op: "drop",
            ids: [idOf(items, "1 cup lemon juice")],
            reason: "squeezed at home",
          },
        ],
      },
    });
    expect(response.ok()).toBe(true);
    await ready(page);
    await expect(rows(page).filter({ hasText: "lemon juice" })).toHaveCount(0);
    const panel = leftOff(page);
    await panel.getByText("Left off the list (2)").click();
    const lemon = panel
      .getByTestId("shopping-left-off-row")
      .filter({ hasText: "lemon juice" });
    await expect(lemon).toContainText("squeezed at home · by you");
    const restore = lemon.getByRole("button", {
      name: "Restore 1 cup lemon juice",
    });
    await expectHydrated(restore);
    await restore.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toMatch(/^Update shopping list: change off: Leave off lemon juice/);
    await expect(
      page.getByLabel("1 cup lemon juice", { exact: true }),
    ).toBeVisible();
    await expect(changes(page).getByTestId("shopping-change")).toHaveAttribute(
      "data-on",
      "false",
    );
  });

  test("As written shows the rows before any rule or change", async ({
    page,
  }) => {
    const items = await openWithLemonade(page);
    await addLemonChange(page, items);
    await ready(page);
    const asWritten = page
      .getByTestId("shopping-as-written")
      .getByRole("switch");
    await expectHydrated(asWritten);
    await asWritten.click();
    await expect(
      page.getByLabel("1 cup lemon juice", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("4½ cups water", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("shopping-row-changed")).toHaveCount(0);
    await expect(leftOff(page)).toHaveCount(0);
    await asWritten.click();
    await expect(
      page.getByLabel("1 cup Meyer lemon juice", { exact: true }),
    ).toBeVisible();
  });

  test("the panels and a changed row have no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    const items = await openWithLemonade(page);
    await addLemonChange(page, items);
    await ready(page);
    await leftOff(page).getByText("Left off the list (1)").click();
    await rows(page)
      .filter({ hasText: "Meyer lemon juice" })
      .getByText("2 changes")
      .click();
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations,
    ).toEqual([]);
  });

  test("the Changes panel @visual", async ({ page }) => {
    const items = await openWithLemonade(page);
    await addLemonChange(page, items);
    await ready(page);
    await expect(changes(page)).toBeVisible();
    await snapshotLocator(changes(page), "shopping-layers-changes.png");
  });
});
