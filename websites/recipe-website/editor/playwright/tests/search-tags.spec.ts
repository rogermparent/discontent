import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  searchFor,
} from "../support/helpers";

const SEARCH_TIMEOUT = 20_000;

async function gotoNewRecipe(page: Page): Promise<void> {
  await page.goto("/new-recipe");
  const heading = page.getByRole("heading", { name: "New Recipe" });
  const signIn = page.getByRole("button", {
    name: "Sign in with Credentials",
    exact: true,
  });
  await expect(heading.or(signIn).first()).toBeVisible();
  if (await signIn.isVisible()) {
    await fillSignInForm(page);
    await expect(heading).toBeVisible();
  }
  // Gate on form hydration so the first field interaction isn't dropped/reset.
  await markdownEditorReady(page, "description");
}

async function addTag(page: Page, tag: string): Promise<void> {
  const input = page.getByLabel("Add a tag");
  await input.fill(tag);
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: `Remove tag ${tag}` }),
  ).toBeVisible();
}

async function createRecipe(
  page: Page,
  {
    name,
    tags = [],
    ingredients = [],
  }: { name: string; tags?: string[]; ingredients?: string[] },
): Promise<void> {
  await gotoNewRecipe(page);
  await page.getByLabel("Name").first().clear();
  await page.getByLabel("Name").first().fill(name);

  for (const tag of tags) {
    await addTag(page, tag);
  }

  if (ingredients.length > 0) {
    await page.getByText("Paste Ingredients", { exact: true }).click();
    await page
      .getByTitle("Ingredients Paste Area")
      .fill(ingredients.join("\n"));
    await page.getByText("Import Ingredients", { exact: true }).click();
  }

  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({
    timeout: SEARCH_TIMEOUT,
  });
}

// Direct-child cards only — a card's matched-ingredient <ul><li> would
// otherwise be counted as extra list items.
const listItems = (page: Page) =>
  page.getByTestId("recipe-list").locator("> li");

test.describe("Search — tags", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("tags added on the form persist and appear on the detail page and search card", async ({
    page,
  }) => {
    // Add three chips, then remove one to prove chip removal works.
    await gotoNewRecipe(page);
    await page.getByLabel("Name").first().clear();
    await page.getByLabel("Name").first().fill("Choco Cake");
    await addTag(page, "dessert");
    await addTag(page, "chocolate");
    await addTag(page, "typo");
    await page.getByRole("button", { name: "Remove tag typo" }).click();
    await expect(
      page.getByRole("button", { name: "Remove tag typo" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Choco Cake", exact: true }),
    ).toBeVisible({ timeout: SEARCH_TIMEOUT });

    // Detail page shows the surviving tags as links to their static tag pages.
    await expect(
      page.getByRole("link", { name: "dessert", exact: true }),
    ).toHaveAttribute("href", "/tags/dessert");
    await expect(
      page.getByRole("link", { name: "chocolate", exact: true }),
    ).toBeVisible();

    // The tags survive a reload of the detail page.
    await page.reload();
    await expect(
      page.getByRole("link", { name: "dessert", exact: true }),
    ).toBeVisible();

    // The search card shows a compact tag chip.
    await page.goto("/search");
    await searchFor(page, "Choco");
    await expect(listItems(page).first().getByRole("heading")).toHaveText(
      "Choco Cake",
      { timeout: SEARCH_TIMEOUT },
    );
    await expect(
      listItems(page)
        .first()
        .getByRole("button", { name: "Filter by tag dessert" }),
    ).toBeVisible();
  });

  test("suggestions offer existing corpus tags as one-click quick-adds", async ({
    page,
  }) => {
    await createRecipe(page, { name: "Choco Cake", tags: ["dessert"] });

    // A second recipe now sees "dessert" as a suggestion chip.
    await gotoNewRecipe(page);
    await page.getByLabel("Name").first().clear();
    await page.getByLabel("Name").first().fill("Fruit Tart");
    await page.getByRole("button", { name: "Add tag dessert" }).click();
    await expect(
      page.getByRole("button", { name: "Remove tag dessert" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Fruit Tart", exact: true }),
    ).toBeVisible({ timeout: SEARCH_TIMEOUT });
    await expect(
      page.getByRole("link", { name: "dessert", exact: true }),
    ).toBeVisible();
  });

  test("the filter rail writes tag: terms into the query, and OR is typed", async ({
    page,
  }) => {
    await createRecipe(page, { name: "Apple Pie", tags: ["dessert", "baked"] });
    await createRecipe(page, { name: "Fruit Salad", tags: ["dessert"] });
    await createRecipe(page, { name: "Baguette", tags: ["baked"] });

    await page.goto("/search");
    const rail = page.locator('[aria-label="Tag filters"]');
    const railTag = (tag: string) =>
      rail.getByRole("button", { name: `Filter by tag ${tag}` });
    const field = page.getByLabel("Search recipes");

    await expect(railTag("dessert")).toBeVisible({ timeout: SEARCH_TIMEOUT });

    // A chip is no longer a selection the rail holds privately — it writes a
    // term into the field, and the URL follows.
    await railTag("dessert").click();
    await expect(field).toHaveValue("tag:dessert");
    await expect(page).toHaveURL(/\?q=tag%3Adessert/);
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    await expect(railTag("dessert")).toHaveAttribute("aria-pressed", "true");

    // One mutation path, three surfaces (PR 21b): the rail wrote the term, the
    // chip line above it shows the term, and the chip's × takes it away — after
    // which the rail chip is unpressed, because the rail holds no state of its
    // own that could disagree with the string.
    const chipLine = page.getByTestId("query-chips");
    await expect(chipLine.getByTestId("query-chip-face")).toHaveText([
      "tag:dessert",
    ]);
    await page.getByRole("button", { name: "Remove tag:dessert" }).click();
    await expect(field).toHaveValue("");
    await expect(railTag("dessert")).toHaveAttribute("aria-pressed", "false");
    await expect(chipLine).toHaveCount(0);

    // Put it back, and carry on.
    await railTag("dessert").click();
    await expect(field).toHaveValue("tag:dessert");
    await expect(listItems(page)).toHaveCount(2);

    // Adding "baked" appends a second term; adjacency means AND, so this
    // narrows to Apple Pie.
    await railTag("baked").click();
    await expect(field).toHaveValue("tag:dessert tag:baked");
    await expect(listItems(page)).toHaveCount(1);
    await expect(listItems(page).first().getByRole("heading")).toHaveText(
      "Apple Pie",
    );

    // The rail chips, clear button, and card chips stay WCAG2AA-clean while a
    // filter is active — with no ToggleGroup left in the rail.
    await expect(page.getByRole("radio")).toHaveCount(0);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations).toEqual([]);

    // Broadening is now something you *type*: OR between the two terms.
    await searchFor(page, "tag:dessert OR tag:baked");
    await expect(listItems(page)).toHaveCount(3, { timeout: SEARCH_TIMEOUT });
    await expect(page.getByTestId("search-ticker")).toHaveText(/2 FILTERS/i);

    // "Clear tags" strips only the tag terms — the free text beside them lives.
    await searchFor(page, "pie tag:dessert");
    await expect(listItems(page)).toHaveCount(1, { timeout: SEARCH_TIMEOUT });
    await page.getByRole("button", { name: "Clear tags", exact: true }).click();
    await expect(field).toHaveValue("pie");

    // Clearing the field entirely drops back to the unfiltered browse view —
    // the three fixture recipes plus the three created here.
    await searchFor(page, "");
    await expect(listItems(page)).toHaveCount(6, { timeout: SEARCH_TIMEOUT });
    await expect(page.getByTestId("search-ticker")).toHaveText(
      /ALL 6 RECIPES/i,
    );
  });

  test("a tag word is searchable and tag matches rank ahead of ingredient-only matches", async ({
    page,
  }) => {
    // Alpha matches "salmon" only via its tag; Beta only via an ingredient.
    await createRecipe(page, { name: "Alpha", tags: ["salmon"] });
    await createRecipe(page, {
      name: "Beta",
      ingredients: ["1 fillet of salmon"],
    });

    await page.goto("/search");
    await searchFor(page, "salmon");

    // Both are found (the tag word is searchable)…
    await expect(listItems(page)).toHaveCount(2, { timeout: SEARCH_TIMEOUT });
    // …and the tag match sorts first.
    await expect(listItems(page).first().getByRole("heading")).toHaveText(
      "Alpha",
    );
  });

  test("cards cap matched ingredients at three with a '+N more' overflow", async ({
    page,
  }) => {
    await createRecipe(page, {
      name: "Oil Sampler",
      ingredients: [
        "1 tsp olive oil",
        "1 tbsp coconut oil",
        "2 tbsp sesame oil",
        "1 cup vegetable oil",
        "3 tbsp peanut oil",
        "1 tsp chili oil",
      ],
    });

    await page.goto("/search");
    await searchFor(page, "oil");

    const card = listItems(page).first();
    await expect(card.getByRole("heading")).toHaveText("Oil Sampler", {
      timeout: SEARCH_TIMEOUT,
    });

    // Six ingredients match, but only three lines render + a "+3 more" overflow.
    await expect(card.locator("ul > li")).toHaveCount(4);
    await expect(card.getByText("+3 more")).toBeVisible();
    // The first matched ingredient stays visible.
    await expect(card.getByText("1 tsp olive oil")).toBeVisible();
  });
});
