# Epic 34 — Facets follow-through, write safety, term counts, seasonal content

> **This is the durable source of truth for epic 34.** Read it before touching
> term pages (`common/controller/data/readTermPage.ts`,
> `common/components/TagPage/`), `renameTerm`, the curator skill's tag
> vocabulary, the engine's git commit path (`packages/cms/git/commit.ts`), the
> write lock (`packages/cms/git/writeLock.ts`), atomic file writes, featured
> or group slug generation, the `busy` error code, or roundup import
> (`inspect-list`, `import-list`).
> Update the roadmap **Status** column and the **Now** line at every phase
> boundary. Earlier epics are cited by number with a prefix (`32-D8`,
> `23-T26`). `agent-epic-33.md` (the facet vocabulary) and `agent-epic-32.md`
> (32d batches, 32e by-term keying, 32i aliases) are the background.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 34-plan (this doc). Next: 34a and 34b in parallel.

## Context

Epic 33 tagged the food corpus with four facet roots, and 24f's Christmas
Cookies run closed the taxonomy epic (2026-10-13; main `54fe3fbe`, content
`35e0d1d`). Roger picked four follow-ups:

1. **Facets follow-through.** The curator skill's tag vocabulary predates
   epic 33 (it still offers `lunch`/`dinner` and free cuisines), so new
   imports drift. Facet root pages say "No recipes are tagged Course."
   (`TagPage/shared.tsx`), because recipes carry only children. `term_rename`
   drops the old slug, so old links stop resolving.
2. **Engine write safety**, with Roger's idea of ULIDs. Every commit is
   `git add <paths>` and then a bare `git commit` through the shared index
   (`packages/cms/git/commit.ts`). So foreign staged files ride along; the
   workstation sync's `git status`/`merge` holds `index.lock` and breaks
   writes (epic 33's ninth write); a write that throws after writing leaves
   orphaned files. Creates check-then-write, and default featured slugs
   resolve to the second, so two in one second 409 (23-T26).
3. **Term cloud keying.** Term pages read the two whole `terms` clouds for
   breadcrumb and child counts, so any carrier change expires every term
   page.
4. **A seasonal content round**: Halloween (Oct 31) and Thanksgiving
   (Nov 26). The corpus already has turkey (gravy only inside the turkey
   recipes; no mashed potatoes or stuffing), cranberry sauce, four pumpkin
   and two pecan pies, squash sides and soups, fall salads, mulled cider and
   wine, hot buttered rum, hot toddies, apple turnovers and caramel apple
   bars.
5. **Roundup ("meta-list") import** — Roger, mid-run 2026-10-13: "add a way
   to import the meta-lists (e.g. 'top christmas cookies')", and prioritize
   recipes from **Sally's Baking Addiction**. Today a roundup page has to be
   read by hand and each recipe imported one by one.

Out of scope: deploys. The Pi is Roger's (`! pnpm deploy:pi`); the
workstation gets `pnpm workstation update` from the morning checklist.

## Decisions

### D1 — Root pages list their subtree's recipes

A term page lists the recipes of the term **and every descendant**, matching
what `tag:<term>` returns since 24d, with a line "N here · M including
narrower terms". The empty state shows only when the whole subtree is empty.
`subtreeSlugs(tree, slug)` in `common/controller/tagVocabulary.ts` is a pure
walk with a visited set (the `termHierarchy` pattern).

### D2 — Term counts come from per-term reads; engine keying deferred

`resolveTermPage` reads `byTerm.readKey(s)` (recipes and groups) for every
subtree slug — each read is cached per term (32e, F35) — dedupes by slug,
sorts newest first by `date`, then applies `pinned`. Breadcrumb and child
counts come from those same per-key reads, and the term page **stops reading
the whole `terms` clouds**. No engine change, no spec bump, no reindex. The
`/tags` list, autocomplete, ⌘K and Make page chips keep the clouds: they are
vocabulary-wide by nature. Keying `termsAggregate` in the engine
(`packages/cms/taxonomies/aggregates.ts`) goes to the backlog, with 34a's
before/after measurement as the reason.

### D3 — Curator skill v4: the facet vocabulary

The skill's "Tag vocabulary" becomes the four facet roots and their 43
children (`agent-epic-33.md`), with the effort definitions (quick = total
≤ 30 min; easy = few ingredients and simple technique; project = multi-stage
or overnight). Children only, never roots; one or two `course` children per
food recipe; `vegetarian` on savory dishes only. Read `term_list` for the
live children before tagging, and map a draft's `suggestedTags` onto
children. Drinks keep their own rules; `spirit` children stay as they are.

### D4 — A rename keeps the old slug as an alias

`renameTerm` appends the old slug to the record's aliases
(`dedupeAliases([...aliases, slug], to)`), as 32i's merge does, and
`TermRenameResult` gains `aliases`. `/tags/<old>` and `tag:<old>` keep
resolving.

### D5 — A ULID is a per-write identity, not a record id

Slugs stay the identity of recipes, groups and terms. Each write gets a ULID
(`packages/cms/util/ulid.ts`, in-house: Crockford base32, monotonic within a
millisecond, `crypto.getRandomValues`, so it runs in the browser too; no new
dependency). The write id names the lock holder, the private git index, temp
files and the reflog entry. New featured slugs become ULIDs (D9).

### D6 — One exclusive cross-process write lock

`withWriteLock(dir, op, fn)` in `packages/cms/git/writeLock.ts`:

- `.git/discontent-write.lock` (found with `rev-parse --git-path`), created
  with `O_EXCL`, holding `{writeId, pid, host, op, startedAt}`;
- re-entrant through `AsyncLocalStorage`, with an in-process FIFO;
- a 10 s heartbeat on the file's mtime. Stale = same host and a dead pid, or
  an mtime older than 60 s (which covers the Pi's Docker pid namespace);
- waits with jittered backoff up to `DISCONTENT_WRITE_LOCK_TIMEOUT_MS`
  (default 30 s), then `RepositoryBusyError` naming the holder.
- **Lock order:** the sync's repo lock, then the write lock. Writes never
  take the repo lock.

A write journal was considered and **dropped**: the lock also closes the
`reset --hard` time-of-check races in pull/revert/restore, the per-step LMDB
transactions and the unlocked `.pagination-changes.json`, the create-slug
race, and a merge whose HEAD swap fails mid-way. A dead writer's leftovers
show in `git_status` and are cleaned by "Commit working changes" or a
restore.

### D7 — Commits through a private index with a compare-and-swap on HEAD

`git/commit.ts` keeps its messages, `--author` semantics, the no-op without
`.git`, the no-change skip and the stamp advance, and changes how it commits:

1. Copy the shared index to `.git/discontent-index-<writeId>`; with
   `GIT_INDEX_FILE` on it, `read-tree -m HEAD` (drops foreign staged files,
   keeps stat info so annex files are not re-hashed; `--empty` on an unborn
   branch).
2. Drop missing and untracked paths, then `add -A -- <paths>` (`.` when
   there are none).
3. `write-tree`; skip when it equals HEAD's tree.
4. `commit-tree` with the env author, then
   `update-ref -m "discontent <writeId>: <subject>" HEAD <new> <old>`.
5. On a CAS failure: redo on the new HEAD when the paths don't overlap (×3);
   when they do, `CommitConflictError` → `git_conflict`.
6. Refresh the shared index with `git reset -q -- <paths>`, retrying on
   `index.lock` for about 10 s; failing that, record the paths in
   `.git/discontent-index-pending` for the next locked commit or
   `requireCleanTree` to flush. The write never fails on this step.
7. Remove the private index in `finally`; sweep stale `discontent-index-*`
   when the lock is taken.

Refuse to write while `MERGE_HEAD` exists (`dirty_tree`). Other failures
raise `CommitFailedError {writeId, touchedPaths}`.

### D8 — Atomic file writes

`content/filesystem.ts` and uploads write `.<name>.<writeId>.tmp`, then
rename over the target.

### D9 — ULID featured slugs retire 23-T26

`createFeaturedRecipeSlug` → `ulid(date).toLowerCase()`. The featured index
key is `[date, slug]`, so ordering is unchanged. `createGroupSlug`'s fallback
→ `group-<ulid>`. The featured form leaves its slug blank with an "auto"
placeholder (no hydration mismatch); the action fills it in.

### D10 — `busy`: a retryable 503

`RepositoryBusyError` maps to the code `busy` (HTTP 503, retryable) in
`curation/errors.ts`, `curation/http.ts`, `cli/backend/http.ts`
(`statusFor`, `codeForStatus`, `rehydrate`; 23-T25) and the MCP
instructions' code list (`mcp/registry.ts`, `agent-mcp.md`).

### D11 — Roundup import: inspect the list, then import picks politely

Two operations, beside epic 26's `inspect` → draft → create (26-D8, 26-D12):

- **`inspect-list <url>`** (read-only; a CLI command, an API route and an
  MCP tool): parse a roundup page into `{title, url, items: [{url, name,
image?, existing?}]}`. Sources in order: schema.org `ItemList` JSON-LD
  (WP Recipe Maker roundups emit it), then recipe links in the article body
  (same host first; navigation, category, tag, comment and share links
  dropped). `existing` names the slug of a corpus recipe whose `source.url`
  matches, so a re-run never duplicates.
- **`import-list <url>`** (a write): `--pick <n,…>` or `--all`, `--term
<slug>`, `--dry-run`. It imports the picks one by one through the existing
  import path (one commit per recipe, never one batch, so it never holds the
  write lock for minutes) and skips `existing` items. It follows 30-D5's
  polite-scraping rule (requests to one host sequential and ≥ 15 s apart,
  image downloads included; one retry after a 403, then the host is dropped
  for the call). Each call imports at most a capped number of items and
  answers `remaining`, so a long list resumes across calls and an MCP call
  never runs into a client timeout. `--term` makes the list a collection:
  the term is created if missing (labelled from the list's title) and
  assigned to every imported and existing item.
- The skill learns the flow (inspect the list, show it, import the picks,
  facet-tag them per D3) and **prefers Sally's Baking Addiction** when
  choosing what to import.

### D12 — Prefer Sally's Baking Addiction

Roger's source preference (2026-10-13): import candidates come from
sallysbakingaddiction.com first; other hosts only when Sally's has nothing
fitting (savory Thanksgiving sides, drinks). The curator skill says so, and
34e's review page leads with Sally's.

## Roadmap

| Phase    | Branch                     | Size | Status | What                                                                          |
| -------- | -------------------------- | ---- | ------ | ----------------------------------------------------------------------------- |
| 34-plan  | `agent/34-plan`            | S    | 🟡     | This doc.                                                                     |
| 34a      | `agent/34a-term-pages`     | M    | 📝     | D1, D2: subtree recipes on term pages, counts without the clouds.             |
| 34b      | `agent/34b-skill-rename`   | S    | ✅     | D3, D4: skill v4 vocabulary; rename keeps the old slug.                       |
| 34c      | `agent/34c-engine-writes`  | L    | ✅     | D5–D8: ULIDs, the write lock, private-index commits, atomic writes (engine).  |
| 34d      | `agent/34d-site-writes`    | M    | 📝     | D6, D9, D10 on the site: lock the batch/git/sync seats, `busy`, ULID slugs.   |
| 34f      | `agent/34f-roundup-import` | M    | 📝     | D11, D12: roundup import (`inspect-list`, `import-list`), skill + Sally's.    |
| 34e      | content repo only          | M    | 📝     | Seasonal collections (thanksgiving, fall, warm-drinks) and Halloween imports. |
| 34-close | `agent/34-close`           | S    | 📝     | Results, backlog, the morning checklist.                                      |

Ordering (Roger, 2026-10-13): 34a ∥ 34b → 34c → 34d → 34e. 34c starts once
34b merges, so at most two PRs are in CI at once. The content round runs
last with the workstation **up**, as the real-world proof of write safety.
34f (added mid-run) starts once 34a merges, alongside 34c (no shared
files), and lands before 34e so the seasonal round can import Sally's
roundups through it. 34d merges `main` after 34f (both touch
`mcp/registry.ts` and the CLI).

## How it runs

- One orchestrating session; code phases go to worktree workers, each phase
  its own PR off fresh `origin/main`, opened ready. Merge on every check that
  ran green + `CLEAN` (path-filtered CI, #211), merge commit, delete the
  branch; merge `main` into the next PR before merging it. Review agents on
  M/L PRs.
- At most two PRs in CI at once; batch docs edits.
- 34e runs in the orchestrator session, single-agent, as epic 33 did.

## Phases

### 34a — Term pages (M)

- `subtreeSlugs` (D1) with a unit test in `test/tagTerms.test.ts`.
- `resolveTermPage` per D2; the page (`shared.tsx`) per D1; check that the
  export site renders the same through `tagRoute`.
- `tag-pages.spec.ts`: a root with zero own carriers (a `course` record and a
  child on the `christmas-cookies` fixture, or created through the API
  in-test like the 32i case). Rebuild fixture indexes with
  `pnpm tsx editor/scripts/build-fixture-indexes.ts` if the fixture changes.
- Measure how many term pages one carrier change expires, before and after,
  and record it below.

### 34b — Skill v4 + rename alias (S)

- SKILL.md "Tag vocabulary" per D3; `examples.md` uses facet children;
  `test/curatorSkill.test.ts` passes.
- `renameTerm` per D4. Wording in `mcp/registry.ts` (`term_rename`),
  `cli/commands/term.ts`, the rename API route and SKILL.md's rename note.
- Tests: `test/terms.test.ts` rename cases, the commit count in
  `test/curationGit.test.ts`, `api-write.spec.ts`'s rename case, and a
  `/tags/<old>` case.

### 34c — Engine writes (L, `packages/cms` + root `test/`)

- D5–D8. `createContent` / `updateContent` / `deleteContent` and
  `genericActions`' overwrite flow (its delete and create commits in one
  scope) take the lock.
- Tests: `test/ulid.test.ts`; `test/writeLock.test.ts` (re-entry, FIFO,
  dead-pid and age takeover, timeout, heartbeat); `curationGit.test.ts`
  additions (a pre-staged file stays out of the commit and stays staged; a
  hand-made `index.lock` doesn't fail the commit and status ends clean;
  conflict and failure errors carry the paths; rename and delete; the
  initial commit; a detached HEAD; the stamp; F34's one-commit and
  `(partial)` cases unchanged); **`test/concurrentWrites.test.ts`** (two tsx
  writer processes × 15 term creates while a third holds `index.lock` in
  200 ms bursts → 30 commits, each touching only its own path, a clean tree,
  30 LMDB entries); an annex upload through the private index (skipped
  without git-annex, like `annex.test.ts`); demo `git.spec.ts` unchanged and
  green.
- Measure the slowest full rebuild under the lock against the 30 s timeout.

### 34d — Site writes (M)

- The lock in `curation/batch.ts` (the whole batch, `(partial)` included),
  `curation/inventory.ts`, `curation/git.ts` (pull from `requireCleanTree`
  through merge, abort, reset and rebuild; revert; restore; the pending-index
  flush), `curation/reindex.ts`, and `actions/sync.ts` (commit working
  changes, the merge commit, abort). The sync keeps `withRepoLock` for fetch,
  annex and push, and takes the write lock only around the merge.
- D9, D10.
- Tests: pull/restore wait for another process's write lock and never delete
  its files; `busy` maps through HTTP, CLI and MCP; two slug-less features in
  the same second both succeed.
- Docs: 23-T26 retired in `agent-mcp.md`; epic 33's "stop the workstation
  before scripted writes" trap marked superseded once verified.
- **Scratch-clone stress run** (never the real repo): clone the content repo
  under the job's tmp dir with a local bare remote; run an instance on it in
  workstation mode on a spare port (or a `gitSync` loop); pre-stage a scratch
  file; two parallel CLI loops of ~30 writes (term create/update, slug-less
  `feature` bursts), an image upload and manual syncs during the loops.
  Expect every command to exit 0, commits = writes, only the scratch file
  still staged, the remote level, and `git annex whereis` finding the image.

### 34f — Roundup import (M)

- D11: the parser beside `curation/inspect.ts` (pure, fixture-tested on
  saved roundup HTML: an `ItemList` page, a links-only page, a page with
  neither); the `inspectList` and `importList` seats; `pnpm recipes
inspect-list` / `import-list`; an API route each; two MCP tools
  (`page_inspect_list` read-only, `recipe_import_list` non-destructive),
  pre-approved in `.claude/settings.json` and the skill's frontmatter, with
  CLAUDE.md's counts updated (47 → 49 tools, 35 → 37 pre-approved).
- The pacing is injectable (a clock/sleep seam) so tests don't wait 15 s.
- Tests: the parser fixtures; `importList` against a local HTTP fixture
  server (picks, `existing` skip, `--term` create + assign, 403 drop,
  the per-call cap and `remaining`, `--dry-run` writes nothing); the CLI and
  MCP mappings. No live-site fetch in tests.
- Skill: D11's flow and D12 in SKILL.md and `examples.md`.
- The editor's import form keeps single-recipe import; a list picker there
  goes to the backlog unless it falls out small.

### 34e — Seasonal content round (orchestrator; Roger approves first)

- Proposed term collections, built 24f-style (a term record, `term assign`,
  then `feature`): **`thanksgiving`** "Thanksgiving" (turkey, cranberry
  sauce, gravy, squash and potato sides, pumpkin and pecan pies; featured in
  early November), **`fall`** "Fall Favorites" (apple, pumpkin, squash,
  maple, cider; featured now), **`warm-drinks`** "Warm Drinks", a child of
  `drink` (mulled cider and wine, hot buttered rum, toddies).
- Halloween: the corpus has little; propose 3–6 treat imports tagged with
  skill v4's facets, listed on the review page and imported only after
  approval. Sally's first (D12), through 34f's roundup import where a
  Sally's roundup fits. Thanksgiving's gaps (mashed potatoes, stuffing,
  gravy) are proposed the same way.
- Method: a scratch clone snapshot, candidate lists from searches plus
  reading the recipes, a review Artifact with sets, reasons and borderline
  cases, then Roger's approval.
- Apply through the CLI with `--content-dir` on the real repo, **with the
  workstation running** if 34c/34d are merged and it is updated (otherwise
  stop it first, as in epic 33), then `POST /api/revalidate`. Verify `tag:`
  counts, `/tags/<slug>` pages and home features on the workstation and the
  Pi.

## Verification

- Per PR: CI green (path-filtered). Locally `pnpm --filter recipe-editor
typecheck`, `pnpm exec vitest run`, targeted Playwright in build mode.
- 34a: after a workstation update, `/tags/course` lists 450 recipes with
  child counts, and `/tags/christmas-cookies` shows 8 with "5 here".
- 34b: a dry-run import through the skill tags facet children;
  `term rename x y` leaves `/tags/x` resolving.
- 34c/34d: the unit and concurrency tests, demo `git.spec.ts`, the
  scratch-clone stress run, and 34e's real apply with the workstation up.
- 34f: `inspect-list` on a Sally's roundup lists its recipes with `existing`
  marked; a dry-run `import-list --term` on a scratch clone reports the
  picks without writing.
- 34e: counts match the review page; pages and features render on both
  hosts.

## Traps

- **34b — a rename's old slug blocks a new term there.** It is an alias now,
  so `term_create` at that slug is `validation` ("… is an alias of the term
  …"), exactly as after a merge (32i). Take it off the renamed record's
  `aliases` with `term_update` first if the old name is wanted back as a
  separate term.
- **34b — examples.md cuts arrays with `…`.** The transcripts are not JSON,
  so `curatorSkill.test.ts` reads the quoted strings out of each `"tags": […]`
  rather than parsing it.
- **34b — the worktree guard refuses a command whose text says `alias`** (it
  reads it as the shell builtin). Grep with a fragment (`lias`) or edit with
  the Edit tool.
- **34c — engine commits run no git hooks.** `commit-tree` + `update-ref`
  skip `pre-commit`, `commit-msg` and `post-commit`. The content repos'
  only hooks are git-annex's; its `pre-commit` (`git annex pre-commit .`)
  fixes up _locked_ (symlinked) annexed files, which the engine never makes
  — D9's large files are unlocked, and `git add`'s clean filter annexes them
  under the private `GIT_INDEX_FILE` too (`annex.test.ts`, 34c case). A repo
  that grows a hook the engine relies on would need it called explicitly.
  `gc --auto` no longer runs after each write either (fetch and merge still
  run it), and `commit.gpgsign` is honoured by passing `-S` to `commit-tree`.
- **34c — a big batch can outlast the 30 s lock timeout.** `term rename
drink beverage` on a scratch clone (209 recipes, 275 files, one commit)
  took 17.5 s on the workstation; the Pi is several times slower. Once 34d
  holds the lock for a whole batch, a write that arrives meanwhile waits up
  to `DISCONTENT_WRITE_LOCK_TIMEOUT_MS` and then answers `busy` (D10,
  retryable) — by design, but a curator or script hitting it should retry
  rather than report a failure.
- **34c — `gitLog`'s `files` reports a rename by its new path only** (git's
  rename detection). To see both halves of a slug change use
  `git show --no-renames --name-status`.
- **34c — a write that dies part-way leaves `.<name>.<writeId>.tmp`** only
  if the process is killed between the temp write and the rename; it shows
  in `git_status` as untracked and names the write. Every other failure
  removes it.
- **34c — `discontent-index-pending` means the shared index is behind
  HEAD** for its paths: `git status` shows them as changed (the index still
  holds the old version, or none) until the next engine write (or 34d's `requireCleanTree`, via
  `flushPendingIndex`) applies it. Do not "fix" it with `git add`.

## Results

### 34b — Skill v4 + rename alias

- **Skill v4 (D3).** SKILL.md's "Tag vocabulary (v4)" lists the four facet
  roots and their 43 children (labels in parentheses where they differ),
  the quick (≤ 30 min) / easy (regardless of time) / project (multi-stage or
  overnight) definitions, children only, one or two `course` children per
  food recipe, `vegetarian` on savory dishes only, `term_list` before
  tagging, and `suggestedTags` mapped onto children ("Main Course" → `main`)
  with no free tags on food. Drinks and the `spirit` children are unchanged.
  The checklist's tags step and the `recipe_create` example follow it, and
  examples.md's meal-plan transcript restates its tags as facet children
  (saying so). SKILL.md had no version marker; the heading carries "v4".
  `curatorSkill.test.ts` pins the 43 children (`FACETS`), the definitions,
  and forbids a root or `dinner`/`lunch` in any example's `tags`.
- **Rename keeps the old slug (D4).** `renameTerm` writes
  `dedupeAliases([...record.aliases, from], to)` in the record's own write,
  so the commit count is unchanged (still one, F34); `TermRenameResult`
  gains `aliases`. Renaming onto one of its own aliases drops that alias and
  adds the old slug; renaming back swaps them. Like a merge's skip, the old
  slug is left out when a third record already lists it (hand-made state the
  seats refuse). **No record, no alias:** a carried-only term renames as
  before with `aliases: []`, and no record is created — the same choice a
  bare-into-bare merge makes (nowhere to keep it; carriers were all
  retagged, so `/tags/<old>` is a 404 there). `GET
/api/taxonomies/tag/<old>` stays a 404: the seat answers by slug only.
  Wording in the `term_rename` tool, `recipes term rename` (prints "… stays
  as an alias"), the rename route and SKILL.md.
- **Tests.** `terms.test.ts`: the rename cases assert `aliases` and
  `tag:<old>`, rename-and-back, the old slug blocking a create, the
  third-record skip, and no record for a carried-only rename;
  `curationGit.test.ts`: the alias rides the one rename commit;
  `api-write.spec.ts`: `/tags/flatbread` redirects to
  `/tags/pressed-bread` and `tag:flatbread` finds the recipe. vitest 57
  files / 1220 tests; editor typecheck and export `tsc` clean.

### 34c — Engine writes

- **ULID (D5)** — `packages/cms/util/ulid.ts`: `ulid(date?)`, `ulidTime(id)`.
  Monotonic only for consecutive ids in the _same_ millisecond, so
  `ulid(pastDate)` always carries that date's prefix (D9 relies on it).
- **The write lock (D6)** — `packages/cms/git/writeLock.ts`, as specified.
  Refinements: the lock lives in the **per-worktree git dir**
  (`--absolute-git-dir`, realpath'd and cached, so two spellings of one
  repository share one key); a takeover renames the stale file aside and
  links it back if it turns out to have been a fresh one; a hold is marked
  inactive at release so a background task `fn` left running cannot
  re-enter it; `withWriteLock(dir, op, fn, {timeoutMs, staleMs,
heartbeatMs})` takes test overrides; `currentWriteId()` and
  `readWriteLock(dir)` are exported. The lock is taken by `createContent` /
  `updateContent` / `deleteContent` around the whole write (slug check,
  files, LMDB, pagination and `.pagination-changes.json`, dependents,
  commit) and by `genericActions`' `overwriteCreate` / `overwriteUpdate`
  around the delete and the create/update. `withBatchCommit` is the
  site's (`curation/batch.ts`) — 34d wraps it; the nesting is re-entrant.
- **Commits (D7)** — `packages/cms/git/commit.ts` rewritten on plain
  `spawn` (`git/run.ts`). Messages, `--author` semantics (author from the
  write, committer from git config; checked against `%an|%ae|%cn|%ce`),
  the no-op without `.git`, the no-change skip (tree = parent's tree) and
  the stamp advance are kept. The message gets `git commit -m`'s whitespace
  cleanup. Pathspecs are literal (`GIT_LITERAL_PATHSPECS`). Unborn branch:
  `read-tree --empty`, CAS old value `""`. Detached HEAD: `update-ref HEAD`
  moves it and leaves the branch. A `read-tree -m` that refuses (unmerged
  entries) falls back to a plain `read-tree`. A failed CAS with HEAD
  unchanged (a held ref lock) is retried like a moved HEAD (×3, then
  `CommitFailedError`). The stamp advances to the commit made, from the
  parent it was made on — so a commit that lands on top of a foreign one
  leaves the stamp stale, as it should.
  - `MergeInProgressError` (no engine dirty-tree type existed) is checked
    first thing under the lock in all three writes, so a refused write
    touches nothing, and again in `commitChanges`.
  - `CommitConflictError {writeId, touchedPaths, conflictingPaths}`,
    `CommitFailedError {writeId, touchedPaths, cause}`.
  - The pending refresh: NUL-separated paths in
    `<gitdir>/discontent-index-pending`, applied at the start of every
    locked commit and by `flushPendingIndex(dir, {timeoutMs})` (takes the
    lock; true when nothing is left). `DISCONTENT_INDEX_REFRESH_MS`
    (default 10 000) bounds the retry.
  - `commitTestHooks.beforeUpdateRef` is a test seam (moves HEAD at the
    worst moment); unset in production.
- **Atomic writes (D8)** — `packages/cms/fs/atomicWrite.ts`
  (`writeFileAtomic`, `writeJsonAtomic`, `writeStreamAtomic`) for data
  files (same bytes as `outputJSON`), uploads (a fetch without a body still
  writes an empty file, as before) and `.pagination-changes.json`.
- **Hooks and annex** — decided to run none (Traps). git-annex is
  initialised on the real repo (hooks `pre-commit`, `post-checkout`,
  `post-merge`, `post-receive`; `* filter=annex` in `info/attributes`, no
  `.gitattributes` yet). The annex case commits a 64 KB upload under a
  10 KB `largefiles` rule through the private index: the commit holds the
  pointer, `annex find --in here` and `annex fsck` pass, a pre-staged
  foreign file stays staged.
- **Concurrency test** (`test/concurrentWrites.test.ts`): two `tsx`
  processes × 15 `createTerm`s while a third holds `index.lock` in
  200 ms / 100 ms bursts → 30 commits, each touching only its own
  `term.json`, nothing pending, a clean tree, 30 LMDB entries. 30 writes in
  14–17 s including two `tsx` starts; median 270–320 ms per write (each
  waits for the other writer's), 48–55 lock bursts.
- **Rebuild under the lock** — a full CLI `reindex` of a scratch clone of
  the content repo (35e0d1d) on the workstation: 0.80–0.94 s (recipes
  0.70–0.77 s), against epic 29's Pi 2.5 s; both far inside 30 s. The
  long holder is a batch, not a rebuild (Traps: 17.5 s for a 209-carrier
  rename here). The clone's tree stayed clean after the rename commit.
- **Comment fix** — `pagination/changes.ts` and `derivedPaths.ts` claimed
  the old `"./*"` fallback skipped dotfiles; git's pathspec never did. The
  fallback is `.` now and the ignore rule is what keeps the artifact out.
- **Tests.** New `ulid.test.ts` (7), `writeLock.test.ts` (14),
  `concurrentWrites.test.ts` (1); `curationGit.test.ts` +15 (pre-staged
  file, reflog/author, held `index.lock` + flush, short `index.lock`,
  non-overlapping and overlapping HEAD moves, ref-lock failure, rename,
  delete incl. a never-committed item, unborn branch, detached HEAD,
  stamp, `MERGE_HEAD`, no temp files); `annex.test.ts` +1. F34's batch
  cases unchanged and green. vitest 60 files / 1258 tests; editor
  typecheck, export `tsc`, portfolio typecheck and the demo's `tsc` clean.
  Recipe Playwright (build mode; git, api-write, duplicate-slug, mirror,
  term-edit, groups, edit, new-recipe, reference-updates) 166/166; CMS
  demo Playwright (build mode, all specs incl. `git.spec.ts`) 109/109.
- **For 34d.** Import from `@discontent/cms/git/writeLock`
  (`withWriteLock`, `RepositoryBusyError`, `currentWriteId`,
  `readWriteLock`), `@discontent/cms/git/commit` (`CommitConflictError`,
  `CommitFailedError`, `MergeInProgressError`, `flushPendingIndex`,
  `assertNoMergeInProgress`) and `@discontent/cms/util/ulid` (`ulid`).
  Map `RepositoryBusyError` → `busy`, `CommitConflictError` →
  `git_conflict`, `MergeInProgressError` → `dirty_tree`; call
  `flushPendingIndex` at the top of `requireCleanTree`. Raw `git commit`s
  in the site (`commitMerge`, revert) still go through the shared index —
  take the write lock around them.
