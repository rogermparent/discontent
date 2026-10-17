import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { commitInContent, writeContentExportStamp } from "../support/tasks";

/*
 * Epic 39, D6: the Export page says how stale the static export is, counted
 * from the commit the last finished Build read. Export stays manual (28-D8);
 * the Build itself is not run here (it builds the whole static site).
 */
test.describe("Export page (39-D6)", () => {
  test("says how many commits the export is behind", async ({
    page,
    resetData,
    initializeContentGit,
  }) => {
    await resetData();
    await initializeContentGit();
    await page.goto("/export");
    await fillSignInForm(page);

    const hint = page.getByTestId("export-staleness");
    await expect(hint).toHaveText(
      "No export recorded yet: the next Build that finishes is.",
    );
    await expect(page.getByRole("button", { name: "Build" })).toBeVisible();

    await writeContentExportStamp("2026-10-16T12:00:00.000Z");
    await page.reload();
    await expect(hint).toContainText("Up to date: the last export (");
    await expect(hint.locator("time")).toHaveAttribute(
      "datetime",
      "2026-10-16T12:00:00.000Z",
    );

    await commitInContent("notes/one.txt");
    await page.reload();
    await expect(hint).toContainText("1 commit since the last export (");
    await commitInContent("notes/two.txt");
    await page.reload();
    await expect(hint).toContainText("2 commits since the last export (");
  });
});
