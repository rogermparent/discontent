// @vitest-environment node
//
// 50e: the recipes a recipe page links to. Which links count (on fixtures:
// trimmed copies of the two Zoë Bakes pages and Sally's pecan pie, each
// fetched once on 2026-11-21), which line a linked recipe makes, the line
// rewritten to 38d's sub-recipe form, one batch for a sub-recipe two lines
// share, and NFC for what an import stores.

import { readFileSync } from "fs";
import Fraction from "fraction.js";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";

import type { Recipe } from "recipe-website-common/controller/types";
import { fold } from "recipe-website-common/util/fold";
import {
  mapRecipePage,
  parseRecipePage,
} from "recipe-website-common/util/importRecipeData";
import {
  parseIngredientLine,
  nameKey,
} from "recipe-website-common/util/ingredientNames";
import {
  linkLine,
  matchLinkedLines,
  namesRecipe,
} from "recipe-website-common/util/linkedLines";
import {
  findLinkedRecipes,
  linkedLineTexts,
  MAX_LINKED_RECIPES,
} from "recipe-website-common/util/linkedRecipes";
import { createIngredient } from "recipe-website-common/util/parseIngredients";
import { expandRecipeLines } from "recipe-website-common/util/shoppingLines";
import { composed } from "../websites/recipe-website/editor/controller/curation/importRecipe";
import { fittingTags } from "../websites/recipe-website/editor/controller/curation/linkedImport";

const FIXTURES = join(__dirname, "fixtures", "linked");
const CAKE_URL = "https://zoebakes.com/2019/10/13/pear-panna-cotta-cake/";
const PEARS_URL = "https://www.zoebakes.com/2008/02/01/poached-pears/";
const PECAN_URL =
  "https://sallysbakingaddiction.com/my-favorite-pecan-pie-recipe/";

function page(file: string, url: string) {
  const html = readFileSync(join(FIXTURES, file), "utf8");
  const recipe = mapRecipePage(url, parseRecipePage(html, url))!;
  return { html, recipe, ...linkedLineTexts(recipe.ingredients) };
}

const lines = (texts: string[]) => texts.map((text) => createIngredient(text)!);

describe("findLinkedRecipes", () => {
  it("finds the cake's poached pears on its purée line, and not the crème fraîche offered instead of the sour cream", () => {
    const cake = page("zoebakes-pear-panna-cotta-cake.html", CAKE_URL);
    const found = findLinkedRecipes(cake.html, CAKE_URL, cake);
    expect(found.candidates).toEqual([
      {
        url: PEARS_URL,
        text: "poach the pears as instructed here",
        where: "ingredient",
        line: 9,
        sameSite: true,
      },
    ]);
    expect(cake.recipe.ingredients![9].ingredient).toMatch(/pear puree$/);
    expect(found.skipped).toEqual([
      expect.objectContaining({
        text: "creme fraiche",
        reason: "offered instead of this line, not used by it",
      }),
    ]);
    /* "I combined Swedish Cream with a poached pear puree" is prose. */
    expect(JSON.stringify(found)).not.toContain("swedish-cream");
  });

  it("finds nothing on the poached pears' own page", () => {
    const pears = page("zoebakes-poached-pears.html", PEARS_URL);
    expect(findLinkedRecipes(pears.html, PEARS_URL, pears)).toEqual({
      candidates: [],
      skipped: [],
    });
  });

  it("follows the first of two crusts on Sally's crust line, and no prose, shop or serving link", () => {
    const pecan = page("sally-pecan-pie.html", PECAN_URL);
    const found = findLinkedRecipes(pecan.html, PECAN_URL, pecan);
    expect(found.candidates).toEqual([
      {
        url: "https://sallysbakingaddiction.com/baking-basics-homemade-buttery-flaky-pie-crust/",
        text: "Pie Crust",
        where: "ingredient",
        line: 0,
        sameSite: true,
      },
    ]);
    expect(found.skipped.map((skip) => skip.text)).toEqual([
      "All Butter Pie Crust",
    ]);
    /* Not "if you have homemade vanilla extract, go ahead and use it",
     * nor "top with whipped cream", nor the notes' other pies. */
    const all = JSON.stringify(found);
    for (const slug of ["vanilla-extract", "whipped-cream", "pumpkin-pie"]) {
      expect(all).not.toContain(slug);
    }
  });

  const card = (items: string, extra = "") =>
    `<html><head><link rel="canonical" href="https://a.test/cake/"></head><body><div class="entry-content">${extra}<div class="wprm-recipe-container"><ul class="wprm-recipe-ingredients">${items}</ul></div></div></body></html>`;
  const cakeLines = linkedLineTexts([
    { ingredient: "Crust", type: "heading" },
    { ingredient: "1 pie dough" },
    { ingredient: "2 cups jam" },
    { ingredient: "Swedish cream", type: "heading" },
    { ingredient: "1 cup cream" },
  ]);

  it("takes another site's link only when it says recipe, and a body link only with a cue", () => {
    const html = card(
      '<li class="wprm-recipe-ingredient">1 pie dough <a href="https://b.test/crust/">my crust</a></li>' +
        '<li class="wprm-recipe-ingredient">2 cups jam <a href="https://b.test/jam/">jam recipe</a></li>',
      '<p>Make <a href="https://a.test/tart/">my tart</a> too.</p>' +
        '<p>See my <a href="https://a.test/scones/">scones</a>.</p>' +
        '<p>Glaze it as <a href="https://a.test/glaze/">instructed here</a>.</p>' +
        '<p>I combined <a href="https://a.test/swedish-cream/">Swedish Cream</a> — see the recipe.</p>',
    );
    const found = findLinkedRecipes(html, "https://a.test/cake/", cakeLines);
    expect(found.candidates.map((c) => [c.url, c.where, c.line])).toEqual([
      ["https://b.test/jam/", "ingredient", 2],
      ["https://a.test/glaze/", "body", undefined],
    ]);
    expect(found.skipped).toEqual([
      {
        url: "https://b.test/crust/",
        text: "my crust",
        reason: "another site, and nothing says it is a recipe",
      },
      {
        url: "https://a.test/scones/",
        text: "scones",
        reason: "mentioned, not used by any line",
      },
      {
        url: "https://a.test/swedish-cream/",
        text: "Swedish Cream",
        reason: "names a section this recipe writes out itself",
      },
    ]);
  });

  it(`stops at ${MAX_LINKED_RECIPES} linked recipes, saying which were left`, () => {
    const items = Array.from(
      { length: 7 },
      (_, n) =>
        `<li class="wprm-recipe-ingredient">${n + 1} cup thing${n} <a href="/r/${n}/">here</a></li>`,
    ).join("");
    const found = findLinkedRecipes(card(items), "https://a.test/cake/");
    expect(found.candidates).toHaveLength(MAX_LINKED_RECIPES);
    expect(found.skipped.map((skip) => skip.reason)).toEqual([
      "over the limit of 5 linked recipes per import",
      "over the limit of 5 linked recipes per import",
    ]);
  });
});

const PEARS = {
  slug: "poached-pears",
  name: "Poached Pears",
  ingredients: [
    '<Multiplyable baseNumber="1" /> bottle pear juice (<Multiplyable baseNumber="32" /> oz)',
    "6-8 whole pears, peeled and cored",
  ],
};

describe("matching lines to a linked recipe", () => {
  it("reads what a recipe makes from its name", () => {
    const line = (text: string) => createIngredient(text)!.ingredient;
    expect(namesRecipe(line("2 cups pear purée"), PEARS)).toBe(true);
    expect(namesRecipe(line("1 1/2 cups pear poaching liquid"), PEARS)).toBe(
      true,
    );
    /* Its own ingredient is bought, not poached; a pear is just a pear. */
    expect(namesRecipe(line("1 bottle pear juice"), PEARS)).toBe(false);
    expect(namesRecipe(line("1 firm pear, for the garnish"), PEARS)).toBe(
      false,
    );
    const crust = { name: "All-Butter Pie Crust" };
    expect(namesRecipe(line("2 cups pie dough"), crust)).toBe(true);
    expect(namesRecipe(line("1 unbaked pie crust"), crust)).toBe(true);
    expect(namesRecipe(line("4 tbsp butter"), crust)).toBe(false);
    expect(
      namesRecipe(line("1 cup chocolate chips"), {
        name: "Chocolate Chip Cookies",
      }),
    ).toBe(false);
    /* A one-word name claims only the thing itself (review). */
    const no = (text: string, name: string) =>
      expect(namesRecipe(line(text), { name }), `${text} ← ${name}`).toBe(
        false,
      );
    no("2 tbsp maple syrup", "Simple Syrup");
    no("1/4 cup corn syrup", "Simple Syrup");
    no("2 cups bread cubes", "Homemade Bread");
    no("1 cup caramel candies", "Easy Caramel");
    no("2 cups roasted garlic mashed potatoes", "Roasted Garlic");
    expect(
      namesRecipe(line("1 oz simple syrup"), { name: "Simple Syrup" }),
    ).toBe(true);
    expect(namesRecipe(line("1 loaf bread"), { name: "Homemade Bread" })).toBe(
      true,
    );
  });

  it("matches the line the page linked, then the lines that name it, one recipe per line", () => {
    const ingredients = lines([
      "2 cups (600g) pear puree",
      "1 cup sugar",
      "1 1/2 cups (350ml) Pear Poaching Liquid (strained)",
      "1 cup [jam](/recipe/jam)",
      "1 firm pear",
    ]);
    expect(matchLinkedLines(ingredients, [{ ...PEARS, line: 0 }])).toEqual([
      { line: 0, slug: "poached-pears", how: "link" },
      { line: 2, slug: "poached-pears", how: "name" },
    ]);
    /* No line names it, and the linked line is a heading: nothing. */
    expect(
      matchLinkedLines(
        [{ ingredient: "Pears", type: "heading" }, ...lines(["1 cup sugar"])],
        [{ slug: "x", name: "Swedish Cream", line: 0 }],
      ),
    ).toEqual([]);
  });

  it("rewrites a line to 38d's sub-recipe form, the remark kept after the link", () => {
    const [puree, liquid, crust] = lines([
      "2 cups (600g) pear puree",
      "1 1/2 cups (350ml) Pear Poaching Liquid (strained)",
      "1 unbaked Flaky Pie Crust (what I used) or All Butter Pie Crust*",
    ]);
    expect(linkLine(puree.ingredient, "poached-pears")).toEqual({
      ingredient:
        '<Multiplyable baseNumber="2" /> cups (<Multiplyable baseNumber="600" />g) [pear puree](/recipe/poached-pears)',
      expands: true,
    });
    expect(linkLine(liquid.ingredient, "poached-pears")).toEqual({
      ingredient:
        '<Multiplyable baseNumber="1 1/2" /> cups (<Multiplyable baseNumber="350" />ml) [Pear Poaching Liquid](/recipe/poached-pears) (strained)',
      expands: true,
    });
    /* A choice stays a choice on the shopping list (Dd9). */
    const linked = linkLine(crust.ingredient, "flaky-pie-crust")!;
    expect(linked.ingredient).toContain(
      "[unbaked Flaky Pie Crust](/recipe/flaky-pie-crust) (what I used) or All Butter Pie Crust",
    );
    expect(linked.expands).toBe(false);
  });
});

describe("one batch for a sub-recipe several lines share", () => {
  type Ingredients = Pick<Recipe, "ingredients"> & { name: string };
  const recipe = (name: string, texts: string[]): Ingredients => ({
    name,
    ingredients: texts.map((ingredient) => ({ ingredient })),
  });
  const corpus: Record<string, Ingredients> = {
    "poached-pears": recipe("Poached Pears", [
      "1 bottle white wine",
      "6-8 whole pears",
    ]),
    cake: recipe("Pear Panna Cotta Cake", [
      "12 g gelatin",
      '<Multiplyable baseNumber="2" /> cups (<Multiplyable baseNumber="600" /> g) [poached pear purée](/recipe/poached-pears)',
      '<Multiplyable baseNumber="1 1/2" /> cups (<Multiplyable baseNumber="350" /> ml) [pear poaching liquid](/recipe/poached-pears), strained',
    ]),
    tart: recipe("Tart", [
      "2 batches [Poached Pears](/recipe/poached-pears)",
      "1 cup [pear purée](/recipe/poached-pears)",
    ]),
    twice: recipe("Twice", [
      "1 batch [Poached Pears](/recipe/poached-pears)",
      "1 batch [Poached Pears](/recipe/poached-pears)",
    ]),
    "pie-crust": recipe("All-Butter Pie Crust", [
      "2 1/2 cups flour",
      "1 cup butter",
    ]),
    "double-crust": recipe("Double-Crust Pie", [
      '<Multiplyable baseNumber="1" /> [All-Butter Pie Crust](/recipe/pie-crust), for the bottom',
      "6 cups apples",
      '<Multiplyable baseNumber="1" /> [All-Butter Pie Crust](/recipe/pie-crust), for the top',
    ]),
    "half-and-measure": recipe("Half and a Measure", [
      "1/2 batch [Poached Pears](/recipe/poached-pears)",
      "1 cup [pear purée](/recipe/poached-pears)",
    ]),
    "bare-twice": recipe("Bare Twice", [
      "[Poached Pears](/recipe/poached-pears)",
      "[Poached Pears](/recipe/poached-pears)",
    ]),
  };
  const expand = (slug: string, scale = new Fraction(1)) =>
    expandRecipeLines(slug, corpus[slug], {
      readRecipe: vi.fn(async (sub: string) => corpus[sub] ?? null),
      scale,
    });

  it("opens the cake's two pear lines as one batch of poached pears, noting both", async () => {
    const { lines: out, warnings } = await expand("cake");
    expect(warnings).toEqual([]);
    expect(
      out.map((line) => [line.text, line.factor.toFraction(), line.for.length]),
    ).toEqual([
      ["12 g gelatin", "1", 0],
      ["1 bottle white wine", "1", 1],
      ["6-8 whole pears", "1", 1],
    ]);
    expect(out[1].for[0]).toEqual({
      slug: "poached-pears",
      name: "Poached Pears",
      called: "2 cups poached pear purée and 1½ cups pear poaching liquid",
    });
  });

  it("sums counted lines: a double-crust pie buys two crusts", async () => {
    const { lines: out, warnings } = await expand("double-crust");
    expect(warnings).toEqual([]);
    expect(
      out.map((line) => [line.text, line.factor.toFraction(), line.for.length]),
    ).toEqual([
      ["2 1/2 cups flour", "2", 1],
      ["1 cup butter", "2", 1],
      ["6 cups apples", "1", 0],
    ]);
    expect(out[0].for[0].called).toBe(
      "1 All-Butter Pie Crust and 1 All-Butter Pie Crust",
    );
    /* No amount is ×1 each, as alone. */
    const bare = await expand("bare-twice");
    expect(bare.lines.map((line) => line.factor.toFraction())).toEqual([
      "2",
      "2",
    ]);
  });

  it("gives a half batch beside a measure one whole batch (De14)", async () => {
    const { lines: out } = await expand("half-and-measure");
    expect(out.map((line) => line.factor.toFraction())).toEqual(["1", "1"]);
  });

  it("still multiplies counted batches, which cover the measured line beside them", async () => {
    const tart = await expand("tart");
    expect(tart.lines.map((line) => line.factor.toFraction())).toEqual([
      "2",
      "2",
    ]);
    expect(tart.lines[0].for[0].called).toBe(
      "2 batches Poached Pears and 1 cup pear purée",
    );
    const twice = await expand("twice", new Fraction(2));
    expect(twice.lines.map((line) => line.factor.toFraction())).toEqual([
      "2",
      "2",
    ]);
  });
});

describe("NFC (50e)", () => {
  const decomposed = "2 cups pear purée";

  it("stores an ingredient line composed", () => {
    const stored = createIngredient(decomposed)!.ingredient;
    expect(stored).toContain("purée");
    expect(stored.normalize("NFC")).toBe(stored);
    /* And from a decomposed "½" too: the fraction is still read. */
    expect(createIngredient("½ cup purée")!.ingredient).toBe(
      '<Multiplyable baseNumber="1/2" /> cup purée',
    );
  });

  it("composes every text an import hands over", () => {
    expect(
      composed({
        name: "Crème",
        ingredients: [{ ingredient: decomposed }],
        n: 2,
      }),
    ).toEqual({
      name: "Crème",
      ingredients: [{ ingredient: "2 cups pear purée" }],
      n: 2,
    });
  });

  it("leaves the shopping name keys and the search fold indifferent to the form", () => {
    const key = (text: string) =>
      nameKey(parseIngredientLine(text)[0].alternatives[0]);
    expect(key(decomposed)).toBe(key("2 cups pear purée"));
    expect(fold(decomposed)).toBe(fold("2 cups pear purée"));
  });
});

describe("fittingTags (De5)", () => {
  it("carries a parent's tag only where the linked page says it", () => {
    expect(
      fittingTags(["dessert", "fall", "project"], {
        name: "Poached Pears",
        suggestedTags: ["Dessert", "French"],
      }),
    ).toEqual(["dessert"]);
    expect(
      fittingTags(["pies", "pear"], { name: "All-Butter Pie Crust" }),
    ).toEqual(["pies"]);
    expect(fittingTags(["pear"], { name: "Poached Pears" })).toEqual(["pear"]);
    expect(fittingTags(undefined, { name: "x" })).toEqual([]);
  });
});
