import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { snapshotPage } from "../support/visual";

/*
 * 43e1: edit form B, "Review, then save" — the section rail with what each
 * section holds, the save card with Cancel and the count of changed fields,
 * the phone's jump row and sticky save bar, and the new-recipe page's
 * duplicate check at Import time.
 */

test.describe("Edit form B: the frame (43e1)", () => {
  test("the rail says what each section holds, and counts real changes", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6/edit");
    await fillSignInForm(page);
    await expect(page.getByText("Editing Recipe: Recipe 6")).toBeVisible({
      timeout: 10_000,
    });
    await markdownEditorReady(page, "description");

    const rail = page.getByRole("navigation", { name: "Parts of this recipe" });
    await expect(rail.getByRole("link")).toHaveText([
      /^1Recipe/,
      /^2Tags: none yet/,
      /^3Picture: set/,
      /^4Ingredients: 2/,
      /^5Steps: ✓ 1 · all lines used/,
      /^6Times/,
      /^7Source/,
    ]);
    /* No Start from when editing. */
    await expect(rail.getByRole("link", { name: /Start from/ })).toHaveCount(0);

    const changes = page.getByTestId("recipe-form-changes");
    await expect(changes).toHaveText("No changes");
    const name = page.getByLabel("Name").first();
    await name.fill("Recipe 6, renamed");
    await expect(changes).toHaveText("1 change · not saved");
    await page.getByLabel("Slug").fill("recipe-6-renamed");
    await expect(changes).toHaveText("2 changes · not saved");
    /* Typed back, it is no change at all. */
    await name.fill("Recipe 6");
    await page.getByLabel("Slug").fill("recipe-6");
    await expect(changes).toHaveText("No changes");

    /* A rail link jumps to its section. */
    await rail.getByRole("link", { name: /Source/ }).click();
    await expect(page).toHaveURL(/#recipe-section-source$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Source and address" }),
    ).toBeInViewport();

    /* Cancel goes back to the recipe, unsaved. */
    await name.fill("Never saved");
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(/\/recipe\/recipe-6$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Recipe 6" }),
    ).toBeVisible();
  });

  test("a slug conflict marks Source in the rail, and Overwrite still works", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    await page.getByLabel("Slug").fill("recipe-5");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
    const rail = page.getByRole("navigation", { name: "Parts of this recipe" });
    await expect(rail.getByRole("link", { name: /^Source/ })).toHaveText(
      "7Source: ! check",
    );
    /* Still not saved: counted against the stored recipe. */
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "1 change · not saved",
    );
    await page.getByRole("button", { name: "Overwrite", exact: true }).click();
    await expect(page).toHaveURL(/\/recipe\/recipe-5$/);
  });

  test("an import of a link already in the collection says so at once", async ({
    page,
    resetData,
    baseURL,
  }) => {
    await resetData("importable-uploads");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const url = new URL("/uploads/naan.html", baseURL!).href;
    const field = page.getByLabel("Import from URL", { exact: true });
    const importButton = page.getByRole("button", {
      name: "Import",
      exact: true,
    });

    /* The first time: nothing to flag; the form fills, Start from folds. */
    await expectHydrated(importButton);
    await field.fill(url);
    await importButton.click();
    const form = page.locator("#recipe-form");
    await expect(form.locator('[name="name"]')).toHaveValue("Naan");
    await expect(page.getByTestId("start-from")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    await expect(page.getByTestId("import-receipt")).toHaveText(
      "recipe data on the page — no model needed",
    );
    const rail = page.getByRole("navigation", { name: "Parts of this recipe" });
    await expect(rail.getByRole("link", { name: /^Start from/ })).toHaveText(
      "1Start from: ✓ imported",
    );
    await expect(page.getByTestId("duplicate-flag")).toHaveCount(0);
    /* Canvas B-desktop: the receipt, the rail and the sections. The
     * import's elapsed time differs run to run. */
    await snapshotPage(page, "new-recipe-imported.png", {
      mask: [page.getByTestId("import-progress").locator(".tabular-nums")],
    });
    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    await expect(page).toHaveURL(/\/recipe\/naan$/, { timeout: 15_000 });

    /* The second time: flagged while it imports, with three ways on. */
    await page.goto("/new-recipe");
    await markdownEditorReady(page, "description");
    await expectHydrated(importButton);
    await field.fill(url);
    await importButton.click();
    const flag = page.getByTestId("duplicate-flag");
    await expect(flag).toContainText(
      "Already in your recipes. Naan was imported from this link on",
    );
    await expect(flag.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      "/recipe/naan",
    );
    await expect(
      flag.getByRole("link", { name: "Edit that one instead" }),
    ).toHaveAttribute("href", "/recipe/naan/edit");
    await expect(form.locator('[name="name"]')).toHaveValue("Naan");
    await flag
      .getByRole("button", { name: "Keep importing — save as a copy" })
      .click();
    await expect(flag).toHaveCount(0);
    await expect(page.getByTestId("copy-notice")).toContainText(
      "you chose to keep a copy.",
    );
    await expect(page.getByTestId("copy-notice")).toContainText(
      "/recipe/naan-2",
    );
    await expect(page.getByLabel("Slug")).toHaveValue("naan-2");
    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    await expect(page).toHaveURL(/\/recipe\/naan-2$/, { timeout: 15_000 });
  });

  test("Start from: five ways in, and Blank is the form alone", async ({
    page,
    resetData,
  }) => {
    await resetData("one-recipe");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const ways = page.getByRole("radiogroup", { name: "Start from" });
    await expect(ways.getByRole("radio")).toHaveCount(5);
    await expect(
      ways.getByRole("radio", { name: "A link", exact: true }),
    ).toBeChecked();
    await ways.getByRole("radio", { name: "Blank", exact: true }).check();
    await expect(page.getByLabel("Import from URL")).toHaveCount(0);
    await expect(page.getByTestId("start-from")).toContainText(
      "Fill in the form below, starting with the name.",
    );
    await ways.getByRole("radio", { name: "Roundup", exact: true }).check();
    await expect(page.getByLabel("Roundup URL", { exact: true })).toBeVisible();
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );
  });
});

test.describe("Edit form B on a phone (43e1) @mobile", () => {
  test("a jump row of sections and a save bar above the tab bar", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.goto("/recipe/classic-daiquiri/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const rail = page.getByRole("navigation", { name: "Parts of this recipe" });
    await expect(rail).toBeVisible();
    const bar = page.getByTestId("recipe-form-savebar");
    await expect(bar).toBeInViewport();
    await expect(bar.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );
    /* The bar sits on top of the tab bar, not under it. */
    const barBox = (await bar.boundingBox())!;
    const tabs = (await page.getByTestId("phone-tab-bar").boundingBox())!;
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabs.y + 1);
    /* No sideways scroll at phone width: nothing reaches past the screen. */
    const width = page.viewportSize()!.width;
    expect(
      await page.evaluate((limit) => {
        /* The innermost boxes that reach past the screen: the culprits,
         * not every ancestor they stretch. */
        const past = (element: Element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.right > limit + 1;
        };
        const wide: string[] = [];
        for (const element of document.body.querySelectorAll("*")) {
          if (!past(element)) continue;
          if (element.closest("[class*=overflow-x-auto]")) continue;
          if ([...element.children].some(past)) continue;
          wide.push(
            `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" → ${Math.round(element.getBoundingClientRect().right)}`,
          );
        }
        return wide.slice(0, 8);
      }, width),
    ).toEqual([]);
    await snapshotPage(page, "edit-form-mobile.png");
    await page.getByLabel("Name").first().fill("Daiquiri, mine");
    await expect(bar.getByTestId("recipe-form-changes")).toHaveText(
      "1 change · not saved",
    );
    await bar.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipe\/classic-daiquiri$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Daiquiri, mine" }),
    ).toBeVisible();
  });
});
