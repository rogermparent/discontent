import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";

/*
 * Epic 28, 28c: the workstation's Mirrors card on /git (add a remote as a
 * mirror, Sync now, the last outcome) and a mirror's "Synced by" card. The
 * background runner is off under TEST_MODE, so "Sync now" runs the sync
 * directly and the card reads back what it recorded.
 */
test.describe("Mirrors card", () => {
  test("adds a remote as a mirror and syncs it on demand", async ({
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

    await page.goto("/git");
    await fillSignInForm(page);
    const card = page.getByTestId("mirrors-card");
    await expect(card.getByText("No mirrors yet.")).toBeVisible();

    await card.getByRole("button", { name: "Add mirror" }).click();
    const mirror = card.getByTestId("mirror-origin");
    await expect(mirror.getByTestId("mirror-outcome")).toHaveText(
      "Not synced yet.",
    );

    const clone = await cloneFromRemote(remote);
    await addRecipeInClone(clone, "from-the-mirror", "From The Mirror");
    await pushClone(clone);

    await mirror.getByRole("button", { name: "Sync now" }).click();
    await expect(mirror.getByTestId("mirror-outcome")).toContainText(
      "synced (in 1, out 0)",
    );
    await page.goto("/");
    await expect(
      page.getByTestId("recipe-list").getByText("From The Mirror"),
    ).toBeVisible();
  });
});

test.describe("A mirror's /git", () => {
  test.afterEach(async ({ request }) => {
    await request.get("/settings/test-editor-role?role=workstation");
  });

  test("says who syncs it, and that it cannot ask yet", async ({
    page,
    request,
    resetData,
    initializeContentGit,
  }) => {
    await request.get("/settings/test-editor-role?role=mirror");
    await resetData();
    await initializeContentGit();
    await page.goto("/git");
    await fillSignInForm(page);
    const card = page.getByTestId("workstation-card");
    await expect(
      card.getByRole("heading", { name: "Synced by the workstation" }),
    ).toBeVisible();
    await expect(
      card.getByText(/WORKSTATION_URL and WORKSTATION_SYNC_TOKEN are not set/),
    ).toBeVisible();
    await expect(page.getByTestId("mirrors-card")).toHaveCount(0);
  });
});
