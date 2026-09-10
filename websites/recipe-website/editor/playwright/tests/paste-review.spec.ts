import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

/**
 * Exercises the always-on live review UI under each PasteField: heading
 * detection surfaces per-line toggles, and toggling before Import re-shapes
 * what lands in the form (demote a false heading to a flat item, promote a
 * plain line to a heading/group). The behaviour-preserving one-click path is
 * covered by paste-replace.spec.ts and the new-recipe paste blocks.
 */
test.describe("Paste Field Live Review", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("one-recipe");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    // Gate on the recipe-form island hydrating so early interactions aren't
    // dropped/reset mid-hydration (dev-mode flake).
    await markdownEditorReady(page, "description");
  });

  test.describe("Instructions", () => {
    test("should demote a mis-detected ALL-CAPS heading to a flat step", async ({
      page,
    }) => {
      await page.getByText("Paste Instructions", { exact: true }).click();
      const scope = page
        .getByText("Paste Instructions")
        .locator("xpath=ancestor::details[1]");

      await scope.getByTitle("Instructions Paste Area").fill(
        `1. Preheat oven
MIX WELL`,
      );

      // The ALL-CAPS second line is detected as a heading (a false positive).
      await expect(scope.getByTitle("Instructions Review Line 2")).toHaveText(
        "MIX WELL",
      );
      const line2Toggle = scope.getByRole("button", {
        name: "Toggle Heading Line 2",
      });
      await expect(line2Toggle).toHaveAttribute("aria-pressed", "true");

      // Demote it, then import.
      await line2Toggle.click();
      await expect(line2Toggle).toHaveAttribute("aria-pressed", "false");
      await scope.getByText("Import Instructions", { exact: true }).click();

      // It lands as a flat top-level step, not a group child.
      await expect(page.locator('[name="instructions[0].text"]')).toHaveValue(
        "Preheat oven",
      );
      await expect(page.locator('[name="instructions[1].text"]')).toHaveValue(
        "MIX WELL",
      );
      await expect(
        page.locator('[name="instructions[1].instructions[0].text"]'),
      ).toHaveCount(0);
    });

    test("should promote a plain line to an instruction group", async ({
      page,
    }) => {
      await page.getByText("Paste Instructions", { exact: true }).click();
      const scope = page
        .getByText("Paste Instructions")
        .locator("xpath=ancestor::details[1]");

      await scope.getByTitle("Instructions Paste Area").fill(
        `Prep
Mix
Knead`,
      );

      // Nothing is detected as a heading up front.
      const line1Toggle = scope.getByRole("button", {
        name: "Toggle Heading Line 1",
      });
      await expect(line1Toggle).toHaveAttribute("aria-pressed", "false");

      // Promote the first line, then import.
      await line1Toggle.click();
      await expect(line1Toggle).toHaveAttribute("aria-pressed", "true");
      await scope.getByText("Import Instructions", { exact: true }).click();

      // It becomes a group whose name is the promoted line, gathering the rest.
      await expect(page.locator('[name="instructions[0].name"]')).toHaveValue(
        "Prep",
      );
      await expect(
        page.locator('[name="instructions[0].instructions[0].text"]'),
      ).toHaveValue("Mix");
      await expect(
        page.locator('[name="instructions[0].instructions[1].text"]'),
      ).toHaveValue("Knead");
      // The single group is the only top-level entry: no sibling, and the group
      // itself has no flat text field.
      await expect(page.locator('[name="instructions[1].name"]')).toHaveCount(
        0,
      );
      await expect(page.locator('[name="instructions[0].text"]')).toHaveCount(
        0,
      );
    });
  });

  test.describe("Ingredients", () => {
    test("should demote a mis-detected heading to a flat ingredient", async ({
      page,
    }) => {
      await page.getByText("Paste Ingredients", { exact: true }).click();
      const scope = page
        .getByText("Paste Ingredients")
        .locator("xpath=ancestor::details[1]");

      await scope.getByTitle("Ingredients Paste Area").fill(
        `SAUCE
2 tbsp soy sauce`,
      );

      const line1Toggle = scope.getByRole("button", {
        name: "Toggle Heading Line 1",
      });
      await expect(line1Toggle).toHaveAttribute("aria-pressed", "true");

      await line1Toggle.click();
      await expect(line1Toggle).toHaveAttribute("aria-pressed", "false");
      await scope.getByText("Import Ingredients", { exact: true }).click();

      await expect(
        page.locator('[name="ingredients[0].ingredient"]'),
      ).toHaveValue(/SAUCE/);
      // No heading marker survives (the hidden type input is only rendered for
      // heading rows).
      await expect(
        page.locator('[name="ingredients[0].type"][value="heading"]'),
      ).toHaveCount(0);
    });

    test("should promote a plain line to an ingredient heading", async ({
      page,
    }) => {
      await page.getByText("Paste Ingredients", { exact: true }).click();
      const scope = page
        .getByText("Paste Ingredients")
        .locator("xpath=ancestor::details[1]");

      await scope.getByTitle("Ingredients Paste Area").fill(
        `Sugar topping
2 tbsp sugar`,
      );

      const line1Toggle = scope.getByRole("button", {
        name: "Toggle Heading Line 1",
      });
      await expect(line1Toggle).toHaveAttribute("aria-pressed", "false");

      await line1Toggle.click();
      await expect(line1Toggle).toHaveAttribute("aria-pressed", "true");
      await scope.getByText("Import Ingredients", { exact: true }).click();

      await expect(
        page.locator('[name="ingredients[0].ingredient"]'),
      ).toHaveValue(/Sugar topping/);
      await expect(
        page.locator('[name="ingredients[0].type"][value="heading"]'),
      ).toHaveCount(1);
    });
  });
});
