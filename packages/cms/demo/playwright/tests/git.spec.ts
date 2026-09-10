import { test, expect } from "../support/test";

test.describe("Git Integration", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData();
    await initializeContentGit();
  });

  test("should create git commit when creating a note", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/notes/new");
    await page.getByLabel("Title *").fill("Git Test Note");
    await page.getByRole("button", { name: "Create Note" }).click();

    await expect(
      page.getByRole("heading", { name: "Git Test Note" }),
    ).toBeVisible();

    const log = await getContentGitLog();
    expect(log).toContain("Create note: Git Test Note");
  });

  test("should create git commit when updating a note", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/notes/new");
    await page.getByLabel("Title *").fill("Note To Update");
    await page.getByRole("button", { name: "Create Note" }).click();

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Title *").clear();
    await page.getByLabel("Title *").fill("Updated Note");
    await page.getByRole("button", { name: "Update Note" }).click();

    await expect(
      page.getByRole("heading", { name: "Updated Note" }),
    ).toBeVisible();

    const log = await getContentGitLog();
    expect(log).toContain("Update note: Updated Note");
  });

  test("should create git commit when deleting a note", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/notes/new");
    await page.getByLabel("Title *").fill("Note To Delete");
    await page.getByRole("button", { name: "Create Note" }).click();

    await page.getByRole("link", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, Delete Note" }).click();

    await expect(page.getByText("Create New Note")).toBeVisible();

    const log = await getContentGitLog();
    expect(log).toContain("Delete note: note-to-delete");
  });

  test("should accumulate commits for multiple operations", async ({
    page,
    getContentGitLog,
  }) => {
    /*
     * Each create is awaited to its redirect before the next navigation.
     * Without that this races: `goto` can abort a server action still running,
     * and the commit is the last thing a write does — so the note appears on
     * disk while its commit never happens, and the assertions below fail with
     * a log that is missing exactly the creates.
     */
    await page.goto("/notes/new");
    await page.getByLabel("Title *").fill("First Git Note");
    await page.getByRole("button", { name: "Create Note" }).click();
    await expect(
      page.getByRole("heading", { name: "First Git Note" }),
    ).toBeVisible();

    await page.goto("/notes/new");
    await page.getByLabel("Title *").fill("Second Git Note");
    await page.getByRole("button", { name: "Create Note" }).click();
    await expect(
      page.getByRole("heading", { name: "Second Git Note" }),
    ).toBeVisible();

    await page.goto("/notes/first-git-note/edit");
    await page.getByLabel("Title *").clear();
    await page.getByLabel("Title *").fill("First Git Note Updated");
    await page.getByRole("button", { name: "Update Note" }).click();

    await expect(page.getByText(/Back to all notes/)).toBeVisible();

    const log = await getContentGitLog();
    expect(log).toContain("Create note: First Git Note");
    expect(log).toContain("Create note: Second Git Note");
    expect(log).toContain("Update note: First Git Note Updated");
  });

  test.describe("targeted commits", () => {
    test("should only commit the note's data file when creating", async ({
      page,
      getContentGitCommitFiles,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Targeted Create Note");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Targeted Create Note" }),
      ).toBeVisible();

      const commits = await getContentGitCommitFiles();
      const createCommit = commits.find((c) =>
        c.message.includes("Create note: Targeted Create Note"),
      );
      expect(createCommit).toBeDefined();
      expect(createCommit!.files).toHaveLength(1);
      expect(createCommit!.files[0]).toBe(
        "notes/data/targeted-create-note/note.json",
      );
    });

    test("should only commit the note's data file when updating without slug change", async ({
      page,
      getContentGitCommitFiles,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Targeted Update Note");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Targeted Update Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Edit" }).click();
      await page.getByLabel("Title *").clear();
      await page.getByLabel("Title *").fill("Targeted Update Note Edited");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Targeted Update Note Edited" }),
      ).toBeVisible();

      const commits = await getContentGitCommitFiles();
      const updateCommit = commits.find((c) =>
        c.message.includes("Update note: Targeted Update Note Edited"),
      );
      expect(updateCommit).toBeDefined();
      expect(updateCommit!.files).toHaveLength(1);
      expect(updateCommit!.files[0]).toBe(
        "notes/data/targeted-update-note/note.json",
      );
    });

    test("should commit old and new data dirs when updating with slug change", async ({
      page,
      getContentGitCommitFiles,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Slug Change Note");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Slug Change Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Edit" }).click();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("renamed-slug-note");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/renamed-slug-note$/);

      const commits = await getContentGitCommitFiles();
      const updateCommit = commits.find((c) =>
        c.message.includes("Update note: Slug Change Note"),
      );
      expect(updateCommit).toBeDefined();
      const files = updateCommit!.files;
      expect(files.some((f) => f.includes("slug-change-note"))).toBe(true);
      expect(files.some((f) => f.includes("renamed-slug-note"))).toBe(true);
    });

    test("should only commit the deleted note's directory when deleting", async ({
      page,
      getContentGitCommitFiles,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Targeted Delete Note");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Targeted Delete Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Delete" }).click();
      await page.getByRole("button", { name: "Yes, Delete Note" }).click();
      await expect(page.getByText("Create New Note")).toBeVisible();

      const commits = await getContentGitCommitFiles();
      const deleteCommit = commits.find((c) =>
        c.message.includes("Delete note: targeted-delete-note"),
      );
      expect(deleteCommit).toBeDefined();
      expect(deleteCommit!.files).toHaveLength(1);
      expect(deleteCommit!.files[0]).toBe(
        "notes/data/targeted-delete-note/note.json",
      );
    });

    test("should commit both renamed note and updated bookmark files on reference update", async ({
      page,
      getContentGitCommitFiles,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Ref Update Note");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Ref Update Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Bookmark" }).click();
      await page.getByLabel("Label *").fill("Ref Update Bookmark");
      await page.getByRole("button", { name: "Create Bookmark" }).click();
      await expect(
        page.getByRole("heading", { name: "Ref Update Bookmark" }),
      ).toBeVisible();

      await page.goto("/notes/ref-update-note/edit");
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("ref-note-renamed");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/ref-note-renamed$/);

      const commits = await getContentGitCommitFiles();
      const updateCommit = commits.find((c) =>
        c.message.includes("Update note: Ref Update Note"),
      );
      expect(updateCommit).toBeDefined();
      const files = updateCommit!.files;
      expect(files.some((f) => f.includes("ref-note-renamed"))).toBe(true);
      expect(files.some((f) => f.includes("bookmarks/data/"))).toBe(true);
    });
  });

  test.describe("reference updates", () => {
    test("should update bookmark reference when note slug changes", async ({
      page,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Note To Bookmark");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Note To Bookmark" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Bookmark" }).click();
      await page.getByLabel("Label *").fill("My Bookmark");
      await page.getByRole("button", { name: "Create Bookmark" }).click();

      await expect(
        page.getByRole("heading", { name: "My Bookmark" }),
      ).toBeVisible();
      await expect(
        page.getByText("References note:").locator("xpath=ancestor::*[1]"),
      ).toContainText("note-to-bookmark");

      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Bookmarks" }),
      ).toBeVisible();
      await expect(page.getByText("My Bookmark")).toBeVisible();
      await expect(
        page.getByText("References: note-to-bookmark"),
      ).toBeVisible();

      await page.goto("/notes/note-to-bookmark/edit");
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("renamed-note");
      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(page).toHaveURL(/\/notes\/renamed-note$/);
      await expect(
        page.getByRole("heading", { name: "Note To Bookmark" }),
      ).toBeVisible();

      await page.goto("/");
      await expect(page.getByText("My Bookmark")).toBeVisible();
      await expect(page.getByText("References: renamed-note")).toBeVisible();

      await page.getByText("My Bookmark").click();
      await expect(
        page.getByRole("heading", { name: "My Bookmark" }),
      ).toBeVisible();
      await expect(
        page.getByText("References note:").locator("xpath=ancestor::*[1]"),
      ).toContainText("renamed-note");
      await page.getByRole("link", { name: /View Note:/ }).click();
      await expect(page).toHaveURL(/\/notes\/renamed-note$/);
    });

    test("should update multiple bookmarks when note slug changes", async ({
      page,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Multi Bookmark Note");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "Multi Bookmark Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Bookmark" }).click();
      await page.getByLabel("Label *").fill("First Bookmark");
      await page.getByRole("button", { name: "Create Bookmark" }).click();
      await expect(
        page.getByRole("heading", { name: "First Bookmark" }),
      ).toBeVisible();

      await page.goto("/notes/multi-bookmark-note");
      await expect(
        page.getByRole("heading", { name: "Multi Bookmark Note" }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Bookmark" }).click();
      await page.getByLabel("Label *").fill("Second Bookmark");
      await page.getByRole("button", { name: "Create Bookmark" }).click();
      await expect(
        page.getByRole("heading", { name: "Second Bookmark" }),
      ).toBeVisible();

      await page.goto("/notes/multi-bookmark-note/edit");
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("new-slug");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/new-slug$/);

      await page.goto("/");
      await expect(
        page.getByText("First Bookmark").locator("xpath=ancestor::*[1]"),
      ).toContainText("References: new-slug");
      await expect(
        page.getByText("Second Bookmark").locator("xpath=ancestor::*[1]"),
      ).toContainText("References: new-slug");
    });

    test("should not affect bookmarks for other notes", async ({ page }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Note A");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(page.getByRole("heading", { name: "Note A" })).toBeVisible();
      await page.getByRole("link", { name: "Bookmark" }).click();
      await page.getByLabel("Label *").fill("Bookmark A");
      await page.getByRole("button", { name: "Create Bookmark" }).click();
      await expect(
        page.getByRole("heading", { name: "Bookmark A" }),
      ).toBeVisible();

      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("Note B");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(page.getByRole("heading", { name: "Note B" })).toBeVisible();
      await page.getByRole("link", { name: "Bookmark" }).click();
      await page.getByLabel("Label *").fill("Bookmark B");
      await page.getByRole("button", { name: "Create Bookmark" }).click();
      await expect(
        page.getByRole("heading", { name: "Bookmark B" }),
      ).toBeVisible();

      await page.goto("/notes/note-a/edit");
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("note-a-renamed");
      await page.getByRole("button", { name: "Update Note" }).click();
      await expect(page).toHaveURL(/\/notes\/note-a-renamed$/);

      await page.goto("/");
      await expect(
        page.getByText("Bookmark A").locator("xpath=ancestor::*[1]"),
      ).toContainText("References: note-a-renamed");
      await expect(
        page.getByText("Bookmark B").locator("xpath=ancestor::*[1]"),
      ).toContainText("References: note-b");
    });

    test("should handle slug change when no bookmarks reference the note", async ({
      page,
      getContentGitLog,
    }) => {
      await page.goto("/notes/new");
      await page.getByLabel("Title *").fill("No Bookmarks Note");
      await page.getByRole("button", { name: "Create Note" }).click();
      await expect(
        page.getByRole("heading", { name: "No Bookmarks Note" }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Edit" }).click();
      await page.getByLabel("Slug").clear();
      await page.getByLabel("Slug").fill("renamed-no-bookmarks");
      await page.getByRole("button", { name: "Update Note" }).click();

      await expect(page).toHaveURL(/\/notes\/renamed-no-bookmarks$/);
      await expect(
        page.getByRole("heading", { name: "No Bookmarks Note" }),
      ).toBeVisible();

      const log = await getContentGitLog();
      expect(log.join(" ")).toContain("No Bookmarks Note");
    });
  });
});
