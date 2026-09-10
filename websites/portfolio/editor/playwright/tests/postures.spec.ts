import { test, expect } from "../support/test";

/*
 * The three postures.
 *
 * The guarantee worth testing is not that each one looks a certain way — it is
 * that they are the *same site*: same corpus, same search, same accessible
 * affordances, in a different arrangement. A posture that silently dropped the
 * filter, or showed a different set of works, would be a fork wearing a config
 * flag.
 *
 * SITE_LAYOUT is read at build/boot time, so these drive the default and assert
 * the switch itself rather than restarting the server per posture; PR 13's sweep
 * covers the rendered matrix.
 */
test.describe("Postures", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("projects");
  });

  test("the default posture is Index", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toHaveAttribute("data-posture", "index");
  });

  test("every posture keeps the filter and the live count", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByLabel("Filter works")).toBeVisible();

    const count = page.getByText(/works ·/);
    await expect(count).toHaveAttribute("aria-live", "polite");

    // Same promise in all three: the shell owns these rather than each posture
    // carrying its own copy, which is how two of them would drift.
    await page.getByLabel("Filter works").fill("recipe");
    await expect(page.getByText(/^1 work/)).toBeVisible();
  });

  test("the index posture shows the year rail", async ({ page }) => {
    await page.goto("/");
    const years = page.getByTestId("project-date");
    await expect(years.first()).toHaveText(/^\d{4}$/);
    await expect(years).toHaveCount(5);
  });

  test("works link to their case study in every posture", async ({ page }) => {
    await page.goto("/");
    const rows = page.getByTestId("project-index").getByRole("link");
    await expect(rows.first()).toHaveAttribute("href", /^\/project\//);
  });
});
