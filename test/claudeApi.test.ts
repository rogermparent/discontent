// @vitest-environment node
//
// 38g: the Claude API as a third model style (`RECIPE_LLM_API=anthropic`).
// `fetch` is stubbed throughout — never a real API call here or in CI, and no
// real key: KEY below is a made-up string. Pinned: the configuration (on only
// with a key, the URL default, the vision model defaulting to the text
// model), the Messages API request shape (headers, `system`, images before
// the text, structured outputs, no `temperature`), the answers (text blocks,
// `usage`), the failures (`max_tokens`, a refusal, 401, an error body), the
// one retry after 429, the key never leaving in a message or a job's files,
// no GPU machinery, `llmStatus`, and the photo cap per style.

import { mkdtemp, readFile, readdir, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_DEFAULT_URL,
  ANTHROPIC_MAX_TOKENS,
  CLAUDE_NO_KEY_MESSAGE,
  CLAUDE_RETRY_DEFAULT_MS,
  CLAUDE_RETRY_MAX_MS,
  chatJson,
  chatText,
  claudeSchema,
  LLM_UNCONFIGURED_MESSAGE,
  LlmError,
  llmConfig,
  llmStatus,
  llmUnconfiguredMessage,
  modelLabel,
  publicLlmConfig,
  retryDelayMs,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  photoLimits,
  preparePhoto,
  transcribeKey,
  transcribePhotos,
  visionConfig,
} from "../websites/recipe-website/editor/controller/llm/vision";
import {
  CLAUDE_PHOTO_MAX_SIDE,
  PHOTO_MAX_SIDE,
} from "../websites/recipe-website/editor/controller/llm/photoPrep";
import { LLM_RECIPE_SCHEMA } from "../websites/recipe-website/editor/controller/llm/extractRecipe";
import {
  LLM_LIST_SCHEMA,
  LLM_ONE_DISH_SCHEMA,
} from "../websites/recipe-website/editor/controller/llm/splitRecipes";
import { runJob } from "../websites/recipe-website/editor/controller/jobs/run";
import { readJobLog } from "../websites/recipe-website/editor/controller/jobs/store";
import { redactText } from "../websites/recipe-website/editor/controller/jobs/log";

/** Not a real key: a made-up string shaped like one. */
const KEY = "sk-ant-test-0000-not-a-real-key-38g";

const CLAUDE: LlmConfig = {
  url: ANTHROPIC_DEFAULT_URL,
  model: "claude-sonnet-5",
  api: "anthropic",
  apiKey: KEY,
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

/** A message as the Messages API answers it. */
function message(
  content: unknown[],
  {
    stop = "end_turn",
    usage = { input_tokens: 1500, output_tokens: 420 },
  }: { stop?: string; usage?: Record<string, number> } = {},
) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content,
    stop_reason: stop,
    usage,
  };
}

/** `fetch` answering each call with the next of `answers` (the last repeats). */
function stubApi(answers: (() => Response)[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: { ...(init?.headers as Record<string, string>) },
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return answers[Math.min(calls.length, answers.length) - 1]();
    }),
  );
  return calls;
}

const json =
  (body: unknown, status = 200, headers: HeadersInit = {}) =>
  () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

let jobsDir: string;

beforeEach(async () => {
  jobsDir = await mkdtemp(join(tmpdir(), "claude-jobs-"));
  vi.stubEnv("RECIPE_JOBS_DIR", jobsDir);
  vi.stubEnv("RECIPE_QUEUE_DIR", join(jobsDir, "queue"));
  for (const name of [
    "RECIPE_LLM_URL",
    "RECIPE_LLM_API",
    "RECIPE_LLM_API_KEY",
    "RECIPE_LLM_MODEL",
    "RECIPE_LLM_VISION_MODEL",
  ]) {
    vi.stubEnv(name, "");
  }
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(jobsDir, { recursive: true, force: true });
});

describe("configuration (38g)", () => {
  it("is off without a key, and says why", () => {
    expect(llmConfig({ RECIPE_LLM_API: "anthropic" })).toBeUndefined();
    expect(
      llmConfig({
        RECIPE_LLM_API: "anthropic",
        RECIPE_LLM_URL: "https://api.anthropic.com",
        RECIPE_LLM_API_KEY: " ",
      }),
    ).toBeUndefined();
    /* A shell's own key is never picked up. */
    expect(
      llmConfig({ RECIPE_LLM_API: "anthropic", ANTHROPIC_API_KEY: KEY }),
    ).toBeUndefined();
    expect(llmUnconfiguredMessage({ RECIPE_LLM_API: "anthropic" })).toBe(
      CLAUDE_NO_KEY_MESSAGE,
    );
    expect(llmUnconfiguredMessage({})).toBe(LLM_UNCONFIGURED_MESSAGE);
  });

  it("defaults the URL and the model, and takes overrides", () => {
    expect(
      llmConfig({ RECIPE_LLM_API: "Anthropic", RECIPE_LLM_API_KEY: KEY }),
    ).toEqual(CLAUDE);
    expect(
      llmConfig({
        RECIPE_LLM_API: "anthropic",
        RECIPE_LLM_API_KEY: KEY,
        RECIPE_LLM_URL: "https://proxy.example/",
        RECIPE_LLM_MODEL: "claude-haiku-4-5",
      }),
    ).toEqual({
      url: "https://proxy.example",
      model: "claude-haiku-4-5",
      api: "anthropic",
      apiKey: KEY,
    });
  });

  it("leaves the other styles as they were, the key only an openai bearer", () => {
    expect(llmConfig({ RECIPE_LLM_API_KEY: KEY })).toBeUndefined();
    expect(
      llmConfig({
        RECIPE_LLM_URL: "http://gpu:11434",
        RECIPE_LLM_API_KEY: KEY,
      }),
    ).toEqual({ url: "http://gpu:11434", model: "qwen3:8b", api: "ollama" });
    expect(
      llmConfig({
        RECIPE_LLM_URL: "http://gpu:8080",
        RECIPE_LLM_API: "openai",
        RECIPE_LLM_API_KEY: KEY,
      }),
    ).toEqual({
      url: "http://gpu:8080",
      model: "qwen3:8b",
      api: "openai",
      apiKey: KEY,
    });
  });

  it("defaults the vision model to the text model; RECIPE_LLM_VISION_MODEL overrides", () => {
    vi.stubEnv("RECIPE_LLM_API", "anthropic");
    vi.stubEnv("RECIPE_LLM_API_KEY", KEY);
    expect(visionConfig()).toEqual(CLAUDE);
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "claude-haiku-4-5");
    expect(visionConfig()?.model).toBe("claude-haiku-4-5");
    vi.stubEnv("RECIPE_LLM_API_KEY", "");
    expect(visionConfig()).toBeUndefined();
  });

  it("is shown without the key", () => {
    expect(publicLlmConfig(CLAUDE)).toEqual({
      url: ANTHROPIC_DEFAULT_URL,
      model: "claude-sonnet-5",
      api: "anthropic",
      apiKey: "set",
    });
    expect(JSON.stringify(publicLlmConfig(CLAUDE))).not.toContain(KEY);
    expect(modelLabel(CLAUDE)).toBe("the Claude API (claude-sonnet-5)");
    expect(
      modelLabel({ ...CLAUDE, url: "https://user:pw@proxy.example/x?k=1" }),
    ).toBe("the Claude API (claude-sonnet-5) at https://proxy.example/x");
  });
});

describe("claudeSchema (Dg2)", () => {
  it("closes every object and keeps each schema's object root", () => {
    for (const schema of [
      LLM_RECIPE_SCHEMA,
      LLM_LIST_SCHEMA,
      LLM_ONE_DISH_SCHEMA,
    ]) {
      const closed = claudeSchema(schema as Record<string, unknown>);
      expect(closed.type).toBe("object");
      expect(closed.additionalProperties).toBe(false);
      expect(closed.required).toEqual(schema.required);
    }
    const list = claudeSchema(LLM_LIST_SCHEMA as Record<string, unknown>) as {
      properties: {
        recipes: { items: { additionalProperties?: unknown } };
      };
    };
    expect(list.properties.recipes.items.additionalProperties).toBe(false);
  });

  it("drops what structured outputs do not take, and refuses a non-object root", () => {
    expect(
      claudeSchema({
        type: "object",
        properties: {
          n: { type: "integer", minimum: 1, maximum: 9 },
          s: { type: "string", maxLength: 3 },
          a: { type: "array", items: { type: "string" }, minItems: 2 },
        },
      }),
    ).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        n: { type: "integer" },
        s: { type: "string" },
        a: { type: "array", items: { type: "string" } },
      },
    });
    expect(() => claudeSchema({ type: "array" })).toThrow(/object/);
  });
});

describe("the Messages API request (38g)", () => {
  it("posts /v1/messages with the key headers, system, structured output and no temperature", async () => {
    const calls = stubApi([
      json(message([{ type: "text", text: '{"oneDish":true}' }])),
    ]);
    const result = await chatJson({
      system: "sys",
      user: "usr",
      schema: LLM_ONE_DISH_SCHEMA as unknown as Record<string, unknown>,
      config: CLAUDE,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers).toEqual({
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    });
    expect(calls[0].body).toEqual({
      model: "claude-sonnet-5",
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "usr" }] }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { oneDish: { type: "boolean" } },
            required: ["oneDish"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(calls[0].body).not.toHaveProperty("temperature");
    expect(calls[0].body).not.toHaveProperty("tools");
    expect(result.data).toEqual({ oneDish: true });
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.promptTokens).toBe(1500);
    expect(result.outputTokens).toBe(420);
  });

  it("sends pictures as base64 image blocks before the text, and reads the text blocks", async () => {
    const bytes = Buffer.from("not really a jpeg");
    const calls = stubApi([
      json(
        message([
          { type: "thinking", thinking: "" },
          { type: "text", text: "Oat Cookies\n" },
          { type: "text", text: "1 cup butter  " },
        ]),
      ),
    ]);
    const answer = await chatText({
      system: "transcribe",
      user: "Transcribe this photo of a recipe.",
      images: [{ bytes, type: "image/jpeg" }],
      config: CLAUDE,
      unload: true,
    });
    expect(answer.text).toBe("Oat Cookies\n1 cup butter");
    expect(calls).toHaveLength(1);
    expect(calls[0].body?.output_config).toBeUndefined();
    expect(
      (calls[0].body?.messages as { content: unknown[] }[])[0].content,
    ).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: bytes.toString("base64"),
        },
      },
      { type: "text", text: "Transcribe this photo of a recipe." },
    ]);
  });

  it("asks a non-default URL as configured", async () => {
    const calls = stubApi([json(message([{ type: "text", text: "{}" }]))]);
    await chatJson({
      system: "s",
      user: "u",
      schema: { type: "object" },
      config: { ...CLAUDE, url: "https://proxy.example/" },
    });
    expect(calls[0].url).toBe("https://proxy.example/v1/messages");
  });
});

describe("failures (38g)", () => {
  const request = {
    system: "s",
    user: "u",
    schema: { type: "object" },
    config: CLAUDE,
  };

  it("is a cut-off answer at max_tokens, not a parse error", async () => {
    stubApi([
      json(
        message([{ type: "text", text: '{"name": "Pie", "ingr' }], {
          stop: "max_tokens",
        }),
      ),
    ]);
    const error = await chatJson(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe("model");
    expect(error.message).toBe(
      `the Claude API (claude-sonnet-5)'s answer was cut off: it reached max_tokens (${ANTHROPIC_MAX_TOKENS}) before it finished`,
    );
  });

  it("is a refusal when Claude declines", async () => {
    stubApi([json(message([], { stop: "refusal" }))]);
    const error = await chatJson(request).catch((caught) => caught);
    expect(error.kind).toBe("model");
    expect(error.message).toContain("declined");
  });

  it("says the key was refused on a 401, never the key", async () => {
    const calls = stubApi([
      json(
        {
          type: "error",
          error: { type: "authentication_error", message: "invalid x-api-key" },
        },
        401,
      ),
    ]);
    const error = await chatJson(request).catch((caught) => caught);
    expect(calls).toHaveLength(1);
    expect(error.kind).toBe("http");
    expect(error.status).toBe(401);
    expect(error.message).toBe(
      "the Claude API (claude-sonnet-5) refused the API key (RECIPE_LLM_API_KEY): 401 — invalid x-api-key",
    );
    expect(error.message).not.toContain(KEY);
  });

  it("surfaces an error body's message, capped", async () => {
    stubApi([
      json(
        {
          type: "error",
          error: { type: "invalid_request_error", message: "x".repeat(500) },
        },
        400,
      ),
    ]);
    const error = await chatJson(request).catch((caught) => caught);
    expect(error.kind).toBe("http");
    expect(error.message).toMatch(/answered 400: x{200}…$/);
    stubApi([
      json({ type: "error", error: { message: "overloaded somewhere" } }),
    ]);
    const answered = await chatJson(request).catch((caught) => caught);
    expect(answered.kind).toBe("model");
    expect(answered.message).toBe(
      "the Claude API (claude-sonnet-5) failed: overloaded somewhere",
    );
  });

  it("retries a 429 once after retry-after, logged in the step", async () => {
    const calls = stubApi([
      json(
        { type: "error", error: { type: "rate_limit_error", message: "slow" } },
        429,
        { "retry-after": "0" },
      ),
      json(message([{ type: "text", text: '{"ok":true}' }])),
    ]);
    const { job, result } = await runJob(
      { kind: "test", label: "claude", spec: {} },
      (context) =>
        context.log.step("llm.extract", {}, (step) =>
          chatJson({ ...request, job: context, step }),
        ),
      { dir: jobsDir, mirror: null },
    );
    expect(result.data).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    const { lines } = await readJobLog(jobsDir, job);
    const retry = lines.find((line) => line.step === "llm.retry");
    expect(retry?.msg).toBe(
      "the Claude API (claude-sonnet-5) answered 429 — asking once more in 0 s",
    );
    expect(retry?.data).toEqual({ status: 429, waitMs: 0 });
    /* The usage reaches the step, as the other styles' counts do. */
    expect(
      lines.find((line) => line.step === "llm.extract" && line.phase === "end")
        ?.data,
    ).toMatchObject({
      model: "claude-sonnet-5",
      promptTokens: 1500,
      outputTokens: 420,
    });
    /* Dg3: no GPU machinery — no queue wait, no placement, no unload. */
    expect(
      lines.filter((line) =>
        ["queue.wait", "llm.placement", "llm.unload", "llm.reload"].includes(
          line.step,
        ),
      ),
    ).toEqual([]);
    expect(calls.every((call) => call.url.endsWith("/v1/messages"))).toBe(true);
  });

  it("retries only once: a second 529 is the failure", async () => {
    const calls = stubApi([
      json(
        { type: "error", error: { type: "overloaded_error", message: "busy" } },
        529,
        { "retry-after": "0" },
      ),
    ]);
    const error = await chatJson(request).catch((caught) => caught);
    expect(calls).toHaveLength(2);
    expect(error.kind).toBe("http");
    expect(error.status).toBe(529);
    expect(error.message).toBe(
      "the Claude API (claude-sonnet-5) answered 529: busy",
    );
  });

  it("does not retry a 400", async () => {
    const calls = stubApi([
      json({ type: "error", error: { message: "bad" } }, 400),
    ]);
    await chatJson(request).catch(() => undefined);
    expect(calls).toHaveLength(1);
  });

  it("reads retry-after as seconds or a date, capped at 30 s, else 5 s", () => {
    expect(retryDelayMs("2")).toBe(2000);
    expect(retryDelayMs("120")).toBe(CLAUDE_RETRY_MAX_MS);
    expect(retryDelayMs(null)).toBe(CLAUDE_RETRY_DEFAULT_MS);
    expect(retryDelayMs("soon")).toBe(CLAUDE_RETRY_DEFAULT_MS);
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(retryDelayMs("Fri, 16 Oct 2026 12:00:07 GMT", now)).toBe(7000);
  });
});

/** Every file under `dir`, as text. */
async function allText(dir: string): Promise<string> {
  const texts: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) texts.push(await allText(path));
    else if (entry.isFile()) texts.push(await readFile(path, "utf8"));
  }
  return texts.join("\n");
}

describe("the key never leaks (Dg6)", () => {
  it("is in no error, step line or job file of a failed call — even when the server echoes it", async () => {
    /* A proxy that echoes what it was sent: the worst case. */
    stubApi([
      json(
        { type: "error", error: { message: `bad key ${KEY} for this org` } },
        500,
        { "retry-after": "0" },
      ),
    ]);
    let failure: unknown;
    const { job } = await runJob(
      { kind: "test", label: "claude", spec: {} },
      async (context) => {
        failure = await context.log
          .step("llm.extract", { model: CLAUDE.model }, (step) =>
            chatJson({
              system: "s",
              user: "u",
              schema: { type: "object" },
              config: CLAUDE,
              job: context,
              step,
            }),
          )
          .catch((caught) => caught);
        return "done";
      },
      { dir: jobsDir, mirror: null },
    );
    expect(failure).toBeInstanceOf(LlmError);
    expect((failure as Error).message).toContain("[redacted]");
    expect((failure as Error).message).not.toContain(KEY);
    const { lines } = await readJobLog(jobsDir, job);
    expect(lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(lines)).not.toContain(KEY);
    expect(await allText(jobsDir)).not.toContain(KEY);
  });

  it("is scrubbed by the job log's redaction (37-D2) by its variable's name", () => {
    vi.stubEnv("RECIPE_LLM_API_KEY", KEY);
    expect(redactText(`the key is ${KEY}`)).toBe("the key is [redacted]");
  });

  it("is not in an unreachable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError(`fetch failed for ${KEY}`);
      }),
    );
    const error = await chatJson({
      system: "s",
      user: "u",
      schema: { type: "object" },
      config: CLAUDE,
    }).catch((caught) => caught);
    expect(error.kind).toBe("unreachable");
    expect(error.message).not.toContain(KEY);
  });
});

describe("llmStatus (38g)", () => {
  it("asks /v1/models/{model} with the key: 200, 404, 401", async () => {
    const calls = stubApi([json({ id: "claude-sonnet-5", type: "model" })]);
    expect(await llmStatus(CLAUDE)).toEqual({
      reachable: true,
      modelAvailable: true,
    });
    expect(calls[0].url).toBe(
      "https://api.anthropic.com/v1/models/claude-sonnet-5",
    );
    expect(calls[0].headers).toEqual({
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    });
    stubApi([json({ type: "error", error: { message: "not found" } }, 404)]);
    expect(await llmStatus(CLAUDE)).toEqual({
      reachable: true,
      modelAvailable: false,
    });
    stubApi([json({ type: "error", error: { message: "invalid" } }, 401)]);
    const refused = await llmStatus(CLAUDE);
    expect(refused).toEqual({
      reachable: false,
      keyRefused: true,
      error: "the API key was refused (401)",
    });
  });

  it("sends an openai server the key as a bearer", async () => {
    const calls = stubApi([json({ data: [{ id: "qwen3-8b" }] })]);
    await llmStatus({
      url: "http://gpu:8080",
      model: "qwen3-8b",
      api: "openai",
      apiKey: KEY,
    });
    expect(calls[0].headers).toEqual({ authorization: `Bearer ${KEY}` });
  });
});

describe("photos under the Claude API (38g, Dg7)", () => {
  async function bigCard(): Promise<Buffer> {
    return sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: { r: 250, g: 240, b: 220 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  it("fits a photo inside 1568 px for Claude and 1024 px for Ollama", async () => {
    expect(photoLimits(CLAUDE).maxSide).toBe(CLAUDE_PHOTO_MAX_SIDE);
    expect(photoLimits({ ...CLAUDE, api: "ollama" }).maxSide).toBe(
      PHOTO_MAX_SIDE,
    );
    expect(photoLimits(undefined).maxSide).toBe(PHOTO_MAX_SIDE);
    const photo = { bytes: await bigCard(), type: "image/jpeg", name: "c.jpg" };
    const claude = await sharp(
      (await preparePhoto(photo, photoLimits(CLAUDE))).bytes,
    ).metadata();
    expect([claude.width, claude.height]).toEqual([1568, 1045]);
    const ollama = await sharp((await preparePhoto(photo)).bytes).metadata();
    expect(Math.max(ollama.width!, ollama.height!)).toBeLessThanOrEqual(1024);
    /* A transcript kept for one size is not reused for the other. */
    expect(transcribeKey(photoLimits(CLAUDE))).not.toBe(transcribeKey());
  });

  it("transcribes with no unload and says no swap", async () => {
    vi.stubEnv("RECIPE_LLM_API", "anthropic");
    vi.stubEnv("RECIPE_LLM_API_KEY", KEY);
    const calls = stubApi([
      json(message([{ type: "text", text: "Oat Cookies\n1 cup oats" }])),
    ]);
    const bytes = await bigCard();
    const { job, result } = await runJob(
      { kind: "test", label: "photo", spec: {} },
      (context) =>
        transcribePhotos({
          photos: [{ bytes, type: "image/jpeg", name: "c.jpg" }],
          next: "claude-sonnet-5",
          job: context,
        }),
      { dir: jobsDir, mirror: null },
    );
    expect(result.text).toBe("Oat Cookies\n1 cup oats");
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.anthropic.com/v1/messages",
    ]);
    const sent = (
      calls[0].body?.messages as {
        content: { source?: { data: string } }[];
      }[]
    )[0].content[0].source!.data;
    const meta = await sharp(Buffer.from(sent, "base64")).metadata();
    expect(meta.width).toBe(1568);
    const { lines } = await readJobLog(jobsDir, job);
    expect(lines.some((line) => line.step === "vision.transcribe")).toBe(true);
    expect(lines.some((line) => line.step === "llm.unload")).toBe(false);
    expect(
      lines.find((line) => line.step === "vision" && line.phase === "note")
        ?.msg,
    ).toBe(
      "claude-sonnet-5 read 22 characters — claude-sonnet-5 reads the transcription",
    );
  });
});
