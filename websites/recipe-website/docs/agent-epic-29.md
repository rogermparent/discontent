# Epic 29 — Faster reindex

> **This is the durable source of truth for the epic-29 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching
> `packages/cms/content/rebuildIndex.ts`, the reindex seat
> (`editor/controller/curation/reindex.ts`), or anything that rebuilds indexes
> after a HEAD move. Update the roadmap **Status** column and the **Now** line
> at every phase boundary.
> Earlier epics are cited by number with a prefix (`28-D12`, `27-D3`).
> `packages/cms/docs/incremental-regeneration.md` is the engine's own record of
> how derived state is invalidated; `deploy-pi.md` is how the Pi runs.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** epic 29 is **closed at 29a** (2026-10-09). The batched atomic
rebuild (#182) is deployed on the Pi (`a23a488c`, the same tree as merge
9a888d64). A full reindex there went from 13.5 s to 2.5 s (median), and on
tourmaline to 0.46–0.64 s. Both are inside the decision rule, so 29b–29d
(incremental reindex) are ⏸️ deferred. The full plan for them stays below,
along with the trigger for reopening it.

## Context

Every HEAD move rebuilds all five content indexes from scratch:

- a pull, a sync merge, a foreign push picked up by `28-D12`, a revert, or a
  deploy;
- the seat is `editor/controller/curation/reindex.ts`, which runs
  `packages/cms/content/rebuildIndex.ts` once per type.

At 644 recipes that costs about **8 s on tourmaline** and **18–19 s on the
Pi**, so every sync waits on it.

Roger asked for "incremental reindex". Profiling first changed the order of
the work.

### Measured (2026-10-08)

A `recipes reindex` on a copy of the real corpus, sampled with a profiler:
10.3 s.

| Share                     | Time   |
| ------------------------- | ------ |
| Idle (waiting on commits) | 4.8 s  |
| markdown-to-jsx           | 0.4 s  |
| react                     | 0.4 s  |
| msgpackr + lmdb           | ~0.3 s |
| tsx startup and the rest  | ~4 s   |

**The cause.** `rebuildIndex` does `await dropIndex(db)`, then
`await writeToIndex(...)` (an `await db.put`) once per slug. lmdb-js resolves
each awaited put only after its own commit and fsync, so a rebuild is about
644 synced commits, one after another.

**Why the Pi is slower.** The same 644 fsyncs, on slower storage.

**A visible side effect.** The drop is its own commit, and every put after it
is another, so readers see an empty index and then a partial one while a
rebuild runs.

## Decisions

### D1 — Batch first, measure, then decide on incremental

The idle time is the bulk of the cost, and batching removes it without the
correctness surface incremental brings (diff bases, deletes, dependents,
pagination history). 29a does the batched rebuild and measures it; the
incremental phases are fully planned below but run only if 29a's numbers
still justify them. Decided with Roger.

### D2 — A full rebuild is one write transaction per content index

`replaceIndex(db, entries)` runs `clearSync()` and every put inside one
`db.transaction`. In lmdb-js 3.5.1 `clearSync` runs inline when a write
transaction is already open (`transactionSync` nests), so a reader sees the
old index or the new one, never an empty or partial one. Reading and
resolving the corpus happens _before_ the transaction, through a bounded pool
(the reference resolver caches promises, so concurrency is safe), so the
transaction holds no awaits.

The public `rebuildIndex` signature, its skip rule (a slug that fails to read
is warned about and skipped) and its cascade to dependents do not change.
`dropIndex` and `writeToIndex` stay; other modules use them.

### D3 — Equivalence is logical content, never `.mdb` bytes

The gate compares a canonical JSONL dump of every LMDB environment under the
content directory (outside `.git`), with `updatedAt` stripped from pagination
META and aggregates. Two `.mdb` files with the same content routinely differ
in page layout, so byte comparison would fail for no reason.

### D4 — The decision rule

If, after 29a, the Pi's full reindex is ≤ ~3 s and the workstation's is
≤ ~1 s, epic 29 stops at 29a and 29b–29d are recorded as deferred with this
threshold. See [the decision rule](#the-decision-rule).

### D5 — Incremental is diff-driven and falls back to full on any doubt (if go)

The changed paths come from `git diff` between the index stamp (`27-D3`) and
HEAD, plus the working tree. A path's existence on disk decides add/update
versus remove — the full rebuild's own skip rule. Any doubt — no stamp, a
stamp that isn't a commit, an index-version mismatch, too many changes, an
exception — falls back to the full (now atomic) rebuild. Incremental never
rewrites data files.

### D6 — Explicit rebuilds stay full (if go)

Incremental is used only on the HEAD-move paths: pull, revert, restore, the
`28-D12` watcher, the sync actions. The Rebuild button, Maintenance, the CLI
`reindex` and `/api/reindex` (opt-in `--changed`), and deploy stay full: when
someone asks for a rebuild, they get one.

## Roadmap

| Phase    | Scope                                                         | Branch                  | Status       |
| -------- | ------------------------------------------------------------- | ----------------------- | ------------ |
| 29-plan  | This doc, CLAUDE.md entry                                     | `agent/29-plan`         | ✅ #181      |
| 29a      | Batched atomic full rebuild (D2), timings, measure/dump tools | `agent/29a-batched`     | ✅ #182      |
| 29-close | Pi measured, decision recorded, docs                          | `agent/29-close`        | ✅ (this PR) |
| 29b      | Engine incremental API, index version (D5) — if go            | `agent/29b-incremental` | ⏸️           |
| 29c      | Editor seat `reindexChanged`, wiring, index lock — if go      | `agent/29c-seat`        | ⏸️           |
| 29d      | Revalidation, docs, Pi drill — if go                          | `agent/29d-close`       | ⏸️           |

Each phase is its own PR off `origin/main`, merged on green CI under the
standing grant. Pi deploys are Roger's (`! pnpm deploy:pi`): the permission
classifier refuses them from sessions. The workstation editor updates with
`pnpm workstation update`, which Roger runs, because a session can't pull the
main checkout.

## Phase detail

### 29a — Batched atomic full rebuild, plus measurement

**`packages/cms/content/rebuildIndex.ts`.**

- `collectIndexEntries(config, contentDirectory, resolver, {concurrency = 8})`
  → `{entries: {key, value}[], skipped: string[]}`: `readdir` →
  `readContentFromFilesystem` → `resolveReferences` →
  `buildIndexKey`/`buildIndexValue`, through a bounded pool. The per-slug
  try/catch and its `console.warn` stay.
- `replaceIndex(db, entries)`, new in `content/database.ts` (D2). A missing
  data directory becomes `replaceIndex(db, [])`.

**Optional, if cheap.** One transaction instead of several for the forced
pagination path (`updatePaginationIndex.ts`: the `rebuildInProgress` META, the
stale removes and the sorted writes — 3–4 commits per index today, not per
item), and for the per-dependent `writeToIndex` loops in `updateDependents.ts`
and `updateReferences.ts`.

**Instrumentation.** `ReindexResult` gains `timings?: Record<string, number>`
(ms per type, plus `total`). It flows through the CLI `--json` output and
`/api/reindex` unchanged.

**Tools.**

- `editor/scripts/measure-reindex.ts`: runs `reindex({contentDirectory})`
  in-process (no tsx startup per run), `RUNS=5`; reports min/median per type,
  peak `heapUsed`, and transaction/put counts (a spy, as
  `test/pagination.test.ts` does).
- `packages/cms/lmdb/dumpEnvironments.ts`, plus
  `editor/scripts/dump-indexes.ts <dir>`: the canonical dump of D3.

**Tests** (`test/rebuildIndexAtomic.test.ts`):

- a reader polling `getCount()` during a rebuild only ever sees the old N or
  the new N;
- a malformed data file is skipped and the rest is indexed;
- a missing data directory gives an empty index;
- one transaction per content index per rebuild.

`references`, `pagination`, `curationGit` and `specVersions` stay green.

**Gate.**

- Dump sha identical before and after, on a copy of the real corpus and on a
  seeded 5k corpus (`seed-scale-corpus.ts`).
- Timings at 644, 5k and 20k, with peak heap at 20k.
- On the Pi: a baseline first (median of 5
  `curl -w %{time_total} -X POST /api/reindex` with the token); Roger deploys;
  the same again, plus `.timings`; and a `28-D12` push timed from the push to
  "reindexing" done.
- The numbers go here and into `deploy-pi.md`.

#### 29a results (2026-10-08)

Measured with `scripts/measure-reindex.ts` (in-process, so no tsx startup)
on tourmaline, under heavy load from other jobs (load average 20–35), so
**min** is the number to read; medians are given too. "Old" is
`origin/main` at `385e4f4d`'s engine files swapped back in for the run.

| Corpus                    | Old: total min / median | New: total min / median | Commits old → new | Peak heap old → new |
| ------------------------- | ----------------------- | ----------------------- | ----------------- | ------------------- |
| Real copy (644 recipes)   | 12.1 s / 13.7 s         | 1.68 s / 1.90 s         | 690 → 11          | 60 → 64 MiB         |
| Seeded 5k (200 featured)  | 112.8 s (1 run)         | 8.7 s / 11.4 s          | 5221 → 11         | 62 → 228 MiB        |
| Seeded 20k (500 featured) | not run (~8 min)        | 23.5 s / 25.9 s         | — → 11            | — → 436 MiB         |

- **Equivalence (D3):** the dump sha is identical before and after —
  `ca9e27a0…` on the real copy (2,732 entries in 15 environments) and
  `51aec332…` on 5k. Two old-engine rebuilds of the real copy also dump
  identically, so the dump is deterministic.
- **Commits:** 11 per full reindex, whatever the corpus: one per content
  index (5), two per pagination index (3 × 2: the sorted keyspace, then the
  walk). Aggregates wrote nothing — their values did not change.
- **What's left is CPU**, roughly linear at ~1.2 ms per recipe (the recipe
  index value's markdown and React work, the pagination projection). Per
  type at 644 (min): recipes 1.44 s, featured 56 ms, groups 55 ms, tag-terms
  23 ms, pages 9 ms.
- **Heap grows with the corpus** now, because a type's entries are held
  until its transaction (and the pagination rebuild materializes its range,
  as it always did): 228 MiB at 5k, 436 MiB at 20k. Irrelevant at 644; at
  20k on the Pi it would want watching.
- **Tests:** `test/rebuildIndexAtomic.test.ts` (5). Its reader test fails on
  the old engine — it saw counts 0, 1, 2, … during the rebuild — and passes
  on the new.
- **Pi baseline** (758e9ec7, before 29a; `curl` time for
  `POST /api/reindex`, which includes revalidation): 12.7, 13.9, 14.7, 13.5,
  10.7 s — **median 13.5 s**, min 10.7 s.
- **Pi after 29a** (`a23a488c`, deployed by Roger 2026-10-09): the deploy's
  own reindex, run cold just after the container started, took 4.1 s
  (`timings.total`; recipes 3.4 s). Then five `POST /api/reindex`: 3.41,
  2.55, 2.21, 2.16, 2.71 s — **median 2.55 s**, min 2.16 s (from 13.5 s and
  10.7 s). Server-side `timings.total`: 3.36, 2.51, 2.18, 2.14, 2.68 s; of
  that, recipes is 1.6–2.6 s, featured ~250 ms, groups ~120 ms.
- **Workstation re-measured** (2026-10-09, load average ~10 rather than
  20–35): total **min 455 ms, median 644 ms** (recipes 401 / 552 ms); peak
  heap 73 MiB.
- **Not run:** the `28-D12` push drill (push to the Pi, time it to
  "reindexing done"). Pushing to the content repo is Roger's. It is now
  bounded by the watcher's ~3 s debounce plus a ~2.5 s rebuild, from about
  3 s plus 13.5 s before.

#### Decision (2026-10-09): stop at 29a

The Pi is at 2.5 s (rule: ≤ ~3 s) and the workstation at 0.5–0.6 s (rule:
≤ ~1 s), so 29b–29d are deferred. What is left of a reindex is CPU,
roughly linear in the corpus: ~1.2 ms per recipe on a loaded tourmaline,
~3.5 ms on the Pi. Incremental would only pay off again at a much larger
corpus.

**Reopen 29b–29d when** a full reindex on the Pi passes ~5 s (at the current
rate, roughly 1,300+ recipes), or when heap during a rebuild becomes a
problem there (436 MiB at 20k on tourmaline). Start by re-running
`measure-reindex.ts` and re-reading the risks below; the plan in 29b–29d
still applies.

**Separately, not a reindex problem:** the CLI reindex
(`pnpm recipes reindex`) still pays ~8 s of tsx startup before any work.
`deploy-pi.sh --ship-indexes` uses it. Shipping indexes was already the
slower path (43 s against 15 s in place), and with an in-place rebuild now
at 2.5 s there is even less reason to choose it.

### The decision rule

If the Pi's full reindex is ≤ ~3 s and the workstation's ≤ ~1 s:

- stop after 29a;
- record 29b–29d as ⏸️ deferred, with this threshold;
- note separately the ~7.9 s tsx startup floor on a CLI reindex (it affects
  `deploy-pi.sh`'s index shipping); that is not a reindex problem.

Otherwise, go on to 29b.

### 29b — Engine incremental API (only if go)

**`packages/cms/content/applyContentChanges.ts`:**
`applyContentChanges({contentDirectory, changes: {config, slug}[]})`.

- Existence is decided by reading the file: absent or unreadable means
  remove.
- Per type: one `db.getKeys()` pass builds slug → keys (covers deletes and
  date changes); each changed slug is built with one shared resolver; one
  transaction removes the old keys and puts the new; one
  `syncPaginationItems` per type.
- Then dependents, after every direct change: a reproject-only
  `reprojectDependents` exported from `updateDependents.ts` —
  `updateDependentsForSpec` with `renamed` forced false, so it **never
  rewrites data files**. One `findViaIndex` scan per dependent type, one
  transaction, one sync. It gets both old and new slugs and excludes slugs
  already handled.
- **Index version.** `computeIndexVersion(registry)` in
  `packages/cms/git/indexStamp.ts` hashes `INDEX_FORMAT_VERSION`, the type
  paths, the `buildIndexKey`/`buildIndexValue` source, the reference specs,
  and the pagination and aggregate spec hashes. Stored in
  `.git/discontent-index-version`; a mismatch forces a full rebuild. False
  positives are safe.

### 29c — Editor seat (only if go)

**`editor/controller/curation/reindexChanged.ts`:** `reindexChanged(ctx)` →
`{mode: "incremental" | "full", reason?}`.

- **Diff base:** `advanceIndexedHead` writes a "writes since" marker when it
  commits while the stamp is stale. A **clean** stamp S:
  `git diff --name-status -z --no-renames S HEAD`. A **marked** S that is an
  ancestor of HEAD: that diff plus `git log --name-only S..HEAD`. Anything
  else: full. Always add `git status --porcelain -z` paths; re-reading a file
  is idempotent.
- **Path mapper:** `buildPathMapper(recipeContentTypes)`. Only
  `<dataDirectory>/<slug>/<dataFilename>` matters; uploads, `users/`,
  `inventory/`, menus and dotfiles are ignored and counted.
- **Falls back to full** when the stamp is null or S isn't a commit, the
  index version doesn't match, there are more than max(200, 25% of the
  corpus) changes, or incremental throws (logged).
- **Skips** while a merge is in progress. **Writes** the HEAD and version
  stamps at the end.
- **Wiring:** `rebuildAfterRewind` (pull, revert, restore);
  `reindexWhenForeign` (`instance/start.ts`); the `sync.ts` actions through a
  new `reindexChangedAll()` beside `rebuildAllIndexes`
  (`actions/index.ts`). Stays full: D6.
- **Stamp hazard fix:** `commitChanges(..., {advanceStamp: false})` for
  `commitWorkingChanges`, then `reindexChangedAll()`.
- **Concurrency:** `packages/cms/content/indexLock.ts`, an in-process
  `withIndexLock` around `rebuildIndex`, `applyContentChanges` and
  create/update/delete. This closes a swap-over-write window that exists
  today too.

### 29d — Revalidation, docs, Pi drill (only if go)

- Ship with bulk revalidation; add precise tags (`refreshEditor(payload)` →
  zod-validated `/api/internal/refresh`) only if a render storm is measured.
- Docs: a new §11 item in `incremental-regeneration.md`, plus `deploy-pi.md`
  and this doc.
- Pi drill: 1, 10 and 100 pushed recipe edits, timed through `28-D12`; a
  forced version mismatch falls back to full.

## Verification

- **Per PR:** `pnpm --filter recipe-editor typecheck`,
  `pnpm --filter recipe-website exec tsc --noEmit`, `pnpm exec vitest run`,
  targeted Playwright (`git.spec`, `reference-updates.spec`,
  `mirrors-card.spec`), and CI green.
- **29a:** identical dump sha before and after (real corpus copy and 5k); the
  atomicity test; timings at 644/5k/20k; the Pi measured before and after its
  deploy.
- **29b–29d:** `test/reindexEquivalence.test.ts` copies fixtures into a
  scratch repo, full-reindexes, then for each scenario commits it as a foreign
  author, runs `reindexChanged` and asserts `mode === "incremental"`, dumps,
  full-reindexes, dumps again, and asserts equality. Scenarios: add, edit,
  date change, rename, delete; a tag change, including one crossing
  `perPage`; a group membership change; a term reparent with children; a
  featured target renamed or deleted (recipe, group, term); target and
  dependent in the same diff; malformed JSON; a slug directory without a data
  file; an uploads-only commit (zero writes, META `updatedAt` unchanged); an
  uncommitted edit; a reset to an earlier commit; a stale stamp + editor
  write + revert; a 30-change mix; `commitWorkingChanges`. Plus Playwright:
  "pull then list shows the new recipe" and "pull renames a featured target".

## Risks and traps known up front

- **The stamp needs the "writes since" marker** (29c) to be a safe diff
  base: an editor commit made while the stamp is stale would otherwise
  advance it past changes no index has seen.
- **Pagination may depend on history.** `LOOKUP.pageIndex` is rewritten only
  for dirty pages. The equivalence harness will show it; fix it in the
  engine, don't normalise it away in the dump.
- **Incremental still has O(N) folds.** Phase 2 and aggregates run on every
  incremental call: ~5 ms at 644, ~112 ms at 20k.
- **One big transaction grows `data.mdb` temporarily** while readers hold
  old pages; negligible at 644.
- **`clearSync` resets the encoder's shared structures** before the puts
  re-create them, inside the same transaction. A reader in another process
  re-reads shared structures when it meets an id it doesn't know, as it
  already must after today's `drop()`.
- **`recordPaginationChanges` read-modify-writes one shared JSON file.**
  Serialise it; never rebuild types in parallel.
