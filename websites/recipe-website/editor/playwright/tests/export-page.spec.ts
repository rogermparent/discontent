import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
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

  /*
   * 40c: the "Share my saved inventory" box is the Radix checkbox now. It
   * still submits by name, stays ticked after Save (the form's reset goes to
   * the saved value, not the one it mounted with), and survives a reload.
   */
  test("saves the share-inventory box, ticked and unticked", async ({
    page,
    resetData,
  }) => {
    await resetData();
    await page.goto("/export");
    await fillSignInForm(page);
    const card = page.getByTestId("share-inventory");
    const box = card.getByRole("checkbox", {
      name: "Share my saved inventory on the export",
      exact: true,
    });
    await expect(box).not.toBeChecked();

    /* A click before hydration is lost (40f's `expectHydrated`). */
    await expectHydrated(box);
    await box.check();
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByRole("status")).toHaveText("Settings saved.");
    await expect(box).toBeChecked();
    await page.reload();
    await expect(box).toBeChecked();

    await expectHydrated(box);
    await box.uncheck();
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByRole("status")).toHaveText("Settings saved.");
    await expect(box).not.toBeChecked();
    await page.reload();
    await expect(box).not.toBeChecked();
  });
});
