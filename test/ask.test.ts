// @vitest-environment node
//
// 43q: Ask — a question becomes a filled-in page. Against the real engine in
// a tmpdir (terms, recipes with lines, a meal plan), with the model's `fetch`
// stubbed — never a real model here or in CI. Pinned: which inputs read as a
// question; the answer's schema and its grounding (no invented tags, a
// holiday is a holiday, a feature or a pattern meets a line); the URLs and
// the "Opening …" labels; the prompt (the vocabulary in it, its size and
// context); the timeout and every other failure ending in the fallback word
// search; the route's auth and that nothing is written.

import { mkdtemp, readdir, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { UnauthenticatedError } from "../websites/recipe-website/editor/controller/curation/errors";
import { createGroup } from "../websites/recipe-website/editor/controller/curation/groups";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { createTerm } from "../websites/recipe-website/editor/controller/curation/terms";
import {
  ASK_FALLBACK_LABEL,
  ASK_JSON_SCHEMA,
  groundAnswer,
  type AskVocabulary,
} from "../websites/recipe-website/editor/controller/ask/answer";
import {
  ask,
  ASK_TIMEOUT_MS,
  readAskVocabulary,
} from "../websites/recipe-website/editor/controller/ask/ask";
import {
  askPrompt,
  ASK_SYSTEM_PROMPT,
} from "../websites/recipe-website/editor/controller/ask/prompt";
import { readsLikeQuestion } from "../websites/recipe-website/editor/controller/ask/question";
import {
  fallbackUrl,
  isSiteUrl,
} from "../websites/recipe-website/editor/controller/ask/urls";
import type { LlmConfig } from "../websites/recipe-website/editor/controller/llm/client";

let contentDirectory: string;
let ctx: CurationContext;
let signedIn = true;

/* The route with its auth stood in for: signed in, or the 401 a guest gets. */
vi.mock("recipe-editor/controller/apiContext", () => ({
  requireCurationContext: async () => {
    if (!signedIn) throw new UnauthenticatedError("Authentication required");
    return { contentDirectory };
  },
}));
const { POST: askRoute } =
  await import("../websites/recipe-website/editor/src/app/api/ask/route");

const OLLAMA: LlmConfig = {
  url: "http://localhost:11434",
  model: "qwen3:8b",
  api: "ollama",
};

const TODAY = new Date(2026, 9, 20);

async function seed(): Promise<void> {
  for (const term of [
    { label: "Drink", slug: "drink" },
    { label: "Sour", parent: "drink" },
    { label: "Highball", parent: "drink" },
    { label: "Spirit", slug: "spirit" },
    { label: "Gin", parent: "spirit" },
    { label: "Rum", parent: "spirit" },
    { label: "Course", slug: "course" },
    { label: "Desserts", slug: "dessert", parent: "course" },
    { label: "Cookies", parent: "dessert", aliases: ["Biscuits"] },
    { label: "Salads", slug: "salad", parent: "course" },
    { label: "Holidays", slug: "holidays" },
    { label: "Christmas", parent: "holidays", aliases: ["Xmas"] },
    { label: "Halloween", parent: "holidays" },
  ]) {
    await createTerm(ctx, term);
  }
  for (const recipe of [
    {
      name: "Daiquiri",
      tags: ["drink", "sour", "rum"],
      ingredients: ["2 oz white rum", "1 oz lime juice", "3/4 oz simple syrup"],
      date: 1_000,
    },
    {
      name: "Gin and Tonic",
      tags: ["drink", "highball", "gin"],
      ingredients: ["2 oz gin", "4 oz tonic water", "1 lime wedge"],
      date: 2_000,
    },
    {
      name: "Gin Sour",
      tags: ["drink", "sour", "gin", "christmas"],
      ingredients: ["2 oz gin", "1 oz lemon juice", "1 egg white"],
      date: 3_000,
    },
    {
      name: "Black Bean Salad",
      tags: ["salad"],
      ingredients: ["1 can black beans", "1 red onion", "1/4 cup lime juice"],
      date: 4_000,
    },
    {
      name: "Egg Salad",
      tags: ["salad"],
      ingredients: ["6 eggs", "1/3 cup mayo"],
      date: 5_000,
    },
    {
      name: "Sugar Cookies",
      tags: ["cookies", "christmas"],
      ingredients: ["1 cup butter", "1 cup sugar", "3 cups flour"],
      date: 6_000,
    },
  ]) {
    await createRecipe(ctx, recipe);
  }
  await createGroup(ctx, {
    name: "Week of Oct 12",
    kind: "meal-plan",
    items: ["black-bean-salad", "egg-salad"],
  });
}

let vocabulary: AskVocabulary;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "ask-"));
  ctx = { contentDirectory };
  signedIn = true;
  await seed();
  vocabulary = await readAskVocabulary(ctx);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** A model that answers every chat with `answer` (Ollama's shape). */
function stubModel(answer: unknown) {
  const calls: Call[] = [];
  const content = typeof answer === "string" ? answer : JSON.stringify(answer);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(
        JSON.stringify({
          model: "qwen3:8b",
          message: { role: "assistant", content },
          done: true,
          prompt_eval_count: 900,
          eval_count: 30,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

function params(url: string) {
  return new URL(url, "http://site").searchParams;
}

describe("readsLikeQuestion", () => {
  it.each([
    "what drinks can I make with lime",
    "What can I make with any kind of beans?",
    "which cookies for christmas",
    "show me something with gin",
    "I have gin and lime",
    "something sour with rum",
    "gin drinks for a party on friday night",
    "lime and gin drinks?",
  ])("reads %j as a question", (text) => {
    expect(readsLikeQuestion(text)).toBe(true);
  });

  it.each([
    "",
    "lime",
    "gin sour",
    "show cookies",
    "chocolate chip cookies",
    "tag:drink lime",
    "what can I make -tag:drink",
    "(gin OR rum) sour",
    "what?",
  ])("leaves %j a search", (text) => {
    expect(readsLikeQuestion(text)).toBe(false);
  });
});

describe("groundAnswer", () => {
  const question = "what drinks can I make with lime";

  it("fills What can I make with a kind and a featured ingredient", () => {
    const grounded = groundAnswer(
      { page: "make", kind: "drinks", features: ["lime"] },
      vocabulary,
      question,
    );
    expect(grounded).toEqual({
      ok: true,
      target: {
        page: "make",
        url: "/make?q=tag%3Adrink+ingredient%3Alime&ask=what+drinks+can+I+make+with+lime",
        label: "What can I make: drinks with lime",
      },
    });
  });

  it("keeps pattern items as the temporary scope (`?with=`), and a plain word as a feature", () => {
    const grounded = groundAnswer(
      { page: "make", kind: "food", patterns: ["bean*"] },
      vocabulary,
      "what can I make with any beans",
    );
    expect(grounded.ok).toBe(true);
    if (!grounded.ok) return;
    const query = params(grounded.target.url);
    expect(query.get("q")).toBe("-tag:drink");
    expect(query.getAll("with")).toEqual(["bean*"]);
    expect(grounded.target.label).toBe("What can I make: dishes using bean*");

    const mayo = groundAnswer(
      { page: "make", q: "tag:salad", patterns: ["/may(o|onnaise)/"] },
      vocabulary,
      "salads with mayo",
    );
    expect(mayo.ok && params(mayo.target.url).getAll("with")).toEqual([
      "/may(o|onnaise)/",
    ]);
    expect(mayo.ok && mayo.target.label).toBe(
      "What can I make: Salads using /may(o|onnaise)/",
    );
    /* Like features, patterns are ANDed: no salad has both. */
    expect(
      groundAnswer(
        { page: "make", patterns: ["bean*", "/may(o|onnaise)/"] },
        vocabulary,
        "beans and mayo",
      ),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });

    const word = groundAnswer(
      { page: "make", kind: "drinks", patterns: ["lime"] },
      vocabulary,
      question,
    );
    expect(word.ok && params(word.target.url).get("q")).toBe(
      "tag:drink ingredient:lime",
    );
  });

  it("names the tag picks in the label, and narrows by them", () => {
    const grounded = groundAnswer(
      { page: "make", kind: "drinks", q: "tag:sour", features: ["gin"] },
      vocabulary,
      "sours with gin",
    );
    expect(grounded.ok && grounded.target.label).toBe(
      "What can I make: Sour drinks with gin",
    );
  });

  it("refuses a feature no recipe in scope uses, a broken pattern, an empty scope", () => {
    expect(
      groundAnswer(
        { page: "make", kind: "drinks", features: ["quince"] },
        vocabulary,
        question,
      ),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });
    /* Mayo is in a salad, never in a drink. */
    expect(
      groundAnswer(
        { page: "make", kind: "drinks", patterns: ["/mayo/"] },
        vocabulary,
        question,
      ),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });
    expect(
      groundAnswer(
        { page: "make", patterns: ["/(a+)+$/"] },
        vocabulary,
        question,
      ),
    ).toMatchObject({ ok: false, refusal: { code: "invalid" } });
    expect(
      groundAnswer(
        { page: "make", kind: "drinks", q: "tag:cookies" },
        vocabulary,
        question,
      ),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });
  });

  it("opens a search, with the kind written into the query", () => {
    const grounded = groundAnswer(
      { page: "search", q: "tag:sour ingredient:gin", kind: "drinks" },
      vocabulary,
      "something sour with gin",
    );
    expect(grounded).toMatchObject({
      ok: true,
      target: {
        page: "search",
        label: "Search: tag:drink tag:sour ingredient:gin",
      },
    });
    expect(grounded.ok && params(grounded.target.url).get("ask")).toBe(
      "something sour with gin",
    );
  });

  it("refuses an invented tag or group (no invented tags)", () => {
    expect(
      groundAnswer(
        { page: "search", q: "tag:tiki ingredient:rum" },
        vocabulary,
        "tiki drinks",
      ),
    ).toEqual({
      ok: false,
      refusal: { code: "ungrounded", detail: "no such tag:tiki" },
    });
    expect(
      groundAnswer({ page: "search", q: "group:brunch" }, vocabulary, "brunch"),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });
    expect(
      groundAnswer({ page: "tag", slug: "tiki" }, vocabulary, "tiki"),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });
  });

  it("accepts a tag by any spelling and opens its canonical page", () => {
    expect(
      groundAnswer({ page: "tag", slug: "Biscuits" }, vocabulary, "biscuits"),
    ).toEqual({
      ok: true,
      target: {
        page: "tag",
        url: "/tags/cookies?ask=biscuits",
        label: "Tag: Cookies",
      },
    });
    /* A group's `group:` by name is grounded too. */
    expect(
      groundAnswer(
        { page: "search", q: 'group:"week of oct"' },
        vocabulary,
        "this week",
      ).ok,
    ).toBe(true);
  });

  it("opens a holiday, by alias too, with its kind; never a non-holiday", () => {
    expect(
      groundAnswer(
        { page: "holiday", slug: "xmas", kind: "drinks" },
        vocabulary,
        "christmas cocktails",
      ),
    ).toEqual({
      ok: true,
      target: {
        page: "holiday",
        url: "/holidays/christmas?kind=drinks&ask=christmas+cocktails",
        label: "Christmas: drinks",
      },
    });
    expect(
      groundAnswer(
        { page: "holiday", slug: "halloween", kind: "any" },
        vocabulary,
        "halloween",
      ),
    ).toMatchObject({
      ok: true,
      target: { url: "/holidays/halloween?ask=halloween", label: "Halloween" },
    });
    expect(
      groundAnswer({ page: "holiday", slug: "sour" }, vocabulary, "sour"),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });
  });

  it("opens a plan by its slug; an unknown one is refused", () => {
    expect(
      groundAnswer(
        { page: "plan", slug: "week-of-oct-12" },
        vocabulary,
        "this week's plan",
      ),
    ).toEqual({
      ok: true,
      target: {
        page: "plan",
        url: "/group/week-of-oct-12?ask=this+week%27s+plan",
        label: "Meal plan: Week of Oct 12",
      },
    });
    expect(
      groundAnswer({ page: "plan", slug: "next-week" }, vocabulary, "plan"),
    ).toMatchObject({ ok: false, refusal: { code: "ungrounded" } });
  });

  it("refuses what isn't an answer", () => {
    for (const data of [
      null,
      "make",
      { page: "recipe", slug: "daiquiri" },
      { page: "make", features: "lime" },
      { page: "search" },
      { page: "make", features: ["a", "b", "c", "d", "e"] },
    ]) {
      const grounded = groundAnswer(data, vocabulary, "q");
      expect(grounded.ok).toBe(false);
    }
  });

  it("drops fields a page doesn't read and empty strings", () => {
    expect(
      groundAnswer(
        { page: "tag", slug: "gin", q: "", features: [], reason: "it's gin" },
        vocabulary,
        "gin",
      ),
    ).toMatchObject({ ok: true, target: { url: "/tags/gin?ask=gin" } });
  });
});

describe("askPrompt", () => {
  it("carries the query language, the pages, the vocabulary and the plans", () => {
    const prompt = askPrompt("christmas cocktails", vocabulary, TODAY);
    expect(prompt.system).toBe(ASK_SYSTEM_PROMPT);
    for (const word of ["tag:", "ingredient:", "group:", "-tag:"]) {
      expect(prompt.system).toContain(word);
    }
    for (const page of ['"make"', '"search"', '"holiday"', '"tag"', '"plan"']) {
      expect(prompt.system).toContain(page);
    }
    expect(prompt.user).toContain("Today is 2026-10-20.");
    expect(prompt.user).toMatch(
      /^Food, Course \(tag:course\): .*dessert=Desserts \[cookies \(also biscuits\)\]/m,
    );
    expect(prompt.user).toMatch(
      /^Food, Holidays \(tag:holidays\): .*christmas \(also xmas\)/m,
    );
    expect(prompt.user).toMatch(/^Drinks, Spirit \(tag:spirit\): gin, rum$/m);
    expect(prompt.user).toContain("week-of-oct-12=Week of Oct 12 (meal plan,");
    expect(prompt.user.endsWith("QUESTION: christmas cocktails")).toBe(true);
  });

  it("is sized to fit the smallest context (40a)", () => {
    const prompt = askPrompt("what drinks can I make with lime", vocabulary);
    expect(prompt.tokens).toBeGreaterThan(500);
    expect(prompt.tokens).toBeLessThan(2_500);
    expect(prompt.numCtx).toBe(4_096);
  });
});

describe("ask", () => {
  it("asks the model once, schema-constrained and sized, and opens the grounded page", async () => {
    const calls = stubModel({
      page: "make",
      kind: "drinks",
      features: ["lime"],
    });
    const result = await ask(ctx, "  what drinks can I make\nwith lime ", {
      config: OLLAMA,
      vocabulary,
    });
    expect(result).toMatchObject({
      question: "what drinks can I make with lime",
      page: "make",
      url: "/make?q=tag%3Adrink+ingredient%3Alime&ask=what+drinks+can+I+make+with+lime",
      label: "What can I make: drinks with lime",
      model: expect.stringMatching(/^the local model/),
      numCtx: 4_096,
    });
    expect(result.fallback).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    expect(calls[0].body.format).toEqual(ASK_JSON_SCHEMA);
    expect(calls[0].body.options).toEqual({ num_ctx: 4_096, temperature: 0 });
    const messages = calls[0].body.messages as { content: string }[];
    expect(messages[1].content).toContain(
      "QUESTION: what drinks can I make with lime",
    );
  });

  it("falls back to the word search when the model invents a tag", async () => {
    stubModel({ page: "search", q: "tag:tiki" });
    const result = await ask(ctx, "tiki drinks?", {
      config: OLLAMA,
      vocabulary,
    });
    expect(result).toMatchObject({
      page: "search",
      url: "/search?q=tiki+drinks%3F&ask=tiki+drinks%3F",
      label: ASK_FALLBACK_LABEL,
      fallback: { code: "ungrounded", detail: "no such tag:tiki" },
    });
  });

  it("falls back on an answer that is not JSON, and on a server error", async () => {
    stubModel("make, probably");
    expect(
      (await ask(ctx, "anything", { config: OLLAMA, vocabulary })).fallback,
    ).toMatchObject({ code: "model" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 })),
    );
    expect(
      (await ask(ctx, "anything", { config: OLLAMA, vocabulary })).fallback,
    ).toMatchObject({ code: "model" });
  });

  it("falls back when the model doesn't answer in time", async () => {
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
    const result = await ask(ctx, "what can I make", {
      config: OLLAMA,
      vocabulary,
      timeoutMs: 40,
    });
    expect(result).toMatchObject({
      url: "/search?q=what+can+I+make&ask=what+can+I+make",
      label: ASK_FALLBACK_LABEL,
      fallback: { code: "timeout", detail: "no answer within 0 s" },
    });
    expect(ASK_TIMEOUT_MS).toBe(30_000);
  });

  it("falls back without a call when no model is set up", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const saved = {
      url: process.env.RECIPE_LLM_URL,
      api: process.env.RECIPE_LLM_API,
    };
    delete process.env.RECIPE_LLM_URL;
    delete process.env.RECIPE_LLM_API;
    try {
      const result = await ask(ctx, "what can I make with lime", {
        vocabulary,
      });
      expect(result.fallback).toEqual({
        code: "unconfigured",
        detail: "no model is set up",
      });
      expect(result.url).toBe(fallbackUrl("what can I make with lime"));
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      if (saved.url !== undefined) process.env.RECIPE_LLM_URL = saved.url;
      if (saved.api !== undefined) process.env.RECIPE_LLM_API = saved.api;
    }
  });
});

describe("POST /api/ask", () => {
  function post(body: unknown) {
    return askRoute(
      new Request("http://editor/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  }

  it("answers a guest 401, and a bad body 400", async () => {
    signedIn = false;
    expect((await post({ question: "gin?" })).status).toBe(401);
    signedIn = true;
    expect((await post({})).status).toBe(400);
    expect((await post({ question: "x".repeat(301) })).status).toBe(400);
    expect((await post({ question: "gin", extra: 1 })).status).toBe(400);
  });

  it("reads the site, asks the model, writes nothing", async () => {
    const before = await readdir(contentDirectory, { recursive: true });
    const previous = process.env.RECIPE_LLM_URL;
    process.env.RECIPE_LLM_URL = "http://127.0.0.1:11434";
    try {
      stubModel({ page: "holiday", slug: "christmas", kind: "drinks" });
      const response = await post({ question: "christmas cocktails" });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        page: "holiday",
        url: "/holidays/christmas?kind=drinks&ask=christmas+cocktails",
        label: "Christmas: drinks",
      });
      expect(isSiteUrl(body.url)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.RECIPE_LLM_URL;
      else process.env.RECIPE_LLM_URL = previous;
    }
    const after = await readdir(contentDirectory, { recursive: true });
    expect(after.sort()).toEqual(before.sort());
  });
});

describe("isSiteUrl", () => {
  it("takes a site path and nothing else", () => {
    expect(isSiteUrl("/make?q=")).toBe(true);
    for (const url of [
      "//evil.example",
      "/\\evil",
      "https://x.y/",
      "make",
      3,
    ]) {
      expect(isSiteUrl(url)).toBe(false);
    }
  });
});
