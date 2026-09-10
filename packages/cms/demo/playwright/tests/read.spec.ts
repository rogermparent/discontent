import { test, expect } from "../support/test";
import { checkNoteTitlesInOrder } from "../support/helpers";

test.describe("Notes Read Operations", () => {
  test.describe("Read Operations", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("three-notes");
      await page.goto("/");
    });

    test("should display notes in reverse chronological order (newest first)", async ({
      page,
    }) => {
      await checkNoteTitlesInOrder(page, [
        "Third Note",
        "Second Note",
        "First Note",
      ]);
    });

    test("should display total count of notes", async ({ page }) => {
      await expect(page.getByText("Total notes: 3")).toBeVisible();
    });

    test("should navigate to note detail page", async ({ page }) => {
      await page.getByRole("link", { name: "Second Note" }).click();

      await expect(page).toHaveURL(/\/notes\/second-note/);
      await expect(
        page.getByRole("heading", { name: "Second Note" }),
      ).toBeVisible();
      await expect(
        page.getByText("This is the content of the second note"),
      ).toBeVisible();
      await expect(page.getByText("It has multiple paragraphs")).toBeVisible();
    });

    test("should display tags on note detail page", async ({ page }) => {
      await page.getByRole("link", { name: "First Note" }).click();

      await expect(page.getByText("important")).toBeVisible();
      await expect(page.getByText("work")).toBeVisible();
    });

    test("should display note without tags correctly", async ({ page }) => {
      await page.getByRole("link", { name: "Third Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Third Note" }),
      ).toBeVisible();
      await expect(
        page.getByText("This is the newest note without tags."),
      ).toBeVisible();
      await expect(
        page.locator('[style*="background-color: rgb(240, 240, 240)"]'),
      ).toHaveCount(0);
    });

    test("should show 404 for non-existent note", async ({ request }) => {
      const response = await request.get("/notes/non-existent-note");
      expect(response.status()).toBe(404);
    });

    test("should have Edit and Delete links on note detail page", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "First Note" }).click();

      await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Delete" })).toBeVisible();
    });

    test("should have back link to homepage", async ({ page, baseURL }) => {
      await page.getByRole("link", { name: "First Note" }).click();

      await page.getByRole("link", { name: /Back to all notes/ }).click();

      await expect(page).toHaveURL(baseURL + "/");
    });
  });

  test.describe("Date Display", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("three-notes");
    });

    test("should display dates on list page", async ({ page }) => {
      await page.goto("/");
      const items = page.getByRole("listitem");
      const count = await items.count();
      for (let i = 0; i < count; i++) {
        await expect(
          items.nth(i).getByText(/\d{1,2}\/\d{1,2}\/2023/),
        ).toBeVisible();
      }
    });

    test("should display date on detail page", async ({ page }) => {
      await page.goto("/notes/first-note");
      await expect(
        page.getByText(/\d{1,2}\/\d{1,2}\/2023/).first(),
      ).toBeVisible();
    });
  });

  test.describe("Concurrent-like Operations", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("three-notes");
    });

    test("should handle viewing different notes in sequence", async ({
      page,
    }) => {
      await page.goto("/notes/first-note");
      await expect(
        page.getByRole("heading", { name: "First Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: /Back to all notes/ }).click();
      await page.getByRole("link", { name: "Second Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Second Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: /Back to all notes/ }).click();
      await page.getByRole("link", { name: "Third Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Third Note" }),
      ).toBeVisible();
    });
  });

  test.describe("Navigation Edge Cases", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("three-notes");
    });

    test("should handle direct URL navigation to view page", async ({
      page,
    }) => {
      await page.goto("/notes/first-note");
      await expect(
        page.getByRole("heading", { name: "First Note" }),
      ).toBeVisible();
    });

    test("should handle direct URL navigation to edit page", async ({
      page,
    }) => {
      await page.goto("/notes/first-note/edit");
      await expect(
        page.getByRole("heading", { name: "Edit Note" }),
      ).toBeVisible();
      await expect(page.getByLabel("Title *")).toHaveValue("First Note");
    });

    test("should handle direct URL navigation to delete page", async ({
      page,
    }) => {
      await page.goto("/notes/first-note/delete");
      await expect(
        page.getByRole("heading", { name: "Delete Note" }),
      ).toBeVisible();
      await expect(page.getByText("First Note")).toBeVisible();
    });

    test("should handle browser back button after create", async ({
      page,
      baseURL,
    }) => {
      await page.goto("/");
      await page.getByRole("link", { name: "Create New Note" }).click();
      await page.getByLabel("Title *").fill("Back Button Test");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page).toHaveURL(/\/notes\/back-button-test/);

      await page.goBack();
      await page.goBack();

      await expect(page).toHaveURL(baseURL + "/");
    });
  });

  test.describe("Empty State Transitions", () => {
    test("should transition from empty to having notes", async ({
      page,
      resetData,
    }) => {
      await resetData();
      await page.goto("/");

      await expect(
        page.getByText("No notes yet. Create your first note!"),
      ).toBeVisible();

      await page.getByRole("link", { name: "Create New Note" }).click();
      await page.getByLabel("Title *").fill("First Ever Note");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: "First Ever Note" }),
      ).toBeVisible();

      await page.goto("/");
      await expect(page.getByText("No notes yet")).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "First Ever Note" }),
      ).toBeVisible();
    });

    test("should transition from having notes to empty", async ({
      page,
      resetData,
    }) => {
      await resetData("one-note");
      await page.goto("/");

      await expect(
        page.getByRole("link", { name: "Existing Note" }),
      ).toBeVisible();

      await page.goto("/notes/existing-note/delete");
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();

      await expect(
        page.getByText("No notes yet. Create your first note!"),
      ).toBeVisible();
    });
  });
});
