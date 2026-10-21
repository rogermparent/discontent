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
