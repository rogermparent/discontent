import { test, expect } from "../support/test";

test.describe("Notes Create Operations", () => {
  test.describe("Create Operations", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData();
      await page.goto("/");
    });

    test("should display empty state when no notes exist", async ({ page }) => {
      await expect(
        page.getByText("No notes yet. Create your first note!"),
      ).toBeVisible();
      await expect(page.getByText("Total notes: 0")).toBeVisible();
    });

    test("should create a new note with all fields", async ({ page }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Create New Note" }),
      ).toBeVisible();

      await page.getByLabel("Title *").fill("My Test Note");
      await page.getByLabel(/Slug/).fill("my-custom-slug");
      await page
        .getByLabel("Content")
        .fill("This is the content of my test note.");
      await page.getByLabel(/Tags/).fill("tag1, tag2, tag3");

      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: "My Test Note" }),
      ).toBeVisible();
      await expect(
        page.getByText("This is the content of my test note."),
      ).toBeVisible();
      await expect(page.getByText("tag1")).toBeVisible();
      await expect(page.getByText("tag2")).toBeVisible();
      await expect(page.getByText("tag3")).toBeVisible();

      await expect(page).toHaveURL(/\/notes\/my-custom-slug/);
    });

    test("should auto-generate slug from title when slug is not provided", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();

      await page.getByLabel("Title *").fill("Auto Generated Slug Test");
      await page.getByLabel("Content").fill("Testing auto-generated slug.");

      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page).toHaveURL(/\/notes\/auto-generated-slug-test/);
      await expect(
        page.getByRole("heading", { name: "Auto Generated Slug Test" }),
      ).toBeVisible();
    });

    test("should create a note with only title (minimum required)", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();

      await page.getByLabel("Title *").fill("Minimal Note");

      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Minimal Note" }),
      ).toBeVisible();
      await expect(page.getByText("No content")).toBeVisible();
    });

    test("should show the new note in the list on homepage", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();

      await page.getByLabel("Title *").fill("Listed Note");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Listed Note" }),
      ).toBeVisible();

      await page.goto("/");
      await expect(
        page.getByRole("link", { name: "Listed Note" }),
      ).toBeVisible();
      await expect(page.getByText("Total notes: 1")).toBeVisible();
    });

    test("should handle special characters in title and content", async ({
      page,
    }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();

      await page.getByLabel("Title *").fill('Note with "quotes" & <tags>');
      await page
        .getByLabel("Content")
        .fill("Content with special chars: <>&\"'");

      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: 'Note with "quotes" & <tags>' }),
      ).toBeVisible();
      await expect(
        page.getByText("Content with special chars: <>&\"'"),
      ).toBeVisible();
    });

    test("should handle unicode characters", async ({ page }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();

      await page.getByLabel("Title *").fill("Unicode: 日本語 中文 한국어");
      await page.getByLabel("Content").fill("Emoji content: 🎉 🚀 💻");

      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Unicode: 日本語 中文 한국어" }),
      ).toBeVisible();
      await expect(page.getByText("Emoji content: 🎉 🚀 💻")).toBeVisible();
    });

    test("should cancel creation and return to homepage", async ({
      page,
      baseURL,
    }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Create New Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Cancel" }).click();

      await expect(page).toHaveURL(baseURL + "/");
    });

    test("should create a note with a custom date", async ({ page }) => {
      await page.getByRole("link", { name: "Create New Note" }).click();

      await page.getByLabel("Title *").fill("Note With Custom Date");
      await page.getByLabel("Content").fill("This note has a custom date.");
      await page.getByLabel(/Date/).fill("2023-06-15T10:30");

      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Note With Custom Date" }),
      ).toBeVisible();
      await expect(page.getByText(/6\/15\/2023|15\/06\/2023/)).toBeVisible();
    });
  });

  test.describe("Slug Handling", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData();
      await page.goto("/notes/new");
    });

    test("should handle titles with multiple spaces", async ({ page }) => {
      await page.getByLabel("Title *").fill("Title   with   multiple   spaces");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page).toHaveURL(/\/notes\/title-with-multiple-spaces/);
    });

    test("should handle titles with leading/trailing spaces", async ({
      page,
    }) => {
      await page.getByLabel("Title *").fill("  Trimmed Title  ");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page).toHaveURL(/\/notes\/trimmed-title/);
    });

    test("should handle titles with numbers", async ({ page }) => {
      await page.getByLabel("Title *").fill("Note 123 Test");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page).toHaveURL(/\/notes\/note-123-test/);
    });

    test("should handle title that is all special characters", async ({
      page,
    }) => {
      await page.getByLabel("Title *").fill("!!!###$$$");
      await page.getByLabel(/Slug/).fill("special-chars-slug");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page).toHaveURL(/\/notes\/special-chars-slug/);
    });

    test("should preserve custom slug exactly as entered", async ({ page }) => {
      await page.getByLabel("Title *").fill("My Title");
      await page.getByLabel(/Slug/).fill("MY-CUSTOM-Slug-123");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page).toHaveURL(/\/notes\/MY-CUSTOM-Slug-123/);
    });
  });

  test.describe("Content Edge Cases", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData();
      await page.goto("/notes/new");
    });

    test("should handle multiline content", async ({ page }) => {
      await page.getByLabel("Title *").fill("Multiline Note");
      await page
        .getByLabel("Content")
        .fill("Line 1\nLine 2\nLine 3\n\nParagraph 2");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page.getByText(/Line 1/)).toBeVisible();
      await expect(page.getByText(/Line 2/)).toBeVisible();
      await expect(page.getByText(/Paragraph 2/)).toBeVisible();
    });

    test("should handle content with code-like text", async ({ page }) => {
      await page.getByLabel("Title *").fill("Code Note");
      await page.getByLabel("Content").fill("function test() { return true; }");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByText("function test() { return true; }"),
      ).toBeVisible();
    });

    test("should handle content with URLs", async ({ page }) => {
      await page.getByLabel("Title *").fill("URL Note");
      await page
        .getByLabel("Content")
        .fill("Check out https://example.com for more info");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(
        page.getByText("Check out https://example.com for more info"),
      ).toBeVisible();
    });
  });

  test.describe("Tags Edge Cases", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData();
      await page.goto("/notes/new");
    });

    test("should handle tags with extra whitespace", async ({ page }) => {
      await page.getByLabel("Title *").fill("Tags Whitespace Note");
      await page.getByLabel(/Tags/).fill("  tag1  ,  tag2  ,  tag3  ");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page.getByText("tag1")).toBeVisible();
      await expect(page.getByText("tag2")).toBeVisible();
      await expect(page.getByText("tag3")).toBeVisible();
    });

    test("should handle many tags", async ({ page }) => {
      await page.getByLabel("Title *").fill("Many Tags Note");
      const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i + 1}`).join(
        ", ",
      );
      await page.getByLabel(/Tags/).fill(manyTags);
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page.getByText("tag1", { exact: true })).toBeVisible();
      await expect(page.getByText("tag20", { exact: true })).toBeVisible();
    });

    test("should ignore empty tags from double commas", async ({ page }) => {
      await page.getByLabel("Title *").fill("Empty Tags Note");
      await page.getByLabel(/Tags/).fill("tag1,,tag2,,,tag3");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page.getByText("tag1")).toBeVisible();
      await expect(page.getByText("tag2")).toBeVisible();
      await expect(page.getByText("tag3")).toBeVisible();
    });

    test("should handle tags with hyphens and underscores", async ({
      page,
    }) => {
      await page.getByLabel("Title *").fill("Punctuated Tags Note");
      await page
        .getByLabel(/Tags/)
        .fill("tag-with-hyphens, tag_with_underscores");
      await page.getByRole("button", { name: "Create Note" }).click();

      await expect(page.getByText("tag-with-hyphens")).toBeVisible();
      await expect(page.getByText("tag_with_underscores")).toBeVisible();
    });
  });

  test.describe("Rapid Operations", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData();
    });

    test("should handle creating multiple notes in sequence", async ({
      page,
    }) => {
      for (let i = 1; i <= 3; i++) {
        await page.goto("/notes/new");
        await page.getByLabel("Title *").fill(`Rapid Note ${i}`);
        await page.getByRole("button", { name: "Create Note" }).click();
        await expect(
          page.getByRole("heading", { name: `Rapid Note ${i}` }),
        ).toBeVisible();
      }

      await page.goto("/");
      await expect(page.getByText("Total notes: 3")).toBeVisible();
    });

    test("should handle create then immediate edit", async ({ page }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Quick Create");
      await page.getByRole("button", { name: "Create Note" }).click();

      await page.getByRole("link", { name: "Edit" }).click();
      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Quick Edit");
      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(
        page.getByRole("heading", { name: "Quick Edit" }),
      ).toBeVisible();
    });

    test("should handle create then immediate delete", async ({ page }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Quick Delete");
      await page.getByRole("button", { name: "Create Note" }).click();

      await page.getByRole("link", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();

      await expect(
        page.getByText("No notes yet. Create your first note!"),
      ).toBeVisible();
    });
  });
});
