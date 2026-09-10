import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";

test.describe("Loading and Error States", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("auth-gated routes redirect signed-out visitors to sign-in", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("button", {
        name: "Sign in with Credentials",
        exact: true,
      }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("new-recipe form keeps user on form when submitted with an empty name", async ({
    page,
  }) => {
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await expect(page.getByLabel("Name").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page).toHaveURL(/\/new-recipe/);
  });

  test("renders gracefully when a recipe API call returns 500", async ({
    page,
  }) => {
    await page.route("**/api/**", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "boom" }),
      });
    });

    await page.goto("/");
    await expect(page).not.toHaveTitle(/^$/);
  });
});
