import { test, expect } from "../support/test";
import {
  checkNamesInOrder,
  fillSignInForm,
  markdownEditorReady,
  deleteWithConfirm,
} from "../support/helpers";
import type { Page } from "@playwright/test";

async function openBranchesSection(page: Page) {
  await page.getByText("Advanced: branches", { exact: true }).click();
}

async function openRemotesSection(page: Page) {
  await page.getByText("Advanced: remotes", { exact: true }).click();
}

function remotesSection(page: Page) {
  return page.locator("details", { hasText: "Advanced: remotes" });
}

function branchesSection(page: Page) {
  return page.locator("details", { hasText: "Advanced: branches" });
}

async function makeTestRecipe(page: Page, recipeName: string) {
  await page.goto("/new-recipe");
  // Gate on form hydration so the Name fill isn't reset mid-hydration.
  await markdownEditorReady(page, "description");
  await page.getByLabel("Name").fill(recipeName);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: recipeName }),
  ).toBeVisible();
}

test.describe("Git content", () => {
  test.describe("when empty", () => {
    test.describe("Git remote management", () => {
      test("should allow creating a new remote", async ({
        page,
        resetData,
        initializeContentGit,
      }) => {
        await resetData();
        await initializeContentGit();
        await page.goto("/git");
        await fillSignInForm(page);

        await openRemotesSection(page);
        await page.getByText("New Remote", { exact: true }).click();
        await page.getByLabel("Remote Name").fill("origin");
        await page
          .getByLabel("Remote URL")
          .fill("https://github.com/user/repo.git");
        await page.getByRole("button", { name: "Add", exact: true }).click();

        await expect(remotesSection(page).getByText("origin")).toBeVisible();
        await expect(
          remotesSection(page).getByText("https://github.com/user/repo.git"),
        ).toBeVisible();
      });

      test("should display an error message when creating a remote with an empty name", async ({
        page,
        resetData,
        initializeContentGit,
      }) => {
        await resetData();
        await initializeContentGit();
        await page.goto("/git");
        await fillSignInForm(page);

        await openRemotesSection(page);
        await page.getByText("New Remote", { exact: true }).click();
        await page
          .getByLabel("Remote URL")
          .fill("https://github.com/user/repo.git");
        await page.getByRole("button", { name: "Add", exact: true }).click();

        await expect(page.getByText("Remote Name is required")).toBeVisible();
      });

      test("should display an error message when creating a remote with an empty URL", async ({
        page,
        resetData,
        initializeContentGit,
      }) => {
        await resetData();
        await initializeContentGit();
        await page.goto("/git");
        await fillSignInForm(page);

        await openRemotesSection(page);
        await page.getByText("New Remote", { exact: true }).click();
        await page.getByLabel("Remote Name").fill("origin");
        await page.getByRole("button", { name: "Add", exact: true }).click();

        await expect(page.getByText("Remote URL is required")).toBeVisible();
      });

      test("should display an error message when creating a remote with a duplicate name", async ({
        page,
        resetData,
        initializeContentGit,
      }) => {
        await resetData();
        await initializeContentGit();
        await page.goto("/git");
        await fillSignInForm(page);

        await openRemotesSection(page);
        await page.getByText("New Remote", { exact: true }).click();
        await page.getByLabel("Remote Name").fill("origin");
        await page
          .getByLabel("Remote URL")
          .fill("https://github.com/user/repo.git");
        await page.getByRole("button", { name: "Add", exact: true }).click();

        await expect(remotesSection(page).getByText("origin")).toBeVisible();

        await page.getByLabel("Remote Name").fill("origin");
        await page
          .getByLabel("Remote URL")
          .fill("https://github.com/user/repo2.git");
        await page.getByRole("button", { name: "Add", exact: true }).click();

        await expect(
          page.getByText("error: remote origin already exists."),
        ).toBeVisible();
      });
    });

    test("should navigate to the Git UI from home and create a branch", async ({
      page,
      resetData,
      initializeContentGit,
    }) => {
      await resetData();
      await initializeContentGit();
      await page.goto("/");

      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await fillSignInForm(page);
      // The settings sub-footer's "Git" link is gone (PR 14); navigate directly.
      await page.goto("/git");

      await openBranchesSection(page);
      await page.getByLabel("Branch Name").fill("other-branch");
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(
        branchesSection(page).getByText("other-branch", { exact: true }),
      ).toBeVisible();
    });

    test("should initialize a Git repository", async ({ page, resetData }) => {
      await resetData();
      await page.goto("/git");
      await fillSignInForm(page);

      await expect(
        page.getByText("Content directory is not tracked with Git."),
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Initialize", exact: true })
        .click();
      await expect(
        page.getByText("Content directory is not tracked with Git."),
      ).toHaveCount(0);
      await expect(page.getByText("Initial commit")).toBeVisible();
    });

    test("should display an error message when creating a branch with an empty name", async ({
      page,
      resetData,
      initializeContentGit,
    }) => {
      await resetData();
      await initializeContentGit();
      await page.goto("/git");
      await fillSignInForm(page);

      await openBranchesSection(page);
      await page.getByRole("button", { name: "Create", exact: true }).click();

      await expect(page.getByText("Branch Name is required")).toBeVisible();
    });

    test("should display an error message when using checkout with no selected branch", async ({
      page,
      resetData,
      initializeContentGit,
    }) => {
      await resetData();
      await initializeContentGit();
      await page.goto("/git");
      await fillSignInForm(page);

      await openBranchesSection(page);
      await expect(branchesSection(page).getByRole("radio")).not.toBeChecked();

      const checkoutBtn = page.getByRole("button", {
        name: "Checkout",
        exact: true,
      });
      await expect(checkoutBtn).toBeDisabled();
      await checkoutBtn.evaluate((el: HTMLButtonElement) => {
        el.disabled = false;
      });
      await checkoutBtn.click({ force: true });

      await expect(page.getByText("Invalid branch")).toBeVisible();
    });

    test("should display an error message when using delete with no selected branch", async ({
      page,
      resetData,
      initializeContentGit,
    }) => {
      await resetData();
      await initializeContentGit();
      await page.goto("/git");
      await fillSignInForm(page);

      await openBranchesSection(page);
      await expect(branchesSection(page).getByRole("radio")).not.toBeChecked();

      const deleteBtn = page.getByRole("button", {
        name: "Delete",
        exact: true,
      });
      await expect(deleteBtn).toBeDisabled();
      await deleteBtn.evaluate((el: HTMLButtonElement) => {
        el.disabled = false;
      });
      await deleteBtn.click({ force: true });

      await expect(page.getByText("Invalid branch")).toBeVisible();
    });

    test("should display an error message when using force delete with no selected branch", async ({
      page,
      resetData,
      initializeContentGit,
    }) => {
      await resetData();
      await initializeContentGit();
      await page.goto("/git");
      await fillSignInForm(page);

      await openBranchesSection(page);
      await expect(branchesSection(page).getByRole("radio")).not.toBeChecked();

      const forceDeleteBtn = page.getByRole("button", {
        name: "Force Delete",
        exact: true,
      });
      await expect(forceDeleteBtn).toBeDisabled();
      await forceDeleteBtn.evaluate((el: HTMLButtonElement) => {
        el.disabled = false;
      });
      await forceDeleteBtn.click({ force: true });

      await expect(page.getByText("Invalid branch")).toBeVisible();
    });

    test("should indicate when the content directory is not tracked by git", async ({
      page,
      resetData,
    }) => {
      await resetData();
      await page.goto("/git");
      await fillSignInForm(page);

      await expect(
        page.getByText("Content directory is not tracked with Git."),
      ).toBeVisible();
      await expect(page.getByText("Commit history")).toHaveCount(0);
    });

    test("should be able to work with a git-tracked content directory", async ({
      page,
      resetData,
      getContentGitLog,
    }) => {
      await resetData();
      await page.goto("/git");
      await fillSignInForm(page);

      await expect(
        page.getByText("Content directory is not tracked with Git."),
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Initialize", exact: true })
        .click();
      await expect(
        page.getByText("Content directory is not tracked with Git."),
      ).toHaveCount(0);
      await expect(page.getByText("Initial commit")).toBeVisible();

      const firstRecipeName = "Recipe A";
      const secondRecipeName = "Recipe B";

      const firstRecipeSlug = "recipe-a";
      const secondRecipeSlug = "recipe-b";

      const editedTestName = "edited";

      const mainBranchName = "main";
      const otherBranchName = "other-branch";

      await makeTestRecipe(page, firstRecipeName);
      await makeTestRecipe(page, secondRecipeName);

      await page.getByRole("link", { name: "Settings", exact: true }).click();
      // The settings sub-footer's "Git" link is gone (PR 14); navigate directly.
      await page.goto("/git");
      await openBranchesSection(page);
      await page.getByLabel("Branch Name").fill(otherBranchName);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByLabel("Branch Name")).toHaveValue("");

      await page.goto("/");
      await page.getByTestId("recipe-list").getByText(secondRecipeName).click();
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await markdownEditorReady(page, "description");
      await page.getByLabel("Name").first().clear();
      await page.getByLabel("Name").first().fill(editedTestName);
      await page.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: editedTestName }),
      ).toBeVisible();

      await page.goto("/");
      await page.getByTestId("recipe-list").getByText(firstRecipeName).click();
      await deleteWithConfirm(page, "recipe");

      await expect(
        page.getByTestId("recipe-list").getByText(editedTestName),
      ).toBeVisible();
      expect(await getContentGitLog()).toEqual([
        `Delete recipe: ${firstRecipeSlug}`,
        `Update recipe: ${secondRecipeSlug}`,
        `Add new recipe: ${secondRecipeSlug}`,
        `Add new recipe: ${firstRecipeSlug}`,
        "Initial commit",
      ]);
      await page.goto("/");
      await checkNamesInOrder(page, [editedTestName]);

      await page.getByRole("link", { name: "Settings", exact: true }).click();
      // The settings sub-footer's "Git" link is gone (PR 14); navigate directly.
      await page.goto("/git");
      await openBranchesSection(page);
      await page.locator("label", { hasText: mainBranchName }).click();
      await page.getByRole("button", { name: "Checkout", exact: true }).click();
      await expect(page.getByLabel("main")).toBeDisabled();

      await page.goto("/");
      await checkNamesInOrder(page, [secondRecipeName, firstRecipeName]);

      expect(await getContentGitLog()).toEqual([
        `Add new recipe: ${secondRecipeSlug}`,
        `Add new recipe: ${firstRecipeSlug}`,
        "Initial commit",
      ]);

      await page.goto("/git");
      await openBranchesSection(page);
      await page.getByText("other-branch", { exact: true }).click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();

      await expect(
        page.getByText(/branch 'other-branch' is not fully merged/),
      ).toBeVisible();

      await page.getByText("other-branch", { exact: true }).click();
      await page
        .getByRole("button", { name: "Force Delete", exact: true })
        .click();

      await expect(page.getByText("other-branch", { exact: true })).toHaveCount(
        0,
      );
    });

    test("should display an empty git log", async ({ page, resetData }) => {
      await resetData();
      await page.goto("/git");
      await fillSignInForm(page);

      await page
        .getByRole("button", { name: "Initialize", exact: true })
        .click();

      await expect(page.getByText("Initial commit")).toBeVisible();
    });
  });

  test.describe("with some git history", () => {
    const firstRecipeSlug = "recipe-a";
    const secondRecipeSlug = "recipe-b";

    test.beforeEach(async ({ page, loadGitFixture }) => {
      await loadGitFixture("test-git.bundle");
      await page.goto("/git");
      await fillSignInForm(page);
    });

    test("should display the git log in the commit history", async ({
      page,
    }) => {
      await page.goto("/git");
      await expect(page.getByText("Commit history")).toBeVisible();
      await expect(page.getByText("Initial commit")).toBeVisible();
      await expect(
        page.getByText(`Add new recipe: ${firstRecipeSlug}`, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`Add new recipe: ${secondRecipeSlug}`, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`Update recipe: ${secondRecipeSlug}`, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`Delete recipe: ${firstRecipeSlug}`, { exact: true }),
      ).toBeVisible();
    });

    test("should display the correct commit order in the git log", async ({
      page,
      getContentGitLog,
    }) => {
      await page.goto("/git");
      expect(await getContentGitLog()).toEqual([
        `Delete recipe: ${firstRecipeSlug}`,
        `Update recipe: ${secondRecipeSlug}`,
        `Add new recipe: ${secondRecipeSlug}`,
        `Add new recipe: ${firstRecipeSlug}`,
        "Initial commit",
      ]);
    });

    test("should lazily load commit details when clicking on a commit", async ({
      page,
    }) => {
      await page.goto("/git");

      // The diff is not shipped until the commit is expanded.
      await expect(page.getByText("Commit Details")).toHaveCount(0);

      await page
        .getByText(`Update recipe: ${secondRecipeSlug}`, { exact: true })
        .click();

      await expect(page.getByText("Commit Details")).toBeVisible();
      await expect(page.getByText("Author", { exact: true })).toBeVisible();
      await expect(page.getByText("Date", { exact: true })).toBeVisible();
      await expect(page.getByText("Diff", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.getByText("Commit Details")).toHaveCount(0);
    });

    test("should display the correct commit details", async ({ page }) => {
      await page.goto("/git");
      await page
        .getByText(`Update recipe: ${secondRecipeSlug}`, { exact: true })
        .click();

      await expect(page.getByText("Commit Details")).toBeVisible();
      await expect(page.getByText(/-.*Recipe B/)).toBeVisible();
      await expect(page.getByText(/\+.*edited/)).toBeVisible();
    });

    test("should display the correct commit details for a delete commit", async ({
      page,
    }) => {
      await page.goto("/git");
      await page
        .getByText(`Delete recipe: ${firstRecipeSlug}`, { exact: true })
        .click();

      await expect(page.getByText("Commit Details")).toBeVisible();
      await expect(page.getByText(/-.*Recipe A/)).toBeVisible();
    });

    test("should display the correct commit details for an add commit", async ({
      page,
    }) => {
      await page.goto("/git");
      await page
        .getByText(`Add new recipe: ${firstRecipeSlug}`, { exact: true })
        .click();

      await expect(page.getByText("Commit Details")).toBeVisible();
      await expect(page.getByText(/\+.*Recipe A/)).toBeVisible();
    });
  });

  test.describe("syncing with a remote", () => {
    test("should set the upstream and push on the first push", async ({
      page,
      resetData,
      initializeContentGit,
      createBareRemote,
      getRemoteLog,
    }) => {
      await resetData();
      await initializeContentGit();
      const remote = await createBareRemote();

      await page.goto("/git");
      await fillSignInForm(page);

      // Add the remote through the UI, then set upstream + push.
      await openRemotesSection(page);
      await page.getByText("New Remote", { exact: true }).click();
      await page.getByLabel("Remote Name").fill("origin");
      await page.getByLabel("Remote URL").fill(remote);
      await page.getByRole("button", { name: "Add", exact: true }).click();

      await expect(page.getByText("No upstream configured.")).toBeVisible();
      await page
        .getByRole("button", { name: "Set upstream & push", exact: true })
        .click();

      await expect.poll(() => getRemoteLog(remote)).toContain("Initial commit");
    });

    test("should pull remote changes with Sync", async ({
      page,
      resetData,
      initializeContentGit,
      createBareRemote,
      addRemoteAndPush,
      cloneFromRemote,
      addRecipeInClone,
      pushClone,
      getContentGitLog,
    }) => {
      await resetData();
      await initializeContentGit();
      const remote = await createBareRemote();
      await addRemoteAndPush(remote);

      const clone = await cloneFromRemote(remote);
      await addRecipeInClone(clone, "from-remote", "From Remote");
      await pushClone(clone);

      /*
       * Warm the homepage's cache entry with the *pre-pull* corpus before
       * syncing, so the assertion below runs against a populated entry rather
       * than a cold read. A precondition, not a retry — the assertion still
       * runs exactly once.
       */
      await page.goto("/");
      await expect(page.getByText("From Remote")).toHaveCount(0);

      await page.goto("/git");
      await fillSignInForm(page);

      /*
       * **Wait for the action, not for the disk.** This is the defect the F22c
       * production gate caught on its first run, and it is a readiness bug in
       * the test rather than anything in the app.
       *
       * `getContentGitLog()` below reads the commit straight off disk, and the
       * pull lands it *early* — `doSync` still has the index rebuild and the
       * tag expiry to do after the merge returns. So the disk is a side channel
       * that goes green before the work the next assertion depends on has
       * happened, and navigating to `/` on that signal raced the rebuild.
       *
       * The server action's own POST response is the signal that cannot be
       * early: it does not return until `doSync` has. That is a precondition,
       * not a retry — the assertion below still runs exactly once — and it is
       * the distinction F20 drew when it stopped `aggregates.spec.ts` polling
       * around a race.
       *
       * Worth keeping the measurement. In the container's production build this
       * race lost **every** time, three attempts out of three, identically on
       * base — where on a faster box it usually won, which is how it spent
       * several passes in the flake pool being read as noise. Slower conditions
       * did not make it flakier, they made it deterministic. Finding that is
       * what the production gate is for.
       */
      const syncCompleted = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/git"),
      );
      await page.getByRole("button", { name: "Sync", exact: true }).click();
      await syncCompleted;

      await expect
        .poll(() => getContentGitLog())
        .toContain("Add new recipe: from-remote");

      await page.goto("/");
      await expect(
        page.getByTestId("recipe-list").getByText("From Remote"),
      ).toBeVisible();
    });

    test("should push local changes", async ({
      page,
      resetData,
      initializeContentGit,
      createBareRemote,
      addRemoteAndPush,
      getRemoteLog,
    }) => {
      await resetData();
      await initializeContentGit();
      const remote = await createBareRemote();
      await addRemoteAndPush(remote);

      await page.goto("/git");
      await fillSignInForm(page);

      await makeTestRecipe(page, "Local Recipe");

      await page.goto("/git");
      await page.getByRole("button", { name: "Push", exact: true }).click();

      await expect
        .poll(() => getRemoteLog(remote))
        .toContain("Add new recipe: local-recipe");
    });

    test("should reject a non-fast-forward push", async ({
      page,
      resetData,
      initializeContentGit,
      createBareRemote,
      addRemoteAndPush,
      cloneFromRemote,
      addRecipeInClone,
      pushClone,
    }) => {
      await resetData();
      await initializeContentGit();
      const remote = await createBareRemote();
      await addRemoteAndPush(remote);

      const clone = await cloneFromRemote(remote);
      await addRecipeInClone(clone, "remote-only", "Remote Only");
      await pushClone(clone);

      await page.goto("/git");
      await fillSignInForm(page);
      await makeTestRecipe(page, "Local Only");

      await page.goto("/git");
      await page.getByRole("button", { name: "Push", exact: true }).click();

      await expect(page.getByText(/Push rejected/)).toBeVisible();
    });

    test.describe("conflict resolution", () => {
      async function setUpDivergence({
        page,
        resetData,
        initializeContentGit,
        createBareRemote,
        addRemoteAndPush,
        cloneFromRemote,
        editRecipeInClone,
        pushClone,
      }: {
        page: Page;
        resetData: (fixture?: string) => Promise<void>;
        initializeContentGit: () => Promise<void>;
        createBareRemote: (name?: string) => Promise<string>;
        addRemoteAndPush: (remoteUrl: string, name?: string) => Promise<void>;
        cloneFromRemote: (remoteUrl: string, name?: string) => Promise<string>;
        editRecipeInClone: (
          cloneDir: string,
          slug: string,
          name: string,
        ) => Promise<void>;
        pushClone: (cloneDir: string) => Promise<void>;
      }) {
        await resetData();
        await initializeContentGit();
        const remote = await createBareRemote();

        await page.goto("/git");
        await fillSignInForm(page);

        // Create the shared recipe, then push it to the remote.
        await makeTestRecipe(page, "Shared");
        await addRemoteAndPush(remote);

        // Another instance edits the same recipe and pushes.
        const clone = await cloneFromRemote(remote);
        await editRecipeInClone(clone, "shared", "Theirs");
        await pushClone(clone);

        // This instance edits the same recipe differently.
        await page.goto("/recipe/shared/edit");
        await markdownEditorReady(page, "description");
        await page.getByLabel("Name").first().clear();
        await page.getByLabel("Name").first().fill("Mine");
        await page.getByRole("button", { name: "Submit", exact: true }).click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Mine" }),
        ).toBeVisible();

        // Sync detects the divergence and surfaces the conflict resolver.
        await page.goto("/git");
        await page.getByRole("button", { name: "Sync", exact: true }).click();
        await expect(page.getByText("Resolve merge conflicts")).toBeVisible();
        await expect(
          page.getByText("Recipe: shared", { exact: true }),
        ).toBeVisible();
      }

      test("should keep the remote version with Take Theirs", async ({
        page,
        resetData,
        initializeContentGit,
        createBareRemote,
        addRemoteAndPush,
        cloneFromRemote,
        editRecipeInClone,
        pushClone,
      }) => {
        await setUpDivergence({
          page,
          resetData,
          initializeContentGit,
          createBareRemote,
          addRemoteAndPush,
          cloneFromRemote,
          editRecipeInClone,
          pushClone,
        });

        await page
          .getByRole("button", { name: "Take Theirs", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Complete Merge", exact: true })
          .click();

        await expect(page.getByText("Resolve merge conflicts")).toHaveCount(0);
        await page.goto("/");
        const recipeList = page.getByTestId("recipe-list");
        await expect(recipeList.getByText("Theirs")).toBeVisible();
        await expect(recipeList.getByText("Mine")).toHaveCount(0);

        /*
         * And the item page, which `setUpDivergence` left warm with "Mine".
         * The homepage alone cannot catch a missing tag here: Next attaches an
         * implicit path tag to every `unstable_cache` entry read during a
         * route's render, so `revalidatePath("/")` covers `/` by accident and
         * nothing else. `/recipe/shared` is the URL that actually reads
         * through `recipeItems`, and it is the one the merge seat has to
         * expire on purpose.
         */
        await page.goto("/recipe/shared");
        await expect(
          page.getByRole("heading", { level: 1, name: "Theirs" }),
        ).toBeVisible();
      });

      test("should keep the local version with Keep Mine", async ({
        page,
        resetData,
        initializeContentGit,
        createBareRemote,
        addRemoteAndPush,
        cloneFromRemote,
        editRecipeInClone,
        pushClone,
      }) => {
        await setUpDivergence({
          page,
          resetData,
          initializeContentGit,
          createBareRemote,
          addRemoteAndPush,
          cloneFromRemote,
          editRecipeInClone,
          pushClone,
        });

        await page
          .getByRole("button", { name: "Keep Mine", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Complete Merge", exact: true })
          .click();

        await expect(page.getByText("Resolve merge conflicts")).toHaveCount(0);
        await page.goto("/");
        await expect(
          page.getByTestId("recipe-list").getByText("Mine"),
        ).toBeVisible();
      });

      test("should revert the merge with Abort", async ({
        page,
        resetData,
        initializeContentGit,
        createBareRemote,
        addRemoteAndPush,
        cloneFromRemote,
        editRecipeInClone,
        pushClone,
      }) => {
        await setUpDivergence({
          page,
          resetData,
          initializeContentGit,
          createBareRemote,
          addRemoteAndPush,
          cloneFromRemote,
          editRecipeInClone,
          pushClone,
        });

        await page
          .getByRole("button", { name: "Abort Merge", exact: true })
          .click();

        await expect(page.getByText("Resolve merge conflicts")).toHaveCount(0);
        await page.goto("/");
        await expect(
          page.getByTestId("recipe-list").getByText("Mine"),
        ).toBeVisible();
      });
    });
  });
});
