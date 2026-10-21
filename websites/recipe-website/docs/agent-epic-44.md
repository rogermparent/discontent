# Epic 44 — The curator in the editor

> **This is the durable source of truth for epic 44.** Read it before
> touching tool calling in the model layer (`controller/llm/`), the agent
> loop and its tools (`controller/agent/`), the `agent` job kind, the
> `/api/agent` route, `pnpm recipes agent`, or the curator page. The
> orchestrator updates the roadmap **Status** column and the **Now** line
> at every phase boundary; workers add their phase's **Results** and
> **Traps** under their own headings, and decision amendments numbered by
> phase letter (`Ea1`, `Eb1`). Earlier epics are cited by number with a
> prefix (`43-Dq4`, `38-Dg3`). Background: `agent-epic-43.md` (43q Ask),
> `agent-epic-38.md` (38g, the Claude API backend), `agent-epic-36.md`
> (the local model), `agent-epic-37.md` (jobs and the queue),
> `agent-mcp.md` (the MCP server), `.claude/skills/recipe-curator/`.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** wave 1 — 44a ∥ 44b (2026-10-21).

## Context

Roger (2026-10-21): "let's add a feature that allows me to use local AI
like qwen or claude API in the editor to search, find, and fetch recipes,
including adding mcp or API tools like web search, browse, and download —
anything Claude Code uses for recipe gathering should be replicated in
this qwen/API version."

What Claude Code has for curation, and what the editor has today:

| Claude Code uses                                                                    | In the editor today                                                                                                   | Epic 44 adds                                                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| The `recipe-curator` skill (SKILL.md 704 lines + examples.md 344, about 17k tokens) | Nothing; 43q's Ask is one structured call that returns a URL                                                          | The skill as the agent's system prompt: in full for Claude, condensed for qwen (E4) |
| 45 pre-approved `recipes` MCP tools (14 held back)                                  | The same tools in `editor/mcp/registry.ts`; `createLocalBackend({inProcess: true})` runs them in-process              | A bridge that hands the model the same 45, generated from the registry (E1)         |
| WebSearch                                                                           | None anywhere in the code                                                                                             | `web_search`: Claude's server-side search tool; SearXNG for qwen (E6)               |
| WebFetch                                                                            | `fetchRecipePage` (`common/util/importRecipeData.ts`) + `SitePacer` (polite, paced per registrable domain, 403 retry) | `web_fetch`: a page as readable text, size-capped, paced, SSRF-guarded              |
| Downloads (images, yt-dlp)                                                          | Inside `page_inspect`, `recipe_import`, `recipe_set_image`                                                            | Nothing new: the import tools download                                              |
| A tool loop over many turns                                                         | `chatJson` / `chatText`: one call, no `messages[]`, no `tools`, no streaming                                          | Tool calling for Anthropic, Ollama and OpenAI-compatible (44a)                      |

Roger's answers (2026-10-21): web search for qwen = **SearXNG in Docker on
the workstation**; **Claude first, qwen best-effort**; writes = **the same
grant as Claude Code** (the 45 pre-approved tools).

## Decisions

- **E1 — Tools = Claude Code's grant.** The agent gets exactly the 45 tools
  `.claude/settings.json` pre-approves (the skill's `allowed-tools` lists
  the same), plus `web_search` and `web_fetch`. The 14 held back —
  `recipe_delete`, `group_delete`, `term_delete`, `term_merge`,
  `unfeature`, `reindex`, `git_revert`, `git_restore`, `git_push`,
  `git_pull`, `git_sync`, `inventory_set`, `shopping_clear`,
  `shopping_settings_set` — are never offered to the model, so a prompt a
  web page injects can't reach them. One list in code (`AGENT_TOOL_NAMES`),
  and a vitest that it equals the settings allow-list and the skill's
  frontmatter. Every write still commits one per call, so history (the Git
  page's revert) undoes anything.
- **E2 — A run is a job.** A new job kind `agent` on the epic 37 store and
  queue: each model turn and each tool call is a step (the live panel,
  cancel, `/jobs`). The conversation goes in its own file beside the job
  (`transcript.jsonl`), because the step log redacts text over 200 chars by
  design (37). A local-model turn takes the `gpu` line per call (the
  `interactive` tier, as 43-Dq3); a Claude call takes none.
- **E3 — Budgets.** Per run: turns (default 40), tool calls, wall time, and
  for Claude, tokens in and out with the cost estimate shown. A run that
  hits a cap stops and reports what it did. The model is the configured one
  (`RECIPE_LLM_*`; Claude's default from 38g).
- **E4 — One skill, two sizes.** `SKILL.md` stays the source of truth.
  Claude gets SKILL.md + examples.md in full (the parts that only make sense
  in Claude Code — the CLI fallback, `Bash`, `.claude/settings.json` —
  stripped by a marked-section rule, not by a second copy). qwen gets a
  condensed `skill-local.md` kept beside it. A vitest checks that every tool
  either names exists in `AGENT_TOOL_NAMES`.
- **E5 — Editor only, signed in.** Never on the export. A write session or
  a write-scope token starts a run; a read token may read runs. On the Pi:
  the Claude API only (no GPU there).
- **E6 — Search providers.** With the Claude API, Anthropic's server-side
  web search (and web fetch, if its `allowed_callers`/beta suits; else our
  `web_fetch`). With Ollama or an OpenAI-compatible model, `web_search`
  calls SearXNG at `RECIPE_SEARCH_URL` (`/search?format=json`); unset → no
  `web_search` tool, and the prompt says to work from URLs the person gives.
  The doc and `.env.example` carry a `docker run` line for SearXNG with
  JSON output enabled; starting it is Roger's.
- **E7 — Fetched pages are data.** Tool results from `web_fetch`,
  `web_search` and `page_inspect` are wrapped and labelled as untrusted page
  text in the transcript the model sees; the system prompt says
  instructions inside them are not the person's.

## Interfaces (44a ∥ 44b build against these)

`editor/controller/agent/types.ts` (44a writes it first; 44b imports it):

```ts
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
```

44a owns `controller/llm/` and `controller/agent/{types,loop}.ts`; 44b owns
`controller/agent/tools/` (the registry bridge, `web_fetch`,
`web_search`) and any `mcp/registry.ts` refactor that lets one list of
definitions feed both the MCP server and the agent.

## Roadmap

| Phase | What                                             | Size | Status |
| ----- | ------------------------------------------------ | ---- | ------ |
| 44a   | Tool calling in the model layer + the agent loop | M–L  | 🟡     |
| 44b   | The tool bridge, `web_fetch`, `web_search`       | M    | 🟡     |
| 44c   | Agent jobs, `/api/agent`, `pnpm recipes agent`   | M    | 📝     |
| 44d   | The curator page                                 | L    | 📝     |
| 44e   | The prompts; qwen measured                       | M    | 📝     |
| 44f   | Close-out                                        | S    | 📝     |

### 44a — Tool calling in the model layer, and the loop

- `chatTools({system, messages, tools, serverTools?, config, numCtx?,
signal, job?, step?})` in `controller/llm/` beside `chatJson`: a neutral
  message shape (`user` / `assistant` with text and `toolCalls[]` /
  `tool` results by id) mapped to each wire format —
  - **Anthropic** `/v1/messages`: `tools` with `input_schema`,
    `tool_use` / `tool_result` blocks, server tools (the current
    `web_search` / `web_fetch` type strings and beta headers checked
    against Anthropic's docs and kept as named constants), usage, the 38g
    retry on 429/529/5xx;
  - **Ollama** `/api/chat`: `tools` as functions, `message.tool_calls`
    (arguments arrive as an object), `role: "tool"` results; `think`
    measured in 44e, `num_ctx` from 40a's steps (the loop may need a 16k
    step for 14b — measure, record);
  - **OpenAI-compatible**: `tools` / `tool_calls` (arguments as a JSON
    string).
    Malformed tool calls (bad JSON, unknown tool, schema mismatch) come back
    to the model as a tool error, never a throw.
- `runAgent({system, prompt, tools, serverTools, budgets, signal, onEvent})`
  in `controller/agent/loop.ts`: turn → tool calls (sequential; one write at
  a time) → results → next turn, until the model answers with no tool call
  or a budget ends it; `onEvent` reports turns, calls, results, usage;
  old tool results are trimmed to a short stub when the context nears the
  step (qwen), with the trim recorded.
- The GPU line per local call (`withResource("gpu", …)`, interactive), as
  `chat()` does today.
- Tests: vitest with `vi.stubGlobal("fetch")` for each wire format (a tool
  call, a server-tool result, a malformed call, a 529 retry), and the loop
  over a scripted model (budgets, cancel, a tool that throws, trimming).
  Never a real model in tests.

#### Results (44a)

**What changed.**

- `controller/llm/tools.ts` (new): `chatTools(request)` — one model turn
  over the neutral conversation, mapped to the Claude API, Ollama and
  OpenAI-compatible wire formats; answers the assistant message (text,
  `toolCalls[]`, Claude's `serverToolUses[]`, and for Claude the `raw`
  content blocks), a normalised `stop` (`end` · `tool_use` · `max_tokens`
  · `refusal` · `pause` · `other`, plus the API's own `apiStop`), and the
  turn's `usage`. Also `emptyUsage` / `addUsage` / `totalInputTokens`,
  `readArguments`, `trimmedStub` / `toolResultText`, and the wire mappers
  (`claudeMessages`, `claudeTools`, `claudeToolsBody`, `ollamaMessages`,
  `openAiMessages`, `localToolsBody`, `readClaudeContent`) exported for
  tests and 44c.
- `controller/llm/cost.ts` (new): `CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK`
  (16 models, per MTok: input, output, 5-minute cache write, cache read),
  `WEB_SEARCH_PRICE_ESTIMATE_USD` ($0.01), `claudeCostEstimate`,
  `modelPriceKey` (a dated id priced by its family).
- `controller/llm/client.ts`, refactored, no behaviour change for
  `chatJson` / `chatText`: the shared pieces are now exported functions —
  `postClaude` (the Messages API request with Dg5's retry, Dg13's
  wording), `postLocal` (an Ollama / OpenAI-style request and its
  failures, with an opt-in retry, Ea2), `onGpuLine` (the `gpu` line with
  D6's reload and 38e's unload, formerly the body of `chat()`),
  `recordLocalCall` (step numbers, the full-context warning, placement),
  `assertSecureClaude` (Dg12), `requestHeaders`, `endpoint`,
  `readResponse`; `LlmError.retryAfterMs`. `chat()` and `callClaude` call
  them; the 38g / 40a / 38e suites pass unchanged.
- `controller/agent/types.ts` (new): the Interfaces block as written, and
  after it (additive, Ea1) `JobHandle`, `ToolSpec`, the neutral messages
  (`AgentMessage` = `AgentUserMessage` | `AgentAssistantMessage` |
  `AgentToolResultMessage`), `AgentToolCall`, `ServerToolUse`,
  `AgentUsage`, `AgentBudgets`, `AgentStopReason`, `AgentEvent`,
  `AgentResult`.
- `controller/agent/loop.ts` (new): `runAgent(options)` →
  `AgentResult {text, stopReason, error?, usage, turns, toolCalls,
trimmed, durationMs, transcript}`; `checkInput`, `trimToFit`,
  `estimatePrompt`, `wrapUntrusted`, `capResult`; the constants
  `DEFAULT_AGENT_BUDGETS`, `CLAUDE_AGENT_CONTEXT_TOKENS`, `TRIM_AT_SHARE`,
  `ANSWER_RESERVE_TOKENS`, `TOOL_RESULT_SHARE`, `TOOL_RESULT_MIN_CHARS`,
  `TOOL_ERROR_MAX_CHARS`, `UNTRUSTED_TAG`.
- Tests: `test/llmTools.test.ts` (28) and `test/agentLoop.test.ts` (31),
  the review's fixes included.

**For 44b and 44c.** `runAgent({system, prompt, history?, tools,
serverTools?, budgets?, signal?, onEvent?, config?, numCtx?,
contextTokens?, think?, effort?, job?, toolSettleMs?, model?})`. A tool's `run` result
is sent as it is when a string, else as compact `JSON.stringify` — so the
bridge should return the MCP server's compact JSON object (or its text).
`history` is a previous `AgentResult.transcript`; `prompt` is appended
to it. With `job`, steps are made by the loop (Ea10) — 44c passes the
job and maps `onEvent` to the transcript file, not to steps. `signal`
defaults to the job's.

**Decisions.**

- **Ea1 — Types additive, `JobHandle` = `JobContext`.** The Interfaces
  block is copied verbatim; it names a `JobHandle` that did not exist, so
  `types.ts` defines it as epic 37's `JobContext` (`{log, signal?, tier,
jobId?…}`) — the same definition as 44b's, so the branches agree (review;
  first written as `JobRun`). `runAgent`'s own `job` option still takes a
  `JobRun` and resolves it. The neutral conversation lives in
  `agent/types.ts` (types only), and `llm/tools.ts` imports it.
- **Ea2 — The retry is shared, and an OpenAI-style server gets it.**
  `postClaude` is 38g's request loop lifted out of `callClaude`; `postLocal`
  takes `retry`, which `chatTools` sets for `RECIPE_LLM_API=openai` (one
  retry after 429/529/5xx, `retry-after` capped at 30 s — a hosted server
  rate-limits, llama.cpp answers 503 while loading). Never for Ollama: its
  5xx with an error body is a runner failure that 38-Te5 unloads.
  `chatJson` passes no `retry`, so its behaviour is unchanged.
- **Ea3 — Claude's server tools: the basic versions, no beta header.**
  `ANTHROPIC_WEB_SEARCH_TOOL_TYPE = "web_search_20250305"`,
  `ANTHROPIC_WEB_FETCH_TOOL_TYPE = "web_fetch_20250910"`. The newer
  versions (`_20260209`, `_20260318`, and `web_fetch_20260309`) add
  dynamic filtering, which runs the tool from inside code execution
  (`allowed_callers` defaults to `["code_execution_20260120"]`): the
  response then carries code-execution blocks and a `container` id this
  client does not handle, and they are not ZDR-eligible. The basic ones are
  called directly and work on every model that has the tools. A client
  tool with a server tool's name (44b's SearXNG `web_search`) is not sent
  beside the server tool (the API would refuse two of one name). **E7 does
  not reach a server tool's results:** Claude's `web_search` /
  `web_fetch` results arrive inside the API's own blocks, encrypted, and
  go back unchanged (Ea4) — the loop cannot wrap them as it wraps our
  `untrusted` tools' text. There E7 rests on the system prompt alone (44e
  writes it), and on E1 (the held-back tools are never offered).
- **Ea4 — Claude's content kept raw.** An assistant turn from the Claude
  API keeps its blocks exactly (`raw`), and they are replayed unchanged:
  the docs require web search results' `encrypted_content` and citations'
  `encrypted_index` back unmodified (a 400 otherwise), and Sonnet 5
  thinks by default (38-Tg4), whose thinking blocks carry signatures. Any
  other assistant turn (a transcript that moves from qwen to Claude) is
  rebuilt as text + `tool_use` blocks; Ollama gets made-up ids
  (`call_<12 hex>_<n>`) that the Claude API also takes.
- **Ea5 — Prompt caching on.** The system prompt is sent as one text
  block with `cache_control: {type: "ephemeral"}` (caching the tools and
  the system prompt — the ~17k-token skill, E4 — across turns), and the
  newest user block carries a second breakpoint (the conversation so far).
  Two of the four breakpoints; a prompt below the model's minimum is simply
  not cached. Cache reads and writes are counted (`cacheReadTokens`,
  `cacheWriteTokens`) and priced.
- **Ea6 — Trimming (the rule).** Before each model call the prompt is
  estimated with 40a's `estimateTokens` (system + tool specs + messages;
  Claude's opaque `encrypted_*` and `signature` fields not counted). The
  context is `numCtx` (default `LLM_NUM_CTX`, 12,288) for a local model —
  fixed for the run, since a change reloads the model — and
  `CLAUDE_AGENT_CONTEXT_TOKENS` (150,000) for Claude; `contextTokens`
  overrides. When the estimate passes `TRIM_AT_SHARE` (0.85) of the
  context less `ANSWER_RESERVE_TOKENS` (2,048), tool results the model has
  already seen (those before the last assistant message) are replaced by a
  stub — `[<tool> result trimmed to save context (N characters); call the
tool again if you still need it]` — oldest first, until it fits; a result
  the model has not seen yet is never trimmed. The transcript keeps each
  trimmed result whole with `trimmed: true` (the stub is made when the
  wire messages are built), a `trim` event and an `agent.trim` note say
  how many. **A prompt still over the line after trimming is never sent**
  (review: Ollama would silently cut its head, the system prompt): the
  run stops `budget:context`, "stopped: the model's context (N tokens; the
  prompt is ~M with every old result trimmed) ended". **A turn's new
  results share the room** (review: two `web_fetch` pages in one turn
  overflowed qwen's 12k, and new results cannot be trimmed until seen):
  each is capped (`resultCapFor`) to the room left under the line once
  every seen result is a stub, divided by the calls left in the turn, less
  `RESULT_OVERHEAD_TOKENS` (64) for the cut note and E7's wrapper — never
  above `TOOL_RESULT_SHARE` (0.4) of the context in characters (≥ 2,000),
  never below `TOOL_RESULT_FLOOR_CHARS` (300); a cut result ends "[… cut: N
  more characters]". Whether qwen needs a 16k step is 44e's to measure.
- **Ea7 — Cost is an estimate, by name.** `claudeCostEstimate` prices
  uncached input, output, 5-minute cache writes and cache reads from
  `CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK` (platform.claude.com pricing,
  read 2026-10-21), plus $0.01 per web search; web fetch costs only its
  tokens. Claude Haiku 5.5's lower tier (prompts ≤ 100k) is the one
  listed. An unlisted model gets no estimate (`costEstimateUsd` absent),
  never a guess. Local models: tokens only.
- **Ea8 — A failed call is a result.** Arguments that are not a JSON
  object (`malformed`), an unknown tool name, an input that fails
  `checkInput` (type, `required`, `properties`, `items`, `enum`, `const`,
  `anyOf`/`oneOf` — not formats, lengths or unknown keys, which the tool's
  own zod parse handles), a tool that throws, and a result that cannot be
  serialized (a `BigInt`, a cycle — review: it used to throw past the
  loop's guard and be reported as the wall-time budget) each go back as
  `{"error": "…"}` with `isError` (capped at 1,000 characters). The model
  is told the tool names for an unknown one. E7's wrapper defuses its own
  tag inside page text in any case and spacing, opening and closing
  (`<\s*/?\s*untrusted_page_text`, case-insensitive → `&lt;…`; review).
- **Ea9 — Budgets, and when they are checked.** Defaults
  (`DEFAULT_AGENT_BUDGETS`): 40 turns (E3), 80 tool calls, 20 minutes,
  2,000,000 input tokens (cache included), 200,000 output tokens. Turns
  and tokens are checked before each model call (so the last allowed
  turn's tool calls still run), tool calls before each call, and wall time
  throughout: its timer aborts the model call or the tool in flight. A
  stop answers every call it left with `{"error": "not run: …"}` (a call
  in flight: Ea12), so a transcript can always be continued; a `history`
  with an open call is closed the same way. Stop reasons: `done`,
  `budget:turns`, `budget:tool_calls`, `budget:wall_time`,
  `budget:tokens`, `budget:context` (Ea6), `cancelled`, `error` (a failed
  model call, a turn cut off at its output limit, a refusal, a turn still
  paused, or any stop reason the loop does not know — Claude's
  `model_context_window_exceeded` or a new one — named in the error,
  never taken as done; review).
- **Ea10 — Steps in a job.** With `job`, each model call runs in an
  `agent.turn` step (`chatTools` puts its tokens, rate and GPU share
  there) and each tool call in a step named by the tool (an import inside
  nests, 37); a name the model made up is never a step name — it runs as
  `agent.tool` with the name (cut to 60 characters) in the step's data
  (review). A tool error fails its step. Tools are handed `{signal,
job}`. Calls run one at a time; Claude's `pause_turn` is continued
  inside `chatTools` (≤ `CLAUDE_PAUSE_CONTINUATIONS` = 4, `llm.pause`
  notes), so one turn is one step.
- **Ea11 — `think` and `effort` are options, off by default.** Ollama
  gets `think: false` unless asked (44e measures it); Claude gets
  `output_config.effort` only when asked and only for a model in
  `EFFORT_MODELS` — its own default otherwise (an import's `low` is not an
  agent's).
- **Ea12 — A tool still running at a stop gets a grace** (review). A
  cancel or the wall-time budget aborts the tool's signal, but a seat
  that ignores it may be finishing a write. The loop waits up to
  `TOOL_SETTLE_GRACE_MS` (5 s; `toolSettleMs` overrides) for it to
  settle and records what really happened — its result, or its error. If
  it does not settle, the call is answered `UNKNOWN_OUTCOME`: "stopped
  while running: the outcome is unknown — it may have written; check
  (recipe_get / git_log) before redoing it". The calls after it are "not
  run".
- **Ea13 — An abandoned server call is left off the wire** (review). A
  mixed turn (Claude's server tool deferred beside our calls) that a stop
  ended gets our "not run" results; a follow-up then puts the person's
  words in the same user message, which the API reads as the turn's end —
  and an unresolved `server_tool_use` makes that a 400 (the wire
  findings). `claudeMessages` leaves out such a call: a `server_tool_use`
  with no result block in its turn or any later one, whose next user
  message holds more than `tool_result`s. A deferred call whose turn goes
  on (results only) is kept, so the API runs it. The transcript keeps the
  raw blocks; only what is sent changes.

**Wire-format findings** (checked 2026-10-21 against
platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool,
…/web-fetch-tool, …/server-tools and …/tool-reference; Ollama:
docs.ollama.com/capabilities/tool-calling):

- Web search: `web_search_20250305` (basic), `_20260209` (dynamic
  filtering), `_20260318` (+ `response_inclusion`); web fetch:
  `web_fetch_20250910`, `_20260209`, `_20260309` (+ `use_cache`),
  `_20260318`. All GA: the tool reference lists **no beta header** for
  either. Options: `max_uses`, `allowed_domains` or `blocked_domains` (not
  both), `user_location` (search), `citations`, `max_content_tokens`,
  `url_sources` (fetch), `allowed_callers`.
- A server call is a `server_tool_use` block (`srvtoolu_…` id) followed by
  its `web_search_tool_result` / `web_fetch_tool_result` in the same turn;
  an error is a 200 with `content: {type: "…_tool_result_error",
error_code}` (search: `too_many_requests`, `invalid_tool_input`,
  `max_uses_exceeded`, `query_too_long`, `request_too_large`,
  `unavailable`; fetch adds `url_too_long`, `url_not_allowed`,
  `url_not_in_prior_context`, `url_not_accessible`,
  `unsupported_content_type`). Usage: `usage.server_tool_use.
web_search_requests` / `web_fetch_requests`. Search costs $10 / 1,000;
  fetch only its tokens.
- Results go back on later turns by sending the assistant's blocks back
  **exactly** (`encrypted_content`, `encrypted_index`) — a 400 if missing
  or modified. No `tool_result` is sent for a server tool.
- `pause_turn`: the API paused its server-side loop; continue by sending
  the paused assistant content back as-is with the **same tools**; it may
  pause again — cap the continuations.
- Mixed turn: when Claude calls a server tool and one of ours together,
  `stop_reason` is `tool_use` and the `server_tool_use` has no result yet;
  the follow-up user message must hold **only** `tool_result` blocks (text
  after them closes the turn and 400s on the unresolved server call); the
  next response begins with the deferred result block.
- Web fetch only fetches URLs already in the conversation (user messages,
  our tool results, earlier search / fetch results) — not ones only in
  Claude's own output or the system prompt — and Anthropic applies its
  own restrictions (private addresses, robots.txt). It does **not** go
  through our `SitePacer` (30-D5's 15 s gap) or our 403 rule. Whether
  Claude gets the server `web_fetch` or 44b's is E6's call (44b/44c).
- Ollama: `tools` as `{type: "function", function: {name, description,
parameters}}`; `message.tool_calls[].function.{index, name, arguments}`
  with `arguments` an object and **no id**; a result is `{role: "tool",
tool_name, content}`.

**Gates** (2026-10-21, through `heavy.sh`): `pnpm --filter recipe-editor
typecheck` clean; `pnpm --filter recipe-website exec tsc --noEmit` clean;
`pnpm exec vitest run` 147 files, 3,317 tests passed at the first commit,
and 3,325 after the review's fixes (`llmTools.test.ts` 28 and
`agentLoop.test.ts` 31 among them; the 38g,
40a and 38e suites unchanged and green over the `client.ts` refactor). No
Playwright: no UI file touched. No real model anywhere: `fetch` stubbed
per wire format, the loop over a scripted model.

**Roger to confirm.**

- Ea3: the basic server-tool versions (no dynamic filtering). The newer
  ones cut tokens on search-heavy runs but need code-execution handling.
- Ea5: prompt caching on by default (cheaper from the second turn; the
  first turn pays the 1.25× cache write).
- Ea9's defaults beyond E3's 40 turns (80 tool calls, 20 minutes, 2M
  input / 200k output tokens — at most about $6 on Sonnet 5 before cache
  discounts).

### 44b — The tool bridge, `web_fetch`, `web_search`

- **The bridge:** the registry's 59 definitions collected once (a
  `register` sink, or a refactor so the definitions are data), zod → JSON
  Schema (`z.toJSONSchema`), filtered to `AGENT_TOOL_NAMES` (E1), each
  `run` calling the same `CuratorBackend` handler the MCP server calls
  (`createLocalBackend({inProcess: true})`), results the same compact JSON
  the MCP server returns. The vitest for E1's list.
- **`web_fetch {url, maxChars?}`:** http(s) only; `isPrivateHost` on the
  host and on every redirect (and the resolved address), the `SitePacer`
  queue per registrable domain, the polite 403 retry, a byte cap, HTML →
  readable text (reuse 36's page-text extraction), title + final URL +
  text truncated to `maxChars` (default sized for qwen); `untrusted`.
- **`web_search {query, site?}`:** the SearXNG provider (E6): top N
  results as `{title, url, snippet}`, `site:` passed through, a timeout;
  `untrusted`. Absent when `RECIPE_SEARCH_URL` is unset. For Claude the
  server tool replaces it (44a declares it).
- Tests: the bridge's list and a round-trip of two read tools and one write
  tool against a temp content dir; `web_fetch` against a local HTTP server
  (redirect to a private host refused, size cap, text extraction);
  `web_search` against a stub SearXNG.

#### Results (44b)

What changed:

- **`mcp/registry.ts`: the tools are data.** `recipeToolDefinitions(backend)`
  returns the 59 as `{name, title, description, inputSchema (zod),
annotations, handler}` in `TOOL_NAMES` order; `createRecipeServer`
  registers them (a read-only session skips the writes instead of
  registering and `remove()`ing them — same `tools/list`). No tool's name,
  description, schema, annotations or handler changed; `INSTRUCTIONS` is
  exported for 44e. The MCP suites (`mcp`, `mcpHttp`, `mcpStdio`,
  `curatorSkill`, 67 tests) pass unchanged.
- **`controller/agent/tools/`** (new):
  - `names.ts` — `AGENT_TOOL_NAMES` (the 45, spelled out) and
    `AGENT_HELD_BACK` (the 14), both `satisfies readonly ToolName[]`;
  - `schema.ts` — `toolInputSchema` (the SDK's own conversion: zod's
    Standard JSON Schema `input` at draft 2020-12, `type: "object"` at the
    root, `$schema` dropped), `parseToolInput` (safeParseAsync → the
    `validation` error object), `toolError`;
  - `bridge.ts` — `recipeAgentTools(backend, {only?, guard?})` and
    `agentTools(backend, {webFetch?, webSearch?, only?, guard?})`: the 45,
    then `web_fetch`, then `web_search` when configured. `run` parses the
    input, refuses a private download URL (Eb9), calls the MCP handler and
    returns its `structuredContent`; a throw is `toErrorObject`, an aborted
    signal is `cancelled` — never thrown;
  - `urlGuard.ts` — `urlRefusal(url, {hop?, lookup?, allowHosts?})` and
    `isBlockedAddress`, shared by `web_fetch` and the bridge;
  - `webFetch.ts` — `web_fetch {url, maxChars?, links?}`;
  - `webSearch.ts` — `web_search {query, site?}` over SearXNG;
  - `index.ts` re-exports.
- **`controller/agent/types.ts`** created with the Interfaces block, plus
  `import type { JobContext as JobHandle } from "../jobs/context"` — the
  block names `JobHandle` and nothing defines it. 44a writes the same
  file: take 44a's at merge if they differ.
- **`editor/.env.example`** (it held only the `AUTH_SECRET` line, kept):
  `RECIPE_SEARCH_URL`, SearXNG's
  `docker run` (from docs.searxng.org/admin/installation-docker.html, bound
  to 127.0.0.1:8888) and the `settings.yml` change that enables JSON
  (`search.formats: [html, json]`, from
  docs.searxng.org/admin/settings/settings_search.html).
- `backlog.md`: a row for a redirect-level guard inside the importer's own
  fetch (Eb9).
- Tests: `test/agentTools.test.ts` (8) and `test/agentWebTools.test.ts`
  (19).

Decisions:

- **Eb1 — Input checking.** The agent parses each call with the tool's
  own zod schema, so the handler gets exactly what the SDK would hand it.
  A refusal is `{error: {code: "validation", message: "Invalid arguments
for <tool>: …", issues}}`, not the SDK's protocol error (T28): a model
  reads it like any other failure.
- **Eb2 — Schemas.** The model's `inputSchema` equals the MCP `tools/list`
  schema minus `$schema` (a test asserts it for all 45). Strict objects
  stay `additionalProperties: false`; descriptions stay where zod put them.
  That suits Anthropic's `input_schema` (an object schema) as it is;
  Ollama keeps what its tool struct knows (type, properties, required,
  enum, description, items) and ignores the rest — fine for best-effort
  qwen.
- **Eb3 — Untrusted tools.** `web_fetch`, `web_search`, `page_inspect`
  and `page_inspect_list` are `untrusted: true` (their results are a
  site's words, E7). `recipe_import` is not: it answers a written record.
- **Eb4 — `web_fetch`'s SSRF guard** (`urlGuard.ts`). http(s) only
  (`usage` otherwise); the host is checked with `isPrivateHost`, an
  address literal and every address a name resolves to (a DNS lookup,
  `all: true`) with `isBlockedAddress` — `isPrivateHost`'s ranges plus
  multicast, broadcast and reserved IPv4, IPv6 multicast, unique-local,
  link-local and site-local (`fec0::/10`), and the IPv4 inside IPv6
  decoded and checked (mapped `::ffff:a.b.c.d`, compatible `::a.b.c.d`,
  NAT64 `64:ff9b::/96` with the local-use `64:ff9b:1::/48` refused,
  6to4 `2002::/16`, Teredo). Spellings like `http://2130706433/`,
  `http://0x7f000001/` and `http://[::7f00:1]/` are refused (tested).
  Redirects are followed by hand (`redirect: "manual"`, at most 5), each
  target checked the same way, another scheme there `forbidden`. **Not
  caught:** DNS rebinding between the lookup and `fetch`'s own connection —
  closing it needs a dispatcher with a checked `lookup` (undici is not a
  dependency; `fetch` stays, per 44's trap). Roger to confirm that is
  acceptable on the workstation and the Pi.
- **Eb5 — Pacing and the size of things.** One `web_fetch` is one request
  on the first URL's site queue (`SitePacer`, the polite 403 retry, a
  twice-refused site dropped), its redirects inside it as the importer's
  are — so `www.` → bare domain does not wait 15 s for itself; the final
  site's clock moves after. Body read to 2 MB (`bytesCapped`), then 36's
  `pageTextDetail` cut from the middle to `maxChars` (default 8 000, max
  24 000). `links: true` adds up to 50 `{text, url}` (page text drops
  links, and a roundup or article is mostly links). Not text
  (image, PDF…) is `fetch_failed`. **Timeouts (review):** each request has
  its own 30 s from when it is sent, so the queue and the gaps never eat
  it; the wait for the site's turn — the queue, the polite gap, a 403's
  gap — is bounded at 120 s ("Waited more than 120 s for <site>'s turn").
  `web_fetch` does its own 403 retry (once a call, as a browser, after the
  pacer's `beforeRetry`) and never lets a failure out of the paced
  request: `SitePacer#request` reads a 403 whose retry _threw_ as a
  second refusal and drops the site machine-wide for an hour, so a
  timeout, a reset or a stop comes back as a value and only a retry that
  answered 403 again drops the site (tested both ways).
- **Eb6 — `web_search`.** Absent unless `RECIPE_SEARCH_URL` (or the
  option) is set. `GET <base>/search?q=…&format=json` (`/search` appended
  unless the base ends so), 15 s timeout, top 8 http(s) results deduped as
  `{title, url, snippet?}` (snippets ≤ 300 chars), `site:` appended to the
  query, up to 5 `suggestions`. SearXNG is Roger's own service: not paced,
  not SSRF-guarded. A 403 says `json` is missing from `search.formats`.
- **Eb7 — Error codes.** A private or reserved address, or another
  scheme, is `forbidden` everywhere (the bridge and `web_fetch`; the code
  is already in the curation vocabulary). New: `fetch_failed` (with
  `status`/`finalUrl` when there was an answer) and `search_failed`. 44e's
  prompt should name them.
- **Eb8 — Same grant, same reach.** The 45 include `recipe_set_image` /
  `term_set_image` with a local `path` and `recipe_import` with local
  `photos`: the agent can read any image file the editor's process can
  read, as Claude Code's MCP server can, and commit it into the content
  repo. Every such write is one revertable commit. **Roger to confirm**
  that local `path` and `photos` stay in the agent's grant (a prompt a
  page injects could ask for them); dropping them would mean a bridge-side
  refusal of those two arguments.
- **Eb9 — The recipes tools' downloads are guarded too (review).** Before
  the handler, the bridge runs `urlRefusal` (host forms + DNS) on every URL
  a tool downloads: `page_inspect` and `page_inspect_list`'s `url`,
  `recipe_import`'s `url` and `image`, `recipe_import_list`'s `url` and the
  picks it names by URL, `recipe_set_image` / `term_set_image`'s `url`,
  and the `imageImportUrl` of `recipe_create` / `recipe_update`,
  `group_create` / `group_update` and `term_create` / `term_update`. A
  refusal is `{error: {code: "forbidden"}}` and nothing is written; another
  scheme (`file:`, `ftp:`…) is refused outright; a string that does not
  parse as a URL is left to the handler (the importer adds no scheme). A
  recipe's `source` and `videoImportUrl` are cited, never fetched, and are
  not checked. **Follow-up (backlog):** the importer's own fetches
  (`fetchRecipePage`, the image download, yt-dlp) follow redirects
  themselves, so a public page that redirects to a private address is
  still fetched through those tools; a redirect-level guard belongs in the
  importer.

Measured: the 45 tools' JSON schemas are **17,189 characters** and their
descriptions **23,501** — about 10k tokens, close to qwen3:8b's whole
12,288-token context (40a). 44e must hand a local model a subset
(`agentTools(…, {only})`, kept in the grant's order) or shorter
descriptions; Claude takes the full set.

Gates (host, through `heavy.sh`, after the review fixes and a merge of
`origin/main` at 546d95f9): `pnpm --filter recipe-editor typecheck`
clean; `pnpm --filter recipe-website exec tsc --noEmit` clean;
`pnpm exec vitest run` **147 files, 3,293 tests passed** (3,287 before
the review; the 44b files hold 27). No UI file changed, so no Playwright.

Roger to confirm: Eb4's rebinding gap; Eb8's local `path` / `photos` in
the grant; SearXNG bound to 127.0.0.1 only (the editor runs on the same
machine).

For 44c: the bridge's `run` does not hand `ctx.signal` or `ctx.job` to the
MCP handlers (they take neither): a stop lands between tool calls, and an
import a tool started runs to its end as its own job (cancellable from
`/jobs`), not nested under the run's. Threading them through belongs with
the `agent` job kind.

For 44c: `RECIPE_SEARCH_URL` is not yet in the CLI's `EDITOR_ENV_KEYS`
(`cli/editorEnv.ts`), so `pnpm recipes agent` will not read it from
`editor/.env` until 44c adds it (and the CLI help line).

### 44c — Agent jobs, the route, the CLI

The `agent` job kind (`JOB_KIND_NAMES`, a handler in `kinds.ts`); a run =
`runAgent` with the bridge's tools, its events as steps (a tool call is a
step named by the tool; an import inside it nests); `transcript.jsonl`
beside the job (E2), read back for follow-ups ("and two more like that" on
the same run); `POST /api/agent {prompt, runId?}` starts or continues a
run, `GET /api/agent/<id>?from=` polls like `/api/jobs/<id>`; cancel via
the jobs route. `pnpm recipes agent "<ask>" [--json]` on the CLI; no MCP
tool (an MCP client is an agent already). Tests:
the kind with a scripted model, the route's auth (E5), the CLI.

### 44d — The curator page

`/curator` (name to confirm) in the editor, signed in, when a model is
configured: a prompt box ("Find, fetch, import — ask in plain words"), the
run as a conversation (the model's text, tool steps folded under each turn
with `StepList`, recipe cards for anything imported or found, a Stop
button, the budget used, and for Claude the cost), a follow-up box on the
same run, recent runs. ⌘K's Ask hands "find me / grab me / import …"
questions to it. Built from the site's components and tokens; axe WCAG 2.2;
first baselines. Design: no canvas round unless Roger asks (D1 of 43:
conservative, recorded under "Roger to confirm").

### 44e — The prompts; qwen measured

`skill-local.md` (the condensed curator for qwen: the workflow, the reject
rules, tagging by facet, the write rules); the strip rule for Claude's full
skill (E4); three scripted asks run for real on the workstation (GPU
etiquette with Archilyzer) on qwen3:8b and qwen3:14b, and on Claude if a key
is set: valid tool calls, turns, time, what landed; the default local model
picked from the numbers; `think` on or off picked.

### 44f — Close-out

Doc, CLAUDE.md bullet, backlog, memory, a morning report; Roger's steps
(SearXNG `docker run`, `RECIPE_SEARCH_URL`, workstation update, Pi deploy).

## Traps known at the start

- **The step log redacts strings over 200 chars** (37,
  `LOG_TEXT_MAX_CHARS`): the conversation can't live in it (E2).
- **qwen3:8b's context ceiling is 12,288** in 40a's steps; the full skill
  (~17k tokens) doesn't fit (E4). Changing `num_ctx` reloads the model.
- **No robots.txt handling** anywhere; the pacer and the polite 403 retry
  are the politeness. `web_fetch` follows the same rules (one site at a
  time, paced).
- **`isPrivateHost` is only used by roundups and video-follow today**:
  `web_fetch` must apply it to redirects too.
- **The editor has no Anthropic or Ollama SDK**: `client.ts` uses `fetch`
  because the CLI runs under tsx as CommonJS. Stay on `fetch`.
- **`@modelcontextprotocol/client` is a devDependency only**: an
  in-process MCP client is not the bridge's route; call the handlers.
