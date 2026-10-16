// @vitest-environment node
//
// The local-model client and extractor (epic 36: D1, D4, D7, D8) with
// `fetch` stubbed — never a real model here (or in CI). Pinned: the two
// request shapes (Ollama `/api/chat`, OpenAI `/v1/chat/completions`), the
// typed errors, the grounding guard and the `partial` gate, headings and
// sections, `found: false`, and a YouTube-description-shaped input whose
// sponsor, gear and timestamp lines the (stubbed) model leaves out.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chatJson,
  LlmError,
  llmConfig,
  parseJsonAnswer,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  buildRecipeUserPrompt,
  extractRecipeWithLlm,
  fillSkippedLines,
  groundLine,
  sourcePositions,
  groundingSource,
  isGrounded,
  LLM_RECIPE_SCHEMA,
  LLM_RECIPE_SYSTEM_PROMPT,
  normaliseForGrounding,
  parseTimeText,
  readLlmAnswer,
} from "../websites/recipe-website/editor/controller/llm/extractRecipe";

const OLLAMA: LlmConfig = {
  url: "http://localhost:11434",
  model: "qwen3:8b",
  api: "ollama",
};
const OPENAI: LlmConfig = {
  url: "http://localhost:8080",
  model: "qwen3-8b",
  api: "openai",
};

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** A model server that answers every call with `answer` in `api`'s shape. */
function stubModel(answer: unknown, api: "ollama" | "openai" = "ollama") {
  const calls: Call[] = [];
  const content = typeof answer === "string" ? answer : JSON.stringify(answer);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      const body =
        api === "ollama"
          ? {
              model: "qwen3:8b",
              message: { role: "assistant", content },
              done: true,
              prompt_eval_count: 1200,
              eval_count: 300,
              load_duration: 11_000_000_000,
            }
          : {
              choices: [{ message: { role: "assistant", content } }],
              usage: { prompt_tokens: 1200, completion_tokens: 300 },
            };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const PAGE = `## Brown Butter Pecan Pie

Prep Time: 20 minutes · Cook Time: 1 hour · Yield: 8 slices

### Ingredients

* 1 ½ cups (180g) pecans
* 3 large eggs
* ¾ cup (150g) light brown sugar

#### For the crust

* 1 cup (125g) all-purpose flour
* ½ cup (113g) cold butter

### Instructions

1. Toast the pecans.
2. Whisk the eggs and sugar, then stir in the pecans.
3. Bake for 1 hour.`;

const GOOD_ANSWER = {
  found: true,
  name: "Brown Butter Pecan Pie",
  recipeYield: "8 slices",
  prepTime: "20 minutes",
  cookTime: "1 hour",
  ingredients: [
    "1 1/2 cups (180g) pecans",
    "3 large eggs",
    "¾ cup (150g) light brown sugar",
    "For the crust:",
    "1 cup (125g) all-purpose flour",
    "1/2 cup (113g) cold butter",
  ],
  instructions: [
    "1. Toast the pecans.",
    "• Whisk the eggs and sugar, then stir in the pecans.",
    "Step 3: Bake for 1 hour.",
  ],
};

describe("llmConfig (D1)", () => {
  it("is off with no URL, or an empty one", () => {
    expect(llmConfig({})).toBeUndefined();
    expect(llmConfig({ RECIPE_LLM_URL: "" })).toBeUndefined();
    expect(llmConfig({ RECIPE_LLM_URL: "  " })).toBeUndefined();
  });

  it("defaults the model to qwen3:8b and the API to ollama", () => {
    expect(
      llmConfig({
        RECIPE_LLM_URL: "http://localhost:11434/",
        RECIPE_LLM_MODEL: "",
        RECIPE_LLM_API: "",
      }),
    ).toEqual({
      url: "http://localhost:11434",
      model: "qwen3:8b",
      api: "ollama",
    });
  });

  it("reads the model and the openai API", () => {
    expect(
      llmConfig({
        RECIPE_LLM_URL: "http://gpu:8080",
        RECIPE_LLM_MODEL: "qwen3:14b",
        RECIPE_LLM_API: "OpenAI",
      }),
    ).toEqual({ url: "http://gpu:8080", model: "qwen3:14b", api: "openai" });
  });
});

describe("chatJson", () => {
  const request = {
    system: "sys",
    user: "usr",
    schema: { type: "object" },
  };

  it("sends Ollama's /api/chat shape", async () => {
    const calls = stubModel({ ok: true });
    const result = await chatJson({ ...request, config: OLLAMA });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    expect(calls[0].body).toEqual({
      model: "qwen3:8b",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
      format: { type: "object" },
      stream: false,
      think: false,
      keep_alive: "10m",
      options: { num_ctx: 12288, temperature: 0 },
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.model).toBe("qwen3:8b");
    expect(result.promptTokens).toBe(1200);
    expect(result.outputTokens).toBe(300);
    expect(result.loadMs).toBe(11_000);
  });

  it("sends the OpenAI /v1/chat/completions shape", async () => {
    const calls = stubModel({ ok: true }, "openai");
    const result = await chatJson({
      ...request,
      schemaName: "recipe",
      config: OPENAI,
    });
    expect(calls[0].url).toBe("http://localhost:8080/v1/chat/completions");
    expect(calls[0].body).toEqual({
      model: "qwen3-8b",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "recipe", schema: { type: "object" } },
      },
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.outputTokens).toBe(300);
  });

  it("does not double a /v1 already in the URL", async () => {
    const calls = stubModel({ ok: true }, "openai");
    await chatJson({
      ...request,
      config: { ...OPENAI, url: "http://localhost:1234/v1" },
    });
    expect(calls[0].url).toBe("http://localhost:1234/v1/chat/completions");
  });

  it("reads the environment when no config is passed, and is unconfigured without it", async () => {
    vi.stubEnv("RECIPE_LLM_URL", "");
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    const error = await chatJson(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe("unconfigured");
    expect(error.message).toBe("no local model configured (RECIPE_LLM_URL)");
    expect(fetchStub).not.toHaveBeenCalled();

    vi.stubEnv("RECIPE_LLM_URL", "http://localhost:11434");
    const calls = stubModel({ ok: true });
    await chatJson(request);
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
  });

  it("times out through the abort signal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );
    const error = await chatJson({
      ...request,
      config: OLLAMA,
      timeoutMs: 20,
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe("timeout");
  });

  it("is unreachable when nothing answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", {
          cause: new Error("connect ECONNREFUSED 127.0.0.1:11434"),
        });
      }),
    );
    const error = await chatJson({ ...request, config: OLLAMA }).catch(
      (caught) => caught,
    );
    expect(error.kind).toBe("unreachable");
    expect(error.message).toContain("http://localhost:11434");
  });

  it("reports an HTTP error with its status (a model not pulled is a 404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response('{"error":"model \\"qwen3:8b\\" not found"}', {
            status: 404,
          }),
      ),
    );
    const error = await chatJson({ ...request, config: OLLAMA }).catch(
      (caught) => caught,
    );
    expect(error.kind).toBe("http");
    expect(error.status).toBe(404);
    expect(error.message).toContain("not found");
  });

  it("refuses an answer that is not JSON", async () => {
    stubModel("Sure! Here is the recipe: pecans, eggs.");
    const error = await chatJson({ ...request, config: OLLAMA }).catch(
      (caught) => caught,
    );
    expect(error.kind).toBe("bad_json");
  });

  it("refuses a 200 whose body is null or not an object", async () => {
    for (const body of ["null", "[1,2]", '"text"']) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { status: 200 })),
      );
      const error = await chatJson({ ...request, config: OLLAMA }).catch(
        (caught) => caught,
      );
      expect(error).toBeInstanceOf(LlmError);
      expect(error.kind).toBe("bad_json");
    }
  });

  it("strips a trailing slash from a config it did not build", async () => {
    const calls = stubModel({ ok: true });
    await chatJson({
      ...request,
      config: { ...OLLAMA, url: "http://localhost:11434/" },
    });
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
  });

  it("passes the caller's own abort through, not as a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const pending = chatJson({
      ...request,
      config: OLLAMA,
      signal: controller.signal,
    }).catch((caught) => caught);
    controller.abort(new DOMException("stop", "AbortError"));
    const error = await pending;
    expect(error).not.toBeInstanceOf(LlmError);
    expect(error.name).toBe("AbortError");
  });

  it("strips a think block and a code fence before parsing", () => {
    expect(parseJsonAnswer('<think>hmm</think>\n{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonAnswer('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
});

describe("parseTimeText", () => {
  it.each([
    ["25 minutes", 25],
    ["3 hours, 45 minutes", 225],
    ["1 hour 15 mins", 75],
    ["1h30m", 90],
    ["1 1/2 hours", 90],
    ["1½ hours", 90],
    ["1.5 hrs", 90],
    ["an hour", 60],
    ["1 day", 1440],
    ["17–18 minutes", 18],
    ["4 to 24 hrs", 1440],
    ["45", 45],
    [30, 30],
    ["1 1/2 to 2 hours", 120],
    ["1½–2 hours", 120],
    ["half an hour", 30],
    ["half hour", 30],
    ["an hour and a half", 90],
    ["1 hour 30", 90],
    ["90 seconds", 2],
  ])("%s → %d", (text, minutes) => {
    expect(parseTimeText(text)).toBe(minutes);
  });

  it.each(["0 minutes", "overnight", "varies", "", "10 days"])(
    "%s → undefined",
    (text) => {
      expect(parseTimeText(text)).toBeUndefined();
    },
  );
});

describe("grounding (D4)", () => {
  it("normalises fractions, case, punctuation and accents", () => {
    expect(normaliseForGrounding("1½ Cups (180g) Pecans, chopped.")).toBe(
      "1 1/2 cups 180g pecans chopped",
    );
    expect(normaliseForGrounding("• ¾ cup crème fraîche")).toBe(
      "3/4 cup creme fraiche",
    );
  });

  it("finds a line as a run of words, or by 80% of its words", () => {
    const source = groundingSource(PAGE);
    expect(isGrounded("1 1/2 cups (180g) pecans", source)).toBe(true);
    expect(isGrounded("3 large eggs", source)).toBe(true);
    // Reordered, but every word is there.
    expect(isGrounded("pecans, 1 1/2 cups (180g)", source)).toBe(true);
    // An invented line: "vanilla" and "extract" are nowhere.
    expect(isGrounded("2 teaspoons vanilla extract", source)).toBe(false);
  });

  it("grades verbatim, found and missing", () => {
    const source = groundingSource(PAGE);
    expect(groundLine("3 large eggs", source)).toBe("verbatim");
    expect(groundLine("pecans, 1 1/2 cups (180g)", source)).toBe("found");
    expect(groundLine("For the crust:", source)).toBe("verbatim");
    expect(groundLine("2 teaspoons vanilla extract", source)).toBe("missing");
  });

  it("does not ground a changed amount, even with that number elsewhere", () => {
    const source = groundingSource(
      "1 cup (125g) all-purpose flour\n3 large eggs\n2 tablespoons sugar",
    );
    // "3" is on the page (the eggs) but not on the flour's line.
    expect(groundLine("3 cups (125g) all-purpose flour", source)).toBe(
      "missing",
    );
    expect(groundLine("1 cup (250g) all-purpose flour", source)).toBe(
      "missing",
    );
    expect(groundLine("1 cup (125g) all-purpose flour", source)).toBe(
      "verbatim",
    );
  });

  it("grounds against one source line, not the whole page", () => {
    // Every word is on the page, but no single line has "eggs" and "sugar".
    const source = groundingSource("3 large eggs\n2 tablespoons sugar");
    expect(isGrounded("2 large eggs sugar", source)).toBe(false);
  });
});

describe("extractRecipeWithLlm", () => {
  it("maps a grounded answer and clears partial (D7)", async () => {
    const calls = stubModel(GOOD_ANSWER);
    const result = await extractRecipeWithLlm({
      text: PAGE,
      url: "https://kitchen.example.com/pecan-pie/",
      meta: { title: "Pecan Pie | Kitchen", siteName: "Kitchen" },
      config: OLLAMA,
    });
    if (!result.found) throw new Error("expected a recipe");

    expect(calls[0].body.format).toEqual(LLM_RECIPE_SCHEMA);
    const [system, user] = calls[0].body.messages as { content: string }[];
    expect(system.content).toBe(LLM_RECIPE_SYSTEM_PROMPT);
    expect(user.content).toContain(
      "Source URL: https://kitchen.example.com/pecan-pie/",
    );
    expect(user.content).toContain("Title: Pecan Pie | Kitchen");
    expect(user.content).toContain("### Ingredients");

    expect(result.llm).toMatchObject({
      model: "qwen3:8b",
      grounded: 6,
      total: 6,
    });
    expect(result.llm.ungrounded).toBeUndefined();
    expect(result.recipe.partial).toBeUndefined();
    expect(result.recipe).toMatchObject({
      name: "Brown Butter Pecan Pie",
      recipeYield: "8 slices",
      prepTime: 20,
      cookTime: 60,
      source: {
        url: "https://kitchen.example.com/pecan-pie/",
        name: "Kitchen",
      },
    });
    expect(result.recipe.videoImportUrl).toBeUndefined();
    // A time the model did not give is no key at all, so a caller merging
    // this over a schema's recipe keeps the schema's.
    expect("totalTime" in result.recipe).toBe(false);
    // `createIngredient`: numbers multiplyable, the heading detected.
    expect(result.recipe.ingredients?.[0]).toEqual({
      ingredient:
        '<Multiplyable baseNumber="1 1/2" /> cups (<Multiplyable baseNumber="180" />g) pecans',
    });
    expect(result.recipe.ingredients?.[3]).toEqual({
      ingredient: "For the crust:",
      type: "heading",
    });
    // A markdown heading copied from the page text becomes a heading line.
    stubModel({
      ...GOOD_ANSWER,
      ingredients: [
        "3 large eggs",
        "¾ cup (150g) light brown sugar",
        "#### For the crust",
        "1 cup (125g) all-purpose flour",
      ],
    });
    const markdown = await extractRecipeWithLlm({ text: PAGE, config: OLLAMA });
    expect(markdown.found && markdown.recipe.ingredients?.[2]).toEqual({
      ingredient: "For the crust:",
      type: "heading",
    });
    // Step numbers dropped, the words kept.
    expect(result.recipe.instructions).toEqual([
      { text: "Toast the pecans." },
      { text: "Whisk the eggs and sugar, then stir in the pecans." },
      { text: "Bake for 1 hour." },
    ]);
    expect(result.warnings).toEqual([
      "extracted by local model qwen3:8b — 6/6 ingredient lines found verbatim on the page; check it",
    ]);
  });

  it("stays partial when the lines are not on the page", async () => {
    stubModel({
      ...GOOD_ANSWER,
      ingredients: [
        "1 1/2 cups (180g) pecans",
        "2 teaspoons vanilla extract",
        "1 tablespoon bourbon",
        "3 large eggs",
      ],
    });
    const result = await extractRecipeWithLlm({ text: PAGE, config: OLLAMA });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.recipe.partial).toBe(true);
    expect(result.llm).toMatchObject({ grounded: 2, total: 4 });
    expect(result.llm.ungrounded).toEqual([
      "2 teaspoons vanilla extract",
      "1 tablespoon bourbon",
    ]);
    expect(result.warnings[0]).toContain(
      "is partial — only 2/4 ingredient lines",
    );
    // No URL, no source (D8).
    expect(result.recipe.source).toBeUndefined();
  });

  it("stays partial with ingredients but no steps", async () => {
    stubModel({ ...GOOD_ANSWER, instructions: [] });
    const result = await extractRecipeWithLlm({ text: PAGE, config: OLLAMA });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.recipe.partial).toBe(true);
    expect(result.warnings[0]).toContain("it found no instructions");
  });

  it("turns 'Name:' instruction lines into groups, and drops a bare 'Instructions:'", async () => {
    stubModel({
      ...GOOD_ANSWER,
      instructions: [
        "Instructions:",
        "Toast the pecans.",
        "For the crust:",
        "Rub the butter into the flour.",
        "Make the filling: whisk the eggs and sugar.",
      ],
    });
    const result = await extractRecipeWithLlm({ text: PAGE, config: OLLAMA });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.recipe.instructions).toEqual([
      { text: "Toast the pecans." },
      {
        name: "For the crust",
        instructions: [
          { text: "Rub the butter into the flour." },
          // A step that starts with a label is still a step.
          { text: "Make the filling: whisk the eggs and sugar." },
        ],
      },
    ]);
  });

  it("still reads D7's first shape, {section, steps} objects", async () => {
    stubModel({
      ...GOOD_ANSWER,
      instructions: [
        { steps: ["Toast the pecans."] },
        {
          section: "For the crust:",
          steps: ["Rub the butter into the flour."],
        },
      ],
    });
    const result = await extractRecipeWithLlm({ text: PAGE, config: OLLAMA });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.recipe.instructions).toEqual([
      { text: "Toast the pecans." },
      {
        name: "For the crust",
        instructions: [{ text: "Rub the butter into the flour." }],
      },
    ]);
  });

  it("is found: false when the model finds no recipe", async () => {
    stubModel({ found: false, name: "", ingredients: [], instructions: [] });
    const result = await extractRecipeWithLlm({
      text: "Our privacy policy.",
      config: OLLAMA,
    });
    expect(result).toEqual({
      found: false,
      llm: {
        model: "qwen3:8b",
        api: "ollama",
        durationMs: expect.any(Number),
      },
    });
  });

  it("is found: false when the model says found but returns nothing", async () => {
    stubModel({ found: true, name: "Pie", ingredients: [], instructions: [] });
    const result = await extractRecipeWithLlm({ text: PAGE, config: OLLAMA });
    expect(result.found).toBe(false);
  });

  it("throws unconfigured with no model", async () => {
    vi.stubEnv("RECIPE_LLM_URL", "");
    const error = await extractRecipeWithLlm({ text: PAGE }).catch(
      (caught) => caught,
    );
    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe("unconfigured");
  });

  it("works over the OpenAI shape too", async () => {
    const calls = stubModel(GOOD_ANSWER, "openai");
    const result = await extractRecipeWithLlm({ text: PAGE, config: OPENAI });
    expect(calls[0].url).toBe("http://localhost:8080/v1/chat/completions");
    expect(
      (calls[0].body.response_format as { json_schema: { name: string } })
        .json_schema.name,
    ).toBe("recipe");
    expect(result.found && result.llm.grounded).toBe(6);
  });

  it("drops a time that is not a positive whole number, and names a nameless answer", async () => {
    stubModel({
      ...GOOD_ANSWER,
      name: "",
      prepTime: "0 minutes",
      cookTime: "overnight",
      totalTime: "45",
    });
    const result = await extractRecipeWithLlm({ text: PAGE, config: OLLAMA });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.recipe.prepTime).toBeUndefined();
    expect(result.recipe.cookTime).toBeUndefined();
    expect(result.recipe.totalTime).toBe(45);
    expect(result.recipe.name).toBe("Brown Butter Pecan Pie");
  });

  it("reads a malformed answer without throwing", () => {
    expect(
      readLlmAnswer({ ingredients: "flour", instructions: ["Mix it."] }),
    ).toMatchObject({
      found: true,
      ingredients: [],
      instructions: [{ steps: ["Mix it."] }],
    });
    expect(readLlmAnswer(null)).toMatchObject({ found: true, ingredients: [] });
  });
});

describe("a YouTube description (D8)", () => {
  // The shape of Brian Lagerstrom's descriptions: a sponsor read, "watch
  // next" links, a gear list of affiliate links, sub-recipes in grams with
  // volumes, numbered steps, chapters and a music credit.
  const DESCRIPTION = `Fully Loaded Pasta Salad | Brian Lagerstrom

This pasta salad uses an unconventional technique. Get $20 off your first order of Cometeer at https://cometeer.com/brian

▶️WATCH NEXT:
DAD RIBS: https://youtu.be/rlIL9KcdhM0

🔪MY GEAR:
CUTTING BOARD: https://amzn.to/341OgnD
DIGITAL SCALE: https://amzn.to/30bNZO3
**As an Amazon Associate I earn from qualifying purchases**

Pasta Salad:
2000g water
45g fine salt, for the pasta water
235g rotini
100g (about ½ cup) pitted Kalamata olives, cut into thirds

Dressing:
25g grainy mustard
1/4t dried oregano
200g (about 1 cup) neutral oil, such as canola

1. Bring water to a boil
2. Blend the mustard, oregano and oil until opaque
3. Boil the rotini 11 to 12 minutes, drain and toss with the dressing

Chapters:
0:00 Making the dressing
4:45 Boiling pasta

🎧MUSIC: EPIDEMIC SOUND https://www.epidemicsound.com/referral/x`;

  const ANSWER = {
    found: true,
    name: "Fully Loaded Pasta Salad",
    ingredients: [
      "Pasta Salad:",
      "2000g water",
      "45g fine salt, for the pasta water",
      "235g rotini",
      "100g (about 1/2 cup) pitted Kalamata olives, cut into thirds",
      "Dressing:",
      "25g grainy mustard",
      "1/4t dried oregano",
      "200g (about 1 cup) neutral oil, such as canola",
    ],
    instructions: [
      "Bring water to a boil",
      "Blend the mustard, oregano and oil until opaque",
      "Boil the rotini 11 to 12 minutes, drain and toss with the dressing",
    ],
  };

  it("tells the model what to ignore, and sends the description whole", async () => {
    const calls = stubModel(ANSWER);
    await extractRecipeWithLlm({
      text: DESCRIPTION,
      sourceKind: "text",
      config: OLLAMA,
    });
    const [system, user] = calls[0].body.messages as { content: string }[];
    for (const phrase of [
      "sponsor",
      "timestamps",
      "equipment lists",
      "social media handles",
      '"500g (4 cups) bread flour"',
      '"Dough:"',
    ]) {
      expect(system.content).toContain(phrase);
    }
    expect(user.content).toContain("4:45 Boiling pasta");
    expect(user.content).not.toContain("Source URL");
  });

  it("grounds the recipe lines, sections and dual units included", async () => {
    stubModel(ANSWER);
    const result = await extractRecipeWithLlm({
      text: DESCRIPTION,
      sourceKind: "text",
      config: OLLAMA,
    });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.llm).toMatchObject({ grounded: 9, total: 9 });
    expect(result.recipe.partial).toBeUndefined();
    const headings = result.recipe.ingredients
      ?.filter((entry) => entry.type === "heading")
      .map((entry) => entry.ingredient);
    expect(headings).toEqual(["Pasta Salad:", "Dressing:"]);
    expect(result.warnings[0]).toContain(
      "9/9 ingredient lines found verbatim in the text",
    );
  });

  it("does not ground a line the description never had", async () => {
    stubModel({
      ...ANSWER,
      ingredients: [
        ...ANSWER.ingredients,
        "2 tbsp red wine vinegar",
        "1 tsp honey",
      ],
    });
    const result = await extractRecipeWithLlm({
      text: DESCRIPTION,
      sourceKind: "text",
      config: OLLAMA,
    });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.llm).toMatchObject({ grounded: 9, total: 11 });
    expect(result.llm.ungrounded).toEqual([
      "2 tbsp red wine vinegar",
      "1 tsp honey",
    ]);
    expect(result.recipe.partial).toBe(true);
  });

  it("puts back lines the model skipped inside the list, not outside it", async () => {
    stubModel({
      ...ANSWER,
      // "235g rotini" and the olives line are skipped; so is everything
      // after the oil, where the list ends.
      ingredients: [
        "Pasta Salad:",
        "2000g water",
        "45g fine salt, for the pasta water",
        "Dressing:",
        "25g grainy mustard",
        "1/4t dried oregano",
        "200g (about 1 cup) neutral oil, such as canola",
      ],
    });
    const result = await extractRecipeWithLlm({
      text: DESCRIPTION,
      sourceKind: "text",
      config: OLLAMA,
    });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.llm.added).toEqual([
      "235g rotini",
      "100g (about ½ cup) pitted Kalamata olives, cut into thirds",
    ]);
    // Grounding counts the model's own seven lines only; the two put back are `added`.
    expect(result.llm).toMatchObject({ grounded: 7, total: 7, verbatim: 7 });
    expect(
      result.recipe.ingredients?.map((entry) =>
        entry.ingredient.replace(
          /<Multiplyable baseNumber="([^"]*)" \/>/g,
          "$1",
        ),
      ),
    ).toEqual([
      "Pasta Salad:",
      "2000g water",
      "45g fine salt, for the pasta water",
      "235g rotini",
      "100g (about 1/2 cup) pitted Kalamata olives, cut into thirds",
      "Dressing:",
      "25g grainy mustard",
      "1/4t dried oregano",
      "200g (about 1 cup) neutral oil, such as canola",
    ]);
    expect(result.warnings[0]).toContain(
      "(2 it skipped added back from the list)",
    );
  });

  it("replaces a garbled copy with the source line", () => {
    // qwen3:8b, CMU's Anzac biscuits: "desiccated" came back mangled.
    const source =
      "1/2 cup butter\n1 cup desiccated coconut\n1 cup plain flour\n\nMelt the butter.";
    expect(
      fillSkippedLines(
        ["1/2 cup butter", "1 cup desicc thaned coconut", "1 cup plain flour"],
        source,
      ),
    ).toEqual({
      lines: [
        "1/2 cup butter",
        "1 cup desiccated coconut",
        "1 cup plain flour",
      ],
      added: ["1 cup desiccated coconut"],
    });
  });

  it("grounds the model's own lines: put-back lines cannot lift the ratio", async () => {
    // A 20-line list; the model returns lines 1 and 5 plus two inventions.
    const list = Array.from(
      { length: 20 },
      (_, i) => `${i + 1} g ingredient number ${i + 1}`,
    );
    const text = [
      "Ingredients",
      ...list,
      "",
      "Instructions",
      "Mix it all.",
    ].join("\n");
    stubModel({
      found: true,
      name: "Twenty",
      ingredients: [
        list[0],
        list[4],
        "2 teaspoons vanilla extract",
        "1 tablespoon bourbon",
      ],
      instructions: ["Mix it all."],
    });
    const result = await extractRecipeWithLlm({ text, config: OLLAMA });
    if (!result.found) throw new Error("expected a recipe");
    // Lines 2–4 are put back, but grounding stays 2 of the model's 4.
    expect(result.llm.added).toEqual([list[1], list[2], list[3]]);
    expect(result.llm).toMatchObject({ grounded: 2, total: 4 });
    expect(result.recipe.partial).toBe(true);
    expect(result.warnings[0]).toContain("only 2/4 ingredient lines found");
    expect(result.warnings[0]).not.toContain("verbatim");
  });

  it("does not place a heading or a short line on a sentence or a longer line", () => {
    const source = [
      "This sauce is the best part, and the dough is easy too.",
      "20% off with code PIZZA",
      "Dough",
      "1 cup water for the dough",
      "1/4 tsp salt",
      "2 cups flour",
      "Sauce",
      "1 can tomatoes",
      "Instructions",
      "Mix.",
    ].join("\n");
    // "Sauce:" must not sit on the intro sentence (which would open a span
    // over "20% off…"), "For the dough:" not on "1 cup water for the dough",
    // and "4" not on "1/4 tsp salt".
    expect(
      sourcePositions(
        ["Sauce:", "For the dough:", "4", "1 cup water for the dough"],
        source,
      ),
    ).toEqual([6, 2, -1, 3]);
    const { lines, added } = fillSkippedLines(
      [
        "For the dough:",
        "1 cup water for the dough",
        "4",
        "2 cups flour",
        "Sauce:",
        "1 can tomatoes",
      ],
      source,
    );
    // The salt the model mangled to "4" comes back once, from the source.
    expect(added).toEqual(["1/4 tsp salt"]);
    expect(lines.filter((line) => line === "1/4 tsp salt")).toHaveLength(1);
    expect(lines).not.toContain("20% off with code PIZZA");
  });

  it("fills no promotions, temperatures, times or sentences, and not across Instructions", () => {
    const source = [
      "Cake",
      "2 cups flour",
      "1 cup sugar",
      "20% off with code BAKE",
      "350°F oven, preheated",
      "1 cup milk",
      "10 minutes later, stir",
      "2 eggs. Beat them well.",
      "2 tbsp butter",
      "Instructions",
      "350°F oven: preheat it.",
      "20% off with code BAKE",
      "10 minutes later, stir.",
      "Glaze",
      "1 cup powdered sugar",
      "2 tbsp milk",
    ].join("\n");
    const { lines, added } = fillSkippedLines(
      [
        "Cake:",
        "2 cups flour",
        "1 cup milk",
        "2 tbsp butter",
        "Glaze:",
        "1 cup powdered sugar",
        "2 tbsp milk",
      ],
      source,
    );
    // Only "1 cup sugar" is an ingredient in the cake's gaps; the glaze is
    // past "Instructions", so nothing is filled between the two lists.
    expect(added).toEqual(["1 cup sugar"]);
    expect(lines).toEqual([
      "Cake:",
      "2 cups flour",
      "1 cup sugar",
      "1 cup milk",
      "2 tbsp butter",
      "Glaze:",
      "1 cup powdered sugar",
      "2 tbsp milk",
    ]);
  });

  it("fills only small gaps", () => {
    const list = Array.from(
      { length: 8 },
      (_, i) => `${i + 1} g item ${i + 1}`,
    );
    expect(fillSkippedLines([list[0], list[7]], list.join("\n")).added).toEqual(
      [],
    );
  });

  it("adds nothing when the list is whole", () => {
    expect(
      fillSkippedLines(
        ["1 cup flour", "2 eggs"],
        "Ingredients\n* 1 cup flour\n* 2 eggs\n\n1. Mix.\n2. Bake 20 minutes.",
      ),
    ).toEqual({ lines: ["1 cup flour", "2 eggs"], added: [] });
  });

  it("sets source and video from a video URL", async () => {
    stubModel(ANSWER);
    const result = await extractRecipeWithLlm({
      text: DESCRIPTION,
      url: "https://www.youtube.com/watch?v=lo2pf0pYB9U",
      sourceKind: "text",
      config: OLLAMA,
    });
    if (!result.found) throw new Error("expected a recipe");
    expect(result.recipe.source?.url).toBe(
      "https://www.youtube.com/watch?v=lo2pf0pYB9U",
    );
    expect(result.recipe.videoImportUrl).toBe(
      "https://www.youtube.com/watch?v=lo2pf0pYB9U",
    );
  });

  it("builds the user prompt with only what it has", () => {
    expect(buildRecipeUserPrompt({ text: "x" })).toBe(
      "Extract the recipe from this text.\n\n--- TEXT ---\nx\n--- END OF TEXT ---",
    );
  });
});
