import { test, expect } from "../support/test";

test.describe("Git Integration", () => {
  test.beforeEach(async ({ resetData, initializeContentGit }) => {
    await resetData();
    await initializeContentGit();
  });

  test("should create git commit when creating a resume", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/new-resume");
    await page.getByLabel("Company").fill("Git Corp");
    await page.getByLabel("Job").fill("Developer");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page).toHaveURL(/\/resume\/git-corp-developer/);

    const log = await getContentGitLog();
    expect(log).toContain("Add new resume: git-corp-developer");
  });

  test("should create git commit when updating a resume", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/new-resume");
    await page.getByLabel("Company").fill("Update Corp");
    await page.getByLabel("Job").fill("Engineer");
    await page.getByRole("button", { name: "Submit" }).click();

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Company").clear();
    await page.getByLabel("Company").fill("Updated Corp");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText("Updated Corp")).toBeVisible();

    // An edit keeps the resume's slug (the form pre-fills it), so the commit
    // names the slug it was created with, not one made from the new company.
    const log = await getContentGitLog();
    expect(log).toContain("Update resume: update-corp-engineer");
  });

  test("should create git commit when deleting a resume", async ({
    page,
    baseURL,
    getContentGitLog,
  }) => {
    await page.goto("/new-resume");
    await page.getByLabel("Company").fill("Delete Corp");
    await page.getByLabel("Job").fill("Manager");
    await page.getByRole("button", { name: "Submit" }).click();

    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page).toHaveURL(baseURL + "/");

    const log = await getContentGitLog();
    expect(log).toContain("Delete resume: delete-corp-manager");
  });

  test("should accumulate commits for multiple operations", async ({
    page,
    getContentGitLog,
  }) => {
    await page.goto("/new-resume");
    await page.getByLabel("Company").fill("First Corp");
    await page.getByLabel("Job").fill("Developer");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page).toHaveURL(/\/resume\/first-corp-developer$/);

    await page.goto("/new-resume");
    await page.getByLabel("Company").fill("Second Corp");
    await page.getByLabel("Job").fill("Designer");
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page).toHaveURL(/\/resume\/second-corp-designer$/);

    await page.goto("/resume/first-corp-developer/edit");
    await page.getByLabel("Job").clear();
    await page.getByLabel("Job").fill("Senior Developer");
    await page.getByRole("button", { name: "Submit" }).click();

    // Wait for the redirect: the commit lands before it. Reading the log
    // straight after the click raced the server action, and the edit keeps
    // its slug, so the commit names first-corp-developer.
    await expect(page).toHaveURL(/\/resume\/first-corp-developer$/);
    await expect(page.getByText("Senior Developer")).toBeVisible();

    const log = await getContentGitLog();
    expect(log).toContain("Add new resume: first-corp-developer");
    expect(log).toContain("Add new resume: second-corp-designer");
    expect(log).toContain("Update resume: first-corp-developer");
  });
});
