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

**Now:** closed (2026-10-17); 39f applied the same day (three content commits).

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

| Phase    | Size | Branch              | Status | PR      | What                                                                                     |
| -------- | ---- | ------------------- | ------ | ------- | ---------------------------------------------------------------------------------------- |
| 39a      | M    | `agent/39a-import`  | ✅     | #254    | Panel `stored`, model labels (38-Dg9), `--fresh`, vision digest in the transcript key.   |
| 39b      | M–L  | `agent/39b-reindex` | ✅     | #256    | D1, D2: measure, the index-version stamp, reindex and git sync as jobs.                  |
| 39c      | S–M  | `agent/39c-cooking` | ✅     | #253    | D3: held ticks expire, undo a sub-recipe expansion, Ingredients/Method jump anchors.     |
| 39d      | M    | `agent/39d-pi-sync` | ✅     | #257    | D4–D6: conflict on the Pi, `RECIPE_NOTIFY_URL`, daily reminder, export staleness hint.   |
| 39e      | S    | `agent/39e-hygiene` | ✅     | #255    | resume-builder `@source`, `paceKey` by registrable domain (38-Db6), doc/backlog hygiene. |
| 39f      | S    | (content repo)      | ✅     | —       | D7: Roger's content calls (C2, C6, C7 applied; the rest closed), the facet-review list.  |
| 39-close | S    | `agent/39-close`    | ✅     | this PR | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                        |

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

- **Tb1 — The first start after 39b rebuilds every instance once.** No
  repository has `.git/discontent-index-version` yet, and a missing version
  counts as stale (D1), so the workstation's first `pnpm workstation update`
  and the Pi's next deploy each rebuild at start (logged
  `[instance] no index version recorded yet; reindexing`, a `reindex` job
  labelled so). On the Pi that start-time rebuild and the deploy's own
  `POST /api/reindex` run back to back, the second queued in the
  repository's line behind the first. The deploy keeps its explicit
  request (it also covers a HEAD the stamp had not seen), but since the
  review round (Db11) it asks `?ifStale=1`, and whichever of the two gets
  the line second finds the indexes fresh and records "already fresh"
  instead of rebuilding again — one rebuild per deploy, not two. The curl
  time still includes the wait.
- **Tb2 — A hold leaks into fire-and-forget work started inside it.**
  `withResource` marks the resource held in the async context
  (`AsyncLocalStorage`), and a promise started inside inherits that context
  after the hold is gone. A sync's `finally` kicks the instance's deferred
  rebuild; that rebuild's `reindex` job then saw `repo:` as held and passed
  straight through the line. `outsideQueue(fn)` (`jobs/queue.ts`) runs work
  meant to outlive the hold outside it — as `outsideWriteLock` does for the
  write lock. The review found the class still open (M1): the sync's
  busy-retry timer and the runner's rerun inherit the hold the same way.
  Fixed as `writeLock.ts` fixes it — each held key is a mutable
  `{active}` entry, set false before the slot is released, and `holdsHere`
  ignores a released one — so nothing that outlives a hold passes through
  it. `outsideQueue` stays for work started _while_ the hold is active
  (the kick in the sync's `finally`, the busy-retry timer): its `acquire`
  may run before the release, take a pass-through, and then go on after
  the slot is gone.
- **Tb3 — `measure-reindex.ts` measures React's development build.** Run
  bare under `tsx`, `NODE_ENV` is unset and `flattenMarkdown`'s element
  building costs about twice what the editor pays (787 recipes: 1.1 s
  against 0.7 s with `NODE_ENV=production`). 29a's numbers were taken the
  same way, so they compare with each other, not with the running editor.
- **Tb4 — A discarded sync's `job` names a job that no longer exists.**
  `syncMirror` answers the result with `job` (the route's body too); for a
  sync not worth a row the record is deleted at the end (Db7 — since the
  review, every push-only sync too), so `/api/jobs/<id>` answers 404 and
  MCP `job_get` `not_found` for it — a clean answer, tested
  (`jobSurfaces.test.ts`). Nothing follows that id today.
- **Tb4b — A cross-process cancel can land in the seal's last instant.**
  Another process's `requestJobCancel` reads the meta (live, not yet
  `cancellable: false`), the job checks for `<id>.cancel` (none) and seals,
  then the request writes the file and answers `requested`: the job runs to
  its end and the file is removed with it. The window is a few
  milliseconds between two file reads; closing it would need a lock the
  cancel path does not take, so it is accepted.
- **Tb5 — `reindex` was a test's example of an unknown kind.**
  `jobSurfaces.test.ts` refused a retry of `{kind: "reindex"}` as "a spec
  this version cannot run"; it is a kind now, so the example is `compact`.
- **Tb6 — `reindexJobs.test.ts` pins this site's index version.** Like
  `specVersions.test.ts`, it fails on any declared spec change (a pagination,
  aggregate or taxonomy version, a type's `indexVersion`, a reference's
  fields). Accept it with `vitest -u`; the rebuild that follows on every
  instance is automatic, but the moved pin is the reminder that one will
  happen.
- **Tb7 — `?ifStale=1` is a query parameter, not a body field.** The
  route's body schema is strict, so an older image (the deploy's rollback
  target) would answer 400 to an unknown `ifStale` key; it ignores a query
  string and rebuilds. The rollback path passes none anyway.
- **Tb8 — simple-git's `timeout.block` measures silence on git's own
  output, and git prints nothing while it transfers without
  `--progress`.** So for a silent push the block timeout is in effect a
  total-duration cap, which is why it is generous (10 min) and the
  inactivity bound over ssh is the keepalives (`ServerAliveInterval=15`,
  `ServerAliveCountMax=4`: a link that stops answering is dropped after a
  minute, however long a moving transfer takes). `--progress` would make
  the block an inactivity timer but puts progress lines ahead of the error
  in stderr, which the outcome matching (`firstLine`, `UNREACHABLE`)
  reads.

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

- **Td1 — The sandbox reads `git` in a path as a git command.** `pnpm exec
eslint … src/app/api/git …` was refused ("runs pnpm with a git command
  among its operands"); so is any pnpm/prettier line naming
  `packages/cms/git/…` or `(settings)/git/…`. Lint the parent directory,
  or list the files in a script in the phase's scratch directory and run
  that (39d's `fmt.sh`).
- **Td2 — A Pi on an image from before 39d answers the new route 404.**
  The workstation sends only while a conflict stands or clears, so in the
  normal case an old Pi costs nothing; during a conflict the Mirrors card
  says "uraninite's editor not told: 404: …", the log says it once, and
  every sync retries until the Pi is deployed. The ping answer's
  `standing` is ignored by an old Pi's pinger, harmlessly.
- **Td3 — `commandAction` left a failed build's rejection unhandled.**
  `newBuild.finally(…)` made a derived promise that rejected with execa's
  error and had no handler. The `onSuccess` chain (D6) handles both sides
  now; a failed Build still shows its output and records nothing.
- **Td4 — Before 39d a conflict found by a ping or by Sync now notified
  nobody.** 28c's `notifyIfNew` sat in the runner's `runAll` only; the
  ping's `/api/git/sync` and the Mirrors card's Sync now went through
  `syncMirror` around it. An aborted merge moves no HEAD, so the runner
  did not run again on its own: the conflict was told only at the
  workstation's next local change or restart. `noteAttention` now runs in
  `runMirrorSync`, under every trigger.
- **Td5 — simple-git does not reject a silent non-zero exit.**
  `git.raw(["merge-base", "--is-ancestor", a, b])` resolved `""` when git
  exited 1 (not an ancestor) with nothing on stderr, so the check passed
  every time. Ask a question whose answer is output: `merge-base a HEAD`
  equals `a`'s full sha exactly when `a` is an ancestor (Dd16).
- **Td6 — A state file written by several writers needs one lock, not
  per-caller mutexes.** 39d first serialised each writer in its own
  promise chain (the attention checks, the standing writes) while a sync's
  record, another process's `git sync` and the hourly timer each
  read-modify-wrote `.git/discontent-sync.json` on their own, with a
  `<path>.<pid>.tmp` temp name two in-process writers shared. The lock now
  lives with the file (`updateSyncState`, Dd11), so no caller can forget it.

### 39e

- **Te1 — an unlayered global rule beats every kit utility.**
  resume-builder's `globals.css` had `svg { width: 100%; height: 100% }`
  outside any layer; Tailwind v4's utilities live in `@layer utilities`,
  and unlayered CSS wins over any layer, so the kit's `size-4` on a lucide
  chevron lost and each one stretched across its pagination link ("Newer"
  pushed into the page number). It showed only once the `@source` fix
  emitted the kit's classes. Before adding an `@source` for the kit to a
  site, look for unlayered element rules in its `globals.css`.
- **Te2 — resume-builder's own Playwright suite was already 7 red on
  `main`**, and nothing runs it in CI (no workflow names it). The same 7
  fail before and after this phase (below); don't read them as 39e's.
- **Te3 — a dynamic `import("fs-extra")` in a Playwright spec** gives the
  CJS module under `default` (`readJson is not a function`); import it
  statically, as `support/tasks.ts` does.

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

**Measured first** (full numbers and the go/no-go in `agent-epic-29.md`,
"39b: re-measure and go/no-go"). A scratch clone of the content repo at
`746e4336` (787 recipes, 24 featured, 1 group, 135 term records, 0 pages),
`scripts/measure-reindex.ts`, `RUNS=7`, through the heavy slot, the clone
deleted after:

| Run                                  | recipes min / med | total min / med  |
| ------------------------------------ | ----------------- | ---------------- |
| dev React, load 16–20                | 1157 / 1249 ms    | 1391 / 1496 ms   |
| dev React, load ~9–10                | 900 / 1148 ms     | 1107 / 1312 ms   |
| `NODE_ENV=production`, load ~13      | 575 / 673 ms      | **699 / 867 ms** |
| epic 29 (644 recipes, dev, load ~10) | 401 / 552 ms      | 455 / 644 ms     |

- The production-React row is what the editor pays (Tb3): ~0.7 s, inside
  29-D4's ≤ ~1 s. A CPU profile puts markdown-to-jsx plus React's dev
  build at about half of the dev runs' recipes time.
- **The Pi's 4.9 s** (deploy of 89c3f8da) is the deploy's cold rebuild —
  29a's cold reading was 4.1 s at 644 recipes, which scales to 5.0 s at
  787; the warm median then was 2.55 s (~3.1 s scaled). The next Pi number
  is **pending**: Roger's next `pnpm deploy:pi` prints it, and the Pi's
  `/jobs` now records every warm rebuild with per-type steps (D2).
- **Go/no-go: no-go** for incremental reindex (29b–29d) in this epic; the
  trigger is restated as the Pi's **warm** median passing ~5 s (or a cold
  deploy rebuild ~8 s). The 29 doc's "Pi 2.5 s" lines now say warm, with the
  4.9 s cold reading dated beside them.

**D1 — the index-version stamp.**

- `computeIndexVersion(registry)`, `readIndexVersion`, `writeIndexVersion`
  and `ENGINE_INDEX_FORMAT` in `packages/cms/git/indexStamp.ts`;
  `.git/discontent-index-version` (via `rev-parse --git-path`, beside the
  HEAD stamp). `readIndexFreshness(dir, {version})` adds `indexedVersion`,
  `version` and `versionStale`; without a `version` nothing changes for old
  callers.
- The site's version is `currentIndexVersion()` (`editor/controller/
indexVersion.ts`, once per process): today `8c67321604d73888`, pinned in
  `test/reindexJobs.test.ts` (Tb6).
- The all-types `reindex` writes it after the loop and the HEAD stamp; a
  one-type rebuild writes neither. Also written where the HEAD stamp is
  claimed without a rebuild: the editor's Initialize and the Playwright
  harness's `initializeContentGit`. `deploy-pi.sh --ship-indexes` ships the
  file with the indexes (`swap-index.sh`'s header says so).
- **At start, both roles:** `reindexWhenForeign` (D12's coalesced task, run
  once at start and on every HEAD move) now rebuilds when HEAD **or** the
  version is stale — one rebuild for both — and skips the settle when only
  the version is. The shopping/inventory-only shortcut (35c), and the same
  shortcut in `gitPull`, are skipped while the version is stale.
- `git_status` / `recipes git status` / `GET /api/git/status`:
  `indexStale` is now HEAD-stale **or** version-stale, with
  `indexVersionStale`, `indexVersion` and `indexedVersion` beside it; the CLI
  prints which. `/git` gets a line "Indexes: built from <sha>, index version
  <v>" (`git-index-stamp`, "(this editor: …)" when they differ), and the
  stale-index banner a version variant ("built by an older version of the
  editor … rebuilds them by itself when it starts").
- **Checklists:** `deploy-pi.md` ("Indexes") now says a spec bump needs no
  step of its own. The living docs had no other "reindex after a spec bump"
  step; the close-outs of epics 32–38 that carry one are history and stay.
  39-close should leave reindex out of Roger's steps (the stamp does it;
  watch for Tb1's one-time rebuild).

**D2 — reindex and git sync as jobs.**

- Kinds `reindex` (`contentType?`, `trigger`: `api` | `editor` | `local` |
  `mcp` | `instance`, `reason?`) and `git-sync` (`remote?`, `triggers`) in
  `jobs/kinds.ts` and `listing.ts`; labels "rebuild every index (the API)",
  "rebuild every index (index version changed (a → b))", "sync with
  uraninite (change, ping)"; `jobResources` = the repository's line.
- **`repo:<name>-<hash>`** (`repoResource`, `jobs/queue.ts`), one line per
  repository (Db4), held for the whole job; `/jobs`' queue panel lists the
  `repo:` lines with a holder or waiters ("recipe-content repository"); idle
  ones are pruned after a day like a site's.
- **Every trigger:** `POST /api/reindex` (answers `job`), `rebuildAllIndexes`
  (the banner, `/git`'s pull/merge/abort/checkout, Export), the local
  backend's `reindex` (CLI and stdio MCP: `local`; MCP over HTTP: `mcp`),
  MCP `reindex` through it, the instance's start-time and foreign-HEAD
  rebuild (`instance`), and `syncMirror` (the runner, `/api/git/sync`, Sync
  now) as `git-sync`. The CLI's `reindex` prints "Rebuilt: … in 0.7 s (job
  …)". `recipes git sync` and MCP `git_sync` (local, held back) stay direct
  `gitSync` calls under the sync lock, not jobs.
- **Steps:** `reindex.<type>` per content type (ms each) — in a `reindex`
  job, and inside a `git-sync` job under its `sync` step when the merge
  rebuilds (the job is threaded through `gitSync` → `gitPull` →
  `rebuildAfterRewind`); a sync's own steps as `sync.preflight` …
  `sync.push` notes with their status and detail, and the `sync` step ends
  with `outcome`, `pulled`, `pushed`. `timeline.ts` titles them ("Rebuild
  recipes", "Sync with uraninite").
- **Cancel (Db6):** honoured while the job waits in the repository's line
  (and for a rebuild, while it waits for the write lock); refused after.
  `JobContext.beyondCancel(reason)` checks for a cancel one last time — the
  in-process abort and another process's `<id>.cancel` — then seals the job:
  `requestJobCancel` answers the new outcome **`refused`**, the meta and
  summaries carry `cancellable: false`, the job page shows "Past the point a
  cancel can stop it", `recipes jobs cancel` says so, and an outside signal
  (a closed request) no longer aborts it. A rebuild seals right after it
  takes the write lock, before its first swap; a sync as soon as it has the
  line.
- **The live queue position** (37c backlog row, struck in
  `agent-epic-37.md`, with the "reindex, git sync joining the queue" row): a
  waiter writes its new place into the meta's `waiting.position` each time
  it moves, so `/jobs`' list and the panel read it from the record.
- **Not flooding `/jobs` (Db7, amended in the review round):** a
  `git-sync` is recorded only when it merged commits in, failed, had its
  push refused (`raced`), or gave up on the write lock at the merge
  (`busy` with a failed merge step) — `syncWorthRecording`, via
  `JOB_DISCARDS` → `runJob`'s `discardIf` (meta, log and cancel file
  deleted, through the meta's write chain). A push-only sync — every
  editor commit on the workstation makes one — and the mirror's ping after
  it, which finds nothing, leave no record. The sync state file and the
  Mirrors card still record every attempt. Rebuilds are always recorded: D12 rebuilds only when
  indexed content moved, so the Pi gets one `reindex` row per synced
  content commit, and the store's retention (300 jobs / 14 days) bounds it.
  A sync ending `conflict`, `mirror_dirty`, `unreachable`, `blocked` or
  `error` is a `failed` job with that code; `raced` and `busy` are `done`.

**Decisions (amendments).**

- **Db1 — The version hashes declarations, never source.** Declared
  versions (pagination, aggregate, taxonomy via `aggregatesOf`), each type's
  identity and directories, reference fields, plus a new optional
  `ContentTypeConfig.indexVersion` for what `buildIndexKey` /
  `buildIndexValue` produce — the content index had no declared version at
  all (F23: "nothing self-heals"). Not `specVersions.test.ts`'s source
  hashes: those move on a comment edit, which would rebuild every instance
  on every deploy for nothing, and differ between builds (F16). The price is
  the one F16 already accepted: an author who changes a projection without
  bumping its version gets no rebuild — `specVersions.test.ts` is still the
  net for that.
- **Db2 — `indexStale` includes the version.** One flag for "run reindex"
  (the MCP instructions' rule stands), with `indexVersionStale` saying why.
- **Db3 — One start-time path.** The version check rides D12's coalesced
  task rather than a second start hook, so HEAD and version staleness cost
  one rebuild and share its deferral while a sync runs.
- **Db4 — A line per repository, not one `repo` slot,** because the queue
  is machine-wide (37b): one slot would put a CLI reindex of a scratch
  clone behind the workstation's sync of the real repo. Keyed by the
  resolved path, so `editor/content` and the repo it links to are one line.
- **Db5 — Lock order: the `repo:` line, then the sync lock, then the write
  lock** (`jobs/repo.ts`). Nothing holding a later one waits for an earlier
  one: writes never take the line or the sync lock; the sync lock never
  waits (`busy`); the line is taken only outermost. The one place a
  `reindex` job is asked for inside the write lock — `/git`'s pull, merge
  and checkout calling `rebuildAllIndexes` in their locked scope — skips the
  line (`currentWriteId()`), since waiting there behind a sync that waits
  for the same lock would deadlock. A rebuild inside a sync (28-D12, the
  merge's) is the sync's steps, not a second job; a job started inside a
  held line passes through it — while it is held (Tb2, M1). Tested: a
  `reindex` job inside `withWriteLock` while another holds the line
  completes (`queue.skip`, no `queue.wait`). _Amended in the review round:_
  the first wording said every holder was "bounded by the network"; the
  fetch and push had no bound at all, and a hung one held every rebuild
  behind it. Now (Db9, Db10) the fetch and push are cut off on silence,
  and a person's rebuild leaves the line after 30 s as `busy`; the longest
  legitimate holder is a sync copying annex media (annex's own 30-minute
  cap), which only the instance's background rebuild waits out.
- **Db6 — Cancel is refused, not ignored, past the swap.** Ignoring it would
  record a finished rebuild as `cancelled` (runJob's "cancelled is
  cancelled" rule) over indexes it had replaced; refusing tells the person.
- **Db7 — Only a sync worth a look leaves a job** (above). _Amended in the
  review round (L2):_ first it was "an empty sync leaves no job", and
  every push-only sync was recorded — on the workstation one per editor
  commit, against a store of 300 that imports share. Now a sync is
  recorded when it merged commits in, failed, raced, or was `busy` at the
  merge; push-only, nothing, and a lost sync-lock race (L1) are not. Per-kind
  retention (keep N syncs apart from imports) was the alternative; it
  would still show a row per commit on `/jobs` for no reason to look, so
  the rule changed instead and the store's single retention stands.
- **Db9 — A sync's fetch and push are cut off on silence (review, M2).**
  `networkGit` (`curation/sync.ts`): simple-git `timeout.block` of
  `SYNC_NETWORK_IDLE_MS` (10 min without a byte from git — Tb8) and, unless
  the person set `GIT_SSH_COMMAND`, `GIT_SSH` or the repository's
  `core.sshCommand`, `GIT_SSH_COMMAND="ssh -o ConnectTimeout=10 -o
ServerAliveInterval=15 -o ServerAliveCountMax=4"` — a dead link ends the
  sync within a minute, a slow moving one never does. Either cut-off is
  `unreachable` ("not responding", "block timeout reached" added to the
  pattern). annex already had its own caps (30 min for media, 2 min for its
  branch push).
- **Db10 — A person's rebuild waits 30 s in the line, then answers `busy`
  (review, M2).** `acquire`'s new `maxWaitMs` leaves the line with a
  `QueueTimeoutError` naming the holder; `withRepoSlot` turns it into
  `busy` ("The repository is busy: waited 30.0 s for repo:… (held by job
  … for 42 s) and gave up. Nothing was rebuilt; try again shortly."), the
  same answer and the same 30 s a rebuild behind a long write gave before
  39b (`REINDEX_QUEUE_WAIT_MS`). The instance's own rebuild — start, a
  foreign HEAD move — runs in the background (`void reindexIfForeign()`
  at start, so startup never waits for it) and waits up to 15 min
  (`REINDEX_INSTANCE_QUEUE_WAIT_MS`). Syncs wait unbounded: they are
  background, and every holder is now bounded. `RECIPE_REINDEX_QUEUE_WAIT_MS`
  overrides both bounds (tests).
- **Db11 — A rebuild asked only if stale re-reads freshness once it has
  the line (review, L3).** The `reindex` spec's `ifStale` (always for
  `trigger: "instance"`; a deploy's `POST /api/reindex?ifStale=1`, Tb7):
  after the line and before the write lock, a full rebuild whose HEAD and
  index version are both current records a `reindex.skip` step ("already
  fresh: built from abc1234, index version …") and answers
  `{rebuilt: [], skipped: "fresh"}`; the route then skips its revalidate,
  and `reindexWhenForeign` its editor refresh. A person's rebuild never
  skips (it is a repair seat).
- **Db12 — A sync that loses the sync lock is `busy`, unrecorded (review,
  L1).** `runMirrorSync` maps `LockBusyError` to a `busy` result with one
  skipped `preflight` step naming the holder; the sync state file is left
  to the winner (which records its own attempt), the job is discarded
  (Db7), the runner sends no notification for `busy`, and the busy retry
  (15 s, at most five in a row) asks again — the other process may have
  been syncing another mirror. Before, it was a `failed` job with code
  `internal` and a 500 from `/api/git/sync`.
- **Db13 — Retry refuses `reindex` and `git-sync` jobs (review, L6).** A
  replay would carry the first run's reason long after it stopped being
  true, and a sync retried from the CLI would run without the editor's
  instance (its mutex, mirrors, notifications). `retrySpecFor` answers
  `usage` ("A rebuild is not retried: run a new one (recipes reindex, MCP
  reindex, or Rebuild on the editor's Git page)."), so the API (400), the
  CLI and the local MCP seat all refuse; the job page shows that sentence
  in place of the Retry button (`NOT_RETRIED_KINDS`, `listing.ts`).
- **Db8 — Tiers:** the instance's own rebuilds and every sync are `batch`;
  a person's or a script's rebuild (`api`, `editor`, `local`, `mcp`) is
  `interactive`, so it goes ahead of a waiting background sync.

**Reindex needed: no manual one** — no index layout changed. The stamp is
new, so every instance rebuilds once at its first start after this lands
(Tb1); confirmed by `instance.test.ts` (one rebuild at start, as a `reindex`
job, for a stale version alone and for version + HEAD).

**Tests.** `test/reindexJobs.test.ts` (12): the version is a stable 16-hex
hash, pinned; it does not move when every function in the registry is
swapped for one with other source text (the comment-only case); it moves
with a pagination version or `perPage`, an aggregate version, a taxonomy
version, `indexVersion`, a reference's fields, a new type; a full rebuild
writes it; a CLI (local backend) reindex records a `reindex` job labelled
"(CLI or MCP)" with one `reindex.<type>` step per type, sealed, on the
repository's line; a symlink and its target share one line; a cancel while
waiting in the line stops it with nothing rebuilt; a cancel after the seal
is `refused` and the job ends `done`; a cancel asked just before the seal
wins; the write-lock skip (Db5); a waiting job's meta position goes 2 → 1
as the line moves. `instance.test.ts` +2 (start-time rebuild, once) and the
D4 case now checks every recorded `git-sync` job synced (the empty startup
sync left none). `curationGit.test.ts` +1 (version stale → `indexStale`,
a one-type rebuild leaves it, a full one clears it) and the freshness
shapes. `jobs.test.ts` (kinds, labels, tier). Playwright: `git.spec` +1
(the stamp line, the version banner, Rebuild → a `reindex` job on `/jobs`
with five `reindex.<type>` steps); `api-write.spec`'s reindex case reads
the job's steps over `/api/jobs/<id>`.

**Gates.** Both typechecks clean. vitest **106 files / 2208 tests** on the
branch, **110 files / 2261 tests** after merging main (39a, 39c, 39e).
Playwright (build mode, `heavy-pw.sh`): `jobs`, `git`, `api-write`,
`mirrors-card`, `mirror-role`, `mcp-http` — **84 passed** on the branch,
**84 passed** again after it. One fix on the merge: the D4 case's new job check
waits for the last sync's record (under the full suite's load a final run
could still be `running` when the sync state had converged).

**Review round** (fresh worker, on 7c9dd234). Fixed as new commits:

- **M1** — a released `repo:` (or `gpu`, `site:`) hold no longer passes
  anything through: `{active}` entries in the queue's async context (Tb2).
- **M2** — Db9 (fetch and push cut off on silence) and Db10 (a person's
  rebuild leaves the line after 30 s as `busy`); Db5's "bounded by the
  network" corrected.
- **L1** — Db12. **L2** — Db7 amended. **L3** — Db11, and the deploy asks
  `?ifStale=1` (Tb1).
- **L4** — MCP's instructions and `git_status` description, and the
  curator skill: `indexVersionStale` means the indexes were built by
  different code; with an editor running against that repository, an
  agent does not reindex — the editor rebuilds them itself at start. Tool
  counts unchanged (57 / 43).
- **L5 — a failed start-time rebuild has no retry of its own.** The
  instance's `reindex` job fails like any job (`failed` on `/jobs`, the
  error on the editor's log) and the coalesced task does not run it again:
  the next HEAD move asks again, and until then the stale-index banner
  (version variant) offers Rebuild indexes.
- **L6** — Db13.
- **The missing test:** a full rebuild failing part-way (the second type's
  `rebuildIndex` throws) leaves the version file and the HEAD stamp as they
  were; the next full rebuild writes both.

Tests added: `reindexJobs.test.ts` +6 (M1: a timer started inside a hold
and run after it, and a sync runner's run requested inside one, both wait
in line — and `outsideQueue` drops a live hold; M2: a reindex behind a
held line answers `busy` within the bound, its `queue.wait` ending
`gaveUp`, its place in line gone, nothing rebuilt; L3: fresh indexes are
skipped for `instance` and `ifStale`, never for a plain API rebuild, and
rebuilt when the version or HEAD is stale; the part-way failure).
`instance.test.ts` +3 (L1: a sync under another holder's sync lock is
`busy`, unrecorded, the sync state untouched; M2: a push whose receiving
side goes silent is cut off as `unreachable`; the ssh command and when the
person's own wins) and the D4 case now checks that no push-only sync left
a record. `jobSurfaces.test.ts` +5 (L6: Retry of each kind refused over the
API and the local seat; L2: the record rule, both ways, and a discarded
sync's id answering 404 over the API and `not_found` over MCP). Playwright
`git.spec`'s 39b case: the rebuild's job page shows "A rebuild is not
retried" and no Retry button.

Review-round gates: both typechecks clean; the affected vitest files
(reindexJobs, queue, queueRegistration, instance, jobSurfaces, jobs,
curationGit, mcp, curatorSkill, specVersions) **10 files / 320 tests**; the
full vitest **110 files / 2275 tests**; Playwright (build mode,
`heavy-pw.sh`) `jobs.spec`, `git.spec`, `mirror-role.spec` — **47 passed**.

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

**Reindex needed: no.** No index, spec or content shape changed; the new
state lives in three files under the content repository's git directory.
**Deploy:** `pnpm workstation update` and the Pi's next `pnpm deploy:pi`
(the Pi gets the new `PUT /api/git/standing` route and the banner). Both
optional settings are the workstation's: `RECIPE_NOTIFY_URL` in
`~/.config/recipe-deploy/workstation.env`, then `pnpm workstation restart`.

**Built.**

- **D4, a standing conflict** (`packages/cms/git/syncState.ts`). A
  mirror's sync record gains `conflictSince` (the first `conflict`) and
  `conflictJob` (the `git-sync` job that last hit it; `gitSync` passes
  its job id to `recordSyncAttempt`). Every outcome that cannot tell
  whether the conflict is resolved — `blocked` while a person merges on
  `/git`, `busy`, `raced`, `unreachable`, `mirror_dirty`, `error` — keeps
  them; only `nothing` or `synced` clears them (Dd1). `attentionKey` and
  `attentionText` read `conflictSince`, so the workstation's banner, its
  notifications, its reminder and what the mirror is told all agree.
- **D4, the mirror is told, two ways** (new `controller/instance/standing.ts`).
  The workstation's standing state for a mirror is
  `{asOf, conflict: {since, job?} | null}` (`standingOf`).
  - **Every `/api/git/sync` answer** carries it as `standing`, whatever
    the run's outcome — a ping answered `busy` or `blocked` still says the
    conflict stands, one answered `nothing` says it is gone. The pinger
    keeps it (`recordStanding`); an answer without it (a workstation from
    before 39d, an error) leaves what the mirror knew.
  - **Pushed after the workstation's own syncs** — the startup sync, its
    ref watcher, Sync now answer no mirror, which is how a conflict found
    there never reached the Pi before. `runMirrorSync` calls
    `pushStanding` after every sync: when the standing key
    (`conflict:<since>` or `clear`) differs from the one the mirror last
    accepted (`standingSent` on the record), it sends
    `PUT /api/git/standing` to the mirror's editor — the same URL and
    token as the site settings (28-D7: `mirrorUrls[<remote>]` or the ssh
    host on :3000, `MIRROR_SYNC_TOKEN`). A failure keeps the old key,
    records `error`, and is retried after the next sync; it is logged once
    per new error. Nothing sent counts as `clear`, so a workstation that
    never conflicts never sends (Dd2).
  - **On the mirror** the new route (`src/app/api/git/standing`, write
    token, 403 on a workstation, 400 for a malformed body) and the pinger
    both write `.git/discontent-workstation.json` through
    `recordStanding`: the newest `asOf` wins (the workstation's own clock
    on both paths), so a late ping answer cannot undo a newer push.
  - **What the mirror shows:** `SyncAttentionBanner`, on `/git` and
    Maintenance, renders on a mirror from that file: "**<Workstation> hit
    a conflict at <time>.** Your edits here are safe; resolve it on
    <workstation>. This editor keeps saving and committing, and
    <workstation> merges its commits on the next sync after the conflict
    is resolved." — with "The sync's steps on <workstation>" linking
    `${WORKSTATION_URL}/jobs/<job>` when both are known. Gone once a
    newer "clear" arrives.
  - **On the workstation** the banner says "Since <time>." and links "The
    sync that hit it" (`/jobs/<id>`, D2's `git-sync` job — kept, since a
    conflict is a failed job, Db7); the Mirrors card adds "Conflict
    standing since <time> · the sync that hit it · <mirror>'s editor was
    told / not told: <why> / hears of it on its next ping".
- **D5, `RECIPE_NOTIFY_URL`** (`controller/instance/notify.ts`).
  `webhookNotify` POSTs the body as `text/plain; charset=utf-8` with the
  title in a `Title` header (Dd5), a 10 s timeout, `redirect: "error"`,
  and the response body cancelled unread. `notifyPerson` = the desktop
  plus a `void webhookNotify(…)`, so a sync never waits for it.
  `notifyUrlConfig`: off unless set; `https:` only, or `http:` for
  `localhost`, `127.0.0.1` and `[::1]` (Dd6). An unusable value is logged
  once ("RECIPE_NOTIFY_URL ignored: it must be https (http only for
  localhost).") and the Mirrors card says "set, but ignored: …". Every
  log line names the URL as `scheme://host/…` (`describeNotifyUrl`), and
  `redactNotifyUrl` scrubs the whole URL, its path and every segment, its
  query and each value, and any user or password from an error's text; a
  refusal is logged by status (`HTTP 404`), never by body. The Mirrors
  card (shown only when a mirror is configured, so the `git-page` baseline
  is unchanged) says "RECIPE_NOTIFY_URL set" or "not set".
- **D5, once per new state, persisted, and a daily reminder** (new
  `controller/instance/attention.ts`). `noteAttention(dir, remote)` reads
  the record: a key that differs from the one last told is notified
  (`attention: {key, since, at}` written on the record); a cleared one is
  forgotten; the same key is reminded once `REMINDER_INTERVAL_MS` (24 h)
  has passed since the last word — "Still unresolved: Recipe sync with
  uraninite: conflict" / "Since <date>. …" — for a conflict or a dirty
  mirror only (Dd8). Checked after every sync the running instance makes
  (`runMirrorSync`, so a ping's sync and Sync now notify too — 28c told
  only the runner's) and by an hourly, unref'd timer on the workstation
  (`REMINDER_CHECK_MS`, cleared on `close`). One check at a time in the
  process. Never from a sync outside a running instance (a Playwright
  server, a script): no notification pops on the desk from a test.
- **D6, the export staleness hint** (new `controller/exportStamp.ts`,
  `export/ExportStaleness.tsx`). `buildExport` reads HEAD after its
  pre-build rebuild and hands `commandAction` an `onSuccess` that writes
  `.git/discontent-export.json` (`{head, at}`) once the build exits 0.
  The Export page, above the switch and the buttons: "No export recorded
  yet: the next Build that finishes is.", "Up to date: the last export
  (<time>) was built from the current commit.", "N commits since the
  last export (<time>)." (`rev-list --count <head>..HEAD`), or "The last
  export (<time>) was built from a commit this history no longer has."
  Deploy records nothing (it publishes the last build). Export stays
  manual (28-D8).
- **Docs:** `deploy-pi.md` has a new section (the Pi's banner, where
  `RECIPE_NOTIFY_URL` goes, why `deploy:pi` does not copy it) and its old
  "open questions" answered; `agent-epic-28.md`'s Deferred "Phone
  notifications" is struck; `scripts/workstation-editor.sh`'s header
  names the optional variable.

**Decisions.**

- **Dd1 — A conflict stands until a sync succeeds.** Before, the record
  said only the last outcome, so a `blocked` (the person mid-merge on
  `/git`) or a `busy` replaced the conflict, and the banner and the
  notification key went with it — then came back on the next conflict as
  "new". The conflict is a fact about the two histories, ended only by a
  sync that merged (or found nothing to merge); everything else leaves it
  standing.
- **Dd2 — Answer and push, both.** The answer alone misses every conflict
  the workstation finds by itself (its startup, its watcher, Sync now)
  until the Pi next pings; the push alone misses a Pi that was down when
  it was sent. The workstation already knows the Pi's editor URL and
  token (28-D7), so the push is one HTTP call on a change of key, never a
  ref or a note in the content history. The newest-wins guard (`asOf`,
  always the workstation's clock) makes the two paths safe to cross.
- **Dd3 — How the Pi learns the conflict cleared.** Resolving it on the
  workstation ends in a sync that pushes the merge to the Pi: that sync's
  `pushStanding` sends `clear`, and the push moves the Pi's HEAD, whose
  ping gets an answer saying `clear` too. If the Pi's editor was down
  then, the failed send is retried after the next sync, and the Pi's
  startup ping asks anyway — so the banner can be stale only while the
  Pi's editor is not running, when nobody sees it. If the workstation is
  down, a conflict cannot be resolved either, so there is nothing to
  learn. Enough; no timer on the Pi (28-D4's "no polling" stands).
- **Dd4 — The Pi keeps working, and nothing on it merges or pushes.** Its
  edits commit locally as before; the workstation's next sync after the
  resolution merges them (the existing behaviour, now said on the banner).
  The new route writes one status file and nothing else (28-D1).
- **Dd5 — The title in a `Title` header.** ntfy reads `Title` (also
  `X-Title`); a generic webhook ignores a header it does not know and still
  gets the full text as the body. A title as the body's first line would
  show twice on ntfy. Header values are bytes, so the title is kept to
  printable ASCII (dashes mapped, anything else `?`; today's titles are
  ASCII anyway). No ntfy-only headers (`Tags`, `Priority`): the code stays
  service-neutral.
- **Dd6 — https only, except loopback.** The URL carries a secret, so
  plain http could leak it anywhere but the machine itself;
  `http://localhost`, `127.0.0.1` and `[::1]` stay allowed for a local
  relay or a test listener. Nothing is sent to an unusable value, and the
  pages show only "set" / "not set" / "set, but ignored: <reason>".
- **Dd7 — Only the workstation notifies.** It is the only place a sync runs
  (28-D1), so it sees every attention state first-hand; the Pi learns them
  second-hand, and two senders would say everything twice. The one thing
  only the Pi could see — "the workstation is not answering my pings" — is
  normal whenever tourmaline sleeps, so it would be a nightly false alarm.
  Hence `deploy:pi` does not copy `RECIPE_NOTIFY_URL`, and `deploy-pi.md`
  says where it goes.
- **Dd8 — The reminder repeats a conflict or a dirty mirror, not "keeps
  failing".** Those two end only by a person's hand; three failures in a
  row are most often the Pi switched off, which needs no daily nag (it is
  still notified once). The clock and the last key live on the record, so
  the 28c behaviour of notifying again at every restart is gone too: a
  standing state is told once, then daily.
- **Dd9 — The export stamp is the build's, read after its rebuild,
  written on exit 0.** The rebuild just before the build is what the
  export reads; a failed or refused build ("A build is already currently
  running!") records nothing, and Deploy publishes `out/` without
  touching it. In the git directory, like the index and sync stamps, so
  it never enters the content history.
- **Dd10 — The banner links the last conflict's job.** `conflictJob` is
  updated on every `conflict`, so the link shows the newest steps (the
  message names today's conflicting files); `conflictSince` keeps the
  first time. A job the store could not write is a 404 link — accepted.

**Tests.** New `test/piSync.test.ts` (10, node, every `fetch` stubbed):
the conflict stands through `blocked`, `busy`, `raced`, `unreachable`,
`mirror_dirty` and `error`, keeps its first time, takes the newest job,
carries the attention record, and a success clears it; a real conflict
on scratch repos (`gitSync`) → `standingOf` → a ping answered `busy`
with it → the mirror's file says conflict; an answer without `standing`,
and a 500 with a malformed one, keep it; an older `clear` is refused; a
newer one clears it; `syncMirror` (the runner's, Sync now's and a ping's
path) on a conflict PUTs `/api/git/standing` with the job's id and
records `standingSent`, sends no site settings, and — with no running
instance — tells nobody; `pushStanding` sends nothing for a workstation
that never conflicted, once per key, not again through a `busy`, and a
503 is recorded, marked repeated, then retried to `sent`;
`notifyUrlConfig` / `notifyUrlStatus` (https, the three loopback hosts,
refusals that never repeat the URL); a conflict notified once (not again
after a `busy`), POSTed with the `Title` header and the text body; a
relay refusing the connection with an error that names the whole URL,
and a 404 whose body names the topic, both logged with the secret path,
the token and `auth=` absent from every captured log line and result,
`https://ntfy.example/…` present; unset sends nothing; the reminder at
+1 h none, after a module reset (a restart) +23 h none, +24 h one, +30 h
none, +48 h one, `since` kept; three failures notified once and never
reminded; the export hint never → current → behind 2 → unknown, the
stamp in the git directory with the tree clean, none outside a repo.
Playwright: `mirror-role.spec` +1 (the route's 401 and 400, a conflict
told → the banner on `/git` and Maintenance with its `<time>`, an older
`clear` not kept, a newer one clears both pages) and the workstation's
403 for the route; `git.spec`'s 28b sync answers `standing` with
`conflict: null`; new `export-page.spec` (never → up to date → 1 → 2
commits). `exportAction.test.ts` +1 (the build's `onSuccess` writes the
stamp with the HEAD read after the rebuild, and nothing is written before
it runs); its existing case now expects that third argument.

**Gates.** Both typechecks clean; eslint clean on the changed files; full
vitest **111 files / 2286 tests** passed. Playwright (build mode,
`heavy-pw.sh`): `git`, `mirror-role`, `mirrors-card`, `export-page`,
`settings-nav`, `visual` (e2e + mobile) — **72 / 72** passed (5.1 min); the
`git-page` baseline did not move (the Mirrors card's new line shows only
with a mirror, and every new time is a masked `<time>`).

**Review round.** Eight findings, fixed as new commits; what above they
amend is named.

- **The sync state's writers share one lock (medium; Dd11).** The hourly
  reminder timer called `noteAttention` → `patchMirrorState` outside the
  instance's mutex and every lock, so a sync recording its attempt meanwhile
  — in this process, or the CLI's or MCP's `git sync` under the sync lock in
  another — could be overwritten, losing `conflictSince`, and the next
  `pushStanding` told the Pi "clear". The temp name `<path>.<pid>.tmp` was
  also shared by two writers in one process, which could tear the file
  (`readSyncState` then answers `{}`). Now every change to
  `.git/discontent-sync.json` — `recordSyncAttempt`, `patchMirrorState`,
  `recordSettingsPush`, and the new `updateMirrorState` — is one
  read-modify-write under `discontent-sync.json.lock` (the write lock's
  primitive, `fileLock.ts`: created whole, stale on a dead pid or after
  30 s, a 10 s wait), with a random temp name (`randomUUID`). The timer
  runs inside `instance.exclusive`; `noteAttention` looks and writes in one
  `updateMirrorState` step and notifies after it, so two checks never both
  tell one state (the in-process chain it had is gone). The standing and
  export stamps' temp names are random too.
- **Strict standing times (low; Dd12; amends "On the mirror").**
  `parseStanding` takes ISO-8601 UTC only (`YYYY-MM-DDTHH:MM:SS[.mmm]Z`),
  not whatever `Date.parse` takes. `PUT /api/git/standing` answers 400 for
  an `asOf` more than a day ahead of the Pi's clock (`MAX_AHEAD_MS`,
  `standingTooFarAhead`); the pinger ignores such an answer; a stored one
  (none exist — 39d is undeployed) no longer counts as newer. A
  `200 {kept: false}` is a failure on the workstation ("it holds a newer
  state than this one"): the key is not recorded, the Mirrors card says
  "not told", the next sync sends a newer state, and a refusal that
  persists is logged once (the message carries no time, so it repeats).
- **A conflict's key names which conflict (low; Dd13; amends D5's "once
  per new state").** `attentionKey` is `<remote>:conflict:<conflictSince>`
  (plain `<remote>:conflict` only for a record without one). A conflict
  that cleared by a sync no attention check followed (the CLI's) and came
  back is told again. The reminder's "Since" is the conflict's own
  `conflictSince`, not the time it was first notified.
- **Several mirrors (low; Dd14).** The pinger sends `{remote}` when the
  mirror has `WORKSTATION_REMOTE` (a valid remote name; anything else is
  ignored), `{}` otherwise; `/api/git/sync` already syncs and answers for
  the named remote, and for the first configured mirror without one.
- **No standing push after `unreachable` (low; Dd15).** `runMirrorSync`
  skips `pushStanding` when the sync answered `unreachable`; the send's
  timeout is 5 s (`STANDING_TIMEOUT_MS`, was 15 s) and it refuses
  redirects (`redirect: "error"`).
- **The export hint checks ancestry (low; Dd16; amends D6).** A stamp that
  is not an ancestor of HEAD (HEAD reset past it, or a diverged line) reads
  "built from a commit this history no longer has", not "Up to date" or a
  count (Td5).
- **`commandAction` takes no callback (nit; Dd17; amends D6 and Td3).** The
  build runner moved to `src/app/(recipes)/runCommand.ts`, a plain server
  module; `commandAction` (the `"use server"` export, Deploy) calls it with
  none, `buildExport` with the stamp's `onSuccess`. The running stream lives
  on `globalThis`, so Build and Deploy still see each other's run.
- **Test gaps.** `test/instance.test.ts` clears `RECIPE_NOTIFY_URL` (and
  `WORKSTATION_REMOTE`) before each test, as `piSync.test.ts` does.

**Decisions (review round).**

- **Dd11 — The lock lives with the file, and is a leaf.** One lock beside
  the file, taken by every function that changes it, rather than asking
  each caller to hold the sync lock: the sync lock is non-blocking (a
  second holder is `busy`), it is not held by the post-sync sends, and
  the CLI's `git sync` records under it in another process. The state lock
  is held for one read and one write and never while taking another lock,
  so it sits below 39b's order (Db5: the repository's line → the sync lock
  → the write lock) without a cycle; the timer takes only the instance's
  mutex, then it. A lock that cannot be had in 10 s is warned about once
  and the change made anyway: a status line kept unlocked beats one lost.
- **Dd12 — The receiver bounds the future; the sender treats "not kept"
  as not told.** The newest `asOf` wins, so a bad clock or a hand-made
  request could freeze the Pi's banner; a day covers any honest drift on
  NTP. On the workstation `kept: false` means the Pi already holds a newer
  state, so saying "was told" would be false; retrying on the next sync is
  free (a newer `asOf`), and a persistent refusal is one log line.
- **Dd13 — The conflict's own time is part of its key.** The key changes
  exactly when the conflict does, whoever saw it clear.
- **Dd14 — Name the mirror only when there are several.** Tokens are users'
  API tokens, shared by every client, so they cannot tell mirrors apart
  cheaply; a name the mirror sends is opt-in, backward compatible (an old
  workstation already accepted `{remote}`; an old mirror's `{}` means the
  first mirror, as before), and needs nothing for the one mirror there is.
- **Dd15 — An unreachable mirror is not sent to.** Its editor is down too,
  most likely; the Pi's startup ping asks for the state anyway, and the
  next reachable sync sends what is owed.
- **Dd16 — "Up to date" needs the stamp to be an ancestor of HEAD.**
- **Dd17 — A server action takes only data from a client.** A
  `"use server"` export with a function parameter invites a client to pass
  one; the callback is a server-side concern, so it moved behind a plain
  module.

**Tests (review round).** `test/piSync.test.ts` +9: a patch waits while
another process holds the state lock and keeps the conflict that process
wrote (the timer's look notifies it, `standingOf` still says conflict);
five rounds of a sync's record, two patches and a settings send at once
leave valid JSON with every change and no temp file; conflict → cleared
by a sync nobody looked at → a new conflict is notified again, and its
reminder says "Since" the conflict's time; strict times (six spellings
refused) and the one-day bound; a far-future answer ignored by the pinger,
and a stored one losing to an honest one; `kept: false` recorded as not
told, repeated once, then sent — every send with `redirect: "error"` and a
signal; no PUT after an `unreachable` sync; the ping's body `{}` /
`{"remote":"uraninite"}` / `{}` for an invalid name; HEAD reset past the
export's commit, and a diverged line, read "unknown". The existing key
expectations now carry `conflictSince`. `exportAction.test.ts` mocks
`runCommand`. Playwright `mirror-role.spec`: the route answers 400 for a
non-ISO `asOf` and for one three days ahead, and 403 to a read-scoped
token.

**Gates (review round).** Both typechecks clean; eslint clean on the changed
files; the affected files (`piSync`, `instance`, `exportAction`,
`specVersions`) green, `piSync` four runs in a row; full vitest **111
files / 2295 tests** passed. Playwright (build mode, `heavy-pw.sh`): `git`,
`mirror-role`, `mirrors-card`, `export-page` — **41 / 41** passed
(1.7 min). No baseline moved; no reindex needed.

### 39e — Hygiene

**`paceKey` by registrable domain (38-Db6).**

- **De1 — `tldts`, the private section on, and a two-entry shared-host
  list.** `tldts@7.0.21` was already in the lockfile (under tough-cookie
  6), so it is now a direct dependency of `recipe-website-common` at that
  exact version: one importer entry in `pnpm-lock.yaml`, no download.
  `paceKey` (`common/util/roundupPage.ts`) is
  `getDomain(host, {allowPrivateDomains: true})`: `a.example.co.uk` ≡
  `b.example.co.uk` ≡ `example.co.uk`, `www.x.com` ≡ `cdn.x.com` ≡ `x.com`,
  `example.co.uk` ≢ `other.co.uk`. The private section keeps
  `*.cloudfront.net`, `*.github.io`, `*.blogspot.com` and
  `*.s3.amazonaws.com` tenants apart, which was Db6's worry. Two shared
  hosts the list doesn't know, `wp.com` (Jetpack's `i0`/`i1`/`i2`) and
  `wordpress.com` (one blog per subdomain), are keyed by the host as
  before (`SHARED_HOSTS`), as is a host that is itself a public suffix.
  IP literals and single labels (`127.0.0.1:4001`, `[::1]:4001`,
  `localhost:3019`) keep their port. `tldts` is server-only here:
  `roundupPage.ts` is imported only by editor controllers.
- **`siteKey`** (the page parsers: share targets, a roundup's same-site
  links first) now uses the same list, ICANN section only. It stays
  separate from `paceKey`, since grouping a CDN with its tenants is
  harmless for ordering links, but `bbcgoodfood.co.uk` no longer reads
  as `co.uk`.
- **The callers agree.** `SitePacer.site()` (the per-process line, the
  queue's `site:<key>` slot, `droppedReason` / the machine-wide
  `dropped.json`) and `settleChunk` (the picker's dropped picks) already
  called `paceKey`, so they move together. `jobs/timeline.ts` and
  `views.ts` only read the `site:` resource back. `steps.ts` and
  `ytdlp.ts` take a hostname for display, and the reading-cache keys
  (`importRecipe.ts`, `kinds.ts`) identify a page, not a site. None of
  those is a pacing key, so they stay as they are.
- **The cost.** A page's own CDN subdomain (`cdn.example.com`) now waits
  its turn behind the page, 15 s apart, where 38b paced it separately.
  That is 30-D5's "one site". Most recipe sites serve their pictures from
  the page's own host anyway. Old `site:<host>` directories and drops
  under the previous keys expire on their own (an hour, a day idle).

**resume-builder.** `globals.css`'s `@source` now points at
`node_modules/@discontent/component-library/components` (the
pre-rename path matched nothing). Screenshots of every page at 1280 and
390 px, build mode, before and after:

- **Changed, better:** `/new-resume`, `/resume/<slug>/edit`, `…/copy`
  and `/settings`. The kit's text inputs get their border and padding;
  before, they were invisible on the dark background (labels with no
  field under them). The kit's "Append Skill", the new-resume Submit and
  "Reload Database" become solid buttons where they were bare text.
- **Unchanged (byte-identical):** `/`, `/resumes` (one resume and empty),
  `/resume/<slug>`. These use only the app's own classes.
- **Regressed, then fixed:** with 25 resumes, `/resumes`' kit
  `ListPagination` (the backlog's 35q case) rendered with each chevron
  stretched by the unlayered global `svg {width: 100%}` rule (Te1). That
  rule moved into `@layer base`, after which only the paginated shots
  changed: "‹ Newer · 2" / "1 · Older ›" lay out as in the editors. The
  rule still sizes un-classed inline SVGs as before. The view page's icons
  are `<img>`, so it doesn't touch them.
- One inconsistency is left as it is. The kit's buttons are the kit's
  near-black `primary`, beside the app's own slate "Append Item" and the
  edit form's slate Submit. That's a design choice for the resume app,
  not a regression.

resume-builder Playwright (`e2e`, `next build` + `next start` on 3010):
**44 passed / 7 failed before, 44 / 7 after, and the same 7** (Te2). The 7
are create ×2, update ×2, git ×2 and view ×1. Each one expects the view
page to show the company (it doesn't render it), a Cancel link on the
edit page (there is none), or an "Update resume" commit after an edit.
They're pre-existing app/test drift, out of this phase's scope; a
backlog row records them.

**Docs.** `agent-epic-36.md`: the **Now** line, the 36d/36e roadmap rows
(✅ #234 / #235) and two rows in "What landed". `agent-epic-37.md`: both
AA-contrast rows (Backlog, Close-out backlog) struck, **Done in 38a**
(38-Da5, checked in the code: `border-l-2 border-destructive` in the
form, `BatchPicker`, `RoundupImport`, `ImportProgress`). `backlog.md`:
"Featured recipes as a group kind" struck as **superseded by taxonomy
D5**; the `paceKey` row and the resume-builder `@source` row struck,
**Done in 39e**; a new row for resume-builder's 7 red specs. The sweep for
other rows done by epics 36–38 found none still open: every 36–38 row
was already struck, and the open ones (Tb5's form panel, the reading
cache, Te6, Dg9 → 39a; held ticks → 39c; Te7, the plain-text sub-recipe,
F32 borrowing, term clouds, 2c) aren't done. The 29 doc's Pi number
belongs to 39b.

**Tests.** `roundupPage.test` (the old `.co.uk`/CDN test is replaced by
two): `siteKey`'s registrable domain, and `paceKey`'s ≡ / ≢ pairs, the
private section, `SHARED_HOSTS`, a trailing dot, a host that is a public
suffix, IPv4/IPv6/`localhost` ports. `queue.test` +1: a drop on
`a.example.co.uk` refuses `b.example.co.uk` from another process's pacer
and writes `site:example.co.uk/dropped.json`, while `other.co.uk`, the
next `wp.com` host and the next `cloudfront.net` tenant are still asked.
`roundupPicker.test`: the dropped-pick case now keys on `example.co.uk`,
and `other.co.uk` goes back on the queue.

**Gates.** `recipe-editor` typecheck clean; `recipe-website` `tsc
--noEmit` clean; `pnpm exec vitest run` **105 files / 2195 tests**
passed; resume-builder Playwright as above (twice more for the
pagination fix: the screenshot spec 18/18 and the full run with the same
44 + 7); `import-roundup.spec` (build mode, e2e + mobile) **5/5** — the
picker's pacing path; its fixtures are loopback, whose keys are
unchanged.

### 39f — Content calls

**Applied 2026-10-17.** Roger: "All your recommendations sound good." So
the three writes went in (C2, C6, C7) and the other calls closed with no
write (C1 keeps both kid-party drinks; C3, C4, C5 close; the other 41
facet calls stay as filed). By the epic-33 method (D7): a scratch-clone
dry run of the same three CLI commands (exactly three commits, only those
fields in `git log -p`), `pnpm workstation stop`, the real apply with
`--content-dir /home/roger/Projects/recipe-content`, `pnpm workstation
restart`, `POST /api/revalidate`. The real repo's counts matched the dry
run line for line. The session pushed nothing; the workstation's own sync
carries the commits to the Pi.

| Call | Content commit | Command                                                                                                    |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| C2   | `ba5017ab`     | `recipes update red-wine-spritzer-acouplecooks --file patch.json` (the whole `source`, only `url` changed) |
| C6   | `d0161649`     | `recipes term assign american --remove <salad> --remove <salad> --remove <salad>` (one commit, F34)        |
| C7   | `245b208d`     | `recipes term assign main --add shumai-chinese-steamed-dumplings`                                          |

| Count (real repo)                    | Before (`746e4336`)                               | After (`245b208d`)                                                                          |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tag:american`                       | 179                                               | 176                                                                                         |
| `tag:main`                           | 132                                               | 133                                                                                         |
| `tag:snack`                          | 39                                                | 39 (shumai keeps `snack`)                                                                   |
| `red-wine-spritzer-acouplecooks` url | `https://www.acouplecooks.com/red-wine-spritzer/` | `http://web.archive.org/web/20231207101946/https://www.acouplecooks.com/red-wine-spritzer/` |

Spot checks on the workstation after the revalidate: the spritzer page
links the snapshot, `/tags/american` no longer lists the salads,
`/tags/main` lists shumai. Trap for the next run: `term assign` takes one
carrier per flag (`--remove a --remove b`); a space-separated list is a
`usage` error and writes nothing.

**Before the answers (wave 0).** The call list was a scratch file,
`content-calls.md`; its content is below so it survives.

**Findings.**

- Epic 33's 51 uncertain facet calls were **recoverable** from its scratch
  (`tmp/33/assign/batch-*.json`, the `uncertain` maps), so no regeneration
  pass was needed. Checked against the repo now: 564 food recipes, **every
  one with a course facet**; no one-off cuisine (Korean, Thai, German,
  Colombian, Turkish ×2, Swedish ×2, Hawaiian) has reached the 3-recipe bar
  for its own child. 4 of the 51 were already settled (kefir and the
  non-alcoholic piña colada under 33-D4's exemptions, marble rye merged in
  epic 35, white chili checked in 38f). 41 are recommended "keep as filed".
- `Sake-Cosmo-9.jpg` (9.6 MB, 3695×4873) is a web download, not a phone
  original (28-D11). Resizing it now would not shrink the repo: the
  original stays in git history, and the site serves 2–60 KB webp variants
  already. 15 other uploads are over 3 MB (phone photos and a 12.8 MB kefir
  video): git-annex territory (28-D9), not a one-off resize.
- The Wayback Machine has the red-wine-spritzer original (snapshot
  2023-12-07).

**The calls (Roger's, in chat).**

| Call | What                                                                                                                                                                                                                                                                                         | Recommendation                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| C1   | Kid-party drinks `mermaid-lemonade-foodnetwork` (blue punch, a zero-proof kid drink) and `cotton-candy-fizz-foodnetwork` (champagne over cotton candy, 2 lines).                                                                                                                             | Keep both (the alternative: delete).                                                                    |
| C2   | Red Wine Spritzer's citation: `acouplecooks.com/red-wine-spritzer/` now redirects to the white-wine spritzer, which has no red variation.                                                                                                                                                    | Set `source.url` to the Wayback snapshot (`web.archive.org/web/20231207101946/…`); one `recipe_update`. |
| C3   | Spicy Cascara Highball: no real recipe page was found in epic 31; the alcohol-free Cascara Dark & Stormy covers cascara.                                                                                                                                                                     | Close, no recipe (unless Roger has a source).                                                           |
| C4   | Zero-Proof Spritz.                                                                                                                                                                                                                                                                           | Close as covered by `zero-proof-aperol-spritz-acouplecooks`.                                            |
| C5   | `Sake-Cosmo-9.jpg`, 9.6 MB.                                                                                                                                                                                                                                                                  | Close, no resize (above).                                                                               |
| C6   | `apple-walnut-blue-cheese-salad-with-honey-dijon-dressing`, `butter-lettuce-with-blue-cheese-apples-and-candied-pecans`, `fall-apple-and-walnut-salad-with-apple-cider-vinaigrette` carry `american` from before epic 33; by its rule (no cuisine on generic dishes) they would not get one. | Remove `american`: one `term assign american --remove …`, one commit.                                   |
| C7   | `shumai-chinese-steamed-dumplings` is `snack` only; every other filled dumpling or bun (gyoza, char siu bao, ground-beef bao, nikuman, khinkali) is a `main`.                                                                                                                                | Add `main`: one `term assign main --add …`.                                                             |

The other 41 uncertain calls are recommended "keep as filed" with no write
(each with its one-line reason in the call list: for example the
black-bean brownies stay chocolate, not beans; Swedish meatballs, Korean
wings and Thai peanut chicken get no cuisine; risotto, spanakopita and
gyoza are mains; Reuben is American; tomato soup and crispy rice are not
vegetarian).

**Method once answered** (epic 33, D7): `pnpm workstation stop`, a
scratch-clone dry run of the same commands, the diff reviewed, the real
apply through the CLI with `--content-dir /home/roger/Projects/recipe-content`,
`pnpm workstation restart`, then `POST /api/revalidate`. At most 4 commits.
Never pushed: the workstation's own sync carries them to the Pi.

## Close-out

Closed 2026-10-17: 39a–39e and 39-close merged; 39f applied the same day
(content `ba5017ab`..`245b208d`, three commits).
No phase changes an index layout or content shape, so nothing here needs a
manual reindex.

### What shipped, phase by phase

- **39a, import reliability (#254).** A form import whose job record could
  not be written no longer ends in a false "finished": the panel says it
  cannot be followed step by step, waits for the outcome by a bounded
  long-poll, and Cancel still works. Warnings and commit notes name the
  reader that answered ("local model qwen3:8b", "Claude API
  claude-sonnet-5") instead of always "local model". `--fresh` (CLI),
  `fresh: true` (API and MCP `recipe_import`), `jobs retry --fresh` and a
  "Read it again" box on `/jobs/<id>` skip the 30-minute reading cache. The
  vision model's Ollama digest joined the transcript key, so a re-pull
  invalidates saved transcripts (the first photo import after the update
  reads its photos again, once). `import-list` prints a model line per
  item.
- **39b, reindex follow-through (#256).** An index-version stamp
  (`.git/discontent-index-version`, a hash of every aggregate and
  pagination spec) makes either role rebuild stale indexes once at start,
  so a deploy that bumps a spec needs no manual reindex. `git_status`,
  `/git` and the stale-index banner show the version. Reindex and git sync
  are jobs (`reindex`, `git-sync`) on a per-repository queue line, visible
  on `/jobs` with per-type steps, cancellable only before the swap; a
  person's rebuild waits at most 30 s behind a sync, then answers `busy`;
  a fetch or push is cut off on silence. A sync leaves a job only when it
  merged, conflicted or failed. Retry is refused for both kinds.
- **39c, cooking UX (#253).** Browser-held shopping ticks expire after
  7 days with a dismissible notice. `/shopping` gets a "Sub-recipes" fold
  with "Remove these" to undo a sub-recipe expansion (an item goes whole
  when the slug is anywhere in its path; the linking line is not put
  back). Recipes with 15 or more lines get a "Jump to Ingredients ·
  Instructions" row (the headings carry ids), in the editor and the export.
- **39d, unattended Pi sync (#257).** The workstation tells the Pi when its
  sync conflicts (in every `/api/git/sync` answer and by a pushed
  `PUT /api/git/standing`), so the Pi's `/git` and Maintenance show a
  banner while its edits stay safe. `RECIPE_NOTIFY_URL` (https, or http
  for loopback; redacted in logs) receives the desktop's attention events
  from the workstation only, once per new state, with a daily reminder for
  a conflict or a dirty mirror. The Export page says how many commits have
  landed since the last export; export stays manual (28-D8).
- **39e, hygiene (#255).** `paceKey` keys on the registrable domain
  (`tldts`, private section on; `wp.com` and `wordpress.com` stay keyed by
  host), so a site's CDN subdomain now waits its turn behind the page.
  resume-builder's Tailwind `@source` points at the real component-library
  path (its form inputs and buttons now render), with a global `svg` rule
  moved into `@layer base` to keep pagination chevrons sized. Doc and
  backlog hygiene for epics 36–38.
- **39f, content calls.** Roger took every recommendation: the red-wine
  spritzer cites the Wayback snapshot, three generic salads lost
  `american`, shumai gained `main`; the other calls closed with no write
  (39f's Results).

### Measurements

**39a: the vision re-measure** (Ollama 0.40.5, RX 6600 on Vulkan,
2026-10-16, a banana-bread card photo, dry run, `--fresh`):

| Run                | `vision.transcribe`                               | Runner                                        | `llm.extract` (qwen3:8b)     | Grounded    | Wall   |
| ------------------ | ------------------------------------------------- | --------------------------------------------- | ---------------------------- | ----------- | ------ |
| 1024 px (the cap)  | 23.7 s (load 7.7 s, 99 tok @ 15 tok/s), 100% GPU  | fine                                          | 20.4 s (load 9.5 s), 89% GPU | 8/8 trusted | 44.3 s |
| 1568 px (uncapped) | failed after 13.0 s ("stopped without an answer") | crashed, `vk::Queue::submit: ErrorDeviceLost` | not reached                  | not reached | 15.2 s |

1568 px still crashes the vision runner under 0.40.5, so the 1024 px cap
stays (38-Te5). New: qwen3:8b now lands 10%/90% CPU/GPU at idle because the
desktop holds about 0.8 GB of VRAM after a reboot (backlog row, Ta6); a
slowdown, not a failure.

**39b: reindex** (a scratch clone at `746e4336`: 787 recipes, 24 featured,
135 term records; `scripts/measure-reindex.ts`, 7 runs):

| Run                                  | recipes min / med | total min / med |
| ------------------------------------ | ----------------- | --------------- |
| dev React, load 16–20                | 1157 / 1249 ms    | 1391 / 1496 ms  |
| dev React, load ~9–10                | 900 / 1148 ms     | 1107 / 1312 ms  |
| `NODE_ENV=production`, load ~13      | 575 / 673 ms      | 699 / 867 ms    |
| epic 29 (644 recipes, dev, load ~10) | 401 / 552 ms      | 455 / 644 ms    |

The production row is what the editor pays: about 0.7 s, inside 29-D4's
one-second bound. The Pi's 4.9 s at the last deploy is its cold rebuild
(29a's 4.1 s at 644 recipes scales to 5.0 s at 787); the warm number is
pending Roger's next deploy. **Go/no-go: no-go** on incremental reindex
(29b–29d); the trigger is restated as the Pi's warm median passing about
5 s (or a cold deploy rebuild of about 8 s). Full numbers are in
`agent-epic-29.md`.

### Roger's steps

1. `pnpm workstation update` (main checkout). **No manual reindex:** 39b's
   index-version stamp makes the workstation rebuild its indexes once at its
   first start after the update (Tb1), and on any later deploy that bumps a
   spec.
2. The 38g lines in `~/.config/recipe-deploy/uraninite.env`
   (`RECIPE_LLM_API=anthropic`, `RECIPE_LLM_API_KEY=…`), if not yet done.
3. `pnpm deploy:pi`. It brings 39d's `PUT /api/git/standing` route (until
   then the workstation's conflict pushes get a 404, which is harmless,
   Td2) and the stamp. The Pi rebuilds once at start and the deploy's
   `POST /api/reindex?ifStale=1` then skips ("already fresh"). Note the
   reindex time it prints: the 29 doc's warm-Pi trigger (about 5 s) is
   checked against it.
4. Optional: `RECIPE_NOTIFY_URL` (an ntfy-style topic URL, https) in
   `~/.config/recipe-deploy/workstation.env`, for conflict and dirty-mirror
   notifications beyond the desktop, with a daily reminder while one
   stands (workstation only, Dd7). `WORKSTATION_REMOTE` only if a second
   mirror is ever added.
5. Behaviour notes: the first photo import after the update re-transcribes
   (the vision digest joined the key, 39a); `--fresh` / "Read it again"
   bypass the reading cache; held shopping ticks expire after 7 days;
   `/jobs` now shows reindex and git-sync jobs (syncs only when they
   merged, conflicted or failed); a reindex waits up to 30 s behind a sync,
   then answers `busy`.
6. ~~39f content calls C1–C7~~ — answered and applied 2026-10-17 (three
   content commits, synced to the Pi by the workstation).
7. Local branch cleanup (Roger's call): merged `agent/28*`–`agent/30*`,
   `verify-main`, `main-local`, `portfolio/rebuild`, and about 75 unmerged
   pre-epic branches. Wave 0 removed only worktrees and merged harness
   branches.

### Backlog

Open items the phases named; each has a row in `backlog.md`.

- qwen3:8b spills 10% to the CPU at idle (Ta6, 39a): a smaller `num_ctx` for
  short extractions, or wording that names the desktop's VRAM baseline.
- resume-builder's own Playwright suite is 7 red on `main` (Te2, 39e).
- `recipes shopping remove --for <slug>` and the MCP equivalent (Dc3, 39c);
  the page and the HTTP `PATCH` have it.
- A failed start-time rebuild has no retry of its own (39b, L5): the next
  HEAD move asks again, and the stale-index banner offers Rebuild.
- Several mirrors are opt-in and lightly tested (Dd14, 39d):
  `WORKSTATION_REMOTE` names the remote, and only one mirror has run.
- Incremental reindex (29b–29d) stays deferred, with the restated trigger
  (39b).
- Uploads over 3 MB (15 files, a 12.8 MB kefir video) wait on git-annex
  activation (28-D9); `Sake-Cosmo-9.jpg` closed as no-resize (39f, C5).
- ~~39f's content calls C1–C7 (Roger's answers).~~ Applied 2026-10-17.
- A smooth scroll for the jump links (39c): not wanted; the instant jump
  also suits reduced motion.
