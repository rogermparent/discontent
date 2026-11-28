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
import {
  ANTHROPIC_DEFAULT_URL,
  DEFAULT_CLAUDE_MODEL,
  LLM_NUM_CTX,
  agentModelOverride,
  llmConfig,
  takesNewerWebTools,
  type LlmApi,
  type LlmConfig,
} from "../llm/client";
import { withAgentModel } from "../llm/agentContext";
import {
  DEFAULT_AGENT_MAX_COST_USD,
  claudeCostEstimate,
  modelPrice,
} from "../llm/cost";
import { chatJson } from "../llm/client";
import { addUsage, emptyUsage } from "../llm/tools";
import { AGENT_PROMPT_MAX } from "./follow";
import { decisionsNote, heldCalls } from "./held";
import { runAgent, type RunAgentOptions } from "./loop";
import {
  LOCAL_AGENT_TOOLS,
  ORGANIZE_NOTE,
  claudeSystemPrompt,
  localSystemPrompt,
} from "./prompt";
import { agentTools } from "./tools";
import type { AgentToolName } from "./tools/names";
import {
  PLANNED_INTENTS,
  type AgentIntentChoice,
  ONLINE_NO_SEARCH,
  type IntentChoice,
} from "./intents/guess";
import { settleIntent } from "./intents/classify";
import type { IntentChat } from "./intents/runner";
import type { IntentOutcome, PlannedIntent } from "./intents";
import { readDecisions } from "./reviewStore";
import {
  historyOf,
  readTranscriptText,
  transcriptRecords,
  transcriptWriter,
} from "./transcript";
import type {
  AgentMessage,
  AgentResult,
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
  /**
   * Hold every write for the person's review (48b, Db1): the curator page's
   * runs. A held write answers the model and writes nothing; the page's
   * Save applies it. Unset (the CLI, the harness): writes as before.
   */
  hold?: boolean;
  /**
   * Who answers (48b, Db5): the Claude API or the local model, where this
   * editor has both (`curatorModels`). Unset: the editor's own model
   * (`RECIPE_LLM_*`), as before.
   */
  model?: CuratorModelId;
  /**
   * What the ask is for (51b, D1): a plan in code (`online`, `mine`,
   * `plan`), the loop with a short note (`organize`), or the loop (`any`);
   * `auto` guesses it (the rules, then one small model call). Unset: the
   * loop, exactly as before. A follow-up runs the loop whatever it says.
   */
  intent?: AgentIntentChoice;
}

/**
 * Who may run the curator: the local model, or the Claude API (48b) — and,
 * where the curator has a local model of its own (`RECIPE_AGENT_MODEL`),
 * the import model beside it (`import`, 51d Dd2: qwen3:8b beside
 * qwen3.5:9b).
 */
export type CuratorModelId = "local" | "import" | "claude";

/** Every `CuratorModelId`, for a request's schema. */
export const CURATOR_MODEL_IDS = ["local", "import", "claude"] as const;

/** The models this editor can run the curator on (48b, Db5). */
export interface CuratorModels {
  local?: LlmConfig;
  /**
   * 51d (Dd2): the editor's own local model (`RECIPE_LLM_MODEL`, what
   * imports run on) when the curator has another (`RECIPE_AGENT_MODEL`).
   */
  import?: LlmConfig;
  claude?: LlmConfig;
  /** The editor's own model (`RECIPE_LLM_*`): what an ask runs on unless it picks. */
  primary?: CuratorModelId;
}

/** The env key that sets up the Claude API beside a local model (47i's). */
export const CURATOR_CLAUDE_KEY_ENV = "RECIPE_LLM_CLAUDE_API_KEY";
/** Its model (47i's, default claude-sonnet-5). */
export const CURATOR_CLAUDE_MODEL_ENV = "RECIPE_LLM_CLAUDE_MODEL";
/**
 * The curator's own local model (51a, Da1): `/curator` and `recipes agent`
 * run on it while imports keep `RECIPE_LLM_MODEL` (qwen3.5:9b agent beside
 * qwen3:8b imports). Unset: the curator runs on `RECIPE_LLM_MODEL`. Not read
 * when the editor's own model is the Claude API (the Pi).
 */
export const CURATOR_LOCAL_MODEL_ENV = "RECIPE_AGENT_MODEL";

/**
 * The curator's models (48b, Db5): the editor's own (`RECIPE_LLM_*`) — the
 * Claude API on the Pi, a local model on the workstation — and, beside a
 * local model, the Claude API when `RECIPE_LLM_CLAUDE_API_KEY` sets it up
 * (47i's key, as "Edit with AI" reads it). The local model is the agent's
 * own (`RECIPE_LLM_MODEL`), not the edit box's `RECIPE_LLM_EDIT_MODEL`.
 */
export function curatorModels(
  env: NodeJS.ProcessEnv = process.env,
): CuratorModels {
  const base = llmConfig(env);
  if (!base) return {};
  if (base.api === "anthropic") return { claude: base, primary: "claude" };
  const key = env[CURATOR_CLAUDE_KEY_ENV]?.trim();
  const claudeModel = env[CURATOR_CLAUDE_MODEL_ENV]?.trim();
  const agentModel =
    agentModelOverride(env) || env[CURATOR_LOCAL_MODEL_ENV]?.trim();
  return {
    local: agentModel ? { ...base, model: agentModel } : base,
    /* 51d (Dd2): the import model too, when the curator has its own. */
    ...(agentModel && agentModel !== base.model ? { import: base } : {}),
    primary: "local",
    ...(key
      ? {
          claude: {
            url: ANTHROPIC_DEFAULT_URL,
            model: claudeModel || DEFAULT_CLAUDE_MODEL,
            api: "anthropic" as const,
            apiKey: key,
          },
        }
      : {}),
  };
}

/** The model a run asks for, or why it can't have it. */
export function curatorModelFor(
  choice: CuratorModelId | undefined,
  models: CuratorModels = curatorModels(),
): { id: CuratorModelId; config: LlmConfig } {
  const id = choice ?? models.primary;
  const config = id ? models[id] : undefined;
  if (!id || !config) {
    throw new UsageError(
      id === "claude"
        ? `The Claude API is not set up in this editor (${CURATOR_CLAUDE_KEY_ENV}, or RECIPE_LLM_API=anthropic).`
        : id === "local"
          ? "No local model is set up in this editor (RECIPE_LLM_URL)."
          : id === "import"
            ? `The curator has no local model of its own here (${CURATOR_LOCAL_MODEL_ENV}), so there is no second one to pick.`
            : agentUnavailableMessage(),
    );
  }
  return { id, config };
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
  /** The run's writes were held for review (48b). */
  hold?: true;
  /** 51b: the intent the run took, and how it was settled. */
  intent?: IntentChoice;
  /** 51b: what an intent's plan proposed, for the page and the harness. */
  outcome?: IntentOutcome;
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
  /**
   * Why there is no cap (a model on Claude's API with no price at all), or
   * how an unlisted Claude model is priced for it (46d: the highest listed
   * rates) — said in the job's log.
   */
  unpriced?: string;
  /** A `RECIPE_AGENT_MAX_COST_USD` that was not understood (the default is used). */
  ignored?: string;
}

/**
 * The cost budget a run gets (46d): `RECIPE_AGENT_MAX_COST_USD` (a number of
 * dollars above 0, at most `AGENT_MAX_COST_CEILING_USD`), else
 * `DEFAULT_AGENT_MAX_COST_USD` ($1) — for every Claude model. One the price
 * table does not list is estimated at its highest rates (`modelPrice`), so
 * it keeps the cap, and the log says so. Only a local model has no estimate
 * and so no cap. A value it does not take falls back to the default and is
 * said in the log, as `agentLocalOptions` does.
 */
export function agentCostBudget(
  config: { api: LlmApi; model: string },
  env: NodeJS.ProcessEnv = process.env,
): AgentCostBudget {
  if (config.api !== "anthropic") return {};
  const priced = modelPrice(config.model);
  if (!priced) {
    return {
      unpriced: `${config.model} has no price in the estimate table: this run has no cost budget`,
    };
  }
  const highest =
    priced.basis === "highest"
      ? {
          unpriced: `${config.model} is not in the price table: its cost is estimated at the highest listed price`,
        }
      : {};
  const text = env.RECIPE_AGENT_MAX_COST_USD?.trim();
  if (!text) return { maxCostUsd: DEFAULT_AGENT_MAX_COST_USD, ...highest };
  const value = Number(text.replace(/^\$/, ""));
  if (
    Number.isFinite(value) &&
    value > 0 &&
    value <= AGENT_MAX_COST_CEILING_USD
  ) {
    return { maxCostUsd: value, ...highest };
  }
  return {
    maxCostUsd: DEFAULT_AGENT_MAX_COST_USD,
    ...highest,
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
  { hold = false }: { hold?: boolean } = {},
): { tools: ReturnType<typeof agentTools>; serverTools: ServerTool[] } {
  /* In-process, as MCP over HTTP (23e/D25): no stale hint, no close. */
  const backend = createLocalBackend({ ...ctx, inProcess: true });
  const allowed = testing ? { allowHosts: [...testing.allowHosts] } : {};
  if (api === "anthropic") {
    return {
      tools: agentTools(backend, {
        webSearch: false,
        hold,
        ...(testing ? { guard: allowed, webFetch: allowed } : {}),
      }),
      serverTools: [{ kind: "web_search", maxUses: AGENT_WEB_SEARCH_MAX_USES }],
    };
  }
  return {
    tools: agentTools(backend, {
      only: LOCAL_AGENT_TOOLS,
      local: true,
      hold,
      ...(testing ? { guard: allowed, webFetch: allowed } : {}),
    }),
    serverTools: [],
  };
}

/**
 * The recipes tools an intent's plan calls (51b): the searches, a page's
 * read, the import, the holiday's menu, the plan. Their full view (not the
 * local one): the plan's code reads their answers, not a small model.
 */
export const INTENT_PLAN_TOOLS = [
  "recipe_search",
  "page_inspect",
  "recipe_import",
  "holiday_get",
  "group_create",
] as const satisfies readonly AgentToolName[];

/**
 * The tools an intent's plan runs (51b): `INTENT_PLAN_TOOLS` through the
 * same bridge — held when the run holds (48b) — and SearXNG's `web_search`
 * when `RECIPE_SEARCH_URL` is set, for every model (the plan calls it, not
 * Claude's server search). No `web_fetch`: no step reads a page as text.
 */
export function intentToolset(
  ctx: CurationContext,
  testing?: AgentToolsetTesting,
  { hold = false }: { hold?: boolean } = {},
): ReturnType<typeof agentTools> {
  const backend = createLocalBackend({ ...ctx, inProcess: true });
  return agentTools(backend, {
    only: INTENT_PLAN_TOOLS,
    hold,
    webFetch: false,
    ...(testing ? { guard: { allowHosts: [...testing.allowHosts] } } : {}),
  });
}

/** The system prompt a run's model gets (E4): Claude's whole skill, or the local one. */
export function agentSystemPrompt(
  api: LlmApi,
  { now, search, hold = false }: { now: Date; search: boolean; hold?: boolean },
): string {
  return api === "anthropic"
    ? claudeSystemPrompt({ now, search, hold })
    : localSystemPrompt({ now, search, hold });
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
    standIn,
  }: {
    ctx: CurationContext;
    job: JobContext;
    dir: string;
    /**
     * The measurement harness's fixture host (Ee6), never the editor's:
     * the `agent` kind's handler passes `{ctx, job, dir}` and nothing more.
     */
    testing?: AgentToolsetTesting;
    /**
     * **Tests only** (D11): a scripted model — the loop's
     * (`RunAgentOptions.model`) and an intent plan's schema-bound calls
     * (`chat`, `chatJson`'s shape). The `agent` kind's handler never passes
     * it.
     */
    standIn?: {
      model?: RunAgentOptions["model"];
      chat?: IntentChat;
    };
  },
): Promise<AgentJobResult> {
  if (!llmConfig()) throw new UsageError(agentUnavailableMessage());
  /* 48b (Db5): the model the ask picked, else the editor's own. */
  const { config } = curatorModelFor(spec.model);
  const prompt = checkAgentPrompt(spec.prompt);
  const jobId = job.jobId;
  const writer = transcriptWriter(dir, jobId);
  const hold = spec.hold === true;

  let history: AgentMessage[] = [];
  /* 48b (Db4): what the person decided on held writes since, for the model. */
  let reviewed: string | undefined;
  if (spec.continues) {
    const earlier = await readTranscriptText(dir, spec.continues);
    if (earlier === undefined) {
      throw new UsageError(
        `Run ${spec.continues} has no transcript to continue: ask again instead.`,
      );
    }
    const records = transcriptRecords(earlier);
    history = historyOf(records);
    const held = heldCalls(records);
    if (held.length > 0) {
      reviewed = decisionsNote(
        held,
        await readDecisions(dir, held).catch(() => new Map()),
      );
    }
    /* Ec3: the conversation so far, whole, before this run's own lines. */
    writer.copy(earlier);
  }

  const local = config.api === "anthropic" ? undefined : agentLocalOptions();
  const cost = agentCostBudget(config);
  const chat = standIn?.chat ?? chatJson;

  /* 51b (D1): the intent — as asked, or guessed (the rules, then one small
   * call) — before the run's start record, which names it. */
  let before = emptyUsage();
  let beforeTurns = 0;
  let beforeMs = 0;
  const intent = await settleIntent(spec.intent, prompt, {
    config,
    job,
    chat,
    ...(local ? { numCtx: local.numCtx } : {}),
    followUp: spec.continues !== undefined,
    onUsage: ({ promptTokens = 0, outputTokens = 0, durationMs }) => {
      const priced =
        config.api === "anthropic"
          ? claudeCostEstimate(config.model, {
              inputTokens: promptTokens,
              outputTokens,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              webSearchRequests: 0,
            })
          : undefined;
      before = addUsage(before, {
        ...emptyUsage(),
        inputTokens: promptTokens,
        outputTokens,
        ...(priced !== undefined ? { costEstimateUsd: priced } : {}),
      });
      beforeTurns += 1;
      beforeMs = durationMs;
    },
  });
  let planned: PlannedIntent | undefined =
    intent && PLANNED_INTENTS.has(intent.id)
      ? (intent.id as PlannedIntent)
      : undefined;
  const planTools = planned ? intentToolset(ctx, testing, { hold }) : undefined;
  if (
    intent &&
    planned === "online" &&
    !planTools?.some((tool) => tool.name === "web_search")
  ) {
    /* No SearXNG here (the Pi): the loop, with Claude's own search. */
    intent.fellBack = ONLINE_NO_SEARCH;
    planned = undefined;
  }

  const { tools, serverTools } = planned
    ? { tools: planTools!, serverTools: [] }
    : agentToolset(ctx, config.api, testing, { hold });
  const search = toolsetSearches({ tools, serverTools });
  const system = [
    agentSystemPrompt(config.api, { now: new Date(), search, hold }),
    ...(intent?.id === "organize" ? ["", ORGANIZE_NOTE] : []),
    ...(reviewed ? ["", reviewed] : []),
  ].join("\n");
  /* 46d: Claude's newer server tools, per run, on a model that takes them;
   * a local model has no server tools at all. */
  const newerTaken = takesNewerWebTools(config.model);
  const newerWebTools =
    spec.newerWebTools === true && serverTools.length > 0 && newerTaken;

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
    ...(hold ? { hold: true as const } : {}),
    ...(intent ? { intent } : {}),
  });
  if (beforeTurns > 0) {
    writer.write({
      type: "turn",
      job: jobId ?? "",
      turn: beforeTurns,
      usage: before,
      durationMs: beforeMs,
    });
  }
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
      ...(hold ? { hold: true } : {}),
      ...(intent
        ? {
            intent: intent.id,
            intentBy: intent.by,
            ...(planned ? { plan: true } : {}),
          }
        : {}),
    },
  );
  if (intent?.fellBack) job.log.warn("intent", intent.fellBack);
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
      serverTools.length === 0
        ? "ignored newerWebTools: they are Claude's server tools, and this model has none"
        : `ignored newerWebTools: ${config.model} does not take them (dynamic filtering needs Claude 4.6 or later, not Haiku); the basic web search is used`,
    );
  }

  const loop = () =>
    runAgent({
      ...(standIn?.model ? { model: standIn.model } : {}),
      system,
      prompt,
      history,
      tools,
      serverTools,
      budgets: {
        ...(spec.maxTurns ? { maxTurns: spec.maxTurns } : {}),
        ...(cost.maxCostUsd !== undefined
          ? { maxCostUsd: cost.maxCostUsd }
          : {}),
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
        } else if (event.type === "turn.end") {
          /* 48b (Db6): each turn's usage as it ends, for the live budget. */
          writer.write({
            type: "turn",
            job: jobId ?? "",
            turn: beforeTurns + event.turn,
            usage: event.usage,
            durationMs: event.durationMs,
          });
        }
      },
    });
  /* 51b: an intent's plan, in code, writing the same records. */
  const plan = async () => {
    const { runIntentPlan } = await import("./intents");
    const ran = await runIntentPlan(planned!, {
      ctx,
      prompt,
      config,
      job,
      tools,
      hold,
      chat,
      ...(local ? { numCtx: local.numCtx, think: local.think } : {}),
      ...(cost.maxCostUsd !== undefined
        ? {
            maxCostUsd: Math.max(
              0,
              cost.maxCostUsd - (before.costEstimateUsd ?? 0),
            ),
          }
        : {}),
      onMessage: (message) =>
        writer.write({ type: "message", job: jobId ?? "", message }),
      onTurn: (turn, usage, durationMs) =>
        writer.write({
          type: "turn",
          job: jobId ?? "",
          turn: beforeTurns + turn,
          usage,
          durationMs,
        }),
    });
    return { ...ran, trimmed: 0 };
  };
  const work: () => Promise<
    Pick<
      AgentResult,
      | "text"
      | "stopReason"
      | "error"
      | "usage"
      | "turns"
      | "toolCalls"
      | "trimmed"
      | "durationMs"
    > & { outcome?: IntentOutcome }
  > = planned ? plan : loop;
  /* 51a (Da2): an import a tool starts asks for this run's `num_ctx`. */
  const ran = local
    ? await withAgentModel({ model: config.model, numCtx: local.numCtx }, work)
    : await work();
  const outcome = ran.outcome;
  const result = {
    ...ran,
    usage: addUsage(before, ran.usage),
    turns: beforeTurns + ran.turns,
  };

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
    ...(hold ? { hold: true as const } : {}),
    ...(intent ? { intent } : {}),
    ...(outcome ? { outcome } : {}),
  };
}
