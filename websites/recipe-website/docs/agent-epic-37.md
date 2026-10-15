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

**Now:** 37b (the global queue, cancellation, GPU hooks) in progress.

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

### Amendments (37b)

- **D4 — the queue is machine-wide; the records stay per checkout.** The
  queue's state (slot locks, waiters, `state.json`, the GPU hooks' state)
  lives in `RECIPE_QUEUE_DIR`, default `~/.cache/discontent/queue`; the job
  records stay in `RECIPE_JOBS_DIR` (`<editor>/jobs`). So a CLI run from a
  worktree and the workstation editor (the main checkout) wait in one
  queue. Not `$XDG_RUNTIME_DIR`: tidier (tmpfs, gone at reboot), but a
  process started without it — cron, a trimmed environment — would
  silently use another queue, which is the one failure a GPU queue cannot
  have. A lock a reboot leaves behind is freed by the stale rules. Under
  `VITEST` or `TEST_MODE` the default is `<jobs dir>/queue` (a suite never
  waits behind the machine's real imports); `setupTests.js` sets it per
  test file. In the Pi's container it is the container's own home (D8).
- **D4 — one file per waiter, not `waiting` in the meta.**
  `<queue dir>/<resource>/waiters/<id>.json` (pid, host, pid namespace,
  nonce, tier, since, `jobId`): a waiter need not be a job (a seat called
  outside one, a script), and a reader lists one small directory instead of
  every meta. The meta mirrors it as `waiting: {resource, tier, since,
position}` while the job waits (`JobContext.waiting`), for 37c's display;
  the status stays `running` — a job waits per step, not before it starts.
- **D4 — liveness.** A waiter is dead when `processGone` says so (same host
  and pid namespace, pid dead or reused) **or** its file is untouched for
  30 s (it touches it at every poll): the second rule is how a waiter from
  another pid namespace (the Pi's container after a restart) is judged, so
  none blocks the line forever. Whoever sees a dead waiter deletes it. A
  slot holder beats every 5 s and is stale when its process is gone or its
  beat is older than 60 s; the next waiter takes it over (`fileLock`'s
  rename-aside).
- **D4 — re-entrancy: acquired around each call, passed through when the
  caller holds it.** `withResource` marks the resource held in the async
  context (`AsyncLocalStorage`, on `globalThis` for Next's bundles), so a
  `chatJson` inside something that already holds `gpu` passes through
  instead of waiting for itself. No seat holds `gpu` across calls today:
  each `chatJson` acquires on its own, so a model call never holds the GPU
  while the job fetches a page.
- **D4 — `queue.wait` only when it waited** (for the slot, or a site's
  gap), with `resource`, `tier`, `position` (how many were ahead, the
  holder counting one), `waitedMs` and `gapMs` — as `pace.wait` logs only
  real waits.
- **D4 — sites.** `SitePacer` keeps its per-process queue and clock (this
  process's order, the 403 retry's gap inside the held slot, and the only
  thing a fake clock uses); on the real clock (`realPacing`, `shared`) each
  request also holds `site:<site>`, whose grant waits the polite gap since
  the previous holder — in any process — let go. A request cancelled in
  the gap does not move the clock. Loopback is never queued, as it is
  never paced. Dropped sites (403 twice) stay per process.
- **D4 — a relative `RECIPE_QUEUE_DIR` or `RECIPE_JOBS_DIR` is the editor
  package's** (37b review), whoever reads it — the directory their defaults
  live under (`setJobsRoot`: the CLI and the stdio MCP server set it; the
  editor's cwd is it). Not `INIT_CWD` or the cwd, as `--content-dir` and
  `RECIPE_ENV_FILE` are: the value usually sits in `editor/.env`, read by
  the editor and by a CLI started from anywhere, and resolving it from each
  one's own directory would give them two stores, or two queues for one
  GPU. Rejecting relative values was the other choice; resolving them one
  way keeps a relative value usable and means the same thing everywhere.
  `recipes --help` says so.
- **D4 — a process's own records are registered before they exist** (37b
  review). `processGone` judges a record with this process's pid and nonce
  by asking whether the process still has it (`processHolds`,
  `processWaiters`). So the id is registered **before** the slot lock or
  waiter file is created, unregistered if the creation fails, and dropped
  only **after** the file is gone (`createSlotLock`, `letGo`, the waiter's
  `finally`, `maybeReleaseGpu`). Otherwise another waiter's poll or a
  snapshot in the same process, landing between `link()` and the
  registration, took the fresh slot over: a double grant (T18).
- **D4 — a holder that lost its slot says so.** The slot heartbeat checks
  the lock still names it; the first time it does not — taken over as
  stale while the process was suspended past 60 s — it warns once
  (`queue.lost` in the job's log, else `[queue] …` on stderr). The call
  goes on; it cannot be recalled mid-flight.
- **D4 — site directories are pruned.** The sweep (`sweepQueue`, D5)
  deletes a `site:<site>` directory with no holder, no waiter file and a
  clock (`lastRelease`, else the directory's mtime) more than a day old;
  `gpu` and `ytdlp` stay. A waiter that joins as its directory is pruned
  writes its file again (once on the join, and at every poll that finds
  it gone).
- **D4 — an unwritable queue dir** (a read-only home, a bad
  `RECIPE_QUEUE_DIR`) is said once on stderr and the work runs unqueued,
  as a job runs without its record (T6).
- **D6 — who runs the release.** The spell is shared
  (`gpu/hooks.json`: `active`, `since`, `releasedAt`), read and written
  only while holding the `gpu` slot; the idle clock is the slot's
  `lastRelease`. Then:
  1. the process that let the slot go sets an `idleMs` timer (unref'd);
     when it fires and the slot is idle with nobody waiting, it takes the
     slot for the length of the hook and runs it — the long-lived editor's
     and the stdio MCP server's case;
  2. the editor is the **keeper**: with a release command set it
     registers under `gpu/keepers/` at boot and checks every 10 s, so it
     closes a spell a CLI run began and did not outlive;
  3. **no keeper alive: release at exit** — the CLI after its command and
     the stdio MCP server at shutdown run the release at once when they used
     the GPU, the spell is on, the slot is free and nobody waits
     (back-to-back CLI runs without an editor pause and resume once each).
     **A Ctrl-C or SIGTERM is an exit too** (37b review): the CLI cancels
     its running jobs through their own aborts (37a's registry, so each
     record ends `cancelled` and the model call lets the slot go), waits
     for the command to wind down and the release to run — at most 10 s —
     and exits 130 or 143; a second Ctrl-C exits at once. The stdio MCP
     server already ran this path on its signals;
  4. **an unclosed spell** (a process killed before its exit) is noticed by
     the next grant — on, but idle past `idleMs` — and the acquire hook runs
     again; pausing a paused program is harmless, and this spell's release
     follows. **SIGKILL is the gap that remains** — it cannot be caught —
     and with no editor running the other program stays paused until the
     next model call, whose grant closes the old spell and opens a new one
     (and whose own release follows).
- **D6 — the hook's step.** `gpu.hook` with `hook`, `exit`, `outputChars`
  and an `excerpt` (160 characters, then D2's redaction); never the
  command, so nothing from the environment is echoed. A failing or hung
  hook is a failed step, never a failed import; the timeout kills the
  hook's whole process group.
- **D6 — the reload covers a timeout too.** When the grant ran the acquire
  hook and the placement check — after the answer, or after a timeout —
  reads under 100%, `chatJson` stops the model (`llm.reload`, `POST
/api/generate {model, keep_alive: 0}`) and asks once more. The first
  reading is not surfaced; the retry's is. Never a loop.
- **D7 — a cancel across processes is a file.** `requestJobCancel(id)`
  aborts a job this process runs, else writes `<jobs dir>/<id>.cancel`;
  the running process looks for it every second (`JOB_CANCEL_POLL_MS`),
  while it runs or waits. Not a `cancelRequested` field: only the running
  process writes its meta, and its heartbeat's read-modify-write would race
  a flag someone else wrote there. 37c's route only calls
  `requestJobCancel`.
- **31-D3, for the form:** its page fetch is paced now, so a 403's one
  retry waits the polite gap (30-D5) instead of retrying at once.

## Roadmap

| Phase    | Size | Branch                   | Status | PR   | What                                                                              |
| -------- | ---- | ------------------------ | ------ | ---- | --------------------------------------------------------------------------------- |
| 37a      | M    | `agent/37a-job-log`      | ✅     | #237 | D1, D2, D3, D6's placement check: the store, the step log, every import in a job. |
| 37b      | M    | `agent/37b-queue`        | 🟡     | –    | D4, D5's waiters, D6's hooks: the cross-process queue, cancellation.              |
| 37c      | M    | `agent/37c-job-surfaces` | 📝     | –    | D7: the async form, `/jobs`, the job API, CLI `jobs …`, MCP `job_list`/`job_get`. |
| 37-close | S    | `agent/37-close`         | 📝     | –    | Results, 36-T58 marked automated, backlog rows, memory, Roger's steps.            |

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
- From 37a's review round: the `JobContext` (`jobs/context.ts`) already
  reaches every seat that would acquire (`pacedRequest`/`SitePacer`,
  `fetchYtdlpMetadata`, `chatJson` — `request.job`), with `tier` on it; the
  signal already reaches `fetch` and yt-dlp's child, and `runJob` already
  has the `jobId → AbortController` registry (`cancelJob`) and an outside
  `signal` option. 37b adds the acquire around them and the cancel while
  waiting.
- **Open question — where the queue's state lives.** The default jobs dir
  is per checkout (`<editor>/jobs`), so a CLI run from a worktree and the
  workstation editor (the main checkout) do not share it — and a queue that
  coordinates the one GPU must be machine-wide. 37b must keep the slot locks
  and waiters somewhere every checkout sees — e.g. `$XDG_RUNTIME_DIR/discontent`
  (per user, tmpfs, gone at logout) or `~/.cache/discontent/queue` —
  separate from the job records, **or** move the default jobs dir per user.
  Decide before building; the records can stay per checkout either way.
- **A `queued` job needs the heartbeat too.** 37a's `updatedAt` is
  refreshed only while `runJob` runs the work; a job waiting in 37b's queue
  must beat as well (the waiter's poll is the natural place), or the sweep
  will interrupt a job another host has queued for longer than
  `JOB_STALE_MS`.

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

- From 37a's review round: **Retry runs with the editor's own context**
  (`requireCurationContext`, its author and caches) and refuses a spec
  whose `contentDirectory` differs from the editor's — a job recorded by a
  CLI run against a scratch clone must not be replayed into the real repo,
  nor the reverse. `runSpec` builds a context from the spec only when it is
  given none; the retry route must always give one.

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
- **T8 — A fresh worktree has no `editor/.env`, so the local model is
  unconfigured.** `.env` is gitignored and holds `RECIPE_LLM_URL`; without
  it a worktree's `recipes import --llm force` (or a real-model check)
  fails with "no local model configured (RECIPE_LLM_URL)". Copy it from the
  main checkout with the other gitignored files (the worker contract's
  setup step 2).
- **T9 — A video URL is never fetched as a page.** `importRecipeData` maps
  a video-host URL to the bare link without a request, so the yt-dlp
  fallback (the form's and `importFromUrl`'s) is a `parse` step
  (`videoLinkStep`, data `{video, bareLink}`) and no `fetch` step — there
  is nothing to fetch.
- **T10 — A cancel must not become a fallback.** The import path turns
  most failures into something softer: yt-dlp's error into the bare link,
  a failed image probe into `probe.error`, a page fetch's into
  `ImportError`, a roundup item's into a `failed` row, the form's into a
  message. Each of those catches now rethrows when the job's signal is
  aborted, or a cancelled job would carry on (or end `done`).
- **T11 — `execFile`'s `signal` kills the direct child only (SIGTERM).** A
  shell wrapper that forks yt-dlp would leave the grandchild running; the
  test's stand-in uses `exec` so its pid is the child's. The real binary is
  one process (a PyInstaller build forwards the signal to its child).
- **T12 — The machine's load moves the suite's timings.** At a load average
  of ~41 (other sessions' builds), `multiRecipe`'s "L1: --all again" went
  from 0.7 s to 4.4 s and once hit vitest's 5 s timeout; alone it passed.
  A timeout in a heavy file under load is not a regression until it
  repeats on a quiet machine.

### 37b

- **T13 — A cancel can land while the grant is being made.** `acquire`
  checks the signal before it starts and polls with it, but the file work
  between (the waiter file, the first look, the lock) does not watch it. A
  caller that then hands the aborted signal to `fetch` — whose stub only
  listens for a future `abort` — hangs, holding the slot. `llmExtract`'s
  "the caller's own abort" test did exactly that, and every later
  `chatJson` in the file waited behind it (15 timeouts that looked like a
  broken queue). `acquire` checks the signal again once granted, and gives
  the slot straight back.
- **T14 — Under vitest the queue is per test _file_.** `setupTests.js` gives
  each file its own `RECIPE_QUEUE_DIR`, so a test that leaves a slot held —
  a hung stub, a grant never released — makes the file's later tests wait
  for it. `queue.test` stubs a fresh queue dir per test. The hook state
  (`gpu/hooks.json`) is per queue dir too: a test that runs the acquire
  hook needs a fresh one, or the spell is already on.
- **T15 — Counting waiter files can count the wrong one.** A planted dead
  waiter made "three waiters" true before the third worker had joined, the
  holder was released early, and the order came out wrong. Plant after the
  real waiters are counted.
- **T16 — A `tsx` worker's start is its import graph.** A worker importing
  `sitePacing` (the page parsers, `recipe-website-common`) took ~4 s to
  start, one importing `queue.ts` alone ~1–1.5 s; `support/queueWorker.ts`
  imports lazily by mode. The cross-process tests are still the file's
  slowest (13 s of its ~20 s).
- **T17 — Per-call acquisition interleaves two jobs' model calls.** `gpu`
  is taken around each `chatJson`, so two several-recipe imports started
  together alternate call by call (FIFO hands the slot to whoever has
  waited longest), rather than one finishing before the other starts. That
  is D4's design — a job between calls holds nothing — and the GPU still
  sees one call at a time, with one model loaded.
- **T18 — A process can judge its own fresh lock stale.** `processGone`
  calls a record with this pid and nonce gone unless `ownHold()` says the
  process still holds it. `tryCreateLock` returns only after removing its
  temp file, and the hold was registered after that: a poll from another
  waiter in the same process (or a `queueSnapshot`) landing in between
  took the brand-new slot over, and two callers held it. The window is
  microseconds, so no ordinary test hits it; `queueRegistration.test.ts`
  wraps `node:fs/promises` (`vi.mock`) to run a competing look at the exact
  step. Register first, unregister after (D4 amended).
- **T19 — Signals reach the CLI through `tsx`.** `tsx` relays SIGINT and
  SIGTERM to its child and exits with the child's code, so a test can
  signal the `tsx` process and read 130. Without a handler, the child dies
  of the signal and the spell stays on.

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
run 2026-10-15 as `recipes import --text desc.txt --source <Z8J2HgaaSgQ> --pick
"Stuffing" --dry-run --verbose`, GPU otherwise idle (`/api/ps` empty
before and after). Stderr, verbatim:

```
[job M37FCZ9W] job import-text "pasted text (5053 chars, from youtube.com/watch?v=Z8J2HgaaSgQ)" …
[job M37FCZ9W] text: pasted text chars 5053 source https://www.youtube.com/watch?v=Z8J2HgaaSgQ
[job M37FCZ9W] split: the gate: may hold several — asking the model gate true blocks 4
[job M37FCZ9W] llm.list …
[job M37FCZ9W] llm.list 4 listed · 13.3 s · 197 tok @ 42 tok/s · load 5.3 s · GPU
[job M37FCZ9W] llm.oneDish …
[job M37FCZ9W] llm.oneDish separate dishes · 3.5 s · 8 tok @ 47 tok/s · GPU
[job M37FCZ9W] split: cut into 4 recipes
[job M37FCZ9W] llm.extract 1/4 "Potato Puree" …
[job M37FCZ9W] llm.extract 1/4 "Potato Puree" 5/5 grounded · 7.4 s · 251 tok @ 43 tok/s · GPU
[job M37FCZ9W] ground: trusted — 5/5 lines in the source part 1/4 name Potato Puree outcome trusted grounded 5 total 5 verbatim 5
[job M37FCZ9W] llm.extract 2/4 "Stuffing" …
[job M37FCZ9W] llm.extract 2/4 "Stuffing" 13/13 grounded · 13.4 s · 515 tok @ 41 tok/s · GPU
[job M37FCZ9W] ground: trusted — 13/13 lines in the source part 2/4 name Stuffing outcome trusted grounded 13 total 13 verbatim 13
[job M37FCZ9W] llm.extract 3/4 "Green Bean Casserole" …
[job M37FCZ9W] llm.extract 3/4 "Green Bean Casserole" 13/13 grounded · 12.0 s · 463 tok @ 42 tok/s · GPU
[job M37FCZ9W] ground: trusted — 13/13 lines in the source part 3/4 name Green Bean Casserole outcome trusted grounded 13 total 13 verbatim 13
[job M37FCZ9W] llm.extract 4/4 "Fried Shallots" …
[job M37FCZ9W] llm.extract 4/4 "Fried Shallots" 9/9 grounded · 7.5 s · 291 tok @ 43 tok/s · GPU
[job M37FCZ9W] ground: trusted — 9/9 lines in the source part 4/4 name Fried Shallots outcome trusted grounded 9 total 9 verbatim 9
[job M37FCZ9W] split: 4 recipes read
[job M37FCZ9W] job import-text "pasted text (5053 chars, from youtube.com/watch?v=Z8J2HgaaSgQ)" 57.2 s
```

Total wall time **57.2 s** for the job (list 13.3 s, oneDish 3.5 s, four
extracts 7.4–13.4 s). Token rates 41–47 tok/s across the five calls (list
42, oneDish 47, extracts 43/41/42/43). **Placement: 100% GPU** for every
call (`gpu: 100` on each step's data, confirmed separately by
`/api/ps`'s `size_vram == size`), so D6's `llm.placement` warning never
fired — nothing to compare against a CPU-resident run. `recipes jobs show
<id>` and `--json` reproduced the same 21 lines and step entries, same
order, same data (job → text → split → llm.list → llm.oneDish → split →
four × (llm.extract + ground) → split → job end): **matched**. The job's
`spec.text` keeps the full pasted text unredacted (by design, D1: kept for
Retry); the step log itself only ever logged its length (`chars: 5053`),
so the redaction rule held.

One oddity, not a step-log defect: `result.warnings` still carried the
generic "local model qwen3:8b found 4 recipes in the text: … — pick the
ones to import, by name" line even though `--pick "Stuffing"` was already
given and honored (only Stuffing came back `would-import`). The warning
text isn't conditioned on whether a pick was supplied — worth a follow-up
if it reads as confusing in the form/CLI output, but it didn't affect the
steps, their order, or the extraction result.

#### 37a — Review round

What the review asked, and what changed (all on `agent/37a-job-log`):

- **Retention keeps running in a long-lived editor.** `maintainJobs`
  memoises only the boot sweep; every `runJob` asks `pruneJobs`, whose
  hourly stamp keeps that to one `stat`. Tested: a job an hour after the
  last prune prunes.
- **A failure keeps the job's warnings.** `runJob` attaches `log.surfaced`
  to the thrown error (`withWarnings`, `errors.ts`); `toErrorObject` reads
  them back as `error.warnings`, so the HTTP body (`errorResponse`), the
  CLI's error JSON (and `  ! …` lines on stderr), MCP's error object and
  the HTTP backend's rehydrated error all carry them. The meta's `error`
  has them too. Tested with `/api/ps` at 2% and a stubbed chat timeout: the
  import's `import_failed` says "ran 2% on the GPU".
- **A form import that answers a message and no recipe is `failed`.**
  `runJob` takes `failureOf(result)`; `runSpec` gives the form kinds one
  (`formFailure`: a `message`, no `recipe`/`recipes`). The job ends
  `job:end ok:false`, the meta `failed` with `error: {code:
"import_failed", message}` and the state as `result`, and the form still
  gets its state. Tested.
- **A heartbeat.** The meta gains `updatedAt`, refreshed every 30 s
  (`JOB_HEARTBEAT_MS`, an `unref`ed timer) and at every step start and end
  (coalesced; never over an outcome already written). The sweep marks a
  live job `interrupted` when its process cannot be judged (another host
  or pid namespace) and its heartbeat is older than `JOB_STALE_MS` (10
  min); retention drops a live job whose process is not provably alive
  once its heartbeat is past `maxAgeMs`. Tested both, and the step-boundary
  and timer beats.
- **One job context.** `jobs/context.ts`: `JobContext {log, signal, tier,
jobId}`, `JobRun` (any part of it), `NO_JOB`, `jobContext(run)`. Every
  seat 37a gave a positional `log` now takes the context as one options
  object: `pacedRequest(url, run, finalUrlOf?, job?)`, `new
SitePacer(pacing?, job?)`, `probeImageFile(url, retry?, job?)`,
  `fetchImageFile(url, {retry, job})`, `fetchPageStep(url, retry?, job?)`,
  `parsePage(url, page, {base, job})`, `fetchYtdlpMetadata(url, {comments,
job})`, the LLM inputs' `job` (`applyLlm`, `readPastedText`,
  `extractRecipeWithLlm`, `listRecipes`, `isOneDish`, `chatJson`'s
  `request.job`), and the seats' trailing `run` (`importFromUrl`,
  `importAndCreate`, `importFromText`, `finishImport`, `importBatchPicks`,
  `inspectUrl`, `inspectList`/`importList` via `{job}`, the form's
  reducers). `runJob`'s function takes the context (`fn(job)`). Defaults
  are `NO_JOB`, so callers and tests from before 37a are unchanged.
  - The signal reaches `fetch` (`fetchRecipePage(url, retry, {signal})`,
    the image GET and HEAD) and the 403 retry's wait; `SitePacer`'s queue
    and gap waits end on abort (a place given up keeps the queue's order);
    yt-dlp's `execFile` gets it, so an abort kills the child. Tested: an
    outside signal reaches the page `fetch` and the job ends `cancelled`;
    an aborted yt-dlp's child is dead.
  - `runJob` keeps a per-process registry `jobId → AbortController` on
    `globalThis` (`cancelJob(id)`, `runningJobIds()`) and takes an outside
    `signal`; an aborted job ends `cancelled` (code `cancelled`).
  - `updateJobMeta` is serialised per meta file (a promise chain on
    `globalThis`) and may take a function of the meta as read. Tested: 20
    concurrent increments, none lost.
- **Nits.**
  - Step lines gain `n` (per-job sequence) and `parent` (the enclosing
    step's `n`, on notes too), tracked with `AsyncLocalStorage`, so
    concurrent `llm.extract` steps pair. Additive. Tested.
  - `readJobLog` clamps `from` to a whole non-negative number (`NaN` → 0)
    and counts `next` from the clamped value. Tested.
  - `meta.error` (and its warnings) go through the log's redaction
    (`redactText`). Tested.
  - `/api/import-list` parses the body's options
    (`ImportListOptionsSchema`) before the job, and the spec keeps the
    parsed object (`options: ImportListOptions`).
  - `checkPlacement` surfaces one warning per kind (`log.surface(message,
kind)`, the latest reading: 2% then 3% is one, saying 3%) and matches
    the model as Ollama resolves names (`qwen3` ↔ `qwen3:latest`,
    `sameOllamaModel`). Tested.
  - `recipes jobs show --json`: `job` is the id string, the record is
    `meta`. Tested.
  - The mirror builds an end line from its parts (a label with `·` no
    longer loses its first separator). Tested.
  - `RECIPE_JOBS_DIR` is in `EDITOR_ENV_KEYS` (read from `editor/.env`)
    and `--help` says so.
  - `settleExtraction` calls `log[level](…)`, bound.
  - The yt-dlp fallback's bare link is a `parse` step in the form and in
    `importFromUrl` (T9).
  - `fileLock`: `tryCreateLock` and `acquireLock` refuse an id that is not
    a non-empty string; the heartbeat test polls (`vi.waitFor`) instead of
    sleeping 120 ms. Tested.
  - **Pick-aware warning:** with `pick` or `all`, the several-recipes
    warning ends "— picked 2. Stuffing" or "— all picked" instead of
    "pick the ones to import, by name" (`pickedWarnings`, in
    `finishBatch`, the one place a batch result's summary is built; the
    form's picker and `inspect` still ask). Tested.
- `chatJson`'s behaviour is unchanged beyond plumbing (`request.job`'s
  signal as the default caller signal), so no new real-model run.

**Gates (review round).** `pnpm --filter recipe-editor typecheck` and
`pnpm --filter recipe-website exec tsc --noEmit` clean; eslint clean on
the changed files; `pnpm exec vitest run` **84 files / 1827 tests**
passed (+20 on the first round's 1807: `jobs.test` +19 — retention an
hour on, the heartbeat at a step and on its timer, the stale sweep, the
stale prune, serialised meta updates, a timeout's 2% warning on the
error, the form's failed job, a redacted `meta.error`, the context, a
cancel by id, an outside signal at the page fetch, yt-dlp's child killed,
`n`/`parent`, `readJobLog`'s offsets, one placement warning per kind,
Ollama's names, the mirror's parts, `jobs show --json`; `fileLock.test`
+1 — an empty id refused; `multiRecipe` asserts the picked and all-picked
warnings). A first full run at a load average of ~45 timed out 20 tests
in six files (all timeouts, T12); the six files alone and then the whole
suite passed once the load fell to ~5. Playwright (build mode, heavy
slot) `new-recipe`, `ytdlp-import`, `multi-recipe`, `import-roundup`,
`youtube-video`: **63 / 63** passed (5.2 min); `test-jobs/` held 33 jobs
(24 `form-url`, 5 `inspect-list`, 4 `import-list`), all `done`, and no
`editor/jobs/`.

**Re-review of `b13cb4e9`.** Three more fixes, as their own commit:

- A cancel was still swallowed where an image is optional — the roundup
  item's and the batch pick's image catches, and the batch's per-pick
  catch — so a cancelled `--all` went on to write. They rethrow on abort
  (T10), and `runJob` records `cancelled` whenever its signal was
  aborted, even when the work came back normally. Tested: a cancel during
  the first pick's image GET writes nothing and the job ends `cancelled`.
- A 403 retry cancelled in its gap or its fetch no longer drops the site.
  Tested both.
- `PROCESS_NONCE` lives on `globalThis` under
  `Symbol.for("discontent.fileLock.processNonce")`: Next's bundles may load
  separate copies of `fileLock`, and one copy's sweep would have judged
  another's live job a previous process's. The write lock reads the same
  nonce (`processIdentity`, `processGone`). Tested with `vi.resetModules`.
- Nits: a real-clock `pace.wait` clears its timer on abort (`Pacing.sleep`
  takes the signal); `withWarnings` returns a copy (same prototype) rather
  than mutating a possibly shared abort reason; `sweepJobs` goes on past a
  meta it cannot write (tested); 37b notes the queued heartbeat.

Gates after the merge of `origin/main` (77cbb0da) and these fixes:
typechecks clean; `pnpm exec vitest run` **85 files / 1851 tests** passed
(1845 after the merge, +6: `jobs.test` +4, `fileLock.test` +1,
`multiRecipe` +1); Playwright (build mode, heavy slot) `multi-recipe`,
`import-roundup`: **7 / 7** passed (1.3 min).

### 37b — The global queue

**Reindex needed: no.** Nothing in the content repository changes. The
queue's state is a new machine-wide directory, `~/.cache/discontent/queue`
(D4 amended); nothing to set up.

**Built.**

- `editor/controller/jobs/queue.ts` — `acquire(resource, {tier, signal,
log, jobId, gapMs, dir})` → a grant (`release({used})`, `await using`
  works), and `withResource(resource, job, fn)`, the usual way in
  (re-entrant within one async context). Resources `gpu`, `ytdlp`,
  `site:<site>`; per resource a directory of waiter files, a `fileLock`
  slot with a 5 s heartbeat and `state.json`'s `lastRelease`. The grant
  rule, liveness and logging are D4's amendments above. Polls 250–500 ms,
  jittered (`RECIPE_QUEUE_POLL_MS`, tests only). Also `queueSnapshot` /
  `queueSnapshots` (holder and line, for 37c's per-resource view),
  `sweepQueue` (D5's half for the queue, run with the jobs' boot sweep),
  `touchResource` (a redirect's final site clocked).
- `editor/controller/jobs/gpuHooks.ts` — D6's hooks
  (`RECIPE_GPU_ACQUIRE_CMD`, `RECIPE_GPU_RELEASE_CMD`,
  `RECIPE_GPU_IDLE_MS`): the shared spell, `gpuGranted` (runs the acquire
  hook under the slot; answers whether it ran), `gpuReleased` (the
  process's idle timer), `maybeReleaseGpu`, `startGpuKeeper` (the editor,
  from `instrumentation.ts`), `settleGpuAtExit` (the CLI after its command,
  the stdio MCP server at shutdown — loaded only when the process used the
  GPU, `gpuUsedHere` in `location.ts`, so 35q's lazy startup holds).
  `/bin/sh -c` in its own process group, 30 s, killed whole.
- **The seats**: `chatJson` holds `gpu` (tier from `request.job`,
  `interactive` outside a job) and does D6's reload; `fetchYtdlpMetadata`
  holds `ytdlp` for both of its runs; `SitePacer#request` holds
  `site:<site>` on the real clock (public API unchanged; `Pacing.shared`,
  which `realPacing` sets); the form's page fetch goes through
  `pacedRequest`. `checkPlacement` answers its reading and takes
  `{surface}`.
- **Jobs**: `JobContext.waiting` → `meta.waiting` while it waits;
  `requestJobCancel(id, {dir, reason})` → `cancelled | requested | ended |
not_found`, `<id>.cancel` polled every second by the running process
  (removed at the end; retention drops strays). The meta heartbeat already
  runs while a job waits (`runJob`'s timer is the job's, not its steps'),
  so a queued job never looks dead to the sweep.
- `EDITOR_ENV_KEYS` gains `RECIPE_QUEUE_DIR`, `RECIPE_GPU_ACQUIRE_CMD`,
  `RECIPE_GPU_RELEASE_CMD`, `RECIPE_GPU_IDLE_MS` (`RECIPE_JOBS_DIR` was
  37a's); `recipes --help` lists them. `setupTests.js` sets a per-file
  `RECIPE_QUEUE_DIR` and clears the hooks; `mcpStdio.test` hands its
  server the queue dir.
- The mirror names a `queue.wait`'s resource and a `gpu.hook`'s hook:
  `[job …] queue.wait gpu tier batch · position 1 · waitedMs 1234 · 1.2 s`.

**Tests** — `test/queue.test.ts`, 29:

- one process: the queue dir's defaults; FIFO with the interactive tier
  jumping two batch waiters; `queue.wait` only when it waited, with its
  data and mirror line; re-entrancy (`withResource` inside `withResource`,
  `chatJson` inside a held `gpu`); a dead waiter and an unjudgeable stale
  one deleted and skipped; an unjudgeable fresh one waited behind; a dead
  holder and a stale unjudgeable one taken over; a site's gap from the last
  release; the snapshot; the sweep; an unwritable queue dir (unqueued,
  said once);
- jobs: `meta.waiting` while waiting, a cancel removing the place
  (`queue.wait` ends `ok: false`); a cancel through `<id>.cancel`;
  `requestJobCancel`'s four answers; a model call cancelled while it runs
  (the slot let go); yt-dlp cancelled while waiting for its slot (the
  binary never runs);
- across processes (`tsx` workers, `support/queueWorker.ts`): FIFO with
  the tier jump and a dead waiter planted first in line; a holder killed
  with `-9` (its waiter goes next); `SitePacer`'s gap between two processes
  (1.2 s set, ≥ 1.15 s seen between one's exit and the other's enter);
- hooks: acquire once per busy spell and release once after the idle time,
  then a new spell; the `gpu.hook` step's data and no command in the log; a
  failing hook and a hung one (killed at the timeout, its child too); an
  unclosed spell; the CLI-exit release with and without a live keeper; the
  keeper's registration;
- D6's reload with a stubbed `/api/ps`: 2% → stop → 100% (no warning), 2% →
  stop → 3% (one warning, no loop), a timeout at 2% → stop → answer, and no
  hook → only the warning (as before).

`importList`'s fake-clock pacing tests, `jobs.test`'s pacer tests and
`ytdlp.test` pass unchanged.

**Gates.** `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; eslint clean on the changed files;
`pnpm exec vitest run` **86 files / 1880 tests** passed (+1 file, +29 on
main's 85 / 1851). Playwright (build mode, heavy slot) `new-recipe`,
`ytdlp-import`, `multi-recipe`, `import-roundup`, `youtube-video`: **63 /
63** passed (2.5 min); the run's queue state stayed in
`test-jobs/queue/` (`gpu`, `ytdlp`), and the gate runs never created
`~/.cache/discontent` (the real checks below did, as expected: it is the
real default).

**Real checks** (run by the orchestrator, 2026-10-15 18:47–18:51; GPU
free — the other GPU program paused, 81 MB of VRAM in use —
8.4 GB of RAM available, one other branch's Playwright run active, so this
is about order, not timing). Two several-recipe text imports, A and B,
started 3.3 s apart from two CLI processes on the real machine queue, with
both hooks set to append to a log, and a keeper stand-in:

```
A start 18:47:41.733
A holds gpu 18:47:45.079
B start 18:47:45.080
A end 18:49:17.828
B end 18:49:25.079
release seen 18:50:25.305
```

The hook log:

```
acquire 18:47:45.085
release 18:50:24.977
```

- **One spell, one acquire, one release.** A's first model call ran the
  acquire hook; the release ran once, 59.9 s after the last GPU call (B's
  end), from the keeper stand-in: `[queue] gpu.hook release exit 0 ·
outputChars 0 · 0.0 s`.
- **The queue.** B's first model call logged `queue.wait gpu tier
interactive · position 1 · waitedMs 9485 · 9.5 s`. From then on the two
  imports alternated call by call (T17); every later call in each job
  logged a `queue.wait gpu` of 0.6–13.1 s.
- **One model call at a time.** A took 92.7 s and B 95.6 s; one alone took
  57.2 s (37a). Together they took about the sum of their GPU time.
- **Placement.** Every `llm.*` step was `· GPU` (100%), no `llm.placement`
  warning; the `ollama stop` reload never triggered, the model never having
  been CPU-resident. The pick-aware warning showed ("… — picked 2.
  Stuffing").
- **Check 3 — CPU placement while another program holds VRAM — not run**,
  to keep the GPU window short. The unit tests with a stubbed `/api/ps`
  cover the stop-and-retry path.

The step lines and JSON results stay in the orchestrator's scratch
(`rc/A.stderr`, `rc/B.stderr`, `rc/A.json`, `rc/B.json`).

#### 37b — Review round

What the review asked, and what changed (all on `agent/37b-queue`):

- **A fresh lock of this process could be judged stale** (T18). The slot's
  id now enters `processHolds` before `tryCreateLock` and leaves it if the
  lock was not created (`createSlotLock`, used by `acquire` and the release
  hook's `maybeReleaseGpu`); it is dropped only after `releaseLock` (the
  release hook dropped it before). A waiter's id enters `processWaiters`
  before its file is written and leaves after the file is removed.
  `test/queueRegistration.test.ts` (3) wraps `node:fs/promises` and runs a
  competing look at the exact step — after the `link`, after the waiter
  file's `rename`, and at the release hook's lock removal; all three fail
  on the old order and pass on the new.
- **A Ctrl-C'd CLI closes the spell** (D6 step 3 amended). `cli/index.ts`
  handles SIGINT and SIGTERM: cancels the running jobs through 37a's
  registry, waits up to 10 s for the command to wind down (its own
  `settleGpuAtExit` runs on the way out), else tries the release once more
  and forces the exit; 130 or 143; a second signal exits at once. SIGKILL
  stays the gap step 4 recovers. Tested by spawning the CLI (`import --text
  - --dry-run`) against a model that never answers, with both hooks set:
after SIGINT the exit is 130, the hook log reads `acquire`, `release`,
the spell is off, the slot free, the job `cancelled` with "interrupted
    (SIGINT)" and stdout's error object says so. Checked by hand the same
    way first.
- **Test workers cannot leak.** `queue.test.ts` tracks every child it
  spawns and SIGKILLs the live ones in `afterEach`; `queueWorker.ts`'s hold
  on `holdUntil` gives up after 45 s and exits 3 (the brief's 20 s is
  shorter than the FIFO test's three more `tsx` starts on a loaded
  machine; 45 s is still under the test's 60 s timeout).
- **Nits.**
  - The slot heartbeat warns once when it finds the lock is no longer its
    own (`startLockHeartbeat`'s new `onLost`, never after a stop):
    `queue.lost` in the job's log, else `[queue] …` on stderr. Tested in
    `fileLock.test`.
  - Comments: `politeFetch.ts`'s `ForbiddenRetry` (the form is paced since
    37b; only the save-time image fetch passes `delayMs: 0`);
    `location.ts`'s `queueDirectory` comment back on its function;
    `run.ts`'s cancel poll is one `readFile`, not a `stat`.
  - Relative `RECIPE_JOBS_DIR` and `RECIPE_QUEUE_DIR` resolve against the
    editor package for every process (D4 amended); `--help` says so; the
    `jobs.test` and `queue.test` location cases assert it.
  - Playwright's `webServer.env` pins `RECIPE_QUEUE_DIR` to
    `test-jobs/queue` and blanks `RECIPE_GPU_ACQUIRE_CMD` /
    `_RELEASE_CMD`.
  - `sweepQueue` prunes `site:` directories idle for a day (answers
    `sites`); tested with an old, a recent and a waited-on site and an old
    `gpu`.
  - The hook test idles 1 s with calls 50 ms apart (was 300 ms / 60 ms) and
    waits for the release line and the spell's end together — the full
    run under load caught the line landing before `hooks.json` was
    written.
  - Two Backlog rows: the save-time image fetch outside the site queue,
    and `SiteState`'s untiered per-process line.

No `chatJson` behaviour changed: no new GPU run.

**Gates.** `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; eslint clean on the changed files;
`pnpm exec vitest run` **87 files / 1886 tests** passed (+1 file, +6 on the
first round's 86 / 1880), load average 10.6 → 17 → 8 over its 409 s. A
first full run at load 21, beside a Playwright build, timed out in
`cliJson`, `shopping` and `siteWrites` (process-spawning tests, unchanged
here) and caught the hook test's race above; the second was clean.
Playwright (build mode, heavy slot) `new-recipe`, `ytdlp-import`,
`multi-recipe`, `import-roundup`, `youtube-video`: **63 / 63** passed
(3.6 min); its queue state stayed in `test-jobs/queue/` and the machine
queue was not touched.

## Backlog

- A volume for the Pi container's jobs directory (D8).
- Other long operations — reindex, git sync — joining the queue.
- The form's "Import N selected" (`importBatchPicks`) as a job kind, and
  `job` on a failed import's error object (37c).
- A `cancelled` error code (37c): a Ctrl-C'd CLI's stdout error object
  says `internal` today ("interrupted (SIGINT)"; the job's record says
  `cancelled`), as there is no such `CurationError` code. 37c adds it to
  the CLI's, the API's and MCP's error codes, the MCP server's
  instructions and the curator skill.
- The save-time image fetch (`editor/controller/actions/index.ts`, a
  recipe's image URL fetched when the form is saved) is unpaced and outside
  the site queue: `retry: { delayMs: 0 }`, one request with at most one
  retry. Moving it onto `pacedRequest` would make a save wait out a site's
  gap behind a running roundup (37b review).
- `SiteState`'s per-process queue has no tiers: within one process, an
  interactive request to a site waits behind a batch's queued requests to
  that site before it reaches the shared, tiered `site:<site>` line (37b
  review). Across processes the tiers hold.
- A site dropped after two 403s is dropped per process only (37b kept
  `SitePacer`'s drop list in memory); it could live in the site's
  `state.json` beside `lastRelease`.
