/**
 * How an intent's plan runs (51b): code decides the steps; the model is
 * asked small, schema-bound questions (`json`, `judge`); and every tool the
 * plan uses is a call in the conversation, run by the loop's own
 * `runToolCall` — so it is checked against its schema, capped, wrapped as
 * page text (E7), previewed when held (48b), and logged as a step named by
 * the tool, exactly as the model's calls are. Writes go through the same
 * held branch of the bridge (`hold`), so `/curator`'s review applies them.
 *
 * **The transcript is the loop's shape** (44c): the prompt as a user
 * message; one assistant message per tool call, carrying what the plan is
 * doing as its text; the call's result; a `turn` record for each model
 * call's numbers (48b's live budget); and a last assistant message, the
 * answer. `RunView`, the review panel, a follow-up's history and the
 * harness all read it unchanged.
 *
 * **Budgets.** The loop's wall time (20 minutes) and, for a priced Claude
 * model, the run's cost cap (46d) — checked before each model call, and
 * handed to the judge as what is left. A cancel stops at the next step.
 */
import { CHARS_PER_TOKEN, LLM_NUM_CTX } from "../../llm/client";
import type {
  ChatJsonRequest,
  ChatJsonResult,
  LlmConfig,
} from "../../llm/client";
import { chatJson } from "../../llm/client";
import {
  claudeCostEstimate,
  costBudgetWords,
  dollarText,
} from "../../llm/cost";
import { judgeRecipes, type JudgeResult } from "../../llm/judge";
import { readerLabel } from "../../llm/readerLabel";
import { addUsage, emptyUsage } from "../../llm/tools";
import type { CurationContext } from "../../curation/context";
import type { JobContext } from "../../jobs/context";
import {
  CLAUDE_AGENT_CONTEXT_TOKENS,
  DEFAULT_AGENT_BUDGETS,
  StoppedWhileRunning,
  TOOL_RESULT_MIN_CHARS,
  TOOL_RESULT_SHARE,
  TOOL_SETTLE_GRACE_MS,
  UNKNOWN_OUTCOME,
  errorContent,
  runToolCall,
  type CallOutcome,
} from "../loop";
import type {
  AgentMessage,
  AgentStopReason,
  AgentTool,
  AgentToolCall,
  AgentUsage,
} from "../types";

/** The model call a plan makes: `chatJson`, or a test's stand-in. */
export type IntentChat = (request: ChatJsonRequest) => Promise<ChatJsonResult>;

export interface IntentRunOptions {
  ctx: CurationContext;
  /** The person's ask, checked. */
  prompt: string;
  config: LlmConfig;
  job: JobContext;
  /** The tools the plan may call (the bridge's, held when `hold`). */
  tools: AgentTool[];
  /** A local model's `num_ctx` for every call (the run's; no reload). */
  numCtx?: number;
  think?: boolean;
  /** The run's writes are held for review (48b). */
  hold: boolean;
  /** A priced Claude model's cap (46d). */
  maxCostUsd?: number;
  /** The model call; `chatJson` unless a test scripts one. */
  chat?: IntentChat;
  now?: Date;
  /** The wall-time budget (the loop's default). */
  maxWallMs?: number;
  /** Each message the run adds, as it is added (the transcript). */
  onMessage: (message: AgentMessage) => void;
  /** Each model call's numbers as it ends (the transcript's `turn`). */
  onTurn: (turn: number, usage: AgentUsage, durationMs: number) => void;
}

/** A stop a plan cannot go on past: cancelled, or a budget. */
export class IntentStop extends Error {
  constructor(
    readonly stopReason: AgentStopReason,
    message?: string,
  ) {
    super(message ?? stopReason);
    this.name = "IntentStop";
  }
}

/** A tool's answer as a plan reads it. */
export interface ToolAnswer {
  /** The tool's answer, uncut (`undefined` for a call that failed outright). */
  raw: unknown;
  /** The call failed, or the tool answered `{error}`. */
  isError: boolean;
  /** The error's message, when there is one. */
  error?: string;
  /** The call was a write held for review. */
  held: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A tool answer's `{error: {message}}`, if it is one. */
function errorOf(raw: unknown): string | undefined {
  if (!isObject(raw) || !isObject(raw.error)) return undefined;
  return typeof raw.error.message === "string"
    ? raw.error.message
    : String(raw.error.code ?? "error");
}

/** A model call that failed or answered nothing usable: the plan goes on. */
export interface IntentProblem {
  task: string;
  problem: string;
}

/** The context a plan's results are capped to (as the loop's). */
function contextTokensOf(config: LlmConfig, numCtx?: number): number {
  return config.api === "anthropic"
    ? CLAUDE_AGENT_CONTEXT_TOKENS
    : (numCtx ?? LLM_NUM_CTX);
}

export class IntentRun {
  readonly ctx: CurationContext;
  readonly prompt: string;
  readonly config: LlmConfig;
  readonly job: JobContext;
  readonly hold: boolean;
  readonly now: Date;
  readonly numCtx?: number;
  readonly local: boolean;
  usage: AgentUsage = emptyUsage();
  turns = 0;
  toolCalls = 0;
  readonly problems: IntentProblem[] = [];
  readonly signal: AbortSignal;

  private readonly options: IntentRunOptions;
  private readonly tools: Map<string, AgentTool>;
  private readonly chat: IntentChat;
  private readonly resultCap: number;
  private readonly wall = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private pending: string[] = [];
  private calls = 0;
  private readonly started = Date.now();

  constructor(options: IntentRunOptions) {
    this.options = options;
    this.ctx = options.ctx;
    this.prompt = options.prompt;
    this.config = options.config;
    this.job = options.job;
    this.hold = options.hold;
    this.now = options.now ?? new Date();
    this.local = options.config.api !== "anthropic";
    if (this.local && options.numCtx) this.numCtx = options.numCtx;
    this.tools = new Map(options.tools.map((tool) => [tool.name, tool]));
    this.chat = options.chat ?? chatJson;
    this.resultCap = Math.max(
      TOOL_RESULT_MIN_CHARS,
      Math.floor(
        contextTokensOf(options.config, options.numCtx) *
          CHARS_PER_TOKEN *
          TOOL_RESULT_SHARE,
      ),
    );
    const maxWallMs = options.maxWallMs ?? DEFAULT_AGENT_BUDGETS.maxWallMs;
    this.timer = setTimeout(() => this.wall.abort(), maxWallMs);
    this.signal = options.job.signal
      ? AbortSignal.any([options.job.signal, this.wall.signal])
      : this.wall.signal;
  }

  /** The tool names the plan may call. */
  toolNames(): string[] {
    return [...this.tools.keys()];
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** The job as the calls below hand it on: this run's signal. */
  private get run(): JobContext {
    return { ...this.job, signal: this.signal };
  }

  /** A line the next step's message carries (what the plan is doing). */
  say(text: string): void {
    if (text.trim()) this.pending.push(text.trim());
  }

  /** Why the run must stop now, if it must. */
  private stopNow(): IntentStop | undefined {
    if (!this.signal.aborted) return undefined;
    return this.job.signal?.aborted
      ? new IntentStop("cancelled")
      : new IntentStop(
          "budget:wall_time",
          `stopped: the wall-time budget (${Math.round((this.options.maxWallMs ?? DEFAULT_AGENT_BUDGETS.maxWallMs) / 1000)} s) ended`,
        );
  }

  check(): void {
    const stop = this.stopNow();
    if (stop) throw stop;
  }

  private add(message: AgentMessage): void {
    this.options.onMessage(message);
  }

  private result(call: AgentToolCall, outcome: CallOutcome): void {
    this.add({
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: outcome.content,
      ...(outcome.isError ? { isError: true } : {}),
      ...(outcome.summary ? { summary: outcome.summary } : {}),
      ...(outcome.found ? { found: outcome.found } : {}),
      ...(outcome.held ? { held: outcome.held } : {}),
    });
  }

  /**
   * Call a tool as a step of the plan: an assistant message with the call
   * (and what was said since the last), then its result — as the loop
   * records a model's call.
   */
  async tool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolAnswer> {
    this.check();
    this.calls += 1;
    const call: AgentToolCall = { id: `call_plan_${this.calls}`, name, input };
    this.add({
      role: "assistant",
      text: this.pending.join("\n\n"),
      toolCalls: [call],
    });
    this.pending = [];
    this.toolCalls += 1;
    let outcome: CallOutcome;
    try {
      outcome = await this.job.log.step(
        name,
        { id: call.id, plan: true },
        async (step) => {
          const ran = await runToolCall(call, this.tools, this.signal, {
            job: this.run,
            resultCap: this.resultCap,
            settleMs: TOOL_SETTLE_GRACE_MS,
          });
          const failed = ran.isError
            ? ran.content
            : (errorOf(ran.raw) ?? undefined);
          if (failed) step.fail(failed.slice(0, 200));
          return ran;
        },
      );
    } catch (error) {
      if (error instanceof StoppedWhileRunning || this.signal.aborted) {
        this.result(
          call,
          error instanceof StoppedWhileRunning
            ? error.outcome
            : { content: errorContent(UNKNOWN_OUTCOME), isError: true },
        );
        throw this.stopNow() ?? new IntentStop("cancelled");
      }
      outcome = {
        content: errorContent(
          `${name} failed: ${(error as Error)?.message ?? String(error)}`,
        ),
        isError: true,
      };
    }
    this.result(call, outcome);
    const error = outcome.isError ? outcome.content : errorOf(outcome.raw);
    return {
      raw: outcome.raw,
      isError: error !== undefined,
      ...(error !== undefined ? { error } : {}),
      held: outcome.held !== undefined,
    };
  }

  /** What is left of the cost cap, or `undefined` (no cap). */
  private costLeft(): number | undefined {
    const cap = this.options.maxCostUsd;
    if (cap === undefined) return undefined;
    return Math.max(0, cap - (this.usage.costEstimateUsd ?? 0));
  }

  private checkCost(): void {
    const cap = this.options.maxCostUsd;
    const spent = this.usage.costEstimateUsd;
    if (cap !== undefined && spent !== undefined && spent >= cap) {
      throw new IntentStop(
        "budget:cost",
        `${costBudgetWords(cap)}: about ${dollarText(spent)} spent`,
      );
    }
  }

  private count(
    promptTokens: number | undefined,
    outputTokens: number | undefined,
    durationMs: number,
    calls = 1,
    cost?: number,
  ): void {
    const turn: AgentUsage = {
      ...emptyUsage(),
      inputTokens: promptTokens ?? 0,
      outputTokens: outputTokens ?? 0,
    };
    const priced =
      cost ??
      (this.local
        ? undefined
        : claudeCostEstimate(this.config.model, {
            inputTokens: turn.inputTokens,
            outputTokens: turn.outputTokens,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            webSearchRequests: 0,
          }));
    if (priced !== undefined) turn.costEstimateUsd = priced;
    this.usage = addUsage(this.usage, turn);
    this.turns += calls;
    this.options.onTurn(this.turns, turn, durationMs);
  }

  /**
   * One schema-bound model call (`llm.intent`, `task` naming it): the parsed
   * answer — still to be checked by the caller — or `undefined` when the
   * call failed (said in the log and `problems`; the plan goes on with what
   * code can do). Throws only to stop (a cancel, a budget).
   */
  async json(
    task: string,
    request: {
      system: string;
      user: string;
      schema: Record<string, unknown>;
      schemaName: string;
    },
  ): Promise<unknown> {
    this.check();
    this.checkCost();
    try {
      const answer = await this.job.log.step(
        "llm.intent",
        { task, model: readerLabel(this.config) },
        (step) =>
          this.chat({
            ...request,
            step,
            config: this.config,
            ...(this.numCtx ? { numCtx: this.numCtx } : {}),
            ...(this.options.think ? { think: true } : {}),
            signal: this.signal,
            job: this.run,
          }),
      );
      this.count(
        answer.promptTokens,
        answer.outputTokens,
        answer.durationMs ?? 0,
      );
      return answer.data;
    } catch (error) {
      const stop = this.stopNow();
      if (stop) throw stop;
      const problem = error instanceof Error ? error.message : String(error);
      this.problems.push({ task, problem });
      this.job.log.warn(
        "intent",
        `${task}: the model call failed (${problem})`,
      );
      return undefined;
    }
  }

  /** `judgeRecipes` on this run's model, context, job and budget (51c). */
  async judge(
    criterion: string,
    slugs: readonly string[],
  ): Promise<JudgeResult> {
    this.check();
    this.checkCost();
    const left = this.costLeft();
    try {
      const result = await judgeRecipes(this.ctx, {
        criterion,
        slugs,
        model: this.config,
        job: this.run,
        ...(this.numCtx ? { numCtx: this.numCtx } : {}),
        ...(this.options.think ? { think: true } : {}),
        ...(left !== undefined ? { maxCostUsd: left } : {}),
        chat: this.chat,
      });
      if (result.calls > 0) {
        this.count(
          result.promptTokens,
          result.outputTokens,
          result.durationMs,
          result.calls,
          result.costEstimateUsd,
        );
      }
      return result;
    } catch (error) {
      throw this.stopNow() ?? error;
    }
  }

  /** The answer: the run's last message. */
  answer(text: string): void {
    const said = this.pending.join("\n\n");
    this.pending = [];
    this.add({
      role: "assistant",
      text: said ? `${said}\n\n${text}` : text,
      toolCalls: [],
    });
  }

  /** End the run's timer (always, however it ended). */
  close(): void {
    clearTimeout(this.timer);
  }

  get durationMs(): number {
    return Date.now() - this.started;
  }
}
