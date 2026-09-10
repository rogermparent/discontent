import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";

test.describe("Sign In", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData();
  });

  test("signs in successfully with valid credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await fillSignInForm(page);

    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("rejects an unknown email", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await fillSignInForm(page, {
      email: "nobody@example.com",
      password: "password",
    });

    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toHaveCount(0);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();
  });

  test("rejects the wrong password", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await fillSignInForm(page, {
      email: "admin@nextmail.com",
      password: "wrong-password",
    });

    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toHaveCount(0);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();
  });

  test("signs out after a successful session", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await fillSignInForm(page);

    const signOut = page.getByRole("button", {
      name: "Sign Out",
      exact: true,
    });
    await expect(signOut).toBeVisible({ timeout: 10_000 });
    await signOut.click();

    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();
  });
});
