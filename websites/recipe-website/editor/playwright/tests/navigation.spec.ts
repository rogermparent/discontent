import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";

const PUBLIC_ROUTES = [
  "/",
  "/recipes",
  "/search",
  "/bookmarks",
  "/featured-recipes",
];

test.describe("Navigation", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("header is present on every public route", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      const banner = page.getByRole("banner");
      await expect(banner).toBeVisible();
      // Scope to the banner: "Bookmarks" also lives in the footer now.
      await expect(
        banner.getByRole("link", { name: "Bookmarks" }),
      ).toBeVisible();
    }
  });

  test("each public route returns 200", async ({ request }) => {
    for (const route of PUBLIC_ROUTES) {
      const response = await request.get(route);
      expect.soft(response.status(), `route ${route}`).toBe(200);
    }
  });

  test("signed-out header shows Sign In and hides Sign Out", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toHaveCount(0);
  });

  test("signed-in header reveals admin affordances", async ({ page }) => {
    await page.goto("/");
    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: "New Recipe", exact: true }),
    ).toBeVisible();
  });

  test("clicking the site title returns home", async ({ page }) => {
    await page.goto("/recipes");
    await page.getByRole("banner").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/$/);
  });
});
