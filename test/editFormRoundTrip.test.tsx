// 43e1 (D4): edit form B keeps the data model. An imported recipe opened in
// the form and saved with no changes posts back the same ingredients, tags,
// drink spec, source, steps and times it was loaded with — the form in its
// new sections, the browser building FormData from the DOM exactly as the
// page does, and the editor's own `parseRecipeFormData` reading it.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

import RecipeFields from "recipe-website-common/components/Form";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";
import type { Recipe } from "recipe-website-common/controller/types";

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
    /* The new frame: the sections are headings. */
    const headings = [...container.querySelectorAll("h2")].map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual([
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
     * The steps come back with `name: ""` on each untitled step: the
     * step-name field posts an empty string, and the schema keeps it — so
     * an untouched save writes `"name": ""` into recipe.json. Older than
     * 43e1 (the steps section's insides are 43e2's); pinned here so the
     * change, when it comes, is seen.
     */
    const withoutEmptyNames = JSON.parse(
      JSON.stringify(data.instructions, (key, value) =>
        key === "name" && value === "" ? undefined : value,
      ),
    );
    expect(withoutEmptyNames).toEqual(BEES_KNEES.instructions);
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
