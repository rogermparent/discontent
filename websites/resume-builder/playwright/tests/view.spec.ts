import { test, expect } from "../support/test";

test.describe("Resume View Operations", () => {
  test.describe("View Operations", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-resume");
      await page.goto("/resume/acme-corp-engineer");
    });

    test("should display job title and company", async ({ page }) => {
      await expect(page.getByText("Software Engineer")).toBeVisible();
      await expect(page.getByText("Acme Corp")).toBeVisible();
    });

    test("should display contact info fields", async ({ page }) => {
      await expect(page.getByText("Jane Doe")).toBeVisible();
      await expect(page.getByText("jane@example.com")).toBeVisible();
      await expect(page.getByText("555-1234")).toBeVisible();
      await expect(page.getByText("123 Main St")).toBeVisible();
      await expect(page.getByText(/github\.com\/janedoe/)).toBeVisible();
      await expect(page.getByText(/linkedin\.com\/in\/janedoe/)).toBeVisible();
      await expect(page.getByText("janedoe.dev")).toBeVisible();
    });

    test("should show Edit and Copy links", async ({ page }) => {
      await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Copy" })).toBeVisible();
    });

    test("should show Delete button", async ({ page }) => {
      await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
    });

    test("should navigate to edit page", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();
      await expect(page).toHaveURL(/\/resume\/acme-corp-engineer\/edit/);
    });

    test("should navigate to copy page", async ({ page }) => {
      await page.getByRole("link", { name: "Copy" }).click();
      await expect(page).toHaveURL(/\/resume\/acme-corp-engineer\/copy/);
    });
  });

  test.describe("404 Handling", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("one-resume");
    });

    test("should return 404 for non-existent slug", async ({ request }) => {
      const response = await request.get("/resume/non-existent-slug");
      expect(response.status()).toBe(404);
    });
  });
});
