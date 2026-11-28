// @vitest-environment node
//
// 51c (D9): the curator's judge — `judgeRecipes` asks a model whether each
// candidate fits the ask, in chunks, and checks the answer. The candidate's
// text and its trimming, the answer's schema and its check, the chunks and
// their one `num_ctx`, and the run on a stubbed `fetch` — never a real model.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import type { Recipe } from "../websites/recipe-website/common/controller/types";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { memoryJobLog } from "../websites/recipe-website/editor/controller/jobs/log";
import { stepTitle } from "../websites/recipe-website/editor/controller/jobs/timeline";
import {
  LLM_NUM_CTX,
  contextStep,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  JUDGE_CHUNK_RECIPES,
  JUDGE_INGREDIENTS_MAX_CHARS,
  JUDGE_JSON_SCHEMA,
  JUDGE_MAX_RECIPES,
  JUDGE_NAME_MAX_CHARS,
  JUDGE_NOTES_MAX_CHARS,
  JUDGE_STEPS_MAX_CHARS,
  JUDGE_STEP_MIN_CHARS,
  JUDGE_SYSTEM_PROMPT,
  checkJudgeAnswer,
  clip,
  judgeChunks,
  judgeRecipeText,
  judgeRecipes,
  judgeTokens,
  judgeUserPrompt,
  shareBudget,
  trimNumbered,
} from "../websites/recipe-website/editor/controller/llm/judge";

const LOCAL: LlmConfig = {
  url: "http://model.test:11434",
  model: "qwen3.5:9b",
  api: "ollama",
};

let contentDirectory: string;
let ctx: CurationContext;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "judge-"));
  ctx = { contentDirectory };
  vi.stubEnv("RECIPE_LLM_URL", "");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("a candidate's text (judgeRecipeText)", () => {
  const latte: Recipe = {
    name: "Pumpkin Spice Latte",
    date: 1,
    description: "A *cosy* café drink for one.",
    recipeYield: "1 mug",
    prepTime: 5,
    totalTime: 10,
    drink: { method: "build", glass: "mug" },
    ingredients: [
      { ingredient: "For the syrup", type: "heading" },
      { ingredient: '<Multiplyable baseNumber="2" /> tbsp pumpkin purée' },
      { ingredient: "1 cup [milk](/recipe/milk)" },
    ],
    instructions: [
      { text: "Warm the syrup." },
      {
        name: "Froth",
        instructions: [{ text: "Froth the milk with a handheld frother." }],
      },
    ],
    notes: ["No frother? Shake the milk in a jar."],
  };

  it("says each part the recipe has, plain, under its slug", () => {
    expect(judgeRecipeText("pumpkin-spice-latte", latte)).toBe(
      [
        "## pumpkin-spice-latte",
        "Name: Pumpkin Spice Latte",
        "Yield: 1 mug",
        "Time: prep 5 min, total 10 min",
        "Drink: build, mug",
        "Description: A cosy café drink for one.",
        "Ingredients: For the syrup:; 2 tbsp pumpkin purée; 1 cup milk",
        "Steps: 1. Warm the syrup. 2. Froth the milk with a handheld frother.",
        "Notes: 1. No frother? Shake the milk in a jar.",
      ].join("\n"),
    );
    expect(judgeRecipeText("bare", { name: "Bare", date: 1 })).toBe(
      "## bare\nName: Bare\nIngredients: (none listed)\nSteps: (none listed)",
    );
  });

  it("keeps a long recipe within its budgets, every step's start kept", () => {
    const long = "Stir slowly and keep stirring ".repeat(20).trim();
    const recipe: Recipe = {
      name: "Long",
      date: 1,
      ingredients: Array.from({ length: 60 }, (_, i) => ({
        ingredient: `${i + 1} cups of something long and specific`,
      })),
      instructions: Array.from({ length: 10 }, (_, i) => ({
        text: `Step word${i + 1}. ${long}`,
      })),
      notes: [long, long, long],
    };
    const text = judgeRecipeText("long", recipe);
    const line = (label: string) =>
      text.split("\n").find((each) => each.startsWith(label))!;
    expect(line("Ingredients: ").length).toBeLessThanOrEqual(
      "Ingredients: ".length + JUDGE_INGREDIENTS_MAX_CHARS,
    );
    expect(line("Steps: ").length).toBeLessThanOrEqual(
      "Steps: ".length + JUDGE_STEPS_MAX_CHARS,
    );
    expect(line("Notes: ").length).toBeLessThanOrEqual(
      "Notes: ".length + JUDGE_NOTES_MAX_CHARS,
    );
    for (let i = 1; i <= 10; i += 1) {
      expect(line("Steps: ")).toContain(`${i}. Step word${i}.`);
    }
    /* A name or a yield pasted with a paragraph in it is cut too (review). */
    const wordy = judgeRecipeText("wordy", {
      name: "Best ".repeat(60),
      date: 1,
      recipeYield: "about ".repeat(60),
    });
    const wordyLine = (label: string) =>
      wordy.split("\n").find((each) => each.startsWith(label))!;
    expect(wordyLine("Name: ").length).toBeLessThanOrEqual(
      "Name: ".length + JUDGE_NAME_MAX_CHARS,
    );
    expect(wordyLine("Name: ")).toMatch(/…$/);
    expect(wordyLine("Yield: ").length).toBeLessThanOrEqual(
      "Yield: ".length + JUDGE_NAME_MAX_CHARS,
    );
  });
});

describe("trimming", () => {
  it("clips at a word and marks it", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("one two three four", 12)).toBe("one two…");
    expect(clip("one two three four", 12).length).toBeLessThanOrEqual(12);
  });

  it("gives short texts all they need and shares the rest (shareBudget)", () => {
    expect(shareBudget([10, 500, 20], 300, 50)).toEqual([10, 270, 20]);
    expect(shareBudget([400, 400], 300, 50)).toEqual([150, 150]);
    /* Never below the minimum, though the sum then passes the budget. */
    expect(shareBudget([400, 400, 400], 90, 50)).toEqual([50, 50, 50]);
  });

  it("drops whole texts from the end when the minimum overruns, and counts them", () => {
    const steps = Array.from({ length: 30 }, (_, i) => `step ${i} `.repeat(20));
    const trimmed = trimNumbered(steps, 1_000);
    expect(trimmed.length).toBeLessThanOrEqual(1_000 + " (+30 more)".length);
    expect(trimmed).toMatch(/\(\+\d+ more\)$/);
    expect(trimmed).toContain("1. step 0");
    expect(JUDGE_STEP_MIN_CHARS).toBe(80);
  });
});

describe("the answer's check (checkJudgeAnswer)", () => {
  const asked = ["london-fog", "hot-chocolate", "rice-pudding"];

  it("keeps a verdict per asked slug, and sets aside each other answer with why", () => {
    const { verdicts, ignored } = checkJudgeAnswer(
      {
        verdicts: [
          {
            slug: "## London-Fog",
            why: "Frothed milk,  one mug.",
            verdict: "fit",
          },
          { slug: "pulled-pork", why: "?", verdict: "fit" },
          { slug: "london-fog", why: "again", verdict: "no" },
          { slug: "hot-chocolate", why: "x", verdict: "great" },
          "nonsense",
          { why: "no slug", verdict: "no" },
          { slug: "rice-pudding", why: 3, verdict: " maybe " },
        ],
      },
      asked,
    );
    expect(Object.fromEntries(verdicts)).toEqual({
      "london-fog": { verdict: "fit", why: "Frothed milk, one mug." },
      "rice-pudding": { verdict: "maybe", why: "" },
    });
    expect(ignored).toEqual([
      'answer 2 names "pulled-pork", which was not asked about',
      "answer 3 answers london-fog again; the first answer stands",
      'answer 4 gives hot-chocolate the verdict "great", not fit, maybe or no',
      "answer 5 is not an object",
      "answer 6 names no slug",
    ]);
  });

  it("refuses an answer that is not a verdicts list", () => {
    expect(() => checkJudgeAnswer({ fit: [] }, asked)).toThrow(
      "the answer has no verdicts list",
    );
    expect(() => checkJudgeAnswer("fit", asked)).toThrow();
  });

  it("asks for slug, why, then verdict, the verdict one of three", () => {
    const item = JUDGE_JSON_SCHEMA.properties.verdicts.items;
    expect(Object.keys(item.properties)).toEqual(["slug", "why", "verdict"]);
    expect(item.properties.verdict.enum).toEqual(["fit", "maybe", "no"]);
    expect(item.required).toEqual(["slug", "why", "verdict"]);
  });
});

describe("chunks", () => {
  it("splits evenly, at most JUDGE_CHUNK_RECIPES a call", () => {
    const sizes = (n: number) =>
      judgeChunks(
        Array.from({ length: n }, (_, i) => i),
        JUDGE_CHUNK_RECIPES,
      ).map((chunk) => chunk.length);
    expect(JUDGE_CHUNK_RECIPES).toBe(8);
    expect(sizes(30)).toEqual([8, 8, 7, 7]);
    expect(sizes(9)).toEqual([5, 4]);
    expect(sizes(8)).toEqual([8]);
    expect(sizes(0)).toEqual([]);
    expect(judgeChunks([1, 2, 3, 4, 5], 2).flat()).toEqual([1, 2, 3, 4, 5]);
  });

  it("a full chunk of the longest candidates fits the local context", () => {
    const long = "word ".repeat(2_000);
    const recipe: Recipe = {
      name: "x".repeat(300),
      date: 1,
      description: long,
      recipeYield: "4",
      ingredients: Array.from({ length: 80 }, () => ({ ingredient: long })),
      instructions: Array.from({ length: 40 }, () => ({ text: long })),
      notes: Array.from({ length: 20 }, () => long),
    };
    const candidates = Array.from({ length: JUDGE_CHUNK_RECIPES }, (_, i) => ({
      slug: `r${i}`,
      text: judgeRecipeText(`r${i}`, recipe),
    }));
    const user = judgeUserPrompt("small batches", candidates);
    expect(judgeTokens(user, candidates.length, false)).toBeLessThanOrEqual(
      LLM_NUM_CTX,
    );
  });
});

/**
 * Ollama answering each chat with `answer(slugs)` — the slugs read off the
 * chunk's `## <slug>` headings — or failing the calls `fail` names
 * (1-based); `/api/ps` lists no model. The chat bodies are kept.
 */
function stubJudge(
  answer: (slugs: string[]) => unknown,
  { fail = [] as number[] } = {},
) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) return Response.json({ models: [] });
      const body = JSON.parse(String(init?.body)) as {
        messages: { content: string }[];
      };
      bodies.push(body);
      if (fail.includes(bodies.length)) {
        return new Response("boom", { status: 500 });
      }
      const slugs = [...body.messages[1].content.matchAll(/^## (\S+)$/gm)].map(
        (match) => match[1],
      );
      const data = answer(slugs);
      return Response.json({
        model: "qwen3.5:9b",
        done: true,
        prompt_eval_count: 1_000,
        eval_count: 100,
        message: {
          role: "assistant",
          content: typeof data === "string" ? data : JSON.stringify(data),
        },
      });
    }),
  );
  return bodies;
}

async function makeRecipes(count: number): Promise<string[]> {
  const slugs: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const { slug } = await createRecipe(ctx, {
      name: `Drink ${i + 1}`,
      date: 1_700_000_000_000 + i,
      ingredients: ["1 cup milk"],
      instructions: [i % 2 ? "Froth with a frother." : "Simmer a big pot."],
    });
    slugs.push(slug);
  }
  return slugs;
}

describe("judgeRecipes", () => {
  it("asks once with the schema, no tools, no thinking, and answers in the order given", async () => {
    const slugs = await makeRecipes(3);
    const bodies = stubJudge((asked) => ({
      verdicts: asked
        .slice()
        .reverse()
        .map((slug, i) => ({
          slug,
          why: `reason ${slug}`,
          verdict: (["fit", "maybe", "no"] as const)[i],
        })),
    }));
    const { log, lines } = memoryJobLog();
    const result = await judgeRecipes(ctx, {
      criterion: "  small batches\nwith a milk frother ",
      slugs: [slugs[0], slugs[1], slugs[0], slugs[2]],
      model: LOCAL,
      job: { log },
    });
    expect(bodies).toHaveLength(1);
    const body = bodies[0] as {
      messages: { role: string; content: string }[];
      format: unknown;
      tools?: unknown;
      think?: boolean;
      options: { num_ctx: number };
    };
    expect(body.format).toEqual(JUDGE_JSON_SCHEMA);
    expect(body.tools).toBeUndefined();
    expect(body.think).toBe(false);
    expect(body.messages[0].content).toBe(JUDGE_SYSTEM_PROMPT);
    expect(body.messages[1].content).toMatch(
      /^Ask: small batches with a milk frother\n\nRecipes \(3\):\n\n## drink-1\nName: Drink 1/,
    );
    const user = judgeUserPrompt("small batches with a milk frother", []);
    expect(user).toContain("Recipes (0)");
    expect(body.options.num_ctx).toBe(4_096);
    expect(result).toMatchObject({
      status: "judged",
      criterion: "small batches with a milk frother",
      model: "local model qwen3.5:9b",
      calls: 1,
      numCtx: 4_096,
      promptTokens: 1_000,
      outputTokens: 100,
      unjudged: [],
      dropped: [],
      missing: [],
      ignored: [],
      problems: [],
    });
    expect(result.verdicts).toEqual([
      {
        slug: "drink-1",
        name: "Drink 1",
        verdict: "no",
        why: "reason drink-1",
      },
      {
        slug: "drink-2",
        name: "Drink 2",
        verdict: "maybe",
        why: "reason drink-2",
      },
      {
        slug: "drink-3",
        name: "Drink 3",
        verdict: "fit",
        why: "reason drink-3",
      },
    ]);
    const step = lines.find(
      (line) => line.step === "llm.judge" && line.phase === "end",
    );
    expect(step).toMatchObject({
      ok: true,
      data: { recipes: 3, fit: 1, maybe: 1, no: 1, unjudged: 0 },
    });
    expect(stepTitle({ step: "llm.judge", data: { part: "2/4" } })).toBe(
      "Model judges the recipes 2/4",
    );
    expect(
      lines.some(
        (line) => line.step === "judge" && line.msg === "1 fit, 1 maybe, 1 no",
      ),
    ).toBe(true);
  });

  it("chunks, one num_ctx for every chunk (the caller's when it holds them), and drops past 30", async () => {
    const slugs = await makeRecipes(10);
    const bodies = stubJudge((asked) => ({
      verdicts: asked.map((slug) => ({ slug, why: "ok", verdict: "fit" })),
    }));
    const extra = Array.from(
      { length: JUDGE_MAX_RECIPES + 2 - slugs.length },
      (_, i) => `nothing-${i + 1}`,
    );
    const result = await judgeRecipes(ctx, {
      criterion: "frother",
      slugs: [...slugs, ...extra],
      model: LOCAL,
    });
    expect(bodies).toHaveLength(2);
    const contexts = bodies.map(
      (body) => (body as { options: { num_ctx: number } }).options.num_ctx,
    );
    expect(new Set(contexts).size).toBe(1);
    expect(result.verdicts).toHaveLength(10);
    expect(result.dropped).toEqual(["nothing-21", "nothing-22"]);
    expect(result.missing).toHaveLength(20);
    expect(result.status).toBe("judged");

    const pinned = stubJudge((asked) => ({
      verdicts: asked.map((slug) => ({ slug, why: "ok", verdict: "no" })),
    }));
    const withRun = await judgeRecipes(ctx, {
      criterion: "frother",
      slugs,
      model: LOCAL,
      numCtx: LLM_NUM_CTX,
    });
    expect(
      pinned.map(
        (body) => (body as { options: { num_ctx: number } }).options.num_ctx,
      ),
    ).toEqual([LLM_NUM_CTX, LLM_NUM_CTX]);
    expect(withRun.numCtx).toBe(LLM_NUM_CTX);
    /* A caller's context too small for the chunks is not used. */
    stubJudge((asked) => ({
      verdicts: asked.map((slug) => ({ slug, why: "ok", verdict: "no" })),
    }));
    const small = await judgeRecipes(ctx, {
      criterion: "frother",
      slugs,
      model: LOCAL,
      numCtx: 512,
    });
    expect(small.numCtx).toBe(contextStep(4_000));
  });

  it("reports what the model left out, set aside or failed on — never trusting it", async () => {
    const slugs = await makeRecipes(10);
    /* Chunk 1 (5 recipes) answers two and invents one; chunk 2 fails. */
    stubJudge(
      (asked) => ({
        verdicts: [
          { slug: asked[0], why: "yes", verdict: "fit" },
          { slug: asked[1], why: "no", verdict: "no" },
          { slug: "made-up", why: "?", verdict: "fit" },
        ],
      }),
      { fail: [2] },
    );
    const { log, lines } = memoryJobLog();
    const result = await judgeRecipes(ctx, {
      criterion: "frother",
      slugs,
      model: LOCAL,
      job: { log },
    });
    expect(result.status).toBe("judged");
    expect(result.verdicts.map((each) => each.slug)).toEqual(slugs.slice(0, 2));
    expect(result.unjudged).toEqual(slugs.slice(2));
    expect(result.ignored).toEqual([
      'answer 3 names "made-up", which was not asked about',
    ]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(
      /^chunk 2: local model qwen3\.5:9b failed/,
    );
    expect(
      lines
        .filter((line) => line.step === "llm.judge" && line.phase === "end")
        .map((line) => line.ok),
    ).toEqual([true, false]);
  });

  it("fails, saying why, when nothing is judged", async () => {
    const slugs = await makeRecipes(2);
    stubJudge(() => "Sure, they all fit!");
    expect(
      await judgeRecipes(ctx, { criterion: "frother", slugs, model: LOCAL }),
    ).toMatchObject({
      status: "failed",
      problem: expect.stringMatching(
        /^chunk 1: local model qwen3\.5:9b failed/,
      ),
      unjudged: slugs,
    });
    const none = stubJudge(() => ({ verdicts: [] }));
    expect(
      await judgeRecipes(ctx, { criterion: "  ", slugs, model: LOCAL }),
    ).toMatchObject({
      status: "failed",
      problem: "there is no ask to judge against",
    });
    expect(
      await judgeRecipes(ctx, {
        criterion: "frother",
        slugs: ["no-such", "nor-this"],
        model: LOCAL,
      }),
    ).toMatchObject({
      status: "failed",
      problem: "none of the slugs is a recipe here",
      missing: ["no-such", "nor-this"],
    });
    expect(
      await judgeRecipes(ctx, {
        criterion: "frother",
        slugs: [],
        model: LOCAL,
      }),
    ).toMatchObject({ status: "judged", verdicts: [], calls: 0 });
    expect(none).toHaveLength(0);
  });

  it("holds the Claude API to the caller's budget before each call", async () => {
    const slugs = await makeRecipes(2);
    const bodies = stubJudge(() => ({ verdicts: [] }));
    const result = await judgeRecipes(ctx, {
      criterion: "frother",
      slugs,
      model: {
        url: "https://api.anthropic.com",
        model: "claude-sonnet-5",
        api: "anthropic",
        apiKey: "test-key",
      },
      maxCostUsd: 0,
    });
    expect(bodies).toHaveLength(0);
    expect(result).toMatchObject({
      status: "failed",
      calls: 0,
      unjudged: slugs,
      problem: "chunk 1: it could take the judge past its cost budget ($0.00)",
    });
    expect(result.numCtx).toBeUndefined();
  });
});
