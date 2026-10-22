// 45b: a recipe's gaps filled from its source — the pure merge (`fillGaps`,
// epic 45 F1/F3), the estimate's call and its checks (`estimateTimes`, F4/F5,
// with `fetch` stubbed: never a real model), and what the form and its rail
// mark (`fillMarks`, `sectionStatuses`).
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportedRecipe } from "../websites/recipe-website/common/util/importRecipeData";
import type { Recipe } from "../websites/recipe-website/common/controller/types";
import {
  applyEstimate,
  estimateWanted,
  fillGaps,
  fillSourceUrl,
  isEmptyField,
} from "../websites/recipe-website/editor/controller/curation/fillGaps";
import { fillPatch } from "../websites/recipe-website/editor/controller/curation/fillRecipe";
import type { LlmConfig } from "../websites/recipe-website/editor/controller/llm/client";
import {
  checkEstimate,
  ESTIMATE_SYSTEM_PROMPT,
  estimateHints,
  estimateTimes,
  estimateUserPrompt,
} from "../websites/recipe-website/editor/controller/llm/estimateTimes";
import {
  fieldList,
  fillSections,
  sectionFillLabel,
} from "../websites/recipe-website/common/components/Form/fillMarks";
import { sectionStatuses } from "../websites/recipe-website/common/components/Form/sections";
import { recipeToFormValues } from "../websites/recipe-website/common/components/Form/formContext";
import { stepTitle } from "../websites/recipe-website/editor/controller/jobs/timeline";
import { estimateAnswer } from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";

const OLLAMA: LlmConfig = {
  url: "http://localhost:11434",
  model: "qwen3:8b",
  api: "ollama",
};

const line = (ingredient: string) => ({ ingredient });

/** The 1-hour bagels as the video left them: no times, no yield (Context). */
const BAGELS: Recipe = {
  name: "1 Hour Bagels",
  date: 1_760_000_000_000,
  description: "",
  prepTime: 0,
  cookTime: 0,
  totalTime: 0,
  recipeYield: "",
  ingredients: [
    line('<Multiplyable baseNumber="500" />g bread flour'),
    line('<Multiplyable baseNumber="300" />ml warm water'),
  ],
  instructions: [
    { text: "Mix and knead, then let it rise for 25 minutes." },
    { text: "Shape and proof for 15 to 20 minutes." },
    { text: "Boil 30 seconds a side." },
    { text: "Bake at 425°F for 15 to 17 minutes." },
  ],
  tags: ["bread"],
  source: { url: "https://www.youtube.com/watch?v=BAGELS" },
};

const DRAFT: Partial<ImportedRecipe> = {
  name: "1-Hour Bagels | Channel",
  description: "Chewy bagels in an hour.",
  recipeYield: "8 bagels",
  prepTime: 15,
  ingredients: [line("1 tsp salt")],
  instructions: [{ text: "Different steps." }],
  imageImportUrl: "https://i.ytimg.com/vi/BAGELS/maxresdefault.jpg",
  videoImportUrl: "https://www.youtube.com/watch?v=BAGELS",
  suggestedTags: ["Bread", "breakfast"],
  tags: ["bagels"],
  partial: true,
  source: { url: "https://elsewhere.example/" },
};

describe("fillGaps (F1/F3)", () => {
  it("fills each empty shape and never overwrites a value", () => {
    const { recipe, filled } = fillGaps(BAGELS, DRAFT);
    expect(filled).toEqual([
      "description",
      "recipeYield",
      "image",
      "video",
      "prepTime",
    ]);
    expect(recipe).toMatchObject({
      name: "1 Hour Bagels",
      description: "Chewy bagels in an hour.",
      recipeYield: "8 bagels",
      prepTime: 15,
      cookTime: 0,
      imageImportUrl: DRAFT.imageImportUrl,
      videoImportUrl: DRAFT.videoImportUrl,
      /* The stored lists stand: never replaced by the source's. */
      ingredients: BAGELS.ingredients,
      instructions: BAGELS.instructions,
      /* The source stays the recipe's own. */
      source: BAGELS.source,
    });
    expect(recipe.partial).toBeUndefined();
  });

  it("never adds a tag: the source's become suggestions, the recipe's own left out", () => {
    const { recipe } = fillGaps(BAGELS, DRAFT);
    expect(recipe.tags).toEqual(["bread"]);
    expect(recipe.suggestedTags).toEqual(["breakfast", "bagels"]);
  });

  it("treats absent, 0, blank and [] as empty, and an empty source value as nothing", () => {
    const bare: Recipe = { name: "Bare", date: 1 };
    expect(isEmptyField(bare, "prepTime")).toBe(true);
    expect(isEmptyField({ ...bare, prepTime: 0 }, "prepTime")).toBe(true);
    expect(isEmptyField({ ...bare, description: "  " }, "description")).toBe(
      true,
    );
    expect(isEmptyField({ ...bare, ingredients: [] }, "ingredients")).toBe(
      true,
    );
    expect(isEmptyField({ ...bare, drink: {} }, "drink")).toBe(false);
    const { filled } = fillGaps(bare, {
      description: " ",
      prepTime: 0,
      ingredients: [],
      instructions: [{ text: "Stir." }],
      drink: { method: "shake" },
    });
    expect(filled).toEqual(["instructions", "drink"]);
  });

  it("fills the picture only when the recipe has none", () => {
    const withImage = { ...BAGELS, image: "bagels.jpg" };
    const { recipe, filled } = fillGaps(withImage, DRAFT);
    expect(filled).not.toContain("image");
    expect(recipe.imageImportUrl).toBeUndefined();
    expect(recipe.image).toBe("bagels.jpg");
  });

  it("fills nothing when every field has a value", () => {
    const full: Recipe = {
      ...BAGELS,
      description: "x",
      recipeYield: "6",
      prepTime: 1,
      cookTime: 1,
      totalTime: 2,
      image: "a.jpg",
      video: "https://www.youtube.com/watch?v=BAGELS",
      drink: { method: "shake" },
    };
    expect(fillGaps(full, DRAFT).filled).toEqual([]);
  });
});

describe("applyEstimate and estimateWanted (F4)", () => {
  it("asks only for the empty times and yield, and fills only those", () => {
    const { recipe } = fillGaps(BAGELS, { prepTime: 15 });
    expect(estimateWanted(recipe)).toEqual([
      "cookTime",
      "totalTime",
      "recipeYield",
    ]);
    const applied = applyEstimate(recipe, {
      prepTime: 99,
      cookTime: 17,
      totalTime: 75,
    });
    expect(applied.estimated).toEqual(["cookTime", "totalTime"]);
    expect(applied.recipe).toMatchObject({
      prepTime: 15,
      cookTime: 17,
      totalTime: 75,
    });
  });
});

describe("fillSourceUrl", () => {
  it("reads the source link, else a video host's link, else nothing", () => {
    expect(fillSourceUrl({ source: { url: "https://a.example/r" } })).toBe(
      "https://a.example/r",
    );
    expect(fillSourceUrl({ video: "https://www.youtube.com/watch?v=X" })).toBe(
      "https://www.youtube.com/watch?v=X",
    );
    expect(fillSourceUrl({ video: "clip.mp4" })).toBeUndefined();
    expect(fillSourceUrl({})).toBeUndefined();
  });
});

describe("fillPatch", () => {
  it("is what `recipes update` takes: only the filled fields, plain lines", () => {
    const recipe: Partial<ImportedRecipe> = {
      ...BAGELS,
      ingredients: [line('<Multiplyable baseNumber="2" /> eggs')],
      imageImportUrl: "https://x.example/a.jpg",
      totalTime: 75,
    };
    expect(fillPatch(recipe, ["ingredients", "image", "totalTime"])).toEqual({
      ingredients: ["2 eggs"],
      imageImportUrl: "https://x.example/a.jpg",
      totalTime: 75,
    });
  });
});

describe("the estimate's prompt", () => {
  it("carries the recipe, what is known, the steps' times as hints, and what to give", () => {
    const user = estimateUserPrompt({ ...BAGELS, prepTime: 15 }, [
      "cookTime",
      "totalTime",
    ]);
    expect(user).toContain("Recipe: 1 Hour Bagels");
    expect(user).toContain("- 500g bread flour");
    expect(user).toContain("4. Bake at 425°F for 15 to 17 minutes.");
    expect(user).toContain("Prep time: 15 min");
    expect(user).toContain("- step 1: rise 25 minutes");
    expect(user).toContain("- step 2: rise 15 to 20 minutes");
    expect(user).toContain("- step 3: 30 seconds");
    expect(user).toContain("- oven: 425°F");
    expect(user).toMatch(/- bake: 15–17 min/);
    expect(user).toContain('"cookTime"');
    expect(user).not.toContain('"prepTime"');
    expect(estimateHints({ instructions: [] })).toEqual([]);
    /* Its own prompt: 36's never-estimate rule is the extractor's, not this. */
    expect(ESTIMATE_SYSTEM_PROMPT).toMatch(/^You estimate a recipe's times/);
  });
});

describe("checkEstimate (F4's bounds)", () => {
  const want = ["prepTime", "cookTime", "totalTime", "recipeYield"] as const;

  it("keeps whole minutes in range and a short yield, a 0 read as left out", () => {
    expect(
      checkEstimate(
        {
          prepTime: 20,
          cookTime: 0,
          totalTime: 75,
          recipeYield: " 8  bagels ",
          basis: "25 min rise + 17 min bake",
        },
        {},
        want,
      ),
    ).toEqual({
      values: { prepTime: 20, totalTime: 75, recipeYield: "8 bagels" },
      fields: ["prepTime", "totalTime", "recipeYield"],
      basis: "25 min rise + 17 min bake",
    });
  });

  it("refuses a fraction, a time over a week, a long yield, no basis", () => {
    for (const bad of [
      { prepTime: 2.5, basis: "x" },
      { totalTime: 10_081, basis: "x" },
      { recipeYield: "y".repeat(61), basis: "x" },
      { prepTime: 5 },
      { prepTime: -5, basis: "x" },
    ]) {
      expect(() => checkEstimate(bad, {}, want)).toThrow(/not an estimate/);
    }
    expect(() => checkEstimate({ basis: "nothing" }, {}, want)).toThrow(
      /estimated nothing/,
    );
  });

  it("refuses a total below the cook or prep time, the stored ones included", () => {
    expect(() =>
      checkEstimate({ cookTime: 30, totalTime: 20, basis: "x" }, {}, want),
    ).toThrow(/shorter than the cook time/);
    expect(() =>
      checkEstimate({ totalTime: 20, basis: "x" }, { prepTime: 45 }, want),
    ).toThrow(/shorter than the prep time/);
  });

  it("drops the fields it was not asked for, and cuts a long basis", () => {
    const checked = checkEstimate(
      { prepTime: 20, totalTime: 75, basis: "b".repeat(300) },
      {},
      ["totalTime"],
    );
    expect(checked.values).toEqual({ totalTime: 75 });
    expect(checked.basis).toHaveLength(200);
    expect(checked.basis.endsWith("…")).toBe(true);
  });
});

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** An Ollama that answers every chat with `answer`. */
function stubModel(answer: unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
      return new Response(
        JSON.stringify({
          model: "qwen3:8b",
          message: {
            role: "assistant",
            content:
              typeof answer === "string" ? answer : JSON.stringify(answer),
          },
          done: true,
          prompt_eval_count: 300,
          eval_count: 40,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

describe("estimateTimes (F4/F5, a stubbed model)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks once with its own prompt and schema, and answers the checked values", async () => {
    const calls = stubModel({
      prepTime: 20,
      cookTime: 17,
      totalTime: 75,
      recipeYield: "8 bagels",
      basis: "25 min rise + 20 min proof + 17 min bake + ~10 min shaping",
    });
    const result = await estimateTimes(BAGELS, { config: OLLAMA });
    expect(calls).toHaveLength(1);
    const messages = calls[0].body.messages as {
      role: string;
      content: string;
    }[];
    expect(messages[0].content).toBe(ESTIMATE_SYSTEM_PROMPT);
    expect(messages[1].content).toContain("- step 1: rise 25 minutes");
    expect(calls[0].body.format).toMatchObject({ required: ["basis"] });
    expect(result.warnings).toEqual([]);
    expect(result.estimate).toEqual({
      values: {
        prepTime: 20,
        cookTime: 17,
        totalTime: 75,
        recipeYield: "8 bagels",
      },
      fields: ["prepTime", "cookTime", "totalTime", "recipeYield"],
      basis: "25 min rise + 20 min proof + 17 min bake + ~10 min shaping",
      model: "local model qwen3:8b",
    });
  });

  it("drops a bad answer with a warning, and a total below the cook time", async () => {
    stubModel("not json at all");
    const garbled = await estimateTimes(BAGELS, { config: OLLAMA });
    expect(garbled.estimate).toBeUndefined();
    expect(garbled.warnings[0]).toMatch(/^The estimate was dropped: /);

    stubModel({ cookTime: 40, totalTime: 30, basis: "x" });
    const short = await estimateTimes(BAGELS, { config: OLLAMA });
    expect(short.estimate).toBeUndefined();
    expect(short.warnings).toEqual([
      "The estimate was dropped: the total (30 min) is shorter than the cook time (40 min).",
    ]);
  });

  it("with no model configured, asks nothing and says the estimate was skipped", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await estimateTimes(BAGELS, { config: undefined });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.estimate).toBeUndefined();
    expect(result.warnings[0]).toMatch(/No model is configured/);
  });

  it("asks nothing for nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await estimateTimes(BAGELS, { config: OLLAMA, want: [] })).toEqual({
      warnings: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the stand-in answers only the fields asked for", () => {
    const user = estimateUserPrompt(BAGELS, ["totalTime", "recipeYield"]);
    expect(estimateAnswer(user)).toEqual({
      totalTime: 75,
      recipeYield: "8 bagels",
      basis: expect.any(String),
    });
  });
});

describe("the marks (fillMarks, the rail)", () => {
  const marks = {
    filled: ["description", "ingredients", "image"] as const,
    estimated: ["recipeYield", "prepTime", "totalTime"] as const,
    basis: "x",
  };

  it("names each section the fill touched, and how", () => {
    const sections = fillSections({
      filled: [...marks.filled],
      estimated: [...marks.estimated],
    });
    expect(sections).toEqual({
      recipe: "both",
      ingredients: "source",
      picture: "source",
      times: "estimated",
    });
    expect(sectionFillLabel(sections.recipe)).toBe(
      "from the source · estimated",
    );
    expect(sectionFillLabel(sections.times)).toBe("estimated");
    expect(fieldList(["prepTime", "cookTime", "totalTime"])).toBe(
      "prep time, cook time and total time",
    );
  });

  it("marks the rail while a section holds what the fill left, not after an edit", () => {
    const filled = recipeToFormValues(
      {
        ...BAGELS,
        description: "Chewy.",
        prepTime: 20,
        totalTime: 75,
        ingredients: [line("1 tsp salt"), ...(BAGELS.ingredients ?? [])],
      },
      "bagels",
    );
    const fill = {
      sections: fillSections({
        filled: ["description", "ingredients", "image"],
        estimated: ["prepTime", "totalTime"],
      }),
      values: filled,
    };
    const context = {
      loaded: recipeToFormValues(BAGELS, "bagels"),
      picture: "page" as const,
      fill,
    };
    const statuses = sectionStatuses(filled, context);
    expect(statuses.recipe).toEqual({ text: "filled", tone: "active" });
    expect(statuses.ingredients).toEqual({
      text: "3 · filled",
      tone: "active",
    });
    expect(statuses.picture).toEqual({ text: "filled", tone: "active" });
    expect(statuses.times).toEqual({ text: "1h 15m · est.", tone: "warn" });
    /* An edited section is the person's now: no mark. */
    const edited = sectionStatuses({ ...filled, totalTime: 80 }, context);
    expect(edited.times).toEqual({ text: "1h 20m" });
  });

  it("names the estimate's step in the live panel", () => {
    expect(stepTitle({ step: "llm.estimate", data: {} })).toBe(
      "Model estimates the times and yield",
    );
  });
});
