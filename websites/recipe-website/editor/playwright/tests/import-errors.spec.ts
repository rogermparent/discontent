import { test, expect } from "../support/test";
import {
  fillMarkdownField,
  fillSignInForm,
  markdownEditorReady,
} from "../support/helpers";
import { fixturePath } from "../support/tasks";

/*
 * 45d: "Error parsing recipe" with nothing to see. Roger imported Brian
 * Lagerstrom's Everything Dough (2026-10-22): the page's JSON-LD ends its
 * "LARGE LOAF:" section with an empty HowToStep, the import put an empty
 * step in the form, and Create refused it with the bare message — the
 * only error was `instructions`, a key no field showed. Now the import
 * drops the blank step, the form drops blank rows itself, and any other
 * refusal says where it is.
 */

test.describe("Import errors (45d)", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("importable-uploads");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
  });

  test("a page whose section ends with an empty step imports and saves", async ({
    page,
    baseURL,
  }) => {
    const url = new URL("/uploads/everything-dough.html", baseURL!);
    await page.getByLabel("Import from URL").fill(url.href);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    const form = page.locator("#recipe-form");
    await expect(form.locator('[name="name"]')).toHaveValue(
      "The 25 Minute No Knead Dough I Use to Make Everything",
    );
    /* LARGE LOAF: two steps, not three — the blank one never arrives. */
    await expect(
      form.locator('[name="instructions[1].instructions[1].text"]'),
    ).toBeAttached();
    await expect(
      form.locator('[name="instructions[1].instructions[2].text"]'),
    ).toHaveCount(0);

    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/recipe\/the-25-minute-no-knead-dough-i-use-to-make-everything$/,
    );
    await expect(
      page.getByText("Remove lid; bake 25–35 minutes"),
    ).toBeVisible();
  });

  test("a video whose description lists the recipe fills the form with no model", async ({
    page,
    writeSettings,
  }) => {
    await writeSettings({
      ytdlpPath: fixturePath("yt-dlp", "ytdlp-mimic.mjs"),
    });
    await page
      .getByLabel("Import from URL")
      .fill("https://www.youtube.com/watch?v=EVERYTHING_DOUGH_TEST");
    await page.getByRole("button", { name: "Import", exact: true }).click();

    const form = page.locator("#recipe-form");
    await expect(form.locator('[name="name"]')).toHaveValue(
      "The 25 Minute No Knead Dough I Use to Make Everything",
    );
    /* The six "∙" lines, none of the gear links. */
    await expect(form.getByTestId("ingredient-row")).toHaveCount(6);
    await expect(
      form.locator('[name="ingredients[0].ingredient"]'),
    ).toHaveValue(/warm water/);
    /* The dough's four steps, then a group per bake — Large Loaf first. */
    await expect(form.locator('[name="instructions[4].name"]')).toHaveValue(
      "Large Loaf",
    );
    await expect(form.locator('[name="instructions[8].name"]')).toHaveValue(
      "Soft Pretzels",
    );
    await expect(form.locator('[name="instructions[9].name"]')).toHaveCount(0);

    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/recipe\/the-25-minute-no-knead-dough-i-use-to-make-everything$/,
    );
    await expect(page.getByText(/all-purpose flour/).first()).toBeVisible();
    await expect(page.getByText("Large Loaf").first()).toBeVisible();
  });

  test("a refused save says what and where, inline and in the rail", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: "Blank", exact: true }).check();
    await page.getByLabel("Name").first().fill("Refused Recipe");

    /* A blank ingredient row is harmless: it is dropped, not a problem. */
    await page
      .getByRole("button", { name: "Add ingredient", exact: true })
      .click();

    /* A step with a name and no text is a problem: it says which step. */
    await page
      .getByRole("button", { name: "Add Instruction", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add Instruction", exact: true })
      .click();
    await fillMarkdownField(page, "instructions[0].text", "Mix everything.");
    await page.locator('[name="instructions[1].name"]').fill("Bake");

    await page.getByLabel("Enter URL").check();
    await page.getByLabel("Video URL").fill("not a url");

    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();

    await expect(page.getByTestId("recipe-form-message")).toHaveText(
      "Couldn't save: 2 problems — Picture, Steps.",
    );
    await expect(page.getByTestId("section-errors-steps")).toHaveText(
      "Step 2 has no text",
    );
    await expect(page.getByTestId("section-errors-picture")).toHaveText(
      "Video link isn't a URL",
    );
    const rail = page.getByRole("navigation", { name: "Parts of this recipe" });
    await expect(rail.getByRole("link", { name: /^Steps/ })).toContainText(
      "check",
    );
    await expect(rail.getByRole("link", { name: /^Picture/ })).toContainText(
      "check",
    );
    await expect(
      page.getByRole("heading", { name: "Refused Recipe" }),
    ).toHaveCount(0);

    /* Fixed, it saves: the blank ingredient row is simply gone. */
    await fillMarkdownField(page, "instructions[1].text", "Bake 20 minutes.");
    await page.getByLabel("Video URL").fill("");
    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    await expect(page).toHaveURL(/\/recipe\/refused-recipe$/);
    await expect(page.getByText("Bake 20 minutes.")).toBeVisible();
  });
});
