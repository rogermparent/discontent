import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { snapshotLocator } from "../support/visual";

/*
 * 50d: saved shopping lists, against the `shopping` fixture (Buttermilk
 * Pancakes, the Lemonade, and the meal plan "Week of Oct 19" with the
 * nested "Weeknight Dinners"). The main list is the list there always was;
 * a new list is its own address (`/shopping?list=<id>`), the switcher in
 * the header moves between them, a recipe's "Add to list" goes to the
 * current list (with a picker once there are two), and a meal plan's page
 * makes a list of its own and links it.
 */

const page$ = (page: Page) => page.getByTestId("shopping-page");
const switcher = (page: Page) => page.getByTestId("shopping-list-switcher");
const menu = (page: Page) => page.getByTestId("shopping-list-menu");
const list = (page: Page) => page.getByTestId("shopping-list");

interface Item {
  id: string;
  text: string;
}

interface ListSummary {
  id: string;
  name: string;
  items: number;
  plan?: string;
  archived?: true;
}

async function ready(page: Page) {
  await expect(page$(page)).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

/** Signed in, on the main list. */
async function signIn(page: Page) {
  await page.goto("/shopping");
  await fillSignInForm(page);
  await expect(
    page.getByRole("heading", { name: "Shopping list" }),
  ).toBeAttached();
  await ready(page);
}

async function mainItems(page: Page): Promise<Item[]> {
  const response = await page.request.get("/api/shopping");
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { items: Item[] }).items;
}

async function itemsOn(page: Page, id: string): Promise<Item[]> {
  const response = await page.request.get(
    `/api/shopping?list=${encodeURIComponent(id)}`,
  );
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { items: Item[] }).items;
}

async function lists(page: Page, all = false): Promise<ListSummary[]> {
  const response = await page.request.get(
    `/api/shopping/lists${all ? "?all=1" : ""}`,
  );
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { lists: ListSummary[] }).lists;
}

async function makeList(page: Page, name: string): Promise<string> {
  const response = await page.request.post("/api/shopping/lists", {
    data: { name },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { list: { id: string } }).list.id;
}

async function openSwitcher(page: Page) {
  await expectHydrated(switcher(page));
  await switcher(page).click();
  await expect(menu(page)).toBeVisible();
}

/** The recipe page, hydrated, its "Add to list" in reach. */
async function openRecipe(page: Page, slug: string) {
  await page.goto(`/recipe/${slug}`);
  const add = page.getByRole("button", { name: /^Add (×\S+ )?to list$/ });
  await expectHydrated(add);
  return add;
}

test.describe("Shopping list: saved lists", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData("shopping");
    await initializeContentGit();
  });

  test("a new list, switched to, takes a recipe and leaves the main list as it was", async ({
    page,
    getContentGitLog,
  }) => {
    await signIn(page);
    expect(
      (
        await page.request.post("/api/shopping", {
          data: { recipe: "lemonade" },
        })
      ).ok(),
    ).toBe(true);
    const before = await mainItems(page);
    await page.reload();
    await ready(page);
    await expect(switcher(page)).toHaveText(/Main list/);

    /* New list: named, one commit, and the page goes there. */
    await openSwitcher(page);
    await menu(page).getByRole("button", { name: "New list" }).click();
    await menu(page).getByLabel("Name", { exact: true }).fill("Party");
    await menu(page).getByRole("button", { name: "Start the list" }).click();
    await expect(page).toHaveURL(/\/shopping\?list=[0-9a-z]{26}$/);
    const id = new URL(page.url()).searchParams.get("list")!;
    await ready(page);
    await expect(switcher(page)).toHaveText(/Party/);
    await expect(list(page)).toContainText("The list is empty.");
    expect((await getContentGitLog())[0]).toBe("New shopping list: Party");

    /* The recipe page adds to the current list: Party, the one used last. */
    const add = await openRecipe(page, "buttermilk-pancakes");
    await expect(page.getByTestId("shopping-add-list")).toHaveValue(id);
    await add.click();
    await expect(page.getByTestId("shopping-add-result")).toContainText(
      'added to "Party".',
    );
    expect((await getContentGitLog())[0]).toMatch(
      /^Update shopping list "Party": \+Buttermilk Pancakes/,
    );
    await page.getByRole("link", { name: "Open the list" }).click();
    await expect(page).toHaveURL(`/shopping?list=${id}`);
    await ready(page);
    await expect(list(page)).toContainText("buttermilk");
    expect((await itemsOn(page, id)).length).toBeGreaterThan(0);
    /* The main list: untouched. */
    expect(await mainItems(page)).toEqual(before);

    /* Back to the main list through the switcher; it lists both. */
    await openSwitcher(page);
    const choices = menu(page).getByTestId("shopping-list-choice");
    await expect(choices).toHaveCount(2);
    await expect(choices.nth(0)).toContainText("Main list");
    await expect(choices.nth(1)).toHaveAttribute("aria-current", "page");
    await choices.nth(0).click();
    await expect(page).toHaveURL("/shopping?list=main");
    await ready(page);
    await expect(list(page)).toContainText("lemon juice");
    await expect(list(page)).not.toContainText("buttermilk");

    /* A plain /shopping opens the list this browser used last. */
    await page.goto(`/shopping?list=${id}`);
    await ready(page);
    await page.goto("/shopping");
    await expect(page).toHaveURL(`/shopping?list=${id}`);
  });

  test("a meal plan makes a list of its own, linked on its page", async ({
    page,
    getContentGitLog,
  }) => {
    await signIn(page);
    await page.goto("/group/week-of-oct-19");
    const make = page.getByTestId("plan-make-shopping-list");
    await expectHydrated(make);
    await make.click();
    const link = page
      .getByTestId("plan-shopping-list")
      .getByRole("link", { name: "Week of Oct 19" });
    await expect(link).toBeVisible();
    await expect(page.getByTestId("plan-shopping-list")).toContainText(
      "(12 lines)",
    );
    expect((await getContentGitLog())[0]).toBe(
      "New shopping list: Week of Oct 19 (+Week of Oct 19 (12 items))",
    );
    /* The plan's summary is about its own list now. */
    await expect(page.getByTestId("plan-shopping-summary")).toContainText(
      "This plan is on “Week of Oct 19”",
    );
    await expect(make).toHaveCount(0);

    await link.click();
    await expect(page).toHaveURL(/\/shopping\?list=[0-9a-z]{26}$/);
    await ready(page);
    await expect(switcher(page)).toHaveText(/Week of Oct 19/);
    await expect(page.getByLabel("10 eggs", { exact: true })).toBeVisible();
    expect(await mainItems(page)).toEqual([]);
    const [, made] = await lists(page);
    expect(made).toMatchObject({
      name: "Week of Oct 19",
      plan: "week-of-oct-19",
      items: 12,
    });

    /* And from the switcher: "New from a meal plan…". */
    await openSwitcher(page);
    await menu(page)
      .getByRole("button", { name: "New from a meal plan…" })
      .click();
    await menu(page)
      .getByLabel("Meal plan", { exact: true })
      .selectOption("weeknight-dinners");
    await menu(page).getByRole("button", { name: "Make the list" }).click();
    await expect(page).not.toHaveURL(`/shopping?list=${made.id}`);
    await ready(page);
    await expect(switcher(page)).toHaveText(/Weeknight Dinners/);
    await expect(page.getByLabel("6 eggs", { exact: true })).toBeVisible();
    expect((await getContentGitLog())[0]).toBe(
      "New shopping list: Weeknight Dinners (+Weeknight Dinners (7 items))",
    );
  });

  test("rename and delete a list, and bring it back", async ({
    page,
    getContentGitLog,
  }) => {
    await signIn(page);
    const id = await makeList(page, "Party");
    await page.goto(`/shopping?list=${id}`);
    await ready(page);

    await openSwitcher(page);
    await menu(page).getByRole("button", { name: "Rename" }).click();
    const name = menu(page).getByLabel("Name", { exact: true });
    await expect(name).toHaveValue("Party");
    await name.fill("Birthday");
    await menu(page).getByRole("button", { name: "Rename" }).click();
    await expect(switcher(page)).toHaveText(/Birthday/);
    expect((await getContentGitLog())[0]).toBe(
      "Rename shopping list: Party → Birthday",
    );

    await openSwitcher(page);
    await menu(page).getByRole("button", { name: "Delete" }).click();
    await expect(menu(page)).toContainText("Delete Birthday?");
    await menu(page).getByRole("button", { name: "Delete the list" }).click();
    await expect(page).toHaveURL("/shopping?list=main");
    await ready(page);
    expect((await getContentGitLog())[0]).toBe(
      "Delete shopping list: Birthday (0 items kept)",
    );
    await openSwitcher(page);
    await expect(menu(page).getByTestId("shopping-list-choice")).toHaveCount(1);
    /* The main list is neither renamed nor deleted. */
    await expect(
      menu(page).getByRole("button", { name: "Delete" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect((await lists(page, true)).map((each) => each.archived)).toEqual([
      undefined,
      true,
    ]);

    /* Its address still opens it, deleted, with Restore. */
    await page.goto(`/shopping?list=${id}`);
    await ready(page);
    const deleted = page.getByTestId("shopping-list-deleted");
    await expect(deleted).toContainText("This list is deleted.");
    await deleted.getByRole("button", { name: "Restore it" }).click();
    await expect(deleted).toHaveCount(0);
    expect((await getContentGitLog())[0]).toBe(
      "Restore shopping list: Birthday",
    );
  });

  test("with two lists, Add to list picks one, or a new one", async ({
    page,
  }) => {
    await signIn(page);
    const id = await makeList(page, "Party");

    const add = await openRecipe(page, "buttermilk-pancakes");
    const picker = page.getByTestId("shopping-add-list");
    /* The current list first: the main list, until another is used. */
    await expect(picker.locator("option")).toHaveText([
      "Main list",
      "Party",
      "New list…",
    ]);
    await expect(picker).toHaveValue("main");
    await picker.selectOption(id);
    await add.click();
    await expect(page.getByTestId("shopping-add-result")).toContainText(
      'added to "Party".',
    );
    expect((await itemsOn(page, id)).length).toBeGreaterThan(0);
    expect(await mainItems(page)).toEqual([]);
    /* Picked once, it is the current list. */
    await expect(picker).toHaveValue(id);
    await expect(picker.locator("option").first()).toHaveText("Party");

    await picker.selectOption({ label: "New list…" });
    await page.getByLabel("New list’s name", { exact: true }).fill("Picnic");
    await add.click();
    await expect(page.getByTestId("shopping-add-result")).toContainText(
      'added to "Picnic".',
    );
    const after = await lists(page);
    expect(after.map((each) => each.name)).toEqual([
      "Main list",
      "Picnic",
      "Party",
    ]);
    expect(after[1].items).toBeGreaterThan(0);

    /* A plan page's add has the same picker. */
    await page.goto("/group/weeknight-dinners");
    const planAdd = page.getByTestId("add-group-to-shopping");
    await expect(planAdd).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
    await expect(planAdd.getByTestId("shopping-add-list")).toHaveValue(
      after[1].id,
    );
  });

  test("the switcher has no WCAG 2.2 AA violations, and Shop says which list", async ({
    page,
  }) => {
    await signIn(page);
    const id = await makeList(page, "Party");
    await page.goto(`/shopping?list=${id}`);
    await ready(page);
    await openSwitcher(page);
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations,
    ).toEqual([]);
    await menu(page).getByRole("button", { name: "New list" }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");

    await page
      .getByTestId("shopping-mode")
      .getByRole("button", { name: "Shop" })
      .click();
    await expect(page.getByTestId("shopping-shop-list")).toHaveText(
      "List: Party",
    );
  });

  test("the switcher's menu @visual", async ({ page }) => {
    await signIn(page);
    const id = await makeList(page, "Thanksgiving");
    expect(
      (
        await page.request.post(
          `/api/shopping?list=${encodeURIComponent(id)}`,
          { data: { recipe: "lemonade" } },
        )
      ).ok(),
    ).toBe(true);
    await page.goto(`/shopping?list=${id}`);
    await ready(page);
    await openSwitcher(page);
    await snapshotLocator(menu(page), "shopping-lists-menu.png");
  });
});
