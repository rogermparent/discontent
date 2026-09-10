import { test, expect } from "../support/test";

test.describe("Resume Update Operations", () => {
  test.describe("Update Operations", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-resume");
      await page.goto("/resume/acme-corp-engineer");
    });

    test("should display edit form pre-populated with company and job", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await expect(page.getByLabel("Company")).toHaveValue("Acme Corp");
      await expect(page.getByLabel("Job")).toHaveValue("Software Engineer");
    });

    test("should display edit form with slug pre-populated", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await expect(page.getByLabel("Slug")).toHaveValue("acme-corp-engineer");
    });

    test("should update company field", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Company").clear();
      await page.getByLabel("Company").fill("New Company");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page.getByText("New Company")).toBeVisible();
    });

    test("should update job field", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Job").clear();
      await page.getByLabel("Job").fill("Senior Engineer");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page.getByText("Senior Engineer")).toBeVisible();
    });

    test("should update applicant fields", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByText("Applicant").click();
      await page.getByLabel("Name").clear();
      await page.getByLabel("Name").fill("Updated Name");
      await page.getByLabel("Email").clear();
      await page.getByLabel("Email").fill("updated@example.com");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page.getByText("Updated Name")).toBeVisible();
      await expect(page.getByText("updated@example.com")).toBeVisible();
    });

    test("should update slug and redirect to new URL", async ({
      page,
      request,
    }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByText("Advanced").click();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("new-slug-for-resume");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page).toHaveURL(/\/resume\/new-slug-for-resume/);

      const response = await request.get("/resume/acme-corp-engineer");
      expect(response.status()).toBe(404);
    });

    test("should cancel edit and return to view page without saving", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Company").clear();
      await page.getByLabel("Company").fill("Should Not Be Saved");

      await page.getByRole("link", { name: "Cancel" }).click();

      await expect(page).toHaveURL(/\/resume\/acme-corp-engineer/);
      await expect(page.getByText("Should Not Be Saved")).toHaveCount(0);
    });

    test("should show 404 for editing non-existent resume", async ({
      request,
    }) => {
      const response = await request.get("/resume/non-existent-resume/edit");
      expect(response.status()).toBe(404);
    });
  });
});
