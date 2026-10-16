# Epic 39 — Import reliability, reindex follow-through, cooking UX, unattended Pi sync, hygiene, content calls

> **This is the durable source of truth for epic 39.** Read it before
> touching the import panel's job polling, model labels in import notes and
> warnings, the reading and transcript caches, the index stamp and instance
> start, reindex or git sync as jobs, held shopping ticks, the shopping
> list's sub-recipe groups, the recipe view's headings, the mirror's view of
> a workstation conflict, `instance/notify.ts`, the Export settings page,
> `paceKey`, or resume-builder's styles.
> The orchestrator updates the roadmap **Status** column and the **Now**
> line at every phase boundary; workers add their phase's **Results** and
> **Traps** under their own headings. Earlier epics are cited by number with
> a prefix (`38-Dg9`, `28-D1`). Background: `agent-epic-38.md` (photo import,
> 38g the Claude API backend), `agent-epic-37.md` (import jobs),
> `agent-epic-29.md` (batched reindex, the deferred incremental plan),
> `agent-epic-28.md` (workstation and mirror roles, sync).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** wave 0 done (worktree cleanup); wave 1 — 39a ∥ 39c.

## Context

Roger, 2026-10-16: _"Let's plan next steps."_ Epic 38 and 38g (the Claude
API backend for the Pi's imports) are merged (main 157ae76b); the
workstation is updated and the Pi deployed on 89c3f8da. The reboot moved
Ollama to 0.40.5. The Pi's reindex printed **4.9 s** at that deploy, at
epic 29's ~5 s trigger for reopening incremental reindex. A sweep of the
backlog found about 50 open rows. Roger chose all four directions offered:

- import reliability;
- reindex follow-through;
- cooking UX;
- unattended Pi sync.

He also chose three housekeeping items: a hygiene bundle, stale worktree
cleanup, and a round of content calls.

## Decisions

### D1 — An index-version stamp rebuilds stale indexes at start

`computeIndexVersion(registry)` hashes every aggregate and pagination spec
and is written beside the indexed HEAD (`.git/discontent-index-version`).
At instance start, on either role, a version that differs from the
registry's runs one full reindex. A deploy that bumps a spec no longer
needs a manual reindex step. This is 29b's first slice; incremental
reindex (29b–29d proper) stays deferred unless 39b's measurements demand
it, and the go/no-go goes into `agent-epic-29.md`.

### D2 — Reindex and git sync are jobs

Both run as job kinds (`reindex`, `git-sync`) on a `repo` queue resource,
with named steps (per-type timings, merge outcome), so `/jobs` shows them
beside imports. A reindex can be cancelled only before its atomic swap.

### D3 — Held shopping ticks expire

Browser-held ticks (38-D4, off by default) are dropped after **7 days**
with a one-line notice, instead of living forever.

### D4 — A workstation conflict is visible on the Pi; the Pi keeps working

Within 28-D1 (the workstation is the only merger; mirrors never push): when
the workstation's sync aborts a conflict, the mirror learns it and its
`/git` and Settings say so. The Pi keeps accepting edits; they merge on the
next sync after the conflict is resolved on the workstation (the existing
behaviour, now stated).

### D5 — Notifications beyond the desktop are opt-in and service-neutral

`RECIPE_NOTIFY_URL` (a plain-text POST, ntfy-style) receives the same
attention events as the desktop notification. It is off unless set, and the
URL is redacted in logs. While a conflict stands, a reminder repeats daily.

### D6 — Export stays manual (28-D8); it only says how stale it is

The Export settings page shows "N commits since last export"; nothing
exports by itself.

### D7 — Content changes apply only what Roger approves

39f puts each call to Roger with a recommendation and applies only his
answers, by the epic-33 method (workstation stopped, scratch-clone dry run,
explicit `--content-dir`, revalidate after). Nothing is pushed.

## Roadmap

| Phase    | Size | Branch              | Status | PR  | What                                                                                     |
| -------- | ---- | ------------------- | ------ | --- | ---------------------------------------------------------------------------------------- |
| 39a      | M    | `agent/39a-import`  | 🟡     |     | Panel `stored`, model labels (38-Dg9), `--fresh`, vision digest in the transcript key.   |
| 39b      | M–L  | `agent/39b-reindex` |        |     | D1, D2: measure, the index-version stamp, reindex and git sync as jobs.                  |
| 39c      | S–M  | `agent/39c-cooking` | 🟡     |     | D3: held ticks expire, undo a sub-recipe expansion, Ingredients/Method jump anchors.     |
| 39d      | M    | `agent/39d-pi-sync` |        |     | D4–D6: conflict on the Pi, `RECIPE_NOTIFY_URL`, daily reminder, export staleness hint.   |
| 39e      | S    | `agent/39e-hygiene` |        |     | resume-builder `@source`, `paceKey` by registrable domain (38-Db6), doc/backlog hygiene. |
| 39f      | S    | (content repo)      |        |     | D7: Roger's content calls, the facet-review list.                                        |
| 39-close | S    | `agent/39-close`    |        |     | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                        |

Ordering, in waves: wave 0 (worktree cleanup, the content-call list), then
39a ∥ 39c (editor llm/jobs vs common shopping/View), then 39b ∥ 39e, then
39d (after 39b: both touch `instance/start.ts`, and 39d can show sync as a
job), 39f whenever Roger's answers are in (workstation stopped, no heavy
work), then 39-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its own
  PR off fresh `origin/main`, opened ready after a local review. A read-only
  review agent reviews each M/L PR. Merge when every check that ran is green
  and the PR is `CLEAN`; merge commit; delete the branch. The next PR merges
  main before it merges.
- Machine memory: typecheck, vitest and builds go through
  `orchestrator/heavy.sh`, Playwright through `heavy-pw.sh`, at most two
  heavy workers at once. GPU real checks go through the orchestrator, which
  pauses the other GPU user first. No real model or API call in tests or CI.
- Never deploy, never push the content repo, never commit `editor/content`.

## Wave 0 — worktree cleanup

On 2026-10-16 the orchestrator removed 15 worktrees (36a–e, 37a–c, 37-close,
38g, the usability-pass branches and `design-homepage`): every branch was
merged into `origin/main` and every tree was clean, so `git worktree remove`
(no `--force`) and `git branch -d` were enough. It also deleted 22 merged
`worktree-agent-*` branches the harness had left. Older local branches
(`agent/28*`–`agent/30*`, `verify-main`, `main-local`, and about 75 unmerged
pre-epic branches) are Roger's to keep or delete.

## Phases

### 39a — Import reliability (M)

- **Tb5:** the single-URL panel reads `stored` from `startSpec`, so a job the
  store couldn't write doesn't 404 into "finished" (as `roundupActions.ts`
  already does).
- **38-Dg9:** warnings and commit notes name the model that answered
  (`modelLabel`), not "local model".
- **Reading-cache bypass:** `--fresh` (CLI), `fresh: true` (API/MCP
  `recipe_import`), a form checkbox on Retry; skips the cache read, still
  writes the new reading.
- **38-Te6:** the vision model's Ollama digest joins `transcribeKey`, so a
  re-pull invalidates saved transcripts (anthropic: the model name).
- **import-list** human output prints a model line per item.
- **Vision re-measure** under Ollama 0.40.5 (orchestrator, GPU): 1024 px and
  1568 px; raise the Ollama cap only if 1568 holds.

### 39b — Reindex follow-through (M–L)

- **Measure first** (scratch copy of the real repo on the workstation; the Pi
  number from Roger's next deploy); go/no-go for 29b–29d in
  `agent-epic-29.md`.
- **D1:** the index-version stamp, `versionStale` in `readIndexFreshness`,
  one reindex at instance start, shown by `git_status` and `/git`.
- **D2:** `reindex` and `git-sync` job kinds, the `repo` resource, every
  route (API, server action, CLI, the sync runner), live queue position.

### 39c — Cooking UX (S–M)

- **D3:** held ticks expire (7 days) with a notice.
- **Undo a sub-recipe expansion:** "Remove these" on a "for <sub-recipe>"
  group on `/shopping`.
- **Jump anchors:** ids on the Ingredients/Instructions headings and an
  "Ingredients · Method" row on long recipes, editor and export.

### 39d — Unattended Pi sync (M)

- **D4:** the Pi's `/git` and Settings show a workstation conflict.
- **D5:** `RECIPE_NOTIFY_URL`, redacted, opt-in; a daily reminder while a
  conflict stands.
- **D6:** "N commits since last export" on the Export settings page.

### 39e — Hygiene (S)

- resume-builder's `@source` for the component library, with screenshots
  reviewed.
- **38-Db6:** `paceKey` keys on the registrable domain.
- Doc and backlog hygiene (36d/36e statuses, 37's AA row, the "featured as a
  group kind" row, the 29 doc's Pi number).

### 39f — Content calls (S, real repo)

- D7: kid-party drinks, a Spicy Cascara Highball source, the Zero-Proof
  Spritz, the red-wine-spritzer citation, the 9.7 MB Sake-Cosmo-9.jpg; a
  regenerated facet-review list.

### 39-close (S)

- Close-out, the CLAUDE.md "Durable docs" bullet, backlog rows, memory,
  Roger's steps.

## Verification

- Per PR: typecheck ×2, the full vitest suite and the touched Playwright
  specs in build mode, through the heavy slot; CI green and `CLEAN`.
- 39a: unit tests — a `stored: false` start doesn't end the panel; a
  Claude-answered import's commit note names Claude; `fresh` skips the cache
  read; a digest change misses the transcript cache. A real photo import on
  a scratch clone, GPU coordinated.
- 39b: unit tests — the version changes when a spec changes; a stale version
  triggers one reindex at start. `/jobs` shows a reindex job with per-type
  steps, and a CLI reindex appears there. Measurements recorded here and in
  `agent-epic-29.md`.
- 39c: unit tests for held-tick expiry and remove-by-`for`; `shopping.spec`
  covers undo; a recipe-view spec for the anchors.
- 39d: unit tests — the conflict state reaches the mirror; the notify URL is
  called and logs redact it (fetch stubbed); the export hint counts. The Git
  settings spec shows the Pi banner.
- 39e: resume-builder Playwright with screenshots reviewed; `paceKey` tests
  (`a.example.co.uk` ≡ `b.example.co.uk`).
- 39f: the scratch-clone diff is reviewed before the real apply; before and
  after counts recorded here.

## Traps

### 39a

- **Ta1 — a fresh worktree's `pnpm install` fails on sharp after the
  reboot.** `sharp`'s install check exits 1 when it finds a global libvips
  (`useGlobalLibvips()`), then tries to build from source and stops at
  "Please add node-gyp to your dependencies" — `ELIFECYCLE`, though the
  prebuilt `@img/sharp-linux-x64` loads fine. `SHARP_IGNORE_GLOBAL_LIBVIPS=1
pnpm install --frozen-lockfile` installs cleanly.
- **Ta2 — "the form's Retry" is `/jobs/<id>`'s.** The `/new-recipe` form has
  no Retry, and its kinds (`form-url`, `form-text`, `form-photo`) never read
  the kept reading (38-Dc6: "the form never re-reads"). So the "Read it
  again" box sits beside Retry on a job's page, shown only for the kinds in
  `KEPT_READING_KINDS` (`import-url`, `import-text`, `import-photo`).
- **Ta3 — every photo import now asks `/api/tags` once.** The digest (Te6)
  is one `GET` before the first vision call, so tests that pin the stand-in
  model's call order (`photoImport.test`, `importRoute.test`) start with
  `/api/tags`, and a reused transcript is "no model call", not "no request".
  A list that does not answer in 2 s (`LLM_STATUS_TIMEOUT_MS`) puts the
  sentinel `NO_DIGEST` in the key: the photos are read again rather than a
  transcript trusted. A test that stubs `/api/tags` without a digest for
  the vision model keys its transcript under the sentinel too.
- **Ta4 — an editor from before 39a.** `recipes import --fresh --remote …`
  against one is a strict-schema `validation`, now worded "predates --fresh
  (39a) — update it, or leave --fresh out" (`predatesBatch`). `jobs retry
--fresh --remote …` is not refused: the old retry route never read a body,
  so it runs a plain retry. The 39a route echoes `fresh: true`, and the
  CLI warns ("this editor predates --fresh on retry (39a); ran a plain
  retry") when it asked and the echo is missing.
- **Ta5 — one vitest file shares one jobs store.** `importReading.test`'s
  tests all run in the same jobs directory, so a second test reading the
  same text finds the first one's kept reading; the `--fresh` test gives
  its spec its own `source` (part of the key).
- **Ta6 — qwen3:8b spills to the CPU with nothing else running.** After a
  reboot the desktop (Sway) holds ~0.8 GB of VRAM at idle, and `ollama ps`
  lists qwen3:8b at 7.2 GB with its 12 288-token context, so the text
  model lands 10%/90% CPU/GPU on an otherwise idle RX 6600 (the
  orchestrator's 2026-10-16 measurement: extraction 20.4 s at 89% GPU).
  The placement warning then says another program holds VRAM and suggests
  `ollama stop qwen3:8b`, which is misleading here — the "other program"
  is the compositor, and stopping does not help. A slowdown, not a
  failure; a backlog row asks for a smaller `num_ctx` for short extraction
  inputs or wording that names the idle desktop baseline.
- **Ta7 — a server action that awaits a job blocks the tab.** Next's App
  Router serialises a client's server actions, so an action awaiting a
  whole import holds every later one (Create, Save) until it ends — the
  first cut of `importResultAction` did. Bound any such wait (Da6), and
  send anything that must not queue (Cancel) through a route `fetch`.

### 39b

### 39c

- **A fresh worktree's `pnpm install --frozen-lockfile` fails on sharp.**
  This workstation has a system libvips, so sharp's `install/check.js`
  chooses a source build and stops without node-gyp ("Please add node-gyp
  to your dependencies"), leaving no `node_modules/.bin`. Install with
  `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install --frozen-lockfile`.
- **The worktree sandbox refuses more than commands naming git twice.** A
  heredoc (`cat >> file <<'EOF'`), and a `python3 - <<'EOF'` edit script,
  were refused as "too complex to verify". Use the Edit tool, or write the
  script into the phase's scratch directory and run it from there.
- **Full vitest under a neighbour's build times out.** The first full run
  had 5 failures, all 5 s default timeouts (`siteWrites.test.ts` among
  them), while another worker's `next build` held the machine. The next
  two runs passed with no change. Read a timeout-only failure as load
  before you debug it.

### 39d

### 39e

### 39f

## Results

### 39a — Import reliability

**Reindex needed: no.** Nothing in the content repository changes.
**Deploy:** none needed beyond the usual `pnpm workstation update` (and the
Pi's next deploy) to get the code.

**Built.**

- **Tb5, the form's panel without a record** (`new-recipe/actions.tsx`,
  new `controller/jobs/unstored.ts`, `ImportProgress.tsx`, `form.tsx`).
  `importRecipeAction` starts every form kind through `startFormImport`:
  a stored job answers `{job}` as before; one with no record answers
  `{job, stored: false}` and its `done` is kept in a process-local map
  (`keepUnstored`, on `globalThis` as T5's registry is, 30 min,
  `UNSTORED_KEEP_MS`). The form then asks `importResultAction(job)` as a
  **bounded long-poll** (Da6): each ask waits at most `UNSTORED_WAIT_MS`
  (15 s, `waitUnstored`) and answers `{pending: true}` or the outcome; the
  form's effect asks again until the outcome, gives up after
  `UNSTORED_KEEP_MS` ("Stopped waiting for this import after half an
  hour"), retries a dropped request (three in a row fail it), and stops
  when the form unmounts or another import starts. An outcome is dropped
  only once an ask has answered it settled; a `pending` answer leaves it,
  so a lost request is simply asked again. Meanwhile `ImportProgress` gets
  `unfollowed`: it polls nothing (`useJobPoll(undefined)`), shows
  "Importing…" with "This import can't be followed step by step: the
  editor could not write its job record (check the jobs directory). The
  form fills when it ends.", no "Job details" (it would 404), and no
  `?job=` goes into the address (a reload could not reopen it). **Cancel
  works:** `cancelJobById` (the cancel route's seat) falls back, when no
  record matches, to aborting a job this process runs by its full id
  (`cancelJob`, the running registry) and answers `cancelled`; the
  long-poll then answers `{cancelled: true}` and the panel says "Import
  cancelled". When the answer lands the form is filled exactly as for a
  followed job, and the panel says "Import done" / "Import failed" and
  "Its steps were not recorded". A job this process does not hold answers
  "Import <id> is not running in this editor any more — import it again."
  **Photos are covered only in theory:** the form's photo path stores the
  photos in the jobs directory first (`storePhotos`), which throws when
  that directory cannot be written, so a `form-photo` start answers that
  error before a job — stored or not — exists.
- **38-Dg9, which model answered** (new `controller/llm/readerLabel.ts`).
  `chatJson` / `chatText` answer `api`; `LlmStats` (so `LlmImportInfo`),
  the found-nothing extraction and `listRecipes` carry it. Every
  user-visible "local model" in a reading names the reader:
  - warnings (`extractRecipe.ts` `llmWarning`, `importWithLlm.ts`: not used,
    failed, found no recipe, output discarded, incomplete, returned no
    ingredients, the several-recipe notes and the found list) —
    `readerLabel`: "local model qwen3:8b", or "the Claude API
    (claude-sonnet-5)"; `readerNoun` where no model was named: "local
    model" / "Claude API";
  - refusals (`importRecipe.ts`: partial readings, several recipes found,
    `pick` out of range, the reused-reading warning; `importList.ts`'s
    partial item; the page-schema batch's "the model was not asked");
  - commit notes — `readerNote`: "(local model)", or "(Claude API
    claude-sonnet-5)", "(Claude API claude-sonnet-5, photo, 2 of 3)" — in
    `importAndCreate`, `importFromText` (text and photo), `importList` and
    the picker's `batchActions.ts` (the readings' own model: the picker
    sends `reader: {model, api}` from the first reading's `llm`, and the
    action falls back to the editor's current model without it);
  - the CLI: `formatLlm`'s line ("Claude API (auto): claude-sonnet-5 6/6
    ingredient lines grounded"), `partialReadingLine` for `import` and
    `inspect`.
    The local wording is unchanged word for word, so no test that pinned it
    moved; three exact-shape assertions gained `api: "ollama"`.
- **The reading-cache bypass, `fresh`.** `readingCache(…, {fresh})` skips
  `load` and keeps `save`; `ReadingCache.fresh` makes `keptReading` log a
  `reading` note ("fresh: any kept reading skipped — read again",
  `{fresh: true}`). The import specs take `options.fresh` (`ReadOptions` in
  `kinds.ts`; the handlers take it off before the seats, and it is not in
  the reading key, so the next import reuses the fresh reading). For a
  photo it also skips the kept transcription (`photoText`'s `fresh`, a
  `vision` note). Surfaces: `recipes import … --fresh` (URL, `--text`,
  `--photo`; usage line and `--help`), `recipes jobs retry <id> --fresh`,
  `/api/import` and MCP `recipe_import` `fresh: true`
  (`ImportRequestFields`, so the tool's input schema and its description),
  `POST /api/jobs/<id>/retry` with an optional `{"fresh": true}` body
  (strict; no body is a plain retry; the answer echoes `fresh: true` when
  it honoured it, and `jobs retry --fresh` warns "this editor predates
  --fresh on retry (39a); ran a plain retry" when the echo is missing —
  Ta4), and on `/jobs/<id>` a "Read it
  again" / "Read the photos again" box beside Retry for the
  `KEPT_READING_KINDS`. `READING_CODE_VERSION` is "39a-1": a reading kept
  before this carries "local model" warnings and no `api`.
  **MCP:** no new tool — still 57, 43 pre-approved; `fresh` is a field of
  `recipe_import`, which was already pre-approved. No `.mcp.json`,
  settings or skill-frontmatter change.
- **38-Te6, the vision model's digest** (`client.ts`, `vision.ts`,
  `importPhoto.ts`, `photos.ts`). `llmStatus` — the Settings line's
  `/api/tags` model check — now also answers the configured model's
  `digest` (Ollama only; the entry named `model` or `model:latest`).
  `visionDigest(config)` asks it once per photo import (never per photo),
  `transcribeKey(limits, digest)` folds it in, and the kept transcript
  records it. Under `anthropic` there is no digest: the model name (already
  checked) is enough. When the list cannot be read, or does not name the
  model, the key takes the sentinel `NO_DIGEST` ("no-digest"), so it
  misses every transcript kept with a real digest or before 39a (Da5); the
  sentinel is not recorded as the transcript's `digest`. A transcript kept
  before 39a has no digest in its key, so the first photo import after the
  update reads its photos again, once.
- **import-list human output:** each item is followed by its model line
  (`formatLlm`, indented), when a model was asked for it.

**Decisions.**

- **Da1 — `readerLabel`, not `modelLabel`, in warnings and notes.**
  `modelLabel` says "the local model at <url>": it drops the model's name
  and adds the server, which is right for the client's own failures and
  wrong for a reading's provenance ("extracted by local model qwen3:8b"
  is pinned by many tests and lives in git history). `readerLabel` keeps
  the local wording and uses `modelLabel`'s words for Claude ("the Claude
  API (claude-sonnet-5)"), without the URL. Dependency-free, so the seats
  and the CLI load it without the client (35q).
- **Da2 — commit notes say "Claude API <model>".** Git history should say
  which model read a recipe; "(the Claude API (claude-sonnet-5), photo)"
  would nest parentheses. The local note stays "local model" (36-D5). The
  picker's batch note uses the model the readings name (sent back with
  the picks, which come from the browser anyway — a note is provenance,
  not authority), else the editor's current model.
- **Da3 — Retry decides `fresh`.** A recorded `fresh` is dropped unless the
  Retry asks for it again, so "Retry" on a fresh job reuses the reading
  that job just kept — the cheap, expected thing — and the box is the one
  way to read again.
- **Da4 — `fresh` reads photos again too.** "Read it again" on a photo job
  that reused a bad transcription would otherwise re-read the same text;
  the transcription is the reading's source.
- **Da5 — the digest is one model-list read per import, and a missing one
  is a miss.** No `/api/show` per photo; `llmStatus`'s 2 s list read. When
  the list cannot be read or lacks the model, the key carries the sentinel
  `NO_DIGEST` and matches no transcript kept with a digest, nor one kept
  before 39a (Ta3). (The first cut left the digest out there, which is the
  pre-39a key — it trusted old transcripts; fixed in review.)
- **Da6 — an unstored job's outcome is a bounded long-poll, not one long
  action.** Next's App Router runs one tab's server actions one at a time,
  so an `importResultAction` that awaited a GPU-queued import held every
  later action — a hand-typed Create — behind it, with no timeout. Each ask
  now waits at most 15 s (`UNSTORED_WAIT_MS`; a Create waits at most that
  long) and the client repeats, capped at 30 min (`UNSTORED_KEEP_MS`, the
  map's own expiry). Cancel goes through the existing cancel route, a
  `fetch` (not a server action, so it does not queue behind the poll),
  whose seat now aborts an unrecorded job by id.

**Tests.** New `importStart.test.ts` (2): with the jobs dir under a regular
file the start answers `stored: false`, `importResultAction` answers the
filled state once, then "not running in this editor"; with a store, the id
is followed and nothing is kept. New `importPanel.test.tsx` (2, jsdom): an
`unfollowed` panel makes no request in 1.2 s, says "Importing…" and
"can't be followed step by step", offers no Cancel and no Job details, and
turns "Import done" only when told; a followed job still polls
`/api/jobs/<id>?from=0` and a 404 is not "done". `importReading.test.ts`
+4: `fresh` skips the read and keeps the save (unit); `--fresh` asks the
model again past a kept reading, logs `{fresh: true}`, and the next import
reuses the fresh reading; a Claude-answered text import (Messages API
stubbed with the stand-in's rules) says "by the Claude API
(claude-sonnet-5)", no "local model", and commits "Create recipe:
lemon-cake (Claude API claude-sonnet-5, pasted text)"; the local model's
words unchanged. `photoImport.test.ts` +2: a digest change misses the kept
transcript (one `/api/tags` per import; the same words keep 38c's
reading), `fresh` reads photo and text again and keeps them.
`jobSurfaces.test.ts` +1: `retrySpecFor` sets `fresh` when asked, drops a
recorded one otherwise, leaves other kinds alone, and the retry route
refuses `{"fresh": "yes"}`. New `importListFormat.test.ts` (2): the
per-item model lines (local and Claude) and the Claude partial line.
Updated: `importWithLlm`, `llmExtract` (`api: "ollama"`), `photoImport`
and `importRoute` (`/api/tags` first in the call order).

Review round (Da6, the sentinel, the retry echo): `importStart.test.ts`
+6 — `importResultAction` signed out (says so, keeps the outcome), an
unknown id (a message, no wait), pending after `UNSTORED_WAIT_MS` (fake
timers) then the outcome once then "not running" (a second take after
delivery), forgotten after its keep, a cancelled job answers
`{cancelled: true}`, and `cancelJobById` aborting a job that runs with no
record. `importPanel.test.tsx` +1 (and the first test now expects Cancel
on an unfollowed panel): Cancel POSTs `/api/jobs/<id>/cancel` and a
`cancelled` end reads "Import cancelled.". `jobSurfaces.test.ts` +2: the
retry route forwards `{"fresh": true}` into the new job's spec and echoes
it, no body is a plain retry with no echo; `jobs retry --fresh` with no
echo carries the warning (and prints it), not asked or echoed carries
none. `photoImport.test.ts` +2: `ollamaDigest` by `name`, by
`name:latest` for an untagged pull, never another tag, no non-string
digest; `visionDigest` answers `NO_DIGEST` when `/api/tags` throws or
omits the model (a key unlike both the pre-39a one and a real digest's),
`undefined` under `anthropic`; the "keeps the transcript" test keys under
the sentinel and checks the pre-39a key misses. The picker's `reader` has
no unit test (the batch action needs a content repo and a signed-in
context; `multi-recipe.spec` covers the action itself).

**Gates.** `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; eslint clean on the changed
files; `pnpm exec vitest run` **108 files / 2206 tests** passed. Playwright (build mode, heavy
slot) `new-recipe`, `jobs`, `photo-import`, `multi-recipe`, `mcp-http`,
`import-roundup`, `ytdlp-import`: **76 / 76** passed (5.4 min). Review
round: both typechecks clean, eslint clean; the affected vitest files
(`importStart`, `importPanel`, `jobSurfaces`, `photoImport`, `claudeApi`,
`cliJson`, `importWithLlm`, `jobs`, `llmExtract`, `queue`, `siteWrites`,
`tidyReading`, `importRoute`, `importReading`, `importListFormat`) **15
files / 380 tests** passed; Playwright `new-recipe.spec` + `jobs.spec`
**53 / 53** (3.8 min). CI runs the rest.

**Vision re-measure (Ollama 0.40.5, RX 6600 on Vulkan, 2026-10-16).** The
orchestrator's run, Archilyzer's transcription lane held: `real_check.sh`
(a dry run into an empty scratch repo, `--fresh`) on 38e's rendered
`banana-bread-card.jpg`, this branch at 693799ca.

| Run                                | Sent           | `vision.transcribe`                                                   | Runner                                             | `llm.extract` (qwen3:8b)     | Grounded    | Wall   |
| ---------------------------------- | -------------- | --------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------- | ----------- | ------ |
| 1024 px (the committed cap)        | 1024 long edge | 23.7 s (load 7.7 s, 99 tok @ 15 tok/s), 100% GPU, 321 chars, verbatim | fine                                               | 20.4 s (load 9.5 s), 89% GPU | 8/8 trusted | 44.3 s |
| 1568 px (local override, uncapped) | 1568×1041      | failed after 13.0 s: "stopped without an answer (done: false)"        | **crashed** — `vk::Queue::submit: ErrorDeviceLost` | —                            | —           | 15.2 s |

**Verdict:** the 38e crash is unchanged under 0.40.5; the Ollama cap stays
at 1024 px (38-Te5 stands; a dated note there points here). No code
change. **New finding:** qwen3:8b now lands 10%/90% CPU/GPU at idle
(Ta6, a backlog row).

### 39b — Reindex follow-through

### 39c — Cooking UX

**Reindex needed: no.** No index, spec version or stored shape changed in a
way a reader must rebuild for. The held-tick storage is in the browser. The
shopping store's items are unchanged: `removeSource` gained a `for` key, a
patch input only.

What changed:

- **D3, held ticks expire.** `HELD_TICKS_MAX_AGE_MS` (7 days) and
  `serializeHeld` / `parseHeld` are in `common/util/shoppingTickQueue.ts`.
  `TickSync` (`shoppingTickSync.ts`) keeps a time per held tick, drops
  expired ticks when it reads the held storage, and names them in the
  snapshot (`expired`; `dismissExpired()` clears it). `/shopping` shows
  one dismissible line: "Dropped a tick this device held for over a
  week — tick again what you bought." With several lines: "Dropped ticks
  on N lines …".
- **Undo a sub-recipe expansion.** `patchShopping` takes
  `removeSource: {for: <slug>}`, through `ShoppingSourceSchema`, which
  now wants exactly one of `recipe`, `group` or `for`. It removes every
  item whose `for` path names the slug, in one commit:
  `Update shopping list: -for Simple Syrup (2 items)`. `/shopping` gets a
  "Sub-recipes (N)" fold, one row per sub-recipe on the list ("for Simple
  Syrup · 2 lines · in Lemonade"). Each row has "Remove these", confirmed
  inline ("Remove what Simple Syrup added to 2 lines?" → "Remove"), like
  Clear checked. Opening the question moves focus to its Cancel, Cancel
  gives focus back to "Remove these", and the question labels its group. The pure helpers `itemsForSubRecipe` and `subRecipeGroups` are
  in `shoppingView.ts`. The seat and the page both use them.
- **Jump anchors.** The Ingredients and Instructions `h2`s get
  `id="ingredients"` / `id="instructions"`. Each has a scroll margin of
  the sticky-chrome offset plus 1rem, so a jump lands below the masthead.
  `View/JumpLinks.tsx` renders a "Jump to Ingredients · Instructions"
  row under the hero's meta and drink-spec bars, on long recipes only.
  The editor and the export render the same `RecipeView`, so both get
  it.

Decisions:

- **Dc1 — Held ticks are aged one by one, a week each.** The stored set
  keeps `serializePending`'s shape, so a 38d page still reads it, and
  adds `times` (item id → when it was ticked). A tick keeps its time
  until its value changes, so ticking b does not renew a. A set written
  before 39c has no `times`; its ticks count as old as its `at`.
  Ticks are dropped wherever the held storage is read: at mount, on
  another tab's `storage` event, in a tick's read-change-write, and when a
  tab with the switch off takes the held ticks to send them. The storage
  is rewritten at once, so no read in this tab or another sends or counts
  those ticks again. The notice counts lines, the rows holding a dropped
  id (as 38-Dd8 counts "lines not saved yet"). When those items have left
  the list, it shows nothing, since nothing was lost. The notice's live
  region is always mounted, empty and `sr-only` until there is something
  to say, so a screen reader announces it.
- **Dc1a — No tick over a week old is ever sent** (review fix). A tab can
  outlive a week holding ticks in memory that a read of the storage has
  since dropped. Switching `holdTicks` off then put them back and sent
  them under the "Dropped a tick" notice. Now the two moments that send
  held ticks, the switch going off and "Done shopping", first drop
  whatever the tab's own times say is over a week old. That covers ticks
  held only in memory (a held storage that keeps no write) too. A tick
  time in the future (a clock that ran ahead) reads as now and is stored
  back as now, so it can't stretch the week.
- **Dc2 — "Remove these" does not put the linking line back.** That line
  ("1 batch [Simple Syrup](…)") can't be rebuilt from what is stored. An
  expanded item keeps the sub-recipe's slug and name, what a measure
  called for (`called`) and the scale. It does not keep the linking
  line's text or its index in the recipe. Re-reading the recipe would add
  what the recipe says now, not what was added, and for a nested
  sub-recipe the line lives in another sub-recipe. The fold's help text
  covers both reasons to remove ("Have it already, or buying it
  ready-made?"). A shopper who wants it ready-made types it in the add
  box.
- **Dc3 — `for` is a path, so an item goes whole.** The brief allowed
  for an item whose `for` lists several slugs, with only that slug
  trimmed. In the stored shape (38-Dd1) several slugs are a _nested_
  sub-recipe, outermost first, and the item belongs to the innermost one.
  Trimming would relabel Lavender Syrup's own sugar as Lemonade's, or
  Simple Syrup's lines as Lavender Syrup's. So an item goes whenever the
  slug is anywhere in its path. Removing the outer sub-recipe takes what
  is under it. Removing the inner one leaves the outer one's other lines.
  The shared case in the data is a merged row (38-Dd3): Lemonade's ¼ cup
  sugar and the syrup's ½ cup are one row. The removal takes the syrup's
  item, and the row reads "¼ cup sugar" with no "partly for" note.
  Removal is by slug across every recipe that expanded it (the shopper
  has the syrup or doesn't). It happens server-side, so the HTTP `PATCH`
  takes it too. A slug with no lines is `unmatched` and commits nothing.
  The CLI and MCP `shopping remove` weren't extended (deferred: 39a is
  in the MCP registry meanwhile, and the page is the asked-for surface).
- **Dc4 — The Sub-recipes fold is not gated on the `subRecipes` switch.**
  The switch governs adds (38-Dd1), and these lines are already on the
  list. Someone who switches it off after a bad expansion is exactly who
  needs the undo. The fold shows whenever an item has a `for` path.
- **Dc7 — A sub-recipe's "N lines" counts rows, as the page shows them**
  (review fix). It is the rows holding any of its items, the way Dc1 and
  38-Dd8 count lines. With merge on, Simple Syrup expanded for two
  recipes is 4 items on 2 rows (sugar, water), and it reads "2 lines".
  A merged row can keep another recipe's line, so the question says what
  happens instead of a count of removals: "Remove what Simple Syrup added
  to 2 lines?" → "Remove".
- **Dc5 — The jump row shows from 15 lines.** The count is ingredient
  lines (headings not counted) plus instruction steps (each step of a
  group counted), and both sections must be non-empty. Below 15, both
  lists start close to the top of a phone's page. In the fixtures, Yogurt
  Potato Bread (17) shows the row and Baked Potatoes (14) doesn't. Every
  recipe a screenshot spec opens (`recipe-6` and the rest) has ≤ 7, so no
  baseline moved and none was regenerated.
- **Dc6 — The row reads "Ingredients · Instructions", not "Method".** A
  link names the heading it lands on, and the heading reads
  "Instructions". The row is a `nav` labelled "Jump to", `print:hidden`,
  rendered on the server from the recipe's data, so a short recipe
  renders nothing and nothing shifts. The links have a
  `focus-visible:outline-2 outline-ring` ring and `py-1` for a usable
  target. `#ingredients` / `#instructions` were used nowhere else
  (common, both apps, `packages/`). The Markdown component writes no
  heading ids, so a description's "## Ingredients" can't collide.
  FocusView has no such headings: its lists are `section`s with
  `aria-label` inside a full-screen dialog, so it has nothing to anchor
  and was left alone.

Gates (all through the heavy slot):

- `pnpm --filter recipe-editor typecheck` and
  `pnpm --filter recipe-website exec tsc --noEmit`: clean.
- Full vitest: 106 files / 2215 tests passed. That count includes 22 new
  tests: held ticks 6 (queue) + 5 (`TickSync`), remove by `for` 5,
  sub-recipe groups 2 and JumpLinks 4. One 38d test was renamed ("many
  hours later", not "however old"). The first run had 5 load timeouts
  (Traps).
- Review round (Dc1a, Dc7, a11y): 5 more tests. A tab open past a week
  that switches holding off sends nothing old, with and without a recent
  tick. Done shopping drops an old memory-only tick. A future tick time
  is clamped, in the parser and in `TickSync`. Affected files: 115/115
  across the shopping, tick and JumpLinks files. Both typechecks are
  clean. `shopping.spec` (build mode): 11/11.
- Playwright build mode (`heavy-pw.sh … shopping.spec recipe.spec`):
  72/72 passed (3.4 min), the `recipe-6-multiplied` screenshot among
  them. `shopping.spec` covers the undo (extending the 38d expansion
  test) and the week-old held tick (a new test, the tick aged in
  `localStorage`). `recipe.spec` has a new "jump to" describe at
  phone width: keyboard Tab and Enter, a visible focus ring, the heading
  in view and below the masthead, and no row on a 14-line recipe. The
  regex also matched `new-recipe.spec`. The export has no Playwright
  suite. It renders the same component, and its `tsc` is clean.

Deferred:

- `recipes shopping remove --for <slug>` and the MCP equivalent.
- A smooth scroll for the jump links. The default jump is instant, which
  also suits reduced motion.

### 39d — Unattended Pi sync

### 39e — Hygiene

### 39f — Content calls

## Close-out
