// 43e1 (D4): edit form B keeps the data model. An imported recipe opened in
// the form and saved with no changes posts back the same ingredients, tags,
// drink spec, source, steps and times it was loaded with — the form in its
// new sections, the browser building FormData from the DOM exactly as the
// page does, and the editor's own `parseRecipeFormData` reading it.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import RecipeFields from "recipe-website-common/components/Form";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import { serializeFacetCounts } from "recipe-website-common/components/Form/Tags/tagPicker";
import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";
import type { Recipe } from "recipe-website-common/controller/types";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import {
  buildFacetModel,
  countFacets,
  type FacetTerm,
} from "recipe-website-common/util/facets";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Bee's Knees as the importer and the curator leave it: a drink, scaled amounts, a heading, a group of steps. */
const BEES_KNEES: Recipe = {
  name: "Bee's Knees (A Couple Cooks)",
  date: 1_760_400_000_000,
  description: "A gin sour sweetened with honey syrup.",
  recipeYield: '<Multiplyable baseNumber="1" /> drink',
  tags: ["drink", "gin", "sour", "shaken", "bees-knees"],
  ingredients: [
    { ingredient: "For the drink", type: "heading" },
    { ingredient: '<Multiplyable baseNumber="2" /> oz gin' },
    { ingredient: '<Multiplyable baseNumber="1" /> oz lemon juice' },
    {
      ingredient:
        '<Multiplyable baseNumber="3/4" /> oz [honey syrup](/recipe/honey-syrup)',
    },
    /* A hand-placed mark `createIngredient` would not make, and markdown. */
    { ingredient: 'Juice of <Multiplyable baseNumber="1/2" /> **lemon**' },
    { ingredient: "Lemon twist*" },
  ],
  instructions: [
    {
      name: "Shake",
      instructions: [
        { text: "Add the gin, lemon juice and honey syrup to a shaker." },
        { text: "Fill with ice and shake until very cold." },
      ],
    },
    { text: "Strain into a coupe." },
  ],
  prepTime: 5,
  cookTime: 2,
  totalTime: 7,
  image: "bees-knees.jpg",
  video: "bees-knees.mp4",
  timelines: [
    {
      name: "Make it",
      note: "Syrup first.",
      events: [
        { name: "Honey syrup", activeTime: true, defaultLength: 3 },
        { name: "Chill the glass", activeTime: false, defaultLength: 10 },
      ],
    },
  ],
  source: {
    url: "https://www.acouplecooks.com/bees-knees-cocktail/",
    name: "A Couple Cooks",
    author: "Sonja Overhiser",
  },
  drink: {
    method: "shake",
    glass: "coupe",
    ice: "up",
    garnish: "lemon twist or peel",
  },
};

describe("edit form B saves an unchanged recipe unchanged (D4)", () => {
  it("posts the stored ingredients, tags and drink spec back as they were", async () => {
    const { container } = render(
      <RecipeFormShell
        action={() => {}}
        recipe={BEES_KNEES}
        slug="bees-knees-acouplecooks"
      >
        <RecipeFields recipe={BEES_KNEES} slug="bees-knees-acouplecooks" />
      </RecipeFormShell>,
    );
    /* Let the Lexical fields mount and mirror their values. */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const form = container.querySelector("form#recipe-form");
    expect(form).toBeTruthy();
    /* The new frame: the sections are headings — on a drink, the drink
     * spec first (43e2). */
    const headings = [...container.querySelectorAll("h2")].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual([
      "Drink spec",
      "Recipe",
      "Tags",
      "Picture and video",
      "Ingredients",
      "Steps",
      "Times",
      "Source and address",
    ]);

    const parsed = parseRecipeFormData(new FormData(form as HTMLFormElement));
    expect(parsed.success).toBe(true);
    const data = parsed.data!;
    expect(data.ingredients).toEqual(BEES_KNEES.ingredients);
    expect(data.tags).toEqual(BEES_KNEES.tags);
    expect(JSON.parse(JSON.stringify(data.drink))).toEqual(BEES_KNEES.drink);
    /*
     * The steps come back exactly: 43e1 found every untitled step written
     * back with `"name": ""` (the name field posts an empty string); since
     * 43e2 the schema reads an empty step name as none. Compared as the
     * JSON that lands in recipe.json.
     */
    expect(JSON.parse(JSON.stringify(data.instructions))).toEqual(
      BEES_KNEES.instructions,
    );
    expect(JSON.parse(JSON.stringify(data.source))).toEqual(BEES_KNEES.source);
    expect(data.name).toBe(BEES_KNEES.name);
    expect(data.slug).toBe("bees-knees-acouplecooks");
    expect(data.prepTime).toBe(5);
    expect(data.cookTime).toBe(2);
    expect(data.totalTime).toBe(7);
    expect(data.date).toBe(BEES_KNEES.date);
    expect(JSON.parse(JSON.stringify(data.timelines))).toEqual(
      BEES_KNEES.timelines,
    );
    /* Untouched picture and video: no clear flag rides along. */
    expect(data.clearImage).toBeFalsy();
    expect(data.clearVideo).toBeFalsy();
    expect(data.description).toBe(BEES_KNEES.description);
    expect(data.recipeYield).toBe(BEES_KNEES.recipeYield);
  });
});

/* The vocabulary the food recipe is picked from (43e2): a chain and an alias. */
const TERMS: FacetTerm[] = [
  { slug: "course", label: "Course", record: true },
  { slug: "dessert", label: "Desserts", parent: "course", record: true },
  { slug: "cookies", label: "Cookies", parent: "dessert", record: true },
  { slug: "cuisine", label: "Cuisine", record: true },
  {
    slug: "american",
    label: "American",
    parent: "cuisine",
    aliases: ["usa"],
    record: true,
  },
  { slug: "holidays", label: "Holidays", record: true },
  { slug: "christmas", label: "Christmas", parent: "holidays", record: true },
];

/** Sally's crisp molasses cookies, as imported and tagged by hand. */
const MOLASSES: Partial<ImportedRecipe> = {
  name: "Crisp Molasses Cookies",
  date: 1_760_400_000_000,
  description: "Crisp edges, packed with spice.",
  recipeYield: 'about <Multiplyable baseNumber="30" /> cookies',
  /* Spelled as carried: an alias and a label, not slugs. */
  tags: ["Cookies", "usa"],
  suggestedTags: ["Christmas", "Dessert", "cookie recipes"],
  ingredients: [
    { ingredient: "Dough", type: "heading" },
    {
      ingredient:
        '<Multiplyable baseNumber="2" /> cups (<Multiplyable baseNumber="250" />g) all-purpose flour',
    },
    { ingredient: '<Multiplyable baseNumber="1" /> tsp baking soda' },
    { ingredient: "granulated or coarse sugar* — for rolling" },
  ],
  instructions: [
    { text: "Whisk the flour and baking soda together." },
    { text: "Cover and chill the dough for 1 hour." },
  ],
  prepTime: 75,
  cookTime: 13,
  totalTime: 110,
};

function renderForm(recipe: Partial<ImportedRecipe>, slug: string) {
  const model = buildFacetModel(TERMS);
  const tagPicker = {
    terms: TERMS,
    counts: serializeFacetCounts(
      countFacets(model, [{ tags: ["cookies"] }, { tags: ["american"] }]),
    ),
  };
  return render(
    <RecipeFormShell
      action={() => {}}
      recipe={recipe}
      slug={slug}
      tagPicker={tagPicker}
    >
      <RecipeFields recipe={recipe} slug={slug} />
    </RecipeFormShell>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

function post(container: HTMLElement) {
  const form = container.querySelector("form#recipe-form") as HTMLFormElement;
  const parsed = parseRecipeFormData(new FormData(form));
  expect(parsed.success).toBe(true);
  return parsed.data!;
}

describe("edit form B's fields keep a food recipe as it was (43e2, D4)", () => {
  it("posts tags as carried, ingredients with headings and markup, steps", async () => {
    const { container } = renderForm(MOLASSES, "crisp-molasses-cookies");
    await settle();
    /* A food recipe: no drink spec; its facet rows are drawn. */
    expect(
      [...container.querySelectorAll("h2")].map((h) => h.textContent)[0],
    ).toBe("Recipe");
    const cookies = container.querySelector('[data-facet-row="cookies"]');
    expect(cookies?.getAttribute("aria-pressed")).toBe("true");
    /* Desserts is reached through Cookies — shown, not added. */
    const desserts = container.querySelector('[data-facet-row="dessert"]');
    expect(desserts?.getAttribute("aria-pressed")).toBe("false");
    expect(desserts?.textContent).toContain("through a chosen tag");
    /* The import's suggestions wait, dashed, until accepted. */
    expect(
      screen.getByRole("button", { name: "Accept suggested tag Christmas" }),
    ).toBeTruthy();
    /* The flagged line says so. */
    expect(container.textContent).toContain(
      "points at a note on the page that did not come in",
    );
    /* The steps say what they use, and the wait. */
    expect(container.textContent).toContain("a wait in it:");
    expect(container.textContent).toContain("chill 1 hour");

    const data = post(container);
    expect(data.tags).toEqual(["cookies", "usa"]);
    expect(data.ingredients).toEqual(MOLASSES.ingredients);
    expect(JSON.parse(JSON.stringify(data.instructions))).toEqual(
      MOLASSES.instructions,
    );
    expect(data.drink).toBeUndefined();
    expect(data.recipeYield).toBe(MOLASSES.recipeYield);
  });

  it("re-marks only the line that was edited", async () => {
    const { container } = renderForm(MOLASSES, "crisp-molasses-cookies");
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: /Ingredient 3: .*baking soda/ }),
    );
    const field = screen.getByLabelText("Ingredient 3", { exact: true });
    expect((field as HTMLInputElement).value).toBe("1 tsp baking soda");
    fireEvent.change(field, { target: { value: "2 tsp baking soda" } });
    fireEvent.blur(field);
    const data = post(container);
    expect(data.ingredients).toEqual([
      MOLASSES.ingredients![0],
      MOLASSES.ingredients![1],
      { ingredient: '<Multiplyable baseNumber="2" /> tsp baking soda' },
      MOLASSES.ingredients![3],
    ]);
  });

  it("accepting a suggestion adds the term's slug; a facet chip toggles it", async () => {
    const { container } = renderForm(MOLASSES, "crisp-molasses-cookies");
    await settle();
    fireEvent.click(
      screen.getByRole("button", { name: "Accept suggested tag Christmas" }),
    );
    fireEvent.click(
      container.querySelector('[data-facet-row="cookies"]') as HTMLElement,
    );
    expect(post(container).tags).toEqual(["usa", "christmas"]);
  });
});
