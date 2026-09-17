# Universal taxonomy for `@discontent/cms` — "tags that know what they mean"

> **This is the durable source of truth for the epic-24 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the full
> picture by reading this file. **Read this file first** before planning any
> `24x` phase: the plan file that seeded it is gone. Update the roadmap
> **Status** column, each phase's decision checkboxes, and the **Next PR** line
> at every phase boundary. Each phase is a stacked PR and gets its own
> plan-mode pass seeded from this doc (see _How a phase is run_). **24a is
> merged (#143 → `main` `6709f4c8`, 2026-09-17); 24b is merged (#144 →
> `main` `c581f222`, 2026-09-17, and the real repo is reindexed); 24c is in
> progress (2026-09-17, `agent/24c-term-records` ← `main`).** The previous
> epics' docs — `agent-curation.md` (22) and `agent-mcp.md` (23) — are the
> reference for everything the curation layer and the MCP already do; their
> D-lists and T-lists are cited here by number with a `22-` / `23-` prefix
> (`22-D3`, `23-D18`). Engine follow-ups keep their `F` numbers in
> `packages/cms/docs/incremental-regeneration.md` (§10, §11); this epic's
> engine row is **F33**.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

## Why this exists

Epic 23 landed on `main` on 2026-09-16 (#138 → #142). Its last checkbox was
the Christmas-Cookies story run once for real, on **groups**:

> "Organize the cluster of cookie recipes into one featured group called
> _Christmas Cookies_, then combine the linzer cookie recipes into a group that
> is accessible both at the top level and inside _Christmas Cookies_."

The user redirected before that run: fulfil the use case with a **"flexible,
universal tagging / taxonomy system integrated into the CMS engine"**, and do
that **first**, because "it may affect how the MCP should see and operate on
groups fundamentally". A cluster of cookie recipes is a _classification_, not
an ordered list; the linzer cookies are a _narrower_ classification inside it;
"accessible at the top level and inside" is exactly what a term with a parent
gives for free. Groups stay for what they are good at — ordered, labelled,
annotated lists with a cover — and the open question of how much of
"collection" they keep once terms exist is **D5**, decided at 24b.

Today the site has tags but no taxonomy: `Recipe.tags` is a bare `string[]`,
two hand-written aggregates fold it into a tag list and a by-tag map, `/tags`
and `/tags/[tag]` render those, `tag:` searches it, and the real corpus of 437
recipes carries **two tags in total**. Groups, portfolio projects and the demo
each have their own partial version of the same thing, and nothing shares
code. This epic makes taxonomy an **engine kind**: a content type declares
which of its index-value fields is a vocabulary, and the engine derives the
term list, the inverted by-term map and, optionally, a **term-record** content
type carrying label, description, image and a `parent` — a tree. Every site
adopts the same primitive; the recipe site gets one vocabulary whose root
terms are the facets (diet, meal, speed, cuisine, kind …).

Decided with the user (2026-09-16, plan mode):

- **Taxonomy first.** No groups-based run now. The story becomes this epic's
  acceptance case: replayed on a fixture at 24e, run for real at 24f.
- **One vocabulary** for recipes (`tag`), whose **root terms are the facets**;
  no second field, no second operator.
- **Tree hierarchy**: a term record has one scalar `parent`.
- **This session**: Step 0 (this doc, backlog, memory) + **24a** (engine), one
  draft PR. 24b onward in fresh plan-mode sessions.
- **Epic-23 housekeeping** folded into 24a's PR where it is docs: the landing
  recorded in `agent-mcp.md`, the five merged remote branches deleted, the
  `agent-23b…23e` worktrees removed (`agent-23f` and its branch are the
  user's, after this session).

## Execution model

**One phase per session.** Between phases the user re-enters plan mode and
clears context when accepting the next phase's plan. This doc is the only
memory that survives: it holds the full D-list, T-list, every phase's detail,
the handoff procedure, and each closed phase's decisions and gate results.

The roles: **Fable plans and reviews; an Opus subagent implements.** Branches
are stacked: `main` → `agent/24a-taxonomy-engine` → `agent/24b-taxonomy-adopt`
→ `agent/24c-term-records` → `agent/24d-taxonomy-search` →
`agent/24e-term-seats` → `agent/24f-taxonomy-closeout` (→ `agent/24g-…` only
if 24f's measurement demands it). Rebase children after a parent merges. Never
push to main; never force-push; never merge.

## How a phase is run

_(Reproduced from the accepted plan so a fresh session follows the same
procedure; identical to epic 23's.)_

1. **Step 0 (Fable, done once):** worktree on `agent/24a-taxonomy-engine` from
   `origin/main`; create this doc from the plan; add a pointer row to
   `docs/backlog.md` and strike the rows the epic covers; record epic 23's
   landing in `agent-mcp.md`; commit as the first commit of
   `agent/24a-taxonomy-engine`; update the memory `agent-curation-workflow` →
   epic 24 started, doc path.
2. **Implement (Opus subagent):** Fable spawns one general-purpose subagent
   with `model: "opus"`, working in the same worktree on the phase branch. The
   prompt = the doc's phase section + D-list + T-list + the "key files to read
   first" list + the phase's verification commands. The subagent implements,
   runs the verification, and reports back: files changed, what was verified
   with outputs, divergences from the section and why, anything it could not
   finish.
3. **Review (Fable):** read the full diff; rerun typecheck, vitest, and the
   phase's Playwright specs; correctness review (reference bugs,
   cache-invalidation gaps, import-cycle/`"use server"` violations, missing
   tests); fix small things directly, send larger issues back to the same
   subagent via SendMessage. Then close out the doc: roadmap row → ✅, record
   decisions made and divergences, gate results verbatim (counts, dev vs
   production mode), new follow-ups; set the next row to 🟡 with its "Next PR"
   line. Commit, push the branch, open a draft PR against the parent branch.
   Report to the user with the PR link and the doc path, and stop: the next
   phase starts in a fresh plan-mode session from the doc.
4. Branches are stacked (see _Execution model_). When landing, follow 22-T20:
   merge the parent, **retarget the child, then** delete the parent's branch.
   Every engine change owes `incremental-regeneration.md` a §10 F-row and a
   §11 entry (F33 for this epic; F32 stays reserved for array references).

## Facts validated before the epic (2026-09-16, read-only, on `main` = `bd02f6f9`)

Paths under `packages/cms/` for engine items, `websites/recipe-website/` for
site items, unless noted.

### Engine

1. **`ContentTypeConfig`** (`content/types.ts:106-197`): `contentType,
dataDirectory, indexDirectory, dataFilename, buildIndexValue` (pure, sync),
   `buildIndexKey` (always `[date, slug]` in this repo), `referencedBy?` /
   `references?` (thunks on both sides; **scalar-only** — `references.ts:205-209`
   bails unless the field is a string; arrays are the deferred **F32**),
   `paginationIndexes?`, `aggregates?`.
2. **`AggregateConfig`** (`aggregates/types.ts`): `{name, version, initial,
fold, finalize?}`; `fold` is **sync over one content index** (no data-file
   reads, no cross-type reads). `updateAggregates`
   (`aggregates/updateAggregates.ts:49-150`) reads `config.aggregates ?? []`,
   folds all of them in one walk, hashes, writes only when the value or the
   spec hash moved, and reports `{name, changed, total}` per aggregate. One
   LMDB env per aggregate at `<base>/aggregates/<name>/`, record key `[0]`.
   `readAggregate` returns `null` when never folded and **never folds**.
3. **Invalidation.** `derivedTagsOf` (`content/next/revalidateDerived.ts:36-50`)
   emits pagination tags, then `aggregate:<type>:<name>` per declared
   aggregate in declaration order, then `item:<type>`; pinned by
   `test/revalidateDerived.test.ts` with `toEqual` (recipes:
   `["pagination:recipes:by-date", "pagination:featured-recipes:by-date",
"aggregate:recipes:tags", "aggregate:recipes:by-tag", "item:recipes"]`;
   notes: `by-date`, `by-title`, `aggregate:notes:tags`, `item:notes`).
   `createCachedAggregateRead` (`aggregates/next/cachedReads.ts`) is
   `React.cache(unstable_cache(readAggregate, key, {tags: [value]}))` and
   returns `{tags, read}`.
4. **Derived paths.** `derivedDirectoriesOf` (`content/derivedPaths.ts:49-56`)
   emits `/<index>`, `/<base>/pagination`, `/<base>/aggregates`
   unconditionally, so a new aggregate needs no `.gitignore` edit; a new
   **content type** needs one registry line and the writer regenerates the
   file.
5. **Spec versions.** `test/specVersions.test.ts` hashes each config module's
   whole source and greps `version: "…"` literals; pinned modules: recipe
   pagination/aggregate configs, group pagination/aggregate configs,
   `projects-collection`, `demo/lib/{notePagination, bookmarkPagination,
noteAggregates}.ts`. `test/aggregates.test.ts` (19 cases) is the engine-level
   proof of the aggregate kind. Fixture repair: `rebuildFixtureIndexes.ts`;
   `editor/scripts/build-fixture-indexes.ts` rewrites **every** recipe fixture
   (23-T41).
6. **`updateDependents`** (`content/updateDependents.ts:92-140`) runs after
   the item's own write, once per `referencedBy` spec, only when the slug
   changed or a borrowed field's hash moved; per spec it opens the dependent
   type's content database, finds candidates via `indexField` (index scan) or
   via data files, rewrites each candidate through the dependent's
   `buildIndexValue` with a resolver, and returns touched paths for the
   commit. **No spec in the repo pointed a type at itself before 24a.**
   _Corrected at 24a close-out:_ the "re-opens the environment the write just
   closed" premise was wrong — `getContentDatabase` hands back the cached
   environment (F1), so the dependent scan and the write share one live
   environment, and dependent = self needs no special case. Proven green; see
   T8 and the 24a close-out.
7. **Docs.** `incremental-regeneration.md` §10's last rows are F29/F31; there
   is no F32 row yet (the number is reserved in `docs/backlog.md` for array
   references). §11.1 **F8b** (deferred) fixes the shape for paginated
   per-term pages (`partitionsOf`, partition as leading key — not
   index-per-term) with a reopen threshold of a by-term record over ~150 KB
   (production today: 429 B).

### Existing tag machinery

8. **Recipes.** `Recipe.tags?: string[]`, copied onto the index value verbatim
   (`common/controller/buildIndexValue.ts:173-200`), normalised by
   `packages/component-library/lib/normalizeTags.ts` (trim, collapse
   whitespace, lowercase, dedupe). Two hand-written aggregates in
   `common/controller/aggregateConfigs.ts`: `recipeTags` (`name: "tags"`, v1,
   sorted `string[]`) and `recipesByTag` (`name: "by-tag"`, v1,
   `Record<slug, {label, recipes: RecipeListEntry[]}>` keyed by `tagSlug` =
   `@sindresorhus/slugify`, first label wins, newest first).
9. **Routes and search.** `/tags` + `/tags/[tag]` from
   `common/components/TagPage/routes.tsx` (unpaginated; `notFound()` on an
   unknown slug; export placeholder `{tag: "_"}`); `tagSearchHref` →
   `/tags/<slug>`; `tag:` / `-tag:` in `queryLanguage.ts` (`:521`), with
   server parity in `curation/search.ts` (re-evaluates the AST over index
   rows; `listTags` reads the aggregate directly); `GET /api/tags`; CLI `tags`
   → `{tags}`; MCP `tag_list`.
10. **Two sources of "all tags".** `getAllTags()` (aggregate; forms, homepage)
    vs `SearchContext.allTags` (a client `Set` over the fetched corpus; rail,
    autocomplete, ⌘K). Both stay until 24d.
11. **Other carriers.** Demo notes: `Note.tags` + `noteTags` set aggregate
    (`demo/lib/noteAggregates.ts`, `name: "tags"`, v1, sorted `string[]`),
    read by `demo/app/notes/tags/page.tsx` through `noteAggregateReads.ts`
    and asserted by `demo/playwright/tests/aggregates.spec.ts` (the tag cloud
    renders `tags.map(tag => <li>{tag}</li>)` — strings). Portfolio projects:
    `Project.tags` stored and indexed, **no aggregates, no routes**. Groups,
    featured entries, pages: **no tags** — `GroupInputSchema` is
    `z.strictObject`, so a `tags` key is a validation error today.

### Groups (epic 23)

12. `Group {name, date, kind: "meal-plan" | "collection", description?,
image?, items: ({recipe} | {group}) & {label?, note?}[]}`; nothing in the
    code branches on `kind`. `appearsInAggregate({name, version, keyOf})`
    (`groupAggregateConfigs.ts:59-121`) → `by-recipe`, `by-group` (direct
    parents only); `checkItems` DFS cycle check (`group_cycle`, depth 32);
    transitive `group:` search in the browser via two-pass expansion (23-D18),
    **a no-op on the server**; `feature {recipe | group}` borrows name/kind,
    no group image (F32); 28 MCP tools; `test/curatorSkill.test.ts` pins the
    tool-name regex `^(recipe|group|git|tag|featured)_[a-z_]+$` and the
    21-tool allow-list.

### Corpus

13. Real repo: 437 recipes, **two tags in total** (backlog "Tag-vocabulary
    pass"); `search cookie` → 27 rows (22 true cookies incl. 3 linzer, 2
    breakfast cookies, 3 non-cookies). The skill prose already encodes four
    facets (diet / meal / speed / cuisine). The real repo has **no groups**.

### Prior decisions that bind

22-D3 (no array refs), 22-D5 ("no tags on groups in v1", the two kinds),
23-D6/D16/D17/D18 (nested groups, appears-in factory, cycle check, read-time
transitive expansion), F8 (tag pages from one by-tag record — the
corpus-document trade), F8b (the partition shape when a term outgrows one
record), "Featured recipes as a group kind" (deferred; now folds into D5),
ui-overhaul's goal "tags/taxonomy as priority filters", PR 3's chip rail
superseded (do not resurrect), 22-T1–T4 (new config modules, version
literals, thunks both sides, configs never import the registry), 23-T36
(aggregate order pinned).

## Decisions log (D-list)

### D1 — Engine model: `taxonomies` on a content type

```ts
// packages/cms/taxonomies/types.ts
export interface TaxonomyConfig<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TItem = unknown,
> {
  name: string; // singular stem: operator `tag:`, aggregates `tags` / `by-tag`, routes `/tags`
  field: string; // index-value field holding string[] of raw terms (must already be on the index value)
  version: string; // literal, greppable (T1); spec version of BOTH derived aggregates
  slugOf?: (term: string) => string; // default: slugify — identical to the site's tagSlug
  project?: (entry: AggregateEntry<TIndexValue, TKey>) => TItem; // by-term row; default {id}
  terms?: () => AnyContentTypeConfig; // 24c: the vocabulary's term-record type (thunk, T2)
}
// content/types.ts: taxonomies?: TaxonomyConfig<any, any, any>[];
```

The engine derives, per taxonomy (`packages/cms/taxonomies/aggregates.ts`):

| Derived | Name                    | Value                                                            | Replaces                 |
| ------- | ----------------------- | ---------------------------------------------------------------- | ------------------------ |
| terms   | `${name}s` → `tags`     | `Array<{slug, label, count}>` sorted by slug; label = first seen | `recipeTags`, `noteTags` |
| by-term | `by-${name}` → `by-tag` | `Record<slug, {label, items: TItem[]}>`, items newest-first      | `recipesByTag`           |

- `aggregatesOf(config) = [...(config.aggregates ?? []),
...taxonomies.flatMap(taxonomyAggregates)]`. Exactly two call sites switch to
  it: `updateAggregates.ts:55` and `derivedTagsOf`. Declared aggregates first,
  taxonomies after, so the pinned recipe tag order survives 24b once the
  hand-written pair is deleted (T4).
- Names keep today's strings (`tags`, `by-tag`) so cache tags, LMDB
  directories and `readAggregate` callers do not move; the terms _shape_
  changes (strings → `{slug, label, count}`), so the site bumps to version
  `"2"` at adoption. The stored spec version is
  `` `${TAXONOMY_FOLD_VERSION}.${taxonomy.version}` `` so an engine-side fold
  edit bumps one constant; the engine module is pinned in
  `specVersions.test.ts`.
- Reads: Node-safe `readTaxonomyTerms` / `readTaxonomyByTerm` over
  `readAggregate` (`taxonomies/read.ts`); Next-side
  `createCachedTaxonomyReads(config, taxonomy)` → `{terms, byTerm}` built on
  `createCachedAggregateRead` (`taxonomies/next/cachedReads.ts`).
- **Term identity = `slugOf(normalize(label))`**: two labels that slugify
  alike merge, first label wins (F8, unchanged). Carriers store strings, never
  slugs: nothing on disk changes, every existing `recipe.json` is valid input.
  The normaliser is implemented locally in the engine with the same rules as
  `normalizeTags` (the component library is not an engine dependency).
- `appearsInAggregate` stays as is (one row per item, duplicates must
  survive); it is re-expressible over the same inverted primitive later. Not
  in scope.
- _Recorded at 24a close-out:_ because the terms value carries `count`, a
  **second carrier of an existing term moves both records** (the hand-written
  `Set<string>` folds reported `changed: false` there). The kind's payoff
  holds where it matters — a write touching neither the vocabulary nor a
  projected field moves neither record — and the demo's tag cloud stays
  byte-identical because it renders labels only. Sites that render counts
  on `/tags` pay one extra invalidation per tagged write, which is what
  they would pay anyway through `by-tag`.

### D2 — Term records (engine primitive at 24a, site adoption at 24c)

`createTermContentType({taxonomy, directory, uploadsDirectory?,
buildIndexValue?})` (`packages/cms/taxonomies/termContentType.ts`) returns a
`ContentTypeConfig`:

- `contentType "<taxonomy>-terms"`, `dataDirectory "<directory>/data"`,
  `indexDirectory "<directory>/index"`, `dataFilename "term.json"`.
- `Term {label, date, description?, image?, parent?, [k: string]: unknown}` —
  an **open record** so a site can extend it (D5 must not be precluded).
- `TermIndexValue {label, date, parent?, image?, parentLabel?}`;
  `parentLabel` is **borrowed** from the parent term.
- `buildIndexKey [date, slug]` (the repo-wide shape).
- `references: [{config: () => self, dataField: "parent", fields: ["label"]}]`
  and `referencedBy: [{config: () => self, indexField: "parent"}]` — the
  self-referencing edge.
- `aggregates: [termTreeAggregate]` (`taxonomies/tree.ts`, `name: "tree"`,
  version literal) folding `Record<slug, {label, parent?, children: slug[],
image?}>` from the term index alone; a single linking pass terminates on a
  hand-edited cycle (both nodes present, each the other's child).

**`parent` is scalar on purpose**: a parent rename rewrites children through
`updateDependents` and `parentLabel` is borrowed with no new engine feature.
The **self-referencing edge is unproven** (fact 6) — 24a proves it on the
demo before 24c depends on it; the fallback is a curation-layer rewrite of
children at `term_rename`. Hierarchy = tree. "Top level and inside" holds
because every term has its own page and a row in the `/tags` index. A term
with no record is just a word; a record with no carriers still gets a page (a
`feature {term}` card never 404s). A write-time cycle check (24e seat) mirrors
`assertNoCycle` in `curation/groups.ts` → `term_cycle`. `aliases` deferred
(merge covers it).

### D3 — Why hybrid (bare strings + optional records)

|                                                 | (a) materialized path `cookies/linzer` | (b) records + slug assignments | (c) **hybrid (chosen)**                                                         |
| ----------------------------------------------- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| Disk migration of 437 recipes                   | rewrite every re-parented string       | rewrite `tags` into slugs      | **none**; records are additive                                                  |
| Hierarchy rename                                | bulk string rewrite                    | scalar `parent`: free          | scalar `parent`: free                                                           |
| Assignments                                     | strings                                | arrays → F32                   | strings by design; rename/merge = curation-layer bulk writes (honest about F32) |
| Sync folds / F8 cost                            | fine                                   | fine                           | fine; record ↔ fold joined at read time (23-D18 shape)                          |
| Fits `ChipsInput` / `normalizeTags` / `tagSlug` | yes                                    | no                             | yes                                                                             |

### D4 — Universality (24b+)

| Type                    | Field                                                                   | Declares                                                              | Gets                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| recipes                 | `tags` (exists)                                                         | `taxonomies: [recipeTagTaxonomy]`; delete `recipeTags`/`recipesByTag` | `tags` v2, `by-tag` v2                                                                                      |
| groups                  | `tags` (new on `Group`, `GroupEntryValue`, both curation schemas, form) | same vocabulary `tag`, same term type                                 | `aggregate:groups:{tags,by-tag}`; `/tags/<slug>` lists groups too (closes backlog "Group tags / tag pages") |
| portfolio projects      | `tags` (exists, indexed)                                                | one line in `projectContentConfig.ts`                                 | `/tags`, `/tags/[tag]` (4 route files + a `TagPage` in the collection)                                      |
| demo notes              | `tags` (exists)                                                         | replace `noteTags` (**24a**)                                          | the reference implementation                                                                                |
| pages, featured, resume | —                                                                       | nothing                                                               | nothing                                                                                                     |

A vocabulary is site-level (one term type per vocabulary); each carrier type
declares participation; counts and carrier lists are unioned **at read time**
by the route. Recipes: one vocabulary whose roots are the facets, so
`tag:meal` expands to every meal.

### D5 — Groups after taxonomy — **decided 2026-09-16: option 2, terms absorb collections**

The MCP's view of groups may change fundamentally once terms exist (the
user's own flag). Candidates, with the doc recording the choice here:

1. **Keep both** (terms = classification; groups = ordered, labelled,
   annotated lists with a cover) and give the skill a rule: _a cluster by
   kind → term; a hand-picked, ordered, annotated list → group_.
2. **Terms absorb collections** — a term record gains an optional site-level
   arrangement (e.g. `pinned: string[]` / `order`) so "collection" groups
   become terms with a curated front; `Group.kind` narrows to `meal-plan`;
   MCP: `term_*` for classification and collections, `group_*` for plans,
   `feature {recipe | group | term}`; `group:` search stays for plans.
3. **Everything is a term** — rejected on sight: per-assignment labels/notes
   ("Mon · Dinner", the same recipe twice) have no home on a string carrier.

24a must not preclude 2: the term record is an open record and
`createTermContentType` takes a site `buildIndexValue` extension.
**Recommended lean: 2**, if 24b's read of the group code shows `collection`
groups carry nothing a term record cannot (they carry ordering and a cover —
both fit on a record; per-item `label`/`note` on collections would be lost,
and the real repo has no groups, so nothing is lost today).

- [x] **Decided at 24b (2026-09-16): option 2, terms absorb collections**,
      because the group read showed that per-item `label`/`note` are the
      only thing a collection carries that a term record cannot, and nothing
      on disk uses them (the real repo has no groups; the fixtures' collections
      carry none). Ordering and a cover both fit on a term record, so 24c gives
      the record a curated front: `pinned: string[]` (an ordered, hand-picked
      head of the term's carriers), `description`, `image`. MCP: `term_*` for
      classification **and** collections, `group_*` for plans, and `feature`
      takes exactly one of `recipe`, `group`, `term`; `group:` search stays
      for plans.
      **Sequencing consequence:** `Group.kind` narrows to `"meal-plan"` only at
      **24e**, when the taxonomy-edition tools and story test replace the
      groups-based `christmas-cookies` test that creates `kind: "collection"`
      today (`test/christmasCookies.test.ts`); 24b, 24c and 24d keep
      `collection` accepted everywhere. 24b records this decision and gives
      groups `tags` without touching `kind`.
- [x] **Two answers at 24c (2026-09-17).** (1) **Read side only**: 24c
      ships records → pages, tree, breadcrumb, pinned front, `feature {term}`
      and a hand-written fixture seed; every term _write_ lands with 24e's
      seats, CLI and MCP, and no browser form for term records is scheduled
      (backlog). (2) **`pinned` names recipe slugs only**, ordered: pinned
      recipes render first in pinned order, then the remaining carriers
      newest-first, then groups; a pinned slug that does not carry the tag is
      ignored at render time and rejected by 24e's `term_update`.

### D6 — Search and UI (24d)

`FILTER_FIELDS` stays a tuple; the `tag` branch reads through a resolver
`{expandTerm(field, value): Set<slug>; groupsOf?(slug)}` passed as an
optional third argument to `matchesFilter`; the client resolver comes from a
new `/search/terms` document (terms ∪ tree; editor route + export static
file, like `/search/groups`); the server resolver in `curation/search.ts`
reads the two aggregates. Server-side `group:` parity by decorating rows from
the Node-safe `readGroupSearchCorpus` (same fix, closes the backlog row). One
source of "all terms": `SearchContext.allTags` becomes labels from
`/search/terms`; the client `Set` is deleted; rail, autocomplete, ⌘K,
`BrowseChips`, `TagsInput` read the same list. Term pages: `/tags` = flat
index + tree with summed counts; `/tags/[tag]` = record label / description /
image, breadcrumb, own carriers (recipes, then groups), a "Narrower" chip
row; `generateTagStaticParams` = keys of every by-term ∪ tree slugs, the `_`
placeholder kept. Pagination of big terms is deferred to F8b with the
threshold restated; 24f measures.

### D7 — Seats, CLI, MCP, skill (24e)

`curation/terms.ts`: `listTerms, getTerm, createTerm, updateTerm, deleteTerm
{unassign?}` (`term_in_use` otherwise), `renameTerm` (record move + rewrite of
every carrier string whose slug matches; children follow by reference),
`mergeTerm`, `assignTerm {add, remove, type?}` (one `updateRecipe` /
`updateGroup` per carrier; reports `{updated, unchanged, missing}`). Codes:
`unknown_term` **422** (24c; like `unknown_recipe`/`unknown_group` in
`curation/http.ts` — an earlier draft said 404), `term_cycle` 409,
`term_in_use` 409. `FeaturedInputSchema`
exactly-one-of `recipe | group | term`; `GitTypeSchema` + `"term"`. Backend
×2, API `/api/taxonomies/[taxonomy]/…`, CLI `recipes term …`, MCP `term_list,
term_get, term_create, term_update, term_delete, term_rename, term_merge,
term_assign` (28 → 36), `feature {term}`, `tag_list` extended **additively**;
regex → `^(recipe|group|git|tag|featured|term)_[a-z_]+$`; settings + skill v3
pre-approve all but `term_delete`, `term_merge`. **The seats + the skill
are the write path for term records**; a browser form for them is a backlog
row, not a scheduled phase (24c decision).

D5's consequence for this seat set: `group_*` stays, for **plans** — the
skill v3 rule (24e) is _a cluster by kind, or a curated collection → term; an
ordered, dated, per-item-annotated list → group (meal plan)_. `group_create`
/ `group_update` reject `kind: "collection"` only from 24e on, together with
the `Group.kind` narrowing and the story test's taxonomy edition.

Acceptance test (24e, `test/mcp.test.ts` or its own file): "the
Christmas-Cookies shape, taxonomy edition" over the in-memory client on the
`christmas-cookies` fixture — `term_list` → `recipe_search cookie` (8) →
`term_create christmas-cookies {label, description}` → `term_assign` five →
`term_create linzer {parent}` → `term_assign` three → `feature {term, slug}` →
`recipe_search tag:christmas-cookies` → **8** → `term_get` both (counts
own/withDescendants, children, breadcrumb).

Backfill (24f): the vocabulary pass over the real repo as an agent run of the
skill on a content-repo branch — `recipe_list` pages of 100 with description

- ingredients, `term_assign` per term; then the real story run; then measure
  the by-term record against the F8b threshold.

### D8 — Phases

See the roadmap table below. Doc = this file; branches stacked off `main`.

### D9 — Migration / compat, costs, not in scope

- **Disk**: `tags` untouched; term records are new files under
  `taxonomies/tag/`; `.gitignore` regenerated by the existing writer
  (`derivedContentPaths`).
- **Versions**: `tags` / `by-tag` v1 → v2 at 24b (**corrected at 24b:** a
  stale spec hash does _not_ read `null` — `readAggregate` returns the stored
  value unchecked and only `updateAggregates` compares hashes, so a v1
  `string[]` reaches the new readers as labels of `undefined` until the next
  write or `reindex`); the groups index value gains `tags` → `reindex
groups`; featured `by-date` v2 → v3 at 24c; editor restart at 24c (new
  registry entry). Real repo: one `reindex` after 24b (mandatory, see T5) and
  one after 24c.
- **Risks → mitigations**: by-term record size after the backfill (~437 × 5 ×
  ~150 B ≈ 300 KB > the 150 KB threshold → slim `project` first, then F8b);
  invalidation fan-out unchanged from F28; an export placeholder per route
  family (T10); `specVersions` churn (the safe direction); tool-name regex
  (additive); `GroupInputSchema` strictness (declare `tags` in input **and**
  patch, T7); the self-referencing reference edge unproven (24a proves or
  falls back, T8); bulk assign = N commits (accepted; a batched commit is a
  possible F34); label precedence record > fold (documented; `term_rename`
  rewrites carriers to the record label); registry-order pins (append last);
  fixture byte churn (separate commits).
- **Not in scope for the epic**: F32 array references, `aliases`, a group
  picker in the browser form, per-term pagination unless 24f demands it,
  portfolio backfill, ranking. **Not in 24a**: any recipe-site change.

## Traps (T-list; pass to every implementer)

1. **T1 — New config modules carry a `version: "…"` literal** that
   `test/specVersions.test.ts` can grep, and every module the test pins is
   re-snapshotted when edited (`pnpm exec vitest run -u test/specVersions.test.ts`);
   bump the version when the fold/projection changes, not for comments.
   Engine-side: `TAXONOMY_FOLD_VERSION` in `taxonomies/aggregates.ts` and the
   `tree` version in `taxonomies/tree.ts` are pinned the same way.
2. **T2 — Thunks on both sides of a reference edge** (`config: () => …`),
   including a self-reference; the two modules may import each other only
   because the config is deferred.
3. **T3 — Configs never import the registry** (`contentTypes.ts` is imported
   by routes and scripts, never by a config module).
4. **T4 — Aggregate order is pinned** (`test/revalidateDerived.test.ts`,
   `toEqual`): declared aggregates first, then taxonomies in declaration
   order, each `tags` before `by-tag`. Appending is safe; reordering is not.
5. **T5 — Nothing self-heals on read, and a stale record is _not_ `null`.**
   `readAggregate` returns `null` only for a never-folded record; a record
   folded under an old spec is returned **as stored**, with no hash check
   (only `updateAggregates` compares specs, at write time). Proven at 24b:
   before the fixture rebuild the v1 `string[]` reached the new
   `.map((t) => t.label)` readers as seven `undefined`s — `getAllTags()`
   returned undefineds, `/tags` chips rendered blank. After a config lands,
   fixtures are regenerated by script (`build-fixture-indexes.ts` for
   recipes and for portfolio, `generate-fixtures` for the demo) and the real
   repo's `reindex` is **mandatory**, not housekeeping.
6. **T6 — `build-fixture-indexes.ts` rewrites every recipe fixture** (23-T41).
   24a touches no recipe config, so `git status` under
   `editor/playwright/fixtures` must stay clean; at 24b commit fixture churn
   separately from code.
7. **T7 — `GroupInputSchema` is `z.strictObject`**: a new `tags` key must be
   declared on the input schema **and** the patch schema, or every group
   write carrying tags is a validation error.
8. **T8 — The self-referencing reference edge is unproven.**
   `updateDependents` re-opens the dependent's content database after the
   item's own write closed it; when dependent = self, that is the same
   environment, and the candidates are siblings of the item just written. 24a
   proves the parent-rename → child `parentLabel` case on the demo term type
   (green) or leaves the case `it.skip` with the exact reason, and 24c's plan
   reads that verdict before it relies on it (fallback: curation-layer rewrite
   at `term_rename`). **Verdict (24a, green, no fallback needed):** parent
   rename rewrites the child's data-file `parent` and index `parentLabel`;
   a parent label edit alone moves `parentLabel`; an unborrowed edit moves
   nothing. The trap that remains is narrower: the candidate scan matches
   `value.parent === <old slug>`, so a term whose `parent` names itself would
   be its own candidate — the seat (24e) must reject `parent === slug`, and
   the tree fold already drops it from its own `children`.
9. **T9 — By-term record size threshold** is ~150 KB (F8b, F28). 24f measures
   the real record after the backfill; over the threshold → slim `project`
   first, then F8b partitions (24g).
10. **T10 — Export placeholder per route family.** Every static route family
    keeps a `{tag: "_"}`-style placeholder so `generateStaticParams` never
    returns an empty list on an empty corpus.
11. **T11 — Two "all tags" sources until 24d** (`getAllTags()` vs
    `SearchContext.allTags`); do not fix one without the other, and do not
    resurrect PR 3's chip rail.
12. **T12 — Sandbox.** Worktree-isolated background jobs refuse compound
    commands whose text names `git` twice or in a computed position (paths
    like `api/git/` count): put such steps in a script under
    `$CLAUDE_JOB_DIR/tmp` and `bash` it. Edits outside a `.claude/worktrees/`
    directory are rejected — `EnterWorktree` first. Playwright in a
    background job is killed at the 10-minute timeout: `setsid nohup … &` into
    a log and poll it, stripping ANSI before grepping for `N passed`. The
    auto-mode classifier can refuse a remote branch deletion; stop and list
    the command for the user rather than working around it.
13. **T13 — `TagsInput` is TanStack-bound; the group form is FormData.**
    `Form/Recipe`'s `TagsInput` reads `useRecipeForm`'s field API, so it cannot
    be dropped into `Form/Group` (uncontrolled `FormData`, parsed by
    `parseGroupFormData.ts`). Use `ChipsInput`
    (`packages/component-library/components/Form/ChipsInput`) directly: its
    `field` prop is the structural `ChipsArrayField {state: {value?},
pushValue, removeValue}` — a `useState<string[]>` plus a six-line adapter
    satisfies it — and it renders the hidden `tags[i]` inputs itself.
14. **T14 — `test/exportStaticParams.test.ts` mocks reader modules by path**
    (`vi.mock("…/data/readRecipeTagIndex")` with a `recipeTagIndexReads`
    export). Renaming the export or splitting a reader module breaks the mock
    silently (the test then reads the real module and finds no content
    directory); update the mock shape in the same commit.
15. **T15 — `test/curation.test.ts` pins the curation layer's import
    allow-list** (the `@discontent/cms/...` prefixes the seats may import).
    A seat that imports `@discontent/cms/taxonomies/read` fails that test
    until `@discontent/cms/taxonomies/` is admitted.
16. **T16 — Bare `toEqual` pins on group index values and `GroupRow`s**
    (`test/groups.test.ts`, `test/christmasCookies.test.ts` `group_list`
    rows). A new optional field must be **spread only when set**
    (`...(tags?.length ? {tags} : {})`) so untagged fixtures keep the exact
    object shape; `tags: undefined` would fail those pins.
17. **T17 — A taxonomy module may never gain a value import that reaches a
    content config.** `taxonomies: [recipeTagTaxonomy]` on
    `recipeContentConfig` / `groupContentConfig` is a **direct read at module
    evaluation, not a thunk**, so a chain `recipeTagTaxonomy →
tagTermContentConfig → featuredRecipeContentConfig → recipeContentConfig
→ recipeTagTaxonomy` throws a TDZ `ReferenceError` the first time any
    module imports a taxonomy module before a content config. `TaxonomyConfig.terms`
    therefore stays declared and **unread** (24c); site readers name
    `tagTermContentConfig` directly. `test/tagTerms.test.ts` carries an
    import-order tripwire; 24f may drop the unused field.
18. **T18 — Every new aggregate _read_ creates an LMDB directory**
    (`environmentCache.ts` opens on read), so each new aggregate is an
    `editor/.gitignore` question: the first `/tags` render on any fixture
    creates `taxonomies/tag/aggregates/tree/`, and a Playwright run dirties
    every fixture until the `*/taxonomies/` rule + the seeded fixture's
    carve-out exist (the `groups/` pair's shape).
19. **T19 — A content config with no `version:` literal cannot be pinned by
    `specVersions`** (`featuredRecipeContentConfig.ts`,
    `tagTermContentConfig.ts`); do not add a fake literal to satisfy the
    grep — pin the pagination / aggregate module that carries the version
    instead.

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR      | Branch (← parent)                    | Status         | Scope                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **24a** | `agent/24a-taxonomy-engine` ← `main` | ✅ done        | This doc; D1 + D2 primitives in `packages/cms/taxonomies/`; `aggregatesOf` at the two seats; demo notes adopt (terms + by-term); demo term type + the self-reference proof (T8); `incremental-regeneration.md` §10 F33 + §11; epic-23 housekeeping docs (M) |
| 24b     | `agent/24b-taxonomy-adopt` ← `main`  | ✅ done        | Recipes → taxonomy (delete the pair, keep names, v2), readers, groups gain `tags` (types, index value, schemas, form, seat), portfolio declares + routes, `/tags` unions; all 15 recipe fixtures regenerated; **D5 decided** (M–L)                          |
| 24c     | `agent/24c-term-records` ← `main`    | 🟡 in progress | `tagTermContentConfig` in the registry, tree read + label override + curated front (`pinned`/`description`/`image`), term page metadata / breadcrumb / children, `feature {term}` (featured v3), `christmas-cookies` seed gains term records (L)            |
| 24d     | `agent/24d-taxonomy-search` ← 24c    | ⏸️             | Resolver, `/search/terms`, one "all terms" source, hierarchical autocomplete / ⌘K, server descendant expansion + `group:` parity (L)                                                                                                                        |
| 24e     | `agent/24e-term-seats` ← 24d         | ⏸️             | Seats / CLI / API / MCP / skill v3 + the fixture acceptance test (D7) (L)                                                                                                                                                                                   |
| 24f     | `agent/24f-taxonomy-closeout` ← 24e  | ⏸️             | Backfill on the real repo (content task), the real story run, by-term measurement, backlog strikes, close-out, memory (S code / L content)                                                                                                                  |
| 24g     | conditional                          | ⏸️             | F8b partitions, only if 24f's by-term number exceeds 150 KB (L)                                                                                                                                                                                             |

**#144 landed** 2026-09-17 (`c581f222`) and the real repo was reindexed the
same day.

**Next PR: 24c** — `agent/24c-term-records` off `main` at `c581f222`
(draft PR against `main`). Scope: `tagTermContentConfig` in the recipe
registry via `createTermContentType` (records under `taxonomies/tag/`), the
**curated front per D5** (`pinned: string[]` of recipe slugs, `description`,
`image` on the record; `Group.kind` untouched until 24e), record label
override + tree read through a site reader (**not** the `terms` thunk, T17),
term page metadata / breadcrumb / children on `/tags/[tag]`, `feature {term}`
(featured `by-date` v2 → v3, `unknown_term` 422), the `christmas-cookies`
seed gains three hand-written term records. **Read side only**: no term
write seat, CLI, MCP or browser form (24e / backlog). Zero engine files
change. Section below.

## Phase detail

### PR 24a — Taxonomy engine `agent/24a-taxonomy-engine` ✅ done (← `main`)

Worktree `.claude/worktrees/agent-24a`, base `main` at `bd02f6f9`. No
recipe-site change; the engine and the demo only.

#### Design (decided)

D1 and D2 in full. Module layout under `packages/cms/taxonomies/`:

| File                  | Exports                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`            | `TaxonomyConfig`, `TaxonomyTerm {slug, label, count}`, `TaxonomyByTermEntry<TItem> {label, items}`, `TaxonomyByTerm<TItem> = Record<string, TaxonomyByTermEntry<TItem>>`                                        |
| `slug.ts`             | `termSlug(term)` = `@sindresorhus/slugify` (add the dependency to `packages/cms/package.json` at the site's `^3.0.0`); `normalizeTerm(term)` with `normalizeTags`' rules (trim, collapse whitespace, lowercase) |
| `aggregates.ts`       | `TAXONOMY_FOLD_VERSION = "1"`, `termsAggregate(t)`, `byTermAggregate(t)`, `taxonomyAggregates(t)`, `aggregatesOf(config)`                                                                                       |
| `read.ts`             | `readTaxonomyTerms({config, taxonomy, contentDirectory?})`, `readTaxonomyByTerm(...)` — Node-safe, over `readAggregate`                                                                                         |
| `next/cachedReads.ts` | `createCachedTaxonomyReads({config, taxonomy, contentDirectory?})` → `{terms, byTerm}`, each a `createCachedAggregateRead` result                                                                               |
| `termContentType.ts`  | `createTermContentType({taxonomy, directory, uploadsDirectory?, buildIndexValue?})`, `Term`, `TermIndexValue`, `TermIndexKey`                                                                                   |
| `tree.ts`             | `termTreeAggregate()` (`name: "tree"`, `version: "1"`; takes no argument, close-out divergence 5), `TermTree = Record<slug, {label, parent?, children: string[], image?}>`                                      |

Fold rules: a carrier's `field` value that is not an array is treated as
empty; each raw term is `normalizeTerm`ed, slugged, and the empty slug is
dropped; within one carrier duplicate slugs count once; `count` is the number
of carriers; `label` is the first normalised label seen in fold order (oldest
first, the walk order); `items` are pushed in fold order and reversed at
`finalize` (newest first); the terms array is sorted by slug; the by-term
record's keys are inserted in sorted-slug order so the JSON is stable.
`project` defaults to `({id}) => ({id})`.

`aggregatesOf(config)` is the single derivation; `updateAggregates` and
`derivedTagsOf` call it and nothing else changes (`rebuildIndex`,
`rebuildFixtureIndexes`, `derivedPaths` inherit through them).

`package.json` `files` gains `"taxonomies"` so the published package ships it.

#### Steps (Opus implementer, in order)

1. `packages/cms/content/types.ts`: `taxonomies?: TaxonomyConfig<any, any,
any>[]` with a doc comment (what the engine derives, the naming rule, the
   version rule, "field must already be on the index value").
2. New `packages/cms/taxonomies/` per the table above.
3. Seams: `aggregates/updateAggregates.ts` and
   `content/next/revalidateDerived.ts` use `aggregatesOf(config)`.
4. Demo adoption (`packages/cms/demo`): `lib/notes.ts` declares `taxonomies:
[noteTagTaxonomy]` (`name: "tag"`, `field: "tags"`, `version: "1"`, its own
   module `lib/noteTaxonomy.ts` so the config module keeps importing types
   only — the same reason `noteAggregates.ts` existed) and drops `aggregates:
[noteTags]`; delete `noteAggregates.ts`; `noteAggregateReads.ts` →
   `createCachedTaxonomyReads` (keep the export name `noteTagReads` if it
   keeps the diff small; `read()` now returns `TaxonomyTerm[]`); the tag cloud
   page renders `{label}` per term (add the count in a `data-count` attribute
   or a `<span>` only if `aggregates.spec.ts` keeps passing with
   `allInnerTexts()` — it compares to `["alpha", "beta", "gamma"]`, so the
   visible text of each `li` must stay the bare label). Add `noteTermConfig =
createTermContentType({taxonomy: "tag", directory: "taxonomies/tag"})` in
   `lib/noteTerms.ts` and append it to `demoContentTypes` (registry, last).
   No new demo page unless a spec needs one — report if unavoidable.
5. Tests: new `test/taxonomies.test.ts` (node env; tmp corpus written with
   `createContent`/`updateContent` or by seeding data files + `rebuildIndex`,
   whichever `test/aggregates.test.ts` does) covering: terms + by-term shapes;
   `changed: false` on a no-op write; two labels slugifying alike merge with
   first label; `aggregatesOf` ordering (declared first); `derivedTagsOf`
   emits `aggregate:notes:tags`, `aggregate:notes:by-tag` in that order;
   `project` is applied; the term type: create parent + child, **rename the
   parent (new slug) → the child's `parent` and borrowed `parentLabel`
   follow** and a parent `label` edit updates the child's `parentLabel` (the
   T8 proof; if `updateDependents` cannot, report exactly why and leave the
   failing case `it.skip` with the reason in the test body); the `tree` fold
   with a hand-made cycle (A.parent = B, B.parent = A) terminates and both
   appear. Update `test/specVersions.test.ts` (remove the `noteAggregates.ts`
   block, add `packages/cms/taxonomies/aggregates.ts` and `tree.ts`,
   re-snapshot), `test/revalidateDerived.test.ts` (the notes case gains
   `aggregate:notes:by-tag` after `aggregate:notes:tags`; recipes unchanged),
   `test/derivedPaths.test.ts` only if the demo registry is pinned there.
   `test/aggregates.test.ts` untouched.
6. Docs in code: `packages/cms/README.md` gains a "Taxonomies" section (the
   config, the two derived aggregates, term records); the README documents
   `ContentTypeConfig` without `paginationIndexes` / `aggregates` /
   `references` today — add those three lines while there.
7. `packages/cms/docs/incremental-regeneration.md`: the §10 **F33** row moves
   from "Planned" to "Done" with the vitest count, and the §11.1 entry gains
   its "what 24a built" paragraph.

#### Tests

Listed in step 5. The demo Playwright `aggregates.spec.ts` is the behavioural
gate: it must pass unchanged in its assertions (the tag cloud still reads
`["alpha", "beta", "gamma"]`, `changed: false` still fires no tag).

#### Gates (in `.claude/worktrees/agent-24a`)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm --filter discontent-demo exec tsc --noEmit
pnpm exec vitest run                      # 535 at base + test/taxonomies.test.ts
pnpm exec lint-staged --diff main         # via a script file (T12)
pnpm --filter discontent-demo e2e-dev     # setsid nohup; aggregates.spec.ts at minimum, the whole demo suite if under ~5 min
git status --porcelain websites/recipe-website/editor/playwright/fixtures   # must be empty (T6)
```

The stdout-purity grep from 23b is unchanged by this phase (no CLI/MCP code
moves).

#### Risks → mitigations

- `@sindresorhus/slugify` is ESM-only: the engine is consumed as TypeScript
  source by Next, vitest and the CLI's loader, so a plain import works. A
  dynamic import is **not** an acceptable fallback inside a sync fold; if a
  consumer's loader rejects the static import, report it rather than work
  around it.
- The self-reference (T8): the write's own environment is closed before
  `updateDependents` runs (fact 6), so the re-open is expected to work; the
  risk is the candidate scan matching the item itself when `parent === slug`
  (a self-parent) — the fold and the seat both reject that, the test does not
  create it.
- Demo spec brittleness: `aggregates.spec.ts` reads `li` texts; keep the
  label as the only text node.

#### Not in 24a

Any recipe-site change; `appearsInAggregate` refactor; the `terms` thunk's
consumer (24c); `/search/terms`; seats; F32.

#### Verification

- `pnpm exec vitest run` green including `test/taxonomies.test.ts`;
  `test/specVersions.test.ts` snapshot updated only for the demo and engine
  modules; `test/revalidateDerived.test.ts` shows `aggregate:notes:by-tag`;
  demo `aggregates.spec.ts` green; recipe fixtures byte-identical; all three
  typechecks clean; the self-reference case green or `it.skip` with a written
  reason.

#### Decisions and close-out (2026-09-16)

Draft PR **#143** against `main`. Commits: `52feb70e` design (this doc,
backlog, F33 row, `agent-mcp.md` landing note, CLAUDE.md), `999dae32`
implementation (26 files, +1890/−91), then the close-out and the CI-result
commits. Worktree `.claude/worktrees/agent-24a`.

**Gates (Fable's rerun after review; the implementer's run matched):**

| Gate                                                                        | Result                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm --filter recipe-editor typecheck`                                     | exit 0                                                                         |
| `pnpm --filter recipe-website exec tsc --noEmit`                            | exit 0                                                                         |
| `pnpm --filter discontent-demo exec tsc --noEmit`                           | exit 0                                                                         |
| `pnpm exec vitest run`                                                      | **32 files, 573 passed** (535 at base + 36 new + 2 pins)                       |
| `pnpm exec lint-staged --diff main`                                         | pass (64 files)                                                                |
| demo `pnpm e2e-dev -- tests/aggregates.spec.ts` (dev)                       | **7 passed** (27.8 s); implementer's whole demo suite **109 passed** (2.2 min) |
| `git status --porcelain websites/recipe-website/editor/playwright/fixtures` | empty (T6)                                                                     |

**The T8 verdict — green, no fallback.** Against the demo's real
`createTermContentType` config through `createContent` / `updateContent`:
renaming a parent (`cookies` → `holiday-cookies`) rewrites the child's
data-file `parent` and its index `parentLabel` (`dependents[0] =
{contentType: "tag-terms", updatedSlugs: ["linzer"]}`); editing the parent's
`label` alone moves `parentLabel`; editing `description` moves nothing.
Mechanism: `updateContent` runs `updateDependents` after its own index write
and `getContentDatabase` returns the cached environment (F1), so dependent =
self shares one live environment; `borrowedFieldsOf` walks `referencedBy →
self → references` and yields `["label"]`; `findViaIndex` matches
`value.parent === <old slug>`, which the item being written does not carry.
**24c may rely on the edge**; the curation-layer rewrite at `term_rename` is
struck from D7's obligations (rename still rewrites _carriers'_ strings —
that part stands).

**Divergences from the section, accepted:**

1. **Three `aggregatesOf` seats, not two.** `syncPaginationItems` gates the
   derived pass on `config.aggregates.length > 0`; left alone, a type whose
   only derived state is a taxonomy would never fold — silently. Fixed and
   pinned (`test/taxonomies.test.ts` "runs the aggregate pass for a type with
   a taxonomy and no pagination index"). D1's "exactly two call sites" is
   superseded by the module comment's three.
2. **`aggregates.spec.ts` assertions moved** for the `count` trade recorded
   under D1: four `readAggregateChanges()` expectations now read
   `["notes/by-tag", "notes/tags"]`; the tag-cloud text and byte-identical
   HTML assertions are unchanged, and "editing a title moves a page and not
   the aggregate" still asserts `[]`.
3. **`revalidateDerived.test.ts`'s demo case** also gained
   `aggregate:tag-terms:tree` and `item:tag-terms` (the registry entry); the
   five original tags are kept as an explicit floor.
4. **`specVersions.test.ts`'s regex** also matches `VERSION = "…"`, or the
   engine's `aggregates.ts` (whose only literal is `TAXONOMY_FOLD_VERSION`)
   could not be pinned; `noteTaxonomy.ts` is pinned as a new config module
   (T1), not just `noteAggregates.ts` removed.
5. **`termTreeAggregate()` takes no argument** — the parameter had no use
   and eslint's `args: "all"` rejects an unused one; the aggregate is scoped
   by the term content type that declares it.
6. No new demo page was needed.

**Review fixes (Fable):** the `aggregatesOf` doc comment said two seats;
corrected to three (re-snapshot of `specVersions` for the comment edit — no
version bump, T1's safe direction).

**Traps met:** an interrupted demo Playwright run leaves its dev server
alive (`pkill -f "playwright test"` misses it — the cmdline is `node
…/@playwright/test/cli.js test`), and a second run reuses the server so two
suites race on one `test-content`; kill by PID, `rm -rf
packages/cms/demo/test-content`, rerun. One unreproducible single-test
failure in one mid-session vitest run (not captured; three subsequent full
runs 573/573) — watch for it in CI.

**CI on `f4dcc5f9` (2026-09-16): all 12 checks green** — lint, unit tests
and both typechecks (run 35134379165); Playwright run 35134382864: CMS demo
dev + prod, Portfolio, recipe shards 1–4, merge of sharded reports. The
draft PR #143 is ready for the user's review and merge.

**Follow-ups filed:** none new beyond Deferred. F33's §10 row is **Done**
(573 vitest); §11.1 carries the "what 24a built" paragraph and the verdict.

### PR 24b — Site adoption `agent/24b-taxonomy-adopt` ✅ done (← `main`)

Worktree `.claude/worktrees/agent-24b`, base `main` at `6709f4c8` (the #143
merge). Three sites adopt the 24a kind; no engine change. D5 is recorded
above; `Group.kind` is **not** touched here.

#### Facts (validated 2026-09-16/17, read-only, on `main` = `6709f4c8`)

**Recipes.** `recipeTags` (`common/controller/aggregateConfigs.ts:18-42`,
`Set<string>` → sorted `string[]`, v1) and `recipesByTag` (`:75-122`,
`Record<slug, TagIndexEntry {label, recipes: RecipeListEntry[]}>`, v1, first
label wins, newest first) are declared at `recipeContentConfig.ts:48`
(`aggregates: [recipeTags, recipesByTag]`). `RecipeListEntry`
(`paginationConfigs.ts:21-27`) = `{slug, date, name, image?, tags?}`; the
projection reads `value.name/image/tags` + `key[0]` + `id`. `tags` reach the
index value verbatim (`buildIndexValue.ts:196`); `normalizeTags` runs at
write time only (`parseFormData.ts:122`, `curation/recipes.ts:234`), so the
corpus is already normalised and the engine's `normalizeTerm` is identity on
it. Names/dirs already match the engine's (`tags`, `by-tag`,
`aggregate:recipes:*`, `recipes/aggregates/*`); `termSlug === tagSlug`.
Readers: `data/readRecipeTags.ts` (`recipeTagReads`, the `string[]`),
`data/readRecipeTagIndex.ts` (`recipeTagIndexReads`, the by-tag record).
`getAllTags()` (`data/read.ts:175`) feeds homepage `BrowseChips`, three form
pages and `TagsInput`; `listTags` (`editor/controller/curation/search.ts:88-100`)
feeds `/api/tags`, CLI `tags`, MCP `tag_list` — **sixteen `string[]` call
sites, all behind those two functions**. `TagPage/routes.tsx` (three reads)
and `TagPage/shared.tsx` (`tag.recipes`) are the only `TagIndexEntry`
readers; `TagIndexPage`'s prop is already `Array<{slug, label, count}>` =
`TaxonomyTerm[]`; `/tags` derives `count` from `recipes.length` today.
`test/exportStaticParams.test.ts:82` mocks the module `readRecipeTagIndex`
(`recipeTagIndexReads.read`) (T14). `test/curation.test.ts:1119` import
allow-list lacks `@discontent/cms/taxonomies/*` (T15).
`editor/scripts/measure-engine-scale.ts:102` imports `recipesByTag`.
Fixtures: 15 under `editor/playwright/fixtures/test-content/`, `aggregates/`
committed in 13; `pnpm tsx scripts/build-fixture-indexes.ts` (editor)
rewrites all. Pins: `test/specVersions.test.ts` block for
`aggregateConfigs.ts` (hash `58a62281af838fe1`, `["1","1"]`);
`test/revalidateDerived.test.ts:200-208` `toEqual` order (survives: taxonomy
emits `tags` then `by-tag` in the same slot); Playwright `tag-pages.spec.ts`,
`recipe-tags-aggregate.spec.ts` (chip lists, counts, sorted-by-slug index —
all label-based, should pass unchanged).

**Groups.** `Group` (`types.ts:206-220`, open record), `GroupEntryValue`
(`:234-250`: `name, kind, image?, items`), `buildGroupIndexValue.ts:16-43`
(spread-only `image`), `groupContentConfig.ts:35-71` (`aggregates:
[groupsByRecipe, groupsByGroup]`, no `references`), `groupsByDate` v3 with
`project` at `groupPaginationConfig.ts:86-94` → `GroupListEntry {slug, date,
name, kind, image?, itemCount, groupCount}`. Nothing branches on `kind`
(badge only; `groupKindLabel.ts`). Schemas `editor/controller/curation/schema.ts`:
`GroupInputSchema:192` and `GroupPatchSchema:221`, both `z.strictObject`
(T7); recipe precedent `tags: z.array(z.string()).optional()` /
`.nullable().optional()` (`:108`, `:137`). Seats `curation/groups.ts`:
`createGroup:325`, `updateGroup:414`, `listGroups:168` (`GroupRow:84`,
`GroupDetail:76`); `curation/recipes.ts:231-236` is the tags precedent
(`normalizeTags`, `null` clears). Form `common/components/Form/Group/index.tsx`
is `"use client"`, already stateful (`useState` rows/name), uncontrolled
FormData; `editor/controller/parseGroupFormData.ts:33` is `z.object` (not
strict); `editor/controller/actions/groups.ts:buildGroupData:38-77`. `ChipsInput`'s
`field` prop is `ChipsArrayField {state: {value?: string[]}, pushValue,
removeValue}` (T13). CLI `editor/cli/commands/group.ts` (`create`, `update`,
`hasFlags:176`, the "needs something to change" message `:200`); MCP
`editor/mcp/registry.ts` `group_create:480`, `group_update:498` embed the
curation schemas (JSON Schema follows automatically). `GroupSearchEntry`
carries no tags (24d's concern). Fixtures with groups: `three-recipes-groups`,
`nested-groups`, `christmas-cookies` (carved out in `editor/.gitignore`,
23-T51). Pins: `test/groups.test.ts:414-443`, `:463-480` bare `toEqual` on
index values; `test/christmasCookies.test.ts:250-266` `group_list` rows
(T16); `specVersions` blocks for `groupPaginationConfig.ts` (`["3"]`) and
`groupAggregateConfigs.ts` (`["1","1"]`). Rendering: `GroupList`
(`common/components/List/Group/index.tsx`, `renderThumbnail` →
`GroupThumbnail` as `GroupIndexPage/shared.tsx:45` does); the recipe view
renders tag chips via `tagSearchHref` (`View/index.tsx`).

**Portfolio.** `Project.tags` and `ProjectEntryValue.tags` are already on the
index value (`packages/projects-collection/controller/types.ts:21,51`,
`buildIndexValue.ts:24`); `projectContentConfig.ts:47` has `paginationIndexes:
[projectsByDate]` and no `aggregates`; `projectsByDate.project` is `({key:
[date], value, id}) => ({...value, slug: id, date})` (`paginationConfigs.ts`,
a `ProjectListEntry`); registry
`websites/portfolio/editor/controller/contentTypes.ts:16-19`. Shared UI in
`websites/portfolio/common/` (`portfolio-website-common`); routes in
`websites/portfolio/{editor,export}/src/app/(portfolio)/{page,project,[...slug]}`;
export placeholder pattern at `export/src/app/(portfolio)/project/[slug]/page.tsx:61-81`
(`[{slug: "/"}]`). `Index/index.tsx`'s `IndexRow` is private and bound to the
search context (no reusable row). Fixture
`editor/playwright/fixtures/test-content/projects/` (5 projects with real
tags); rebuild `websites/portfolio/editor/scripts/build-fixture-indexes.ts`;
`derivedContentPaths` already emits `/projects/aggregates`
(`playwright/support/tasks.ts:71`), no ignore edit. Specs touching tags are
form/search only (`projects.spec.ts`, `index-search.spec.ts`,
`command-palette.spec.ts`). Pin: `specVersions` "project pagination configs"
(`["1"]`). Package names: `portfolio-website-editor` (has `typecheck`),
`portfolio-website-export` (no script; `exec tsc --noEmit`),
`@discontent/projects-collection`.

**Engine API (24a).** `TaxonomyConfig {name, field, version, slugOf?,
project?, terms?}`; `createCachedTaxonomyReads({config, taxonomy})` →
`{terms, byTerm}` (module scope); Node-safe `readTaxonomyTerms` /
`readTaxonomyByTerm` (`null` when never folded); `aggregatesOf` appends after
declared aggregates, `tags` before `by-tag` (T4). Stored spec version
`"1.<site>"`. The `count` trade: a second carrier of an existing term moves
`tags` too (24a close-out).

#### Design (decided)

**C1 — Recipes adopt the kind.**

- New `common/controller/recipeTagTaxonomy.ts` (own module, T1/T3):
  `recipeTagTaxonomy: TaxonomyConfig<RecipeEntryValue, RecipeEntryKey,
RecipeListEntry> = {name: "tag", field: "tags", version: "2", project:
({key: [date], value, id}) => ({slug: id, date, name: value.name, …})}` —
  spread `image` / `tags` only when set, to match today's stored rows
  byte-for-byte where possible (the implementer diffs one fixture's by-tag
  record before/after and reports). `type TagIndexEntry =
TaxonomyByTermEntry<RecipeListEntry>` lives next to it.
- `recipeContentConfig.ts:48`: `aggregates: [recipeTags, recipesByTag]` →
  `taxonomies: [recipeTagTaxonomy]`. Delete `aggregateConfigs.ts`.
  `measure-engine-scale.ts` → `byTermAggregate(recipeTagTaxonomy)`.
- Readers: `data/readRecipeTagIndex.ts` becomes `export const recipeTagReads =
createCachedTaxonomyReads({config: recipeContentConfig, taxonomy:
recipeTagTaxonomy})` (module scope, `{terms, byTerm}`); delete
  `data/readRecipeTags.ts`. Cache tags are the same strings as today
  (`aggregate:recipes:tags`, `aggregate:recipes:by-tag`).
- `getAllTags()` → `(await recipeTagReads.terms.read() ?? []).map((t) =>
t.label)`; `listTags` → `readTaxonomyTerms({config: recipeContentConfig,
taxonomy: recipeTagTaxonomy, contentDirectory})` mapped the same way
  (allow-list entry, T15). `/api/tags`, CLI `tags`, MCP `tag_list` unchanged
  in shape.
- `TagPage/routes.tsx`: `tagIndexRoute` reads both `terms` lists (recipes,
  groups) and merges into a `Map<slug, {label, count}>` — recipes inserted
  first (label wins), groups add to `count`; emit sorted by slug
  (`TagIndexPage`'s prop is already `{slug, label, count}[]`). `tagRoute`
  reads both `byTerm` maps in a `Promise.all`, `notFound()` only when neither
  has the slug, renders `<TagPage label recipes={r?.items ?? []}
groups={g?.items ?? []} />` (label from whichever hit, recipes first).
  `generateTagStaticParams` = `Set` of both key sets, `[{tag: "_"}]` when
  empty (T10).
- `TagPage/shared.tsx`: `TagPage({label, recipes: RecipeListEntry[], groups:
GroupListEntry[]})` — the existing `RecipeList` section (its `EmptyState`
  only when both lists are empty, which cannot happen after the `notFound`
  guard, so keep it as the recipes-only fallback text), then, when
  `groups.length`, a "Groups" sub-heading with `GroupList` (`renderThumbnail`
  → `GroupThumbnail`). No new component.
- `test/exportStaticParams.test.ts:82`: the mock of `readRecipeTagIndex`
  becomes `{recipeTagReads: {terms: {read: async () => []}, byTerm: {read:
() => readTagIndex()}}}` plus a mock of `readGroupTagIndex` returning
  `{terms: {read: async () => []}, byTerm: {read: async () => ({})}}`
  (T14); a new case: the union of both key sets, and `_` when both are empty.

**C2 — Groups gain `tags`.**

- `types.ts`: `Group.tags?: string[]`, `GroupEntryValue.tags?: string[]`
  (doc comment: bare strings, the taxonomy folds them; D3).
  `buildGroupIndexValue.ts`: `...(tags && tags.length ? {tags} : {})`
  (spread-only, T16).
- New `common/controller/groupTagTaxonomy.ts`: `{name: "tag", field: "tags",
version: "1", project}` where `project` is `groupsByDate.project` verbatim
  (import and reuse the function, or re-export a shared `projectGroupListEntry`
  from `groupPaginationConfig.ts` — either way one definition) so a by-tag
  row **is** a `GroupListEntry` and `GroupList` renders it unchanged.
  `groupContentConfig.ts` gains `taxonomies: [groupTagTaxonomy]` after
  `aggregates` (T4: emitted order `by-recipe, by-group, tags, by-tag`).
- `curation/schema.ts`: `tags: z.array(z.string()).optional()` on
  `GroupInputSchema`, `.nullable().optional()` on `GroupPatchSchema` (T7).
  `curation/groups.ts`: `createGroup` normalises via `normalizeTags` and
  spreads only when non-empty; `updateGroup` `null` clears / array replaces
  (mirror `recipes.ts:231-236`); `GroupRow.tags?` spread-only in
  `listGroups` (T16); `GroupDetail` carries `tags`.
- Form (T13): in `GroupFields` add `useState<string[]>` initialised from
  `group?.tags ?? []`, a six-line `ChipsArrayField` adapter, and
  `<FieldWrapper label="Tags"><ChipsInput field name="tags" itemLabel="tag"
normalize={normalizeTag} suggestions={allTags} /></FieldWrapper>` between
  the image input and the items fieldset (match `TagsInput`'s wrapper and
  props — read it first); `allTags?: string[]` becomes a `GroupFields` prop
  fed by the group new/edit pages via `getAllTags()`.
  `parseGroupFormData.ts`: `tags: z.array(z.string()).default([]).transform(normalizeTags)`
  (`.default([])` because an empty chip list submits no `tags[i]` key at all);
  `actions/groups.ts:buildGroupData` spreads `tags` only when non-empty.
  `GroupDetailPage` renders tag chips via `tagSearchHref` like the recipe
  view.
- CLI: `--tag <tag>` (repeatable) on `group create` and `group update` (+ the
  `hasFlags` list and the "needs something to change" message); MCP
  `group_create` / `group_update` descriptions name `tags`.
- Readers: new `data/readGroupTagIndex.ts` → `groupTagReads =
createCachedTaxonomyReads({config: groupContentConfig, taxonomy:
groupTagTaxonomy})`, consumed by `TagPage/routes.tsx` (C1).
- Fixture: add `"tags": ["weeknight"]` to one group's data file in
  `three-recipes-groups` (and the same tag on one recipe there if none
  carries it) so `/tags/weeknight` lists both a recipe and a group in
  Playwright; no new fixture → no `.gitignore` change. Rebuilt by the same
  script run as C1's fixtures.

**C3 — Portfolio declares + routes (D4: pages live in the collection).**

- New `packages/projects-collection/controller/projectTagTaxonomy.ts`
  (`{name: "tag", field: "tags", version: "1", project}` with `project` =
  `projectsByDate.project`, one definition); `projectContentConfig.ts:47`
  gains `taxonomies: [projectTagTaxonomy]`.
- `packages/projects-collection/controller/data/readTagIndex.ts` →
  `projectTagReads = createCachedTaxonomyReads(...)`.
- Pages **in the collection**: `packages/projects-collection/components/TagPage/{routes,shared}.tsx`.
  Portfolio has no reusable row and must not import the recipe site, so
  `TagIndexPage` is the project page's shell (`<main className="mx-auto
w-full max-w-3xl grow px-4 py-12 …">` — copy the classes from
  `project/[slug]/page.tsx`) with an `<h1>Tags</h1>` and a `<ul>` of `<Link
href="/tags/<slug>">label <count>` rows (`data-testid="tag-index"`);
  `TagPage` is the same shell with one `<Link href="/project/<slug>">` per
  item printing year, name and summary in `IndexRow`'s three class strings.
  `tagRoute` reads one `byTerm`, `notFound()` on a miss;
  `generateTagStaticParams` with the `_` placeholder (T10).
- Four route files under
  `websites/portfolio/{editor,export}/src/app/(portfolio)/tags/{page,[tag]/page}.tsx`
  (under `(portfolio)` so `layout.tsx`'s masthead applies; `/tags` is a
  static segment and beats the `[...slug]` pages catch-all — verify the
  catch-all does not also claim `tags` as a page slug in a fixture).
- Fixture rebuild: `pnpm tsx scripts/build-fixture-indexes.ts` in
  `websites/portfolio/editor` (adds `projects/aggregates/{tags,by-tag}`).

**C4 — Versions, pins, fixtures, docs.**

- Site versions: recipe taxonomy `"2"` (stored `"1.2"`), groups `"1"`,
  portfolio `"1"`. No `groupsByDate` bump (tags are not projected onto list
  rows). Real repo: one `reindex` after 24b lands (T5) — the user's.
- `test/specVersions.test.ts`: remove the `aggregateConfigs.ts` block, add
  blocks for `recipeTagTaxonomy.ts`, `groupTagTaxonomy.ts`,
  `projectTagTaxonomy.ts`; re-snapshot.
- `test/revalidateDerived.test.ts`: recipes' pinned order unchanged; groups
  gain `aggregate:groups:tags`, `aggregate:groups:by-tag` after `by-group`;
  portfolio (if pinned) gains `aggregate:projects:tags`, `aggregate:projects:by-tag`.
- `test/curation.test.ts` allow-list (T15). `test/groups.test.ts` new cases:
  a tagged group's index value carries `tags` and an untagged one has no key;
  `groups/aggregates/tags` and `by-tag` fold it with the `GroupListEntry`
  row shape; `createGroup` normalises (`" Weeknight "` → `"weeknight"`);
  `updateGroup {tags: null}` clears. `test/exportStaticParams.test.ts`: the
  union case and the `_` placeholder.
- Fixtures: recipe (all 15 rewritten, spec version moved) in **its own
  commit** (T6); portfolio's `projects` fixture likewise (may share that
  commit).
- Playwright: `tag-pages.spec.ts` gains "a tag page lists a group"
  (`three-recipes-groups`, `/tags/weeknight` shows the recipe and the group);
  `groups.spec.ts` gains a form tags case (create a group with a chip, the
  detail page shows it); new
  `websites/portfolio/editor/playwright/tests/tags.spec.ts` (index lists the
  fixture's tags with counts; one tag page lists its projects; unknown → 404).
- Docs: `packages/cms/docs/incremental-regeneration.md` §11.2 gets one
  consumer line (recipes, groups, projects adopt F33; no engine change, no
  new F-row).

#### Steps (Opus implementer, in order)

1. C1 recipes (config, taxonomy module, readers, `getAllTags`/`listTags`,
   `measure-engine-scale.ts`), compile; then C2 groups (types, index value,
   taxonomy, config, schemas, seats, form, CLI/MCP descriptions, reader);
   then C1's `TagPage` union (needs C2's reader); then C3 portfolio; then C4
   tests and docs. Commit code as one or more `24b:` commits.
2. Regenerate fixtures (recipe editor script, then portfolio editor script,
   then the `three-recipes-groups` tag edit + one more recipe-script run) and
   commit them **separately** (T6): `24b: regenerate fixtures`.
3. Gates below; report verbatim.

#### Tests

Listed in C4. The behavioural gates are the existing `tag-pages.spec.ts` /
`recipe-tags-aggregate.spec.ts` (unchanged assertions), the new group case,
`groups.spec.ts`, `api-write.spec.ts` (group writes through the API with the
strict schemas, T7), and portfolio's new `tags.spec.ts`.

#### Gates (in `.claude/worktrees/agent-24b`)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm --filter portfolio-website-editor typecheck
pnpm --filter portfolio-website-export exec tsc --noEmit
pnpm exec vitest run                      # 573 at base + new cases
pnpm exec lint-staged --diff main         # via a script file (T12)
pnpm --filter recipe-editor e2e-dev -- tag-pages.spec.ts recipe-tags-aggregate.spec.ts groups.spec.ts api-write.spec.ts   # setsid nohup (T12)
pnpm --filter portfolio-website-editor e2e-dev -- tags.spec.ts projects.spec.ts
```

The stdout-purity grep from 23b is unchanged by this phase (the CLI gains a
flag, no new output path).

#### Risks → mitigations

- **Byte drift in by-tag rows.** Today's `recipesByTag` projection sets
  `image`/`tags` only when present; a `project` that writes `image: undefined`
  would change JSON. Spread conditionally and diff one fixture record.
- **The label of a union slug.** Recipes' label wins on `/tags` and
  `/tags/[tag]`; a group-only slug takes the group's label. Sorted-by-slug
  output keeps `tag-pages.spec.ts`'s ordering assertions.
- **Group form regressions.** `parseGroupFormData` is `z.object`, so a
  missing `tags` key must default to `[]`; the action must not write
  `tags: []` into the data file (spread-only, so untagged groups' files are
  byte-identical to today's).
- **Portfolio catch-all.** `[...slug]` pages route: a fixture page with slug
  `tags` would shadow-fight the static segment; none exists — check the
  `about-page` fixture.
- **`christmas-cookies` fixture** carries groups: the regenerate script adds
  `groups/aggregates/{tags,by-tag}` there too; `test/christmasCookies.test.ts`
  replays writes against a copy and must keep passing with `GroupRow`
  unchanged for untagged groups (T16).

#### Not in 24b

Search (`tag:` descendant expansion, `group:` parity, `/search/terms`,
`SearchContext.allTags`, `GroupSearchEntry.tags`) — 24d; term records and
the `terms` thunk — 24c; seats/API/MCP `term_*` — 24e; `Group.kind`
narrowing — 24e; skill prose; the real repo's `reindex`.

#### Verification

- `pnpm exec vitest run` green; `specVersions` snapshot shows the three site
  taxonomy modules and no `aggregateConfigs.ts`; `revalidateDerived` recipe
  order unchanged, groups + projects extended; recipe `tag-pages.spec.ts`
  green with its existing counts and the new group case; portfolio
  `tags.spec.ts` green; `/tags/[tag]` `notFound()` only when neither corpus
  has the slug; fixture churn in its own commit; draft PR against `main`
  with CI green; close-out below; memory updated.

#### Decisions and close-out (2026-09-17)

Draft PR **#144** against `main`
(https://github.com/rogermparent/discontent/pull/144). Commits: `2b4a1b52`
design (this doc: D5, D7 consequence, T13–T16, the section above),
`5d7f3ba9` implementation (Opus subagent; 46 files, +1481/−256),
`56119f16` fixtures (158 files, all under `playwright/fixtures`, T6), then
the review-fix + close-out commit and the CI-result commit. Worktree
`.claude/worktrees/agent-24b`.

**Gates (Fable's rerun after review; the implementer's run matched):**

| Gate                                                                                                                               | Result                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter recipe-editor typecheck`                                                                                            | exit 0                                                                                                                             |
| `pnpm --filter recipe-website exec tsc --noEmit`                                                                                   | exit 0                                                                                                                             |
| `pnpm --filter portfolio-website-editor typecheck`                                                                                 | exit 0                                                                                                                             |
| `pnpm --filter portfolio-website-export exec tsc --noEmit`                                                                         | exit 0                                                                                                                             |
| `pnpm exec vitest run`                                                                                                             | **32 files, 583 passed** (573 at base + 10 new)                                                                                    |
| `pnpm exec lint-staged --diff main`                                                                                                | exit 0                                                                                                                             |
| recipe `e2e-dev -- tag-pages groups recipe-tags-aggregate` (Fable)                                                                 | **44 passed (2.0 min)**                                                                                                            |
| recipe `e2e-dev -- tag-pages recipe-tags-aggregate groups api-write search-live search-autocomplete command-palette` (implementer) | **125 passed** (4.9 min); the unrequested sweep over every spec sharing the edited fixture found one failure, fixed (item 7 below) |
| portfolio `e2e-dev -- tags.spec.ts` (Fable)                                                                                        | **5 passed (16.5 s)**                                                                                                              |
| portfolio `e2e-dev -- tags projects` (implementer)                                                                                 | **12 passed** (55 s)                                                                                                               |
| stdout-purity grep over `editor/cli`, `editor/mcp`                                                                                 | 6 hits, identical to `main`                                                                                                        |

**The byte check.** `search-corpus/recipes/aggregates/by-tag`, dumped through
`readAggregateRecord` before and after: the only textual difference across
the whole record is the field name (`recipes` → `items`) and the stored spec
version (`"1"` → `"1.2"`). One difference is invisible in JSON but real in
the stored object: the old `recipesByTag` wrote `image: value.image`
unconditionally, so a row for a recipe without a picture carried an `image`
key holding `undefined`; the new `project` spreads it, so that key is gone
(`slug|date|name|image|tags` → `slug|date|name|tags`). Free here because the
version bump rewrites the record anyway; recorded in the module comment.

**Finding that corrects the doc — T5 and D9 were wrong about stale reads.**
`readAggregate` (`packages/cms/aggregates/readAggregate.ts`) returns the
stored value with **no spec check**; only `updateAggregates` compares
hashes. Proven mid-phase: before the fixture rebuild,
`test/christmasCookies.test.ts` read the v1 `string[]` through the new
`.map((t) => t.label)` reader and got seven `undefined`s. On the real repo
that is `getAllTags()` returning undefineds, blank `/tags` chips and an
empty `/tags/[tag]` until the first write or `reindex`. T5 and D9 are
corrected above; **the `reindex` after 24b lands is mandatory**. A read-side
spec guard (return `null` on mismatch) would make T5 true as originally
written — filed under Deferred as an engine follow-up, not done here.

**Divergences from the section, accepted:**

1. **`--clear-tags` on `group update`**, beyond the specified repeatable
   `--tag`. Mirrors `--clear-image`; without it the CLI cannot reach the
   `tags: null` branch the patch schema declares. Refused alongside `--tag`.
2. **The `createGroup` / `updateGroup` seat cases live in
   `test/curation.test.ts`**, not `test/groups.test.ts` — the latter drives
   the engine write path against raw configs and has no curation `ctx`. The
   index-value and fold cases are in `groups.test.ts` as specified.
3. **`exportStaticParams.test.ts` needed a third mock**, `data/readGroupItem`:
   `TagPage/shared` now renders `GroupList` → `GroupThumbnail` →
   `createCachedItemRead` at module scope, which throws under the
   `next/cache` stub (T14, extended).
4. **`groupsByDate.project` was extracted as the exported
   `projectGroupListEntry`** so the taxonomy and the pagination index share
   one definition. Identical output, no version bump;
   `groupPaginationConfig.ts`'s source hash re-snapshotted.
5. **Portfolio's `/tags` rows render uppercase** (the index's tag-hint
   styling), so `tags.spec.ts` lowercases `allInnerTexts()` before comparing.
6. **Fixture: `third-recipe`, not `first-recipe`, carries the shared term** —
   a tagged recipe draws a chip on its card, and `first-recipe` is item 1 of
   `week-of-may-4`, whose spec resolves that card's single link in strict
   mode.
7. **Fixture: the term is `midweek`, not `weeknight`** — free text matches
   tags, so tagging a recipe `weeknight` made `search "weeknight"` return a
   recipe where `search-live.spec.ts` asserts the group strip appears with
   _no_ recipes. `midweek` is a prefix of nothing any spec searches for.

**Review fixes (Fable):** `recipeTagTaxonomy.ts`'s comment claimed a stale
corpus "reads `null`"; corrected (re-snapshot of `specVersions` for the
comment edit — no version bump, T1's safe direction). T5 and D9 corrected
as above. CLAUDE.md's worktree note gains the portfolio editor's
`.env.local` (item below).

**Traps met:** a fresh worktree's **portfolio editor has no `AUTH_SECRET`**
— `websites/portfolio/editor/.env.local` exists in no checkout, so all seven
`projects.spec.ts` cases fail with `[auth][error] MissingSecret`; copying
the recipe editor's `.env.local` across fixes it (now in CLAUDE.md). `eslint`
was SIGKILLed twice under memory pressure during one `lint-staged` run;
clean on rerun and every run since.

**CI on `cd163832` (2026-09-17): all 12 checks green** — lint, unit tests
and both typechecks (run 35184951752); Playwright run 35184954546: CMS demo
dev + prod, Portfolio, recipe shards 1–4, merge of sharded reports. The
draft PR #144 is ready for the user's review and merge; after it lands, the
real repo needs one `reindex` (T5, mandatory).

**Follow-ups filed:** read-side spec guard in `readAggregate` (Deferred);
`GroupSearchEntry.tags` + `group:`/`tag:` parity are 24d's as planned;
`Group.kind` narrowing 24e (D5).

### PR 24c — Term records `agent/24c-term-records` 🟡 in progress (← `main`)

Worktree `.claude/worktrees/agent-24c`, base `main` at `c581f222` (the #144
merge). The recipe site adopts the engine's term-record content type (24a,
`createTermContentType`) so a `tag` can carry a label, a description, an
image, a parent and a curated front, and `feature` gains a third target.
**Zero engine files change.** Decisions taken in the plan-mode session
(2026-09-17):

- **Read side only.** 24c ships records → pages, tree, breadcrumb, pinned
  front, `feature {term}`, and the `christmas-cookies` seed as hand-written
  `term.json` files. Every term _write_ (create/update/rename/merge/assign)
  lands with 24e's seats, CLI and MCP; there is **no browser form** for term
  records in 24c (backlog row).
- **`pinned` names recipe slugs only.** Pinned recipes render first in
  pinned order, then the remaining carriers newest-first, then groups. A
  pinned slug that does not carry the tag is ignored at render time (24e's
  `term_update` validates).
- **No `terms` thunk on the site taxonomy configs** (deviation from the
  roadmap line). `recipeContentConfig.ts:53` and `groupContentConfig.ts:76`
  read `taxonomies: [recipeTagTaxonomy]` directly, so `recipeTagTaxonomy →
tagTermContentConfig → featuredRecipeContentConfig → recipeContentConfig →
recipeTagTaxonomy` would throw a TDZ `ReferenceError` the first time a
  module imports a taxonomy module before a content config (24d's
  `/search/terms` would). Site readers name `tagTermContentConfig` directly;
  `TaxonomyConfig.terms` stays declared and unread (T17; a 24f cleanup
  candidate).
- **No site `buildIndexValue` extension.** Nothing in 24c reads
  `description` or `pinned` off the term _index_; the page reads the record
  by slug and the tree already carries `label/parent/image`. 24e decides
  whether `term_list` wants them indexed.
- **`unknown_term` is 422**, like `unknown_recipe`/`unknown_group`
  (`curation/http.ts:52-67`, pinned in `test/curationHttp.test.ts:40-66`).
  D7 said 404; corrected there.

#### Facts (validated 2026-09-17, read-only, on `main` = `c581f222`)

**Engine (24a, unchanged).** `packages/cms/taxonomies/termContentType.ts`:
`createTermContentType({taxonomy, directory, uploadsDirectory?,
buildIndexValue?(data, refs, base)})` → `ContentTypeConfig<Term,
TermIndexValue, TermIndexKey>`; `contentType "tag-terms"`, `dataDirectory
"<dir>/data"`, `indexDirectory "<dir>/index"`, `dataFilename "term.json"`;
`Term {label, date, description?, image?, parent?, [k]: unknown}` (open);
`TermIndexValue {label, date, parent?, image?, parentLabel?}`;
self-referencing `references` (`parent`, borrows `label`) and
`referencedBy`; `aggregates: [termTreeAggregate()]`. `tree.ts`: `TermTree =
Record<slug, {label, parent?, children: slug[], image?}>`, `name: "tree"`,
`version: "1"`, a single linking pass (a hand-edited cycle terminates with
both nodes present; a self-parent is dropped from its own children; a
dangling parent is kept on the child). No tree reader helper exists;
`createCachedAggregateRead({config, aggregateConfig: termTreeAggregate()})`
and `readAggregate` work (the tag is `aggregate:tag-terms:tree`). The terms
fold never applies a record label, and a record-only term yields no terms
row and no by-term key — the join is the site's. `uploadsDirectory` →
`<content>/<uploadsDirectory>/<slug>/uploads/<file>`. Typing: a config typed
`ContentTypeConfig<TagTerm, TagTermIndexValue, TermIndexKey>` accepts the
spread of the engine's config with no cast as long as every added field is
optional (probed with the compiler API). Reads create LMDB directories
(`environmentCache.ts:114-117`), so the first `/tags` render on a content
directory creates `taxonomies/tag/aggregates/tree/` (T18).

**Registry.** `editor/controller/contentTypes.ts:30-46` — four configs,
append-only, imported by no config (T3). Pins:
`test/revalidateDerived.test.ts:108-123` (`toEqual`, ends `"item:groups"`),
`test/derivedPaths.test.ts:130-151` (`toEqual`, ends `/groups/aggregates`).
`successConfigs.ts:204` throws for an unlisted type on a **curation write**
(nothing writes `tag-terms` through that layer in 24c). Maintenance page
`settings/maintenance/page.tsx:27-37` hand-wires three rebuild buttons.
`rebuildFixtureIndexes.ts:77` skips a type whose `indexDirectory` is absent
in a fixture; LMDB `open` creates `data.mdb` inside an existing directory.

**Featured.** `featuredRecipeContentConfig.ts:51-62` `references` to
recipes (`["name","image"]`) and groups (`["name","kind"]`); the carriers
hold `referencedBy` (`recipeContentConfig.ts:28-33`,
`groupContentConfig.ts:77-79`). `buildFeaturedRecipeIndexValue.ts` assigns
seven keys unconditionally. `paginationConfigs.ts:127-180`:
`FeaturedRecipeListEntry` and `featuredRecipesByDate` **`version: "2"`**
(pinned inside `specVersions` "recipe pagination configs", versions
`["1","2"]`). Seat `curation/featured.ts`: `FeaturedRow.name = recipeName ??
groupName`, `requireTarget` reads the target data file via
`readContentFileOrNull` (`UnknownRecipeError`/`UnknownGroupError`, no
force), `feature` spreads only the set key and commits `Feature
recipe|group: <slug>`. Schema `curation/schema.ts:~343-355`
`FeaturedInputSchema` XOR `recipe|group` via `.refine` (message unpinned).
Form `Form/FeaturedRecipe/index.tsx` ToggleGroup
`data-testid="featured-target"` with two items, only the active input
mounted; `parseFeaturedRecipeFormData.ts` refine;
`featuredRecipeFormState.ts` errors; `actions/featuredRecipes.ts:34-44`.
Homepage strip `Homepage/route.tsx:66-88` filters on `recipeName ||
groupName` then maps to `{kind:"recipe"}|{kind:"group"}`;
`FeaturedStrip.tsx:19-27` union; `Homepage/index.tsx:76-78` hero = recipes
only; `List/FeaturedRecipe/{index,GroupCard}.tsx` (`GroupCard` renders
"Group not found" when nameless); `FeaturedRecipeDetailPage/index.tsx:27-39`
two variants; editor + export `featured-recipe/[slug]/page.tsx` branch on
`group`. CLI `cli/commands/featured.ts` (`--recipe|--group` XOR at 44-48;
list `tags` recipe/group), `cli/index.ts:129` usage line; MCP
`mcp/registry.ts:609-620` `feature` embeds `FeaturedInputSchema`. Errors:
`curation/errors.ts` (`CurationErrorCode`, `CurationErrorDetails`,
`toErrorObject` 250-298), `curation/http.ts:54` status map,
`cli/backend/http.ts:109-119` `rehydrate` copies `groups`. Tests:
`test/featured.test.ts` (harness 57-84), `test/christmasCookies.test.ts:268-276`
`featured_list` row via `toMatchObject`, `test/mcp.test.ts:286-303`,
Playwright `featured-recipes.spec.ts` (toggle pattern at 1127-1133).

**Tag pages.** `common/components/TagPage/routes.tsx` (`tagIndexRoute`,
`tagRoute` 404 when neither carrier has the slug, `generateTagStaticParams`
union + `_`), `shared.tsx` (`TagPage({label, recipes, groups})`,
`TagIndexPage`); four route files re-export only (no `generateMetadata`).
Readers `data/readRecipeTagIndex.ts` (`recipeTagReads`),
`data/readGroupTagIndex.ts` (`groupTagReads`), `data/readGroupItem.ts`
(`groupItems`, module scope). `test/exportStaticParams.test.ts` mocks by
module path (`readRecipeTagIndex`, `readGroupTagIndex`, `readGroupItem`;
T14). Images: `GroupImage/index.tsx` `getTransformedGroupImageProps` +
`getGroupUploadPath` (`filesystemDirectories.ts:64-70`) is the pattern;
`GroupThumbnailPlaceholder` exists.

**Fixture.** `christmas-cookies`: 10 recipes (tags cookies 8, dessert 8,
baked 9, christmas 4, breakfast/dinner/quick 1), no groups, no featured, no
images, 18 tracked files; used only by `test/christmasCookies.test.ts` and
`test/mcp.test.ts` (no Playwright spec). The three linzer recipes are the
three newest cookies (`linzer-cookies` > `chocolate-hazelnut-linzer-cookies`

> `apricot-linzer-cookies`). `editor/.gitignore:64-66` ignores `*/groups/`
> with two negations; no `taxonomies/` rule. The real content repo's
> `.gitignore` is hand-written (T6).

**Curation import allow-list** (`test/curation.test.ts:~1184`) names
`recipe-website-common/controller/(…|data/readGroups)$`;
`curation/featured.ts` importing `tagTermContentConfig` fails until it is
added (T15).

#### Design (decided)

**C1 — Types, term config, featured edge.**

- `common/controller/types.ts`: `import type {Term, TermIndexValue,
TermIndexKey} from "@discontent/cms/taxonomies/termContentType"`; `export
interface TagTerm extends Term {pinned?: string[]}` (recipe slugs, ordered);
  `export type TagTermIndexValue = TermIndexValue`; `export type
TagTermEntryKey = TermIndexKey`. `FeaturedRecipe.term?: string`;
  `FeaturedRecipeEntryValue` gains `term?, termLabel?, termImage?`.
- New `common/controller/tagTermContentConfig.ts`: `const base =
createTermContentType({taxonomy: "tag", directory: "taxonomies/tag",
uploadsDirectory: "uploads/tag-term"})`; `export const tagTermContentConfig:
ContentTypeConfig<TagTerm, TagTermIndexValue, TagTermEntryKey> = {...base,
referencedBy: [...(base.referencedBy ?? []), {config: () =>
featuredRecipeContentConfig, indexField: "term"}]}`. Doc comment: why the
  taxonomy modules do **not** import this (T17); the module imports
  `featuredRecipeContentConfig` for the thunk only (the same cycle recipes
  and groups already have with featured, T2). No `version:` literal (T19).
- `featuredRecipeContentConfig.ts:51-62`: third `references` entry
  `{config: () => tagTermContentConfig, dataField: "term", fields: ["label",
"image"]}`. `buildFeaturedRecipeIndexValue.ts`: `borrowed<TagTerm>(refs,
"term")`; add `term`, `termLabel`, `termImage` **spread only when set**
  (existing stored values stay byte-identical; the seven existing keys stay
  assigned).
- `paginationConfigs.ts`: `FeaturedRecipeListEntry` gains the three;
  `featuredRecipesByDate.version` `"2"` → `"3"` with a comment; `project`
  copies them (spread-only). Pin: `specVersions` "recipe pagination configs"
  → `["1","3"]`, re-snapshot.
- `common/controller/filesystemDirectories.ts`: `getTermUploadsBasePath`,
  `getTermUploadsPath`, `getTermUploadPath` after the group trio (path
  `uploads/tag-term/<slug>/uploads/<file>`).

**C2 — Registry, maintenance, readers, join.**

- `editor/controller/contentTypes.ts`: append `tagTermContentConfig` last.
  Pins: `revalidateDerived.test.ts:108-123` append
  `"aggregate:tag-terms:tree", "item:tag-terms"`;
  `derivedPaths.test.ts:130-151` append `"/taxonomies/tag/index",
"/taxonomies/tag/pagination", "/taxonomies/tag/aggregates"`.
- New `editor/controller/actions/tagTerms.ts` (`"use server"`):
  `rebuildTermIndex()` = `rebuildIndex({config: tagTermContentConfig,
contentDirectory})` + `revalidateDerivedState([tagTermContentConfig,
featuredRecipeContentConfig])`, mirroring `actions/groups.ts:168-199`;
  the maintenance page gains a fourth form "Reload Term Database". No
  `successConfigs` entry (nothing writes `tag-terms` through curation in
  24c; leave a comment there naming the future entry's
  `dependentItemBasePaths`).
- New `common/controller/data/readTagTerms.ts` (module scope): `export const
tagTermReads = {items: createCachedItemRead<TagTerm, TagTermIndexValue,
TagTermEntryKey>({config: tagTermContentConfig}), tree:
createCachedAggregateRead({config: tagTermContentConfig, aggregateConfig:
termTreeAggregate()})}` (typed `TermTree`). Mock by that export name (T14).
- New `common/controller/tagVocabulary.ts` (pure, no Next imports):
  `mergeTagVocabulary({recipeTerms, groupTerms, tree})` → sorted-by-slug
  `{slug, label, count}[]` (recipe label, then group label, **record label
  overrides both**; counts summed; tree-only slugs at count 0);
  `breadcrumbOf(tree, slug)` root-first walking `parent` with a visited set;
  `childrenOf(tree, slug, counts)` in `children` order with counts;
  `applyPinned(items, pinned?)` pinned slugs first in pinned order, only
  those present, the rest in existing order; `TermPageData {slug, label,
description?, image?, breadcrumb, children, recipes, groups}`.
- New `common/controller/data/readTermPage.ts`: `readTagVocabulary()` (three
  cached reads) and `resolveTermPage(slug): Promise<TermPageData | null>`
  (both `byTerm`s, tree, `tagTermReads.items.read(slug)`; `null` when no
  carrier **and** no record; label = record ?? recipe fold ?? group fold ??
  slug; recipes = `applyPinned(recipeItems, record?.pinned)`).

**C3 — Tag routes and page.**

- `TagPage/routes.tsx`: `tagIndexRoute` → `readTagVocabulary()`; `tagRoute`
  → `resolveTermPage`, `notFound()` on `null`; new `generateTagMetadata`
  (`{title: label, description?}`); `generateTagStaticParams` = by-term keys
  ∪ tree keys, `_` placeholder kept (T10). Both `[tag]/page.tsx` files add
  `export const generateMetadata = generateTagMetadata`.
- `TagPage/shared.tsx`: `TagPage` takes `TermPageData`; extract
  `TermPageBody` (heading = label; `TermImage` when `image`; description as
  Markdown via the renderer the group detail page uses; breadcrumb links to
  `/tags/<slug>`; children as `Badge` chips with counts, same markup as
  `TagIndexPage`; `RecipeList` (already pinned-ordered); then the groups
  section as today). `TagIndexPage` unchanged (count-0 rows render as-is;
  "Holiday 0" is expected).
- New `common/components/TermImage/index.tsx`: twin of `GroupImage` with
  `src: /uploads/tag-term/<slug>/uploads/<image>` and `getTermUploadPath`.
- Editor-only: the term page gets a "Feature" link to
  `/featured-recipe/new?term=<slug>` (no edit button — no form in 24c).
  Requires the `?term=` preselection in the new page (mirrors `?group=`).

**C4 — `feature {term}`.**

- `curation/errors.ts`: `"unknown_term"` code, `UnknownTermError(terms:
string[])` (no force hint), `CurationErrorDetails.terms?`, `ErrorObject`
  `terms?`, `toErrorObject` spread; `curation/http.ts:54` `unknown_term` in
  the 422 group; `cli/backend/http.ts:117` `rehydrate` copies `terms`. Pin:
  `test/curationHttp.test.ts:40-66` `unknown_term: 422`.
- `curation/schema.ts`: `FeaturedInputSchema` gains `term:
z.string().min(1).optional()`, refine `[recipe, group,
term].filter(Boolean).length === 1`, message "Name exactly one of `recipe`,
  `group` or `term`".
- `curation/featured.ts`: `FeaturedRow.term?`, `FeaturedWriteResult.term?`;
  `listFeatured` name `recipeName ?? groupName ?? termLabel`, spread `term`;
  `requireTarget` third branch reading `tagTermContentConfig` via
  `readContentFileOrNull` → `UnknownTermError([slug])`; `feature` spreads
  `term`, commits `Feature term: <slug>`. Allow-list: add
  `tagTermContentConfig` (T15).
- CLI `cli/commands/featured.ts`: `--term`, usage `(--recipe s | --group s |
--term s)`, exactly-one check, `format` and list `tags` gain `term`;
  `cli/index.ts:129` usage. MCP `feature` title/description name the three;
  the schema follows.
- Strip and cards: `Homepage/route.tsx` filter adds `|| entry.termLabel`,
  map adds `{kind: "term", slug, label, image?, date}`; `FeaturedStrip.tsx`
  union + branch; new `List/FeaturedRecipe/TermCard.tsx` (GroupCard's
  silhouette, link `/tags/<slug>`, `TermImage` else
  `GroupThumbnailPlaceholder`, no kind badge, `testId="featured-term-card"`,
  "Term not found" when nameless); `List/FeaturedRecipe/index.tsx` `term`
  branch before the group one; the hero stays recipes-only.
- Detail: `FeaturedRecipeDetailPage/index.tsx` third variant `{kind: "term",
term: TermPageData}` rendering `TermPageBody` + an "Open term" link; editor
  and export `featured-recipe/[slug]/page.tsx` add the `term` branch
  (`resolveTermPage`, `notFound()` on null) in body and `generateMetadata`.
- Form: `Form/FeaturedRecipe/index.tsx` `FeatureTarget` gains `"term"`, seed
  order term > group > recipe, third `ToggleGroupItem value="term"`, branch
  renders a `TextInput name="term"` (no picker);
  `parseFeaturedRecipeFormData.ts` `term` trimmed through `tagSlug`, refine
  count-of-three, message "Choose a recipe, a group or a term";
  `featuredRecipeFormState.ts` `term?`; `actions/featuredRecipes.ts` spreads
  `term`; `featured-recipe/new/page.tsx` + `form.tsx` accept `?term=`.

**C5 — Fixture seed, ignore rule, tests, docs.**

- `editor/.gitignore`: `/playwright/fixtures/test-content/*/taxonomies/` +
  `!/playwright/fixtures/test-content/christmas-cookies/taxonomies/` (the
  `groups/` pair's shape; T18).
- Seed (own commit, T6): hand-write
  `christmas-cookies/taxonomies/tag/data/{dessert,cookies,holiday}/term.json`
  — `dessert` root `{label: "Dessert", date, description}`; `cookies`
  `{label: "Cookies", date, parent: "dessert", description, pinned:
["apricot-linzer-cookies", "chocolate-hazelnut-linzer-cookies",
"linzer-cookies"]}` (the reverse of date order so the reorder is visible);
  `holiday` root, record-only (no carriers). `christmas` stays record-less
  (the hybrid control). Distinct epoch-ms dates. Then `mkdir -p
…/christmas-cookies/taxonomies/tag/index` and run `pnpm tsx
scripts/build-fixture-indexes.ts` (editor) — creates `index/` and
  `aggregates/tree/`; every fixture's `featured-recipes/pagination` churns
  from the v3 bump. Commit all fixture files together, separately from code.
- Unit tests: new `test/tagTerms.test.ts` — (a) the pure join rules (record
  label wins, zero-count record-only slug, pinned reorder ignoring absent
  slugs, breadcrumb root-first with a cycle guard, children with counts);
  (b) engine in a tmpdir (harness from `test/featured.test.ts:57-84`):
  `createContent` a term, `feature(ctx, {term})` borrows
  `termLabel`/`termImage`, renaming the term via `updateContent` rewrites
  the feature's data-file `term` and index `termLabel` (term → featured
  edge, T8 pattern), `unknown_term` with `details.terms`, two-of-three
  refused; (c) a tripwire that `vi.resetModules()` then imports
  `recipeTagTaxonomy` and `groupTagTaxonomy` **first** (guards T17 for 24d).
  `test/featured.test.ts` term cases beside the group ones.
  `test/exportStaticParams.test.ts`: mock `readTagTerms` (`tagTermReads:
{items: {read: vi.fn()}, tree: {read}}`, default `null`), new case "a
  tree-only slug is emitted". Pins in C1/C2/C4.
- Playwright: `tag-pages.spec.ts` second `describe` on
  `resetData("christmas-cookies")`: `/tags/cookies` heading "Cookies"
  (record beats fold), description visible, breadcrumb "Dessert", first
  three cards in pinned order; `/tags/dessert` shows a "Cookies 8" child
  chip; `/tags/holiday` is 200 with the empty state; `/tags` lists
  "Holiday 0". `featured-recipes.spec.ts`: sign in, `/featured-recipe/new`,
  "Term" toggle, fill "cookies", submit → `featured-term-card` "Cookies"
  linking `/tags/cookies`; hero unchanged.
- Docs: `incremental-regeneration.md` §11.2 one line (term records adopted
  by the recipe site; no engine change).

#### Steps (Opus implementer, in order)

1. C1 → C2 → C3 → C4 in order (each compiles before the next); C5's ignore
   rule, tests and doc line with the code. Commit code as one or more
   `24c:` commits.
2. Seed the fixture (hand-written `term.json`s, `mkdir index`, the
   regenerate script) and commit **all** fixture churn separately (T6):
   `24c: seed term records`.
3. Gates below; report verbatim, plus the before/after check that an
   untouched fixture's `featured-recipes/index` values are byte-identical
   apart from the pagination reprojection.

#### Tests

Listed in C5. Behavioural gates: `tag-pages.spec.ts` (existing counts + the
new `christmas-cookies` describe), `featured-recipes.spec.ts` (+ the term
case), `api-write.spec.ts` (the featured schema with the third key),
`groups.spec.ts` (unchanged).

#### Gates (in `.claude/worktrees/agent-24c`)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                      # 583 at base + new cases
pnpm exec lint-staged --diff main         # via a script file (T12)
pnpm --filter recipe-editor e2e-dev -- tag-pages.spec.ts featured-recipes.spec.ts api-write.spec.ts groups.spec.ts   # setsid nohup (T12)
git status --porcelain websites/recipe-website/editor/playwright/fixtures   # clean after the suite except the seeded fixture
```

The stdout-purity grep from 23b is unchanged by this phase (the CLI gains a
flag, no new output path).

#### Risks → mitigations

- **Import-order TDZ (T17).** Any value import from a taxonomy module that
  reaches a content config throws on the first taxonomy-first import. The
  tripwire test in `tagTerms.test.ts` imports the two taxonomy modules first
  after `vi.resetModules()`.
- **Byte drift in featured index values.** `termLabel: undefined` written
  by an unconditional assignment would change stored objects for every
  existing feature; spread only when set, and diff one untouched fixture's
  `featured-recipes/index` before and after.
- **Fixture directories the suite creates (T18).** The first `/tags` render
  on any fixture creates `taxonomies/tag/aggregates/tree/`; without the
  ignore pair every Playwright run dirties fourteen fixtures. The ignore
  rule lands with the code, the carve-out with the seed.
- **`readTagTerms` at module scope under the `next/cache` stub (T14).**
  `exportStaticParams.test.ts` must mock the new reader module by path
  before importing the routes.
- **Pinned slugs that are not carriers.** Ignored at render (`applyPinned`
  keeps only slugs present in the carrier list); 24e's `term_update`
  validates on write.
- **`christmas-cookies` replay tests.** `test/christmasCookies.test.ts` and
  `test/mcp.test.ts` copy the fixture; the seeded `taxonomies/` tree rides
  along and must not change any pinned `GroupRow`/`featured_list` row (the
  seed adds no feature).

#### Not in 24c

Any `term_*` seat/CLI/API/MCP (24e); a browser form for term records
(backlog); search (`tag:` expansion, `/search/terms`,
`SearchContext.allTags` — 24d; a record-only term does not appear in browse
chips until then, T11); `Group.kind` narrowing (24e); skill prose; the real
repo's reindex and its hand-written `.gitignore` lines
(`/taxonomies/tag/{index,pagination,aggregates}`) — the user's after 24c
lands.

#### Verification

- `pnpm exec vitest run` green; `specVersions` shows featured `["1","3"]`;
  `revalidateDerived` and `derivedPaths` recipe pins extended by exactly the
  term type's entries; `test/tagTerms.test.ts` green including the term →
  featured rename case and the import-order tripwire; `/tags/cookies` on
  `christmas-cookies` renders "Cookies", the description, the "Dessert"
  breadcrumb and the pinned order; `/tags/holiday` renders with no carriers;
  `/tags/nope` 404s; a term feature renders on the homepage strip and its
  detail page; `recipes feature --term cookies` and MCP `feature {term}`
  succeed, `--term ghost` is `unknown_term` 422; draft PR against `main`
  with CI green; close-out below; memory updated.

## Verification (epic-level)

- 24a: ✅ `test/taxonomies.test.ts` green (36 cases); demo
  `aggregates.spec.ts` green with the cloud assertions unchanged (the
  recorded-changes assertions moved for the `count` trade, D1); the T8
  verdict recorded in the phase close-out.
- 24b: recipe `/tags` and `/tags/[tag]` render from the taxonomy aggregates
  with byte-identical HTML for the same fixture; a group with tags appears on
  `/tags/<slug>`; portfolio's `/tags` exists; `specVersions` snapshots show
  the v1 → v2 bumps; D5 recorded.
- 24c: a term record with `parent` renders breadcrumb + children on its page;
  `feature {term}` renders a homepage card; `christmas-cookies` fixture
  carries term records.
- 24d: `tag:christmas-cookies` in the browser and via `recipe_search` returns
  the same set including linzer descendants; `group:<parent>` from the server
  matches the browser; one "all terms" list feeds rail, autocomplete, ⌘K.
- 24e: the fixture acceptance test (D7) is green over the in-memory client;
  the skill v3 pre-approval list is pinned.
- 24f: the story runs **for real** by the user via `/recipe-curator` against
  the real content repo after the vocabulary backfill (☐ theirs), then push
  from `/git`; the by-term record size is written down against T9.

## Deferred

- **F32 array references** — still reserved; group cards borrowing member
  thumbnails, `items[].recipe` renames.
- **`aliases` on term records** — `mergeTerm` covers the need in v1.
- **Per-term pagination (F8b / 24g)** — only if 24f's measurement exceeds
  150 KB.
- **Batched multi-carrier commit** (possible F34) — `term_assign` over N
  carriers is N commits.
- **`appearsInAggregate` over the inverted primitive** — re-expressible,
  not worth the churn until something else touches it.
- **Portfolio backfill**; **ranking**; a group picker in the browser form.
- **Read-side spec guard in `readAggregate`** (24b finding, T5) — return
  `null` when the stored spec hash differs from the config's, so a stale
  record reads as never-folded instead of as the old shape. Engine change,
  own F-row when picked up; until then `reindex` after any version bump.

## Key files to read first (implementers)

- `packages/cms/content/types.ts` — `ContentTypeConfig`, `ReferenceSpec`.
- `packages/cms/aggregates/{types,updateAggregates,readAggregate}.ts`,
  `aggregates/next/{cachedReads,tags}.ts` — the aggregate kind.
- `packages/cms/content/{references,updateDependents}.ts` — borrowed fields
  and the dependent rewrite (the T8 edge).
- `packages/cms/content/next/revalidateDerived.ts`,
  `packages/cms/content/derivedPaths.ts` — the two seams and the ignore
  writer.
- `packages/cms/demo/lib/{notes,noteAggregates,noteAggregateReads,contentTypes}.ts`,
  `packages/cms/demo/app/notes/tags/page.tsx`,
  `packages/cms/demo/playwright/tests/aggregates.spec.ts` — what 24a
  replaces.
- `test/{aggregates,specVersions,revalidateDerived,derivedPaths}.test.ts` —
  the pins.
- `websites/recipe-website/common/controller/aggregateConfigs.ts`,
  `packages/component-library/lib/normalizeTags.ts` — the site-side shape
  24a's folds must be able to replace at 24b (read-only in 24a).
- `packages/cms/docs/incremental-regeneration.md` §10, §11.1 (F8b), §11.4.
