import { test, expect } from "../support/test";

test.describe("Resume Delete Operations", () => {
  test.describe("Delete Operations", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("one-resume");
    });

    test("should delete resume and redirect to homepage", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/resume/acme-corp-engineer");
      await page.getByRole("button", { name: "Delete" }).click();

      await expect(page).toHaveURL(baseURL + "/");
    });

    test("should show empty state after deleting the only resume", async ({
      page,
    }) => {
      await page.goto("/resume/acme-corp-engineer");
      await page.getByRole("button", { name: "Delete" }).click();

      await expect(page.getByText("There are no resumes yet.")).toBeVisible();
    });

    test("should not show deleted resume on homepage", async ({ page }) => {
      await page.goto("/resume/acme-corp-engineer");
      await page.getByRole("button", { name: "Delete" }).click();

      await expect(page.getByText("Acme Corp")).toHaveCount(0);
    });

    test("should return 404 after deleting resume", async ({
      page,
      baseURL,
      request,
    }) => {
      await page.goto("/resume/acme-corp-engineer");
      await page.getByRole("button", { name: "Delete" }).click();

      await expect(page).toHaveURL(baseURL + "/");

      const response = await request.get("/resume/acme-corp-engineer");
      expect(response.status()).toBe(404);
    });
  });
});
