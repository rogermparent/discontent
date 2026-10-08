import { test, expect } from "../support/test";
import { fillSignInForm, signIn } from "../support/helpers";
import type { APIRequestContext } from "@playwright/test";

/*
 * Epic 28, D2: an editor running with EDITOR_ROLE=mirror (the Pi image) hides
 * the workstation's jobs — Export, Tools, branch and remote management,
 * pushing and syncing — and its `/git` offers "Pull from <workstation>"
 * instead. The dev server is flipped to the mirror role for each test through
 * the TEST_MODE-only `/settings/test-editor-role` route, and back afterwards.
 */
async function setRole(
  request: APIRequestContext,
  role: "mirror" | "workstation",
) {
  const response = await request.get(`/settings/test-editor-role?role=${role}`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ role });
}

test.describe("Mirror role", () => {
  test.beforeEach(async ({ request }) => {
    await setRole(request, "mirror");
  });
  test.afterEach(async ({ request }) => {
    await setRole(request, "workstation");
  });

  test("settings nav leaves out Export and Tools and says it is a mirror", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");

    const sidebar = page.getByRole("complementary", { name: "Settings" });
    await expect(sidebar.getByTestId("editor-role")).toHaveText(
      "Mirror of the workstation",
    );
    for (const name of [
      "Site details",
      "Appearance",
      "Navigation",
      "Pages",
      "Content Sync",
      "Maintenance",
    ]) {
      await expect(sidebar.getByRole("link", { name })).toBeVisible();
    }
    await expect(sidebar.getByRole("link", { name: "Export" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Tools" })).toHaveCount(0);
  });

  test("the Export page explains, without buttons", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/export");
    await fillSignInForm(page);
    await expect(page.getByTestId("export-unavailable")).toHaveText(
      "This editor is a mirror: exporting the static site happens on the workstation, which syncs this one.",
    );
    await expect(page.getByRole("button", { name: "Build" })).toHaveCount(0);
  });

  test("/git has no push, sync, branches or remotes", async ({
    page,
    resetData,
    initializeContentGit,
  }) => {
    await resetData();
    await initializeContentGit();
    await page.goto("/git");
    await fillSignInForm(page);

    await expect(
      page.getByText(
        "No upstream — this mirror pulls from the workstation; `pnpm deploy:pi --setup` sets it up.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pull from the workstation" }),
    ).toBeDisabled();
    for (const name of ["Sync", "Push", "Set upstream & push"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    }
    await expect(page.getByText("Advanced: branches")).toHaveCount(0);
    await expect(page.getByText("Advanced: remotes")).toHaveCount(0);
    /* History stays: a mirror can still read and revert. */
    await expect(page.getByText("Commit history")).toBeVisible();
  });
});

test.describe("Workstation role (the default)", () => {
  test("labels itself in the settings nav", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");
    await expect(
      page
        .getByRole("complementary", { name: "Settings" })
        .getByTestId("editor-role"),
    ).toHaveText("Workstation");
  });
});
