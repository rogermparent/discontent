/**
 * Tool calling in the model layer (epic 44, 44a): `chatTools`, one model
 * turn over a conversation with tools, beside `chatJson` / `chatText`.
 *
 * The conversation is neutral (`AgentMessage`: user text, assistant text
 * with `toolCalls[]`, tool results by id) and is mapped here to each wire
 * format:
 *
 * - **The Claude API** `/v1/messages` — `tools` with `input_schema`,
 *   `tool_use` / `tool_result` blocks, the server tools `web_search` and
 *   `web_fetch` (E6; the type strings below, no beta header), the system
 *   prompt cached, `pause_turn` continued, and every content block kept
 *   (`raw`) so thinking signatures and search results' `encrypted_content`
 *   go back unchanged (Ea4).
 * - **Ollama** `/api/chat` — `tools` as functions, `message.tool_calls`
 *   (arguments arrive as an object, no ids), `role: "tool"` results named
 *   by `tool_name`; `num_ctx` as the caller fits it, `think` off unless asked.
 * - **OpenAI-compatible** `/v1/chat/completions` — `tools` / `tool_calls`,
 *   arguments as a JSON string, `role: "tool"` results by `tool_call_id`.
 *
 * Arguments that cannot be read come back as a call marked `malformed`,
 * never a throw: the loop answers it with a tool error (`runAgent`).
 *
 * The transport is `client.ts`'s, shared rather than copied: the headers,
 * the 38g retry (`postClaude`), the local request and its failures
 * (`postLocal`, with the same one retry for an OpenAI-style server, Ea2),
 * the `gpu` line with D6's reload (`onGpuLine`), the step numbers and
 * placement check (`recordLocalCall`). A Claude call takes no `gpu` slot
 * (38-Dg3); a local one takes it per call, in its job's tier.
 */
import { randomBytes } from "node:crypto";
import type {
  AgentAssistantMessage,
  AgentMessage,
  AgentToolCall,
  AgentToolResultMessage,
  AgentUsage,
  ServerTool,
  ServerToolUse,
  ToolSpec,
} from "../agent/types";
import { jobContext, type JobRun } from "../jobs/context";
import type { StepHandle } from "../jobs/log";
import {
  ANTHROPIC_MAX_TOKENS,
  ANTHROPIC_TIMEOUT_MS,
  LLM_KEEP_ALIVE,
  LLM_NUM_CTX,
  LLM_TIMEOUT_MS,
  LlmError,
  assertSecureClaude,
  callStats,
  llmConfig,
  llmUnconfiguredMessage,
  modelLabel,
  onGpuLine,
  postClaude,
  postLocal,
  readResponse,
  recordLocalCall,
  takesEffort,
  type LlmApi,
  type LlmConfig,
} from "./client";
import { claudeCostEstimate } from "./cost";

/* ------------------------------------------------------------------ */
/* The Claude API's server tools (E6), as its docs named them           */
/* ------------------------------------------------------------------ */

/**
 * Claude's web search tool (platform.claude.com/docs/en/agents-and-tools/
 * tool-use/web-search-tool, read 2026-10-21). The basic version on
 * purpose (Ea3): `_20260209` and later default `allowed_callers` to code
 * execution (dynamic filtering), whose container blocks this client does not
 * handle, and are not ZDR-eligible; the basic one is called directly, on
 * every model that has the tool. No beta header.
 */
export const ANTHROPIC_WEB_SEARCH_TOOL_TYPE = "web_search_20250305";

/** Claude's web fetch tool, the basic version for the same reasons (Ea3). No beta header. */
export const ANTHROPIC_WEB_FETCH_TOOL_TYPE = "web_fetch_20250910";

/**
 * The newer versions (46d: Roger's "basic by default, allow toggle per-run"
 * on Ea3): dynamic filtering — Claude writes and runs code that filters the
 * results before they reach its context, which cuts tokens on a
 * search-heavy run. GA, no beta header, and no `code_execution` tool to
 * declare beside them (the API runs it under the hood). The response then
 * carries code-execution blocks, kept raw and replayed as every block is
 * (Ea4), and a `container`, sent back on the run's later requests
 * (`claudeToolsBody`). Not ZDR-eligible (Ea3). Chosen per run
 * (`newerWebTools`).
 */
export const ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER = "web_search_20260209";
export const ANTHROPIC_WEB_FETCH_TOOL_TYPE_NEWER = "web_fetch_20260209";

/** The server tools' `name`s: fixed by the API. */
export const SERVER_TOOL_NAMES: Readonly<Record<ServerTool["kind"], string>> = {
  web_search: "web_search",
  web_fetch: "web_fetch",
};

/**
 * How many times one turn is continued after `pause_turn` (the API paused
 * its server-side loop): the docs say to re-send the paused content as it
 * is, and to cap the continuations as any retry loop is.
 */
export const CLAUDE_PAUSE_CONTINUATIONS = 4;

/** Prompt caching's breakpoint: on the system prompt, and on the newest user block (Ea5). */
export const ANTHROPIC_CACHE_CONTROL = { type: "ephemeral" } as const;

/* ------------------------------------------------------------------ */
/* The request and the result                                           */
/* ------------------------------------------------------------------ */

export interface ChatToolsRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  /**
   * Claude's server tools (E6). Ignored by the other styles. A client tool
   * of the same name is not sent beside one: the server tool replaces it.
   */
  serverTools?: ServerTool[];
  /** Defaults to `llmConfig()`. */
  config?: LlmConfig;
  /** Ollama's `num_ctx`; `LLM_NUM_CTX` when unset. Keep it fixed over a run: a change reloads the model. */
  numCtx?: number;
  /** Ollama's `think` (44e measures it); off when unset, as `chatJson`'s. */
  think?: boolean;
  /** Claude's `output_config.effort`, sent only to a model that takes it; its default when unset. */
  effort?: string;
  /**
   * Claude's server tools in their newer versions (46d): dynamic filtering.
   * Ignored by the other styles, and when there are no server tools.
   */
  newerWebTools?: boolean;
  /**
   * What is left of the run's cost budget, in USD (46d). Claude only: once
   * this turn's own estimate reaches it, a `pause_turn` is not continued —
   * the turn ends there, its content so far kept, with `costStopped`.
   */
  costBudgetUsd?: number;
  timeoutMs?: number;
  /** The caller's abort; default the job's. */
  signal?: AbortSignal;
  /** The job (its tier for the `gpu` line, its signal). */
  job?: JobRun;
  /** The step this turn runs in: its token counts, rates and GPU share. */
  step?: StepHandle;
}

/**
 * Why a turn ended, across styles: `end` (an answer), `tool_use` (calls to
 * run), `max_tokens` (cut off), `refusal` (Claude declined), `pause` (still
 * paused after `CLAUDE_PAUSE_CONTINUATIONS`), `other`.
 */
export type ChatToolsStop =
  "end" | "tool_use" | "max_tokens" | "refusal" | "pause" | "other";

export interface ChatToolsResult {
  message: AgentAssistantMessage;
  stop: ChatToolsStop;
  /** The API's own word for it (`end_turn`, `tool_calls`, `length`…). */
  apiStop?: string;
  usage: AgentUsage;
  model: string;
  api: LlmApi;
  durationMs: number;
  /** Ollama only: the cold start. */
  loadMs?: number;
  /**
   * The turn was still paused when its estimate reached `costBudgetUsd`, so
   * it was not continued (46d): the run stops at its cost budget.
   */
  costStopped?: true;
}

/** No tokens yet. */
export function emptyUsage(): AgentUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    webSearchRequests: 0,
    webFetchRequests: 0,
  };
}

/** `a + b`; the cost is summed when either has one. */
export function addUsage(a: AgentUsage, b: AgentUsage): AgentUsage {
  const cost =
    a.costEstimateUsd === undefined && b.costEstimateUsd === undefined
      ? undefined
      : Math.round(
          ((a.costEstimateUsd ?? 0) + (b.costEstimateUsd ?? 0)) * 1_000_000,
        ) / 1_000_000;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    webSearchRequests: a.webSearchRequests + b.webSearchRequests,
    webFetchRequests: a.webFetchRequests + b.webFetchRequests,
    ...(cost !== undefined ? { costEstimateUsd: cost } : {}),
  };
}

/** Every input token of a usage: uncached, cache reads and cache writes. */
export function totalInputTokens(usage: AgentUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

/** What a trimmed tool result is replaced with (Ea6). */
export function trimmedStub(message: AgentToolResultMessage): string {
  return `[${message.name} result trimmed to save context (${message.content.length} characters); call the tool again if you still need it]`;
}

/** A tool result as the model is sent it: the stub when trimmed. */
export function toolResultText(message: AgentToolResultMessage): string {
  return message.trimmed ? trimmedStub(message) : message.content;
}

/** A thinking model's leading `<think>…</think>`, removed (as `chatText` does). */
function stripThink(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>/, "").trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A tool's schema as the wire takes it: no `$schema` (zod's `toJSONSchema` adds one). */
function wireSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _dropped, ...rest } = schema;
  void _dropped;
  return rest;
}

/** The ids the Claude API takes for `tool_use` (a transcript may move there). */
const TOOL_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** An id for a call that came without one (Ollama). */
function madeUpId(index: number): string {
  return `call_${randomBytes(6).toString("hex")}_${index}`;
}

/**
 * A call's arguments: an object as it is; a string parsed as JSON; anything
 * else, or a string that is not a JSON object, `malformed`.
 */
export function readArguments(
  raw: unknown,
): Pick<AgentToolCall, "input" | "malformed" | "rawArguments"> {
  if (raw === undefined || raw === null || raw === "") return { input: {} };
  if (isObject(raw)) return { input: raw };
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isObject(parsed)) return { input: parsed };
      return {
        input: {},
        malformed: "the arguments are not a JSON object",
        rawArguments: raw,
      };
    } catch {
      return {
        input: {},
        malformed: "the arguments are not valid JSON",
        rawArguments: raw,
      };
    }
  }
  return { input: {}, malformed: "the arguments are not an object" };
}

/* ------------------------------------------------------------------ */
/* chatTools                                                            */
/* ------------------------------------------------------------------ */

/**
 * One model turn with tools: the conversation so far in, the assistant's
 * message (text, tool calls, Claude's server-tool uses) and the turn's
 * usage out. Throws `LlmError` as `chatJson` does for a failed request (no
 * model, unreachable, timeout, an HTTP error after the 38g retry); a turn
 * cut off or refused is a `stop`, not a throw — the loop decides.
 */
export async function chatTools(
  request: ChatToolsRequest,
): Promise<ChatToolsResult> {
  const config = request.config ?? llmConfig();
  if (!config) throw new LlmError("unconfigured", llmUnconfiguredMessage());
  const job = jobContext(request.job);
  const signal = request.signal ?? job.signal;
  if (config.api === "anthropic") {
    assertSecureClaude(config);
    return claudeTurn(request, config, signal);
  }
  const numCtx = request.numCtx ?? LLM_NUM_CTX;
  return onGpuLine(config, { job, signal, step: request.step }, (surface) =>
    localTurn(request, config, signal, numCtx, surface),
  );
}

/* ------------------------------------------------------------------ */
/* The Claude API                                                       */
/* ------------------------------------------------------------------ */

interface WireMessage {
  role: "user" | "assistant";
  content: Record<string, unknown>[];
}

/**
 * The conversation as Messages API `messages`: consecutive messages of one
 * role merged (tool results are one user message of `tool_result` blocks),
 * an assistant turn from the Claude API replayed from `raw`, any other as
 * text and `tool_use` blocks.
 */
export function claudeMessages(messages: AgentMessage[]): WireMessage[] {
  const out: WireMessage[] = [];
  const push = (
    role: WireMessage["role"],
    blocks: Record<string, unknown>[],
  ) => {
    if (blocks.length === 0) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: [...blocks] });
  };
  for (const message of messages) {
    if (message.role === "user") {
      push("user", [{ type: "text", text: message.text }]);
    } else if (message.role === "tool") {
      push("user", [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: toolResultText(message),
          ...(message.isError ? { is_error: true } : {}),
        },
      ]);
    } else if (message.raw?.api === "anthropic" && message.raw.content.length) {
      push("assistant", message.raw.content as Record<string, unknown>[]);
    } else {
      push("assistant", [
        ...(message.text ? [{ type: "text", text: message.text }] : []),
        ...message.toolCalls.map((call) => ({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: isObject(call.input) ? call.input : {},
        })),
      ]);
    }
  }
  return withoutAbandonedServerCalls(out);
}

/**
 * Ea13: a mixed turn — a server tool deferred beside our calls — that a
 * stop ended is followed, on a later run, by our results **and** the
 * person's next words in one user message. The API reads text after the
 * results as the turn's end, and a `server_tool_use` with no result block
 * then fails the request (400). Such an abandoned server call — no result
 * block in this turn or any later one, and the next user message holding
 * more than `tool_result`s — is left out of what is sent (the transcript
 * keeps it). A deferred call whose turn goes on (results only) is kept, so
 * the API runs it.
 */
function withoutAbandonedServerCalls(messages: WireMessage[]): WireMessage[] {
  const resolved = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of message.content) {
      if (typeof block.tool_use_id === "string")
        resolved.add(block.tool_use_id);
    }
  }
  return messages.map((message, index) => {
    if (message.role !== "assistant") return message;
    const next = messages[index + 1];
    const closedByText =
      next?.role === "user" &&
      next.content.some((block) => block.type !== "tool_result");
    if (!closedByText) return message;
    const content = message.content.filter(
      (block) =>
        block.type !== "server_tool_use" ||
        resolved.has(String(block.id ?? "")),
    );
    if (content.length === message.content.length) return message;
    /* Never an empty assistant turn: the API refuses one. */
    return {
      ...message,
      content:
        content.length > 0
          ? content
          : [{ type: "text", text: "(the turn stopped here)" }],
    };
  });
}

/** A server tool's `type`: the basic version (Ea3), or the newer one (46d). */
export function serverToolType(
  kind: ServerTool["kind"],
  newer = false,
): string {
  if (kind === "web_search") {
    return newer
      ? ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER
      : ANTHROPIC_WEB_SEARCH_TOOL_TYPE;
  }
  return newer
    ? ANTHROPIC_WEB_FETCH_TOOL_TYPE_NEWER
    : ANTHROPIC_WEB_FETCH_TOOL_TYPE;
}

/** Claude's `tools`: ours with `input_schema`, then the server tools (E6). */
export function claudeTools(
  tools: ToolSpec[],
  serverTools: ServerTool[] = [],
  newerWebTools = false,
): Record<string, unknown>[] {
  const served = new Set(
    serverTools.map((tool) => SERVER_TOOL_NAMES[tool.kind]),
  );
  return [
    ...tools
      .filter((tool) => !served.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: wireSchema(tool.inputSchema),
      })),
    ...serverTools.map((tool) => ({
      type: serverToolType(tool.kind, newerWebTools),
      name: SERVER_TOOL_NAMES[tool.kind],
      ...(tool.maxUses !== undefined ? { max_uses: tool.maxUses } : {}),
      ...(tool.allowedDomains?.length
        ? { allowed_domains: tool.allowedDomains }
        : {}),
    })),
  ];
}

/** The newest user message's last block carries the cache breakpoint (Ea5); a copy, never `raw`. */
function withCacheBreakpoint(messages: WireMessage[]): WireMessage[] {
  const index = messages.map((message) => message.role).lastIndexOf("user");
  if (index < 0) return messages;
  return messages.map((message, at) => {
    if (at !== index) return message;
    const content = [...message.content];
    content[content.length - 1] = {
      ...content[content.length - 1],
      cache_control: ANTHROPIC_CACHE_CONTROL,
    };
    return { ...message, content };
  });
}

/** A container this close to its `expires_at` is taken as expired (46d). */
export const CONTAINER_EXPIRY_MARGIN_MS = 60_000;

/** Whether a container that expires at `expiresAt` (ISO) is still usable at `now`. */
export function containerLive(
  expiresAt: string | undefined,
  now = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const at = Date.parse(expiresAt);
  return !Number.isFinite(at) || at - now > CONTAINER_EXPIRY_MARGIN_MS;
}

/**
 * The code-execution container the conversation's newest Claude turn ran in
 * (46d: the newer web tools' dynamic filtering), if it said one and it has
 * not expired: a follow-up an hour later starts without one.
 */
export function lastContainer(
  messages: AgentMessage[],
  now = Date.now(),
): string | undefined {
  return lastContainerRef(messages, now)?.id;
}

function lastContainerRef(
  messages: AgentMessage[],
  now = Date.now(),
): ContainerRef | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    if (message.raw?.api === "anthropic" && message.raw.container) {
      const expiresAt = message.raw.containerExpiresAt;
      return containerLive(expiresAt, now)
        ? { id: message.raw.container, ...(expiresAt ? { expiresAt } : {}) }
        : undefined;
    }
  }
  return undefined;
}

/** The Messages API request for a turn (before any `pause_turn` continuation). */
export function claudeToolsBody(request: ChatToolsRequest, config: LlmConfig) {
  const newer = !!request.newerWebTools && !!request.serverTools?.length;
  const tools = claudeTools(request.tools, request.serverTools, newer);
  const container = newer ? lastContainer(request.messages) : undefined;
  return {
    model: config.model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: request.system,
        cache_control: ANTHROPIC_CACHE_CONTROL,
      },
    ],
    messages: withCacheBreakpoint(claudeMessages(request.messages)),
    ...(tools.length > 0 ? { tools } : {}),
    ...(request.effort && takesEffort(config.model)
      ? { output_config: { effort: request.effort } }
      : {}),
    ...(container ? { container } : {}),
  };
}

/** A code-execution container: its id and, when the API said, its expiry. */
interface ContainerRef {
  id: string;
  expiresAt?: string;
}

/**
 * A response's `container` (the newer web tools' code execution), if any:
 * its `id` and `expires_at`. A response naming the same container without
 * an expiry keeps the one `before` had.
 */
function containerOf(
  body: Record<string, unknown>,
  before: ContainerRef | undefined,
): ContainerRef | undefined {
  const container = body.container;
  let id: string | undefined;
  let expiresAt: string | undefined;
  if (typeof container === "string" && container) id = container;
  else if (
    isObject(container) &&
    typeof container.id === "string" &&
    container.id
  ) {
    id = container.id;
    if (typeof container.expires_at === "string" && container.expires_at) {
      expiresAt = container.expires_at;
    }
  }
  if (!id) return before;
  expiresAt ??= before?.id === id ? before.expiresAt : undefined;
  return { id, ...(expiresAt ? { expiresAt } : {}) };
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The Messages API's `usage`, as `AgentUsage` (the cost added by the caller). */
export function claudeUsage(usage: unknown): AgentUsage {
  const read = (isObject(usage) ? usage : {}) as Record<string, unknown>;
  const server = (
    isObject(read.server_tool_use) ? read.server_tool_use : {}
  ) as Record<string, unknown>;
  return {
    inputTokens: count(read.input_tokens),
    outputTokens: count(read.output_tokens),
    cacheReadTokens: count(read.cache_read_input_tokens),
    cacheWriteTokens: count(read.cache_creation_input_tokens),
    webSearchRequests: count(server.web_search_requests),
    webFetchRequests: count(server.web_fetch_requests),
  };
}

/** A server tool's result block, as `ServerToolUse.result`. */
function serverResult(content: unknown): NonNullable<ServerToolUse["result"]> {
  if (Array.isArray(content)) {
    return {
      ok: true,
      pages: content.filter(isObject).flatMap((item) =>
        typeof item.url === "string"
          ? [
              {
                url: item.url,
                ...(typeof item.title === "string"
                  ? { title: item.title }
                  : {}),
              },
            ]
          : [],
      ),
    };
  }
  if (isObject(content)) {
    if (typeof content.error_code === "string") {
      return { ok: false, errorCode: content.error_code };
    }
    if (typeof content.url === "string") {
      const document = isObject(content.content) ? content.content : {};
      return {
        ok: true,
        pages: [
          {
            url: content.url,
            ...(typeof document.title === "string"
              ? { title: document.title }
              : {}),
          },
        ],
      };
    }
  }
  return { ok: false };
}

/** A code-execution block's name or type (`code_execution`, `bash_code_execution_tool_result`…). */
const CODE_EXECUTION = /code_execution/;

/**
 * A Claude turn's content blocks read: the text, our tool calls, and the
 * server tools' calls paired with their results by `tool_use_id` (a result
 * may arrive in a later response than its call — a deferred server tool).
 */
export function readClaudeContent(content: unknown[]): {
  text: string;
  toolCalls: AgentToolCall[];
  serverToolUses: ServerToolUse[];
} {
  const texts: string[] = [];
  const toolCalls: AgentToolCall[] = [];
  const uses = new Map<string, ServerToolUse>();
  const hidden = new Set<string>();
  for (const block of content) {
    if (!isObject(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    } else if (block.type === "tool_use") {
      const read = readArguments(block.input);
      toolCalls.push({
        id: String(block.id ?? ""),
        name: String(block.name ?? ""),
        ...read,
      });
    } else if (block.type === "server_tool_use") {
      const id = String(block.id ?? "");
      const name = String(block.name ?? "");
      /* 46d: the newer web tools' own code runs (dynamic filtering) are
       * part of the search, not a step of their own: kept raw, not shown. */
      if (CODE_EXECUTION.test(name)) {
        hidden.add(id);
        continue;
      }
      uses.set(id, { id, name, input: block.input });
    } else if (
      typeof block.type === "string" &&
      block.type.endsWith("_tool_result") &&
      typeof block.tool_use_id === "string"
    ) {
      if (CODE_EXECUTION.test(block.type) || hidden.has(block.tool_use_id)) {
        continue;
      }
      const id = block.tool_use_id;
      const use = uses.get(id) ?? {
        id,
        name: block.type.replace(/_tool_result$/, ""),
        input: undefined,
      };
      use.result = serverResult(block.content);
      uses.set(id, use);
    }
  }
  return {
    text: stripThink(texts.join("")),
    toolCalls,
    serverToolUses: [...uses.values()],
  };
}

/**
 * A paused turn's content without its unfinished server calls (46d): a
 * `server_tool_use` whose result has not come, anything its code run called
 * (`caller.tool_id`), and the results of those. What a turn stopped at the
 * cost budget keeps, so a follow-up replays only finished calls.
 */
export function settledContent(content: unknown[]): unknown[] {
  const answered = new Set<string>();
  for (const block of content) {
    if (isObject(block) && typeof block.tool_use_id === "string") {
      answered.add(block.tool_use_id);
    }
  }
  const dropped = new Set<string>();
  for (let changed = true; changed;) {
    changed = false;
    for (const block of content) {
      if (!isObject(block) || block.type !== "server_tool_use") continue;
      const id = String(block.id ?? "");
      if (dropped.has(id)) continue;
      const caller = isObject(block.caller) ? block.caller.tool_id : undefined;
      if (
        !answered.has(id) ||
        (typeof caller === "string" && dropped.has(caller))
      ) {
        dropped.add(id);
        changed = true;
      }
    }
  }
  return content.filter(
    (block) =>
      !isObject(block) ||
      !(
        (block.type === "server_tool_use" &&
          dropped.has(String(block.id ?? ""))) ||
        (typeof block.tool_use_id === "string" &&
          dropped.has(block.tool_use_id))
      ),
  );
}

function claudeStop(stop: unknown): ChatToolsStop {
  switch (stop) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    case "pause_turn":
      return "pause";
    default:
      return "other";
  }
}

async function claudeTurn(
  request: ChatToolsRequest,
  config: LlmConfig,
  signal: AbortSignal | undefined,
): Promise<ChatToolsResult> {
  const started = Date.now();
  const base = claudeToolsBody(request, config);
  let content: unknown[] = [];
  let usage = emptyUsage();
  let apiStop: unknown;
  let pauses = 0;
  let costStopped = false;
  /* 46d: the newer web tools' container, carried into a continuation. */
  let container: ContainerRef | undefined =
    "container" in base && base.container
      ? lastContainerRef(request.messages)
      : undefined;
  for (;;) {
    const messages =
      content.length > 0
        ? [...base.messages, { role: "assistant", content }]
        : base.messages;
    const body = await postClaude(
      config,
      JSON.stringify({
        ...base,
        messages,
        ...(container ? { container: container.id } : {}),
      }),
      {
        timeoutMs: request.timeoutMs ?? ANTHROPIC_TIMEOUT_MS,
        signal,
        step: request.step,
      },
    );
    content = content.concat(Array.isArray(body.content) ? body.content : []);
    usage = addUsage(usage, claudeUsage(body.usage));
    if (request.newerWebTools) container = containerOf(body, container);
    apiStop = body.stop_reason;
    if (apiStop !== "pause_turn" || pauses >= CLAUDE_PAUSE_CONTINUATIONS) break;
    /* 46d: a paused turn is not continued past the run's cost budget. */
    if (request.costBudgetUsd !== undefined) {
      const spent = claudeCostEstimate(config.model, usage);
      if (spent !== undefined && spent >= request.costBudgetUsd) {
        costStopped = true;
        content = settledContent(content);
        request.step?.log.warn(
          "llm.pause",
          `${modelLabel(config)} paused its turn (pause_turn); not continued: the run's cost budget is spent`,
          { pauses, costEstimateUsd: spent },
        );
        break;
      }
    }
    pauses += 1;
    request.step?.log.info(
      "llm.pause",
      `${modelLabel(config)} paused its turn (pause_turn) — continuing (${pauses} of ${CLAUDE_PAUSE_CONTINUATIONS})`,
      { pauses },
    );
  }
  const cost = claudeCostEstimate(config.model, usage);
  if (cost !== undefined) usage.costEstimateUsd = cost;
  const durationMs = Date.now() - started;
  const read = readClaudeContent(content);
  request.step?.set({
    ...callStats({
      model: config.model,
      durationMs,
      promptTokens: totalInputTokens(usage),
      outputTokens: usage.outputTokens,
    }),
    ...(usage.cacheReadTokens
      ? { cacheReadTokens: usage.cacheReadTokens }
      : {}),
    ...(usage.webSearchRequests
      ? { webSearchRequests: usage.webSearchRequests }
      : {}),
    ...(usage.webFetchRequests
      ? { webFetchRequests: usage.webFetchRequests }
      : {}),
    ...(cost !== undefined ? { costEstimateUsd: cost } : {}),
    ...(pauses ? { pauses } : {}),
  });
  return {
    message: {
      role: "assistant",
      text: read.text,
      toolCalls: read.toolCalls,
      ...(read.serverToolUses.length
        ? { serverToolUses: read.serverToolUses }
        : {}),
      raw: {
        api: "anthropic",
        content,
        ...(request.newerWebTools && container
          ? {
              container: container.id,
              ...(container.expiresAt
                ? { containerExpiresAt: container.expiresAt }
                : {}),
            }
          : {}),
      },
    },
    stop: claudeStop(apiStop),
    ...(typeof apiStop === "string" ? { apiStop } : {}),
    usage,
    model: config.model,
    api: "anthropic",
    durationMs,
    ...(costStopped ? { costStopped: true as const } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Ollama and OpenAI-compatible                                         */
/* ------------------------------------------------------------------ */

/** Both local styles' `tools`: functions with a JSON Schema. */
function localTools(tools: ToolSpec[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: wireSchema(tool.inputSchema),
    },
  }));
}

/** The conversation as Ollama's `/api/chat` `messages`. */
export function ollamaMessages(system: string, messages: AgentMessage[]) {
  return [
    { role: "system", content: system },
    ...messages.map((message) => {
      if (message.role === "user") {
        return { role: "user", content: message.text };
      }
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_name: message.name,
          content: toolResultText(message),
        };
      }
      return {
        role: "assistant",
        content: message.text,
        ...(message.toolCalls.length
          ? {
              tool_calls: message.toolCalls.map((call, index) => ({
                type: "function",
                function: {
                  index,
                  name: call.name,
                  arguments: isObject(call.input) ? call.input : {},
                },
              })),
            }
          : {}),
      };
    }),
  ];
}

/** The conversation as an OpenAI-style server's `messages`. */
export function openAiMessages(system: string, messages: AgentMessage[]) {
  return [
    { role: "system", content: system },
    ...messages.map((message) => {
      if (message.role === "user") {
        return { role: "user", content: message.text };
      }
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: toolResultText(message),
        };
      }
      return {
        role: "assistant",
        content: message.text || null,
        ...(message.toolCalls.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments:
                    call.rawArguments ??
                    JSON.stringify(isObject(call.input) ? call.input : {}),
                },
              })),
            }
          : {}),
      };
    }),
  ];
}

/** A local style's request for a turn. */
export function localToolsBody(
  request: ChatToolsRequest,
  config: LlmConfig,
  numCtx: number,
) {
  const tools = localTools(request.tools);
  if (config.api === "ollama") {
    return {
      model: config.model,
      messages: ollamaMessages(request.system, request.messages),
      ...(tools.length > 0 ? { tools } : {}),
      stream: false,
      think: request.think ?? false,
      keep_alive: LLM_KEEP_ALIVE,
      options: { num_ctx: numCtx, temperature: 0 },
    };
  }
  return {
    model: config.model,
    messages: openAiMessages(request.system, request.messages),
    ...(tools.length > 0 ? { tools } : {}),
    temperature: 0,
  };
}

/** Local tool calls (either style) as `AgentToolCall`s. */
function readLocalCalls(raw: unknown): AgentToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const call = isObject(entry) ? entry : {};
    const fn = isObject(call.function) ? call.function : {};
    const id =
      typeof call.id === "string" && TOOL_ID.test(call.id)
        ? call.id
        : madeUpId(index);
    return {
      id,
      name: typeof fn.name === "string" ? fn.name : "",
      ...readArguments(fn.arguments),
    };
  });
}

async function localTurn(
  request: ChatToolsRequest,
  config: LlmConfig,
  signal: AbortSignal | undefined,
  numCtx: number,
  surface: boolean,
): Promise<{ result: ChatToolsResult; gpu?: number }> {
  const started = Date.now();
  const body = await postLocal(
    config,
    JSON.stringify(localToolsBody(request, config, numCtx)),
    {
      timeoutMs: request.timeoutMs ?? LLM_TIMEOUT_MS,
      signal,
      step: request.step,
      numCtx,
      surface,
      /* Ea2: an OpenAI-style server gets 38g's one retry; Ollama never. */
      retry: config.api === "openai",
    },
  );
  const {
    content: _content,
    data: _data,
    ...stats
  } = readResponse(body, config.api);
  void _content;
  void _data;
  const durationMs = Date.now() - started;
  const gpu = await recordLocalCall(
    config,
    request.step,
    { ...stats, durationMs, model: config.model },
    { numCtx, surface },
  );
  let message: Record<string, unknown> | undefined;
  let apiStop: unknown;
  if (config.api === "ollama") {
    message = isObject(body.message) ? body.message : undefined;
    apiStop = body.done_reason;
  } else {
    const choice = Array.isArray(body.choices) ? body.choices[0] : undefined;
    message =
      isObject(choice) && isObject(choice.message) ? choice.message : undefined;
    apiStop = isObject(choice) ? choice.finish_reason : undefined;
  }
  if (!message) {
    throw new LlmError(
      "bad_json",
      `${modelLabel(config)}'s response carries no message`,
    );
  }
  const toolCalls = readLocalCalls(message.tool_calls);
  const text =
    typeof message.content === "string" ? stripThink(message.content) : "";
  const stop: ChatToolsStop =
    apiStop === "length"
      ? "max_tokens"
      : toolCalls.length > 0
        ? "tool_use"
        : "end";
  return {
    result: {
      message: { role: "assistant", text, toolCalls },
      stop,
      ...(typeof apiStop === "string" ? { apiStop } : {}),
      usage: {
        ...emptyUsage(),
        inputTokens: stats.promptTokens ?? 0,
        outputTokens: stats.outputTokens ?? 0,
      },
      model: config.model,
      api: config.api,
      durationMs,
      ...(stats.loadMs !== undefined ? { loadMs: stats.loadMs } : {}),
    },
    ...(gpu !== undefined ? { gpu } : {}),
  };
}
