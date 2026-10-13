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
| 34b      | `agent/34b-skill-rename`   | S    | 📝     | D3, D4: skill v4 vocabulary; rename keeps the old slug.                       |
| 34c      | `agent/34c-engine-writes`  | L    | 📝     | D5–D8: ULIDs, the write lock, private-index commits, atomic writes (engine).  |
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

_(Filled in as phases land.)_

## Results

_(Filled in as phases land.)_
