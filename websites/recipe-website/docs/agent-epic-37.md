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

### 37a

- **T1 — A job asks one more thing of the model server.** In a job, every
  Ollama call is followed by `GET /api/ps` (D6's placement check), so a
  test that counts `fetch` calls through a surface that runs a job (the
  routes, the local backend) sees one more per call. `importRoute.test`'s
  pasted-text dry run now expects `["/api/chat", "/api/ps"]`. Outside a job
  (`NO_LOG`, the seats called directly) nothing changes: the check runs
  only when `log.live`.
- **T2 — "token" is in `outputTokens`.** The first redaction rule blanked
  any field whose name contained `token`, which took the token counts with
  it. Field names now match only at their end (`apiToken`, `password`,
  `authorization`), environment names likewise (`…_TOKEN`, `…_SECRET`,
  `…_API_KEY`), and an env value must be ≥ 8 characters to be scrubbed
  (so `NEXTAUTH_URL`-style values are not).
- **T3 — `pid:[4026531836]` is this machine's own pid namespace.** The
  root namespace's inode is the same on most Linux hosts, so a test that
  means "another namespace" must use something like `pid:[1]` (as
  `writeLock.test` does); with the real one, the sweep correctly judged the
  planted job dead.
- **T4 — A literal `resolve("jobs")` would be a build input.** As
  `getContentDirectory` explains, Turbopack constant-folds a literal path
  into a directory reference; `jobsDirectory` reads the name through
  `process.env` (`JOBS_DIR_NAME`, `TEST_JOBS_DIR_NAME`) for the same reason.
- **T5 — The editor's bundles don't share module state.** The console
  mirror's setting lives on `globalThis` (`setJobMirror`), as the LLM URL
  override does; inside Next (`NEXT_RUNTIME` set) the default is stdout.
  The per-process sweep memo (`maintainJobs`) is per bundle, so the editor
  may sweep twice at start — harmless.
- **T6 — The jobs dir may not be writable** (a read-only container, a bad
  `RECIPE_JOBS_DIR`). `runJob` says so once on stderr and runs the work
  with a log that writes nowhere: an import never fails for its record.
  On the Pi the default is `<cwd>/jobs` inside the container (D8).
- **T7 — A test's child process needs the test's jobs dir.**
  `setupTests.js` gives each test file its own `RECIPE_JOBS_DIR`, which
  spawned children inherit through `process.env` — but `mcpStdio.test`
  hands its server a minimal environment, so it passes `RECIPE_JOBS_DIR`
  explicitly. Under `VITEST` with none set, `jobsDirectory` falls back to a
  temp dir, never `editor/jobs/`.

## Results

### 37a — Job store + step log, synchronous

**Reindex needed: no.** Nothing in the content repository changes; the
job store is the editor package's own gitignored directory.

**Built.**

- `packages/cms/git/fileLock.ts` — the write lock's `link()` primitive,
  extracted: a record with an id under a caller's key, pid, host, pid
  namespace and a per-process nonce; `processGone` (dead, a reused pid, or
  "cannot judge" across hosts and namespaces); `acquireLock` (create, take
  a stale one over by rename-aside, jittered backoff to a deadline, an
  `AbortSignal`), `releaseLock`, `startLockHeartbeat`, `lockHeldBy`.
  `writeLock.ts` runs on it with its file format, temp names and
  behaviour unchanged.
- `editor/controller/jobs/`:
  - `location.ts` — `RECIPE_JOBS_DIR` (relative to `INIT_CWD`), else a
    temp dir under vitest, else `<root>/test-jobs` under `TEST_MODE`, else
    `<root>/jobs`; the CLI and the stdio MCP server set the root to the
    editor package (`EDITOR_DIRECTORY`, beside `EDITOR_ENV_FILE`), the
    editor uses its cwd. Dependency-free, so CLI startup stays lazy.
  - `store.ts` — `JobMeta` (D1's fields plus `pidns` and `nonce`, epoch
    ms), written whole through `writeJsonAtomic`; `readJobLog(id, from)`
    returns whole lines and the next byte offset (37c's `?from=`);
    `findJob` takes the full id, the mirror's eight characters, or a
    unique start; `sweepJobs` (D5: `processGone` → `interrupted`, a note
    appended); `pruneJobs` (newest 300, 14 days, hourly by a stamp file,
    never a live job, orphan logs and stale temp files too).
  - `log.ts` — `JobLog` (`step(name, data?, fn)` with a handle that can
    `set` end data or `fail` without throwing; `info`/`warn`; `surface`),
    `NO_LOG` (every seat's default — `live: false`), `redactLine` (the one
    place: strings over 200 characters become `[text N chars
sha256:…]`, `msg`/`error` cut to 200, secret-named fields and
    secret env values blanked, URL credentials dropped), the console
    mirror (`formatJobLine`, `[job <last 8 of the ULID>] …` — the first
    eight would be shared by jobs started in the same quarter second).
  - `run.ts` — `runJob(init, fn(log, signal))`: sweep and prune once per
    process, the meta `running`, a top-level `job` step, `done` with the
    result or `failed` with `toErrorObject`'s error (rethrown), surfaced
    warnings merged into the result's `warnings` once each.
  - `kinds.ts` — `JobSpec` (`import-url`, `import-text`, `inspect`,
    `inspect-list`, `import-list`, `form-url`, `form-text`: JSON, the
    content directory and author for corpus jobs, pasted text kept for
    Retry, no tokens), `JOB_HANDLERS`, `jobLabel`, `jobTier` (roundups and
    `all` are `batch`), `jobResources`, and `runSpec(spec, {ctx})` — the
    one entry; a spec read back from a meta replays (tested).
  - `steps.ts` — the shared `fetch` and `parse` steps, `noteRetry` (the
    403 retry noted from `afterRetry`, so pacing is untouched), `headSha`.
- **D3 steps** where they happen: `fetch`, `pace.wait` (`SitePacer`: the
  per-site queue and the polite gap, both only when they actually wait),
  `ytdlp` (exit, chapters, creator comments kept, description length; the
  comment-less retry is its own step), `parse` (schema or not, what the
  mapper found; the roundup's list too), `llm.extract` / `llm.list` /
  `llm.oneDish` (the slice's `part` and `name`, the text's length,
  `chatJson`'s `promptTokens`, `outputTokens`, `loadMs`, `tokPerSec` from
  Ollama's own eval time, `promptTokPerSec`, `gpu`; the extractor adds
  found / grounded / total / verbatim / ingredients / steps), `ground`
  (trusted, partial, kept-untrusted, discarded or none, and why), `split`
  (the gate and its block count, the names, the slice lengths, what was
  kept), `image` (probe or get: host, url, status, bytes, type; a skipped
  picture is a warning), `write` (slug, HEAD after it), and `llm` notes
  for "not asked" and why. `queue.wait` is 37b's.
- **D6's placement check** (`checkPlacement` in `client.ts`): after every
  Ollama call in a job — and after a timeout, when a CPU-resident model
  shows — `GET /api/ps` (2 s) → `gpu: <percent>` on the step; below 100
  an `llm.placement` warning (D6's words) and one surfaced result warning
  ("local model qwen3:8b ran 2% on the GPU — another program holds VRAM, …;
  run "ollama stop qwen3:8b" once it frees"). An `/api/ps` error, a non-2xx
  or an unlisted model is an info note. Never for the OpenAI API.
- **Surfaces**: the local backend's five import seats (the CLI, the stdio
  MCP server, MCP over HTTP), `/api/import`, `/api/inspect`,
  `/api/import-list`, `/api/inspect-list`, the form's import action and
  `?import=`, and the roundup picker's two actions all call `runSpec`;
  every result carries `job` (typed on the result interfaces). The form's
  reducers moved to `controller/formImport.ts` (`common.tsx` re-exports
  them) so the registry can load them in any process. The editor sweeps
  and prunes at boot (`instrumentation.ts`).
- **CLI**: `--verbose` on `import`, `inspect`, `import-list`,
  `inspect-list`; step lines go to stderr when it is a TTY or with
  `--verbose`, never to stdout; human formats print `job: <id>`;
  `recipes jobs show <id> [--json]` prints the meta and the steps through
  the same formatter (refused with `--remote`: a remote editor's jobs are
  37c's API). `--help` names `RECIPE_JOBS_DIR` and the jobs.
- **Tests and CI**: `setupTests.js` gives every test file its own temp
  `RECIPE_JOBS_DIR`; Playwright's `webServer.env` pins
  `RECIPE_JOBS_DIR=<editor>/test-jobs` (gitignored, in CLAUDE.md's
  recovery `rm -rf` list). Nothing writes `editor/jobs/` under test.

**Not done here (on purpose):** the form's "Import N selected"
(`batchActions.ts`, `importBatchPicks` on readings already in hand) is not
a job kind yet; a failed job's error object does not carry `job` (its meta
and log do) — both left for 37c's surfaces. The form's page fetch is still
unpaced (37b).

**Gates.** `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; eslint clean on every changed
file; `pnpm exec vitest run` **84 files / 1807 tests** passed (+2 files,
+36 tests on main's 82 / 1771: `jobs.test` 19 — the store, a failure
recorded, atomic meta, find by id / tail / start, log offsets, an
unwritable store, the sweep with a reaped child's pid (and what it must
not touch: this process, another host, another pid namespace, finished
jobs, a reused pid closed), retention by count / age / the hourly stamp /
orphans, redaction, the mirror's D2 line, `NO_LOG`, surfaced warnings,
the store's location, the registry and a replayed spec;
`fileLock.test` 10; `importWithLlm` +4 — the `llm.extract` step's
numbers and `ground` note, the 2% placement warning surfaced once and a
partial reading's why, placement only with Ollama and only in a job, a
failed `/api/ps` as a note, "not asked" notes; `multiRecipe` +3 — the
video's step order and data (yt-dlp, the split notes, `llm.list`,
`llm.oneDish`, four `llm.extract i/4 "<name>"`, one image probe, four
`ground` notes, no page text in the log), placement at 2% through
`runJob` (six warnings, one result warning), `/api/ps` failing).
Playwright (build mode, heavy slot) `new-recipe`, `ytdlp-import`,
`multi-recipe`, `import-roundup`, `youtube-video`: **63 / 63** passed
(5.3 min); the run left 33 jobs in `test-jobs/` (24 `form-url`, 5
`inspect-list`, 4 `import-list`), all `done`, and no `editor/jobs/`.

**Real check** (qwen3:8b, a scratch clone of the content repo, `--dry-run`):
pending — needs the GPU.

## Backlog

- A volume for the Pi container's jobs directory (D8).
- Other long operations — reindex, git sync — joining the queue.
- The form's "Import N selected" (`importBatchPicks`) as a job kind, and
  `job` on a failed import's error object (37c).
