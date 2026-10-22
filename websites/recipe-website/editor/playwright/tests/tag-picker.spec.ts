import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";

/*
 * 45a: the tag picker as a field and suggestions. At rest the Tags section
 * holds the chosen chips, the field and a Suggestions area with only the
 * import's suggestions (or a hint) — no facet rows, no list of every tag.
 * Typing lists the matching terms with their counts and facets, and "New
 * tag" for text no term spells; the keyboard drives it as a combobox.
 */

const section = (page: Page) => page.locator("#recipe-section-tags");
const field = (page: Page) => page.getByLabel("Add a tag", { exact: true });
const listbox = (page: Page) =>
  page.getByRole("listbox", { name: "Tag suggestions", exact: true });
const chip = (page: Page, tag: string) =>
  page.getByRole("button", { name: `Remove tag ${tag}`, exact: true });

async function openNewRecipe(page: Page): Promise<void> {
  await page.goto("/new-recipe");
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
  await expectHydrated(field(page));
}

async function axeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include("#recipe-section-tags")
    .withTags(WCAG_TAGS)
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("Tag picker: a field and suggestions (45a)", () => {
  test("type, pick by keyboard, add a new tag, and remove", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await openNewRecipe(page);

    /* At rest: the field and a hint, and nothing listed. */
    const suggestions = page.getByTestId("tag-suggestions");
    await expect(suggestions).toContainText("Type to find a tag");
    await expect(listbox(page)).toBeHidden();
    await expect(section(page).getByRole("option")).toHaveCount(0);
    await expect(section(page).getByRole("button")).toHaveCount(0);
    await expect(field(page)).toHaveAttribute("aria-expanded", "false");
    await axeClean(page);

    /* Typing: the matches, the exact spelling first and highlighted, each
     * with its facet and count. */
    await field(page).fill("gin");
    await expect(listbox(page)).toBeVisible();
    await expect(field(page)).toHaveAttribute("aria-expanded", "true");
    const options = listbox(page).getByRole("option");
    await expect(options).toHaveCount(2);
    const gin = listbox(page).getByRole("option", {
      name: "Add tag Gin",
      exact: true,
    });
    const ginAndTonic = listbox(page).getByRole("option", {
      name: "Add tag Gin and Tonic",
      exact: true,
    });
    await expect(options.first()).toHaveAccessibleName("Add tag Gin");
    await expect(gin).toHaveAttribute("aria-selected", "true");
    await expect(gin).toContainText("Spirit & base");
    await expect(gin).toContainText("1");
    await expect(ginAndTonic).toContainText("Families");
    await expect(ginAndTonic).toContainText("2");
    await expect(suggestions).not.toContainText("Type to find a tag");
    /* A term spells it exactly: no "New tag". */
    await expect(
      listbox(page).getByRole("option", { name: /^New tag/ }),
    ).toHaveCount(0);
    await axeClean(page);

    /* ↓ moves the highlight, the field keeps focus and says which. */
    await field(page).press("ArrowDown");
    await expect(ginAndTonic).toHaveAttribute("aria-selected", "true");
    await expect(field(page)).toHaveAttribute(
      "aria-activedescendant",
      (await ginAndTonic.getAttribute("id"))!,
    );
    await field(page).press("ArrowUp");
    await expect(gin).toHaveAttribute("aria-selected", "true");
    await field(page).press("Enter");

    /* Added: a chip, the field cleared and still focused, and said. */
    await expect(chip(page, "gin")).toBeVisible();
    await expect(field(page)).toHaveValue("");
    await expect(field(page)).toBeFocused();
    await expect(section(page).locator("[aria-live=polite]")).toHaveText(
      "Added Gin",
    );
    await expect(listbox(page)).toBeHidden();

    /* What the recipe carries is not offered again. */
    await field(page).fill("gin");
    await expect(gin).toHaveCount(0);
    await expect(ginAndTonic).toBeVisible();
    await field(page).fill("Gin");
    await expect(gin).toHaveCount(0);

    /* An alias finds its term. */
    await field(page).fill("daiquiris");
    await expect(
      listbox(page).getByRole("option", {
        name: "Add tag Daiquiri",
        exact: true,
      }),
    ).toContainText("“Daiquiris”");

    /* Text no term spells: "New tag", which Enter takes. */
    await field(page).fill("Porch Season");
    const newTag = listbox(page).getByRole("option", {
      name: "New tag porch season",
      exact: true,
    });
    await expect(newTag).toBeVisible();
    await field(page).press("Enter");
    await expect(chip(page, "porch season")).toBeVisible();
    await expect(field(page)).toBeFocused();

    /* Typed again, it is already on the recipe. */
    await field(page).fill("porch season");
    await expect(section(page)).toContainText(
      "“porch season” is already on this recipe.",
    );
    await expect(
      listbox(page).getByRole("option", { name: /^New tag/ }),
    ).toHaveCount(0);

    /* Escape clears the text; Backspace in an empty field removes nothing. */
    await field(page).press("Escape");
    await expect(field(page)).toHaveValue("");
    await field(page).press("Backspace");
    await expect(chip(page, "porch season")).toBeVisible();

    /* A click on a match adds it, and keeps the field focused. */
    await field(page).fill("vod");
    await listbox(page)
      .getByRole("option", { name: "Add tag Vodka", exact: true })
      .click();
    await expect(chip(page, "vodka")).toBeVisible();
    await expect(field(page)).toBeFocused();

    /* A chip's own button removes it. */
    await chip(page, "gin").click();
    await expect(chip(page, "gin")).toHaveCount(0);
    await expect(chip(page, "vodka")).toBeVisible();

    /* What is submitted: the chosen tags, as carried. */
    await expect(
      page.locator('#recipe-form input[type="hidden"][name^="tags["]'),
    ).toHaveCount(2);
  });

  test("an import's suggestions wait at rest, dashed, until accepted", async ({
    page,
    resetData,
    request,
    createApiToken,
    baseURL,
  }) => {
    await resetData("importable-uploads");
    const token = await createApiToken();
    const headers = { authorization: `Bearer ${token}` };
    /* A facet root and a term under it that the page's keywords name. */
    const root = await request.post("/api/taxonomies/tag", {
      headers,
      data: { label: "Main ingredient", slug: "main-ingredient" },
    });
    expect(root.status()).toBe(201);
    const pork = await request.post("/api/taxonomies/tag", {
      headers,
      data: { label: "Pork", slug: "pork", parent: "main-ingredient" },
    });
    expect(pork.status()).toBe(201);

    await openNewRecipe(page);
    const importButton = page.getByRole("button", {
      name: "Import",
      exact: true,
    });
    await expectHydrated(importButton);
    await page
      .getByLabel("Import from URL", { exact: true })
      .fill(new URL("/uploads/katsudon.html", baseURL!).href);
    await importButton.click();
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
      "Katsudon",
    );

    /* Suggested, never applied by itself (43e2). */
    const accept = page.getByRole("button", {
      name: "Accept suggested tag Pork",
      exact: true,
    });
    await expect(accept).toBeVisible();
    await expect(
      page.getByRole("group", { name: "From the import", exact: true }),
    ).toBeVisible();
    await expect(chip(page, "pork")).toHaveCount(0);
    await expect(
      page.locator('#recipe-form input[type="hidden"][name^="tags["]'),
    ).toHaveCount(0);

    /* Typing a suggested term marks it among the matches, too. */
    await field(page).fill("por");
    await expect(
      listbox(page).getByRole("option", { name: "Add tag Pork", exact: true }),
    ).toContainText("Main ingredient");
    await field(page).press("Escape");
    await expect(accept).toBeVisible();

    await accept.click();
    await expect(chip(page, "pork")).toBeVisible();
    await expect(accept).toHaveCount(0);
    await expect(field(page)).toBeFocused();
    await expect(section(page).locator("[aria-live=polite]")).toHaveText(
      "Added Pork",
    );
  });

  test("on a phone, chips wrap and every target is at least 24 px", async ({
    page,
    resetData,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await resetData("drinks-bar");
    await openNewRecipe(page);

    for (const tag of [
      "a fairly long tag name",
      "another long tag",
      "third tag",
    ]) {
      await field(page).fill(tag);
      await field(page).press("Enter");
      await expect(chip(page, tag)).toBeVisible();
    }
    /* The chips wrap inside the section rather than running off the page. */
    const tagsBox = (await section(page).boundingBox())!;
    for (const tag of ["a fairly long tag name", "third tag"]) {
      const box = (await chip(page, tag).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      expect(box.x + box.width).toBeLessThanOrEqual(
        tagsBox.x + tagsBox.width + 1,
      );
    }
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);

    await field(page).fill("gin");
    for (const option of await listbox(page).getByRole("option").all()) {
      const box = (await option.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });
});
