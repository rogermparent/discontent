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
 *   SearXNG's `web_search` when `RECIPE_SEARCH_URL` is set.
 *
 * What the job answers (its meta's `result`) is small — the final text, how
 * it stopped, the usage and counts — never the transcript.
 */
import { createLocalBackend } from "../../cli/backend/local";
import type { CurationContext } from "../curation/context";
import { UsageError } from "../curation/errors";
import type { JobContext } from "../jobs/context";
import { llmConfig, type LlmApi } from "../llm/client";
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
 * The tools a run offers its model, and Claude's server tools: E6's split
 * (above). `RECIPE_SEARCH_URL` decides a local model's `web_search`.
 */
export function agentToolset(
  ctx: CurationContext,
  api: LlmApi,
): { tools: ReturnType<typeof agentTools>; serverTools: ServerTool[] } {
  /* In-process, as MCP over HTTP (23e/D25): no stale hint, no close. */
  const backend = createLocalBackend({ ...ctx, inProcess: true });
  if (api === "anthropic") {
    return {
      tools: agentTools(backend, { webSearch: false }),
      serverTools: [{ kind: "web_search", maxUses: AGENT_WEB_SEARCH_MAX_USES }],
    };
  }
  return {
    tools: agentTools(backend, { only: LOCAL_AGENT_TOOLS }),
    serverTools: [],
  };
}

/** Run one agent job. Never throws for the model's failure: the result says how it ended. */
export async function runAgentJob(
  spec: AgentJobSpec,
  { ctx, job, dir }: { ctx: CurationContext; job: JobContext; dir: string },
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

  const { tools, serverTools } = agentToolset(ctx, config.api);
  const search =
    serverTools.some((tool) => tool.kind === "web_search") ||
    tools.some((tool) => tool.name === "web_search");
  const now = new Date();
  const system =
    config.api === "anthropic"
      ? claudeSystemPrompt({ now, search })
      : localSystemPrompt({ now, search });

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
  });
  job.log.info(
    "agent.start",
    `${config.api === "anthropic" ? "Claude API" : "local model"} ${config.model}: ${tools.length} tools${serverTools.length ? ` + server ${serverTools.map((tool) => tool.kind).join(", ")}` : ""}`,
    {
      model: config.model,
      api: config.api,
      tools: tools.length,
      ...(spec.continues ? { continues: spec.continues } : {}),
    },
  );

  const result = await runAgent({
    system,
    prompt,
    history,
    tools,
    serverTools,
    budgets: spec.maxTurns ? { maxTurns: spec.maxTurns } : {},
    config,
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

  writer.write({
    type: "end",
    job: jobId ?? "",
    stop: result.stopReason,
    ...(result.error ? { error: result.error } : {}),
    usage: result.usage,
    ...(result.usage.costEstimateUsd !== undefined
      ? { costEstimate: result.usage.costEstimateUsd }
      : {}),
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
  };
}
