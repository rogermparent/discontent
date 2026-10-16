/**
 * The model client (epic 36, D1/D2): one schema-constrained chat call to
 * Ollama, an OpenAI-compatible server (llama.cpp, LM Studio, vLLM) or — 38g —
 * the Claude API (`RECIPE_LLM_API=anthropic`, the Messages API).
 *
 * Plain `fetch` and no SDK — the CLI runs under `tsx` as CommonJS and an
 * ESM-only package would not load (26-T1). Next-free and settings-free on
 * purpose: the configuration is the environment (`RECIPE_LLM_*`, D1), which
 * the editor reads from `editor/.env` and the CLI and stdio MCP load through
 * `EDITOR_ENV_KEYS` (36b). Nothing set means the feature is off — how a
 * machine with no model stays off without checking which host it is on.
 *
 * **The Claude API (38g).** On only with `RECIPE_LLM_API=anthropic` **and**
 * `RECIPE_LLM_API_KEY` (an explicit key: a shell's `ANTHROPIC_API_KEY` is
 * never read); `RECIPE_LLM_URL` defaults to `https://api.anthropic.com`. A
 * hosted API takes none of the GPU machinery — no `gpu` slot, no placement
 * check, no unload or reload (Dg3). JSON answers use the API's structured
 * outputs (`output_config.format`, Dg2); 429/529/5xx get one retry after
 * `retry-after` (Dg5). The key never leaves this module but in a request
 * header: not in a message, a step, a status or a test route (Dg6).
 */
import { jobContext, type JobRun } from "../jobs/context";
import type { StepHandle } from "../jobs/log";
import { withResource } from "../jobs/queue";

export type LlmApi = "ollama" | "openai" | "anthropic";

export interface LlmConfig {
  /** Base URL, e.g. `http://localhost:11434`. */
  url: string;
  model: string;
  api: LlmApi;
  /**
   * `RECIPE_LLM_API_KEY` (38g): the Claude API's `x-api-key`, and an
   * OpenAI-style server's `Authorization: Bearer` when set (Dg1). Never
   * shown: `publicLlmConfig` is the config as it may be shown.
   */
  apiKey?: string;
}

export const DEFAULT_LLM_MODEL = "qwen3:8b";

/** The Claude API's default model (38g); `RECIPE_LLM_MODEL` overrides it. */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5";

/** The cheaper Claude model the docs name (38g). */
export const CHEAPER_CLAUDE_MODEL = "claude-haiku-4-5";

/** `RECIPE_LLM_URL`'s default under `RECIPE_LLM_API=anthropic`. */
export const ANTHROPIC_DEFAULT_URL = "https://api.anthropic.com";

/** The Messages API version every request names. */
export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * `max_tokens` of a Claude API call (38g, Dg4): a long recipe's JSON is a
 * few thousand tokens and a four-page card's transcription less; the rest is
 * room for the adaptive thinking `claude-sonnet-5` runs by default, which
 * counts against the same limit. Hitting it is a failure, never half a JSON.
 */
export const ANTHROPIC_MAX_TOKENS = 16_000;

/** The key's variable: explicit, so a shell's `ANTHROPIC_API_KEY` is never used by accident. */
export const LLM_API_KEY_ENV = "RECIPE_LLM_API_KEY";

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

function llmApi(env: NodeJS.ProcessEnv): LlmApi {
  const api = envValue(env, "RECIPE_LLM_API")?.toLowerCase();
  return api === "openai" || api === "anthropic" ? api : "ollama";
}

/**
 * The configured model, or `undefined` when the feature is off: no
 * `RECIPE_LLM_URL` — or, for `RECIPE_LLM_API=anthropic` (38g), no
 * `RECIPE_LLM_API_KEY`, the URL defaulting to `ANTHROPIC_DEFAULT_URL`.
 * `RECIPE_LLM_API` is `ollama` unless it says `openai` or `anthropic`.
 */
export function llmConfig(
  env: NodeJS.ProcessEnv = process.env,
): LlmConfig | undefined {
  const override = env.TEST_MODE
    ? (globalThis as LlmGlobal).__discontentLlmUrlOverride
    : undefined;
  const api = llmApi(env);
  const apiKey = envValue(env, LLM_API_KEY_ENV);
  if (api === "anthropic") {
    if (!apiKey) return undefined;
    const url =
      override ?? envValue(env, "RECIPE_LLM_URL") ?? ANTHROPIC_DEFAULT_URL;
    return {
      url: url.replace(/\/+$/, ""),
      model: envValue(env, "RECIPE_LLM_MODEL") ?? DEFAULT_CLAUDE_MODEL,
      api,
      apiKey,
    };
  }
  const url = override ?? envValue(env, "RECIPE_LLM_URL");
  if (!url) return undefined;
  return {
    url: url.replace(/\/+$/, ""),
    model: envValue(env, "RECIPE_LLM_MODEL") ?? DEFAULT_LLM_MODEL,
    api,
    ...(api === "openai" && apiKey ? { apiKey } : {}),
  };
}

/** The config as it may be shown (a test route, a log): never the key, only that one is set. */
export function publicLlmConfig(
  config: LlmConfig,
): Omit<LlmConfig, "apiKey"> & { apiKey?: "set" } {
  const { apiKey, ...shown } = config;
  return { ...shown, ...(apiKey ? { apiKey: "set" as const } : {}) };
}

/** `RECIPE_LLM_API=anthropic` with no key: off, and the Settings line says so. */
export const CLAUDE_NO_KEY_MESSAGE = `the Claude API is off: RECIPE_LLM_API=anthropic needs ${LLM_API_KEY_ENV}`;

/** A call's failure with nothing configured: why, for this environment. */
export function llmUnconfiguredMessage(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return llmApi(env) === "anthropic" && !envValue(env, LLM_API_KEY_ENV)
    ? CLAUDE_NO_KEY_MESSAGE
    : LLM_UNCONFIGURED_MESSAGE;
}

/**
 * Who answered, for a message (38g): "the local model at <url>", or "the
 * Claude API (claude-sonnet-5)" — "at <url>" added only when it is not the
 * default. The URL is always `displayUrl`'s.
 */
export function modelLabel(config: LlmConfig): string {
  if (config.api === "anthropic") {
    const url = config.url.replace(/\/+$/, "");
    return `the Claude API (${config.model})${url === ANTHROPIC_DEFAULT_URL ? "" : ` at ${displayUrl(url)}`}`;
  }
  return `the local model at ${displayUrl(config.url)}`;
}

/** A request's headers: the key as its API takes it, when there is one. */
function requestHeaders(
  config: LlmConfig,
  { json = true }: { json?: boolean } = {},
): Record<string, string> {
  const headers: Record<string, string> = json
    ? { "content-type": "application/json" }
    : {};
  if (config.api === "anthropic") {
    if (config.apiKey) headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = ANTHROPIC_VERSION;
  } else if (config.api === "openai" && config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

/** A server's words with the key taken out, should it ever echo it (Dg6). */
function withoutKey(text: string, config: LlmConfig): string {
  return config.apiKey ? text.split(config.apiKey).join("[redacted]") : text;
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
  /** The server refused the API key (38g): a 401 or 403. */
  keyRefused?: boolean;
}

/**
 * Is the model server up, and does it have the model? One `GET` of its model
 * list — Ollama's `/api/tags`, OpenAI's `/v1/models` — with a short timeout:
 * the Settings page's "Local model" line (36b). The Claude API (38g) is asked
 * for the one model, `/v1/models/{model}`, with the key: 200 is the model
 * there, 404 a model it does not know, 401/403 a refused key. Never throws.
 */
export async function llmStatus(
  config: LlmConfig,
  timeoutMs = LLM_STATUS_TIMEOUT_MS,
): Promise<LlmStatus> {
  const url = config.url.replace(/\/+$/, "");
  const listUrl =
    config.api === "anthropic"
      ? `${url}/v1/models/${encodeURIComponent(config.model)}`
      : config.api === "ollama"
        ? `${url}/api/tags`
        : /\/v1$/.test(url)
          ? `${url}/models`
          : `${url}/v1/models`;
  try {
    const response = await fetch(listUrl, {
      headers: requestHeaders(config, { json: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 403) {
      return {
        reachable: false,
        keyRefused: true,
        error: `the API key was refused (${response.status})`,
      };
    }
    if (config.api === "anthropic") {
      if (response.status === 404) {
        return { reachable: true, modelAvailable: false };
      }
      return response.ok
        ? { reachable: true, modelAvailable: true }
        : { reachable: false, error: `answered ${response.status}` };
    }
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
          : withoutKey((error as Error)?.message ?? String(error), config),
    };
  }
}

export type LlmErrorKind =
  | "unconfigured"
  | "unreachable"
  | "timeout"
  | "http"
  | "bad_json"
  /** The server answered, and the answer is a failure (38e): an `error`, or no answer. */
  | "model";

/** Every failure of a model call, by kind; the message is for people. */
export class LlmError extends Error {
  /** A timeout's placement reading, when one was taken (D6, 37b). */
  gpu?: number;
  /**
   * The model's runner failed (38-Te5): an `error` from the server, or an
   * empty `done: false` answer. Ollama keeps such a runner broken until the
   * model is unloaded, so `chat()` unloads it before this is reported.
   */
  runnerFailed?: boolean;

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

/** A picture sent with the user's message (38e): its bytes and media type. */
export interface ChatImage {
  bytes: Buffer;
  /** `image/jpeg` or `image/png`: the `data:` URL's type (OpenAI), the `media_type` (Claude). */
  type: string;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  /** The JSON Schema the answer must match (Ollama `format`, OpenAI `response_format`, Claude `output_config.format`). */
  schema: Record<string, unknown>;
  /** The schema's name, for the OpenAI shape. */
  schemaName?: string;
  /**
   * Pictures for a vision model (38e), in order: Ollama's `images` (base64)
   * on the user message, or OpenAI-style `image_url` parts (`data:` URLs).
   */
  images?: ChatImage[];
  /**
   * Unload the model once it has answered (38e): `POST /api/generate
   * {model, keep_alive: 0}` — an `llm.unload` step — after the placement
   * reading, still holding the `gpu` slot, so the next call's model never
   * shares the GPU with this one. Ollama only.
   */
  unload?: boolean;
  /**
   * Unload the model when this call fails (38e): a transcription's vision
   * model is not wanted after a failed page, cancelled or not. A runner
   * failure (`LlmError.runnerFailed`) unloads whatever this says.
   */
  unloadOnError?: boolean;
  /** Defaults to `llmConfig()`. */
  config?: LlmConfig;
  timeoutMs?: number;
  /** Ollama's `num_ctx`. */
  numCtx?: number;
  /** The caller's abort; default the job's. */
  signal?: AbortSignal;
  /**
   * The job this call runs in (epic 37): its signal (when `signal` is not
   * given) and, from 37b, its tier for the `gpu` queue.
   */
  job?: JobRun;
  /**
   * The job step this call runs in (epic 37): the call hands it its token
   * counts and rates, and — with Ollama, in a job — the model's GPU share
   * (`checkPlacement`, D6).
   */
  step?: StepHandle;
}

/**
 * A call whose answer is free text (38e, `chatText`): no schema. A
 * transcription is text, and JSON mode would have the model escape every
 * line of it inside one string.
 */
export type ChatTextRequest = Omit<ChatJsonRequest, "schema" | "schemaName">;

/** Either kind of call, as the transport sees it. */
type ChatRequest = ChatTextRequest &
  Partial<Pick<ChatJsonRequest, "schema" | "schemaName">>;

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

/**
 * A request as the server takes it. `schema` undefined is `chatText`'s
 * free answer (38e): no `format` / `response_format` at all.
 */
function requestBody(request: ChatRequest, config: LlmConfig) {
  const images = request.images ?? [];
  if (config.api === "ollama") {
    return {
      model: config.model,
      messages: [
        { role: "system", content: request.system },
        {
          role: "user",
          content: request.user,
          ...(images.length > 0
            ? { images: images.map((image) => image.bytes.toString("base64")) }
            : {}),
        },
      ],
      ...(request.schema ? { format: request.schema } : {}),
      stream: false,
      think: false,
      keep_alive: LLM_KEEP_ALIVE,
      options: { num_ctx: request.numCtx ?? LLM_NUM_CTX, temperature: 0 },
    };
  }
  return {
    model: config.model,
    messages: [
      { role: "system", content: request.system },
      {
        role: "user",
        content:
          images.length > 0
            ? [
                { type: "text", text: request.user },
                ...images.map((image) => ({
                  type: "image_url",
                  image_url: {
                    url: `data:${image.type};base64,${image.bytes.toString("base64")}`,
                  },
                })),
              ]
            : request.user,
      },
    ],
    temperature: 0,
    ...(request.schema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.schemaName ?? "answer",
              schema: request.schema,
            },
          },
        }
      : {}),
  };
}

/**
 * The answer's text as JSON. A thinking model served without `think: false`
 * may lead with a `<think>…</think>` block, and some servers wrap the object
 * in a code fence: both are stripped first.
 */
export function parseJsonAnswer(
  content: string,
  /** Who answered, for the message (`modelLabel`'s noun). */
  who = "the local model",
): unknown {
  const text = content
    .replace(/^\s*<think>[\s\S]*?<\/think>/, "")
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError(
      "bad_json",
      `${who}'s answer is not JSON: ${text.slice(0, 120)}`,
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
 *
 * **The `gpu` queue (37b, D4).** Every call holds the machine's one `gpu`
 * slot, in its job's tier (`interactive` outside a job), so the editor, the
 * CLI and the MCP server never ask the model at once; a wait is a
 * `queue.wait` step, and the caller's signal ends it. A call made while its
 * caller already holds `gpu` passes through (`withResource`).
 *
 * **D6's reload (36-T58, automated).** When this call's grant ran the
 * acquire hook and the model is still partly on the CPU afterwards — the
 * placement check, after the answer or after a timeout — Ollama is told to
 * unload it (`POST /api/generate {model, keep_alive: 0}`, an `llm.reload`
 * step) and the call is made once more, now that the GPU is free. Once:
 * never a loop. The first reading is not surfaced; the retry's is.
 */
export async function chatJson(
  request: ChatJsonRequest,
): Promise<ChatJsonResult> {
  const { content, ...result } = await chat(request);
  const config = request.config ?? llmConfig();
  return {
    ...result,
    data: parseJsonAnswer(
      content,
      config?.api === "anthropic" ? modelLabel(config) : undefined,
    ),
  };
}

/** What `chatText` answers: `chatJson`'s numbers, and the answer as text. */
export interface ChatTextResult extends Omit<ChatJsonResult, "data"> {
  /** The answer, a leading `<think>` block and outer whitespace removed. */
  text: string;
}

/**
 * `chatJson` without a schema (38e, De2): the answer is free text — a
 * vision model's transcription of a photo. The same transport, `gpu` slot,
 * D6 reload and placement check; `images` and `unload` as `chatJson` takes
 * them. Throws `LlmError` as `chatJson` does (`bad_json` only for a reply
 * that is not a JSON object, or carries no message).
 */
export async function chatText(
  request: ChatTextRequest,
): Promise<ChatTextResult> {
  const { content, ...result } = await chat(request);
  return {
    ...result,
    text: content.replace(/^\s*<think>[\s\S]*?<\/think>/, "").trim(),
  };
}

/** One call, either kind: the queue, D6's reload, and `unload`. */
async function chat(
  request: ChatRequest,
): Promise<Omit<ChatJsonResult, "data"> & { content: string }> {
  const config = request.config ?? llmConfig();
  if (!config) throw new LlmError("unconfigured", llmUnconfiguredMessage());
  const job = jobContext(request.job);
  const signal = request.signal ?? job.signal;
  /* 38g (Dg3): a hosted API holds no `gpu` slot, and has no placement to
   * read nor a model to unload or reload. */
  if (config.api === "anthropic") return callClaude(request, config, signal);
  return withResource(
    "gpu",
    { ...job, ...(signal ? { signal } : {}) },
    async (grant) => {
      const step = request.step;
      const reloadable =
        grant.hookRan && config.api === "ollama" && !!step?.log.live;
      /* Why the model is unloaded at the end, if it is. */
      let unloadReason: string | undefined = request.unload
        ? "done"
        : undefined;
      try {
        let reading: number;
        try {
          const first = await callModel(request, config, signal, !reloadable);
          if (!reloadable || first.gpu === undefined || first.gpu >= 100) {
            return first.result;
          }
          reading = first.gpu;
        } catch (error) {
          if (
            !reloadable ||
            !(error instanceof LlmError) ||
            error.kind !== "timeout" ||
            error.gpu === undefined ||
            error.gpu >= 100
          ) {
            throw error;
          }
          reading = error.gpu;
        }
        await reloadModel(config, step!, reading, signal);
        return (await callModel(request, config, signal, true)).result;
      } catch (error) {
        if (error instanceof LlmError && error.runnerFailed) {
          unloadReason = "runner failed";
        } else if (request.unload || request.unloadOnError) {
          unloadReason = signal?.aborted ? "cancelled" : "failed";
        }
        throw error;
      } finally {
        /*
         * 38e: still holding `gpu`, so no other call's model loads beside
         * it — after a cancel too (the unload has its own timeout), and
         * after a runner failure, which Ollama keeps broken until the model
         * is unloaded (38-Te5). Ollama only: an OpenAI-style server is never
         * unloaded (38-Te7).
         */
        if (unloadReason && config.api === "ollama") {
          await unloadModel(config, step, unloadReason);
        }
      }
    },
  );
}

/** How long `unload`'s request may take. */
export const UNLOAD_TIMEOUT_MS = 30_000;

/**
 * Unload a model now (38e): `POST /api/generate {model, keep_alive: 0}`,
 * the request `ollama stop` makes. An `llm.unload` step in a job; a failure
 * is the step's, never the call's — the next model's load evicts it anyway,
 * only later.
 */
export async function unloadModel(
  config: LlmConfig,
  step?: StepHandle,
  /** Why (the step's `reason`): "done", "failed", "cancelled", "runner failed". */
  reason?: string,
): Promise<void> {
  const run = async (unload?: StepHandle) => {
    try {
      const response = await fetch(`${config.url}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: config.model, keep_alive: 0 }),
        signal: AbortSignal.timeout(UNLOAD_TIMEOUT_MS),
      });
      unload?.set({ status: response.status });
      if (!response.ok)
        unload?.fail(`/api/generate answered ${response.status}`);
    } catch (error) {
      unload?.fail(
        `could not unload the model: ${(error as Error)?.message ?? error}`,
      );
    }
  };
  if (!step) return run();
  await step.log.step(
    "llm.unload",
    { model: config.model, ...(reason ? { reason } : {}) },
    run,
  );
}

/** One request to the model server, and — in a job — where the model sat. */
async function callModel(
  request: ChatRequest,
  config: LlmConfig,
  callerSignal: AbortSignal | undefined,
  surface: boolean,
): Promise<{
  result: Omit<ChatJsonResult, "data"> & { content: string };
  gpu?: number;
}> {
  const timeoutMs = request.timeoutMs ?? LLM_TIMEOUT_MS;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeout])
    : timeout;
  const started = Date.now();
  const placed = !!request.step?.log.live && config.api === "ollama";

  let response: Response;
  let body: Record<string, unknown>;
  try {
    response = await fetch(endpoint(config), {
      method: "POST",
      headers: requestHeaders(config),
      body: JSON.stringify(requestBody(request, config)),
      signal,
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      const said = serverError(raw);
      const detail = said ?? raw;
      const failed = new LlmError(
        "http",
        `${modelLabel(config)} answered ${response.status}${detail ? `: ${capped(withoutKey(detail, config))}` : ""}`,
        response.status,
      );
      /* Ollama answers 500 `{"error": …}` when the model's runner died
       * (38-Te5); a proxy's own 5xx page is not that. */
      if (config.api === "ollama" && response.status >= 500 && said) {
        failed.runnerFailed = true;
      }
      throw failed;
    }
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LlmError(
        "bad_json",
        `${modelLabel(config)} sent a response that is not a JSON object`,
      );
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    /* The caller's own abort is theirs to report, not our timeout. */
    if (callerSignal?.aborted) throw error;
    if (isTimeout(error) || timeout.aborted) {
      /* A timeout is when a CPU-resident model shows (36-T58): say so. */
      const gpu = placed
        ? await checkPlacement(config, request.step!, { surface })
        : undefined;
      const timedOut = new LlmError(
        "timeout",
        `${modelLabel(config)} did not answer within ${Math.round(timeoutMs / 1000)} s`,
      );
      if (gpu !== undefined) timedOut.gpu = gpu;
      throw timedOut;
    }
    if (error instanceof SyntaxError) {
      throw new LlmError(
        "bad_json",
        `${modelLabel(config)} sent a response that is not JSON`,
      );
    }
    throw new LlmError(
      "unreachable",
      `${modelLabel(config)} is unreachable: ${withoutKey(String((error as Error)?.message ?? error), config)}`,
    );
  }

  /* 38-Te5: a failure answered as a body — never "the model read nothing". */
  const failure = answeredFailure(body, config);
  if (failure) throw failure;
  const { content, data: _unparsed, ...stats } = readResponse(body, config.api);
  void _unparsed;
  const durationMs = Date.now() - started;
  let gpu: number | undefined;
  if (request.step) {
    request.step.set(callStats({ ...stats, durationMs, model: config.model }));
    if (placed) gpu = await checkPlacement(config, request.step, { surface });
  }
  if (typeof content !== "string") {
    throw new LlmError(
      "bad_json",
      "the local model's response carries no message content",
    );
  }
  return {
    result: {
      ...stats,
      content,
      model: config.model,
      durationMs,
    },
    ...(gpu !== undefined ? { gpu } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* The Claude API (38g)                                                */
/* ------------------------------------------------------------------ */

/** Keywords structured outputs do not take (Dg2); none of ours uses them. */
const CLAUDE_UNSUPPORTED_SCHEMA_KEYS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "maxItems",
];

/**
 * A schema as structured outputs take it (Dg2): every object closed
 * (`additionalProperties: false`, which the API requires), the numeric and
 * length constraints it does not take dropped — the answer is checked by
 * its reader anyway (`chatJson`'s data is "still unchecked"). The root
 * must be an object: all three of ours are (`LLM_RECIPE_SCHEMA`,
 * `LLM_LIST_SCHEMA`, `LLM_ONE_DISH_SCHEMA`), so a schema that is not is a
 * programming error, not a reason to wrap.
 */
export function claudeSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (schema.type !== "object") {
    throw new Error(
      "the Claude API's structured outputs need a schema whose root is an object",
    );
  }
  const close = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(close);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (CLAUDE_UNSUPPORTED_SCHEMA_KEYS.includes(key)) continue;
      if (key === "minItems" && typeof value === "number" && value > 1) {
        continue;
      }
      out[key] =
        key === "properties" || key === "$defs" || key === "definitions"
          ? Object.fromEntries(
              Object.entries(value as Record<string, unknown>).map(
                ([name, entry]) => [name, close(entry)],
              ),
            )
          : key === "items" || key === "anyOf" || key === "allOf"
            ? close(value)
            : value;
    }
    if (out.type === "object") out.additionalProperties = false;
    return out;
  };
  return close(schema) as Record<string, unknown>;
}

/**
 * A Messages API request: a top-level `system`, the pictures as base64
 * `image` blocks before the text, `max_tokens`, and — for `chatJson` —
 * structured outputs (`output_config.format`, Dg2). No `temperature`
 * (`claude-sonnet-5` refuses sampling parameters with a 400, Tg1) and no
 * `thinking` (each model's own default).
 */
export function claudeRequestBody(request: ChatRequest, config: LlmConfig) {
  const images = request.images ?? [];
  return {
    model: config.model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    system: request.system,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((image) => ({
            type: "image",
            source: {
              type: "base64",
              media_type: image.type,
              data: image.bytes.toString("base64"),
            },
          })),
          { type: "text", text: request.user },
        ],
      },
    ],
    ...(request.schema
      ? {
          output_config: {
            format: {
              type: "json_schema",
              schema: claudeSchema(request.schema),
            },
          },
        }
      : {}),
  };
}

/** The longest `retry-after` the one retry waits (Dg5). */
export const CLAUDE_RETRY_MAX_MS = 30_000;

/** The wait when a retryable answer names none. */
export const CLAUDE_RETRY_DEFAULT_MS = 5_000;

/** 429 (rate limit), 529 (overloaded) and any other 5xx: worth one retry. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** `retry-after` (seconds, or an HTTP date) as milliseconds, capped. */
export function retryDelayMs(header: string | null, now = Date.now()): number {
  if (!header?.trim()) return CLAUDE_RETRY_DEFAULT_MS;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - now;
  if (!Number.isFinite(ms)) return CLAUDE_RETRY_DEFAULT_MS;
  return Math.min(CLAUDE_RETRY_MAX_MS, Math.max(0, Math.round(ms)));
}

/** Wait `ms`, or reject with the signal's reason when it aborts first. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/**
 * One Claude API call (38g): `POST {url}/v1/messages`, no `gpu` slot (Dg3).
 * A 429/529/5xx is asked once more after its `retry-after` (≤ 30 s, else
 * 5 s), an `llm.retry` note in the step (Dg5). A 401/403 is the key refused
 * — never the key; `stop_reason: "max_tokens"` is an answer cut off and
 * `"refusal"` one declined, both `model` failures; an `{type: "error"}`
 * body is surfaced by its message, capped. The text is the concatenated
 * `text` blocks; `usage` goes to the step as the other styles' counts do.
 */
async function callClaude(
  request: ChatRequest,
  config: LlmConfig,
  callerSignal: AbortSignal | undefined,
): Promise<Omit<ChatJsonResult, "data"> & { content: string }> {
  const who = modelLabel(config);
  const url = `${config.url.replace(/\/+$/, "")}/v1/messages`;
  const payload = JSON.stringify(claudeRequestBody(request, config));
  const timeoutMs = request.timeoutMs ?? LLM_TIMEOUT_MS;
  const started = Date.now();
  let body: Record<string, unknown> | undefined;
  for (let attempt = 1; !body; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeout])
      : timeout;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: requestHeaders(config),
        body: payload,
        signal,
      });
      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        const said = serverError(raw);
        if (attempt === 1 && retryable(response.status)) {
          const waitMs = retryDelayMs(response.headers.get("retry-after"));
          request.step?.log.info(
            "llm.retry",
            `${who} answered ${response.status} — asking once more in ${Math.round(waitMs / 1000)} s`,
            { status: response.status, waitMs },
          );
          await pause(waitMs, callerSignal);
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          throw new LlmError(
            "http",
            `${who} refused the API key (${LLM_API_KEY_ENV}): ${response.status}${said ? ` — ${capped(withoutKey(said, config))}` : ""}`,
            response.status,
          );
        }
        const detail = said ?? raw;
        throw new LlmError(
          "http",
          `${who} answered ${response.status}${detail ? `: ${capped(withoutKey(detail, config))}` : ""}`,
          response.status,
        );
      }
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new LlmError(
          "bad_json",
          `${who} sent a response that is not a JSON object`,
        );
      }
      body = parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (callerSignal?.aborted) throw error;
      if (isTimeout(error) || timeout.aborted) {
        throw new LlmError(
          "timeout",
          `${who} did not answer within ${Math.round(timeoutMs / 1000)} s`,
        );
      }
      if (error instanceof SyntaxError) {
        throw new LlmError(
          "bad_json",
          `${who} sent a response that is not JSON`,
        );
      }
      throw new LlmError(
        "unreachable",
        `${who} is unreachable: ${withoutKey(String((error as Error)?.message ?? error), config)}`,
      );
    }
  }

  if (body.type === "error") {
    const said = errorText(body.error) ?? JSON.stringify(body.error ?? body);
    throw new LlmError(
      "model",
      `${who} failed: ${capped(withoutKey(said, config))}`,
    );
  }
  const usage = body.usage as
    | { input_tokens?: unknown; output_tokens?: unknown }
    | undefined;
  const stats = {
    promptTokens: count(usage?.input_tokens),
    outputTokens: count(usage?.output_tokens),
  };
  const durationMs = Date.now() - started;
  request.step?.set(callStats({ ...stats, durationMs, model: config.model }));
  const stop = body.stop_reason;
  if (stop === "max_tokens") {
    throw new LlmError(
      "model",
      `${who}'s answer was cut off: it reached max_tokens (${ANTHROPIC_MAX_TOKENS}) before it finished`,
    );
  }
  if (stop === "refusal") {
    throw new LlmError("model", `${who} declined to answer (a refusal)`);
  }
  const blocks = Array.isArray(body.content)
    ? (body.content as { type?: unknown; text?: unknown }[])
    : [];
  const content = blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
  if (!content.trim()) {
    throw new LlmError(
      "bad_json",
      `${who}'s response carries no text${typeof stop === "string" ? ` (stop_reason: ${stop})` : ""}`,
    );
  }
  return { ...stats, content, model: config.model, durationMs };
}

/** A server's text in a message: capped, as 37-D2 caps an excerpt. */
export const SERVER_ERROR_CHARS = 200;

function capped(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SERVER_ERROR_CHARS
    ? `${flat.slice(0, SERVER_ERROR_CHARS)}…`
    : flat;
}

/** `{"error": "…"}`'s text (Ollama's and OpenAI's shapes), if the body is one. */
function serverError(raw: string): string | undefined {
  try {
    return errorText((JSON.parse(raw) as { error?: unknown }).error);
  } catch {
    return undefined;
  }
}

function errorText(error: unknown): string | undefined {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return undefined;
}

/**
 * A 2xx answer that is a failure (38-Te5): an `error` in the body, or —
 * Ollama, after its runner crashed — `done: false` with an empty message,
 * which every later request gets at once until the model is unloaded. Both
 * are `runnerFailed`, so `chat()` unloads the model before reporting.
 */
function answeredFailure(
  body: Record<string, unknown>,
  config: LlmConfig,
): LlmError | undefined {
  const where = `the local model ${config.model} at ${displayUrl(config.url)}`;
  const error = errorText(body.error);
  if (error) {
    const failed = new LlmError("model", `${where} failed: ${capped(error)}`);
    failed.runnerFailed = config.api === "ollama";
    return failed;
  }
  if (config.api !== "ollama" || body.done !== false) return undefined;
  const content = (body.message as { content?: unknown } | undefined)?.content;
  if (typeof content === "string" && content.trim()) return undefined;
  const failed = new LlmError(
    "model",
    `${where} stopped without an answer (done: false, an empty message) — its runner has likely crashed: ${capped(JSON.stringify(body))}`,
  );
  failed.runnerFailed = true;
  return failed;
}

/** How long `ollama stop`'s request may take. */
export const RELOAD_TIMEOUT_MS = 30_000;

/**
 * D6's fix for a model loaded while another program held VRAM: unload it
 * (`ollama stop`'s request), so the next call loads it onto the GPU the
 * acquire hook just freed. An `llm.reload` step; a failure is noted there
 * and the call is still retried once.
 */
async function reloadModel(
  config: LlmConfig,
  step: StepHandle,
  gpu: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  const { log } = step;
  step.set({ reloaded: true, firstGpu: gpu });
  await log.step("llm.reload", { model: config.model, gpu }, async (reload) => {
    const timeout = AbortSignal.timeout(RELOAD_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.url}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: config.model, keep_alive: 0 }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      reload.set({ status: response.status });
      if (!response.ok) {
        reload.fail(`/api/generate answered ${response.status}`);
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      reload.fail(
        `could not stop the model: ${(error as Error)?.message ?? error}`,
      );
    }
  });
  log.info(
    "llm.reload",
    `${gpu}% GPU after the acquire hook — stopped ${config.model}; asking once more`,
  );
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

/** The kind D6's placement warning is surfaced under: one per job, the latest. */
export const PLACEMENT_WARNING_KIND = "llm.placement";

/**
 * Whether `/api/ps`'s `name` is the configured model, the way Ollama
 * resolves a name: no tag means `:latest` (`qwen3` is `qwen3:latest`).
 */
export function sameOllamaModel(listed: string | undefined, wanted: string) {
  if (!listed) return false;
  /* The tag is after the last `/` (a registry host may carry a port). */
  const full = (name: string) =>
    (name.slice(name.lastIndexOf("/") + 1).includes(":")
      ? name
      : `${name}:latest`
    ).toLowerCase();
  return full(listed) === full(wanted);
}

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
 *
 * Answers the reading (undefined when there is none). `surface: false`
 * (37b): only the step's `gpu` — `chatJson` is about to reload the model
 * and ask again, and the retry's reading is the one that counts.
 */
export async function checkPlacement(
  config: LlmConfig,
  step: StepHandle,
  { surface = true }: { surface?: boolean } = {},
): Promise<number | undefined> {
  const { log } = step;
  try {
    const response = await fetch(`${config.url}/api/ps`, {
      signal: AbortSignal.timeout(PLACEMENT_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.info("llm.placement", `/api/ps answered ${response.status}`);
      return undefined;
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
      (model) =>
        sameOllamaModel(model.name, config.model) ||
        sameOllamaModel(model.model, config.model),
    );
    if (!entry || !entry.size || typeof entry.size_vram !== "number") {
      log.info("llm.placement", `/api/ps does not list ${config.model}`);
      return undefined;
    }
    const gpu = Math.floor((entry.size_vram / entry.size) * 100);
    step.set({ gpu });
    if (gpu < 100 && surface) {
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
      /* One result warning however many calls ran: the latest reading. */
      log.surface(placementWarning(config.model, gpu), PLACEMENT_WARNING_KIND);
    }
    return gpu;
  } catch (error) {
    log.info(
      "llm.placement",
      `could not read /api/ps: ${(error as Error)?.message ?? error}`,
    );
    return undefined;
  }
}
