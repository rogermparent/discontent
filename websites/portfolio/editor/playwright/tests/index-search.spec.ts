import { test, expect } from "../support/test";

/*
 * The index and its in-place filter — the site's signature interaction.
 */
test.describe("The index", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("projects");
  });

  test("lists every work, newest first", async ({ page }) => {
    await page.goto("/");
    const rows = page.getByTestId("project-index").getByRole("link");
    await expect(rows).toHaveCount(5);

    // Reverse-chronological comes free from the LMDB key [date, slug]; if the
    // index key or `reverse` changes, this is what notices.
    await expect(rows.first()).toContainText("Content Engine");
    await expect(rows.last()).toContainText("Raspberry Pi Static Host");
  });

  test("the count line reports the corpus and its span", async ({ page }) => {
    await page.goto("/");
    const count = page.getByText(/works ·/);
    await expect(count).toContainText("5 works");
    await expect(count).toContainText("2023–2026");
  });

  test("typing filters rows in place, without a route change", async ({
    page,
  }) => {
    await page.goto("/");
    const url = page.url();

    await page.getByLabel("Filter works").fill("recipe");

    const rows = page.getByTestId("project-index").getByRole("link");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Recipe Website");
    // No results page, no modal, no navigation — that is the whole point.
    expect(page.url()).toBe(url);
  });

  test("the count line is a live region and tracks the filter", async ({
    page,
  }) => {
    await page.goto("/");
    const count = page.getByText(/works? ·|work$|works$/).first();
    await expect(count).toHaveAttribute("aria-live", "polite");

    await page.getByLabel("Filter works").fill("recipe");
    await expect(page.getByText(/^1 work/)).toBeVisible();
  });

  test("matches are highlighted in the accent", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Filter works").fill("recipe");
    const mark = page.locator("mark").first();
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText(/recipe/i);
  });

  test("search matches tags, not just names", async ({ page }) => {
    await page.goto("/");
    // "accessibility" appears only in tags — field coverage beyond the title is
    // what makes an in-place filter usable rather than decorative.
    await page.getByLabel("Filter works").fill("accessibility");
    const rows = page.getByTestId("project-index").getByRole("link");
    await expect(rows).toHaveCount(2);
  });

  test("an empty result set says so", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Filter works").fill("zzzznotathing");
    await expect(
      page.getByTestId("project-index").getByRole("link"),
    ).toHaveCount(0);
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  });

  test("the filter survives navigating to a work and back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Filter works").fill("recipe");
    await page.getByRole("link", { name: /Recipe Website/ }).click();
    await expect(page).toHaveURL(/\/project\/recipe-website/);

    await page.goBack();
    // sessionStorage-backed, so the reader returns to the list they left.
    await expect(page.getByLabel("Filter works")).toHaveValue("recipe");
  });

  test("a row is reachable and visible by keyboard", async ({ page }) => {
    await page.goto("/");
    const first = page.getByTestId("project-index").getByRole("link").first();
    await first.focus();
    await expect(first).toBeFocused();
  });
});

test.describe("The index without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test.beforeEach(async ({ resetData }) => {
    await resetData("projects");
  });

  test("still renders the full list server-side", async ({ page }) => {
    // The list is seeded from a server-rendered prop rather than fetched, so a
    // reader with JS off gets the complete index — only the filter is lost.
    await page.goto("/");
    await expect(
      page.getByTestId("project-index").getByRole("link"),
    ).toHaveCount(5);
    // Scoped: the plate renders the focused work's name too (aria-hidden,
    // but still matched by getByText).
    await expect(
      page.getByTestId("project-index").getByText("Content Engine"),
    ).toBeVisible();
  });
});
