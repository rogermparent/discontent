/**
 * The local-model client (epic 36, D1/D2): one schema-constrained chat call
 * to Ollama or an OpenAI-compatible server (llama.cpp, LM Studio, vLLM).
 *
 * Plain `fetch` and no SDK — the CLI runs under `tsx` as CommonJS and an
 * ESM-only package would not load (26-T1). Next-free and settings-free on
 * purpose: the configuration is the environment (`RECIPE_LLM_*`, D1), which
 * the editor reads from `editor/.env` and the CLI and stdio MCP load through
 * `EDITOR_ENV_KEYS` (36b). Nothing set means the feature is off — how the Pi,
 * which has no model, stays off without checking which host it is on.
 */
import type { StepHandle } from "../jobs/log";

export type LlmApi = "ollama" | "openai";

export interface LlmConfig {
  /** Base URL, e.g. `http://localhost:11434`. */
  url: string;
  model: string;
  api: LlmApi;
}

export const DEFAULT_LLM_MODEL = "qwen3:8b";

/** Context window asked of Ollama: fits 8 GB of VRAM with qwen3:8b (D6). */
export const LLM_NUM_CTX = 12_288;

/** How long a call may take, model load included (D6). */
export const LLM_TIMEOUT_MS = 180_000;

/** How long Ollama keeps the model loaded after a call. */
export const LLM_KEEP_ALIVE = "10m";

/** `""` is unset, as `envValue` in `cli/backend/resolve.ts` reads it (T27). */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

interface LlmGlobal {
  __discontentLlmUrlOverride?: string;
}

/**
 * Test-only (36e), as `setEditorRoleOverride` is for the role: under
 * `TEST_MODE`, `/settings/test-llm?url=…` points this server process at a
 * stand-in model for one Playwright spec — the suite pins `RECIPE_LLM_URL`
 * empty (T18), and a several-recipe import only exists with a model. On
 * `globalThis` because a route handler and a page are separate bundles.
 * `undefined` clears it.
 */
export function setLlmUrlOverride(url: string | undefined): void {
  (globalThis as LlmGlobal).__discontentLlmUrlOverride = url || undefined;
}

/**
 * The configured model, or `undefined` when `RECIPE_LLM_URL` is unset — the
 * feature is off. `RECIPE_LLM_API` is `ollama` unless it says `openai`.
 */
export function llmConfig(
  env: NodeJS.ProcessEnv = process.env,
): LlmConfig | undefined {
  const override = env.TEST_MODE
    ? (globalThis as LlmGlobal).__discontentLlmUrlOverride
    : undefined;
  const url = override ?? envValue(env, "RECIPE_LLM_URL");
  if (!url) return undefined;
  const api = envValue(env, "RECIPE_LLM_API")?.toLowerCase();
  return {
    url: url.replace(/\/+$/, ""),
    model: envValue(env, "RECIPE_LLM_MODEL") ?? DEFAULT_LLM_MODEL,
    api: api === "openai" ? "openai" : "ollama",
  };
}

/**
 * The model server's URL as it is safe to show: no `user:password@`, no
 * query (an API key in `?key=`), no fragment. Error messages and the
 * Settings page use it; requests use the URL as configured (36b review).
 */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return url
      .replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]*@/i, "$1")
      .split(/[?#]/)[0];
  }
}

/** How long the Settings page waits for the model server (36b). */
export const LLM_STATUS_TIMEOUT_MS = 2_000;

export interface LlmStatus {
  /** The server answered its model list. */
  reachable: boolean;
  /** The configured model is in that list; unknown when it has none. */
  modelAvailable?: boolean;
  /** Why it is not reachable. */
  error?: string;
}

/**
 * Is the model server up, and does it have the model? One `GET` of its model
 * list — Ollama's `/api/tags`, OpenAI's `/v1/models` — with a short timeout:
 * the Settings page's "Local model" line (36b). Never throws.
 */
export async function llmStatus(
  config: LlmConfig,
  timeoutMs = LLM_STATUS_TIMEOUT_MS,
): Promise<LlmStatus> {
  const url = config.url.replace(/\/+$/, "");
  const listUrl =
    config.api === "ollama"
      ? `${url}/api/tags`
      : /\/v1$/.test(url)
        ? `${url}/models`
        : `${url}/v1/models`;
  try {
    const response = await fetch(listUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { reachable: false, error: `answered ${response.status}` };
    }
    const body = (await response.json().catch(() => undefined)) as
      | {
          models?: { name?: string; model?: string }[];
          data?: { id?: string }[];
        }
      | undefined;
    const names =
      config.api === "ollama"
        ? body?.models?.flatMap((entry) => [entry.name, entry.model])
        : body?.data?.map((entry) => entry.id);
    const listed = names?.filter((name): name is string => !!name);
    return {
      reachable: true,
      ...(listed ? { modelAvailable: listed.includes(config.model) } : {}),
    };
  } catch (error) {
    return {
      reachable: false,
      error:
        isTimeout(error) || (error as Error)?.name === "AbortError"
          ? `no answer within ${Math.round(timeoutMs / 1000)} s`
          : ((error as Error)?.message ?? String(error)),
    };
  }
}

export type LlmErrorKind =
  | "unconfigured"
  | "unreachable"
  | "timeout"
  | "http"
  | "bad_json";

/** Every failure of a model call, by kind; the message is for people. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const LLM_UNCONFIGURED_MESSAGE =
  "no local model configured (RECIPE_LLM_URL)";

export interface ChatJsonRequest {
  system: string;
  user: string;
  /** The JSON Schema the answer must match (Ollama `format`, OpenAI `response_format`). */
  schema: Record<string, unknown>;
  /** The schema's name, for the OpenAI shape. */
  schemaName?: string;
  /** Defaults to `llmConfig()`. */
  config?: LlmConfig;
  timeoutMs?: number;
  /** Ollama's `num_ctx`. */
  numCtx?: number;
  signal?: AbortSignal;
  /**
   * The job step this call runs in (epic 37): the call hands it its token
   * counts and rates, and — with Ollama, in a job — the model's GPU share
   * (`checkPlacement`, D6).
   */
  step?: StepHandle;
}

export interface ChatJsonResult {
  /** The parsed answer: still unchecked against the schema. */
  data: unknown;
  model: string;
  /** Wall time of the call. */
  durationMs: number;
  /** Token counts, when the server reports them. */
  promptTokens?: number;
  outputTokens?: number;
  /** Ollama only: time spent loading the model, a cold start. */
  loadMs?: number;
  /** Ollama only: time spent reading the prompt, and writing the answer. */
  promptEvalMs?: number;
  evalMs?: number;
}

function endpoint(config: LlmConfig): string {
  const url = config.url.replace(/\/+$/, "");
  if (config.api === "ollama") return `${url}/api/chat`;
  return /\/v1$/.test(url)
    ? `${url}/chat/completions`
    : `${url}/v1/chat/completions`;
}

function requestBody(request: ChatJsonRequest, config: LlmConfig) {
  const messages = [
    { role: "system", content: request.system },
    { role: "user", content: request.user },
  ];
  if (config.api === "ollama") {
    return {
      model: config.model,
      messages,
      format: request.schema,
      stream: false,
      think: false,
      keep_alive: LLM_KEEP_ALIVE,
      options: { num_ctx: request.numCtx ?? LLM_NUM_CTX, temperature: 0 },
    };
  }
  return {
    model: config.model,
    messages,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: request.schemaName ?? "answer",
        schema: request.schema,
      },
    },
  };
}

/**
 * The answer's text as JSON. A thinking model served without `think: false`
 * may lead with a `<think>…</think>` block, and some servers wrap the object
 * in a code fence: both are stripped first.
 */
export function parseJsonAnswer(content: string): unknown {
  const text = content
    .replace(/^\s*<think>[\s\S]*?<\/think>/, "")
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError(
      "bad_json",
      `the local model's answer is not JSON: ${text.slice(0, 120)}`,
    );
  }
}

function nanosToMs(value: unknown): number | undefined {
  return typeof value === "number" ? Math.round(value / 1e6) : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** What the response says, by API shape. */
function readResponse(
  body: Record<string, unknown>,
  api: LlmApi,
): Omit<ChatJsonResult, "durationMs" | "model"> & { content: unknown } {
  if (api === "ollama") {
    const message = body.message as { content?: unknown } | undefined;
    return {
      content: message?.content,
      promptTokens: count(body.prompt_eval_count),
      outputTokens: count(body.eval_count),
      loadMs: nanosToMs(body.load_duration),
      promptEvalMs: nanosToMs(body.prompt_eval_duration),
      evalMs: nanosToMs(body.eval_duration),
      data: undefined,
    };
  }
  const choices = body.choices as
    | { message?: { content?: unknown } }[]
    | undefined;
  const usage = body.usage as
    | { prompt_tokens?: unknown; completion_tokens?: unknown }
    | undefined;
  return {
    content: choices?.[0]?.message?.content,
    promptTokens: count(usage?.prompt_tokens),
    outputTokens: count(usage?.completion_tokens),
    data: undefined,
  };
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" ||
      (error.name === "AbortError" &&
        (error.cause as Error | undefined)?.name === "TimeoutError"))
  );
}

/**
 * One chat call whose answer must match `schema`, parsed.
 *
 * Throws `LlmError`: `unconfigured` (no `RECIPE_LLM_URL`), `unreachable` (no
 * server answered), `timeout` (`LLM_TIMEOUT_MS`, model load included),
 * `http` (a non-2xx answer — a model that isn't pulled is a 404), `bad_json`.
 */
export async function chatJson(
  request: ChatJsonRequest,
): Promise<ChatJsonResult> {
  const config = request.config ?? llmConfig();
  if (!config) throw new LlmError("unconfigured", LLM_UNCONFIGURED_MESSAGE);
  const timeoutMs = request.timeoutMs ?? LLM_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = request.signal
    ? AbortSignal.any([request.signal, timeout])
    : timeout;
  const started = Date.now();

  let response: Response;
  let body: Record<string, unknown>;
  try {
    response = await fetch(endpoint(config), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody(request, config)),
      signal,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new LlmError(
        "http",
        `the local model at ${displayUrl(config.url)} answered ${response.status}${detail ? `: ${detail}` : ""}`,
        response.status,
      );
    }
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LlmError(
        "bad_json",
        `the local model at ${displayUrl(config.url)} sent a response that is not a JSON object`,
      );
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    /* The caller's own abort is theirs to report, not our timeout. */
    if (request.signal?.aborted) throw error;
    if (isTimeout(error) || timeout.aborted) {
      /* A timeout is when a CPU-resident model shows (36-T58): say so. */
      if (request.step && config.api === "ollama" && request.step.log.live) {
        await checkPlacement(config, request.step);
      }
      throw new LlmError(
        "timeout",
        `the local model at ${displayUrl(config.url)} did not answer within ${Math.round(timeoutMs / 1000)} s`,
      );
    }
    if (error instanceof SyntaxError) {
      throw new LlmError(
        "bad_json",
        `the local model at ${displayUrl(config.url)} sent a response that is not JSON`,
      );
    }
    throw new LlmError(
      "unreachable",
      `the local model at ${displayUrl(config.url)} is unreachable: ${(error as Error)?.message ?? error}`,
    );
  }

  const { content, ...stats } = readResponse(body, config.api);
  const durationMs = Date.now() - started;
  if (request.step) {
    request.step.set(callStats({ ...stats, durationMs, model: config.model }));
    if (config.api === "ollama" && request.step.log.live) {
      await checkPlacement(config, request.step);
    }
  }
  if (typeof content !== "string") {
    throw new LlmError(
      "bad_json",
      "the local model's response carries no message content",
    );
  }
  return {
    ...stats,
    data: parseJsonAnswer(content),
    model: config.model,
    durationMs,
  };
}

/**
 * A call's numbers as step data (epic 37, D3): the token counts, the load,
 * and the rate the answer was written at — Ollama's own eval time when it
 * reports one, else the wall time less the load.
 */
export function callStats(
  stats: Omit<ChatJsonResult, "data">,
): Record<string, unknown> {
  const writing =
    stats.evalMs ?? Math.max(1, stats.durationMs - (stats.loadMs ?? 0));
  return {
    model: stats.model,
    ...(stats.promptTokens !== undefined
      ? { promptTokens: stats.promptTokens }
      : {}),
    ...(stats.outputTokens !== undefined
      ? {
          outputTokens: stats.outputTokens,
          tokPerSec: Math.round((stats.outputTokens / writing) * 10_000) / 10,
        }
      : {}),
    ...(stats.promptTokens !== undefined && stats.promptEvalMs
      ? {
          promptTokPerSec: Math.round(
            (stats.promptTokens / stats.promptEvalMs) * 1000,
          ),
        }
      : {}),
    ...(stats.loadMs !== undefined ? { loadMs: stats.loadMs } : {}),
  };
}

/** How long the placement check waits for Ollama's `/api/ps`. */
export const PLACEMENT_TIMEOUT_MS = 2_000;

/** D6's warning for a model that is not wholly on the GPU. */
export function placementWarning(model: string, gpuPercent: number): string {
  return `local model ${model} ran ${gpuPercent}% on the GPU — another program holds VRAM, and the rest runs on the CPU, many times slower; run "ollama stop ${model}" once it frees`;
}

/**
 * Where the model sits after a call (epic 37, D6): Ollama's `/api/ps` lists
 * each loaded model's `size` and `size_vram`. All of it in VRAM is `gpu:
 * 100` on the step; less is an `llm.placement` warning, surfaced in the
 * job's result too (36-T58: a model loaded while another program held VRAM
 * runs on the CPU, ~20× slower, and nothing said so). Never fails the call:
 * an unreachable `/api/ps`, or a model it does not list, is a note.
 */
export async function checkPlacement(
  config: LlmConfig,
  step: StepHandle,
): Promise<void> {
  const { log } = step;
  try {
    const response = await fetch(`${config.url}/api/ps`, {
      signal: AbortSignal.timeout(PLACEMENT_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.info("llm.placement", `/api/ps answered ${response.status}`);
      return;
    }
    const body = (await response.json()) as {
      models?: {
        name?: string;
        model?: string;
        size?: number;
        size_vram?: number;
      }[];
    };
    const entry = body.models?.find(
      (model) => model.name === config.model || model.model === config.model,
    );
    if (!entry || !entry.size || typeof entry.size_vram !== "number") {
      log.info("llm.placement", `/api/ps does not list ${config.model}`);
      return;
    }
    const gpu = Math.floor((entry.size_vram / entry.size) * 100);
    step.set({ gpu });
    if (gpu < 100) {
      log.warn(
        "llm.placement",
        `${gpu}% GPU — another program holds VRAM; run "ollama stop ${config.model}" once it frees`,
        {
          model: config.model,
          gpu,
          size: entry.size,
          sizeVram: entry.size_vram,
        },
      );
      log.surface(placementWarning(config.model, gpu));
    }
  } catch (error) {
    log.info(
      "llm.placement",
      `could not read /api/ps: ${(error as Error)?.message ?? error}`,
    );
  }
}
