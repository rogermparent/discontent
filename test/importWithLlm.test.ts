// @vitest-environment node
//
// 36b: `applyLlm`, the one place that decides auto / force / off, on its
// own — the grounding floor's edges, the merge (the page keeps its picture,
// citation and suggested tags) — and the Settings page's `llmStatus` probe.
// `fetch` is stubbed: never a real model here.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  llmStatus,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  GROUNDED_FLOOR,
  applyLlm,
  assertLlmMode,
  autoWantsModel,
} from "../websites/recipe-website/editor/controller/llm/importWithLlm";

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

function stubAnswer(ingredients: string[]) {
  const fetchStub = vi.fn(
    async () =>
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
              instructions: ["Whisk everything and fry."],
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
