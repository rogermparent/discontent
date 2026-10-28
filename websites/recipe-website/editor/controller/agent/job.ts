/**
 * The `agent` job kind (epic 44, 44c, E2): one run of the editor's agent —
 * `runAgent` (44a) with the curator's tools (44b's bridge over an in-process
 * local backend, E1), the configured model (`RECIPE_LLM_*`, E3), E3's
 * budgets, and the job's own signal, log and queue place.
 *
 * - **Steps** are the loop's (Ea10): each model call an `agent.turn` step,
 *   each tool call a step named by the tool. An import or inspect a tool
 *   starts runs **inside this job** (Ec1), so its fetch, model calls and
 *   writes nest under the tool's step, and a cancel stops it.
 * - **The conversation** goes to `<id>.transcript.jsonl` as it happens
 *   (`transcript.ts`), with a final `end` record. A follow-up (`continues`)
 *   reads the run it continues back as `history`, and copies it first, so
 *   its own transcript is the whole conversation (Ec3).
 * - **Tools by model** (E6): Claude gets the 45, our `web_fetch` (paced,
 *   403-polite, SSRF-guarded — never Anthropic's server fetch, which
 *   bypasses all three: 44a's finding) and Anthropic's server-side
 *   `web_search`. A local model gets `LOCAL_AGENT_TOOLS`, `web_fetch`, and
 *   SearXNG's `web_search` when `RECIPE_SEARCH_URL` is set, all in their
 *   local view (44e), and runs at `RECIPE_AGENT_NUM_CTX` with
 *   `RECIPE_AGENT_THINK` (`agentLocalOptions`).
 *
 * - **A cost budget** (46d): a Claude run with a priced model stops at
 *   `RECIPE_AGENT_MAX_COST_USD` (default $1, `agentCostBudget`) with
 *   `budget:cost`; a local model has no cap. **The newer web tools** (46d,
 *   Ea3's toggle): `newerWebTools` gives a Claude run the server search's
 *   dynamic-filtering version; a local model ignores it, and the log says so.
 *
 * What the job answers (its meta's `result`) is small — the final text, how
 * it stopped, the usage and counts — never the transcript.
 */
import { createLocalBackend } from "../../cli/backend/local";
import type { CurationContext } from "../curation/context";
import { UsageError } from "../curation/errors";
import type { JobContext } from "../jobs/context";
import { LLM_NUM_CTX, llmConfig, type LlmApi } from "../llm/client";
import { DEFAULT_AGENT_MAX_COST_USD, claudeCostEstimate } from "../llm/cost";
import { emptyUsage } from "../llm/tools";
import { AGENT_PROMPT_MAX } from "./follow";
import { runAgent } from "./loop";
import {
  LOCAL_AGENT_TOOLS,
  claudeSystemPrompt,
  localSystemPrompt,
} from "./prompt";
import { agentTools } from "./tools";
import {
  historyOf,
  readTranscriptText,
  transcriptRecords,
  transcriptWriter,
} from "./transcript";
import type {
  AgentMessage,
  AgentStopReason,
  AgentUsage,
  ServerTool,
} from "./types";

export { AGENT_PROMPT_MAX };

/** Claude's server-side searches per model call (`max_uses`, Ea3's basic tool). */
export const AGENT_WEB_SEARCH_MAX_USES = 5;

/** The spec an agent job records (`kinds.ts`'s `agent`). */
export interface AgentJobSpec {
  kind: "agent";
  contentDirectory: string;
  author?: { name: string; email: string };
  prompt: string;
  continues?: string;
  maxTurns?: number;
  /**
   * Claude's newer server web tools for this run (46d, Ea3's toggle);
   * ignored — and said so in the log — for a local model.
   */
  newerWebTools?: boolean;
}

/** What an agent job answers: its meta's `result`. */
export interface AgentJobResult {
  /** The model's last answer ("" when the run ended before one). */
  text: string;
  stopReason: AgentStopReason;
  error?: string;
  usage: AgentUsage;
  turns: number;
  toolCalls: number;
  trimmed: number;
  durationMs: number;
  model: string;
  api: LlmApi;
  /** The run this one continued. */
  continues?: string;
  /** The run's cost budget in USD (46d); absent when it had none (a model with no price). */
  maxCostUsd?: number;
  /** The run used Claude's newer web tools (46d). */
  newerWebTools?: true;
}

/** Why there is no agent: no model is configured (the route's 400, the CLI's usage). */
export function agentUnavailableMessage(): string {
  return "No model is configured for the agent: set RECIPE_LLM_URL (a local model), or RECIPE_LLM_API=anthropic with RECIPE_LLM_API_KEY (the Claude API).";
}

/** Whether the agent can run here: a model is configured (as Ask's `askAvailable`). */
export function agentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return llmConfig(env) !== undefined;
}

/** A prompt the agent takes, or `validation` saying why not (the route answers 413 for length). */
export function checkAgentPrompt(prompt: unknown): string {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new UsageError("The ask is empty: say what to find or import.");
  }
  if (prompt.length > AGENT_PROMPT_MAX) {
    throw new UsageError(
      `The ask is ${prompt.length} characters, over the ${AGENT_PROMPT_MAX}-character cap: shorten it, or paste a recipe through Import instead.`,
    );
  }
  return prompt.trim();
}

/**
 * The contexts a local agent run may ask for (44e, Ee4): 40a's largest
 * step, the default, and one more for a run whose conversation outgrows it.
 * One per run — `num_ctx` is fixed for the run, since a change reloads the
 * model (40a) — chosen by `RECIPE_AGENT_NUM_CTX`.
 */
export const AGENT_CONTEXT_STEPS: readonly number[] = [LLM_NUM_CTX, 16_384];

/** What a local agent run asks of the model (44e, Ee4/Ee5). */
export interface AgentLocalOptions {
  /** Ollama's `num_ctx` for every turn of the run. */
  numCtx: number;
  /** Ollama's `think` (off unless `RECIPE_AGENT_THINK=1`, Ea11). */
  think: boolean;
  /** A setting that was not understood and fell back to the default. */
  ignored: string[];
}

/**
 * `RECIPE_AGENT_NUM_CTX` (one of `AGENT_CONTEXT_STEPS`, default 12,288) and
 * `RECIPE_AGENT_THINK` (`1`/`true`/`on` or `0`/`false`/`off`, default off).
 * A value it does not take is ignored — the run goes on at the default and
 * its log says so — rather than refused: a typo in `.env` must not stop
 * the curator.
 */
export function agentLocalOptions(
  env: NodeJS.ProcessEnv = process.env,
): AgentLocalOptions {
  const ignored: string[] = [];
  let numCtx = LLM_NUM_CTX;
  const ctxText = env.RECIPE_AGENT_NUM_CTX?.trim();
  if (ctxText) {
    const value = Number(ctxText);
    if (AGENT_CONTEXT_STEPS.includes(value)) numCtx = value;
    else {
      ignored.push(
        `RECIPE_AGENT_NUM_CTX=${ctxText.slice(0, 20)} (takes ${AGENT_CONTEXT_STEPS.join(" or ")})`,
      );
    }
  }
  let think = false;
  const thinkText = env.RECIPE_AGENT_THINK?.trim().toLowerCase();
  if (thinkText) {
    if (["1", "true", "on", "yes"].includes(thinkText)) think = true;
    else if (!["0", "false", "off", "no"].includes(thinkText)) {
      ignored.push(
        `RECIPE_AGENT_THINK=${thinkText.slice(0, 20)} (takes 0 or 1)`,
      );
    }
  }
  return { numCtx, think, ignored };
}

/** The largest cost budget `RECIPE_AGENT_MAX_COST_USD` takes, in USD. */
export const AGENT_MAX_COST_CEILING_USD = 50;

/** A run's cost budget (46d), and a setting that was not understood. */
export interface AgentCostBudget {
  /** The cap in USD; absent for a model with no price (no estimate to check). */
  maxCostUsd?: number;
  /** Why there is no cap, when the model is Claude's but has no price. */
  unpriced?: string;
  /** A `RECIPE_AGENT_MAX_COST_USD` that was not understood (the default is used). */
  ignored?: string;
}

/**
 * The cost budget a run gets (46d): `RECIPE_AGENT_MAX_COST_USD` (a number of
 * dollars above 0, at most `AGENT_MAX_COST_CEILING_USD`), else
 * `DEFAULT_AGENT_MAX_COST_USD` ($1) — for the Claude API with a model the
 * price table lists. A local model, or a Claude model with no price, has no
 * estimate and so no cap. A value it does not take falls back to the
 * default and is said in the log, as `agentLocalOptions` does.
 */
export function agentCostBudget(
  config: { api: LlmApi; model: string },
  env: NodeJS.ProcessEnv = process.env,
): AgentCostBudget {
  if (config.api !== "anthropic") return {};
  if (claudeCostEstimate(config.model, emptyUsage()) === undefined) {
    return {
      unpriced: `${config.model} has no price in the estimate table: this run has no cost budget`,
    };
  }
  const text = env.RECIPE_AGENT_MAX_COST_USD?.trim();
  if (!text) return { maxCostUsd: DEFAULT_AGENT_MAX_COST_USD };
  const value = Number(text.replace(/^\$/, ""));
  if (
    Number.isFinite(value) &&
    value > 0 &&
    value <= AGENT_MAX_COST_CEILING_USD
  ) {
    return { maxCostUsd: value };
  }
  return {
    maxCostUsd: DEFAULT_AGENT_MAX_COST_USD,
    ignored: `RECIPE_AGENT_MAX_COST_USD=${text.slice(0, 20)} (takes dollars above 0, at most ${AGENT_MAX_COST_CEILING_USD})`,
  };
}

/**
 * **Test and measurement only** (44e, Ee6): host names the SSRF guard lets
 * through — the measurement harness's fixture server on 127.0.0.1. Nothing
 * in the editor sets it: no environment variable, no spec field, no route
 * or CLI argument; `runAgentJob` never passes it, so a run the route or
 * `pnpm recipes agent` starts refuses a private address as before.
 */
export interface AgentToolsetTesting {
  allowHosts: readonly string[];
}

/**
 * The tools a run offers its model, and Claude's server tools: E6's split
 * (above). `RECIPE_SEARCH_URL` decides a local model's `web_search`. A
 * local model gets its tools' local view (44e, `tools/local.ts`).
 */
export function agentToolset(
  ctx: CurationContext,
  api: LlmApi,
  testing?: AgentToolsetTesting,
): { tools: ReturnType<typeof agentTools>; serverTools: ServerTool[] } {
  /* In-process, as MCP over HTTP (23e/D25): no stale hint, no close. */
  const backend = createLocalBackend({ ...ctx, inProcess: true });
  const allowed = testing ? { allowHosts: [...testing.allowHosts] } : {};
  if (api === "anthropic") {
    return {
      tools: agentTools(backend, {
        webSearch: false,
        ...(testing ? { guard: allowed, webFetch: allowed } : {}),
      }),
      serverTools: [{ kind: "web_search", maxUses: AGENT_WEB_SEARCH_MAX_USES }],
    };
  }
  return {
    tools: agentTools(backend, {
      only: LOCAL_AGENT_TOOLS,
      local: true,
      ...(testing ? { guard: allowed, webFetch: allowed } : {}),
    }),
    serverTools: [],
  };
}

/** The system prompt a run's model gets (E4): Claude's whole skill, or the local one. */
export function agentSystemPrompt(
  api: LlmApi,
  { now, search }: { now: Date; search: boolean },
): string {
  return api === "anthropic"
    ? claudeSystemPrompt({ now, search })
    : localSystemPrompt({ now, search });
}

/** Whether a toolset gives its model a web search (Claude's server one, or SearXNG's). */
export function toolsetSearches({
  tools,
  serverTools,
}: {
  tools: { name: string }[];
  serverTools: ServerTool[];
}): boolean {
  return (
    serverTools.some((tool) => tool.kind === "web_search") ||
    tools.some((tool) => tool.name === "web_search")
  );
}

/** Run one agent job. Never throws for the model's failure: the result says how it ended. */
export async function runAgentJob(
  spec: AgentJobSpec,
  {
    ctx,
    job,
    dir,
    testing,
  }: {
    ctx: CurationContext;
    job: JobContext;
    dir: string;
    /**
     * The measurement harness's fixture host (Ee6), never the editor's:
     * the `agent` kind's handler passes `{ctx, job, dir}` and nothing more.
     */
    testing?: AgentToolsetTesting;
  },
): Promise<AgentJobResult> {
  const config = llmConfig();
  if (!config) throw new UsageError(agentUnavailableMessage());
  const prompt = checkAgentPrompt(spec.prompt);
  const jobId = job.jobId;
  const writer = transcriptWriter(dir, jobId);

  let history: AgentMessage[] = [];
  if (spec.continues) {
    const earlier = await readTranscriptText(dir, spec.continues);
    if (earlier === undefined) {
      throw new UsageError(
        `Run ${spec.continues} has no transcript to continue: ask again instead.`,
      );
    }
    history = historyOf(transcriptRecords(earlier));
    /* Ec3: the conversation so far, whole, before this run's own lines. */
    writer.copy(earlier);
  }

  const { tools, serverTools } = agentToolset(ctx, config.api, testing);
  const search = toolsetSearches({ tools, serverTools });
  const system = agentSystemPrompt(config.api, { now: new Date(), search });
  const local = config.api === "anthropic" ? undefined : agentLocalOptions();
  const cost = agentCostBudget(config);
  /* 46d: Claude's newer server tools, per run; a local model has none. */
  const newerWebTools = spec.newerWebTools === true && serverTools.length > 0;

  writer.write({
    type: "start",
    job: jobId ?? "",
    ...(spec.continues ? { continues: spec.continues } : {}),
    model: config.model,
    api: config.api,
    tools: tools.map((tool) => tool.name),
    ...(serverTools.length
      ? { serverTools: serverTools.map((tool) => tool.kind) }
      : {}),
    ...(newerWebTools ? { newerWebTools: true as const } : {}),
    ...(cost.maxCostUsd !== undefined ? { maxCostUsd: cost.maxCostUsd } : {}),
  });
  job.log.info(
    "agent.start",
    `${config.api === "anthropic" ? "Claude API" : "local model"} ${config.model}: ${tools.length} tools${serverTools.length ? ` + server ${serverTools.map((tool) => tool.kind).join(", ")}` : ""}`,
    {
      model: config.model,
      api: config.api,
      tools: tools.length,
      ...(local ? { numCtx: local.numCtx, think: local.think } : {}),
      ...(spec.continues ? { continues: spec.continues } : {}),
      ...(newerWebTools ? { newerWebTools: true } : {}),
      ...(cost.maxCostUsd !== undefined ? { maxCostUsd: cost.maxCostUsd } : {}),
    },
  );
  for (const setting of [
    ...(local?.ignored ?? []),
    ...(cost.ignored ? [cost.ignored] : []),
  ]) {
    job.log.warn("agent.setting", `ignored ${setting}: the default is used`);
  }
  if (cost.unpriced) job.log.warn("agent.setting", cost.unpriced);
  if (spec.newerWebTools === true && !newerWebTools) {
    job.log.info(
      "agent.setting",
      "ignored newerWebTools: they are Claude's server tools, and this model has none",
    );
  }

  const result = await runAgent({
    system,
    prompt,
    history,
    tools,
    serverTools,
    budgets: {
      ...(spec.maxTurns ? { maxTurns: spec.maxTurns } : {}),
      ...(cost.maxCostUsd !== undefined ? { maxCostUsd: cost.maxCostUsd } : {}),
    },
    ...(newerWebTools ? { newerWebTools: true } : {}),
    config,
    ...(local ? { numCtx: local.numCtx, think: local.think } : {}),
    job,
    onEvent: (event) => {
      if (event.type === "message") {
        writer.write({
          type: "message",
          job: jobId ?? "",
          message: event.message,
        });
      }
    },
  });

  /* 46d: a budget's stop is said in the job's own log, not only its result. */
  if (result.stopReason.startsWith("budget:") && result.error) {
    job.log.warn("agent.budget", result.error, {
      stopReason: result.stopReason,
      ...(result.usage.costEstimateUsd !== undefined
        ? { costEstimateUsd: result.usage.costEstimateUsd }
        : {}),
    });
  }

  writer.write({
    type: "end",
    job: jobId ?? "",
    stop: result.stopReason,
    ...(result.error ? { error: result.error } : {}),
    usage: result.usage,
    ...(result.usage.costEstimateUsd !== undefined
      ? { costEstimate: result.usage.costEstimateUsd }
      : {}),
    ...(cost.maxCostUsd !== undefined ? { maxCostUsd: cost.maxCostUsd } : {}),
    model: config.model,
    api: config.api,
    turns: result.turns,
    toolCalls: result.toolCalls,
    trimmed: result.trimmed,
    durationMs: result.durationMs,
  });

  return {
    text: result.text,
    stopReason: result.stopReason,
    ...(result.error ? { error: result.error } : {}),
    usage: result.usage,
    turns: result.turns,
    toolCalls: result.toolCalls,
    trimmed: result.trimmed,
    durationMs: result.durationMs,
    model: config.model,
    api: config.api,
    ...(spec.continues ? { continues: spec.continues } : {}),
    ...(cost.maxCostUsd !== undefined ? { maxCostUsd: cost.maxCostUsd } : {}),
    ...(newerWebTools ? { newerWebTools: true as const } : {}),
  };
}
