// @vitest-environment node
//
// 40a: the context an import asks for (`extractionContext`, a fixed ladder
// of steps), the placement warning that says why a model is not wholly on
// the GPU (the idle desktop, or another program, from the card's VRAM
// counters), and Ollama behind `RECIPE_LLM_API=openai`'s `/v1` (38-Te7).
// `fetch` is stubbed and the VRAM counters are files in a temp dir: never a
// real model, never this machine's GPU.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHARS_PER_TOKEN,
  DESKTOP_VRAM_BYTES,
  LLM_CONTEXT_STEPS,
  LLM_NUM_CTX,
  OLLAMA_V1_WARNING_KIND,
  contextStep,
  estimateTokens,
  ollamaBehindOpenAi,
  ollamaV1Warning,
  placementCause,
  placementWarning,
  readVram,
  resetOllamaProbes,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  EXTRACT_OUTPUT_MAX_TOKENS,
  extractionContext,
} from "../websites/recipe-website/editor/controller/llm/extractRecipe";
import { applyLlm } from "../websites/recipe-website/editor/controller/llm/importWithLlm";
import { memoryJobLog } from "../websites/recipe-website/editor/controller/jobs/log";
import { PAGE_TEXT_MAX_CHARS } from "../websites/recipe-website/common/util/pageText";

const LOCAL: LlmConfig = {
  url: "http://127.0.0.1:11434",
  model: "qwen3:8b",
  api: "ollama",
};

const LINES = ["1 cup flour", "1 egg", "1 cup milk", "1 tbsp sugar"];
const TEXT = ["Pancakes", ...LINES, "Whisk everything and fry."].join("\n");

/** A recipe-ish text of about `chars` characters: lines, never one word. */
function textOf(chars: number): string {
  const line = "2 cups all-purpose flour, sifted twice\n";
  return `Pancakes\n${line.repeat(Math.ceil(chars / line.length))}`.slice(
    0,
    chars,
  );
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "llm-context-"));
  resetOllamaProbes();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

/** amdgpu's counters for `cards` under a fresh dir, as `RECIPE_DRM_DIR`. */
async function fakeDrm(
  cards: Record<string, { used: string | number; total: string | number }>,
): Promise<string> {
  const drm = join(dir, "drm");
  await mkdir(drm, { recursive: true });
  for (const [name, { used, total }] of Object.entries(cards)) {
    await mkdir(join(drm, name, "device"), { recursive: true });
    await writeFile(
      join(drm, name, "device", "mem_info_vram_used"),
      `${used}\n`,
    );
    await writeFile(
      join(drm, name, "device", "mem_info_vram_total"),
      `${total}\n`,
    );
  }
  vi.stubEnv("RECIPE_DRM_DIR", drm);
  return drm;
}

/**
 * Ollama answering one recipe, its `/api/ps` listing the model at `size` /
 * `sizeVram`; the chat requests' bodies are kept.
 */
function stubOllama({
  size = 7_200_000_000,
  sizeVram = 7_200_000_000,
}: { size?: number; sizeVram?: number } = {}) {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(new URL(url).pathname);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: [{ name: "qwen3:8b", size, size_vram: sizeVram }],
        });
      }
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        model: "qwen3:8b",
        done: true,
        prompt_eval_count: 900,
        eval_count: 200,
        message: {
          role: "assistant",
          content: JSON.stringify({
            found: true,
            name: "Pancakes",
            ingredients: LINES,
            instructions: ["Whisk everything and fry."],
          }),
        },
      });
    }),
  );
  return { bodies, urls };
}

/* ------------------------------------------------------------------ */
/* The context                                                          */
/* ------------------------------------------------------------------ */

describe("the context an import asks for (40a, Da1)", () => {
  it("is a fixed ladder topped by LLM_NUM_CTX, and counts tokens high", () => {
    expect(LLM_CONTEXT_STEPS).toEqual([4_096, 8_192, LLM_NUM_CTX]);
    expect(LLM_NUM_CTX).toBe(12_288);
    expect(CHARS_PER_TOKEN).toBe(3);
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(10)).toBe(4);
    expect(contextStep(1)).toBe(4_096);
    expect(contextStep(4_096)).toBe(4_096);
    expect(contextStep(4_097)).toBe(8_192);
    expect(contextStep(8_193)).toBe(12_288);
    /* Past the top: the top — `capText` keeps a text under it. */
    expect(contextStep(50_000)).toBe(12_288);
  });

  it("short → 4096, long → the full context, a page in between → 8192", () => {
    expect(extractionContext(TEXT)).toBe(4_096);
    expect(extractionContext(textOf(1_000))).toBe(4_096);
    expect(extractionContext(textOf(6_000))).toBe(8_192);
    expect(extractionContext(textOf(12_000))).toBe(8_192);
    expect(extractionContext(textOf(13_000))).toBe(12_288);
    expect(extractionContext(textOf(PAGE_TEXT_MAX_CHARS))).toBe(12_288);
    /* Longer than the cap: cut to it first, so never past the top. */
    expect(extractionContext(textOf(80_000))).toBe(12_288);
  });

  it("is steady across nearby sizes: only the ladder's values, never down as a text grows", () => {
    const seen = new Set<number>();
    let last = 0;
    for (let chars = 0; chars <= 30_000; chars += 250) {
      const step = extractionContext(textOf(chars));
      expect(LLM_CONTEXT_STEPS).toContain(step);
      expect(step).toBeGreaterThanOrEqual(last);
      seen.add(step);
      last = step;
    }
    expect([...seen]).toEqual([4_096, 8_192, 12_288]);
    /* Neighbours share a step: 3 000 and 3 100 characters both ask 4 096. */
    expect(extractionContext(textOf(3_000))).toBe(
      extractionContext(textOf(3_100)),
    );
  });

  it("leaves room for the longest page's answer within the top step", () => {
    /* The cap's text, the prompt, and the most answer it allows still fit. */
    const prompt = estimateTokens(PAGE_TEXT_MAX_CHARS + 3_000);
    expect(prompt + EXTRACT_OUTPUT_MAX_TOKENS).toBeLessThanOrEqual(LLM_NUM_CTX);
  });

  it("sends the chosen num_ctx to Ollama and records it on the step", async () => {
    const { bodies } = stubOllama();
    const { log, lines } = memoryJobLog();
    await applyLlm({
      source: { text: TEXT },
      mapped: undefined,
      mode: "force",
      config: { ...LOCAL, url: "http://model.test:11434" },
      job: { log },
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].options).toEqual({ num_ctx: 4_096, temperature: 0 });
    expect(
      lines.find((line) => line.step === "llm.extract" && line.phase === "end")
        ?.data,
    ).toMatchObject({ numCtx: 4_096, gpu: 100 });

    bodies.length = 0;
    await applyLlm({
      source: { text: `${textOf(20_000)}\n${TEXT}` },
      mapped: undefined,
      mode: "force",
      config: { ...LOCAL, url: "http://model.test:11434" },
    });
    expect(bodies[0].options).toEqual({ num_ctx: 12_288, temperature: 0 });
  });

  it("sends no num_ctx to an OpenAI-style server", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  found: true,
                  name: "Pancakes",
                  ingredients: LINES,
                  instructions: ["Whisk everything and fry."],
                }),
              },
            },
          ],
        });
      }),
    );
    await applyLlm({
      source: { text: TEXT },
      mapped: undefined,
      mode: "force",
      config: { url: "http://gpu:8080", model: "m", api: "openai" },
    });
    expect(bodies).toHaveLength(1);
    expect(JSON.stringify(bodies[0])).not.toMatch(/num_ctx|options/);
  });
});

/* ------------------------------------------------------------------ */
/* VRAM and the placement wording                                       */
/* ------------------------------------------------------------------ */

describe("the card's VRAM (40a, Da2)", () => {
  it("reads the card with the most VRAM, skipping one without counters", async () => {
    const drm = await fakeDrm({
      card0: { used: 100_000_000, total: 512_000_000 },
      card1: { used: 7_900_000_000, total: 8_573_157_376 },
      card2: { used: "n/a", total: "?" },
    });
    await mkdir(join(drm, "card1-DP-1"), { recursive: true });
    await mkdir(join(drm, "card3"), { recursive: true });
    expect(await readVram()).toEqual({
      usedBytes: 7_900_000_000,
      totalBytes: 8_573_157_376,
    });
  });

  it("is undefined with no counters at all", async () => {
    expect(await readVram(join(dir, "nowhere"))).toBeUndefined();
    await mkdir(join(dir, "empty"));
    expect(await readVram(join(dir, "empty"))).toBeUndefined();
  });

  it("calls VRAM beyond the model the desktop up to the baseline, another program past it", () => {
    expect(DESKTOP_VRAM_BYTES).toBe(1_200_000_000);
    const vram = (others: number) => ({
      usedBytes: 6_500_000_000 + others,
      totalBytes: 8_573_157_376,
    });
    expect(placementCause(6_500_000_000, vram(800_000_000), 12_288)).toEqual({
      kind: "desktop",
      othersBytes: 800_000_000,
      numCtx: 12_288,
    });
    expect(placementCause(6_500_000_000, vram(1_200_000_000))?.kind).toBe(
      "desktop",
    );
    expect(placementCause(6_500_000_000, vram(2_400_000_000))).toEqual({
      kind: "other",
      othersBytes: 2_400_000_000,
    });
    expect(placementCause(6_500_000_000, undefined)).toBeUndefined();
  });

  it("words each cause: the desktop names the context and nothing to stop", () => {
    expect(
      placementWarning("qwen3:8b", 89, {
        kind: "desktop",
        othersBytes: 820_000_000,
        numCtx: 12_288,
      }),
    ).toBe(
      "local model qwen3:8b ran 89% on the GPU — it does not fit beside the desktop's ~0.8 GB of VRAM at num_ctx 12288, so the rest runs on the CPU, slower; nothing else holds VRAM, so there is nothing to stop",
    );
    expect(
      placementWarning("qwen3:8b", 40, {
        kind: "other",
        othersBytes: 2_960_000_000,
      }),
    ).toBe(
      'local model qwen3:8b ran 40% on the GPU — another program holds ~3.0 GB of VRAM, and the rest runs on the CPU, many times slower; run "ollama stop qwen3:8b" once it frees',
    );
    /* Unknown: the wording before 40a, word for word. */
    expect(placementWarning("qwen3:8b", 2)).toBe(
      'local model qwen3:8b ran 2% on the GPU — another program holds VRAM, and the rest runs on the CPU, many times slower; run "ollama stop qwen3:8b" once it frees',
    );
  });
});

describe("the placement warning in an import (40a, Da2)", () => {
  async function read(config: LlmConfig, text = textOf(20_000)) {
    const { log, lines } = memoryJobLog();
    await applyLlm({
      source: { text: `${text}\n${TEXT}` },
      mapped: undefined,
      mode: "force",
      config,
      job: { log },
    });
    return {
      surfaced: log.surfaced,
      note: lines.find((line) => line.step === "llm.placement"),
    };
  }

  it("blames the desktop when nothing else holds VRAM", async () => {
    await fakeDrm({
      card1: { used: 6_480_000_000 + 820_000_000, total: 8_573_157_376 },
    });
    stubOllama({ size: 7_200_000_000, sizeVram: 6_480_000_000 });
    const { surfaced, note } = await read(LOCAL);
    expect(surfaced).toEqual([
      placementWarning("qwen3:8b", 90, {
        kind: "desktop",
        othersBytes: 820_000_000,
        numCtx: 12_288,
      }),
    ]);
    expect(surfaced[0]).not.toMatch(/ollama stop|another program/);
    expect(note).toMatchObject({
      level: "warn",
      msg: "90% GPU — qwen3:8b does not fit beside the desktop's ~0.8 GB of VRAM at num_ctx 12288; nothing else holds VRAM, nothing to stop",
      data: {
        gpu: 90,
        numCtx: 12_288,
        vramUsed: 7_300_000_000,
        vramTotal: 8_573_157_376,
        others: 820_000_000,
        cause: "desktop",
      },
    });
  });

  it("names another program, and how much it holds", async () => {
    await fakeDrm({
      card0: { used: 2_880_000_000 + 4_000_000_000, total: 8_573_157_376 },
    });
    stubOllama({ size: 7_200_000_000, sizeVram: 2_880_000_000 });
    const { surfaced, note } = await read(LOCAL);
    expect(surfaced).toEqual([
      'local model qwen3:8b ran 40% on the GPU — another program holds ~4.0 GB of VRAM, and the rest runs on the CPU, many times slower; run "ollama stop qwen3:8b" once it frees',
    ]);
    expect(note?.data).toMatchObject({ cause: "other", others: 4_000_000_000 });
  });

  it("keeps the old wording with no counters, and for a model on another host", async () => {
    stubOllama({ size: 7_200_000_000, sizeVram: 144_000_000 });
    expect((await read(LOCAL)).surfaced).toEqual([
      placementWarning("qwen3:8b", 2),
    ]);
    /* Counters here, but the model is not: this card says nothing about it. */
    await fakeDrm({
      card0: { used: 1_000_000_000, total: 8_573_157_376 },
    });
    const remote = await read({ ...LOCAL, url: "http://gpu.lan:11434" });
    expect(remote.surfaced).toEqual([placementWarning("qwen3:8b", 2)]);
    expect(remote.note?.data).not.toHaveProperty("cause");
  });

  it("asks nothing of the card when the model is wholly on the GPU", async () => {
    await fakeDrm({ card0: { used: "x", total: "y" } });
    stubOllama();
    const { surfaced, note } = await read(LOCAL, TEXT);
    expect(surfaced).toEqual([]);
    expect(note).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Ollama behind /v1                                                     */
/* ------------------------------------------------------------------ */

describe("RECIPE_LLM_API=openai against Ollama's /v1 (40a, Da5)", () => {
  const OPENAI: LlmConfig = {
    url: "http://127.0.0.1:11434/v1",
    model: "qwen3:8b",
    api: "openai",
  };

  /** An OpenAI-style server; `/api/version` answers `version` (or 404). */
  function stubServer(version: string | undefined | "down") {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/api/version")) {
          if (version === "down") throw new TypeError("fetch failed");
          return version
            ? Response.json({ version })
            : new Response("404 page not found", { status: 404 });
        }
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  found: true,
                  name: "Pancakes",
                  ingredients: LINES,
                  instructions: ["Whisk everything and fry."],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        });
      }),
    );
    return urls;
  }

  it("probes the server's /api/version once, without the /v1", async () => {
    const urls = stubServer("0.40.5");
    expect(await ollamaBehindOpenAi(OPENAI)).toBe("0.40.5");
    expect(await ollamaBehindOpenAi({ ...OPENAI, url: `${OPENAI.url}/` })).toBe(
      "0.40.5",
    );
    expect(urls).toEqual(["http://127.0.0.1:11434/api/version"]);
    /* Not asked for Ollama's own API, nor the Claude API. */
    expect(await ollamaBehindOpenAi({ ...OPENAI, api: "ollama" })).toBe(
      undefined,
    );
    expect(urls).toHaveLength(1);
  });

  it("remembers a server that is not Ollama, and asks a down one again", async () => {
    const urls = stubServer(undefined);
    expect(await ollamaBehindOpenAi(OPENAI)).toBeUndefined();
    expect(await ollamaBehindOpenAi(OPENAI)).toBeUndefined();
    expect(urls).toHaveLength(1);
    resetOllamaProbes();
    const again = stubServer("down");
    expect(await ollamaBehindOpenAi(OPENAI)).toBeUndefined();
    expect(await ollamaBehindOpenAi(OPENAI)).toBeUndefined();
    expect(again).toHaveLength(2);
  });

  it("warns in the import's job — once in the log, once in the result", async () => {
    const urls = stubServer("0.40.5");
    const { log, lines } = memoryJobLog();
    const result = await applyLlm({
      source: { text: TEXT },
      mapped: undefined,
      mode: "force",
      config: OPENAI,
      job: { log },
    });
    expect(result.llm?.found).toBe(true);
    const warning = ollamaV1Warning("0.40.5", OPENAI.url);
    expect(warning).toBe(
      "RECIPE_LLM_API=openai, but Ollama 0.40.5 answers at http://127.0.0.1:11434 — through its /v1 endpoint the context size (num_ctx) is not sent, so Ollama's own default applies and may cut a long page, and the unload, the reload and the GPU placement check do not run; set RECIPE_LLM_API=ollama",
    );
    expect(log.surfaced).toEqual([warning]);
    expect(lines.filter((line) => line.step === "llm.api")).toEqual([
      expect.objectContaining({
        level: "warn",
        msg: "Ollama 0.40.5 behind /v1: no num_ctx, unload, reload or placement check — set RECIPE_LLM_API=ollama",
        data: { version: "0.40.5" },
      }),
    ]);
    /* Still no Ollama-API requests through /v1: no /api/ps, no unload. */
    expect(urls).toEqual([
      "http://127.0.0.1:11434/api/version",
      "http://127.0.0.1:11434/v1/chat/completions",
    ]);
    expect(OLLAMA_V1_WARNING_KIND).toBe("llm.api");
  });

  it("says nothing for a server that is not Ollama, or outside a job", async () => {
    const urls = stubServer(undefined);
    const { log, lines } = memoryJobLog();
    await applyLlm({
      source: { text: TEXT },
      mapped: undefined,
      mode: "force",
      config: OPENAI,
      job: { log },
    });
    expect(log.surfaced).toEqual([]);
    expect(lines.some((line) => line.step === "llm.api")).toBe(false);
    resetOllamaProbes();
    urls.length = 0;
    stubServer("0.40.5");
    await applyLlm({
      source: { text: TEXT },
      mapped: undefined,
      mode: "force",
      config: OPENAI,
    });
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:11434/v1/chat/completions",
    ]);
  });
});
