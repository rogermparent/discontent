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
walk with a visited set (the `termHierarchy` pattern). The list is capped at
`TERM_PAGE_RECIPE_LIMIT` (48: pins first, then the newest) with a "See all M
recipes" link to `/search?q=tag:<term>` (added in 34a's review: `/tags/course`
would otherwise be ~4.4 MB).

### D2 — Term counts come from per-term reads; engine keying deferred

`resolveTermPage` reads `byTerm.readKey(k)` (recipes and groups) for every
key of `subtreeKeys(tree, slug)` — each subtree slug and the slugs of its
record's aliases, as `tag:` expands them — each read cached per key (32e,
F35); it dedupes by slug, sorts newest first by `date`, then applies
`pinned`. Child counts come from those same per-key reads (each child's
subtree is inside the page's). **The breadcrumb carries labels only**, from
the tree: an ancestor's honest count is its whole subtree, which would tie
every page to its siblings' keys, and its own count reads "Course 0" on the
facet roots. The term page **stops reading the whole `terms` clouds**. No engine change, no spec bump, no reindex. The
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
| 34a      | `agent/34a-term-pages`     | M    | ✅     | D1, D2: subtree recipes on term pages, counts without the clouds.             |
| 34b      | `agent/34b-skill-rename`   | S    | ✅     | D3, D4: skill v4 vocabulary; rename keeps the old slug.                       |
| 34c      | `agent/34c-engine-writes`  | L    | ✅     | D5–D8: ULIDs, the write lock, private-index commits, atomic writes (engine).  |
| 34d      | `agent/34d-site-writes`    | M    | ✅     | D6, D9, D10 on the site: lock the batch/git/sync seats, `busy`, ULID slugs.   |
| 34f      | `agent/34f-roundup-import` | M    | ✅     | D11, D12: roundup import (`inspect-list`, `import-list`), skill + Sally's.    |
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

### 34a

- **A by-term row carries the recipe's `tags`** (`recipeTagTaxonomy.project`),
  so assigning one term to a recipe moves the row of _every_ term that
  recipe carries, not just the new one. The pages a tag write expires are the
  ancestors-or-self of all of the recipe's terms, not of the assigned term
  alone. The measurement below counts it that way.
- **A non-tag edit now expires slightly more than before.** Renaming a recipe
  or changing its picture moves its rows but leaves the clouds alone. Before
  34a that expired the pages of its own terms (median 4). Now it also expires
  their ancestors (median 6). The trade is right: a tag write used to expire
  all 215 term pages.
- **The breadcrumb has no counts any more.** An honest ancestor count would be
  its whole subtree, and reading that would make every leaf page depend on
  every sibling term, which brings back the expiry problem this phase
  removes. An ancestor's own count is misleading on the facet roots
  ("Course 0"). So the breadcrumb chips show labels only (`TermCrumb`).
  Curation's `term_get` keeps its own `breadcrumb`/`children` with own counts
  and `counts.own` / `counts.withDescendants`. It does not use `TermPageData`.
- **A root can't pin descendants' recipes.** The page applies `pinned` to the
  merged subtree list, but `assertPinned` still accepts only recipes that
  carry the term itself. A facet root carries nothing, so it has nothing to
  pin. The edit form reads the term's own row (`byTerm.readKey(tag)`, plus
  `applyPinned`) for its pin suggestions and existence check rather than the
  whole page, so it never offers a pin the seat refuses. Letting a root pin
  subtree recipes is a backlog candidate.
- **A subtree list is a size problem before it is a cache problem.** A card
  is ~9.7 KB of HTML and RSC payload (`/tags/drink` on the workstation:
  2.03 MB for 209 cards), so an uncapped `/tags/course` (450) is ~4.4 MB and
  would expire on nearly every food-recipe edit. The list is capped at
  `TERM_PAGE_RECIPE_LIMIT` = 48 (every pin kept, then the newest) with "See
  all M recipes" → `/search?q=tag:<term>`. Both apps serve the same client
  `/search` (`SearchPageWrapper`, the corpus from `/search/all` and the
  expansion from `/search/terms`, static routes on the export), so one link
  works on both. Groups are not capped: the real corpus has none, and a
  group card is smaller.
- **Aliases are keys too.** `tag:` expands each subtree term's alias
  spellings (`ownAliasSpellings`), so the page reads `readKey(tagSlug(a))`
  for each alias `a` of each subtree record (`termKeys`) — otherwise a recipe
  tagged with a descendant's alias is in `tag:dessert` and missing from
  `/tags/dessert`. An alias whose slug is another record's own slug is left
  out, as the expansion leaves it out. Two edges can still diverge, both
  hand-made states the seats refuse: an alias spelled like another record's
  _label_ (the expansion compares labels, a by-term key is a slug), and the
  order a hand-edited cycle is walked in.
- **The editor build prerenders every term page.** On a fresh clone without
  `transformed-images`, each card's image is transformed at build time and
  pages time out at 60 s under load. Copy the cache in before measuring a
  build against a scratch clone.
- **Only a record has children**, because the tree fold links a child only to
  a parent node that exists. So a record-less slug's subtree is just itself,
  `resolveTermPage`'s `null` stays "no record and no carriers", and
  `readTermPageSlugs` needs no change: a root whose recipes all sit below it
  is in the tree's keys on both the editor and the export.

### 34b

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

### 34c

- **A pending index refresh can be committed backwards.** When a commit
  lands but the shared index can't be refreshed (`index.lock` held past the
  retry), its paths go to `<gitdir>/discontent-index-pending` and `git
status` shows them as `MM`: the index still holds the _old_ version. A
  plain `git commit` of anything staged — VS Code's Commit button, which is
  used on the real repo — then writes that old version back, silently
  undoing the engine's commit. The fix is safe and idempotent: `git reset
-q -- <paths>` (what the engine does) or `git add <paths>` (the worktree
  already holds the committed version). The danger is only committing
  without `-a` while it's pending. The engine retries in the background
  (1, 3, 10, 30, 60 s), every later write flushes it first, and
  `readPendingIndex` names the paths so 34d can show them in `git_status`
  and on /git.
- **Engine commits run no git hooks.** `commit-tree` + `update-ref` skip
  `pre-commit`, `commit-msg` and `post-commit`. The content repos' only
  hooks are git-annex's; its `pre-commit` (`git annex pre-commit .`) fixes
  up _locked_ (symlinked) annexed files, which the engine never makes —
  D9's large files are unlocked, and `git add`'s clean filter annexes them
  under the private `GIT_INDEX_FILE` too (`annex.test.ts`, 34c case). A
  repo that grows a hook the engine relies on would need it called
  explicitly. `gc --auto` no longer runs after each write (fetch and merge
  still run it). `commit-tree` honours `commit.gpgSign` itself.
- **git 2.55 drops everything under an `:(exclude)` pathspec with a long
  `GIT_INDEX_FILE`.** With a private index path past ~60 bytes (as
  `/tmp/x/.git/discontent-index-<ULID>` is), `git add -A -- <path>
:(exclude,glob)**/.*.tmp` staged nothing and `ls-files` with the same
  pathspecs listed nothing — exit 0, no message; a short name, or no
  exclude, worked. Found when deletes stopped committing. The engine uses
  only `:(literal)` pathspecs and removes temp files from the private index
  with `update-index --force-remove` after `add`.
- **Same host is not same pid namespace.** The Pi's editor runs in Docker
  with `--network host`: the container has the host's hostname and its own
  pids. A lock judges its holder's pid only when host _and_
  `/proc/self/ns/pid` match; otherwise only the 60 s mtime rule applies.
  Its own pid with another nonce is a previous process's (pid reuse) and is
  stale.
- **Nothing slow inside the lock.** The heartbeat keeps a stuck holder's lock
  fresh forever, so a hung fetch would block every writer. An upload's
  `fileImportUrl` download is bounded at 60 s (`UPLOAD_FETCH_TIMEOUT_MS`).
  34d: no page fetches, imports or image checks inside `withWriteLock` —
  fetch first, then lock and write.
- **A big batch can outlast the 30 s lock timeout.** `term rename drink
beverage` on a scratch clone (209 recipes, 275 files, one commit) took
  17.5 s on the workstation; the Pi is several times slower. Once 34d holds
  the lock for a whole batch, a write that arrives meanwhile waits up to
  `DISCONTENT_WRITE_LOCK_TIMEOUT_MS` and then answers `busy` (D10,
  retryable). That's by design, but a curator or script hitting it should
  retry rather than report a failure.
- **`gitLog`'s `files` reports a rename by its new path only** (git's rename
  detection). To see both halves of a slug change use `git show
--no-renames --name-status`.
- **A killed writer can leave `.<name>.<writeId>.<n>.tmp`** (between the
  temp write and the rename). It never enters an engine commit, shows as
  untracked in `git_status`, names the write, and is swept by the next lock
  holder after a takeover (or on a process's first acquisition) once older
  than 60 s.

### 34d

- **The lock is the merge's, not the sync's.** `gitSync` holds the sync repo
  lock (`instance/lock.ts`) for fetch, media and push, and the write lock only
  inside `gitPull` (clean check, merge, abort/reset, rebuild). Lock order is
  repo lock → write lock; a write never takes the repo lock, so a sync waiting
  on a batch cannot deadlock it. The sync's merge reuses its own fetch
  (`gitPull`'s `fetched`), so it waits for the lock **once**, up to 60 s
  (`SYNC_LOCK_TIMEOUT_MS`) — inside the 120 s a mirror's ping waits. Past
  that the outcome is `busy` (review round: it was `error`, which counted
  toward the failure tally and its desktop notification for a benign wait):
  not a failure, nothing merged, and `syncMirror` asks the runner again
  after 15 s (`BUSY_RETRY_MS`, at most 5 in a row), because a holder that
  moves no HEAD — a rebuild — would otherwise leave the mirror's commits
  waiting for an unrelated trigger.
- **`gitPull` takes the lock twice** (once from the sync). A short locked
  pre-check (dirty tree, a mirror's own commits) refuses before anything goes
  over the wire, the fetch runs unlocked, then the authoritative check, merge
  and rebuild run under the lock. A write landing between the two is fine:
  the second check sees it committed. A clean-tree check outside the lock
  would be wrong the other way — an engine write mid-flight (files written,
  commit pending) reads as dirty. **The merge source is derived in phase 1**,
  so phase 2 compares the branch and its upstream with phase 1's and answers
  `git_conflict` ("the branch changed while … was being fetched") rather than
  merging into a branch checked out meanwhile; the sync makes the same check
  before it pushes `branch`. On a mirror the merge is `--ff-only` whatever
  the pre-check saw.
- **A hand-staged file blocks every merge.** `requireCleanTree` refuses any
  staged or unstaged change, so with a scratch file staged the sync answers
  `blocked` as soon as the mirror has commits. That is the design (a merge
  must not fold someone's half-done work in); the stress run kept the remote
  passive while the scratch file was staged, then unstaged it for phase 2.
- **The /git page's pull is two halves now.** `git pull --no-rebase` became
  `fetch` (unlocked) then a merge under the lock, with the rebuild in the same
  scope. What it merges is **pinned right after the fetch** — the sha of
  `@{upstream}`, or of `FETCH_HEAD` for a named remote without one — because
  another caller's fetch while this one waits for the lock rewrites
  `FETCH_HEAD`; the message names the ref as `git pull` would ("Merge
  remote-tracking branch '…'"), the branch is re-checked under the lock, and
  a mirror merges `--ff-only` (epic 28 D1) rather than trusting the action's
  unlocked `ahead` check. A conflict is still left for the page's resolver: the lock is
  released with `MERGE_HEAD` present, and every engine write refuses
  (`dirty_tree`) until it is committed or aborted — both of which lock.
- **Retry is the caller's.** The CLI and MCP do not retry `busy` themselves:
  some seats are not idempotent (an import re-fetches its page under the
  15 s polite rule, a seat with two unbatched writes would repeat the first),
  and the message names the holder, which a person or the skill can judge.
  The skill waits 10–30 s and retries once; a script tests exit 75.
- **A pending refresh is not dirty — and a pending create is the hard
  case.** The shared index is behind HEAD, so a committed _create_ shows as
  a staged delete plus an untracked file (`D recipes/…` and `?? recipes/`),
  and a first cut that filtered `git status` paths through `git diff HEAD`
  still counted it twice (review round). `gitStatus` now counts from the
  status **as it will be once flushed**: the shared index copied to a
  private `discontent-index-<ULID>` (swept like the engine's if a crash
  leaves it), `reset -- <pending>` there, and `status` with that index. An
  edit since, or an untracked file beside a pending path, still counts. `requireCleanTree` flushes them first (2 s on
  `index.lock`); when `index.lock` is still held it answers `dirty_tree`
  ("N committed paths are waiting to be re-staged … retry shortly").
- **A ULID can't be a placeholder.** Server and browser would each make one
  (a hydration mismatch), so the featured form says "auto" and the group
  form shows the name's slug, or "auto" when the name slugifies to nothing.
  Explicit slugs (fixtures, the skill's readable `christmas-cookies-strip`)
  still work.
- **`smudge --update` stays unlocked.** The ref watcher's
  `updateAnnexedWorktree` writes annexed content over pointer files after a
  HEAD move. It only touches pointer files whose content just arrived, not
  files a write is making, and it can take minutes for a large video, which
  would hold every writer off — so it runs outside the write lock; its
  `index.lock` use is what 34c's pending refresh absorbs.
- **The CLI's `git sync` took no repo lock** (found in the stress run; only
  `syncMirror` did, although `instance/lock.ts` said the CLI was covered).
  Fixed in the review round: the local backend's `gitSync` (CLI and stdio
  MCP) takes `withRepoLock`, which does not wait — another sync running is
  `busy` (exit 75). The stress run's `raced` (phase 2) was a CLI sync beside
  the instance's; with the lock one of them is `busy` instead.
- **Per-type rebuilds lock in the site, not the engine.** Settings →
  Maintenance's four buttons call `rebuildIndex` directly; it collects the
  data files, then replaces the index, so a concurrent write's entry could
  vanish. They go through `controller/lockedRebuild.ts` (the write lock; on
  `busy` they log and leave the page as it was). Locking inside the engine's
  `rebuildIndex` would also cover build-time callers (fixture indexes, the
  Pi deploy's index build) and change a pinned engine module, so it stays a
  site wrapper.
- **Inventory refuses mid-merge before writing.** The engine refuses a
  commit mid-merge, but the inventory seat writes its file first, so it
  checks `assertNoMergeInProgress` at the top of its locked scope.

### 34f

- **34f — Sally's ItemList carries URLs only.** WP's Tasty Roundups emits
  `{"@type": "ListItem", position, url}` with no `name` or `image`, so names
  and pictures come from the body's cards whichever source wins. An item with
  no card falls back to its link text, then the nearest heading before it,
  then a title made from the URL slug.
- **34f — a card links more than its recipe.** Sally's cards carry an inline
  link to her cookbook page ("Sally's Baking 101"). A card's heading names
  only its _primary_ URL (the heading's link, else the picture's, else its
  only one); the cookbook link stays a weak prose link and drops out.
- **34f — the roundup can list a non-recipe.** The Halloween page's 14th
  ItemList entry is the cookbook page itself, under a card titled "Molten
  Chocolate Cobbler". It is the site's list, so it is listed; importing it
  fails `import_failed` (no Recipe on the page) and the call goes on. The
  skill shows the list before importing, which is where a person spots it.
- **34f — the intro mentions items out of order.** "These recipes for caramel
  apples, dirt pudding, …" links three items before the list starts. In
  links mode the order is each item's first _list-entry_ appearance (a
  picture or a heading), not its first mention.
- **34f — the pacing outlives the call, and calls overlap.** The skill runs
  `page_inspect_list` then `recipe_import_list` and re-runs on `remaining`
  back to back; `page_inspect_list` is read-only, so a client may run two at
  once; a client that times out on `/api/import-list` may retry while the
  first call is still fetching; and `recipe_import` / `page_inspect` can
  follow a list call at once. A per-call clock (the first cut) spaced none of
  that. Every fetch now goes through one **per-process, per-site queue**
  (`curation/sitePacing.ts`): acquire, wait out 15 s since the last request
  ended, run (a 403 retry inside the hold), record the end, release — and
  the epic-26 seats use it too. A dropped site stays dropped for an hour
  across calls. A CLI run is a new process and starts empty, so the skill's
  fallback and `--help` say to leave 15 s between runs.
- **34f — a 403 retry that answered 200 is not a refusal.** The first cut
  dropped the site whenever the retry was followed by any failure — so a
  200 HTML body at an image URL ("not an image") dropped the site. The drop
  now needs the retry's own status to be 403, or the retry to fail at the
  network level (`ForbiddenRetry.afterRetry` reports it).
- **34f — an image is not worth the recipe.** When an image's site is
  dropped or its download fails, the recipe is created without it and the
  result says so (a warning; `recipe_set_image` later). The attempt still
  counts against the cap — the page was fetched.
- **34f — positional picks drift.** A roundup edited between two calls moves
  its items, so `remaining` is `[{n, url}]` and a pick may be a URL: each is
  matched against the list as fetched now, a moved one follows its URL (with
  a warning), a gone one is `skipped`.
- **34f — SSRF.** A public roundup can link `http://169.254.169.254/` or a
  LAN host, and the editor would fetch it. Items on loopback, RFC 1918,
  CGNAT, link-local and IPv6 ULA/link-local hosts are dropped unless the list
  page is on such a host itself (fixtures, a LAN wiki). A public name that
  resolves privately, or a public item that redirects to a private one, is
  not caught.
- **34f — redirects.** A request is queued under the URL asked for; when the
  page fetch ends up on another site (`finalUrl`), that site's clock is
  advanced too. A redirect is not paced before it happens, and images do not
  report a final URL.
- **34f — the call must beat the HTTP timeouts.** Node's fetch gives up on a
  response's headers at 300 s. `limit` is at most 6 (1 + 6 × 2 requests,
  about 3 min), and the CLI's `--remote` backend gives `/api/import-list`
  285 s and says "list the page again to see what landed" when it expires.
- **34f — `RECIPE_POLITE_GAP_MS`** sets the real clock's gap. It exists for
  tests: `test/setupTests.js` sets it to 0 because the epic-26 suites import
  stubbed `example.com` pages back to back. Never set it on a real editor.
- **34f — "same host first" reorders a mixed list.** A roundup that links its
  own recipes and other sites' lists its own first; `n` is that order, not
  the page's. Single-site roundups (Sally's) are unaffected.
- **34f — loopback is never paced** unless `Pacing.paceLoopback`. The CLI
  process tests (`cliJson.test.ts`) and the MCP tests use 127.0.0.1 with the
  real clock and do not wait; `importList.test.ts` turns pacing on with a
  fake clock and asserts the spacing on what its two servers saw.

## Results

### 34a — Term pages

- `subtreeSlugs`, `termKeys` / `subtreeKeys` (alias slugs), `mergeTermRows`,
  `TERM_PAGE_RECIPE_LIMIT` and `termPageData` (the pure half of
  `resolveTermPage`) in `common/controller/tagVocabulary.ts`. Curation's
  private `subtreeOf` in `curation/terms.ts` is gone; `getTerm` uses
  `subtreeSlugs`.
- `resolveTermPage` reads the tree and the record, then
  `byTerm.readKey(k)` for recipes and groups for each key of
  `subtreeKeys` (subtree slugs plus their records' alias slugs). It merges
  the rows (each carrier once, date then slug descending, the fold's own
  order) and applies `pinned`. It no longer reads either `terms` cloud. The
  `/tags` list and tree, autocomplete, ⌘K, the Make page chips and
  `readTermPageSlugs` still read the clouds. No engine change, no spec bump,
  no reindex.
- **Child counts include descendants**: the distinct recipes and groups of
  the child's whole subtree. That is what the child's own page lists and what
  `/tags`' tree prints beside it. The breadcrumb shows labels only (Traps).
- The page shows "N here · M including narrower terms" (`term-recipe-counts`)
  only when M > N; M is the whole subtree, before the cap. The list shows
  every pin, then the newest, up to 48, and "See all M recipes"
  (`term-see-all`) → `/search?q=tag:<term>` when there are more. The empty
  state shows only when the subtree has no recipes. The export uses the same
  component through `tagRoute`, and featured-term detail pages pick up the
  subtree too.
- **Page size**, a production build of this branch against a scratch clone of
  the real content (`curl` bytes, HTML with the inline RSC payload):
  `/tags/course` **498 KB** (48 of 450 cards; uncapped ≈ 4.4 MB at the
  workstation's ~9.7 KB/card, and 55 KB on main today, where it is the empty
  state); `/tags/drink` **601 KB**, from **2.03 MB** on the workstation (main,
  209 cards); `/tags/main-ingredient` 522 KB (48 of 312); `/tags/dessert`
  517 KB; `/tags/christmas-cookies` 126 KB (8 cards, from 96 KB for 5).
- Real corpus, read-only from the content files (665 recipes, 0 groups, 128
  records, 215 term pages): `/tags/course` 0 here · 450;
  `/tags/main-ingredient` 0 here · 312; `/tags/christmas-cookies` 5 here · 8;
  `/tags/drink` 209 · 209 (every drink carries `drink`, so no line).
- **Expiry, one carrier change** (a recipe write that changes its tags):
  **before**, the `terms` cloud moves, so all **215** term pages expire.
  **After**, only the pages whose subtree holds one of the moved keys
  expire: **min 2, median 6, mean 6, p90 8, max 11** over the corpus's
  recipes. One moved key expires itself plus its ancestors, at most **2**
  pages, because the deepest chain is two levels (`dessert` → dessert +
  course; `gin` → gin + spirit; `christmas-cookies` → 1). For a non-tag edit
  the median goes from 4 to 6 (Traps).
- Reads: a leaf page does 4 (tree, record, two rows). `/tags/drink` is the
  widest at 2 × 66 + 2. All 215 pages together do 1,100 cached reads, against
  1,290 before (six each). The real corpus has no aliases yet, so alias keys
  add nothing today.
- The edit form (`tags/[tag]/edit`) reads the term's own rows, not its page
  (Traps).
- Tests: `test/tagTerms.test.ts` gains `subtreeSlugs` (order, leaf, missing
  slug, cycle and self-parent, a childless ghost), `termKeys` /
  `subtreeKeys`, `mergeTermRows` and `termPageData` (a root with no carriers
  of its own, child subtree counts, breadcrumb labels, pins over the merged
  list, the cap with pins kept past it, a descendant's alias carriers,
  `null`, label fallback). `test/termPageReads.test.ts` mocks the cached
  readers: `resolveTermPage` reads one key per subtree slug and alias (a key
  nothing carries included) and never a `terms` cloud or a whole by-term map.
  `tag-pages.spec.ts` gains four cases on `christmas-cookies`, the fixture
  unchanged: a root with no carriers of its own (`course` created through
  the API, `dessert` under it); and three that visit `/tags/dessert`
  **before** the write, so a stale cached page fails them — a recipe tagged
  only `cookies` ("8 here · 9 including narrower terms"), the first carrier
  of a new child `bars` (a ghost key), and a recipe tagged with `cookies`'
  alias `biscuits`.
- Verification after the review round: editor typecheck and export `tsc`
  clean; vitest 58 files, 1238 tests (one CLI process test timed out at 30 s
  while a build ran beside it, and passed alone); Playwright build mode
  `tag-pages`, `term-edit`, `featured-recipes`: 80 passed.

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
- **The write lock (D6)** — `packages/cms/git/writeLock.ts`. Beyond the
  spec:
  - The lock lives in the **per-worktree git dir** (realpath'd and cached,
    so two spellings of one repository share one key).
  - It is **created whole**: the holder record goes to
    `discontent-write.lock.<id>.new`, which is `link`ed to the lock path
    (`EEXIST` = taken). There is never an empty lock file.
  - The record also carries `pidns` (`/proc/self/ns/pid`) and a per-process
    `nonce`. Pid liveness counts only when host **and** pid namespace match;
    our own pid with another nonce, or without a live hold here, is stale
    (Traps).
  - A takeover renames the stale file aside and links it back if it was a
    fresh one, logging when it can't. Before moving HEAD, a commit checks
    `writeLockStillHeld` and fails (`CommitFailedError`, "taken over")
    rather than commit over a new holder.
  - A hold is marked inactive at release, so a background task can't
    re-enter it. `serialInHold` runs the commits of one hold one at a time.
    `outsideWriteLock` escapes the hold for work scheduled to outlive it.
  - On a fresh acquisition it sweeps leftover private indexes and lock temp
    files. After a takeover, or on a process's first acquisition, it also
    sweeps untracked atomic-write temp files older than 60 s
    (`ls-files -o`).
  - Test overrides: `withWriteLock(dir, op, fn, {timeoutMs, staleMs,
heartbeatMs})`. Also exported: `currentWriteId`, `readWriteLock`,
    `ATOMIC_TEMP`.
  - Who takes it: `createContent` / `updateContent` / `deleteContent`
    around the whole write (slug check, files, LMDB, pagination and
    `.pagination-changes.json`, dependents, commit), and `genericActions`'
    `overwriteCreate` / `overwriteUpdate` around the delete and the
    create/update. `withBatchCommit` is the site's (`curation/batch.ts`):
    34d wraps it, and nesting is re-entrant.
  - `genericActions` maps `RepositoryBusyError` and `MergeInProgressError`
    to their own messages instead of "Failed to …".
- **Commits (D7)** — `packages/cms/git/commit.ts`, on plain `spawn`
  (`git/run.ts`). Kept: the messages, `--author` semantics (author from the
  write, committer from git config; checked against `%an|%ae|%cn|%ce`), the
  no-op without `.git`, the no-change skip and the stamp advance.
  - The message gets `git commit -m`'s whitespace cleanup. `commit-tree`
    honours `commit.gpgSign` itself.
  - Each commit gets its own private index id.
  - Pathspecs are `:(literal)` (Traps: no `:(exclude)`). `run.ts` strips
    inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the
    `GIT_*_PATHSPECS` switches.
  - An unborn branch uses `read-tree --empty` and CAS old value `""`. On a
    detached HEAD, `update-ref HEAD` moves it and leaves the branch.
  - A `read-tree -m` that refuses (unmerged entries) falls back to a plain
    `read-tree`.
  - **The stamp advances right after `update-ref`**, before the refresh, so
    a refresh waiting on `index.lock` past `FOREIGN_SETTLE_MS` (2 s) can't
    make the instance reindex our own commit as foreign.
  - **CAS failure:** a non-overlapping move redoes on the new HEAD. So
    does an overlapping move whose content at the overlapping paths equals
    ours (`ls-tree` of both trees), which then ends as the no-change skip.
    Anything else is `CommitConflictError`. A failure with HEAD unchanged
    (a held ref lock) is retried the same way (×3, then
    `CommitFailedError`). A commit that lands on a foreign one leaves the
    stamp stale, as it should.
  - `MergeInProgressError` covers `MERGE_HEAD`, `CHERRY_PICK_HEAD`,
    `REVERT_HEAD`, `rebase-merge/` and `rebase-apply/`, with `operation`
    and `marker` fields and a message naming the op. It is checked first
    thing under the lock in all three writes (a refused write touches
    nothing), and again per commit.
  - `CommitConflictError {writeId, touchedPaths, conflictingPaths}`,
    `CommitFailedError {writeId, touchedPaths, cause}`.
  - **The pending refresh** stores the paths the commit actually changed —
    for a commit-everything, the diff, never `.`, so a flush can't unstage
    hand-staged files.
    - The retry (`DISCONTENT_INDEX_REFRESH_MS`, 10 s) is skipped when a
      refresh is already pending or `index.lock` is older than 5 s. A stale
      lock no longer costs every write 10 s inside the write lock.
    - It is applied by every later locked commit, by
      `flushPendingIndex(dir, {timeoutMs, lockTimeoutMs})`, and by a
      background retry (`DISCONTENT_INDEX_FLUSH_RETRY_MS` × 1, 3, 10, 30,
      60; default 1 s; unref'd, under the lock, outside the hold).
    - `readPendingIndex(dir)` lists the pending paths.
  - `commitTestHooks.beforeUpdateRef` is a test seam (moves HEAD at the
    worst moment); unset in production.
- **Atomic writes (D8)** — `packages/cms/fs/atomicWrite.ts`
  (`writeFileAtomic`, `writeJsonAtomic`, `writeStreamAtomic`,
  `temporaryPathFor`) for data files (same bytes as `outputJSON`), uploads
  and `.pagination-changes.json`.
  - Temp names are `.<name>.<writeId>.<n>.tmp`, with the name cut to 200
    bytes by code point.
  - The replaced file's mode is kept.
  - A failed source leaves the old file and no temp.
  - Temp files are dropped from every engine commit
    (`update-index --force-remove` after `add`).
  - An upload's `fileImportUrl` fetch has `AbortSignal.timeout(60 s)`.
- **Hooks and annex** — the engine runs no hooks (Traps). git-annex is
  initialised on the real repo: hooks `pre-commit`, `post-checkout`,
  `post-merge` and `post-receive`; `* filter=annex` in `info/attributes`;
  no `.gitattributes` yet. The annex case commits a 64 KB upload under a
  10 KB `largefiles` rule through the private index. The commit holds the
  pointer, `annex find --in here` and `annex fsck` pass, and a pre-staged
  foreign file stays staged.
- **Concurrency test** (`test/concurrentWrites.test.ts`): two `tsx`
  processes × 15 `createTerm`s while a third holds `index.lock` in
  200 ms / 100 ms bursts. Result: 30 commits, each touching only its own
  `term.json`, nothing pending, a clean tree, 30 LMDB entries. Over three
  runs: 14–17.5 s for the 30 writes including two `tsx` starts; median
  270–320 ms per write (each waits for the other writer's); 48–58 lock
  bursts.
- **Rebuild under the lock** — a full CLI `reindex` of a scratch clone of
  the content repo (35e0d1d) on the workstation took 0.80–0.94 s (recipes
  0.70–0.77 s). Epic 29's Pi figure is 2.5 s; both are far inside 30 s. The
  long holder is a batch, not a rebuild (Traps: 17.5 s for a 209-carrier
  rename). The clone's tree stayed clean after the rename commit.
- **Comment fix** — `pagination/changes.ts` and `derivedPaths.ts` said the
  old `"./*"` fallback skipped dotfiles; git's pathspec never did. The
  fallback is `.` now, and the ignore rule is what keeps the artifact out.
- **Tests.**
  - New: `ulid.test.ts` (7); `writeLock.test.ts` (21: re-entry, FIFO,
    dead-pid / age / reused-pid takeovers, another pid namespace not
    judged, timeout naming the holder, heartbeat, release-own-only,
    still-held, `serialInHold`, both sweeps, and three `tsx` processes
    racing one stale lock with no overlapping holds); `atomicWrite.test.ts`
    (4); `concurrentWrites.test.ts` (1).
  - `curationGit.test.ts` +24: a pre-staged file; reflog/author; held,
    short and old `index.lock`; flushes (next write, `flushPendingIndex`,
    background); commit-everything pending paths and staged files kept;
    stamp before refresh; HEAD moved over other paths, the same path, the
    same content; ref-lock failure; taken-over lock; rename; delete,
    including a never-committed item; unborn branch; detached HEAD; stamp;
    merge / cherry-pick / revert / rebase; temp files never committed;
    serialised commits in one hold; no temp files after writes.
  - `annex.test.ts` +1. F34's batch cases unchanged and green.
  - The cross-process CAS is covered by the seam cases (a separate `git`
    process moves HEAD between `commit-tree` and `update-ref`) and the
    concurrency test.
- **Verification (after the review round).** vitest 62 files / 1296 tests;
  typechecks clean for the editor, the export (`tsc`), the portfolio and the
  demo. Recipe Playwright in build mode (git, api-write, duplicate-slug,
  mirror, term-edit, groups, edit, new-recipe, reference-updates):
  166/166. CMS demo Playwright in build mode, all specs including
  `git.spec.ts`: 109/109. A first demo run lost one case to an `EEXIST`
  `mkdir test-content` in the fixture reset (`update.spec.ts`, "should
  update note date") — a harness race; it passed on the rerun.
- **For 34d.**
  - Imports: from `@discontent/cms/git/writeLock` — `withWriteLock`,
    `RepositoryBusyError`, `currentWriteId`, `readWriteLock`,
    `writeLockStillHeld`; from `@discontent/cms/git/commit` —
    `CommitConflictError`, `CommitFailedError`, `MergeInProgressError`,
    `flushPendingIndex`, `readPendingIndex`, `assertNoMergeInProgress`; and
    `ulid` from `@discontent/cms/util/ulid`.
  - Error codes: `RepositoryBusyError` → `busy`, `CommitConflictError` →
    `git_conflict`, `MergeInProgressError` → `dirty_tree`.
  - Call `flushPendingIndex` at the top of `requireCleanTree`, and show
    `readPendingIndex` in `git_status` and on /git.
  - Raw `git commit`s in the site (`commitMerge`, revert) still go through
    the shared index — take the write lock around them.
  - Keep fetches out of the lock.

### 34d — Site writes

- **Lock scopes (D6).** One `withWriteLock` scope each, re-entrant with the
  engine's own:
  - `withBatchCommit` (`curation/batch.ts`): the whole batch — every write,
    the commit and the `(partial)` commit.
  - `patchInventory` / `setInventory`: read, diff, write (now atomic,
    `writeFileAtomic`) and commit.
  - `reindex` (`curation/reindex.ts`), so every rebuild — the CLI's, the
    banner's, `rebuildAllIndexes`, a foreign-HEAD `reindexWhenForeign` —
    indexes a tree no write is changing.
  - `gitRevert` / `gitRestore`: from `requireCleanTree` through the git
    command, its abort or `reset --hard`, and the rebuild. `gitPull`: the same
    from the clean check through merge, abort, reset and rebuild, with the
    fetch outside (Traps). `requireCleanTree` calls `flushPendingIndex` first.
  - The /git page (`actions/sync.ts`): the pull's merge and rebuild,
    `resolveConflict`, `commitMerge` (a raw `git commit` through the shared
    index — a merge commit needs `MERGE_HEAD`), `abortMerge` and "Commit
    working changes", each with its rebuild; `actions/index.ts`: branch
    checkout with its rebuild, and `checkout -b`.
  - Settings → Maintenance's per-type rebuild buttons (recipes, groups,
    featured, term records) through `controller/lockedRebuild.ts` (review
    round), and the export's `rebuildAllIndexes`, which answers a `busy`
    as the export's message.
  - The sync: only the merge (`gitPull` inside `gitSync`, reusing the sync's
    fetch, so one wait of up to `SYNC_LOCK_TIMEOUT_MS` = 60 s); past it the
    outcome is `busy` (a new `SyncOutcome`, not a failure), nothing merged,
    and `syncMirror` schedules a retry in 15 s (at most 5 in a row). The
    CLI's and stdio MCP's `git sync` now take the sync repo lock too
    (`busy` when another sync runs).
  - Not locked, on purpose: fetches and pushes, imports and image downloads
    (the seats fetch before they write), `annex merge`/`copy`, and
    `smudge --update` (Traps). Seats that write through the engine
    (recipes, groups, terms, features, uploads) were already locked by 34c.
- **The timeout: keep 30 s, no automatic retry.** The engine default stays
  `DISCONTENT_WRITE_LOCK_TIMEOUT_MS` = 30 s for every site caller. The
  measured holders are short (a write 0.3 s, a full rebuild 0.8–0.9 s here
  and 2.5 s on the Pi, the stress run's slowest CLI write 15.6 s end to end
  with a `tsx` start); the one long holder is a big batch (17.5 s for a
  209-carrier rename here), which on the Pi could pass 30 s. That batch is a
  curator's own call, so the writer it delays is rare, and `busy` tells it
  who and how long. A form waiting longer than 30 s is worse than a clear
  "busy, retry" message; scripts and agents retry on `busy` / exit 75 (the
  skill: wait 10–30 s, retry once). Only the unattended sync waits longer
  (60 s, inside the 120 s a mirror's ping allows). A deployment that wants
  more sets the env (e.g. the Pi's container).
- **`busy` (D10).** `RepositoryBusyError` → `busy` in `toErrorObject`
  (`CommitConflictError` → `git_conflict`, `MergeInProgressError` →
  `dirty_tree` alongside); `statusFor("busy")` = 503 and `errorResponse` adds
  `Retry-After: 5`; the HTTP backend rehydrates the body's code and maps a
  bare 503 to `busy`; `exitCodeFor` = **75** (`EX_TEMPFAIL`), listed in
  `recipes --help` with the env; the MCP instructions' code list, with "wait a
  few seconds and make the same call again"; `isBusyError` for callers that
  branch. Editor forms already showed the engine's message through
  `genericActions` (34c); the site's actions pass it through
  (`toErrorObject` / `normalizeError`), and the stale-index banner's rebuild
  leaves the banner up on `busy` instead of throwing. 23-T25's chain and
  23-T26's retirement are in `agent-mcp.md`; SKILL.md says what `busy` means.
- **Pending index paths.** `SyncStatus.pendingIndex` (`readPendingIndex`) in
  `gitStatus`, so in `git_status`, `/api/git/status` and `recipes git status`
  ("N committed paths waiting to be re-staged …"); the /git page shows "N
  paths waiting to be re-staged — they're committed; the index catches up
  automatically" (`git-pending-index`). `dirty`/`dirtyCount` are counted
  from the status as it will read once the pending paths are re-staged (a
  private copy of the index, reset there — Traps), so a committed create or
  update is not dirty, and the page no longer offers "Commit working changes"
  for a write that already landed.
- **ULID slugs (D9).** `createFeaturedRecipeSlug` → `ulid(date).toLowerCase()`
  (out-of-range dates fall back to now); `createGroupSlug`'s fallback →
  `group-<ulid>`, with `groupSlugFromName` as the deterministic half. The
  featured form's slug field is blank with an "auto" placeholder; the action
  fills it in. The seat comment, the `feature` tool description and SKILL.md
  no longer ask for explicit slugs. No index layout change: the key is still
  `[date, slug]`. Nothing parsed the old default format; the explicit slugs
  in Playwright fixtures and `reference-updates.spec.ts` stay.
- **Tests.** `test/siteWrites.test.ts` (15): a second `tsx` process holds the
  lock, writes a file after 300 ms and commits it 700 ms later — `gitRestore`
  and `gitPull` wait (≥ 0.9 s), the file is on disk and in HEAD before their
  own commit, the tree is clean; `busy` from a seat (`createRecipe`,
  `patchInventory`) with a 200 ms timeout → code, 503, `Retry-After`, exit
  75, nothing written; the HTTP backend from our body and from a bare 503;
  MCP `term_create` → `isError`, `code: "busy"`; the CLI process → exit 75
  and `--json` code `busy`; `gitSync` → `error`, nothing merged, then
  `synced` once released; two slug-less features with one `date` → two ULID
  slugs whose time is that date; `group-<ulid>`; `git_status` with a pending
  refresh (named, not dirty; dirty again once edited; a restore refuses while
  `index.lock` is held and flushes after). Review round, +5: a pending
  _create_ is not dirty while an untracked file beside it is, and no private
  index is left; `gitSync` busy → outcome `busy`, tally 0; the local
  backend's `git sync` → `busy` / exit 75 while another sync holds the repo
  lock, then `nothing`; a pull whose branch is checked out while it waits
  for the lock → `git_conflict`, nothing merged; an inventory write mid-merge
  → `dirty_tree` with no file written; `lockedRebuild` runs under the lock
  and answers `false` on `busy`. `test/curation.test.ts`'s D8 boundary
  admits `git/writeLock`, `fs/atomicWrite` and `util/ulid`.
- **Verification.** Editor typecheck and export `tsc` clean; vitest **65
  files / 1336 tests**; recipe Playwright in build mode (`git`, `sync`,
  `featured`, `api-write`, `groups`, `term`): **145 passed**. After the
  review round: vitest **65 files / 1341 tests**; Playwright build mode with
  `mirror` added to the pattern: **154 passed**. The stress run below was
  made before the review round (its CLI syncs ran without the repo lock).
- **Scratch-clone stress run** (content repo at `35e0d1d`, cloned under the
  job's tmp dir, with a local bare remote as `origin`; both annex-initialised,
  `annex.largefiles=largerthan=500kb` in the clone; reindexed). A
  workstation-mode editor — this branch's production build, `next start` on
  :3047, `EDITOR_ROLE` unset, `mirrors: ["origin"]` — synced on every HEAD
  move. A scratch file was staged by hand first. Three loops in parallel, all
  CLI with `--content-dir`: A, 15 × (`term create`, `term update`); B, six
  bursts of four concurrent slug-less `feature`s, each followed by a
  `term create`, plus one `image --file` of a 1.23 MB JPEG; S, a CLI
  `git sync` every 20 s (5), then a final one.

  | Check                             | Result                                                                                                    |
  | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
  | Commands                          | 61 writes + 6 syncs, **every exit 0**, 0 `busy` retries                                                   |
  | Commits = writes                  | **61 = 61** (21 term creates, 15 updates, 24 features, 1 image), 0 merges                                 |
  | Scratch file                      | still staged (`A scratch-34d.txt`), in no commit; nothing else staged                                     |
  | Remote level after the final sync | yes (same HEAD)                                                                                           |
  | Image                             | annexed pointer in HEAD, content in the work tree, `whereis`: here **and origin** (the sync's media step) |
  | Leftovers                         | 0 `discontent-index-*`, 0 lock files, no `index.lock`, 0 `*.tmp`, nothing pending                         |
  | Slug-less features                | 24 unique ULID slugs; every burst put 3–4 in the same second                                              |
  | Instance syncs                    | 18 (14 `synced`, 4 `nothing`); CLI syncs 6 × `synced`; 0 foreign reindexes                                |
  | Duration                          | 183 s; per write min 4.4 s / median 6.8 s / max 15.6 s (a `tsx` start each, under load)                   |

  **Phase 2, merges under the lock:** the scratch file unstaged; a second
  clone of the bare ("the Pi") pushed three commits 12 s apart while loop C
  made 10 `term create`s. All 11 commands exit 0; the instance merged the
  Pi's commits in three merge commits between the writes (one `raced`
  outcome when the Pi pushed mid-sync, caught up by the next); 10 + 3
  non-merge commits; the tree clean; the remote level; `git_status`: not
  dirty, `indexStale: false`, nothing pending; the indexes list all 31
  stress terms and 45 features. This is epic 33's failing scenario (the
  sync's `status`/`merge` holding `index.lock` under a burst of CLI writes),
  and nothing failed. The clones were deleted afterwards.

- **Before 34e applies content to the real repo:** the workstation must run
  this build (`pnpm workstation update`, Roger's) — until then its sync
  merges without the write lock, so epic 33's "stop the workstation first"
  still applies. Once updated, scripted runs can leave it up; still `POST
/api/revalidate` after a CLI run (a separate process cannot expire the
  editor's caches).

### 34f — Roundup import

**Built.** The parser is `common/util/roundupPage.ts` (pure, hast, beside
`pageMetadata.ts` — in `common/util/` rather than `curation/` because the D8
import boundary allows `recipe-website-common/util/*` and not
`hast-util-from-html`). The seats are `editor/controller/curation/
importList.ts`: `inspectList(ctx, url)` and `importList(ctx, url, options)`,
on the per-site queue in `curation/sitePacing.ts`. CLI `inspect-list <url>`
and `import-list <url> (--pick 1,3,5-7|<url>,… | --all) [--term s
[--term-label L]] [--limit 1-6] [--dry-run]`; routes `POST
/api/inspect-list` (read scope) and `POST /api/import-list` (write scope;
always 200, a batch report); MCP `page_inspect_list` (readOnly) and
`recipe_import_list` (write, not destructive). Tools 47 → 49, pre-approved
35 → 37 (settings, skill frontmatter, CLAUDE.md, `curatorSkill.test.ts`);
held back unchanged at 12. No new error code: per-item failures ride the
result (`failed` with `error`, `skipped` with a warning), and the call throws
only `validation` (no pick, both, a pick past the end, `limit` over 6, a bad
URL, a `termLabel` that is another term's alias — all before any fetch),
`no_git_identity` (a real run without a committer, before any fetch) or
`import_failed` (the list page cannot be fetched, or its site is dropped).

**Shared files, additively.** `ForbiddenRetry.beforeRetry` (awaited in place
of the 403 delay, so the queue spaces and counts the retry) and
`afterRetry` (the retry's response, so only a second 403 drops a site);
`createRecipe(…, {fetchImage})` and `buildRecipeWrite({fetchImage,
probeImage})`; `createTerm` joins a batch (`batchOptions` / `collectBatch`, a
no-op outside one) so `--term`'s create and assign are one commit — `Create
term: <slug> (+N recipes)`, or `Assign term: …` when the record exists;
`termAliasOwners` in `terms.ts` (the term check before the first fetch).
`inspect.ts` and `importRecipe.ts` fetch through the same queue (page,
image, dry-run probe), so `page_inspect` / `recipe_import` right after a
list call are spaced too. The backend seam, CLI index, HTTP backend (plus a
285 s client timeout on this one route) and registry each gained two
entries.

**The term.** `term` is resolved before anything is fetched: an alias names
its owner (with a warning); a record keeps its label; with no record the
label is `termLabel`, else the tag's existing label (a carried tag), else
the list's title (else the slug, when the title is another term's alias).
`createTerm`'s label warnings ride `term.warnings`. A batch that fails after
the create reports `created: true` and the error; what was written is
committed "(partial)" (F34).

**Defaults and why.** One real import is **two requests** (the recipe page
and its image; a 403 adds a retry, 15 s later); a dry run is **one** (no
image probe — the dry run reports the image URL instead). The list page is
one more per call. So the per-call cap is **3 imports** (1 + 3 × 2 = 7
requests, six 15 s gaps ≈ 90 s plus transfer) and **6 for a dry run**
(1 + 6 = 7, the same ≈ 90 s) — under the ~2 min an MCP client allows a call.
`limit` goes to **6 at most** (1 + 6 × 2 = 13 requests ≈ 3 min), under Node's
300 s headers timeout for `/api/import-list`. `existing` picks cost nothing
and do not count; an item whose image could not be had counts (its page was
fetched). `remaining` is `[{n, url}]`; a re-run passes it back as `pick`.

**Fixtures** (`test/fixtures/roundups/`): Sally's Thanksgiving pies (an
ItemList roundup, 40 Tasty Roundups cards; 52 KB after trimming scripts,
styles, the sidebar and most comments) and her Halloween desserts with the
ItemList removed (the links-only case, 24 KB, keeping menu, breadcrumbs,
callout, affiliate, print, share, related-post, comment and footer links to
be dropped); a hand-written cross-site roundup (numbered headings, lazy and
`srcset` images, `rel="sponsored"`, comment-page and pagination links); and
a single recipe page (neither: "No schema.org ItemList and only 2 candidate
links … The page has a Recipe of its own"). Each Sally's page was fetched
once (the Halloween one 403'd curl's Chrome UA under Cloudflare and was
fetched as Node's plain `fetch`, the importer's first identity, minutes
later). Playwright's `importable-uploads` gains `uploads/roundup.html`.

**Tests.** `roundupPage.test.ts` (11: URL helpers, the four fixtures,
private hosts dropped from a public page and kept on a private one,
relative links against the page rather than its canonical, `www.` and
slash spellings deduped); `importList.test.ts` (16: two local servers as two
sites and a fake clock — picks, `existing` skip, the term create + assign
as one commit and an idempotent re-run, a 403 retried once then the site
dropped for the next call too, an image refused twice (recipe without it,
site dropped) beside one whose retry answered 200 with HTML (recipe without
it, nothing dropped), two `importList`s and two `inspectList`s at once under
`Promise.all`, URL and `{n, url}` picks against a changed list, the cap and
a continuation, a dry run that fetches no image and writes nothing,
validation, an alias term and an alias `termLabel` refused before any fetch,
a carried tag's label, `inspect` + `import` sharing the real-clock queue,
`--pick` ranges and URLs, the HTTP backend's routes and error rehydration;
every same-site pair of requests ≥ 15 s apart on the servers' own clock);
`mcp.test.ts`, `cliJson.test.ts`, `curatorSkill.test.ts`; Playwright
`api-write.spec.ts` (401 without a token on both routes, a read token lists
and is 403 on import, a dry run, `limit: 7` → 400, a real import with a
term, `existing` afterwards). After the review round: vitest **60 files /
1268 tests**; editor typecheck and export `tsc` clean; Playwright build mode
`api-write` **27 passed**.

**Live dry run** (scratch clone of the content repo at `35e0d1d`, CLI with
`--content-dir`, runs ≥ 20 s apart): `inspect-list` on the Thanksgiving pies
→ `itemlist`, **40 items, 8 existing** (the-great-pumpkin-pie-recipe,
pumpkin-cheesecake-pie, salted-caramel-apple-pie-bars,
caramel-apple-cheesecake-pie, brown-butter-pecan-pie-bars, maple-pecan-pie,
cranberry-curd-tart, butterscotch-pie); `import-list --pick 1-8 --term
thanksgiving-pies --dry-run` → 5 would-import, 3 existing, the term would
be created and assigned to all 8, **6 requests in 82 s**. On the Halloween
desserts → `itemlist`, **14 items, 0 existing** (the 14th is the cookbook
page, Traps); `--pick 1-3 --dry-run` → 3 would-import, **4 requests in
51 s**. `suggestedTags` came back as the page's category, cuisine, method
and keyword (`dessert, american, baking, halloween cookies`) — hints only.

**Not done:** the editor's import form keeps single-recipe import; a list
picker is a backlog row (UI).
