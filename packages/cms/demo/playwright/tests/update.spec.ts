import { test, expect } from "../support/test";

test.describe("Notes Update Operations", () => {
  test.describe("Update Operations", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("one-note");
      await page.goto("/notes/existing-note");
    });

    test("should display edit form with existing values", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await expect(
        page.getByRole("heading", { name: "Edit Note" }),
      ).toBeVisible();
      await expect(page.getByLabel("Title *")).toHaveValue("Existing Note");
      await expect(page.getByLabel(/Slug/)).toHaveValue("existing-note");
      await expect(page.getByLabel("Content")).toHaveValue(
        "This note already exists for testing updates and deletes.",
      );
      await expect(page.getByLabel(/Tags/)).toHaveValue("test");
    });

    test("should update note title", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Updated Note Title");

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Updated Note Title" }),
      ).toBeVisible();
    });

    test("should update note content", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Content").clear();
      await page.getByLabel("Content").fill("This is the updated content.");

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(
        page.getByText("This is the updated content."),
      ).toBeVisible();
    });

    test("should update note tags", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel(/Tags/).clear();
      await page.getByLabel(/Tags/).fill("new-tag, another-tag");

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(page.getByText("new-tag")).toBeVisible();
      await expect(page.getByText("another-tag")).toBeVisible();
      await expect(page.getByText("test", { exact: true })).toHaveCount(0);
    });

    test("should update note slug and redirect correctly", async ({
      page,
      request,
    }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel(/Slug/).clear();
      await page.getByLabel(/Slug/).fill("new-slug-for-note");

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(page).toHaveURL(/\/notes\/new-slug-for-note/);
      await expect(
        page.getByRole("heading", { name: "Existing Note" }),
      ).toBeVisible();

      const response = await request.get("/notes/existing-note");
      expect(response.status()).toBe(404);
    });

    test("should update all fields at once", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Completely New Title");

      await page.getByLabel(/Slug/).clear();
      await page.getByLabel(/Slug/).fill("completely-new-slug");

      await page.getByLabel("Content").clear();
      await page.getByLabel("Content").fill("Completely new content here.");

      await page.getByLabel(/Tags/).clear();
      await page.getByLabel(/Tags/).fill("alpha, beta, gamma");

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(page).toHaveURL(/\/notes\/completely-new-slug/);
      await expect(
        page.getByRole("heading", { name: "Completely New Title" }),
      ).toBeVisible();
      await expect(
        page.getByText("Completely new content here."),
      ).toBeVisible();
      await expect(page.getByText("alpha")).toBeVisible();
      await expect(page.getByText("beta")).toBeVisible();
      await expect(page.getByText("gamma")).toBeVisible();
    });

    test("should cancel edit and return to view page", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Should Not Be Saved");

      await page.getByRole("link", { name: "Cancel" }).click();

      await expect(
        page.getByRole("heading", { name: "Existing Note" }),
      ).toBeVisible();
      await expect(page.getByText("Should Not Be Saved")).toHaveCount(0);
    });

    test("should preserve date when updating without changing date field", async ({
      page,
    }) => {
      const originalDate = await page
        .getByText(/\d{1,2}\/\d{1,2}\/\d{4}/)
        .first()
        .textContent();

      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Updated but same date");

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(page.getByText(originalDate ?? "")).toBeVisible();
    });

    test("should update note date", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel(/Date/).clear();
      await page.getByLabel(/Date/).fill("2024-03-20T14:45");

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(page.getByText(/3\/20\/2024|20\/03\/2024/)).toBeVisible();
    });

    test("should clear tags when tags field is emptied", async ({ page }) => {
      await page.getByRole("link", { name: "Edit" }).click();

      await page.getByLabel(/Tags/).clear();

      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(
        page.locator('[style*="background-color: rgb(240, 240, 240)"]'),
      ).toHaveCount(0);
    });

    test("should show 404 for editing non-existent note", async ({
      request,
    }) => {
      const response = await request.get("/notes/non-existent-note/edit");
      expect(response.status()).toBe(404);
    });
  });
});
