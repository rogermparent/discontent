# Epic 31 — Finish the taxonomy, F32 renames, curation polish, content cleanup

> **This is the durable source of truth for the epic-31 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching term search
> (`common/controller/tagExpansion.ts`, `queryLanguage.ts`,
> `curation/search.ts`), the term seats (`curation/terms.ts`, the `term_*`
> MCP tools, `recipes term …`), group references that follow renames
> (`packages/cms/content/referencePath.ts`, `updateDependents.ts`), or the
> importer's 403 retry. Update the roadmap **Status** column and the **Now**
> line at every phase boundary. Earlier epics are cited by number with a
> prefix (`24-D6`, `30-T5`). `agent-taxonomy.md` (epic 24) is the design for
> 31b, 31c and 31e: read its D1–D9 and T1–T19 first.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 31-plan (#190) and 31a (#191) are merged; 31b is in review. 31c, 31d and 31e are built on their own branches, waiting their turn; 31f's content commits are done (local, unpushed).

## Context

Epic 30 closed on 2026-10-09 (#184–#189 merged, the Pi deployed, the content
repo pushed at `ff8ace4`). For one unattended overnight session Roger picked
all four open areas:

1. **Finish the taxonomy epic.** Epic 24 stopped after 24c: term records exist
   but are read-only, and only a one-off script can write one (30d wrote
   `syrup` that way).
   - **24d** — hierarchy-aware search (`tag:dessert` also finds `cookies` and
     its children) and `/search/terms`.
   - **24e** — term tools: the `curation/terms.ts` seat, the API, the
     `recipes term …` CLI and 8 MCP tools.
   - A **term edit form** at `/tags/<slug>/edit`.
2. **F32, renames only.** Renaming a recipe or a sub-group rewrites every group
   item that points at it, in the same commit. Deletes stay dangling.
3. **Curation and import polish** — dry runs report image size, a polite 403
   retry, feature dedupe, `git_push` with no remote, "Add group" in the group
   form, tables in term descriptions, stale docs.
4. **Content cleanup** (local commits, no push) — the 38 recipes with
   `{type: "heading"}` instructions, and the deferred spritzes and sodas.

## Decisions

### D1 — F32 covers renames only, with no borrowing

Decided with Roger. Group items follow a rename of the recipe or sub-group they
name, in the rename's commit. The group index shape does not change, no fixture
is regenerated, and a group never borrows fields from its members. A delete
leaves the item dangling, as today (`missing` in `group_get`).

### D2 — `feature` refuses a duplicate unless asked

Decided with Roger. `feature` refuses a target that is already featured with
`slug_conflict` (409), naming the existing entry's slug. An `again` input
(`--again` on the CLI, a field on the MCP tool) allows a deliberate duplicate.
The browser featured form runs the same check.

### D3 — The 403 browser-header retry waits 15 s off the browser form

Decided with Roger, closing `30-T5`. On a 403 the importer retries once with
browser headers. On the CLI, MCP and API paths it first waits
`RECIPE_FETCH_403_DELAY_MS` (default **15000**; `0` = retry at once; `off` =
never retry). The browser `/new-recipe` form keeps its immediate retry
(`delayMs: 0`), because a person is waiting on it.

### D4 — `term_cycle` is 422

`term_cycle` maps to **422**, matching `group_cycle` (`curation/http.ts`).
`24-D7`'s 409 is superseded. `term_in_use` is 409 (a state conflict, like
`slug_conflict`).

### D5 — MCP counts

`24-D7`'s counts are stale. Epic 31 takes the server from **38 → 46** tools and
the pre-approved list from **28 → 34**. Held back: `term_delete` and
`term_merge`, joining the existing ten.

### D6 — Heading conversion rule (31f)

Each `{type: "heading"}` entry in `instructions` starts an `InstructionGroup`
named after the heading's text, with one trailing ":" stripped. Steps before
the first heading stay at the top level. `name: ""` is dropped from steps. One
`recipes update` per recipe: 38 commits.

### D7 — Spritzes and sodas are sourced politely or skipped

The drinks are Mermaid Lemonade, Cotton Candy Fizz, Cascara Ginger Soda, Spicy
Cascara Highball, Red Wine Spritz, Blood Orange Spritz and Zero-Proof Spritz.
They come only from reachable sites (acouplecooks, Imbibe, Love and Lemons, The
Kitchn), found by web search first so nothing is crawled, under `30-D5`:

- requests to one host are **sequential and at least 15 s apart**;
- at most **one retry after a 403**, then the host is dropped;
- **no parallel fetching** against a host;
- **image downloads count** as requests.

A drink that can't be sourced is skipped and recorded, never invented.

### D8 — Autonomy

Decided with Roger. Each phase is its own PR off `origin/main`, merged on green
CI under the standing grant (merge commit, branch up to date with `main`, no
`--admin`). **No deploys and no content pushes**; both are Roger's. If a
phase's CI fails for a reason that can't be fixed with confidence, its PR stays
open and the reason is recorded here.

## Roadmap

| Phase    | Scope                                                                                                    | Branch                  | Status     |
| -------- | -------------------------------------------------------------------------------------------------------- | ----------------------- | ---------- |
| 31-plan  | This doc, CLAUDE.md entry, taxonomy roadmap note                                                         | `agent/31-plan`         | ✅ #190    |
| 31a      | Image size in dry runs, polite 403 retry, feature dedupe, push with no remote, "Add group", tables, docs | `agent/31a-polish`      | ✅ #191    |
| 31b      | 24d: hierarchy-aware `tag:`, `/search/terms`, one "all terms" list, term-page tree                       | `agent/31b-term-search` | 🟡         |
| 31c      | 24e: `curation/terms.ts`, API, `recipes term …`, 8 MCP tools, skill v3, `Group.kind` narrowing           | `agent/31c-term-seats`  | 🟡 built   |
| 31d      | F32: group items follow renames                                                                          | `agent/31d-f32-renames` | 🟡 built   |
| 31e      | Term edit form `/tags/<slug>/edit`                                                                       | `agent/31e-term-form`   | ⏸️         |
| 31f      | Content: 38 heading conversions, 7 spritzes and sodas (real content repo, no code PR)                    | — (results in 31-close) | ✅ content |
| 31-close | Results, roadmap/backlog strikes, morning checklist                                                      | `agent/31-close`        | ⏸️         |

**Order.** 31-plan → 31a → 31b → 31c → 31d → 31e, with 31f in parallel as a
background subagent. 31c depends on 31b's resolver and 31e on 31c; 31d is
independent. If time or the machine gets tight, the phase in flight is
finished, the rest are skipped and recorded here.

## Phase detail

### 31a — Curation and import polish

1. **Image size.** `probeImageFile` (`editor/controller/imageImport.ts`)
   already reads `content-length`; it keeps it as `bytes` and adds a `warning`
   above `LARGE_IMAGE_BYTES` (2 MB). `fetchImageFile` warns the same way on
   real writes. Dry runs (`RecipeDryRunResult.image`, `importRecipe.ts`)
   surface it, top-level `warnings` carry it, and the CLI formatters print it.
   Closes `30-T7`.
2. **Polite 403 retry** (D3). One helper used by `fetchRecipePage`
   (`common/util/importRecipeData.ts`) and `fetchWithRetry`
   (`imageImport.ts`), with options `{delayMs, enabled}`.
3. **Feature dedupe** (D2). `feature()` (`curation/featured.ts`) and
   `actions/featuredRecipes.ts`.
4. **`gitPush` with no remote** — a `getRemotes()` pre-check gives
   `ValidationError` (400), as `gitPull` does, plus a message-regex fallback.
5. **"Add group" in the group form** — `{group: ""}` rows with
   `GroupSelectInput`; `assertNoGroupCycle(ctx, slug, items)` exported from
   `curation/groups.ts` and run by `actions/groups.ts`, returning a form error.
6. **Tables in markdown** — `.markdown-body` table rules in both apps'
   `globals.css`, and a `table` override in `StyledMarkdown` that scrolls
   sideways.
7. **Stale docs** — rows in `agent-epic-27.md`, `agent-taxonomy.md`,
   `deploy-pi.md`, `ui-overhaul.md`, `agent-epic-28.md`, `agent-curation.md`
   Deferred and `backlog.md`.

**Gate:** unit tests per item; full vitest; both typechecks; Playwright
`featured-recipes`, `groups`, `new-recipe`, `tag-pages`, `git`.

**Built (31a).** Calls made while building, beyond the plan:

- The recipe form's **image import** retries a 403 at once too, not only
  `/new-recipe`'s page fetch: it is the same browser form with a person
  waiting. Explicit `ForbiddenRetry` fields beat the environment's, so
  `RECIPE_FETCH_403_DELAY_MS=off` still turns the form's retry off.
- `largeImageWarning` names the URL and both sizes ("is 9.7 MB, over 2.0 MB").
  The image seat (`recipes image`) and group writes with `imageImportUrl`
  warn too, so every download path reports.
- Feature dedupe is checked on **create** only in the browser form; an edit
  rewrites its own entry. The form's override is a "Feature it again"
  checkbox under Advanced. `findFeatured` reads the whole featured index (it
  is short).
- `gitPush` with no upstream now pushes to **the only remote** when there is
  exactly one, rather than assuming `origin` (the real repo's only remote is
  `uraninite`). An asked-for remote that does not exist names the ones that
  do. `mcp.test.ts`'s "push with no remote" case moved from `internal` to
  `validation`.
- An existing sub-group row in the group form is now a picker, not a
  read-only hidden input, so it can be changed as well as removed. The
  `groups.spec` case that read "Group 1: week-of-may-4" checks the select's
  value instead.

### 31b — 24d: hierarchy-aware search

Per `24-D6`.

1. **Resolver.** `matchesFilter(recipe, filter, resolver?)`: the `tag` branch
   matches when a recipe tag's folded label or slug is in
   `resolver.expandTerm("tag", value)` — the term plus all its descendants —
   and otherwise keeps today's prefix match. The expansion is built from the
   tree with `subtreeUsage`'s folding, in a pure shared helper
   `common/controller/tagExpansion.ts`.
2. **`/search/terms`** — terms ∪ tree, from `readTagVocabulary()` /
   `readTagOptions()`; an editor route modelled on `search/groups`, an export
   twin (`force-static`).
3. **Every caller gets the resolver** — `SearchContext`, `MakePage/scope.ts`,
   `curation/search.ts` (a Node-safe tree read: `readAggregate` with
   `termTreeAggregate()` plus `readTaxonomyTerms`) and `curation/recipes.ts`
   (`list --tag`).
4. **One "all terms" list** — `SearchContext.allTags` comes from
   `/search/terms`; `getAllTags()` is retired where replaced (`24-T11`).
5. **Term pages** — `/tags` shows the tree with summed counts; `/tags/[tag]`
   shows "Narrower" chips.

**Gate:** `queryLanguage` expansion cases; a server/browser parity test on
`christmas-cookies` (`tag:cookies` includes the linzer descendants;
`recipe_search` and `matchesFilter` agree); `exportStaticParams`,
`specVersions` and the T17 tripwire green; Playwright `search-tags`,
`search-autocomplete`, `command-palette`, `tag-pages`, `make`,
`search-query-language`.

**Built (31b).**

- `common/controller/tagExpansion.ts`: `buildTagExpansion(terms)` →
  `expandTerm("tag", value)`, the folded slug and label of the named term and
  of its whole subtree, cached per value. It is **additive**: `matchesFilter`
  keeps the prefix match and also accepts a tag in the expansion. A leaf still
  answers with its own two spellings, so a record labelled "Christmas Cookies"
  reaches carriers tagged `christmas-cookies`. A hand-edited cycle terminates,
  and a term is never its own child (`24-T8`).
- `/search/terms` (editor route and export `force-static` twin) serves
  `readSearchTerms()`: `{slug, label, parent?, count}` for every term.
  `/search/version` is unchanged: it gates only the recipe corpus, and terms are
  fetched fresh like groups.
- `SearchContext` fetches `/search/terms` and holds a `tag:` result until it
  settles, as it does for `group:`. `allTags` is the labels of terms with
  `count > 0`, and the corpus `Set` is gone. `allTerms` is exposed too.
- The server's resolver (`curation/tagResolver.ts`) merges **both carrier
  folds and the tree**, not the tree alone, so a carried-only term reconciles
  slug and label exactly as the browser's does. It is read only when the query
  has a `tag:` term. `recipe_search` and `list --tag` use it.
- `/make`'s `scopeRecipes` takes the resolver, so a parent chip scopes to the
  recipes its subtree count promises.
- `getAllTags()` is retired. `readTagLabels()` (labels of the merged
  vocabulary with uses, in slug order) feeds the five form pages and the
  homepage's browse chips.
- `/tags` gains a "By kind" tree (`data-testid="tag-tree"`): roots that have
  children, each with its **distinct** carriers across the subtree
  (`termHierarchy`). The flat list below is unchanged. "Narrower" chips were
  already on `/tags/[tag]` from 24c.

### 31c — 24e: term seats and tooling

Per `24-D7`, with D4 and D5 above.

1. `curation/terms.ts`: `listTerms`, `getTerm` (own / with-descendants counts,
   children, breadcrumb), `createTerm`, `updateTerm` (cycle check →
   `term_cycle`; `parent !== slug`, `24-T8`; pinned slugs must carry the tag),
   `deleteTerm {unassign?}` (`term_in_use` otherwise), `renameTerm` (moves the
   record and rewrites the carriers' tag strings), `mergeTerm`, and
   `assignTerm {add, remove, type?}` → `{updated, unchanged, missing}`, one
   update per carrier.
2. The `tag-terms` success config, `GIT_TYPES.term`, and `FeaturedInputSchema`
   taking exactly one of recipe, group or term.
3. API under `editor/src/app/api/taxonomies/[taxonomy]/…`; both CLI backends;
   `recipes term list|get|create|update|delete|rename|merge|assign`.
4. MCP: the 8 `term_*` tools, the new error codes in `INSTRUCTIONS`, `tag_list`
   extended additively. The settings allow-list and the skill's
   `allowed-tools` gain the 6 non-destructive term tools.
5. Skill v3 wording: a cluster by kind or a curated collection → a term; an
   ordered, dated, annotated list → a meal-plan group.
6. `Group.kind` narrows to `"meal-plan"` (`24-D5`): create and update reject
   `"collection"`; existing records stay readable.
7. Acceptance on `christmas-cookies` (`24-D7`'s script).

**Gate:** seat, HTTP status map, `cliJson`, `TOOL_NAMES`, `curatorSkill` and
acceptance tests; full vitest; typechecks; Playwright `tag-pages`,
`featured-recipes`, `groups`, `api-write`.

### 31d — F32: group items follow renames

1. `packages/cms/content/referencePath.ts`: `parseRefPath("items[].recipe")`,
   `slugsAt(record, path)`, `rewriteAt(record, path, old, new)` — every match
   rewritten, order kept, other keys untouched.
2. `updateDependents.ts` finds dependents with `slugsAt(...).includes(target)`
   and writes with `rewriteAt`; the F30 `pathExists` guard stays.
3. `resolveReferences`: array paths with `fields: []` resolve to nothing.
4. Recipe site: `groupContentConfig.references` (`items[].recipe` → recipes,
   `items[].group` → groups, `fields: []`, thunks); `referencedBy` on recipes
   and the groups self-edge; groups gain the `/group` dependent base path.
5. Docs: F32 in `incremental-regeneration.md` §10 and §11.4, `22-D3` amended,
   the group docblocks, the MCP rename text (a rename commit now holds K+1
   files).

**Gate:** reference unit tests (array rename, a recipe listed twice, other
items untouched, no index for an absent dependent type, delete stays
dangling); groups and `curation.test.ts` T31; full vitest; typechecks;
Playwright `groups`, `featured-recipes`, `git`, `recipe`.

### 31e — Term edit form

An editor-only form at `/tags/<slug>/edit` (and a "New term" entry on `/tags`):
label, description, image, parent (a select over the tree, cycles excluded) and
pinned (`ChipsInput`, `24-T13`). A server action calls 31c's seat functions, so
validation is identical. An "Edit" link in `editorTagRoute`'s `actions` slot.

**Gate:** unit tests for the action's error mapping; Playwright
`term-edit.spec.ts` (create a child term, change its parent, a cycle is
refused).

### 31f — Content cleanup (real content repo)

A background subagent in its own worktree `.claude/worktrees/agent-31f`
(detached at `origin/main`), running
`pnpm --silent recipes <cmd> --content-dir /home/roger/Projects/recipe-content
--json` (`30-D6`). **No push.**

1. The 38 heading conversions (D6): a script writes one patch per recipe;
   `update --dry-run` for each, then the real update; `show` spot-checks.
2. The 7 spritzes and sodas (D7): `inspect` → payload → `create --dry-run` →
   `create`. Until 31a lands, a HEAD request checks image size (and counts
   toward the gaps).

Results go to the job's `tmp/31f-results.md`: commits, skips, and the
`tag:drink` count before and after.

## Shared-machine rules

Other sessions run overnight on the same machine.

- **Every heavy step takes Archilyzer's machine-wide slot**, one wrap per step
  (each `next build`, each Playwright run, each export build, the full
  `vitest run`):

  ```
  HEAVY_LOCK_FILE=/home/roger/Projects/yt-dlp-transcript-browser/.git/heavy-queue.lock \
    node /home/roger/Projects/yt-dlp-transcript-browser/scripts/queue-lock.mjs --heavy -- <cmd…>
  ```

  It waits for the slot, then for MemAvailable ≥ 6000 MB; "waiting for the
  heavy slot" is normal. Never set `HEAVY=0`.

- **Local e2e is build+start only**: `PLAYWRIGHT_BUILD=1`, port 3019, under
  `setsid nohup`, through the job's `tmp/pw.sh` (which removes `.next` and the
  stale `test-*` dirs).
- **Never touch :3001** — another project's live editor.
- **Sandbox:** git from script files, the Edit tool for exact edits, no
  heredocs or loops that name git twice.

## Verification (every code PR)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
<heavy slot> pnpm exec vitest run
<heavy slot> tmp/pw.sh <log> <specs…>     # PLAYWRIGHT_BUILD=1, port 3019
```

Then CI green and merge. **At close**, on a scratch clone of the real repo:
`recipes search 'tag:cookies'` returns the descendants; `recipes term list` and
`term get syrup` work; renaming a recipe that a scratch group lists rewrites the
group. On the real repo: one commit per write, `git status` clean, and the
`tag:drink` count reported.

## Risks and traps known up front

- **T1 — the taxonomy traps still hold.** `24-T1` (lmdb `open` creates — also
  `30-T1`), `24-T5` (featured spec bumps need a reindex), `24-T8` (a term is
  never its own parent), `24-T11` (two "all tags" sources until 31b),
  `24-T14` (`generateStaticParams` keeps the `_` placeholder for mocks),
  `24-T15`–`24-T18` (no value import from a taxonomy module reaches a content
  config; `TaxonomyConfig.terms` stays unread).
- **T2 — Content writes go to the real repo.** Only 31f touches
  `~/Projects/recipe-content`; tests and scripts never point there.
- **T3 — A worktree's MCP server points at the worktree** (`23-T11`), so 31f
  uses the CLI with `--content-dir`.
