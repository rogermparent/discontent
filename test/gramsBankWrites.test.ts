// @vitest-environment node
//
// Epic 51, 51f: the gram bank's writes (`conversions/grams.json`, one commit
// each, under the write lock) in a real scratch git repository; the model
// step ("Ask the model for the rest") on a stand-in model, never a real one;
// `recipes grams` over a stored recipe (paste, bank, dry run, one commit);
// the shopping list reading the same bank; and `conversions` unindexed.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import {
  CONVERSIONS_FILE,
  gramsBankRows,
  readGramsBank,
  readGramsBankChecked,
  resetGrams,
  setGrams,
} from "../websites/recipe-website/editor/controller/curation/conversions";
import { readShoppingView } from "../websites/recipe-website/editor/controller/curation/shopping";
import { readGramsBankEntries } from "recipe-website-common/controller/data/readGramsBank";
import { gramsForRecipe } from "../websites/recipe-website/editor/controller/curation/gramsRecipe";
import {
  createRecipe,
  getRecipe,
  updateRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import { UNINDEXED_DIRECTORIES } from "../websites/recipe-website/editor/controller/curation/unindexed";
import {
  askGrams,
  gramsUserPrompt,
  referenceRows,
} from "../websites/recipe-website/editor/controller/llm/gramsModel";
import type {
  ChatJsonRequest,
  ChatJsonResult,
  LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import { gramsCommand } from "../websites/recipe-website/editor/cli/commands/grams";
import { createIngredient } from "recipe-website-common/util/parseIngredients";
import {
  gramsPerCupTable,
  gramsTableOf,
} from "recipe-website-common/util/gramsBank";
import { buildShoppingView } from "recipe-website-common/util/shoppingView";
import { DEFAULT_SHOPPING_SETTINGS } from "recipe-website-common/util/shoppingTypes";

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

async function initTestRepo(directory: string): Promise<SimpleGit> {
  const repo = simpleGit({ baseDir: directory });
  await repo.init();
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(directory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
  return repo;
}

const messages = async () =>
  (await git.log()).all.map((entry) => entry.message);

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "grams-"));
  git = await initTestRepo(contentDirectory);
  ctx = {
    contentDirectory,
    author: { name: "Test Curator", email: "curator@test.local" },
  };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("the bank's writes", () => {
  it("starts empty: the built-in seed alone", async () => {
    expect(await readGramsBank(ctx)).toEqual([]);
    const rows = gramsBankRows([]);
    expect(rows.find((row) => row.key === "maple syrup")).toMatchObject({
      gramsPerCup: 312,
      origin: "built-in",
    });
  });

  it("changes a built-in value, one commit, keyed as a line is", async () => {
    const result = await setGrams(ctx, {
      name: "packed brown sugar",
      gramsPerCup: 200,
    });
    expect(result).toMatchObject({ key: "brown sugar", changed: true });
    const file = JSON.parse(
      await readFile(join(contentDirectory, CONVERSIONS_FILE), "utf8"),
    );
    expect(file.entries).toEqual([
      expect.objectContaining({
        key: "brown sugar",
        name: "packed brown sugar",
        gramsPerCup: 200,
      }),
    ]);
    expect((await messages())[0]).toBe(
      "Update grams: brown sugar, 213 g a cup → 200 g a cup",
    );
    expect(
      gramsBankRows(await readGramsBank(ctx), "brown").find(
        (row) => row.key === "brown sugar",
      ),
    ).toMatchObject({ origin: "changed", builtIn: 213, gramsPerCup: 200 });
  });

  it("adds a new name, and the same again is no commit", async () => {
    await setGrams(ctx, { name: "ground cardamom", gramsPerCup: 96 });
    const before = await messages();
    expect(before[0]).toBe("Add grams: ground cardamom, 96 g a cup");
    const again = await setGrams(ctx, {
      name: "ground cardamom",
      gramsPerCup: 96,
    });
    expect(again.changed).toBe(false);
    expect(await messages()).toEqual(before);
  });

  it("resets to the built-in value, one commit", async () => {
    await setGrams(ctx, { name: "brown sugar", gramsPerCup: 200 });
    await resetGrams(ctx, "brown sugar");
    expect(await readGramsBank(ctx)).toEqual([]);
    expect((await messages())[0]).toBe(
      "Reset grams: brown sugar, back to the built-in 213 g a cup",
    );
    await expect(resetGrams(ctx, "brown sugar")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuses a value no cup holds, and a name that keys as nothing", async () => {
    await expect(
      setGrams(ctx, { name: "flour", gramsPerCup: 0 }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      setGrams(ctx, { name: "flour", gramsPerCup: 5000 }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      setGrams(ctx, { name: "", gramsPerCup: 100 }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  /* Review finding 7: a hand edit gone wrong is read around, never written over. */
  it("reads around a file that isn't JSON, and refuses to write over it", async () => {
    await mkdir(join(contentDirectory, "conversions"));
    const file = join(contentDirectory, CONVERSIONS_FILE);
    await writeFile(file, '{"entries": [{"key": "brown sugar",');
    const before = await messages();
    expect(await readGramsBank(ctx)).toEqual([]);
    expect(await readGramsBankEntries(contentDirectory)).toEqual([]);
    expect((await readGramsBankChecked(ctx)).problem).toBe(
      "conversions/grams.json isn't valid JSON",
    );
    await expect(
      setGrams(ctx, { name: "maple syrup", gramsPerCup: 300 }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringMatching(/isn't valid JSON\. Fix it by hand/),
    });
    await expect(resetGrams(ctx, "brown sugar")).rejects.toMatchObject({
      code: "validation",
    });
    expect(await readFile(file, "utf8")).toBe(
      '{"entries": [{"key": "brown sugar",',
    );
    expect(await messages()).toEqual(before);
  });

  it("keeps a hand-edited file's good entries, says the bad, and won't write over it", async () => {
    await mkdir(join(contentDirectory, "conversions"));
    const file = join(contentDirectory, CONVERSIONS_FILE);
    const text = JSON.stringify({
      entries: [
        { key: "brown sugar", name: "brown sugar", gramsPerCup: 200 },
        { key: "maple syrup", name: "maple syrup", gramsPerCup: "lots" },
        { key: "honey", gramsPerCup: 340 },
      ],
    });
    await writeFile(file, text);
    const read = await readGramsBankChecked(ctx);
    expect(read.entries.map((entry) => entry.key)).toEqual(["brown sugar"]);
    expect(read.problem).toMatch(
      /^2 entries in conversions\/grams.json aren't/,
    );
    expect(
      gramsBankRows(read.entries, "brown sugar").find(
        (row) => row.key === "brown sugar",
      ),
    ).toMatchObject({ gramsPerCup: 200, origin: "changed" });
    await expect(
      setGrams(ctx, { name: "honey", gramsPerCup: 340 }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await readFile(file, "utf8")).toBe(text);
  });

  it("throws any other read error rather than read an empty bank", async () => {
    await mkdir(join(contentDirectory, CONVERSIONS_FILE), { recursive: true });
    await expect(readGramsBank(ctx)).rejects.toMatchObject({
      code: "EISDIR",
    });
    await expect(readGramsBankEntries(contentDirectory)).rejects.toMatchObject({
      code: "EISDIR",
    });
    await expect(readShoppingView(ctx)).rejects.toMatchObject({
      code: "EISDIR",
    });
    await expect(
      setGrams(ctx, { name: "honey", gramsPerCup: 340 }),
    ).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("is a directory no index reads", () => {
    expect(UNINDEXED_DIRECTORIES).toContain("conversions");
    expect(CONVERSIONS_FILE.startsWith("conversions")).toBe(true);
  });
});

describe("the shopping list reads the same bank", () => {
  it("sums one name in cups and grams by the bank's density", () => {
    const items = [
      { id: "01A", text: "1 cup maple syrup", checked: false },
      { id: "01B", text: "100 g maple syrup", checked: false },
    ];
    const rowOf = (grams?: Record<string, number>) =>
      buildShoppingView(
        items as never,
        DEFAULT_SHOPPING_SETTINGS,
        [],
        [],
        [],
        undefined,
        grams,
      ).stores[0].sections.flatMap((section) => section.rows)[0];
    /* The seed: King Arthur's ½ cup is 156 g, 312 g a cup. */
    expect(rowOf().quantity).toBe("≈ 1⅜ cups");
    /* The person's bank, 100 g a cup: 1 cup + 1 cup. */
    const mine = gramsPerCupTable(
      gramsTableOf([
        { key: "maple syrup", name: "maple syrup", gramsPerCup: 100 },
      ]),
    );
    expect(rowOf(mine).quantity).toBe("≈ 2 cups");
  });

  /* Review finding 8: walnuts have a weight now (King Arthur's 128 g a cup,
   * whole), so a cup and grams of them add up, as "≈". */
  it("adds walnuts in cups and grams as ≈", () => {
    const rows = buildShoppingView(
      [
        { id: "01A", text: "1 cup walnuts", checked: false },
        { id: "01B", text: "128 g walnuts", checked: false },
      ] as never,
      DEFAULT_SHOPPING_SETTINGS,
      [],
      [],
      [],
    ).stores[0].sections.flatMap((section) => section.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe("≈ 2 cups");
  });
});

/** A stand-in model: answers each line from `grams`, by its text. */
function standIn(
  grams: Record<string, unknown>,
  asked: string[] = [],
): (request: ChatJsonRequest) => Promise<ChatJsonResult> {
  return async (request) => {
    asked.push(request.user);
    const line = /^Line: "(.*)"/m.exec(request.user)?.[1] ?? "";
    if (line in grams && grams[line] instanceof Error) {
      throw grams[line] as Error;
    }
    return {
      data:
        line in grams
          ? { grams: grams[line], why: `stand-in for ${line}` }
          : { nonsense: true },
      model: "stand-in",
      durationMs: 1,
    };
  };
}

const CONFIG: LlmConfig = {
  url: "http://127.0.0.1:1",
  model: "stand-in",
  api: "ollama",
};

const stored = (text: string) => createIngredient(text)!.ingredient;

describe("the model step (answer 5: one line at a time, checked)", () => {
  it("asks each line once, with the bank as its reference table", async () => {
    const asked: string[] = [];
    const result = await askGrams(
      [
        { line: 9, text: stored("2 eggs") },
        { line: 2, text: stored("1/2 cup maple syrup") },
      ],
      {
        config: CONFIG,
        table: gramsTableOf(),
        chat: standIn({ "2 eggs": 100, "1/2 cup maple syrup": 156 }, asked),
      },
    );
    expect(result.answers).toEqual([
      { line: 9, grams: 100, why: "stand-in for 2 eggs" },
      { line: 2, grams: 156, why: "stand-in for 1/2 cup maple syrup" },
    ]);
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain("- maple syrup: 312 g");
    expect(asked[1]).toContain("- water: 237 g");
  });

  it("refuses what isn't sane, and keeps the other lines", async () => {
    const result = await askGrams(
      [
        { line: 0, text: stored("1/2 cup maple syrup") },
        { line: 1, text: stored("2 eggs") },
        { line: 2, text: stored("1 tsp vanilla extract") },
        { line: 3, text: stored("1 cup milk") },
        { line: 4, text: "a pinch salt" },
      ],
      {
        config: CONFIG,
        table: gramsTableOf(),
        chat: standIn({
          "1/2 cup maple syrup": 4000,
          "2 eggs": "100",
          "1 tsp vanilla extract": null,
          "1 cup milk": new Error("connection refused"),
        }),
      },
    );
    expect(result.answers.map((answer) => answer.grams)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(result.answers[0].problem).toMatch(/refused 4000 g/);
    expect(result.answers[1].problem).toMatch(/no grams/);
    expect(result.answers[2].problem).toMatch(/the model says/);
    expect(result.answers[3].problem).toMatch(/call failed/);
    expect(result.answers[4].problem).toBe("nothing to weigh");
  });

  it("says so when no model is set up", async () => {
    const result = await askGrams([{ line: 0, text: stored("2 eggs") }], {
      table: gramsTableOf(),
    });
    expect(result.warnings[0]).toMatch(/No model/);
    expect(result.answers[0].problem).toMatch(/no model/);
  });

  it("carries the rows near the line, never the whole bank", () => {
    const rows = referenceRows(
      stored("1 cup dark brown sugar"),
      gramsTableOf(),
    );
    expect(rows.length).toBeLessThanOrEqual(12);
    expect(rows.map((row) => row.key)).toContain("dark brown sugar");
    expect(gramsUserPrompt(stored("2 eggs"), gramsTableOf())).toMatch(
      /^Line: "2 eggs"/,
    );
  });
});

const VIVALDI = [
  "2 cups brown sugar",
  "1 1/2 cups water",
  "1/2 cup maple syrup",
  "1 tbsp flour",
  "1 1/2 cups all-purpose flour",
  "2 1/2 tsp baking powder",
  "a pinch salt",
  "1/2 cup butter",
  "1 cup granulated sugar",
  "2 eggs",
  "3/4 cup milk",
  "1 tsp vanilla extract",
  "1 tbsp butter",
];
const PASTE =
  "400 gbrown sugar\n355 gwater\n160 gmaple syrup\n1 tbspflour\n190 gall-purpose flour\n2½ tspbaking powder\na pinchsalt\n115 gbutter\n200 ggranulated sugar\n2egg\n180 gmilk\n1 tspvanilla extract\n1 tbspbutter";

describe("recipes grams (the CLI's seat)", () => {
  beforeEach(async () => {
    await createRecipe(ctx, {
      name: "Pouding Chomeur Vivaldi",
      slug: "pouding-chomeur-vivaldi",
      ingredients: VIVALDI,
    });
  });

  it("a dry run says the lines and writes nothing", async () => {
    const before = await messages();
    const result = await gramsForRecipe(ctx, "pouding-chomeur-vivaldi", {
      paste: PASTE,
      dryRun: true,
    });
    expect(result.written).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.lines).toHaveLength(11);
    expect(result.lines[0]).toMatchObject({
      line: 1,
      from: "2 cups brown sugar",
      to: "2 cups (400g) brown sugar",
      source: "paste",
    });
    expect(result.left).toEqual([{ line: 10, text: "2 eggs" }]);
    expect(await messages()).toEqual(before);
  });

  it("writes the house form in one commit", async () => {
    const before = (await messages()).length;
    const result = await gramsForRecipe(ctx, "pouding-chomeur-vivaldi", {
      paste: PASTE,
    });
    expect(result.written).toBe(true);
    expect((await messages()).length).toBe(before + 1);
    const { recipe } = await getRecipe(ctx, "pouding-chomeur-vivaldi");
    expect(recipe.ingredients?.[0].ingredient).toBe(
      '<Multiplyable baseNumber="2" /> cups (<Multiplyable baseNumber="400" />g) brown sugar',
    );
    expect(recipe.ingredients?.[9].ingredient).toBe(
      '<Multiplyable baseNumber="2" /> eggs',
    );
    /* Run again: every line has grams or nothing to weigh but the eggs. */
    const again = await gramsForRecipe(ctx, "pouding-chomeur-vivaldi", {});
    expect(again.lines).toEqual([]);
    expect(again.had).toBe(11);
  });

  /* Review finding 1: the model's grams are never written outside the edit
   * page — every model-made change is approved by a person first. */
  it("with --model, writes the paste and the bank and only suggests the model's", async () => {
    const asked: string[][] = [];
    const before = (await messages()).length;
    const result = await gramsForRecipe(
      ctx,
      "pouding-chomeur-vivaldi",
      { paste: PASTE, model: true },
      {
        askModel: async (lines) => {
          asked.push(lines.map((line) => line.text));
          return {
            answers: lines.map((line) => ({
              line: line.line,
              grams: 100,
              why: "two large eggs",
            })),
            model: "stand-in (local)",
            warnings: [],
            job: "job-1",
          };
        },
      },
    );
    expect(asked).toEqual([['<Multiplyable baseNumber="2" /> eggs']]);
    expect(result.written).toBe(true);
    expect(result.lines).toHaveLength(11);
    expect(result.lines.every((line) => line.source !== "model")).toBe(true);
    expect(result.suggested).toEqual([
      {
        line: 10,
        from: "2 eggs",
        to: "2 eggs (100g)",
        grams: 100,
        source: "model",
        why: "two large eggs",
      },
    ]);
    expect(result.warnings.join(" ")).toMatch(/suggestions only/);
    expect((await messages()).length).toBe(before + 1);
    const { recipe } = await getRecipe(ctx, "pouding-chomeur-vivaldi");
    expect(recipe.ingredients?.[9].ingredient).toBe(
      '<Multiplyable baseNumber="2" /> eggs',
    );
    const text = gramsCommand.format(result);
    expect(text).toContain(
      "the model suggests (not written; keep them on the edit page, Add grams):\n  10. 2 eggs (100g)  (≈ model: two large eggs)",
    );
  });

  it("with --model and nothing else to write, writes nothing", async () => {
    await gramsForRecipe(ctx, "pouding-chomeur-vivaldi", { paste: PASTE });
    const before = (await messages()).length;
    const result = await gramsForRecipe(
      ctx,
      "pouding-chomeur-vivaldi",
      { model: true },
      {
        askModel: async (lines) => ({
          answers: lines.map((line) => ({ line: line.line, grams: 100 })),
          warnings: [],
        }),
      },
    );
    expect(result.written).toBe(false);
    expect(result.lines).toEqual([]);
    expect(result.suggested).toHaveLength(1);
    expect((await messages()).length).toBe(before);
  });

  /* Review finding 4: a line edited while the model was asked is the person's. */
  it("writes only the lines that still say what they said, read again at write time", async () => {
    const result = await gramsForRecipe(
      ctx,
      "pouding-chomeur-vivaldi",
      { model: true },
      {
        askModel: async (lines) => {
          /* Meanwhile, someone edits the brown sugar and the milk. */
          const { recipe } = await getRecipe(ctx, "pouding-chomeur-vivaldi");
          const next = (recipe.ingredients ?? []).map((line) => ({ ...line }));
          next[0].ingredient = "2 cups dark brown sugar";
          next[10].ingredient = "1 cup milk";
          await updateRecipe(ctx, "pouding-chomeur-vivaldi", {
            ingredients: next,
          });
          return {
            answers: lines.map((line) => ({ line: line.line })),
            warnings: [],
          };
        },
      },
    );
    expect(result.written).toBe(true);
    expect(result.changed).toEqual([
      { line: 1, text: "2 cups brown sugar" },
      { line: 11, text: "3/4 cup milk" },
    ]);
    expect(result.lines.map((line) => line.line)).not.toContain(1);
    expect(result.warnings.join(" ")).toMatch(
      /2 lines changed while the grams were worked out/,
    );
    const { recipe } = await getRecipe(ctx, "pouding-chomeur-vivaldi");
    expect(recipe.ingredients?.[0].ingredient).toBe("2 cups dark brown sugar");
    expect(recipe.ingredients?.[10].ingredient).toBe("1 cup milk");
    expect(recipe.ingredients?.[1].ingredient).toContain(
      '(<Multiplyable baseNumber="356" />g)',
    );
  });

  it("prints what it did", async () => {
    const result = await gramsForRecipe(ctx, "pouding-chomeur-vivaldi", {
      dryRun: true,
    });
    const text = gramsCommand.format(result);
    expect(text).toMatch(/^pouding-chomeur-vivaldi: would write 11 lines/);
    expect(text).toContain(
      "2 cups (426g) brown sugar  (bank: 213 g a cup × 2 cups (built in))",
    );
    expect(text).toContain("left without grams: 10. 2 eggs");
  });
});
