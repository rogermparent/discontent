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

### 39b

- **Tb1 — The first start after 39b rebuilds every instance once.** No
  repository has `.git/discontent-index-version` yet, and a missing version
  counts as stale (D1), so the workstation's first `pnpm workstation update`
  and the Pi's next deploy each rebuild at start (logged
  `[instance] no index version recorded yet; reindexing`, a `reindex` job
  labelled so). On the Pi that start-time rebuild and the deploy's own
  `POST /api/reindex` run back to back — two rebuilds, the second queued in
  the repository's line behind the first. The deploy keeps its explicit
  rebuild (it also covers a HEAD the stamp had not seen); its printed
  `timings.total` is its own rebuild, but the curl time includes the wait.
- **Tb2 — A hold leaks into fire-and-forget work started inside it.**
  `withResource` marks the resource held in the async context
  (`AsyncLocalStorage`), and a promise started inside inherits that context
  after the hold is gone. A sync's `finally` kicks the instance's deferred
  rebuild; that rebuild's `reindex` job then saw `repo:` as held and passed
  straight through the line. `outsideQueue(fn)` (`jobs/queue.ts`) runs work
  meant to outlive the hold outside it — as `outsideWriteLock` does for the
  write lock.
- **Tb3 — `measure-reindex.ts` measures React's development build.** Run
  bare under `tsx`, `NODE_ENV` is unset and `flattenMarkdown`'s element
  building costs about twice what the editor pays (787 recipes: 1.1 s
  against 0.7 s with `NODE_ENV=production`). 29a's numbers were taken the
  same way, so they compare with each other, not with the running editor.
- **Tb4 — A discarded sync's `job` names a job that no longer exists.**
  `syncMirror` answers the result with `job` (the route's body too); for a
  sync that moved nothing the record is deleted at the end (Db7), so
  `/api/jobs/<id>` answers 404 for it. Nothing follows that id today.
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

### 39c

### 39d

### 39e

### 39f

## Results

### 39a — Import reliability

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
- **Not flooding `/jobs` (Db7):** a `git-sync` whose outcome is `nothing`
  with nothing pulled or pushed leaves no record (`JOB_DISCARDS` →
  `runJob`'s `discardIf`: meta, log and cancel file deleted, through the
  meta's write chain). Every sync after a workstation commit pushes
  (recorded); the mirror's ping after that push finds nothing (discarded) —
  about half of all syncs. The sync state file and the Mirrors card still
  record every attempt. Rebuilds are always recorded: D12 rebuilds only when
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
  held line passes through it. Every holder is bounded (a lock wait of 30 s,
  60 s for a sync's merge, plus the work). Tested: a `reindex` job inside
  `withWriteLock` while another holds the line completes (`queue.skip`, no
  `queue.wait`).
- **Db6 — Cancel is refused, not ignored, past the swap.** Ignoring it would
  record a finished rebuild as `cancelled` (runJob's "cancelled is
  cancelled" rule) over indexes it had replaced; refusing tells the person.
- **Db7 — An empty sync leaves no job** (above). A sync that pulled or
  pushed, failed, raced or found the lock busy is recorded.
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

**Gates.** Both typechecks clean. vitest **106 files / 2208 tests**.
Playwright (build mode, `heavy-pw.sh`): `jobs`, `git`, `api-write`,
`mirrors-card`, `mirror-role`, `mcp-http` — **84 passed**.

### 39c — Cooking UX

### 39d — Unattended Pi sync

### 39e — Hygiene

### 39f — Content calls

## Close-out
