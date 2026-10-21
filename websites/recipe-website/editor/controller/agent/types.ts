/**
 * The agent's shared types (epic 44). The first block is the doc's
 * **Interfaces** block verbatim — 44b builds the tool bridge against it.
 * Everything after it is 44a's, additive (Ea1): the neutral conversation
 * `chatTools` maps to each wire format and `runAgent` keeps as the
 * transcript (44c stores it as `transcript.jsonl`), the budgets, the
 * events and the result.
 *
 * Types only: no runtime code, so the model layer (`controller/llm/`) and
 * the tools (`controller/agent/tools/`) can both import it freely.
 */
import type { JobContext } from "../jobs/context";
import type { LlmApi } from "../llm/client";

/**
 * The run's job as a tool sees it (Ea1): the epic 37 `JobContext` — the
 * log for nested steps, the signal, the tier — as 44b defines it too. The
 * doc's Interfaces block names it `JobHandle`; there was no such type
 * before epic 44.
 */
export type JobHandle = JobContext;

/* ------------------------------------------------------------------ */
/* The Interfaces block (agent-epic-44.md)                              */
/* ------------------------------------------------------------------ */

/** A tool the agent may call. `inputSchema` is JSON Schema (an object). */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Untrusted page text (E7): wrapped before the model sees it. */
  untrusted?: boolean;
  run(input: unknown, ctx: AgentToolContext): Promise<unknown>;
}
export interface AgentToolContext {
  signal: AbortSignal;
  /** The run's job, for nested steps (an import inside a tool call). */
  job?: JobHandle;
}
/** A provider-side tool (Claude's web_search): declared, not run by us. */
export interface ServerTool {
  kind: "web_search" | "web_fetch";
  maxUses?: number;
  allowedDomains?: string[];
}

/* ------------------------------------------------------------------ */
/* 44a, additive: the neutral conversation                              */
/* ------------------------------------------------------------------ */

/** What a model is told about a tool: an `AgentTool` without `run`. */
export type ToolSpec = Pick<AgentTool, "name" | "description" | "inputSchema">;

/** One tool call the model asked for. */
export interface AgentToolCall {
  /**
   * The call's id: the API's (`toolu_…`, `call_…`), or one made up for
   * Ollama, which sends none (`call_<n>`). Matches `[A-Za-z0-9_-]+`, so a
   * transcript can move to the Claude API.
   */
  id: string;
  name: string;
  /** The arguments, parsed; `{}` when they could not be (`malformed`). */
  input: unknown;
  /**
   * Why the arguments could not be read (bad JSON, not an object): the
   * loop answers the call with a tool error and never runs it.
   */
  malformed?: string;
  /** The arguments as sent, when they arrived as a string that is not JSON. */
  rawArguments?: string;
}

/** A server tool's call and result inside a Claude turn (E6), as shown. */
export interface ServerToolUse {
  id: string;
  /** `web_search` or `web_fetch` (the server tool's `name`). */
  name: string;
  input: unknown;
  /** Absent until its result block arrives (a deferred call, or a pause). */
  result?: {
    ok: boolean;
    /** The API's `error_code`, when `ok` is false. */
    errorCode?: string;
    /** The pages found (search) or fetched (fetch). */
    pages?: { url: string; title?: string }[];
  };
}

export interface AgentUserMessage {
  role: "user";
  text: string;
}

export interface AgentAssistantMessage {
  role: "assistant";
  /** The answer's text (every text block, a leading `<think>` block removed). */
  text: string;
  toolCalls: AgentToolCall[];
  /** Claude's server-tool calls in this turn (E6). */
  serverToolUses?: ServerToolUse[];
  /**
   * The Claude API's content blocks exactly as they came (Ea4): thinking
   * blocks with their signatures, `server_tool_use` and the results with
   * their `encrypted_content`, which the API requires back unchanged on
   * later turns. Replayed verbatim to the same API; ignored by the others.
   */
  raw?: { api: LlmApi; content: unknown[] };
}

export interface AgentToolResultMessage {
  role: "tool";
  /** The `AgentToolCall.id` this answers. */
  toolCallId: string;
  /** The tool's name (Ollama's `tool_name`). */
  name: string;
  /** What the model is sent: compact JSON, or E7's wrapped page text. */
  content: string;
  isError?: boolean;
  /**
   * Trimmed for context (Ea6): the model is sent a short stub instead of
   * `content`, which stays here whole for the transcript.
   */
  trimmed?: boolean;
}

export type AgentMessage =
  AgentUserMessage | AgentAssistantMessage | AgentToolResultMessage;

/** Token counts (and, for Claude, the estimated cost) of a turn or a run. */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  /** Claude's prompt cache: tokens read from it, and written to it. */
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Claude's server tools (E6): searches billed, fetches made. */
  webSearchRequests: number;
  webFetchRequests: number;
  /**
   * The Claude API's cost in USD, estimated from
   * `CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK` (Ea7); absent for a local model
   * and for a Claude model the table does not list.
   */
  costEstimateUsd?: number;
}

/* ------------------------------------------------------------------ */
/* 44a, additive: the run                                               */
/* ------------------------------------------------------------------ */

/** E3's caps; each has a default (`DEFAULT_AGENT_BUDGETS`). */
export interface AgentBudgets {
  /** Model calls (default 40). */
  maxTurns?: number;
  /** Tool calls run (not counting Claude's server tools). */
  maxToolCalls?: number;
  /** Wall time of the run, model calls and tools included. */
  maxWallMs?: number;
  /** Input tokens over the run, cache reads and writes included. */
  maxInputTokens?: number;
  /** Output tokens over the run. */
  maxOutputTokens?: number;
}

/**
 * Which budget ended a run. `context` is not a cap the caller sets: the
 * prompt would not fit the model's context even with every old result
 * trimmed (Ea6).
 */
export type AgentBudgetName =
  "turns" | "tool_calls" | "wall_time" | "tokens" | "context";

export type AgentStopReason =
  "done" | `budget:${AgentBudgetName}` | "cancelled" | "error";

/** What `onEvent` hears, in order. */
export type AgentEvent =
  | { type: "turn.start"; turn: number }
  | {
      type: "turn.end";
      turn: number;
      text: string;
      toolCalls: AgentToolCall[];
      serverToolUses: ServerToolUse[];
      /** This turn's numbers. */
      usage: AgentUsage;
      /** The API's stop reason, normalised (`ChatToolsStop`). */
      stop: string;
      durationMs: number;
    }
  | { type: "tool.start"; turn: number; call: AgentToolCall }
  | {
      type: "tool.end";
      turn: number;
      call: AgentToolCall;
      isError: boolean;
      /** What the model is sent (capped; E7-wrapped when untrusted). */
      content: string;
      durationMs: number;
    }
  | {
      type: "trim";
      turn: number;
      /** Tool results trimmed before this turn. */
      trimmed: number;
      /** The estimated prompt, in tokens, before and after. */
      before: number;
      after: number;
      /** The context the run is fitted to. */
      contextTokens: number;
    }
  | {
      type: "stop";
      stopReason: AgentStopReason;
      error?: string;
    };

export interface AgentResult {
  /** The last answer's text ("" when the run ended before one). */
  text: string;
  stopReason: AgentStopReason;
  /** Why, for `error` (and the budget that ended it, in words). */
  error?: string;
  usage: AgentUsage;
  turns: number;
  toolCalls: number;
  /** Tool results trimmed over the run (Ea6). */
  trimmed: number;
  durationMs: number;
  /**
   * The whole conversation in the neutral shape — the history passed in,
   * the prompt, and every turn and result since. Every tool call in it has
   * its result (a call a stop left unrun is answered "not run"), so it can
   * be continued as it is.
   */
  transcript: AgentMessage[];
}
