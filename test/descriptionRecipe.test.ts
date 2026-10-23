// @vitest-environment node
//
// 45d: a recipe listed in a video's description — "∙" ingredient lines and
// numbered steps under a recipe heading — read without a model, and
// nothing else read as one (gear links, chapters, prose).

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

import {
  descriptionRecipe,
  withDescriptionRecipe,
} from "../websites/recipe-website/editor/controller/descriptionRecipe";
import { NO_JOB } from "../websites/recipe-website/editor/controller/jobs/context";
import type { ApplyLlmResult } from "../websites/recipe-website/editor/controller/llm/importWithLlm";

/* Brian Lagerstrom's "The 25 Minute No Knead Dough" description, as the
 * e2e's yt-dlp fixture holds it. */
const EVERYTHING_DOUGH: string = JSON.parse(
  readFileSync(
    new URL(
      "../websites/recipe-website/editor/playwright/fixtures/yt-dlp/responses/everything-dough.json",
      import.meta.url,
    ),
    "utf8",
  ),
).output.description;

/** The text of an ingredient line, its amount markup undone. */
function plain(line: string): string {
  return line.replace(/<Multiplyable baseNumber="([^"]*)" \/>/g, "$1");
}

describe("descriptionRecipe — Brian Lagerstrom's Everything Dough", () => {
  const read = descriptionRecipe(EVERYTHING_DOUGH);

  it("reads the six ∙ lines as ingredients, and no gear link", () => {
    expect(read?.ingredients.map((line) => plain(line.ingredient))).toEqual([
      "450 g (2 c) warm water, 86–90 °F",
      "7 g (2 1/4 t) instant yeast",
      "20 g (1 1/2 T) sugar",
      "20 g (1 1/2 T) olive oil",
      "15 g (2 1/2 t) salt",
      "680 g (3 3/4 c) all-purpose flour",
    ]);
  });

  it("reads the dough's steps, then one group per bake, and stops at the chapters", () => {
    const instructions = read?.instructions ?? [];
    expect(instructions.slice(0, 4).map((step) => "text" in step)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(instructions[0]).toEqual({
      text: "Combine the warm water in a tall, lidded 6 -qt container. Stir in yeast then add the sugar, olive oil, salt, and flour.",
    });
    const groups = instructions
      .slice(4)
      .map((entry) =>
        "instructions" in entry
          ? [entry.name, entry.instructions.length]
          : ["step", 1],
      );
    expect(groups).toEqual([
      ["Large Loaf", 4],
      ["Baguettes", 3],
      ["Pizza", 2],
      ["Bagels", 4],
      ["Soft Pretzels", 4],
    ]);
    const last = instructions.at(-1);
    expect(
      last && "instructions" in last ? last.instructions.at(-1)?.text : "",
    ).toMatch(/^Boil 10 seconds per side/);
  });
});

describe("descriptionRecipe — what is not a recipe", () => {
  it("a gear list of links under a heading", () => {
    expect(
      descriptionRecipe(
        [
          "🔪MY GEAR:",
          "HALF SHEET PAN: https://amzn.to/41SQxy1",
          "HALF SHEET WIRE RACK: https://amzn.to/41tasDT",
          "6qt MIXING BUCKET: https://amzn.to/3RMp0v3",
        ].join("\n"),
      ),
    ).toBeUndefined();
  });

  it("bulleted links under a recipe heading", () => {
    expect(
      descriptionRecipe(
        [
          "RECIPE LINKS:",
          "• Focaccia: https://youtu.be/1_dD-EDA95A",
          "• Pizza dough: https://youtu.be/VJu3YCykO_0",
          "• Bagels - www.example.com/bagels",
        ].join("\n"),
      ),
    ).toBeUndefined();
  });

  it("a chapter list, numbered or not", () => {
    expect(
      descriptionRecipe(
        [
          "CHAPTERS:",
          "0:00 The Everything Dough Recipe",
          "3:21 Making a big loaf of bread",
        ].join("\n"),
      ),
    ).toBeUndefined();
    expect(
      descriptionRecipe(
        [
          "Recipe chapters",
          "1. 0:00 Intro",
          "2. 1:30 The dough",
          "3. 4:10 Baking",
        ].join("\n"),
      ),
    ).toBeUndefined();
  });

  it("timestamps after the steps end the block", () => {
    const read = descriptionRecipe(
      [
        "THE RECIPE:",
        "- 500 g flour",
        "- 350 g water",
        "1. Mix.",
        "0:00 Intro",
        "1:30 Mixing",
      ].join("\n"),
    );
    expect(read?.instructions).toEqual([{ text: "Mix." }]);
  });

  it("lists with no recipe heading, and a lone ingredient", () => {
    /* 36d's fixtures: plain lines under a dish name are the model's. */
    expect(
      descriptionRecipe(
        ["Focaccia:", "500g bread flour", "400g water", "10g salt"].join("\n"),
      ),
    ).toBeUndefined();
    expect(
      descriptionRecipe(
        ["My favourites:", "• 500 g flour", "• 350 g water"].join("\n"),
      ),
    ).toBeUndefined();
    expect(
      descriptionRecipe(["Recipe:", "• 1 lemon", "1. Squeeze it."].join("\n")),
    ).toBeUndefined();
  });

  it("emphasis is not a bullet, and prose ends the block", () => {
    const read = descriptionRecipe(
      [
        "Ingredients:",
        "* 2 eggs",
        "* 1 cup milk",
        "1. Whisk together.",
        "**As an Amazon Associate I earn from qualifying purchases**",
        "* 1 cup gear",
      ].join("\n"),
    );
    expect(read?.ingredients.map((line) => plain(line.ingredient))).toEqual([
      "2 eggs",
      "1 cup milk",
    ]);
  });

  /* The 45d review's probe: gear, tools, a deal, handles, two recipes. */
  it.each([
    [
      "gear behind bare domains",
      [
        "GEAR I USE IN THIS RECIPE:",
        "• Half sheet pan: geni.us/abc123",
        "• Dutch oven: geni.us/xyz789",
        "• Scale: geni.us/scale1",
        "1. Buy them.",
      ],
    ],
    [
      "tools with no links",
      [
        "Tools for this recipe",
        "- Lodge dutch oven",
        "- Escali kitchen scale",
        "- Bench scraper",
      ],
    ],
    [
      "a sponsor's code",
      [
        "Get the recipe kit",
        "• Use code CHEF50 for 50% off",
        "• Free shipping on your first box",
        "1. Order today.",
      ],
    ],
    [
      "social handles",
      [
        "More recipe ideas",
        "• Instagram: @chefjohn",
        "• TikTok: @chefjohn",
        "1. Follow along.",
      ],
    ],
    [
      "a bare domain with no path",
      [
        "Recipe ingredients",
        "• Flour from kingarthur.com",
        "• Salt from example.shop",
        "1. Mix.",
      ],
    ],
    [
      "a list with no steps",
      ["Recipe ingredients", "• 2 eggs", "• 1 cup milk", "• 1 cup flour"],
    ],
    [
      "prose under the heading",
      [
        "The recipe",
        "I make this every week with my kids and it's great.",
        "• 2 eggs",
        "• 1 cup milk",
        "1. Mix.",
      ],
    ],
    ["chapters under a recipe heading", ["Recipe", "0:00 Intro", "1:23 Dough"]],
    [
      "two recipes, the model's to split",
      [
        "RECIPE 1: Pancakes",
        "• 200 g flour",
        "• 2 eggs",
        "1. Mix.",
        "2. Cook.",
        "RECIPE 2: Waffles",
        "• 300 g flour",
        "• 3 eggs",
        "1. Mix waffles.",
        "2. Iron.",
      ],
    ],
    [
      "two recipes in blocks apart",
      [
        "Pancake recipe:",
        "• 200 g flour",
        "• 2 eggs",
        "1. Mix.",
        "",
        "Some chat about breakfast.",
        "",
        "Waffle recipe:",
        "• 300 g flour",
        "• 3 eggs",
        "1. Iron.",
      ],
    ],
  ])("%s", (_name, lines) => {
    expect(descriptionRecipe(lines.join("\n"))).toBeUndefined();
  });

  it('an "Ingredients:" label under the recipe heading is not a second recipe', () => {
    const read = descriptionRecipe(
      [
        "THE RECIPE:",
        "Ingredients:",
        "• 2 eggs",
        "• 1 cup milk",
        "Instructions:",
        "1. Whisk.",
      ].join("\n"),
    );
    expect(read?.instructions).toEqual([{ text: "Whisk." }]);
    expect(read?.ingredients).toHaveLength(2);
  });

  it("an ingredient part's heading before its bullets", () => {
    const read = descriptionRecipe(
      [
        "INGREDIENTS",
        "Dough:",
        "• 500 g flour",
        "• 350 g water",
        "Sauce",
        "• 1 can tomatoes",
        "Instructions:",
        "1) Mix the dough.",
        "2) Make the sauce.",
      ].join("\n"),
    );
    expect(read?.ingredients.map((line) => plain(line.ingredient))).toEqual([
      "Dough:",
      "500 g flour",
      "350 g water",
      "Sauce:",
      "1 can tomatoes",
    ]);
    expect(read?.ingredients[0].type).toBe("heading");
    expect(read?.instructions).toEqual([
      { text: "Mix the dough." },
      { text: "Make the sauce." },
    ]);
  });
});

describe("withDescriptionRecipe — the model's reading wins", () => {
  const video = {
    name: "The 25 Minute No Knead Dough",
    videoImportUrl: "https://www.youtube.com/watch?v=x",
  };

  it("fills an import that has no ingredients and no steps", () => {
    const applied: ApplyLlmResult = { recipe: video, warnings: [] };
    const filled = withDescriptionRecipe(applied, EVERYTHING_DOUGH, NO_JOB);
    expect(filled.recipe?.ingredients).toHaveLength(6);
    expect(filled.recipe?.name).toBe(video.name);
    expect(filled.recipe?.videoImportUrl).toBe(video.videoImportUrl);
  });

  it("never replaces a reading that has a body, a batch, or a followed page", () => {
    const read: ApplyLlmResult = {
      recipe: { ...video, ingredients: [{ ingredient: "flour" }] },
      warnings: [],
    };
    expect(withDescriptionRecipe(read, EVERYTHING_DOUGH, NO_JOB)).toBe(read);
    const steps: ApplyLlmResult = {
      recipe: { ...video, instructions: [{ text: "Mix." }] },
      warnings: [],
    };
    expect(withDescriptionRecipe(steps, EVERYTHING_DOUGH, NO_JOB)).toBe(steps);
    const batch: ApplyLlmResult = {
      recipe: video,
      recipes: [],
      warnings: [],
    };
    expect(withDescriptionRecipe(batch, EVERYTHING_DOUGH, NO_JOB)).toBe(batch);
    const followed: ApplyLlmResult = {
      recipe: video,
      followed: "https://example.com/recipe",
      warnings: [],
    };
    expect(withDescriptionRecipe(followed, EVERYTHING_DOUGH, NO_JOB)).toBe(
      followed,
    );
  });

  it("is no longer partial — unless the model was forced or failed", () => {
    const partial = { ...video, partial: true };
    expect(
      withDescriptionRecipe(
        { recipe: partial, warnings: [] },
        EVERYTHING_DOUGH,
        NO_JOB,
      ).recipe?.partial,
    ).toBeUndefined();
    const forced: ApplyLlmResult = {
      recipe: partial,
      llm: { model: "m", mode: "force", found: false },
      warnings: [],
    };
    expect(
      withDescriptionRecipe(forced, EVERYTHING_DOUGH, NO_JOB).recipe?.partial,
    ).toBe(true);
    const failed: ApplyLlmResult = {
      recipe: partial,
      llm: { model: "m", mode: "auto", found: false, error: "timed out" },
      warnings: [],
    };
    expect(
      withDescriptionRecipe(failed, EVERYTHING_DOUGH, NO_JOB).recipe?.partial,
    ).toBe(true);
  });

  it("leaves an import alone when the description lists no recipe", () => {
    const applied: ApplyLlmResult = { recipe: video, warnings: [] };
    expect(withDescriptionRecipe(applied, "Just a vlog.", NO_JOB)).toBe(
      applied,
    );
  });
});
