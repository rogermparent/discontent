// @vitest-environment node
//
// 36b: `applyLlm`, the one place that decides auto / force / off, on its
// own — the grounding floor's edges, the merge (the page keeps its picture,
// citation and suggested tags) — and the Settings page's `llmStatus` probe.
// `fetch` is stubbed: never a real model here.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  displayUrl,
  llmStatus,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  GROUNDED_FLOOR,
  applyLlm,
  assertLlmMode,
  autoWantsModel,
  recipeComment,
  videoFetchOptions,
  videoSource,
} from "../websites/recipe-website/editor/controller/llm/importWithLlm";
import {
  pickYtdlpMetadata,
  ytdlpToRecipe,
} from "../websites/recipe-website/editor/controller/ytdlp";

const CONFIG: LlmConfig = {
  url: "http://model.test:11434",
  model: "qwen3:8b",
  api: "ollama",
};

const TEXT = [
  "Pancakes",
  "1 cup flour",
  "1 egg",
  "1 cup milk",
  "1 tbsp sugar",
  "Whisk everything and fry.",
].join("\n");

function stubAnswer(
  ingredients: string[],
  instructions: string[] = ["Whisk everything and fry."],
) {
  const fetchStub = vi.fn(
    async (_url: string | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          model: "qwen3:8b",
          done: true,
          message: {
            role: "assistant",
            content: JSON.stringify({
              found: true,
              name: "Pancakes",
              ingredients,
              instructions,
            }),
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const MAPPED = {
  name: "Pancakes | Blog",
  partial: true,
  imageImportUrl: "https://example.com/p.jpg",
  images: [{ url: "https://example.com/p.jpg", from: "og" as const }],
  suggestedTags: ["breakfast"],
  source: { url: "https://example.com/p", name: "Blog" },
};

describe("applyLlm (36b)", () => {
  it("keeps exactly half, and drops anything under it", async () => {
    expect(GROUNDED_FLOOR).toBe(0.5);
    stubAnswer(["1 cup flour", "1 egg", "2 bananas", "1 tsp cinnamon"]);
    const half = await applyLlm({
      source: { text: TEXT },
      mapped: MAPPED,
      config: CONFIG,
    });
    expect(half.llm).toMatchObject({ grounded: 2, total: 4 });
    expect(half.llm?.discarded).toBeUndefined();
    expect(half.recipe?.partial).toBe(true);
    expect(half.recipe?.ingredients).toHaveLength(4);

    stubAnswer(["1 cup flour", "2 bananas", "1 tsp cinnamon"]);
    const under = await applyLlm({
      source: { text: TEXT },
      mapped: MAPPED,
      config: CONFIG,
    });
    expect(under.llm).toMatchObject({ discarded: true, grounded: 1, total: 3 });
    expect(under.recipe).toBe(MAPPED);
    expect(under.warnings).toEqual([
      "local model output discarded — only 1/3 ingredient lines found in the text",
    ]);
  });

  it("merges the model's lines over the page, which keeps its picture, citation and hints", async () => {
    stubAnswer(["1 cup flour", "1 egg", "1 cup milk", "1 tbsp sugar"]);
    const { recipe, llm } = await applyLlm({
      source: { text: TEXT },
      mapped: MAPPED,
      config: CONFIG,
    });
    expect(llm).toMatchObject({ found: true, grounded: 4, total: 4 });
    expect(recipe).toMatchObject({
      name: "Pancakes",
      imageImportUrl: MAPPED.imageImportUrl,
      images: MAPPED.images,
      suggestedTags: ["breakfast"],
      source: MAPPED.source,
    });
    expect(recipe?.partial).toBeUndefined();
    expect(recipe?.ingredients).toHaveLength(4);
    expect(recipe?.instructions).toHaveLength(1);
  });

  it("never asks the model under off, under auto over a recipe body, or for a 404", async () => {
    const fetchStub = stubAnswer(["1 cup flour"]);
    const schema = {
      name: "Pancakes",
      ingredients: [{ ingredient: "1 cup flour" }],
    };
    expect(autoWantsModel(schema)).toBe(false);
    expect(autoWantsModel(MAPPED)).toBe(true);
    expect(autoWantsModel(undefined)).toBe(true);
    expect(
      (
        await applyLlm({
          source: { text: TEXT },
          mapped: MAPPED,
          mode: "off",
          config: CONFIG,
        })
      ).recipe,
    ).toBe(MAPPED);
    expect(
      (
        await applyLlm({
          source: { text: TEXT },
          mapped: schema,
          config: CONFIG,
        })
      ).recipe,
    ).toBe(schema);
    expect(
      (
        await applyLlm({
          source: { html: "<p>Not found</p>", ok: false },
          mapped: undefined,
          mode: "force",
          config: CONFIG,
        })
      ).recipe,
    ).toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("refuses force with no model, and lets auto and off through", () => {
    expect(() => assertLlmMode("force", undefined)).toThrow(
      "no local model configured (RECIPE_LLM_URL)",
    );
    expect(() => assertLlmMode("auto", undefined)).not.toThrow();
    expect(() => assertLlmMode(undefined, undefined)).not.toThrow();
    expect(() => assertLlmMode("force", CONFIG)).not.toThrow();
  });
});

/* The review round (36b): the 90% line, empty lists, auto never partial
 * over a result that was not, force with nothing to read, the title. */
describe("applyLlm — review round (36b)", () => {
  const NINE = Array.from(
    { length: 9 },
    (_, i) => `${i + 1} cups flour no ${i + 1}`,
  );
  const NINE_TEXT = ["Bread", ...NINE, "Bake it."].join("\n");
  const SCHEMA = {
    name: "Pancakes",
    ingredients: [{ ingredient: "1 cup flour" }, { ingredient: "1 egg" }],
    instructions: [{ text: "Fry." }],
    source: { url: "https://example.com/p" },
  };

  it("trusts exactly 90% grounded, and keeps 80% as partial", async () => {
    stubAnswer([...NINE, "1 cup golden raisins"], ["Bake it."]);
    const ninety = await applyLlm({
      source: { text: NINE_TEXT },
      mapped: MAPPED,
      config: CONFIG,
    });
    expect(ninety.llm).toMatchObject({ grounded: 9, total: 10 });
    expect(ninety.recipe?.partial).toBeUndefined();
    expect(ninety.warnings[0]).toMatch(/^extracted by local model/);

    stubAnswer(
      [...NINE.slice(0, 8), "1 cup golden raisins", "2 tbsp honey"],
      ["Bake it."],
    );
    const eighty = await applyLlm({
      source: { text: NINE_TEXT },
      mapped: MAPPED,
      config: CONFIG,
    });
    expect(eighty.llm).toMatchObject({ grounded: 8, total: 10 });
    expect(eighty.recipe?.partial).toBe(true);
  });

  it("never wipes the schema's lists with an empty one under force", async () => {
    stubAnswer([], ["Whisk everything and fry."]);
    const noIngredients = await applyLlm({
      source: { text: TEXT },
      mapped: SCHEMA,
      mode: "force",
      config: CONFIG,
    });
    expect(noIngredients.recipe?.ingredients).toEqual(SCHEMA.ingredients);
    expect(noIngredients.recipe?.instructions).toHaveLength(1);
    expect(noIngredients.recipe?.instructions?.[0]).toMatchObject({
      text: "Whisk everything and fry.",
    });
    expect(noIngredients.recipe?.partial).toBeUndefined();
    expect(noIngredients.warnings).toContain(
      "the local model returned no ingredients: the page's own ingredients are kept",
    );

    stubAnswer(["1 cup flour", "1 egg", "1 cup milk"], []);
    const noSteps = await applyLlm({
      source: { text: TEXT },
      mapped: SCHEMA,
      mode: "force",
      config: CONFIG,
    });
    expect(noSteps.recipe?.ingredients).toHaveLength(3);
    expect(noSteps.recipe?.instructions).toEqual(SCHEMA.instructions);
    expect(noSteps.recipe?.partial).toBeUndefined();
    expect(noSteps.warnings).toContain(
      "the local model returned no instructions: the page's own instructions are kept",
    );
  });

  it("never makes a result partial under auto when it was not", async () => {
    /* A video: named, no body, not partial — ingredients but no method. */
    const video = {
      name: "Pancakes",
      videoImportUrl: "https://www.youtube.com/watch?v=x",
      source: { url: "https://www.youtube.com/watch?v=x", name: "YouTube" },
    };
    stubAnswer(["1 cup flour", "1 egg", "1 cup milk"], []);
    const result = await applyLlm({
      source: { text: TEXT },
      mapped: video,
      config: CONFIG,
    });
    expect(result.recipe?.partial).toBeUndefined();
    expect(result.recipe?.ingredients).toHaveLength(3);
    expect(result.recipe?.instructions).toEqual([]);
    expect(result.warnings[0]).toMatch(
      /reading is incomplete — it found no instructions; kept/,
    );
    /* The same reading under force is partial, as D4 says. */
    stubAnswer(["1 cup flour", "1 egg", "1 cup milk"], []);
    const forced = await applyLlm({
      source: { text: TEXT },
      mapped: video,
      mode: "force",
      config: CONFIG,
    });
    expect(forced.recipe?.partial).toBe(true);
  });

  it("says so when force has no text to read, and asks nothing", async () => {
    const fetchStub = stubAnswer(["1 cup flour"]);
    const forced = await applyLlm({
      source: { text: "  " },
      mapped: SCHEMA,
      mode: "force",
      config: CONFIG,
    });
    expect(forced.recipe).toBe(SCHEMA);
    expect(forced.llm).toEqual({
      model: "qwen3:8b",
      mode: "force",
      found: false,
      error: "no text to read",
    });
    expect(forced.warnings).toEqual(["local model not used — no text to read"]);
    const auto = await applyLlm({
      source: { text: "" },
      mapped: MAPPED,
      config: CONFIG,
    });
    expect(auto).toEqual({ recipe: MAPPED, warnings: [] });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("names the page by the mapper's name, not the <title>", async () => {
    const fetchStub = stubAnswer(["1 cup flour", "1 egg"]);
    await applyLlm({
      source: {
        html: "<html><head><title>Pancakes | Blog</title></head><body><ul><li>1 cup flour</li><li>1 egg</li></ul><p>Whisk everything and fry.</p></body></html>",
        meta: { title: "Pancakes | Blog", ogImages: [] },
      },
      mapped: SCHEMA,
      mode: "force",
      config: CONFIG,
    });
    const body = JSON.parse(String(fetchStub.mock.calls[0]?.[1]?.body));
    const user = body.messages[1].content as string;
    expect(user).toContain("Title: Pancakes\n");
    expect(user).not.toContain("Title: Pancakes | Blog");
  });
});

describe("displayUrl (36b)", () => {
  it("drops credentials, query and fragment", () => {
    expect(displayUrl("http://user:secret@gpu.lan:11434/?key=abc#x")).toBe(
      "http://gpu.lan:11434",
    );
    expect(displayUrl("http://localhost:11434/")).toBe(
      "http://localhost:11434",
    );
    expect(displayUrl("https://api.example/v1?token=t")).toBe(
      "https://api.example/v1",
    );
  });
});

describe("llmStatus (36b)", () => {
  it("asks Ollama's model list and finds the model in it", async () => {
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ models: [{ name: "qwen3:8b", model: "qwen3:8b" }] }),
        ),
    );
    vi.stubGlobal("fetch", fetchStub);
    expect(await llmStatus(CONFIG)).toEqual({
      reachable: true,
      modelAvailable: true,
    });
    expect(String(fetchStub.mock.calls[0]?.[0])).toBe(
      "http://model.test:11434/api/tags",
    );
    expect(await llmStatus({ ...CONFIG, model: "qwen3:14b" })).toEqual({
      reachable: true,
      modelAvailable: false,
    });
  });

  it("asks an OpenAI server's /v1/models, and never throws", async () => {
    const fetchStub = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ id: "qwen3-8b" }] })),
    );
    vi.stubGlobal("fetch", fetchStub);
    expect(
      await llmStatus({
        url: "http://127.0.0.1:8080/v1",
        model: "qwen3-8b",
        api: "openai",
      }),
    ).toEqual({ reachable: true, modelAvailable: true });
    expect(String(fetchStub.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:8080/v1/models",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await llmStatus(CONFIG)).toEqual({
      reachable: false,
      error: "fetch failed",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    expect(await llmStatus(CONFIG)).toEqual({
      reachable: false,
      error: "answered 500",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 36d: the video path reads everything yt-dlp gives                   */
/* ------------------------------------------------------------------ */

const VIDEO_URL = "https://www.youtube.com/watch?v=PINNED";

/** A video whose recipe is only in its pinned comment, with chapters. */
const PINNED_VIDEO = pickYtdlpMetadata(
  {
    title: "Sunday Pancakes",
    description: "Recipe in the pinned comment!",
    channel: "Test Kitchen",
    chapters: [
      { title: "Mixing", start_time: 0 },
      { title: "Frying", start_time: 75 },
      { title: "Long rest", start_time: 3725 },
    ],
    comments: [
      {
        parent: "root",
        author: "@viewer",
        text: "1 cup sugar makes it better",
      },
      {
        parent: "root",
        author: "@testkitchen",
        author_is_uploader: true,
        is_pinned: true,
        text: TEXT,
      },
    ],
  },
  VIDEO_URL,
);

/** The user message the stubbed model was sent. */
function sentText(fetchStub: ReturnType<typeof stubAnswer>): string {
  const body = JSON.parse(String(fetchStub.mock.calls[0]?.[1]?.body));
  return body.messages.find(
    (message: { role: string }) => message.role === "user",
  ).content;
}

describe("the video source (36d)", () => {
  it("sends the description and the pinned comment, not the chapters, and says so", () => {
    const source = videoSource(PINNED_VIDEO);
    if (!("text" in source)) throw new Error("expected text");
    expect(source.text).toBe(
      [
        "Sunday Pancakes",
        "Recipe in the pinned comment!",
        `Pinned comment:\n${TEXT}`,
      ].join("\n\n"),
    );
    /* The viewer's comment never reaches the model; nor do the chapters,
     * which only ever became steps (36d's measurement). */
    expect(source.text).not.toContain("sugar makes it better");
    expect(source.text).not.toContain("Frying");
    expect(source.label).toBe("the video's description and pinned comment");
    expect(source.meta).toEqual({
      title: "Sunday Pancakes",
      siteName: "Test Kitchen",
    });

    const bare = videoSource(pickYtdlpMetadata({ title: "Clip" }, VIDEO_URL));
    expect(bare).toMatchObject({ text: "Clip", label: "the video" });
  });

  it("takes the pinned comment, else the uploader's longest", () => {
    const comments = [
      { text: "short", pinned: false, byUploader: true },
      { text: "the longer one", pinned: false, byUploader: true },
    ];
    expect(recipeComment({ ...PINNED_VIDEO, comments })?.text).toBe(
      "the longer one",
    );
    expect(recipeComment(PINNED_VIDEO)?.pinned).toBe(true);
    const source = videoSource({ ...PINNED_VIDEO, comments });
    expect(source).toMatchObject({
      text: expect.stringContaining("Comment by the uploader:\nthe longer one"),
      label: "the video's description and comment",
    });
  });

  it("asks yt-dlp for comments only when a model will read them", () => {
    expect(videoFetchOptions("auto", CONFIG)).toEqual({ comments: true });
    expect(videoFetchOptions("force", CONFIG)).toEqual({ comments: true });
    expect(videoFetchOptions("off", CONFIG)).toEqual({ comments: false });
    expect(videoFetchOptions("auto", undefined)).toEqual({ comments: false });
  });

  it("grounds the model's lines against the whole text, and names it", async () => {
    const fetchStub = stubAnswer([
      "1 cup flour",
      "1 egg",
      "1 cup milk",
      "1 tbsp sugar",
    ]);
    const { recipe, llm, warnings } = await applyLlm({
      url: VIDEO_URL,
      source: videoSource(PINNED_VIDEO),
      mapped: ytdlpToRecipe(PINNED_VIDEO, VIDEO_URL),
      config: CONFIG,
    });
    const sent = sentText(fetchStub);
    expect(sent).toContain(`Pinned comment:\n${TEXT}`);
    expect(llm).toMatchObject({ found: true, grounded: 4, total: 4 });
    expect(recipe?.partial).toBeUndefined();
    expect(recipe?.videoImportUrl).toBe(VIDEO_URL);
    expect(warnings).toEqual([
      "read from the video's description and pinned comment by local model qwen3:8b — 4/4 ingredient lines found verbatim; check it",
    ]);

    /* A line that is only in a viewer's comment is not grounded. */
    stubAnswer(["1 cup sugar", "2 bananas", "1 egg"]);
    const invented = await applyLlm({
      url: VIDEO_URL,
      source: videoSource(PINNED_VIDEO),
      mapped: ytdlpToRecipe(PINNED_VIDEO, VIDEO_URL),
      config: CONFIG,
    });
    expect(invented.llm).toMatchObject({ grounded: 1, total: 3 });
    expect(invented.warnings).toEqual([
      "local model output discarded — only 1/3 ingredient lines found in the video's description and pinned comment",
    ]);
  });
});
