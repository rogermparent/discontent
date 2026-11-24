import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { snapshotLocator } from "../support/visual";

/*
 * 49a: "Same thing, different names" on `/shopping`, against the `shopping`
 * fixture. Buttermilk Pancakes writes "2 cups all-purpose flour"; each test
 * makes Crêpes, which writes "1 cup white flour" — Roger's example — and
 * puts both on the list. The curated table proposes them as one row,
 * "3 cups all-purpose flour"; Merge, Edit and Keep apart answer it, and
 * Split takes a merge back.
 */

const page$ = (page: Page) => page.getByTestId("shopping-page");
/* 50c: the proposals are the walkthrough's built-in cards now. */
const panel = (page: Page) => page.getByTestId("shopping-walkthrough");
const proposal = (page: Page) => page.getByTestId("shopping-proposal");
const rows = (page: Page) => page.getByTestId("shopping-row");

async function makeCrepes(request: APIRequestContext, token: string) {
  const created = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Crêpes",
      slug: "crepes",
      ingredients: ["1 cup white flour", "2 eggs", "1 1/4 cups milk"],
    },
  });
  expect(created.status()).toBe(201);
}

/** Signed in, both recipes on the list, on `/shopping` and hydrated. */
async function openWithFlour(page: Page) {
  await page.goto("/shopping");
  await fillSignInForm(page);
  await expect(
    page.getByRole("heading", { name: "Shopping list" }),
  ).toBeAttached();
  for (const recipe of ["buttermilk-pancakes", "crepes"]) {
    const added = await page.request.post("/api/shopping", {
      data: { recipe },
    });
    expect(added.ok()).toBe(true);
  }
  await page.reload();
  await expect(page$(page)).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

function flourRows(page: Page) {
  return rows(page).filter({ hasText: /flour/ });
}

test.describe("Shopping list: same thing, different names", () => {
  test.beforeEach(
    async ({ resetData, initializeContentGit, request, createApiToken }) => {
      await resetData("shopping");
      await initializeContentGit();
      await makeCrepes(request, await createApiToken());
    },
  );

  test("proposes the two flours, Merge makes one row, Split takes it back", async ({
    page,
    getContentGitLog,
  }) => {
    await openWithFlour(page);
    await expect(page$(page)).toHaveAttribute("data-mode", "plan");
    await expect(panel(page).getByTestId("shopping-card-title")).toHaveText(
      "Same thing, different names: all-purpose flour",
    );
    const card = proposal(page);
    await expect(card).toHaveCount(1);
    await expect(
      card
        .getByRole("list", { name: "Lines for all-purpose flour" })
        .getByRole("listitem"),
    ).toHaveText([
      /^2 cups all-purpose flour · Buttermilk Pancakes$/,
      /^1 cup white flour · Crêpes$/,
    ]);
    /* "→" is shown; a screen reader hears "As one row:". */
    await expect(card).toContainText("As one row: 3 cups all-purpose flour");
    await expect(card).toContainText("Both are all-purpose flour");
    await expect(flourRows(page)).toHaveCount(2);

    const merge = card.getByRole("button", {
      name: "Accept: merge into 3 cups all-purpose flour",
    });
    await expectHydrated(merge);
    await merge.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: merge all purpose flour + white flour");
    await expect(
      panel(page).getByTestId("shopping-walkthrough-status"),
    ).toContainText("Merged into one row: 3 cups all-purpose flour.");
    /* Focus is not lost with the button: it is on the done state's heading. */
    await expect(
      panel(page).getByTestId("shopping-walkthrough-done").getByRole("heading"),
    ).toBeFocused();
    await expect(proposal(page)).toHaveCount(0);

    await expect(flourRows(page)).toHaveCount(1);
    const row = flourRows(page);
    await expect(
      page.getByLabel("3 cups all-purpose flour", { exact: true }),
    ).toBeVisible();
    await expect(row.getByTestId("shopping-merged-from")).toContainText(
      "merged from: 2 cups all-purpose flour (Buttermilk Pancakes) · 1 cup white flour (Crêpes)",
    );

    /* A rule: it holds after a reload. */
    await page.reload();
    await expect(page$(page)).toHaveAttribute("data-ready", "true");
    await expect(proposal(page)).toHaveCount(0);
    await expect(flourRows(page)).toHaveCount(1);

    const split = flourRows(page).getByRole("button", {
      name: "Split all-purpose flour back into its lines",
    });
    await expectHydrated(split);
    await split.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: split all purpose flour + white flour");
    await expect(flourRows(page)).toHaveCount(2);
    await expect(
      page.getByLabel("1 cup white flour", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("shopping-split-status")).toHaveText(
      "Split back into its own lines: all purpose flour, white flour.",
    );
    /* Focus goes to the first of the rows it became, not to the page. */
    await expect(
      page.getByLabel("2 cups all purpose flour", { exact: true }),
    ).toBeFocused();
    await expect(proposal(page)).toHaveCount(1);
  });

  test("Edit changes the name and the amount before merging", async ({
    page,
    getContentGitLog,
  }) => {
    await openWithFlour(page);
    const card = proposal(page);
    const edit = card.getByRole("button", { name: /^Edit/ });
    await expectHydrated(edit);
    await edit.click();
    const name = card.getByLabel("Name", { exact: true });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("all-purpose flour");
    await expect(card.getByLabel("Amount", { exact: true })).toHaveValue(
      "3 cups",
    );
    await name.fill("King Arthur flour");
    await card.getByLabel("Amount", { exact: true }).fill("1 bag");
    await card.getByRole("button", { name: /^Accept as edited/ }).click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe(
        "Update shopping list: merge all purpose flour + white flour → King Arthur flour",
      );
    await expect(
      page.getByLabel("1 bag King Arthur flour", { exact: true }),
    ).toBeVisible();
    await expect(flourRows(page)).toHaveCount(1);

    /* A third line of flour: the amount was for the old list. */
    const added = await page.request.post("/api/shopping", {
      data: { items: ["1 cup AP flour"] },
    });
    expect(added.ok()).toBe(true);
    await page.reload();
    await expect(page$(page)).toHaveAttribute("data-ready", "true");
    const row = flourRows(page);
    await expect(row).toHaveCount(1);
    await expect(
      page.getByLabel("4 cups King Arthur flour", { exact: true }),
    ).toBeVisible();
    await expect(row.getByTestId("shopping-row-note")).toHaveText(
      "your amount was for the old list",
    );
  });

  test("Keep apart hides the proposal for good", async ({
    page,
    getContentGitLog,
  }) => {
    await openWithFlour(page);
    const keep = proposal(page).getByRole("button", { name: "Keep apart" });
    await expectHydrated(keep);
    await keep.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: keep apart all purpose flour + white flour");
    await expect(proposal(page)).toHaveCount(0);
    await expect(flourRows(page)).toHaveCount(2);
    await page.reload();
    await expect(page$(page)).toHaveAttribute("data-ready", "true");
    await expect(panel(page)).toHaveCount(0);
    await expect(flourRows(page)).toHaveCount(2);
  });

  test("the panel and a merged row have no WCAG 2.2 AA violations", async ({
    page,
  }) => {
    await openWithFlour(page);
    await expect(proposal(page)).toHaveCount(1);
    const edit = proposal(page).getByRole("button", { name: /^Edit/ });
    await expectHydrated(edit);
    await edit.click();
    await expect(
      proposal(page).getByLabel("Name", { exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations,
    ).toEqual([]);
    await proposal(page)
      .getByRole("button", { name: /^Accept as edited/ })
      .click();
    await expect(flourRows(page)).toHaveCount(1);
    expect(
      (await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations,
    ).toEqual([]);
  });

  test("the proposal @visual", async ({ page }) => {
    await openWithFlour(page);
    await expect(proposal(page)).toHaveCount(1);
    await snapshotLocator(panel(page), "shopping-merge-proposal.png");
  });
});

test.describe("Shopping list: same thing, different names @mobile", () => {
  test.beforeEach(
    async ({ resetData, initializeContentGit, request, createApiToken }) => {
      await resetData("shopping");
      await initializeContentGit();
      await makeCrepes(request, await createApiToken());
    },
  );

  test("Shop shows a quiet line to Plan, where the proposal is answered; the merged row is one in Shop", async ({
    page,
    getContentGitLog,
  }) => {
    await openWithFlour(page);
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
    const line = page.getByTestId("shopping-proposals-line");
    await expect(line).toContainText(
      "1 line looks like another under a different name.",
    );
    await expect(flourRows(page)).toHaveCount(2);
    const review = line.getByRole("button", { name: "Review in Plan" });
    await expectHydrated(review);
    await review.click();
    await expect(page$(page)).toHaveAttribute("data-mode", "plan");

    const merge = proposal(page).getByRole("button", { name: /^Accept/ });
    await expect(merge).toBeVisible();
    await merge.click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: merge all purpose flour + white flour");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);

    await page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Shop" })
      .click();
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
    await expect(page.getByTestId("shopping-proposals-line")).toHaveCount(0);
    await expect(flourRows(page)).toHaveCount(1);
    await expect(
      page.getByLabel("3 cups all-purpose flour", { exact: true }),
    ).toBeVisible();
    /* In the store a merged row is a line like any other. */
    await expect(page.getByTestId("shopping-merged-from")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});
