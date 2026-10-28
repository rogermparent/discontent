// @vitest-environment node
//
// 44a: tool calling in the model layer (`chatTools`) for each wire format —
// the Claude API, Ollama and an OpenAI-compatible server. `fetch` is
// stubbed throughout: never a real model here or in CI, and KEY is a
// made-up string. Pinned per format: a plain answer, one tool call's round
// trip, a malformed call, the 529 retry (Claude and OpenAI-style; Ollama
// never retries), and for Claude the server tools — web search's blocks,
// `pause_turn` continued, a deferred server call, the blocks replayed
// unchanged — and the usage with its cost estimate.

import { afterEach, describe, expect, it, vi } from "vitest";

const queueCalls = vi.hoisted(() => [] as string[]);

vi.mock(
  "../websites/recipe-website/editor/controller/jobs/queue",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../websites/recipe-website/editor/controller/jobs/queue")
      >();
    return {
      ...original,
      withResource: ((resource, options, fn) => {
        queueCalls.push(String(resource));
        return original.withResource(resource, options, fn);
      }) as typeof original.withResource,
    };
  },
);

import type {
  AgentMessage,
  ToolSpec,
} from "../websites/recipe-website/editor/controller/agent/types";
import {
  ANTHROPIC_DEFAULT_URL,
  ANTHROPIC_MAX_TOKENS,
  LLM_NUM_CTX,
  LlmError,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK,
  WEB_SEARCH_PRICE_ESTIMATE_USD,
  claudeCostEstimate,
  modelPriceKey,
} from "../websites/recipe-website/editor/controller/llm/cost";
import {
  ANTHROPIC_CACHE_CONTROL,
  ANTHROPIC_WEB_FETCH_TOOL_TYPE,
  ANTHROPIC_WEB_FETCH_TOOL_TYPE_NEWER,
  ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
  ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER,
  CLAUDE_PAUSE_CONTINUATIONS,
  addUsage,
  chatTools,
  emptyUsage,
  readArguments,
  trimmedStub,
} from "../websites/recipe-website/editor/controller/llm/tools";

/** Not a real key: a made-up string shaped like one. */
const KEY = "sk-ant-test-0000-not-a-real-key-44a";

const CLAUDE: LlmConfig = {
  url: ANTHROPIC_DEFAULT_URL,
  model: "claude-sonnet-5",
  api: "anthropic",
  apiKey: KEY,
};
const OLLAMA: LlmConfig = {
  url: "http://localhost:11434",
  model: "qwen3:8b",
  api: "ollama",
};
const OPENAI: LlmConfig = {
  url: "http://localhost:8080/v1",
  model: "local-model",
  api: "openai",
  apiKey: "not-a-real-bearer",
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

/** `fetch` answering each call with the next of `answers` (the last repeats). */
function stubApi(answers: (() => Response)[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
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

const SEARCH: ToolSpec = {
  name: "recipe_search",
  description: "Search the recipes.",
  inputSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
};

const ASK: AgentMessage[] = [{ role: "user", text: "find me a chili" }];

/** A message as the Messages API answers it. */
function claudeMessage(
  content: unknown[],
  stop = "end_turn",
  usage: Record<string, unknown> = { input_tokens: 1000, output_tokens: 100 },
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

afterEach(() => {
  vi.unstubAllGlobals();
  queueCalls.length = 0;
});

describe("chatTools — the Claude API", () => {
  it("sends the tools, the cached system prompt and the server tools; reads a plain answer", async () => {
    const calls = stubApi([
      json(
        claudeMessage(
          [{ type: "text", text: "Here is a chili." }],
          "end_turn",
          {
            input_tokens: 1000,
            output_tokens: 200,
            cache_read_input_tokens: 4000,
            cache_creation_input_tokens: 500,
          },
        ),
      ),
    ]);
    const result = await chatTools({
      system: "You are the curator.",
      messages: ASK,
      tools: [SEARCH],
      serverTools: [
        {
          kind: "web_search",
          maxUses: 5,
          allowedDomains: ["sallysbakingaddiction.com"],
        },
        { kind: "web_fetch" },
      ],
      config: CLAUDE,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ANTHROPIC_DEFAULT_URL}/v1/messages`);
    expect(calls[0].headers["x-api-key"]).toBe(KEY);
    expect(calls[0].headers["anthropic-version"]).toBe("2023-06-01");
    /* The server tools are GA: no beta header. */
    expect(Object.keys(calls[0].headers)).not.toContain("anthropic-beta");
    const body = calls[0].body!;
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.max_tokens).toBe(ANTHROPIC_MAX_TOKENS);
    expect(body).not.toHaveProperty("temperature");
    expect(body.system).toEqual([
      {
        type: "text",
        text: "You are the curator.",
        cache_control: ANTHROPIC_CACHE_CONTROL,
      },
    ]);
    expect(body.tools).toEqual([
      {
        name: "recipe_search",
        description: "Search the recipes.",
        input_schema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
        name: "web_search",
        max_uses: 5,
        allowed_domains: ["sallysbakingaddiction.com"],
      },
      { type: ANTHROPIC_WEB_FETCH_TOOL_TYPE, name: "web_fetch" },
    ]);
    expect(ANTHROPIC_WEB_SEARCH_TOOL_TYPE).toBe("web_search_20250305");
    expect(ANTHROPIC_WEB_FETCH_TOOL_TYPE).toBe("web_fetch_20250910");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "find me a chili",
            cache_control: ANTHROPIC_CACHE_CONTROL,
          },
        ],
      },
    ]);
    expect(result.stop).toBe("end");
    expect(result.apiStop).toBe("end_turn");
    expect(result.message.text).toBe("Here is a chili.");
    expect(result.message.toolCalls).toEqual([]);
    expect(result.usage).toMatchObject({
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 4000,
      cacheWriteTokens: 500,
    });
    /* Sonnet 5: $2 in, $10 out, $2.50 cache write, $0.20 cache read per MTok. */
    expect(result.usage.costEstimateUsd).toBeCloseTo(
      (1000 * 2 + 200 * 10 + 500 * 2.5 + 4000 * 0.2) / 1e6,
      9,
    );
    /* 38-Dg3: a hosted API takes no `gpu` slot. */
    expect(queueCalls).toEqual([]);
  });

  it("drops a client tool the server tool replaces", async () => {
    const calls = stubApi([
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    await chatTools({
      system: "s",
      messages: ASK,
      tools: [
        SEARCH,
        {
          name: "web_search",
          description: "SearXNG",
          inputSchema: { type: "object" },
        },
      ],
      serverTools: [{ kind: "web_search" }],
      config: CLAUDE,
    });
    const names = (calls[0].body!.tools as { name: string }[]).map(
      (tool) => tool.name,
    );
    expect(names).toEqual(["recipe_search", "web_search"]);
    expect((calls[0].body!.tools as { type?: string }[])[1].type).toBe(
      ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
    );
  });

  it("round-trips a tool call: tool_use out, the raw blocks and a tool_result back", async () => {
    const thinking = {
      type: "thinking",
      thinking: "look it up",
      signature: "sig-opaque",
    };
    const toolUse = {
      type: "tool_use",
      id: "toolu_01A",
      name: "recipe_search",
      input: { query: "chili" },
    };
    const calls = stubApi([
      json(
        claudeMessage(
          [thinking, { type: "text", text: "Searching." }, toolUse],
          "tool_use",
        ),
      ),
      json(claudeMessage([{ type: "text", text: "Found Texas chili." }])),
    ]);
    const first = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: CLAUDE,
    });
    expect(first.stop).toBe("tool_use");
    expect(first.message.text).toBe("Searching.");
    expect(first.message.toolCalls).toEqual([
      { id: "toolu_01A", name: "recipe_search", input: { query: "chili" } },
    ]);
    expect(first.message.raw).toEqual({
      api: "anthropic",
      content: [thinking, { type: "text", text: "Searching." }, toolUse],
    });

    const second = await chatTools({
      system: "s",
      messages: [
        ...ASK,
        first.message,
        {
          role: "tool",
          toolCallId: "toolu_01A",
          name: "recipe_search",
          content: '{"recipes":[{"slug":"texas-chili"}]}',
        },
        {
          role: "tool",
          toolCallId: "toolu_01B",
          name: "recipe_get",
          content: '{"error":"not found"}',
          isError: true,
        },
      ],
      tools: [SEARCH],
      config: CLAUDE,
    });
    const sent = calls[1].body!.messages as {
      role: string;
      content: unknown[];
    }[];
    expect(sent).toHaveLength(3);
    /* The thinking block and its signature go back unchanged (Ea4). */
    expect(sent[1]).toEqual({
      role: "assistant",
      content: [thinking, { type: "text", text: "Searching." }, toolUse],
    });
    /* Both results in one user message; the newest block holds the cache breakpoint. */
    expect(sent[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_01A",
          content: '{"recipes":[{"slug":"texas-chili"}]}',
        },
        {
          type: "tool_result",
          tool_use_id: "toolu_01B",
          content: '{"error":"not found"}',
          is_error: true,
          cache_control: ANTHROPIC_CACHE_CONTROL,
        },
      ],
    });
    /* The transcript's raw blocks were not touched by the breakpoint. */
    expect(first.message.raw!.content).not.toContainEqual(
      expect.objectContaining({ cache_control: expect.anything() }),
    );
    expect(second.message.text).toBe("Found Texas chili.");
  });

  it("sends a trimmed result as its stub, and a non-Claude assistant turn as tool_use blocks", async () => {
    const calls = stubApi([
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    const trimmed = {
      role: "tool" as const,
      toolCallId: "call_abc_0",
      name: "web_fetch",
      content: "x".repeat(5000),
      trimmed: true,
    };
    await chatTools({
      system: "s",
      messages: [
        ...ASK,
        {
          role: "assistant",
          text: "",
          toolCalls: [
            {
              id: "call_abc_0",
              name: "web_fetch",
              input: { url: "https://example.com/" },
            },
          ],
        },
        trimmed,
        { role: "user", text: "and one more" },
      ],
      tools: [SEARCH],
      config: CLAUDE,
    });
    const sent = calls[0].body!.messages as {
      role: string;
      content: Record<string, unknown>[];
    }[];
    expect(sent[1]).toEqual({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "call_abc_0",
          name: "web_fetch",
          input: { url: "https://example.com/" },
        },
      ],
    });
    expect(sent[2].content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "call_abc_0",
      content: trimmedStub(trimmed),
    });
    expect(trimmedStub(trimmed)).toContain("5000 characters");
  });

  it("reads a server-tool turn: web search's call, its results and the billed search", async () => {
    const searchUse = {
      type: "server_tool_use",
      id: "srvtoolu_01",
      name: "web_search",
      input: { query: "sally's chili" },
    };
    const searchResult = {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_01",
      content: [
        {
          type: "web_search_result",
          url: "https://sallysbakingaddiction.com/chili/",
          title: "Chili",
          encrypted_content: "EqgfCioIARgBIiQ3YTAw-opaque",
          page_age: "April 30, 2025",
        },
      ],
    };
    const cited = {
      type: "text",
      text: "Sally has a chili.",
      citations: [
        {
          type: "web_search_result_location",
          url: "https://sallysbakingaddiction.com/chili/",
          title: "Chili",
          encrypted_index: "Eo8BCioI-opaque",
          cited_text: "A hearty chili",
        },
      ],
    };
    const calls = stubApi([
      json(
        claudeMessage([searchUse, searchResult, cited], "end_turn", {
          input_tokens: 6000,
          output_tokens: 300,
          server_tool_use: { web_search_requests: 1 },
        }),
      ),
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      serverTools: [{ kind: "web_search" }],
      config: CLAUDE,
    });
    expect(result.message.text).toBe("Sally has a chili.");
    expect(result.message.toolCalls).toEqual([]);
    expect(result.message.serverToolUses).toEqual([
      {
        id: "srvtoolu_01",
        name: "web_search",
        input: { query: "sally's chili" },
        result: {
          ok: true,
          pages: [
            { url: "https://sallysbakingaddiction.com/chili/", title: "Chili" },
          ],
        },
      },
    ]);
    expect(result.usage.webSearchRequests).toBe(1);
    expect(result.usage.costEstimateUsd).toBeCloseTo(
      (6000 * 2 + 300 * 10) / 1e6 + WEB_SEARCH_PRICE_ESTIMATE_USD,
      9,
    );
    /* A later turn sends the blocks back exactly, encrypted content and all. */
    await chatTools({
      system: "s",
      messages: [...ASK, result.message, { role: "user", text: "import it" }],
      tools: [],
      serverTools: [{ kind: "web_search" }],
      config: CLAUDE,
    });
    const sent = calls[1].body!.messages as {
      role: string;
      content: unknown[];
    }[];
    expect(sent[1]).toEqual({
      role: "assistant",
      content: [searchUse, searchResult, cited],
    });
  });

  it("reads a server tool's error result", async () => {
    stubApi([
      json(
        claudeMessage([
          {
            type: "server_tool_use",
            id: "srvtoolu_02",
            name: "web_fetch",
            input: { url: "https://x.example/" },
          },
          {
            type: "web_fetch_tool_result",
            tool_use_id: "srvtoolu_02",
            content: {
              type: "web_fetch_tool_result_error",
              error_code: "url_not_in_prior_context",
            },
          },
          { type: "text", text: "I could not fetch it." },
        ]),
      ),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      serverTools: [{ kind: "web_fetch" }],
      config: CLAUDE,
    });
    expect(result.message.serverToolUses).toEqual([
      {
        id: "srvtoolu_02",
        name: "web_fetch",
        input: { url: "https://x.example/" },
        result: { ok: false, errorCode: "url_not_in_prior_context" },
      },
    ]);
  });

  it("continues a pause_turn with the paused content, and sums the usage", async () => {
    const searchUse = {
      type: "server_tool_use",
      id: "srvtoolu_03",
      name: "web_search",
      input: { query: "chili" },
    };
    const searchResult = {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_03",
      content: [
        {
          type: "web_search_result",
          url: "https://example.com/chili",
          title: "C",
          encrypted_content: "e",
        },
      ],
    };
    const calls = stubApi([
      json(
        claudeMessage(
          [{ type: "text", text: "Let me search. " }, searchUse],
          "pause_turn",
          { input_tokens: 100, output_tokens: 10 },
        ),
      ),
      json(
        claudeMessage(
          [searchResult, { type: "text", text: "Found one." }],
          "end_turn",
          {
            input_tokens: 300,
            output_tokens: 20,
            server_tool_use: { web_search_requests: 1 },
          },
        ),
      ),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      serverTools: [{ kind: "web_search" }],
      config: CLAUDE,
    });
    expect(calls).toHaveLength(2);
    const continued = calls[1].body!.messages as {
      role: string;
      content: unknown[];
    }[];
    expect(continued).toHaveLength(2);
    expect(continued[1]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Let me search. " }, searchUse],
    });
    /* The same tools on the continuation, as the API requires. */
    expect(calls[1].body!.tools).toEqual(calls[0].body!.tools);
    expect(result.stop).toBe("end");
    expect(result.message.text).toBe("Let me search. Found one.");
    expect(result.message.raw!.content).toHaveLength(4);
    expect(result.message.serverToolUses?.[0].result?.ok).toBe(true);
    expect(result.usage).toMatchObject({
      inputTokens: 400,
      outputTokens: 30,
      webSearchRequests: 1,
    });
  });

  it("gives up on a pause after CLAUDE_PAUSE_CONTINUATIONS continuations", async () => {
    const calls = stubApi([
      json(claudeMessage([{ type: "text", text: "." }], "pause_turn")),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: CLAUDE,
    });
    expect(calls).toHaveLength(CLAUDE_PAUSE_CONTINUATIONS + 1);
    expect(result.stop).toBe("pause");
  });

  it("leaves out a server call a stop abandoned, so a follow-up's words do not 400 (Ea13)", async () => {
    const calls = stubApi([
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    const serverUse = {
      type: "server_tool_use",
      id: "srvtoolu_09",
      name: "web_fetch",
      input: { url: "https://example.com/a" },
    };
    const toolUse = {
      type: "tool_use",
      id: "toolu_09",
      name: "recipe_search",
      input: { query: "a" },
    };
    const abandoned: AgentMessage = {
      role: "assistant",
      text: "",
      toolCalls: [
        { id: "toolu_09", name: "recipe_search", input: { query: "a" } },
      ],
      serverToolUses: [{ id: "srvtoolu_09", name: "web_fetch", input: {} }],
      raw: { api: "anthropic", content: [serverUse, toolUse] },
    };
    await chatTools({
      system: "s",
      messages: [
        ...ASK,
        abandoned,
        /* The budget's "not run" answer, then the person's follow-up. */
        {
          role: "tool",
          toolCallId: "toolu_09",
          name: "recipe_search",
          content: '{"error":"not run: the turn budget ended"}',
          isError: true,
        },
        { role: "user", text: "try again" },
      ],
      tools: [SEARCH],
      serverTools: [{ kind: "web_fetch" }],
      config: CLAUDE,
    });
    const sent = calls[0].body!.messages as {
      role: string;
      content: Record<string, unknown>[];
    }[];
    expect(sent[1]).toEqual({ role: "assistant", content: [toolUse] });
    expect(sent[2].content.map((block) => block.type)).toEqual([
      "tool_result",
      "text",
    ]);
    /* The transcript still has it. */
    expect(
      (abandoned as { raw: { content: unknown[] } }).raw.content,
    ).toHaveLength(2);
  });

  it("pairs a deferred server call's result that arrives in the next response", async () => {
    const deferredCalls = stubApi([
      json(
        claudeMessage(
          [
            {
              type: "server_tool_use",
              id: "srvtoolu_04",
              name: "web_fetch",
              input: { url: "https://example.com/a" },
            },
            {
              type: "tool_use",
              id: "toolu_04",
              name: "recipe_search",
              input: { query: "a" },
            },
          ],
          "tool_use",
        ),
      ),
      json(
        claudeMessage([
          {
            type: "web_fetch_tool_result",
            tool_use_id: "srvtoolu_04",
            content: {
              type: "web_fetch_result",
              url: "https://example.com/a",
              content: { type: "document", title: "A" },
            },
          },
          { type: "text", text: "done" },
        ]),
      ),
    ]);
    const first = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      serverTools: [{ kind: "web_fetch" }],
      config: CLAUDE,
    });
    expect(first.stop).toBe("tool_use");
    expect(first.message.serverToolUses).toEqual([
      {
        id: "srvtoolu_04",
        name: "web_fetch",
        input: { url: "https://example.com/a" },
      },
    ]);
    const second = await chatTools({
      system: "s",
      messages: [
        ...ASK,
        first.message,
        {
          role: "tool",
          toolCallId: "toolu_04",
          name: "recipe_search",
          content: "[]",
        },
      ],
      tools: [SEARCH],
      serverTools: [{ kind: "web_fetch" }],
      config: CLAUDE,
    });
    /* A deferred call whose turn goes on (results only) is kept, so the API runs it. */
    const resumed = deferredCalls[1].body!.messages as {
      role: string;
      content: Record<string, unknown>[];
    }[];
    expect(resumed[1].content.map((block) => block.type)).toEqual([
      "server_tool_use",
      "tool_use",
    ]);
    expect(resumed[2].content.map((block) => block.type)).toEqual([
      "tool_result",
    ]);
    expect(second.message.serverToolUses).toEqual([
      {
        id: "srvtoolu_04",
        name: "web_fetch",
        input: undefined,
        result: {
          ok: true,
          pages: [{ url: "https://example.com/a", title: "A" }],
        },
      },
    ]);
  });

  it("marks a tool_use whose input is not an object malformed", async () => {
    stubApi([
      json(
        claudeMessage(
          [
            {
              type: "tool_use",
              id: "toolu_05",
              name: "recipe_search",
              input: "chili",
            },
          ],
          "tool_use",
        ),
      ),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: CLAUDE,
    });
    expect(result.message.toolCalls[0]).toMatchObject({
      id: "toolu_05",
      input: {},
      malformed: "the arguments are not valid JSON",
    });
  });

  it("asks once more after a 529, and reports max_tokens as a stop", async () => {
    const calls = stubApi([
      json(
        {
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        },
        529,
        { "retry-after": "0" },
      ),
      json(claudeMessage([{ type: "text", text: "half" }], "max_tokens")),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: CLAUDE,
    });
    expect(calls).toHaveLength(2);
    expect(result.stop).toBe("max_tokens");
  });

  it("refuses to send the key over plain http", async () => {
    stubApi([json(claudeMessage([]))]);
    await expect(
      chatTools({
        system: "s",
        messages: ASK,
        tools: [],
        config: { ...CLAUDE, url: "http://10.0.0.2:11434" },
      }),
    ).rejects.toMatchObject({ kind: "unconfigured" });
  });

  it("sends effort only to a model that takes it", async () => {
    const calls = stubApi([
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: CLAUDE,
      effort: "medium",
    });
    await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: { ...CLAUDE, model: "claude-haiku-4-5" },
      effort: "medium",
    });
    expect(calls[0].body!.output_config).toEqual({ effort: "medium" });
    expect(calls[1].body).not.toHaveProperty("output_config");
  });
});

describe("chatTools — Claude's newer web tools (46d)", () => {
  it("sends the basic server tools by default and the newer ones when asked, with no beta header", async () => {
    const calls = stubApi([
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    for (const newerWebTools of [undefined, false, true]) {
      await chatTools({
        system: "s",
        messages: ASK,
        tools: [SEARCH],
        serverTools: [{ kind: "web_search", maxUses: 5 }],
        config: CLAUDE,
        ...(newerWebTools !== undefined ? { newerWebTools } : {}),
      });
    }
    const serverTool = (index: number) =>
      (calls[index].body!.tools as Record<string, unknown>[]).find(
        (tool) => tool.name === "web_search",
      );
    expect(serverTool(0)).toEqual({
      type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
      name: "web_search",
      max_uses: 5,
    });
    expect(serverTool(1)).toEqual(serverTool(0));
    expect(serverTool(2)).toEqual({
      type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER,
      name: "web_search",
      max_uses: 5,
    });
    expect(ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER).toBe("web_search_20260209");
    expect(ANTHROPIC_WEB_FETCH_TOOL_TYPE_NEWER).toBe("web_fetch_20260209");
    /* Our own tools are the same either way; no `code_execution` declared. */
    expect(
      (calls[2].body!.tools as Record<string, unknown>[]).map((t) => t.name),
    ).toEqual(["recipe_search", "web_search"]);
    for (const call of calls) {
      expect(call.headers["anthropic-beta"]).toBeUndefined();
      expect(call.body!.container).toBeUndefined();
    }
  });

  it("ignores the setting with no server tools, and for a local model", async () => {
    const calls = stubApi([
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: CLAUDE,
      newerWebTools: true,
    });
    expect(
      (calls[0].body!.tools as Record<string, unknown>[]).map((t) => t.type),
    ).toEqual([undefined]);

    const local = stubApi([
      json({
        model: "qwen3:8b",
        message: { role: "assistant", content: "ok" },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 2,
      }),
    ]);
    await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      serverTools: [{ kind: "web_search" }],
      config: OLLAMA,
      newerWebTools: true,
    });
    expect(JSON.stringify(local[0].body)).not.toContain("web_search_2026");
  });

  it("hides dynamic filtering's code runs, keeps them raw, and carries the container", async () => {
    const codeUse = {
      type: "server_tool_use",
      id: "srvtoolu_code",
      name: "code_execution",
      input: { code: "filter(results)" },
    };
    const searchUse = {
      type: "server_tool_use",
      id: "srvtoolu_search",
      name: "web_search",
      input: { query: "chewy cookies" },
      caller: { type: "code_execution_20260120", tool_id: "srvtoolu_code" },
    };
    const searchResult = {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_search",
      content: [
        {
          type: "web_search_result",
          url: "https://sallysbakingaddiction.com/chewy-cookies/",
          title: "Chewy Cookies",
          encrypted_content: "opaque",
        },
      ],
    };
    const codeResult = {
      type: "code_execution_tool_result",
      tool_use_id: "srvtoolu_code",
      content: {
        type: "code_execution_result",
        stdout: "1 hit",
        return_code: 0,
      },
    };
    const calls = stubApi([
      () =>
        new Response(
          JSON.stringify({
            ...claudeMessage(
              [{ type: "text", text: "Searching. " }, codeUse, searchUse],
              "pause_turn",
            ),
            container: {
              id: "container_011",
              expires_at: "2026-10-28T23:00:00Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      json({
        ...claudeMessage([
          searchResult,
          codeResult,
          { type: "text", text: "One." },
        ]),
        container: { id: "container_011" },
      }),
      json(claudeMessage([{ type: "text", text: "ok" }])),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      serverTools: [{ kind: "web_search" }],
      config: CLAUDE,
      newerWebTools: true,
    });
    /* The continuation is sent in the container the first response named. */
    expect(calls[0].body!.container).toBeUndefined();
    expect(calls[1].body!.container).toBe("container_011");
    expect(result.message.serverToolUses).toEqual([
      {
        id: "srvtoolu_search",
        name: "web_search",
        input: { query: "chewy cookies" },
        result: {
          ok: true,
          pages: [
            {
              url: "https://sallysbakingaddiction.com/chewy-cookies/",
              title: "Chewy Cookies",
            },
          ],
        },
      },
    ]);
    expect(result.message.raw).toMatchObject({
      api: "anthropic",
      container: "container_011",
    });
    expect(result.message.raw!.content).toHaveLength(6);
    /* The next turn replays every block and names the container. */
    await chatTools({
      system: "s",
      messages: [...ASK, result.message, { role: "user", text: "more" }],
      tools: [],
      serverTools: [{ kind: "web_search" }],
      config: CLAUDE,
      newerWebTools: true,
    });
    expect(calls[2].body!.container).toBe("container_011");
    expect(
      (calls[2].body!.messages as { content: unknown[] }[])[1].content,
    ).toEqual([
      { type: "text", text: "Searching. " },
      codeUse,
      searchUse,
      searchResult,
      codeResult,
      { type: "text", text: "One." },
    ]);
  });
});

describe("chatTools — Ollama", () => {
  it("sends tools as functions with num_ctx and think off; reads a plain answer and its usage", async () => {
    const calls = stubApi([
      json({
        model: "qwen3:8b",
        message: { role: "assistant", content: "<think>hm</think>A chili." },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 900,
        eval_count: 40,
        load_duration: 2_000_000,
      }),
    ]);
    const result = await chatTools({
      system: "sys",
      messages: ASK,
      tools: [SEARCH],
      config: OLLAMA,
      numCtx: 8192,
    });
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    const body = calls[0].body!;
    expect(body).toMatchObject({
      model: "qwen3:8b",
      stream: false,
      think: false,
      options: { num_ctx: 8192, temperature: 0 },
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "find me a chili" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "recipe_search",
            description: "Search the recipes.",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
              additionalProperties: false,
            },
          },
        },
      ],
    });
    expect(result.message.text).toBe("A chili.");
    expect(result.stop).toBe("end");
    expect(result.usage).toMatchObject({ inputTokens: 900, outputTokens: 40 });
    expect(result.usage.costEstimateUsd).toBeUndefined();
    expect(result.loadMs).toBe(2);
    /* The `gpu` line, per call (37b). */
    expect(queueCalls).toEqual(["gpu"]);
  });

  it("defaults num_ctx to LLM_NUM_CTX and passes think when asked", async () => {
    const calls = stubApi([
      json({ message: { role: "assistant", content: "ok" }, done: true }),
    ]);
    await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: OLLAMA,
      think: true,
    });
    expect(calls[0].body!.options).toEqual({
      num_ctx: LLM_NUM_CTX,
      temperature: 0,
    });
    expect(calls[0].body!.think).toBe(true);
    expect(calls[0].body).not.toHaveProperty("tools");
  });

  it("round-trips a tool call: object arguments in, tool_name results back", async () => {
    const calls = stubApi([
      json({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              function: {
                index: 0,
                name: "recipe_search",
                arguments: { query: "chili" },
              },
            },
          ],
        },
        done: true,
        done_reason: "stop",
      }),
      json({
        message: { role: "assistant", content: "Texas chili." },
        done: true,
      }),
    ]);
    const first = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: OLLAMA,
    });
    expect(first.stop).toBe("tool_use");
    expect(first.message.toolCalls).toHaveLength(1);
    const call = first.message.toolCalls[0];
    expect(call.id).toMatch(/^call_[0-9a-f]{12}_0$/);
    expect(call).toMatchObject({
      name: "recipe_search",
      input: { query: "chili" },
    });
    expect(first.message.raw).toBeUndefined();

    await chatTools({
      system: "s",
      messages: [
        ...ASK,
        first.message,
        {
          role: "tool",
          toolCallId: call.id,
          name: "recipe_search",
          content: "[]",
        },
      ],
      tools: [SEARCH],
      config: OLLAMA,
    });
    expect((calls[1].body!.messages as unknown[]).slice(2)).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            type: "function",
            function: {
              index: 0,
              name: "recipe_search",
              arguments: { query: "chili" },
            },
          },
        ],
      },
      { role: "tool", tool_name: "recipe_search", content: "[]" },
    ]);
  });

  it("marks string arguments that are not JSON malformed", async () => {
    stubApi([
      json({
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              function: {
                name: "recipe_search",
                arguments: '{"query": "chili"',
              },
            },
            {
              function: {
                name: "recipe_search",
                arguments: '{"query": "stew"}',
              },
            },
          ],
        },
        done: true,
      }),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: OLLAMA,
    });
    expect(result.message.toolCalls[0]).toMatchObject({
      input: {},
      malformed: "the arguments are not valid JSON",
      rawArguments: '{"query": "chili"',
    });
    expect(result.message.toolCalls[1]).toMatchObject({
      input: { query: "stew" },
    });
    expect(result.message.toolCalls[1].malformed).toBeUndefined();
  });

  it("does not retry a 529: Ollama's 5xx is a failure, not a rate limit", async () => {
    const calls = stubApi([
      json({ error: "overloaded" }, 529, { "retry-after": "0" }),
    ]);
    const failed = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: OLLAMA,
    }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(LlmError);
    expect(failed).toMatchObject({ kind: "http", status: 529 });
    /* The call, then 38-Te5's unload of a runner that answered an error. */
    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:11434/api/chat",
      "http://localhost:11434/api/generate",
    ]);
  });

  it("reports done_reason length as max_tokens", async () => {
    stubApi([
      json({
        message: { role: "assistant", content: "cut" },
        done: true,
        done_reason: "length",
      }),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: OLLAMA,
    });
    expect(result.stop).toBe("max_tokens");
  });
});

describe("chatTools — OpenAI-compatible", () => {
  it("sends tools and the bearer key; reads a plain answer", async () => {
    const calls = stubApi([
      json({
        choices: [
          {
            message: { role: "assistant", content: "A chili." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 700, completion_tokens: 30 },
      }),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: OPENAI,
    });
    expect(calls[0].url).toBe("http://localhost:8080/v1/chat/completions");
    expect(calls[0].headers.authorization).toBe("Bearer not-a-real-bearer");
    expect(calls[0].body).toMatchObject({
      model: "local-model",
      temperature: 0,
      tools: [{ type: "function", function: { name: "recipe_search" } }],
    });
    expect(calls[0].body).not.toHaveProperty("options");
    expect(result.message.text).toBe("A chili.");
    expect(result.usage).toMatchObject({ inputTokens: 700, outputTokens: 30 });
    expect(queueCalls).toEqual(["gpu"]);
  });

  it("round-trips a tool call: string arguments in, tool_call_id results back", async () => {
    const calls = stubApi([
      json({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_9",
                  type: "function",
                  function: {
                    name: "recipe_search",
                    arguments: '{"query":"chili"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
      json({
        choices: [
          {
            message: { role: "assistant", content: "Texas chili." },
            finish_reason: "stop",
          },
        ],
      }),
    ]);
    const first = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: OPENAI,
    });
    expect(first.stop).toBe("tool_use");
    expect(first.message.toolCalls).toEqual([
      { id: "call_9", name: "recipe_search", input: { query: "chili" } },
    ]);
    await chatTools({
      system: "s",
      messages: [
        ...ASK,
        first.message,
        {
          role: "tool",
          toolCallId: "call_9",
          name: "recipe_search",
          content: "[]",
        },
      ],
      tools: [SEARCH],
      config: OPENAI,
    });
    expect((calls[1].body!.messages as unknown[]).slice(2)).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_9",
            type: "function",
            function: { name: "recipe_search", arguments: '{"query":"chili"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_9", content: "[]" },
    ]);
  });

  it("marks arguments that are not JSON malformed and sends them back as they came", async () => {
    const calls = stubApi([
      json({
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_x",
                  type: "function",
                  function: { name: "recipe_search", arguments: "query=chili" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
      json({
        choices: [
          {
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      }),
    ]);
    const first = await chatTools({
      system: "s",
      messages: ASK,
      tools: [SEARCH],
      config: OPENAI,
    });
    expect(first.message.toolCalls[0]).toMatchObject({
      id: "call_x",
      input: {},
      malformed: "the arguments are not valid JSON",
      rawArguments: "query=chili",
    });
    await chatTools({
      system: "s",
      messages: [
        ...ASK,
        first.message,
        {
          role: "tool",
          toolCallId: "call_x",
          name: "recipe_search",
          content: "{}",
          isError: true,
        },
      ],
      tools: [SEARCH],
      config: OPENAI,
    });
    const assistant = (
      calls[1].body!.messages as {
        tool_calls?: { function: { arguments: string } }[];
      }[]
    )[2];
    expect(assistant.tool_calls?.[0].function.arguments).toBe("query=chili");
  });

  it("asks once more after a 529", async () => {
    const calls = stubApi([
      json({ error: { message: "busy" } }, 529, { "retry-after": "0" }),
      json({
        choices: [
          {
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      }),
    ]);
    const result = await chatTools({
      system: "s",
      messages: ASK,
      tools: [],
      config: OPENAI,
    });
    expect(calls).toHaveLength(2);
    expect(result.message.text).toBe("ok");
  });

  it("fails a 401 at once", async () => {
    const calls = stubApi([json({ error: { message: "bad key" } }, 401)]);
    await expect(
      chatTools({ system: "s", messages: ASK, tools: [], config: OPENAI }),
    ).rejects.toMatchObject({
      kind: "http",
      status: 401,
    });
    expect(calls).toHaveLength(1);
  });
});

describe("arguments, usage and the cost estimate", () => {
  it("reads arguments in every shape", () => {
    expect(readArguments({ a: 1 })).toEqual({ input: { a: 1 } });
    expect(readArguments('{"a":1}')).toEqual({ input: { a: 1 } });
    expect(readArguments(undefined)).toEqual({ input: {} });
    expect(readArguments("")).toEqual({ input: {} });
    expect(readArguments("[1]")).toMatchObject({
      malformed: "the arguments are not a JSON object",
    });
    expect(readArguments(7)).toMatchObject({
      malformed: "the arguments are not an object",
    });
  });

  it("sums usage, keeping the cost when either side has one", () => {
    const a = { ...emptyUsage(), inputTokens: 10, costEstimateUsd: 0.5 };
    const b = { ...emptyUsage(), inputTokens: 5, outputTokens: 2 };
    expect(addUsage(a, b)).toEqual({
      ...emptyUsage(),
      inputTokens: 15,
      outputTokens: 2,
      costEstimateUsd: 0.5,
    });
    expect(addUsage(emptyUsage(), emptyUsage())).not.toHaveProperty(
      "costEstimateUsd",
    );
  });

  it("prices known models, dated ids by their family, and no estimate for an unknown one", () => {
    expect(modelPriceKey("claude-opus-4-5-20251101")).toBe("claude-opus-4-5");
    const usage = {
      ...emptyUsage(),
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    };
    expect(claudeCostEstimate("claude-opus-4-5-20251101", usage)).toBe(30);
    expect(claudeCostEstimate("claude-haiku-4-5", usage)).toBe(6);
    expect(claudeCostEstimate("claude-unknown-9", usage)).toBeUndefined();
    /* Every model the effort list knows is priced too, so a run on it shows a cost. */
    for (const model of [
      "claude-sonnet-5",
      "claude-opus-5-5",
      "claude-haiku-5-5",
      "claude-fable-5-1",
    ]) {
      expect(CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK[model]).toBeDefined();
    }
  });
});
