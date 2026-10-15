# Epic 37 — Import jobs: per-step logs and one global queue

> **This is the durable source of truth for epic 37.** Read it before touching
> `editor/controller/jobs/` (the job store, the step log, the queue), the
> step instrumentation in the import path (`curation/importRecipe.ts`,
> `inspect.ts`, `importList.ts`, `sitePacing.ts`, `ytdlp.ts`,
> `imageImport.ts`, `llm/*`), `packages/cms/git/fileLock.ts`, the `jobs`
> CLI commands, the `/jobs` page or the job API routes.
> Update the roadmap **Status** column and the **Now** line at every phase
> boundary. Earlier epics are cited by number with a prefix (`34-D6`,
> `36-T58`). `agent-epic-36.md` (the local model, `chatJson`, the
> several-recipe split) and `agent-epic-34.md` (the write lock, roundup
> import) are the background.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 37a (job store and step log, synchronous) in progress.

## Context

Roger, 2026-10-15: _"I'd love to see better logging for each step, and a
global queue/worker system for these operations."_

What's wrong today (found while exploring):

- **Nothing visible while it runs.** Imports (URL page, video via yt-dlp,
  pasted text, the 36e multi-recipe split, roundup lists, `inspect`) run
  synchronously inside whichever request or process started them.
  - A multi-recipe video takes 1–4 min behind a static spinner.
  - The import path has **no logging at all**. The only "what happened" is
    the `warnings[]` / `llm` returned at the end.
  - The workstation's journald holds only `[instance]` / `[sync]` lines.
- **Nothing coordinates the GPU.** The editor, the CLI's local backend and
  the stdio MCP server are separate processes. Each can call Ollama at once,
  and they race for the single 8 GB GPU.
  - When another GPU user (Roger's transcriptions) holds VRAM, Ollama
    silently loads qwen to the CPU and runs about 20× slower (36-T58). Today
    that cost about 30 min, unnoticed until someone ran `ollama ps` by hand.
- **The only limiter is per-host page fetching.** `SitePacer`
  (`editor/controller/curation/sitePacing.ts`) is in-memory and per process.
  The form's import isn't paced at all.

## Decisions

### D1 — The job store is files, shared by every process

- `RECIPE_JOBS_DIR`, default `websites/recipe-website/editor/jobs/`
  (gitignored).
- The CLI resolves it the way it finds `editor/.env` (`cli/editorEnv.ts`;
  no `readSettings`, the yt-dlp trap).
- Per job, `<ulid>.meta.json` holds `{id, kind, label, status:
queued|running|done|failed|cancelled|interrupted, tier, resources[], pid,
host, queuedAt, startedAt, endedAt, spec, result?, error?}`. It is written
  atomically, through the engine's atomic write (34-D8).
- Per job, `<ulid>.log.jsonl` holds the step log (D2).
- Retention: the newest 300 jobs or 14 days, pruned at most once an hour.
- Never under `editor/content`. Tests use a temp dir.

### D2 — Step logs are structured

- The `JobLog` API:
  - `log.step(name, data?, fn)` writes a `start` line and an `end` line with
    `ms`, `ok` and an optional `data` payload. A thrown error becomes
    `{ok: false, error}`.
  - `log.info` / `log.warn`.
- Line shape: `{t, step, phase: "start"|"end"|"note", level, ms?, msg?,
data?}`.
- Every line is mirrored to the console as one text line: `[job 01JA…]
llm.extract 2/4 "Stuffing" 13/13 grounded · 11.3 s · 412 tok @ 37 tok/s ·
GPU`.
  - It keeps the bracketed-tag convention `workstation-editor.sh` already
    greps.
  - The mirror lands in journald for free.
- **Redaction:** never log env values or tokens. Page and model text is
  logged only as lengths and hashes, plus a capped 200-character excerpt on
  failure.

### D3 — Named steps

The minimum set, each with its timing and data:

- `fetch` (host, status, bytes, the 403 → browser-UA retry);
- `pace.wait` (how long the polite gap held it);
- `ytdlp` (exit, ms, chapters, comments fetched);
- `parse` / `map` (schema found or partial);
- `llm.<call>` (`extract`, `list`, `oneDish`, and `extract i/N "<name>"`),
  with the fields `chatJson` already reads (`promptTokens`, `outputTokens`,
  `loadMs`) plus tokens per second;
- `llm.placement` (D6);
- `ground` (grounded/total, partial and why);
- `split` (the gate, the names found, the slices);
- `image` (url, bytes, type, skipped and why);
- `write` (slug, commit sha);
- `queue.wait` (which resource, how long, the position at enqueue).

### D4 — One global queue: resources with slots, across processes

- Resources:
  - `gpu` (1 slot): every `chatJson` call.
  - `ytdlp` (1 slot).
  - `site:<host>` (1 slot, plus the 15 s gap `SitePacer` enforces today).
    `SitePacer` is reimplemented on the shared store so the gap holds across
    processes, and keeps its API.
- A job declares the resources it may need. A resource is **acquired around
  each step that uses it**, not for the whole job, so a page fetch never
  waits behind another job's model call.
- **Cross-process FIFO with tiers:**
  - A waiter writes `waiting: {resource, tier, since}` into its meta.
  - It takes the slot only when it holds the slot lock and is the first live
    waiter by `(tier, since)`.
  - "Live" means the pid is alive on this host.
- **The slot lock** reuses the `link()` lock primitive of
  `packages/cms/git/writeLock.ts`, extracted into a small `fileLock` helper
  with a heartbeat and stale detection. The write lock itself is untouched.
- Waiters poll every 250–500 ms. That's cheap, and the counts are tiny.
- Tiers: `interactive` (form, API, MCP) is ahead of `batch` (roundup lists,
  `--all` batches, scripts).

### D5 — Workers run in the process that enqueued the job

- The editor runs form, API and MCP-over-HTTP jobs. The CLI's local backend
  and the stdio MCP server run their own.
- Every process sees the same store, the same queue and the same `/jobs`
  page.
- Boot sweep (editor `instrumentation.ts`, and lazily on CLI start):
  `queued`/`running` metas from a dead pid on this host become
  `interrupted`, and stale waiters are dropped. No automatic replay: Retry is
  one click. A reused pid is an accepted risk.

### D6 — GPU coordination

- Before the first `gpu` acquire after an idle spell, run
  `RECIPE_GPU_ACQUIRE_CMD` if it is set. After the gpu slot has been idle for
  `RECIPE_GPU_IDLE_MS` (default 60 s), run `RECIPE_GPU_RELEASE_CMD`.
- Both are shell commands in `editor/.env`, off by default, with a 30 s
  timeout. Their output goes to a `gpu.hook` step.
- Roger points them at his transcription tool's pause and resume. The repo
  documents only the generic hook.
- **Placement check, always on with Ollama:** after each call, `GET /api/ps`
  reads the model's `size_vram / size`.
  - Below 100%, it logs a warning: `llm.placement 2% GPU — another program
holds VRAM; run "ollama stop <model>" once it frees`.
  - The warning is also surfaced in the result's `warnings` and on the form.
  - If the acquire hook ran and the model is still CPU-resident, the queue
    runs `ollama stop` (`POST /api/generate {model, keep_alive: 0}`) once,
    then retries the load. That is 36-T58's fix, automated.

### D7 — The callers' contracts

- **Form:**
  - The import server action enqueues and returns `{jobId}`.
  - A progress panel polls `GET /api/jobs/<id>?from=<n>` every second and
    shows the live step list (step, status, time, the model's line counts).
    Then it renders the result exactly as today (fill the form, or the 36e
    picker).
  - `/new-recipe?job=<id>` reopens a finished job's result, so leaving the
    page loses nothing.
- **JSON API** (`/api/import`, `/api/inspect`, `import-list`,
  `inspect-list`): same request and response, now through a job. The
  response gains `job: <id>`. The synchronous contract is kept (the route
  awaits the job), so the HTTP backend, MCP and the curator skill don't
  change.
- **New API:** `GET /api/jobs` (filters: status, kind), `GET /api/jobs/<id>`
  (meta plus log from an offset), `POST /api/jobs/<id>/cancel`,
  `POST /api/jobs/<id>/retry` (replays `spec`).
  - Curation auth, as other routes.
  - Cancel threads an `AbortSignal` through `fetch`, yt-dlp (kill) and
    `chatJson`.
- **CLI:**
  - `import`/`inspect` print step lines to stderr when stderr is a TTY or
    with `--verbose`; `--json` stdout is unchanged and gains `job`.
  - New `recipes jobs [list | show <id> | log <id> [--follow] | cancel <id> |
retry <id>]`.
- **MCP:** read-only `job_list` and `job_get` (pre-approved), giving 57
  tools with 43 pre-approved. `recipe_import` and `page_inspect` results
  carry `job`.

### D8 — Pi and CI

- The queue works without a model: no `gpu` resource is ever needed.
- The Pi container's jobs dir is inside the container. Logs are lost on
  redeploy, which is accepted; there's a backlog row for a volume.
- CI: a temp `RECIPE_JOBS_DIR`, no hooks, the model pinned off (36-T18).

## Roadmap

| Phase    | Size | Branch                   | Status | PR  | What                                                                              |
| -------- | ---- | ------------------------ | ------ | --- | --------------------------------------------------------------------------------- |
| 37a      | M    | `agent/37a-job-log`      | 🟡     | –   | D1, D2, D3, D6's placement check: the store, the step log, every import in a job. |
| 37b      | M    | `agent/37b-queue`        | 📝     | –   | D4, D5's waiters, D6's hooks: the cross-process queue, cancellation.              |
| 37c      | M    | `agent/37c-job-surfaces` | 📝     | –   | D7: the async form, `/jobs`, the job API, CLI `jobs …`, MCP `job_list`/`job_get`. |
| 37-close | S    | `agent/37-close`         | 📝     | –   | Results, 36-T58 marked automated, backlog rows, memory, Roger's steps.            |

Ordering: strictly sequential — 37b builds on 37a's store and `fileLock`,
37c on 37b's queue and cancellation.

## How it runs

- One orchestrating session; code phases go to worktree workers (Opus), each
  its own PR off fresh `origin/main`, opened ready. Merge when every check
  that ran is green and the PR is `CLEAN`; merge commit; delete the branch.
- A review agent on every M PR, on the local branch before its first push.
- At most two PRs in CI at once.
- Never a real model in tests or CI: tests stub `fetch` (`vi.stubGlobal`).
  The real model runs only in local verification against scratch clones,
  never `editor/content`, with the GPU coordinated through the orchestrator.

## Phases

### 37a — Job store + step log, synchronous (M)

- `editor/controller/jobs/{store.ts, log.ts, run.ts}`:
  - `runJob({kind, label, spec, tier}, fn(log, signal))` creates the meta
    and the log and runs `fn` **inline** (no queue yet), so every import
    gets a job id and a step log at once.
  - A kind → handler registry, so every surface calls one entry and a retry
    is the spec replayed.
  - The boot sweep and retention.
  - `fileLock` extracted from `writeLock.ts`; its tests stay green.
- Instrument the D3 steps (all but `queue.wait`, 37b) in:
  - `importRecipe.ts` (`importFromUrl`, `importFromText`, `importAndCreate`);
  - `inspect.ts`, `importList.ts`, `ytdlp.ts`, `sitePacing.ts`;
  - `llm/importWithLlm.ts` (`applyLlm`, `readPastedText`, the split),
    `llm/extractRecipe.ts`, `llm/client.ts` (`chatJson` hands its token
    counts to the step);
  - `imageImport.ts`;
  - the form's `reduceRecipeImport`.
  - `log` is passed down as an optional parameter (a no-op logger by
    default), so existing tests and callers compile unchanged.
- D6's placement check (`/api/ps`), with its warning.
- Results gain `job`. CLI `--verbose` and `recipes jobs show <id>`.
- Tests: `test/jobs.test.ts` (store, atomic meta, the sweep with a dead pid,
  retention, the redaction of long text, the registry); step lines asserted
  on a stubbed import in `test/importWithLlm.test.ts` and
  `test/multiRecipe.test.ts`.

### 37b — The global queue (M)

- `editor/controller/jobs/queue.ts`: resources, cross-process FIFO with
  tiers (D4), `acquire(resource, {tier, signal})` that logs `queue.wait`.
  - Wrap `chatJson` (`gpu`), `fetchYtdlpMetadata` (`ytdlp`) and
    `pacedRequest`/`SitePacer` (`site:<host>`; reimplemented on the store,
    same API, the gap across processes). The form's unpaced fetch goes
    through the pacer too.
- GPU hooks (D6), including the automated `ollama stop` reload when the
  model stays CPU-resident after the hook.
- Cancellation: an `AbortSignal` through fetch, yt-dlp (`execFile` with a
  signal) and `chatJson`.
- `EDITOR_ENV_KEYS` gains `RECIPE_JOBS_DIR`, `RECIPE_GPU_ACQUIRE_CMD`,
  `RECIPE_GPU_RELEASE_CMD` and `RECIPE_GPU_IDLE_MS`.
- Tests: two simulated processes (child `tsx` workers on one temp dir)
  contend for `gpu` — FIFO, the tier jump, a dead waiter skipped, the stale
  lock freed; hook commands run once per busy spell, with a debounced
  release; a cancel while waiting and while running.

### 37c — Async form, `/jobs` page, CLI/API/MCP surfaces (M)

- The form's async import with a live step panel (D7), `/new-recipe?job=`,
  and the 36e picker fed from the job's result.
- `/jobs` (a Settings → Tools link), polling every 2 s while anything is
  live:
  - per resource: running, then queued in order;
  - recent jobs (status, kind, label, duration);
  - a per-job page with the step timeline (bars by ms), the warnings and the
    raw JSONL;
  - Cancel and Retry buttons.
- The API routes (D7), CLI `jobs …`, MCP `job_list`/`job_get`.
  - Update the registry counts, `.claude/settings.json`, the curator
    `SKILL.md` frontmatter and the CLAUDE.md tool counts.
- Playwright (build mode, through the heavy slot), with the TEST_MODE
  stand-in model:
  - **Live step panel:** steps appear during a slow stand-in import, and the
    form fills at the end.
  - **Jobs page:** lists the job.
  - **Cancel:** works.
  - **Specs:** `new-recipe`, `ytdlp-import`, `multi-recipe` and
    `import-roundup` updated for the async panel; the visual baselines
    regenerated in their own run; `accessibility` passes.

### 37-close (S)

- This doc's results and traps, 36-T58 updated ("automated by 37b"), and
  backlog rows (a Pi jobs volume; other long operations such as reindex and
  git sync joining the queue).
- Memory: `epic-37.md` and the MEMORY.md line.
- **Roger's steps:**
  - optionally set `RECIPE_GPU_ACQUIRE_CMD` / `RECIPE_GPU_RELEASE_CMD` in
    `editor/.env` to pause and resume transcriptions;
  - `pnpm workstation update`;
  - no reindex;
  - a Pi deploy is optional.

## Verification

- **Per PR:**
  - `pnpm --filter recipe-editor typecheck`, `pnpm --filter recipe-website
exec tsc --noEmit`, `pnpm exec vitest run`;
  - the touched Playwright specs in build mode through the heavy slot;
  - CI green and CLEAN.
- **37a, real model, scratch clone** (never `editor/content`), the GPU
  coordinated with the transcription session:
  - `recipes import --text desc.txt --source <Z8J2HgaaSgQ> --pick "Stuffing"
--dry-run --verbose` prints the D3 steps with timings, token rates and
    placement;
  - `recipes jobs show <id>` returns the same steps.
- **37b:**
  - a CLI import and a form import started together: the second logs
    `queue.wait gpu` and runs after the first;
  - with transcriptions running and the hooks set, the acquire hook fires,
    the placement reads 100% GPU, and the release hook fires after 60 s
    idle;
  - without hooks, the CPU warning appears in the result.
- **37c:**
  - on the workstation, `/new-recipe` with the Holiday Sides URL shows the
    live steps, then the picker;
  - `/jobs` shows it with a step timeline;
  - Cancel stops a long import;
  - after Roger's `workstation update`, the same flow works on the running
    editor.

## Traps

(Filled in per phase.)

## Results

(Filled in per phase.)

## Backlog

- A volume for the Pi container's jobs directory (D8).
- Other long operations — reindex, git sync — joining the queue.
