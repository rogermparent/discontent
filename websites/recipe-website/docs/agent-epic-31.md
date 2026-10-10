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

**Now:** epic 31 is **closed** (2026-10-10). Every phase merged on green CI:
31-plan #190, 31a #191, 31b #192, 31d #193, 31c #194, 31e #195, and this
close-out. 31f's 43 content commits are on the Pi already — the workstation
editor's sync pushed each one as it landed (T5). Left for Roger: the deploy,
a look at the new pages, and two content calls (the morning checklist below).

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

| Phase    | Scope                                                                                                    | Branch                  | Status       |
| -------- | -------------------------------------------------------------------------------------------------------- | ----------------------- | ------------ |
| 31-plan  | This doc, CLAUDE.md entry, taxonomy roadmap note                                                         | `agent/31-plan`         | ✅ #190      |
| 31a      | Image size in dry runs, polite 403 retry, feature dedupe, push with no remote, "Add group", tables, docs | `agent/31a-polish`      | ✅ #191      |
| 31b      | 24d: hierarchy-aware `tag:`, `/search/terms`, one "all terms" list, term-page tree                       | `agent/31b-term-search` | ✅ #192      |
| 31c      | 24e: `curation/terms.ts`, API, `recipes term …`, 8 MCP tools, skill v3, `Group.kind` narrowing           | `agent/31c-term-seats`  | ✅ #194      |
| 31d      | F32: group items follow renames                                                                          | `agent/31d-f32-renames` | ✅ #193      |
| 31e      | Term edit form `/tags/<slug>/edit`                                                                       | `agent/31e-term-form`   | ✅ #195      |
| 31f      | Content: 38 heading conversions, 7 spritzes and sodas (real content repo, no code PR)                    | — (results in 31-close) | ✅ content   |
| 31-close | Results, roadmap/backlog strikes, morning checklist                                                      | `agent/31-close`        | ✅ (this PR) |

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

**Built (31c).**

- **Seats** — `editor/controller/curation/terms.ts`: `listTerms`, `getTerm`,
  `createTerm`, `updateTerm`, `assignTerm`, `renameTerm`, `mergeTerm`,
  `deleteTerm`, plus `assertTaxonomy` (only `tag`) and the pure
  `carrierTag`. Node-safe reads only: carriers come from the recipe and group
  **content indexes** (their values copy `tags`), not the by-term aggregates,
  because a write acts on the answer and an aggregate can be stale (T5); the
  hierarchy for validation comes from the term **data files**, for answers
  from the `tree` aggregate. Carriers are matched by `tagSlug(tag) === slug`
  and written through `updateRecipe` / `updateGroup`, one commit each.
- **The carrier string** (`carrierTag`): the record's label, normalised, when
  it slugs back to the term's slug, else the slug. A label that does not slug
  to its record (`slug: linzer`, `label: "Linzer Biscuits"`) is allowed and
  answers a warning. A term with no record uses the folds' label, and a brand
  new one the string the caller typed — `assignTerm` needs no record, since
  assigning is how a bare tag has always come into being.
- **Records.** `createTerm`'s slug defaults to `tagSlug(label)`; a taken slug
  is `slug_conflict`. `parent` must name a **record** (`unknown_term`
  otherwise — the tree links children only to records), `parent === slug` is
  `term_cycle ["a","a"]` (24-T8), and a deeper cycle is caught by a walk up
  the data files (depth cap 32). `pinned` is deduplicated and every slug must
  be a recipe carrying the term (`validation`, per issue). `TermPatchSchema`
  has **no `slug`**: moving a term is `renameTerm`, because it rewrites
  carriers. `imageImportUrl` is fetched at write time, as a group's is.
- **`getTerm`** answers `{slug, label, url, path?, record | null, parent?,
breadcrumb, children, counts: {own, withDescendants}, recipes, groups}` —
  `withDescendants` is distinct carriers over the tree subtree, i.e. what
  `tag:<slug>` returns. `listTerms` is the merged vocabulary
  (`mergeTagVocabulary`) as `{slug, label, count, parent?, record}`, unpaged
  unless asked, `records: true` for records only.
- **Rename** moves the record with `updateContent` (children's `parent` and
  features' `term` follow by reference) and rewrites each carrier's matching
  tag **in place**, keeping tag order. Onto an existing term (record or
  carriers) it is `slug_conflict` naming the merge. `to` may be a label
  (`"Holiday Cookies"` → `holiday-cookies`, label kept).
- **Merge semantics.** Every carrier of `from` is re-tagged to `into` (no
  duplicate when it already carries both). Then the record: when `into` has
  **no** record, `from`'s record **moves** to `into` (labelled with `into`'s
  fold label), keeping its description, picture and pinned front, and
  children and features follow by reference. When `into` **has** a record,
  `from`'s children are re-parented to `into` — except `into` itself or one
  of its ancestors, which go to `from`'s own parent so no cycle closes —
  `from`'s features are re-pointed at `into` (one featured update each),
  `from`'s pinned recipes are appended to `into`'s, and `from`'s record is
  deleted. Merging into a term that does not exist is `not_found` (that is a
  rename).
- **Delete** is `term_in_use` (409, carriers in `recipes`/`groups`) while
  anything carries the term; `unassign` removes the tag from each first. The
  record's children move up to its parent (or become roots), so the tree
  stays connected. A feature of the deleted term is left dangling, as
  `group_delete` leaves one.
- **Errors** — `TermCycleError` (`term_cycle`, 422) and `TermInUseError`
  (`term_in_use`, 409) in `errors.ts` / `statusFor`. `codeForStatus` in the
  HTTP backend needed nothing: every term route answers with a coded body.
- **Wiring** — the `tag-terms` success config (item path `/tags`,
  dependents `featured-recipes → /featured-recipe` and the self-edge
  `tag-terms → /tags`, list path `/tags`, `paginationOnly` off; the delete
  config redirects to `/tags`); `GIT_TYPES.term` and `GitTypeSchema` gain
  `term` (so `git log --type term`, `git file term …`, `git restore term …`);
  `FeaturedInputSchema` already took exactly one of three (24c), unchanged.
- **API** — `/api/taxonomies/[taxonomy]` (GET list `?records&limit&offset`,
  POST create → 201), `/api/taxonomies/[taxonomy]/[slug]` (GET, PATCH,
  DELETE `?unassign=1`), and `POST …/[slug]/rename` `{to, label?}`,
  `…/merge` `{into}`, `…/assign` `{add?, remove?, type?}`. Reads are public
  like `/api/groups`; writes `requireCurationContext` (write scope). Any
  taxonomy but `tag` is a 404. The flat `/api/taxonomies/tag/<slug>` shape
  mirrors `/api/group/<slug>` rather than nesting a `terms/` segment.
- **CLI** — `recipes term list|get|create|update|delete|rename|merge|assign`
  on both backends; `delete` and `merge` confirm (`--yes`) like `delete`;
  `create`/`update` take flags or `--file/--stdin`, never both; `assign`
  takes repeatable `--add`/`--remove` and `--type recipe|group`.
- **MCP** — 46 tools: the eight `term_*` after `tag_list` in `TOOL_NAMES`
  (`term_list`/`term_get` read-only, `term_create`/`term_rename` writes,
  `term_update`/`term_assign` idempotent writes, `term_delete`/`term_merge`
  destructive). `INSTRUCTIONS` names the two codes and the term-vs-group rule.
  `tag_list` takes an optional `terms: true` and then also answers `terms`
  (term_list's rows); `{}` answers exactly `{tags}` as before.
- **Allow-lists** — `.claude/settings.json` and the skill's `allowed-tools`
  gain the six non-destructive term tools (28 → 34); `curatorSkill.test.ts`
  holds back `term_delete` and `term_merge`, and its tool-shaped regex gains
  `term`. Skill v3: §7 is "a term or a meal plan" — a cluster by kind or a
  curated collection is a term (`term_create` → `term_assign`, nesting by
  `parent`), an ordered, dated, per-item-labelled list is a meal-plan group.
  `examples.md`'s first transcript is now the taxonomy edition, captured from
  the acceptance sequence over the in-memory client (no model run).
- **`Group.kind` narrowed** (`24-D5`). `GroupWriteKindSchema` is
  `z.enum(["meal-plan"])` with a message naming `term_create`; `kind`
  defaults to `meal-plan` in `GroupInputSchema`, and `GroupPatchSchema`
  accepts only `meal-plan`, so a patch without `kind` still edits an existing
  collection. The browser form defaults to "Meal plan" and offers
  "Collection (legacy)" only to a group that already is one;
  `actions/groups.ts` wraps the generic create/update and refuses `kind:
collection` as a Kind field error unless the record on disk is already a
  collection. `GroupKind` keeps `"collection"`; no fixture changed. Unit
  tests that created collections through the seat now create meal plans; no
  Playwright spec created one, so none changed for the narrowing.
- **Acceptance** — `test/christmasCookies.test.ts` is now the taxonomy
  edition (24-D7's script): `term_list` → `recipe_search cookie` (8) →
  `term_create christmas-cookies` → `term_assign` five → `term_create linzer
{parent}` → `term_assign` three → `feature {term}` → `recipe_search
tag:christmas-cookies` = 8 → `term_get` both (own 5 / with descendants 8,
  child `linzer` 3; linzer's breadcrumb Christmas Cookies › Linzer), plus the
  cycle refusal and a refused `group_create kind: collection`. Seat cases in
  `test/terms.test.ts` (21); `cliJson`, `mcp`, `curationHttp`,
  `curatorSkill` extended; `api-write.spec.ts` gains the HTTP case.
- **Deferred** — a batched multi-carrier commit (still N commits, possible
  F34); `aliases`; moving a featured entry off a deleted term (it dangles,
  as a group's does).

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

**Built (31d).** As planned, plus one engine call: `rebuildIndex`'s cascade
now skips a dependent whose every declaration toward the rebuilt type has
`fields: []` (`borrowsFrom`). Without it a recipe rebuild — every reindex —
would have rebuilt groups too, for nothing. Groups' successful writes gained
`dependentItemBasePaths: {groups: "/group"}` (a sub-group rename rewrites its
parents), and recipes' gained `groups: "/group"`.

### 31e — Term edit form

An editor-only form at `/tags/<slug>/edit` (and a "New term" entry on `/tags`):
label, description, image, parent (a select over the tree, cycles excluded) and
pinned (`ChipsInput`, `24-T13`). A server action calls 31c's seat functions, so
validation is identical. An "Edit" link in `editorTagRoute`'s `actions` slot.

**Gate:** unit tests for the action's error mapping; Playwright
`term-edit.spec.ts` (create a child term, change its parent, a cycle is
refused).

**Built (31e).**

- **Routes** (editor only, sign-in gated like the group forms):
  `/tags/new` (`tags/new/page.tsx` + `form.tsx`) and `/tags/<slug>/edit`
  (`tags/[tag]/edit/…`). `/tags/new` mirrors `/group/new` rather than adding a
  `/tag/` segment; Next resolves the static segment before `[tag]`, so a term
  slugged `new` would have its page shadowed (**T4** below; the seat does not
  reserve the slug, exactly as `/group/new` shadows a group slugged `new`).
  The edit form exists for **any** term with a page: one with a record is
  updated, one that so far lives only on its carriers (`christmas` in the
  fixture) gets a record created at that slug — decided on the server from
  the data file at submit time, not from what the page believed.
- **Affordances.** `editorTagRoute`'s actions slot is Feature + **Edit**;
  `/tags` in the editor is the new `editorTagIndexRoute` with a **New term**
  link (`TagIndexPage` gained an `actions` slot; the export still re-exports
  `tagIndexRoute` and renders neither). Both are shown to anyone who reaches
  the editor, as every editor affordance is (the group page's Edit, the
  footer's New Recipe); the destination asks for the sign-in. Reading the
  session on `/tags` would make it a per-request render for one link.
- **The server half** — `editor/controller/termForm.ts` (not `"use server"`,
  so it is unit-testable): `parseTermFormData` → `termInputFromForm` (create:
  only filled fields) / `termPatchFromForm` (edit: every shown field stated,
  blank = clear `null`; the picture is left unless a URL is typed or "Remove
  Image" is ticked), `submitTermForm(ctx, target, formData)` calling
  `createTerm` / `updateTerm`, and the pure `termFormStateFromError`:
  `term_cycle` and `unknown_term` → Parent, `slug_conflict` → Slug (+
  `slugConflict`), `import_failed` → the picture, each `validation` issue →
  its path's field (`pinned.1` → Pinned, `imageImportUrl` → Image), anything
  else → the message. When a reason lands on a field the top line is "The term
  was not saved." so it is printed once. The values are echoed back
  (`state.formData`) and the fields remount on each state, so a refusal loses
  nothing typed.
- **The actions** live in the existing `actions/tagTerms.ts` (beside
  `rebuildTermIndex`, as `actions/groups.ts` holds both kinds) rather than a
  new `actions/terms.ts`: `createTermFromForm` and
  `saveTermFromForm.bind(null, slug)`. They authenticate, build the API's
  context (`curationContextFor(email)`: the commit's `--author`, and
  `onWrite` → `revalidateContentWrite` with the `tag-terms` success config —
  the same revalidation an API term write gets), and redirect to
  `/tags/<slug>` on success.
- **The form** — `common/components/Form/Term`: Label; Slug only on
  `/tags/new` (moving a term rewrites carriers: `term_rename`); Description
  (the group form's `LexicalMarkdownInput`); the picture; Parent, a native
  select over `termParentOptions(tree, slug)` — the **records** (a parent must
  have one) depth-first with siblings by label, minus the term and its
  subtree, plus "None"; a current parent the options lack is still offered,
  marked, so saving never clears it silently; Pinned, `ChipsInput` through the
  T13 adapter with the term's own recipes as suggestions (capped at 48 —
  `drink` carries ~200; the field takes any slug and the seat checks it).
- **Picture by URL only.** The term seat takes `imageImportUrl` and no file,
  so `ImageInput` gained `allowFile` (default on) and the term form shows only
  the Image URL field plus "Remove Image". A file upload would need the seat
  to take an upload — not done; recorded as a follow-up.
- **One seat change:** `TermPatchSchema.label` carries the create schema's
  message ("A term needs a label") instead of zod's default, so a blank label
  reads the same on every transport.
- **Tests** — `test/termForm.test.ts` (21): the mapping, the FormData shapes,
  `termParentOptions` (order, exclusion, a hand-edited cycle), and
  `submitTermForm` against the seat in a tmpdir (create + re-parent, a refused
  cycle that writes nothing, pinned and label refusals, a taken slug, the
  carried-only create). Playwright `term-edit.spec.ts` (3): New term → child
  of Cookies → Edit → moved under Dessert; the cycle — the select cannot offer
  one, so it is driven as a stale page (Holiday's form open, Dessert moved
  under Holiday through the API, then Holiday → Cookies is refused on Parent,
  echoed, and `GET /api/taxonomies/tag/holiday` shows no parent); and
  `christmas` gaining a record with a pinned suggestion.
- **Deferred** — file upload for a term picture (needs an upload input on
  `createTerm` / `updateTerm`); rename, merge, delete and assign from the
  browser (CLI / MCP only); an "Add a narrower term" link (`/tags/new?parent=`).

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

**Built (31f).** 43 commits on the real repo, `ff8ace4` → `8711840`, one per
write and every one dry-run first; `tag:drink` 203 → 208.

- **Headings: 38 of 38**, exactly as D6 says. No odd shapes turned up. The
  write path's own CRLF → LF normalisation touched a description or a step in
  four recipes (easy-sourdough, jerk-chicken, lagerstrom-roast-turkey,
  simplified-beef-birria-tacos); steps that already had a real `name` kept
  it. One recipe (weeknight-pizza) hit a transient `index.lock` from the
  workstation sync and was redone as its own commit.
- **Drinks: 5 of 7.** `red-wine-spritzer-acouplecooks`,
  `cascara-ginger-soda-imbibe` (Imbibe's alcohol-free "Cascara Dark &
  Stormy"), `mermaid-lemonade-foodnetwork`, `blood-orange-spritz-foodnetwork`
  and `cotton-candy-fizz-foodnetwork`. Food Network supplied the three the
  four preferred sites lack; Cotton Candy Champagne is an article with no
  recipe data, so its two lines came from the page text.
- **Skipped:** Spicy Cascara Highball (no real recipe page exists) and the
  Zero-Proof Spritz (the one candidate on the preferred sites is the NA Aperol
  spritz already in the repo; The Kitchn 403'd twice and was dropped).
- **Politeness:** 13 requests in all, sequential, ≥ 16 s apart per host. Every
  page and image was fetched once with `curl` and served from
  `127.0.0.1` for `inspect` and `create`, so the importer's retry and the dry
  run's image probe never reached a site. All five images are under 500 KB.

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
- **T5 — The workstation editor pushes content commits to the Pi.** Epic
  28's event-driven sync (`recipe-workstation.service`) saw each of 31f's
  commits land and synced it to `uraninite` within seconds ("[sync] uraninite
  (change): synced" in its journal), so "no content push" held for this
  session's own actions but the commits were on the Pi by morning. A content
  task that must stay local needs the service stopped first, or a scratch
  clone. It also took `index.lock` once, mid-write (weeknight-pizza).
- **T6 — The shared heavy slot is the overnight bottleneck.** Other projects'
  e2e runs held it for 10+ minutes at a time. Two local Playwright gates (31c,
  31e's first) were cancelled after queueing that long; CI's four Recipe
  shards run every spec on a production build and were the gate instead.
  31e's local run later passed too (51/51).
- **T7 — Background watchers are reaped under memory pressure.** The harness
  stopped two `wait-pr.sh` loops when the machine ran low on memory (other
  projects' renders). Polling with one-off status calls replaced them.
- **T4 — `/tags/new` shadows a term slugged `new`** (31e). The static
  segment wins over `/tags/[tag]` in the editor, so such a term's page is
  unreachable there (the export, which has no `/tags/new`, still emits it).
  The same holds for `/group/new`. Nothing reserves the slug.

## Results (31-close, 2026-10-10)

| Phase   | PR   | Merge      | Gates                                                                                                             |
| ------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| 31-plan | #190 | `d18ac381` | docs                                                                                                              |
| 31a     | #191 | `90131083` | vitest 975/975; Playwright 167/170 → 82/82 after spec updates; CI green after one more spec (`reference-updates`) |
| 31b     | #192 | `4fb1a402` | vitest 972/972; Playwright 109/110 → `tag-pages` 18/18; CI green                                                  |
| 31d     | #193 | `b01821a5` | vitest 971/971; Playwright 602/604 (a T26 slug flake, fixed; `reduced-motion` timing, unrelated); CI green        |
| 31c     | #194 | `ab0b2adf` | vitest 995/995; after merging 31a/31b/31d, 267 + 230 targeted; CI green (T6)                                      |
| 31e     | #195 | `e3031f52` | `termForm` 21/21 + 184 targeted; CI green; Playwright `term-edit tag-pages groups` 51/51                          |

**End-to-end, on a scratch clone of the real repo** (`8711840`, reindexed
with `main`'s CLI in 1.9 s; the real repo was only read):

- `recipes term list` lists every term with its record marker and parent
  (`built < drink [record]`); `recipes term get syrup` prints the 30d chart.
- `term get drink`: nine children (the drink styles); own 208, with
  descendants 208 — every drink also carries `drink`.
- A recipe tagged **only** `built` appears in `search 'tag:drink'` and
  `list --tag drink` (209): the hierarchy reaches a child's carriers.
- A meal plan listing that recipe twice, then a rename of the recipe: both
  items followed, labels kept, in **one commit of two files** (the recipe and
  the group).
- `group create --kind collection` is refused with the `term_create` hint.
- Three writes, three commits; tree clean.

On the real repo: 43 commits since `ff8ace4` (38 updates, 5 creates), tree
clean, and `uraninite/uraninite` already at `8711840` (T5).

**Deferred, with where each lives:**

- Term image **upload** in the form (the seat takes `imageImportUrl` only).
- Batching a multi-carrier `term_assign` / rename into one commit (possible
  F34); term `aliases`; moving a feature off a deleted term.
- 24f: the real-repo vocabulary backfill and the real Christmas-Cookies story
  run, then the by-term record measurement (F8b threshold).
- F32 **borrowing** (group cards reading member fields through the index) —
  not needed while the corpus supplies thumbnails (30c).
- Content: a Spicy Cascara Highball if Roger has a source, a Zero-Proof
  Spritz from The Kitchn when it answers, and whether the red wine spritzer
  should cite the canonical `/white-wine-spritzer/` page it now redirects to.

**Morning checklist for Roger:**

1. `pnpm deploy:pi` — the Pi runs the editor image from before this epic;
   no index spec moved, so no reindex is needed beyond the deploy's own.
2. Content: nothing to push or merge — the workstation sync already put 31f's
   commits on the Pi (T5). Glance at a converted recipe (e.g. `/recipe/gyoza`)
   and `/tags/drink` on the Pi.
3. Look at the new pages on a running editor: `/tags` ("By kind"),
   `/tags/new`, `/tags/<slug>/edit`, the group form's "Add group", and the ⌘K
   group thumbnails from epic 30.
4. Content calls: keep or delete the two kid-party drinks
   (`mermaid-lemonade-foodnetwork`, `cotton-candy-fizz-foodnetwork`); the
   red-wine-spritzer citation; the Sake Cosmo image (carried from 30d).
