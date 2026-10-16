// A recipe's lines on their way to the shopping list (38d): which lines are
// a sub-recipe, how many batches they ask for, and the expansion's guards —
// a cycle, a missing recipe, the depth cap, the switch off.

import Fraction from "fraction.js";
import { describe, expect, it, vi } from "vitest";

import type { Recipe } from "recipe-website-common/controller/types";
import {
  expandRecipeLines,
  MAX_SUBRECIPE_DEPTH,
  subRecipeLink,
  type ExpandedLine,
} from "recipe-website-common/util/shoppingLines";

type Ingredients = Pick<Recipe, "ingredients"> & { name: string };

function recipe(name: string, lines: string[]): Ingredients {
  return { name, ingredients: lines.map((ingredient) => ({ ingredient })) };
}

/** Copied shapes of corpus lines that link a recipe (never `editor/content`). */
const CORPUS: Record<string, Ingredients> = {
  "simple-syrup": recipe("Simple Syrup", [
    '<Multiplyable baseNumber="1/2" /> cup sugar',
    '<Multiplyable baseNumber="1/2" /> cup water',
  ]),
  daiquiri: recipe("Daiquiri", [
    "2 oz white rum",
    "1 oz lime juice",
    '<Multiplyable baseNumber="3/4" /> oz [simple syrup](/recipe/simple-syrup)',
  ]),
  lemonade: recipe("Lemonade", [
    "1 cup lemon juice",
    "2 batches [Simple Syrup](/recipe/simple-syrup)",
    "1/4 cup sugar",
  ]),
  "lavender-lemonade": recipe("Lavender Lemonade", [
    "1 recipe [lavender syrup](/recipe/lavender-syrup)",
    "1 cup lemon juice",
  ]),
  a: recipe("Praline Paste", ["1 batch [Caramel](/recipe/b)", "1 cup butter"]),
  b: recipe("Caramel", ["1 batch [Praline Paste](/recipe/a)", "2 tbsp butter"]),
  empty: recipe("Empty", []),
  "uses-empty": recipe("Uses Empty", ["1 batch [Empty](/recipe/empty)"]),
};

async function expand(
  slug: string,
  options: Partial<Parameters<typeof expandRecipeLines>[2]> = {},
  corpus: Record<string, Ingredients> = CORPUS,
) {
  const readRecipe = vi.fn(async (sub: string) => corpus[sub] ?? null);
  const result = await expandRecipeLines(slug, corpus[slug], {
    readRecipe,
    ...options,
  });
  return { ...result, readRecipe };
}

const summary = (lines: ExpandedLine[]) =>
  lines.map((line) => ({
    text: line.text,
    factor: line.factor.toFraction(),
    for: line.for.map((sub) => sub.slug),
  }));

describe("subRecipeLink", () => {
  it("reads batches, a recipe and no amount as multipliers", () => {
    const read = (markdown: string) => {
      const link = subRecipeLink(markdown);
      return link && { slug: link.slug, factor: link.factor.toFraction() };
    };
    expect(read("2 batches [pie crust](/recipe/pie-crust)")).toEqual({
      slug: "pie-crust",
      factor: "2",
    });
    expect(read("1 recipe [lavender syrup](/recipe/lavender-syrup)")).toEqual({
      slug: "lavender-syrup",
      factor: "1",
    });
    expect(read("half batch [simple syrup](/recipe/simple-syrup)")).toEqual({
      slug: "simple-syrup",
      factor: "1/2",
    });
    expect(
      read("[Pickled carrots & daikon slaw](/recipe/pickled-slaw)"),
    ).toEqual({ slug: "pickled-slaw", factor: "1" });
    /* Any host, as the index reads links. */
    expect(
      read(
        "a splash of [simple syrup](http://uraninite:3000/recipe/simple-syrup)",
      ),
    ).toEqual({ slug: "simple-syrup", factor: "1" });
  });

  it("reads a measure as one batch, and keeps what it called for", () => {
    const link = subRecipeLink(
      '<Multiplyable baseNumber="3/4" /> oz [simple syrup](/recipe/simple-syrup)',
    );
    expect(link?.factor.toFraction()).toBe("1");
    expect(link?.called).toEqual({
      parts: [{ qty: 0.75, unit: "oz", family: "us-weight" }],
    });
    expect(
      subRecipeLink("1/2 cup (140g) [lemon curd](/recipe/lemon-curd), homemade")
        ?.called,
    ).toBeDefined();
  });

  it("is no sub-recipe when the link is an alternative or a remark", () => {
    for (const markdown of [
      "1 teaspoon maple syrup or [simple syrup](/recipe/simple-syrup)",
      "3 Tbsp tonkatsu sauce (or make [Homemade Tonkatsu Sauce](/recipe/tonkatsu))",
      "1 oz orgeat syrup or 1/2 oz [simple syrup](/recipe/simple-syrup)",
      "1/2 oz rich [simple syrup](/recipe/simple-syrup)",
      "2 cups flour",
    ]) {
      expect(subRecipeLink(markdown), markdown).toBeNull();
    }
  });

  it("reads a bare count as one batch, noting the count (Dd9)", () => {
    for (const [markdown, qty] of [
      ["8 [corn tortillas](/recipe/corn-tortillas)", 8],
      ["2 [pie crusts](/recipe/pie-crust)", 2],
    ] as const) {
      const link = subRecipeLink(markdown);
      expect(link?.factor.toFraction(), markdown).toBe("1");
      expect(link?.called, markdown).toEqual({
        parts: [{ qty, unit: "", family: "count" }],
      });
    }
    /* "batches of" in the link text is batches. */
    expect(
      subRecipeLink(
        "2 [batches of pie dough](/recipe/pie-crust)",
      )?.factor.toFraction(),
    ).toBe("2");
  });

  it("reads a range of batches as one batch, with the range as the note", () => {
    const link = subRecipeLink("1-2 batches [pie crust](/recipe/pie-crust)");
    expect(link?.factor.toFraction()).toBe("1");
    expect(link?.calledText).toBe("1–2 batches");
    expect(
      subRecipeLink("1 to 2 recipes [pie crust](/recipe/pie-crust)")
        ?.calledText,
    ).toBe("1 to 2 recipes");
    /* A mixed number is no range. */
    expect(
      subRecipeLink(
        "1-1/2 batches [pie crust](/recipe/pie-crust)",
      )?.factor.toFraction(),
    ).toBe("3/2");
  });

  it("is no sub-recipe when something other than a remark follows the link", () => {
    for (const markdown of [
      "[Simple Syrup](/recipe/simple-syrup) or honey syrup",
      "1 batch [pie crust](/recipe/pie-crust) or 1 refrigerated crust",
      "1 batch [pie crust](/recipe/pie-crust), or store-bought",
      "1 batch [pie crust](/recipe/pie-crust) (or 1 refrigerated crust)",
      "2 batches [pie crust](/recipe/pie-crust), plus flour for rolling",
      "1 batch [pie crust](/recipe/pie-crust) plus flour for rolling",
      "1 batch [Simple Syrup](/recipe/simple-syrup) + 1 oz honey",
      "1 batch [Simple Syrup](/recipe/simple-syrup) and 1 oz honey",
    ]) {
      expect(subRecipeLink(markdown), markdown).toBeNull();
    }
    for (const markdown of [
      "[Simple syrup](/recipe/simple-syrup), optional",
      "1 batch [pie crust](/recipe/pie-crust) (see note), chilled",
      "1 batch [pie crust](/recipe/pie-crust), rolled and chilled",
    ]) {
      expect(subRecipeLink(markdown), markdown).not.toBeNull();
    }
  });

  it("is no sub-recipe on an OR: line", () => {
    expect(
      subRecipeLink("OR: 1 batch [Vanilla Sugar](/recipe/vanilla-sugar)"),
    ).toBeNull();
    expect(
      subRecipeLink(
        'or: <Multiplyable baseNumber="1" /> batch [Vanilla Sugar](/recipe/vanilla-sugar)',
      ),
    ).toBeNull();
  });

  it("takes an amount it cannot read as one batch, with the words as the note", () => {
    const link = subRecipeLink("1/0 [simple syrup](/recipe/simple-syrup)");
    expect(link?.factor.toFraction()).toBe("1");
    expect(link?.calledText).toBe("1/0");
  });
});

describe("expandRecipeLines", () => {
  it("opens a measured sub-recipe line into one batch, noting what it called for", async () => {
    const { lines, warnings } = await expand("daiquiri", {
      scale: new Fraction(2),
    });
    expect(summary(lines)).toEqual([
      { text: "2 oz white rum", factor: "1", for: [] },
      { text: "1 oz lime juice", factor: "1", for: [] },
      { text: "1/2 cup sugar", factor: "1", for: ["simple-syrup"] },
      { text: "1/2 cup water", factor: "1", for: ["simple-syrup"] },
    ]);
    /* At ×2 the drink calls for 1½ oz. */
    expect(lines[2].for).toEqual([
      { slug: "simple-syrup", name: "Simple Syrup", called: "1½ oz" },
    ]);
    /* The sub-recipe's own line numbers. */
    expect(lines.map((line) => line.line)).toEqual([0, 1, 0, 1]);
    expect(warnings).toEqual([]);
  });

  it("scales by the batches a line asks for", async () => {
    const { lines } = await expand("lemonade");
    expect(summary(lines)).toEqual([
      { text: "1 cup lemon juice", factor: "1", for: [] },
      { text: "1/2 cup sugar", factor: "2", for: ["simple-syrup"] },
      { text: "1/2 cup water", factor: "2", for: ["simple-syrup"] },
      { text: "1/4 cup sugar", factor: "1", for: [] },
    ]);
    expect(lines[1].for[0].called).toBeUndefined();
  });

  it("keeps a line whose recipe is missing as written, with a warning", async () => {
    const { lines, warnings } = await expand("lavender-lemonade");
    expect(summary(lines)).toEqual([
      { text: "1 recipe lavender syrup", factor: "1", for: [] },
      { text: "1 cup lemon juice", factor: "1", for: [] },
    ]);
    expect(warnings).toEqual([
      'Kept "1 recipe lavender syrup" as written: there is no recipe "lavender-syrup".',
    ]);
  });

  it("stops a cycle A → B → A at the line that closes it", async () => {
    const { lines, warnings } = await expand("a");
    expect(summary(lines)).toEqual([
      { text: "1 batch Praline Paste", factor: "1", for: ["b"] },
      { text: "2 tbsp butter", factor: "1", for: ["b"] },
      { text: "1 cup butter", factor: "1", for: [] },
    ]);
    expect(warnings).toEqual([
      'Kept "1 batch Praline Paste" as written: a sub-recipe cycle (a → b → a).',
    ]);
  });

  it("stops at the depth cap, and multiplies batches down the path", async () => {
    const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
    const corpus: Record<string, Ingredients> = {};
    for (let level = 0; level <= MAX_SUBRECIPE_DEPTH + 1; level++) {
      corpus[`l${level}`] = recipe(`${names[level]} Sauce`, [
        `2 batches [${names[level + 1]} Sauce](/recipe/l${level + 1})`,
        `${level + 1} eggs`,
      ]);
    }
    const { lines, warnings } = await expand("l0", {}, corpus);
    expect(summary(lines)).toEqual([
      { text: "2 batches Echo Sauce", factor: "8", for: ["l1", "l2", "l3"] },
      { text: "4 eggs", factor: "8", for: ["l1", "l2", "l3"] },
      { text: "3 eggs", factor: "4", for: ["l1", "l2"] },
      { text: "2 eggs", factor: "2", for: ["l1"] },
      { text: "1 eggs", factor: "1", for: [] },
    ]);
    expect(warnings).toEqual([
      `Kept "2 batches Echo Sauce" as written: sub-recipes nest more than ${MAX_SUBRECIPE_DEPTH} deep.`,
    ]);
  });

  it("keeps a line whose sub-recipe has no lines", async () => {
    const { lines, warnings } = await expand("uses-empty");
    expect(summary(lines)).toEqual([
      { text: "1 batch Empty", factor: "1", for: [] },
    ]);
    expect(warnings).toEqual([
      'Kept "1 batch Empty" as written: Empty has no ingredient lines.',
    ]);
  });

  it("keeps every line as written with the switch off, reading nothing", async () => {
    const { lines, warnings, readRecipe } = await expand("lemonade", {
      expand: false,
    });
    expect(lines.map((line) => line.text)).toEqual([
      "1 cup lemon juice",
      "2 batches Simple Syrup",
      "1/4 cup sugar",
    ]);
    expect(readRecipe).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
  });

  it("makes a sub-recipe's lines optional when the linking line is", async () => {
    const corpus = {
      ...CORPUS,
      sour: recipe("Sour", [
        "2 oz whiskey",
        "[Simple syrup](/recipe/simple-syrup), optional",
      ]),
    };
    const { lines } = await expand("sour", {}, corpus);
    expect(lines.map((line) => line.optional)).toEqual([false, true, true]);
  });

  it("keeps a sub-recipe line as written when an OR: line follows it", async () => {
    const corpus = {
      ...CORPUS,
      sugar: recipe("Vanilla Sugar", ["1 cup sugar", "1 vanilla bean"]),
      cookies: recipe("Sugar Cookies", [
        "2 cups flour",
        "1 batch [Simple Syrup](/recipe/simple-syrup)",
        "OR: 1/2 cup honey",
        "1/2 cup [Vanilla Sugar](/recipe/sugar)",
        "OR: 1 batch [Vanilla Sugar](/recipe/sugar)",
      ]),
    };
    const { lines, warnings } = await expand("cookies", {}, corpus);
    expect(summary(lines)).toEqual([
      { text: "2 cups flour", factor: "1", for: [] },
      { text: "1 batch Simple Syrup", factor: "1", for: [] },
      { text: "OR: 1/2 cup honey", factor: "1", for: [] },
      { text: "1/2 cup Vanilla Sugar", factor: "1", for: [] },
      { text: "OR: 1 batch Vanilla Sugar", factor: "1", for: [] },
    ]);
    expect(warnings).toEqual([]);
  });

  it("reads each sub-recipe once per shared cache", async () => {
    const cache = new Map();
    const readRecipe = vi.fn(async (sub: string) => CORPUS[sub] ?? null);
    await expandRecipeLines("lemonade", CORPUS.lemonade, { readRecipe, cache });
    await expandRecipeLines("daiquiri", CORPUS.daiquiri, { readRecipe, cache });
    expect(readRecipe).toHaveBeenCalledTimes(1);
  });
});
