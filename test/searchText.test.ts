// @vitest-environment node
//
// 51c (D8): the curator's deep search — `searchRecipeText` over each
// recipe's steps and notes as well as the index fields, the same query
// language and filters as `searchRecipes`, its corpus kept per HEAD; and
// the `recipe_search` `deep` argument and `recipes search --deep` that
// reach it. Temp dirs only, never `editor/content`.

import { mkdtemp, readJson, rm, writeFile, writeJson } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { fieldMatches } from "../websites/recipe-website/common/components/SearchForm/queryLanguage";
import { fold } from "../websites/recipe-website/common/util/fold";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  createRecipe,
  type RecipeRow,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import {
  DEEP_FIELD_WEIGHTS,
  clearRecipeTextCache,
  matchIndex,
  recipeText,
  scoreDeepText,
  searchRecipeText,
  searchRecipes,
  snippetAt,
} from "../websites/recipe-website/editor/controller/curation/search";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { toolPhrase } from "../websites/recipe-website/editor/controller/agent/conversation";
import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { searchCommand } from "../websites/recipe-website/editor/cli/commands/search";
import { recipeToolDefinitions } from "../websites/recipe-website/editor/mcp/registry";

let contentDirectory: string;
let ctx: CurationContext;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "search-text-"));
  ctx = { contentDirectory };
  vi.stubEnv("RECIPE_LLM_URL", "");
  clearRecipeTextCache();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  clearRecipeTextCache();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

/** Roger's frother case, in miniature: a frother in a step, milk everywhere. */
async function frotherCorpus() {
  await createRecipe(ctx, {
    name: "London Fog",
    tags: ["drink", "tea"],
    totalTime: 10,
    ingredients: ["1 Earl Grey tea bag", "1/2 cup milk", "1 tsp vanilla"],
    instructions: [
      "Steep the tea in 1/2 cup boiling water for 4 minutes.",
      "Warm the milk and whip it with a handheld milk frother until foamy.",
    ],
  });
  await createRecipe(ctx, {
    name: "Slow Cooker Hot Chocolate",
    tags: ["drink", "chocolate"],
    totalTime: 180,
    ingredients: ["8 cups milk", "2 cups chocolate chips"],
    instructions: ["Stir everything in the slow cooker on low for 2 hours."],
  });
  await createRecipe(ctx, {
    name: "Rice Pudding",
    tags: ["dessert"],
    ingredients: ["1 cup rice", "4 cups milk"],
    instructions: [
      {
        name: "Cook",
        instructions: [{ text: "Simmer the rice in the milk for 30 minutes." }],
      },
    ],
    notes: [
      "For a lighter pudding, froth a splash of milk with a **frother** and fold it in.",
    ],
  });
}

describe("the steps and notes as text (recipeText)", () => {
  it("flattens step groups in order, plain words, and the notes", () => {
    expect(
      recipeText({
        instructions: [
          { text: 'Add <Multiplyable baseNumber="2" /> cups of [milk](/x).' },
          {
            name: "Froth",
            instructions: [{ text: "Use the *frother*." }, { text: "  " }],
          },
        ],
        notes: ["  Note one  ", "", "Keeps **3 days**."],
      }),
    ).toEqual({
      steps: ["Add 2 cups of milk.", "Use the frother."],
      notes: ["Note one", "Keeps 3 days."],
    });
    expect(recipeText({})).toEqual({ steps: [], notes: [] });
  });
});

describe("where a word matches (matchIndex)", () => {
  const hays = [
    "whip the milk with a milk frother",
    "frothy milk",
    "1/2 cup half-and-half",
    "crème brûlée",
    "",
  ].map(fold);
  const needles = [
    "froth",
    "milk",
    "half",
    "and",
    "half-and",
    "1/2",
    "brulee",
    "rothy",
    "a mi",
    "ee",
  ];
  it("matches exactly where fieldMatches does", () => {
    for (const hay of hays) {
      for (const needle of needles) {
        expect(matchIndex(hay, needle) >= 0, `${needle} in ${hay}`).toBe(
          fieldMatches(hay, needle),
        );
      }
    }
  });
  it("answers the match's start", () => {
    expect(matchIndex("whip the milk with a frother", "froth")).toBe(21);
    expect(matchIndex("frothy", "froth")).toBe(0);
    expect(matchIndex("a milk frother", "milk froth")).toBe(2);
    expect(matchIndex("unfrothed", "froth")).toBe(-1);
  });
  it("cuts a snippet at words, marked where it was cut", () => {
    const text =
      "Heat the milk in a small saucepan over medium heat until it steams, then whip it with a handheld frother for thirty seconds until it doubles and holds soft foam. Spoon the foam over the tea and serve at once.";
    const at = matchIndex(fold(text), "frother");
    const snippet = snippetAt(text, fold(text), at);
    expect(snippet).toMatch(/^…/);
    expect(snippet).toMatch(/…$/);
    expect(snippet).toContain("handheld frother");
    expect(snippet.length).toBeLessThanOrEqual(122);
    /* Near the end, the window moves back rather than running short. */
    const end = "word ".repeat(40) + "frother at the end.";
    const late = snippetAt(end, fold(end), matchIndex(fold(end), "frother"));
    expect(late).toMatch(/^…word/);
    expect(late).toMatch(/frother at the end\.$/);
    expect(late.length).toBeGreaterThan(100);
    expect(snippetAt("Use a frother.", "use a frother.", 6)).toBe(
      "Use a frother.",
    );
  });
});

describe("scoring the steps and notes (scoreDeepText)", () => {
  const row: RecipeRow = {
    slug: "latte",
    name: "Pumpkin Latte",
    date: 1,
    tags: ["drink"],
    ingredients: ["1 cup milk"],
    description: "A cosy cup.",
  };
  const text = {
    steps: ["Brew the espresso.", "Froth the milk with a frother."],
    notes: ["A whisk works in a pinch."],
  };
  it("counts a step or note word at weight 1, and says where", () => {
    expect(DEEP_FIELD_WEIGHTS).toMatchObject({ steps: 1, notes: 1 });
    expect(scoreDeepText(row, text, "frother")).toEqual({
      score: 1,
      found: {
        field: "steps",
        number: 2,
        text: "Froth the milk with a frother.",
      },
    });
    expect(scoreDeepText(row, text, "whisk")).toMatchObject({
      score: 1,
      found: { field: "notes", number: 1 },
    });
  });
  it("keeps each word's best field: the index fields first, no `found` for them", () => {
    /* "milk" is an ingredient (2) though step 2 says it too; "pumpkin" the name (4). */
    expect(scoreDeepText(row, text, "milk pumpkin")).toEqual({ score: 6 });
    expect(scoreDeepText(row, text, "pumpkin frother")).toMatchObject({
      score: 5,
      found: { field: "steps" },
    });
    expect(scoreDeepText(row, undefined, "frother")).toEqual({ score: 0 });
    expect(scoreDeepText(row, text, "gin")).toEqual({ score: 0 });
  });
});

describe("searchRecipeText", () => {
  beforeEach(frotherCorpus);

  it("finds a word only a step or a note has, which the index search misses", async () => {
    expect((await searchRecipes(ctx, "frother")).total).toBe(0);
    const result = await searchRecipeText(ctx, "frother");
    expect(result.deep).toBe(true);
    expect(result.recipes.map((row) => row.slug)).toEqual([
      /* Both score 1: newest first, as every tie. */
      "rice-pudding",
      "london-fog",
    ]);
    expect(result.recipes[0].found).toMatchObject({
      field: "notes",
      number: 1,
    });
    expect(result.recipes[1].found).toEqual({
      field: "steps",
      number: 2,
      text: "Warm the milk and whip it with a handheld milk frother until foamy.",
    });
  });

  it("ranks as the index search does, steps and notes at the description's weight", async () => {
    const result = await searchRecipeText(ctx, "milk frother");
    /*
     * milk is an ingredient of all three (2). London Fog's step 2 has the
     * whole phrase "milk frother" (+2); the pudding's note has frother
     * alone (+1).
     */
    expect(result.recipes.map((row) => row.slug)).toEqual([
      "london-fog",
      "rice-pudding",
      "slow-cooker-hot-chocolate",
    ]);
    expect(result.recipes[0].found).toMatchObject({
      field: "steps",
      number: 2,
    });
    expect(result.recipes[2].found).toBeUndefined();
  });

  it("several words: the phrase first, else every word the index missed (51c review)", async () => {
    await createRecipe(ctx, {
      name: "Braised Short Ribs",
      date: 1_700_000_000_000,
      instructions: [
        "Preheat the oven to 325°F.",
        "Brown the ribs in a Dutch oven, then braise for 3 hours.",
      ],
    });
    await createRecipe(ctx, {
      name: "Sugar Cookies",
      instructions: ["Preheat oven to 350°F.", "Bake for 10 minutes."],
    });
    await createRecipe(ctx, {
      name: "Oven Fries",
      instructions: ["Toss the potatoes in oil and roast."],
    });
    await createRecipe(ctx, {
      name: "Pot Roast",
      date: 1_700_000_100_000,
      instructions: ["Sear the beef, then roast it low in the oven."],
      notes: ["A Dutch-style pot works best."],
    });
    const result = await searchRecipeText(ctx, "dutch oven");
    /* Oven Fries by its name (4); the ribs by the phrase (2); the roast
     * has both words, apart (2); the cookies only "Preheat oven": gone. */
    expect(result.recipes.map((row) => row.slug)).toEqual([
      "oven-fries",
      "pot-roast",
      "braised-short-ribs",
    ]);
    expect(result.recipes[0].found).toBeUndefined();
    expect(result.recipes[1].found).toMatchObject({
      field: "notes",
      number: 1,
    });
    /* The phrase's step, not the first step that says "oven". */
    expect(result.recipes[2].found).toMatchObject({
      field: "steps",
      number: 2,
      text: "Brown the ribs in a Dutch oven, then braise for 3 hours.",
    });
    /* One word is unchanged: every "oven" step still counts. */
    const oven = await searchRecipeText(ctx, "oven");
    expect(oven.recipes.map((row) => row.slug)).toContain("sugar-cookies");
  });

  it("takes the same typed terms and negations", async () => {
    const drinks = await searchRecipeText(ctx, "frother tag:drink");
    expect(drinks.recipes.map((row) => row.slug)).toEqual(["london-fog"]);
    const notDrinks = await searchRecipeText(ctx, "frother -tag:drink");
    expect(notDrinks.recipes.map((row) => row.slug)).toEqual(["rice-pudding"]);
    const quick = await searchRecipeText(ctx, "milk time:<=30");
    expect(quick.recipes.map((row) => row.slug)).toEqual(["london-fog"]);
    /* No free text: the terms alone, as searchRecipes answers. */
    const typed = await searchRecipeText(ctx, "tag:drink");
    expect(typed.recipes.map((row) => row.slug)).toEqual(
      (await searchRecipes(ctx, "tag:drink")).recipes.map((row) => row.slug),
    );
  });

  it("pages like searchRecipes", async () => {
    const page = await searchRecipeText(ctx, "milk", { limit: 1, offset: 1 });
    expect(page.total).toBe(3);
    expect(page.recipes).toHaveLength(1);
  });
});

describe("the corpus, kept per HEAD", () => {
  it("is read again when HEAD moves, and not before", async () => {
    const git = simpleGit({ baseDir: contentDirectory });
    await git.init();
    await git.addConfig("user.email", "curator@test.local");
    await git.addConfig("user.name", "Test Curator");
    await git.addConfig("commit.gpgsign", "false");
    await writeFile(
      join(contentDirectory, ".gitignore"),
      derivedContentPaths(recipeContentTypes),
    );
    await git.add(".");
    await git.commit("Initial commit");
    ctx = {
      contentDirectory,
      author: { name: "Test Curator", email: "curator@test.local" },
    };
    await frotherCorpus();
    expect((await searchRecipeText(ctx, "frother")).total).toBe(2);

    /* An edit on disk with no commit: HEAD has not moved, so the kept corpus answers. */
    const file = join(contentDirectory, "recipes/data/london-fog/recipe.json");
    const recipe = await readJson(file);
    recipe.instructions = [{ text: "Whisk the warm milk until foamy." }];
    await writeJson(file, recipe);
    expect((await searchRecipeText(ctx, "frother")).total).toBe(2);

    await git.add(".");
    await git.commit("Edit by hand");
    const after = await searchRecipeText(ctx, "frother");
    expect(after.recipes.map((row) => row.slug)).toEqual(["rice-pudding"]);
    expect((await searchRecipeText(ctx, "whisk")).total).toBe(1);
  });

  it("outside a repository, reads every time", async () => {
    await frotherCorpus();
    expect((await searchRecipeText(ctx, "frother")).total).toBe(2);
    const file = join(contentDirectory, "recipes/data/london-fog/recipe.json");
    const recipe = await readJson(file);
    recipe.instructions = [];
    await writeJson(file, recipe);
    expect((await searchRecipeText(ctx, "frother")).total).toBe(1);
  });
});

describe("the surfaces: recipe_search deep, recipes search --deep", () => {
  beforeEach(frotherCorpus);

  it("recipe_search takes deep and answers `found` on the rows a step or note found", async () => {
    const backend = createLocalBackend(ctx);
    const tool = recipeToolDefinitions(backend).find(
      (each) => each.name === "recipe_search",
    )!;
    expect(tool.description).toContain("deep: true");
    const shallow = await tool.handler(
      tool.inputSchema.parse({ query: "frother" }),
    );
    expect((shallow.structuredContent as { total: number }).total).toBe(0);
    const deep = await tool.handler(
      tool.inputSchema.parse({ query: "frother tag:drink", deep: true }),
    );
    expect(deep.structuredContent).toMatchObject({
      deep: true,
      total: 1,
      recipes: [
        {
          slug: "london-fog",
          name: "London Fog",
          found: { field: "steps", number: 2 },
        },
      ],
    });
    expect(() => tool.inputSchema.parse({ query: "x", deep: "yes" })).toThrow();
  });

  it("the CLI's --deep reaches the same search and says where", async () => {
    const backend = createLocalBackend(ctx);
    const result = await searchCommand.run({
      backend,
      positionals: ["frother"],
      options: { deep: true },
    } as never);
    expect(result.total).toBe(2);
    const text = searchCommand.format!(result as never);
    expect(text).toContain("Found in steps and notes:");
    expect(text).toContain("london-fog: step 2: Warm the milk");
    expect(text).toMatch(/2 of 2 for "frother" \(steps and notes too\)$/);
    const plain = await searchCommand.run({
      backend,
      positionals: ["frother"],
      options: {},
    } as never);
    expect(plain.total).toBe(0);
  });

  it("a deep call reads as one in the curator's steps", () => {
    expect(
      toolPhrase({
        id: "1",
        name: "recipe_search",
        input: { query: "frother", deep: true },
      }),
    ).toBe("Searched your recipes, steps and notes too, for “frother”");
    expect(
      toolPhrase({ id: "1", name: "recipe_search", input: { query: "milk" } }),
    ).toBe("Searched your recipes for “milk”");
  });
});
