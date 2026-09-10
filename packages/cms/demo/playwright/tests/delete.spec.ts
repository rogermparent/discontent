import { test, expect } from "../support/test";
import { checkNoteTitlesInOrder } from "../support/helpers";

test.describe("Notes Delete Operations", () => {
  test.describe("Delete Operations", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("three-notes");
    });

    test("should show delete confirmation page", async ({ page }) => {
      await page.goto("/notes/first-note");
      await page.getByRole("link", { name: "Delete" }).click();

      await expect(
        page.getByRole("heading", { name: "Delete Note" }),
      ).toBeVisible();
      await expect(
        page.getByText("Are you sure you want to delete this note?"),
      ).toBeVisible();
      await expect(page.getByText("First Note")).toBeVisible();
    });

    test("should delete note and redirect to homepage", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/notes/second-note");
      await page.getByRole("link", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();

      await expect(page).toHaveURL(baseURL + "/");
      await expect(page.getByText("Total notes: 2")).toBeVisible();
      await expect(page.getByRole("link", { name: "Second Note" })).toHaveCount(
        0,
      );
    });

    test("should cancel delete and return to view page", async ({ page }) => {
      await page.goto("/notes/first-note");
      await page.getByRole("link", { name: "Delete" }).click();
      await page.getByRole("link", { name: "Cancel" }).click();

      await expect(page).toHaveURL(/\/notes\/first-note/);
      await expect(
        page.getByRole("heading", { name: "First Note" }),
      ).toBeVisible();
    });

    test("should remove note from index after deletion", async ({
      page,
      request,
    }) => {
      await page.goto("/notes/third-note");
      await page.getByRole("link", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();

      await checkNoteTitlesInOrder(page, ["Second Note", "First Note"]);

      const response = await request.get("/notes/third-note");
      expect(response.status()).toBe(404);
    });

    test("should delete all notes one by one", async ({ page }) => {
      await page.goto("/notes/first-note/delete");
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();
      await expect(page.getByText("Total notes: 2")).toBeVisible();

      await page.goto("/notes/second-note/delete");
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();
      await expect(page.getByText("Total notes: 1")).toBeVisible();

      await page.goto("/notes/third-note/delete");
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();

      await expect(
        page.getByText("No notes yet. Create your first note!"),
      ).toBeVisible();
      await expect(page.getByText("Total notes: 0")).toBeVisible();
    });

    test("should show 404 for deleting non-existent note", async ({
      request,
    }) => {
      const response = await request.get("/notes/non-existent-note/delete");
      expect(response.status()).toBe(404);
    });
  });
});
