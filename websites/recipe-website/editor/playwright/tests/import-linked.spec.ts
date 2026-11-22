import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

/*
 * 50e: an import follows the recipes its page links to. The cake's purée
 * line links its poached pears (`uploads/linked-cake.html` →
 * `linked-pears.html`, both hand-written): with "Follow linked recipes" on
 * (the default) the pears are imported in the same job — the panel says
 * "Also imported: Linked Poached Pears" — and the cake's two pear lines are
 * rewritten to link them, each marked in Ingredients to keep or undo. Off,
 * the cake comes alone.
 */

async function importCake(
  page: Page,
  baseURL: string,
  { follow = true }: { follow?: boolean } = {},
) {
  await page.goto("/new-recipe");
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
  const importButton = page.getByRole("button", {
    name: "Import",
    exact: true,
  });
  await expectHydrated(importButton);
  const box = page.getByRole("checkbox", {
    name: "Follow linked recipes",
    exact: true,
  });
  await expect(box).toBeChecked();
  if (!follow) {
    await box.click();
    await expect(box).not.toBeChecked();
  }
  await page
    .getByLabel("Import from URL", { exact: true })
    .fill(new URL("/uploads/linked-cake.html", baseURL).href);
  await importButton.click();
  await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
    "Linked Pear Cake",
    { timeout: 30_000 },
  );
}

test.describe("Linked recipes on import (50e)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("importable-uploads");
  });

  test("imports the linked poached pears and marks the lines it linked", async ({
    page,
    baseURL,
  }) => {
    await importCake(page, baseURL!);
    const panel = page.getByTestId("import-progress");
    const imported = panel.getByTestId("import-linked-imported");
    await expect(imported).toContainText("Also imported:");
    await expect(
      imported.getByRole("link", { name: "Linked Poached Pears" }),
    ).toHaveAttribute("href", "/recipe/linked-poached-pears");
    /* The crème fraîche is offered instead of a line: not followed. */
    await expect(panel).not.toContainText("crème fraîche");

    const marks = page.getByTestId("linked-line-mark");
    await expect(marks).toHaveCount(2);
    await expect(marks.first()).toContainText(
      "The import linked this line to Linked Poached Pears — the page links it here.",
    );
    await expect(marks.nth(1)).toContainText("the line names what it makes");

    /* Undo puts the line back as the page wrote it; Keep keeps the link. */
    await page
      .getByRole("button", {
        name: "Undo the link on ingredient 2",
        exact: true,
      })
      .click();
    await expect(marks).toHaveCount(1);
    await expect(
      page.locator('input[name="ingredients[1].ingredient"]'),
    ).toHaveValue(/Pear Poaching Liquid \(strained\)$/);
    await page
      .getByRole("button", {
        name: "Keep the link on ingredient 1",
        exact: true,
      })
      .click();
    await expect(marks).toHaveCount(0);
    await expect(
      page.locator('input[name="ingredients[0].ingredient"]'),
    ).toHaveValue(/\[pear puree\]\(\/recipe\/linked-poached-pears\)$/);

    /* The pears were written in the same job, as a recipe of their own. */
    const pears = await page.request.get("/api/recipe/linked-poached-pears");
    expect(pears.ok()).toBe(true);
    expect((await pears.json()).name).toBe("Linked Poached Pears");
  });

  test("imports the cake alone with the switch off", async ({
    page,
    baseURL,
  }) => {
    await importCake(page, baseURL!, { follow: false });
    await expect(page.getByTestId("import-progress")).toHaveAttribute(
      "data-status",
      "done",
    );
    await expect(page.getByTestId("import-linked")).toHaveCount(0);
    await expect(page.getByTestId("linked-line-mark")).toHaveCount(0);
    await expect(
      page.locator('input[name="ingredients[0].ingredient"]'),
    ).toHaveValue(/pear puree$/);
    const pears = await page.request.get("/api/recipe/linked-poached-pears");
    expect(pears.status()).toBe(404);
  });
});
