# Universal taxonomy for `@discontent/cms` — "tags that know what they mean"

> **This is the durable source of truth for the epic-24 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the full
> picture by reading this file. **Read this file first** before planning any
> `24x` phase: the plan file that seeded it is gone. Update the roadmap
> **Status** column, each phase's decision checkboxes, and the **Next PR** line
> at every phase boundary. Each phase is a stacked PR and gets its own
> plan-mode pass seeded from this doc (see _How a phase is run_). **24a is
> closed out (2026-09-16, draft PR #143); 24b is next and starts by deciding
> D5.** The previous
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
image?}>` from the term index alone; a visited set makes the fold terminate
  on a hand-edited cycle.

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

### D5 — Groups after taxonomy — **OPEN, decide in 24b's plan-mode**

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

- [ ] Decided at 24b: option \_\_\_, because \_\_\_.

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
`unknown_term` 404, `term_cycle` 409, `term_in_use` 409. `FeaturedInputSchema`
exactly-one-of `recipe | group | term`; `GitTypeSchema` + `"term"`. Backend
×2, API `/api/taxonomies/[taxonomy]/…`, CLI `recipes term …`, MCP `term_list,
term_get, term_create, term_update, term_delete, term_rename, term_merge,
term_assign` (28 → 36), `feature {term}`, `tag_list` extended **additively**;
regex → `^(recipe|group|git|tag|featured|term)_[a-z_]+$`; settings + skill v3
pre-approve all but `term_delete`, `term_merge`.

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
- **Versions**: `tags` / `by-tag` v1 → v2 at 24b (a stale spec hash reads
  `null` until the next write or `reindex`); the groups index value gains
  `tags` → `reindex groups`; featured `by-date` v2 → v3 at 24c; editor
  restart at 24c (new registry entry). Real repo: one `reindex` after 24b and
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
5. **T5 — Nothing self-heals on read.** `readAggregate` returns `null` for a
   never-folded or stale-spec record. After a config lands, fixtures are
   regenerated by script (`build-fixture-indexes.ts` for recipes,
   `generate-fixtures` for the demo) and the real repo gets a `reindex`.
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

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR      | Branch (← parent)                    | Status  | Scope                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **24a** | `agent/24a-taxonomy-engine` ← `main` | ✅ done | This doc; D1 + D2 primitives in `packages/cms/taxonomies/`; `aggregatesOf` at the two seats; demo notes adopt (terms + by-term); demo term type + the self-reference proof (T8); `incremental-regeneration.md` §10 F33 + §11; epic-23 housekeeping docs (M) |
| 24b     | `agent/24b-taxonomy-adopt` ← 24a     | 🟡 next | Recipes → taxonomy (delete the pair, keep names, v2), readers, groups gain `tags` (types, index value, schemas, form, seat), portfolio declares + routes, `/tags` unions; all 15 recipe fixtures regenerated; **D5 decided here** (M–L)                     |
| 24c     | `agent/24c-term-records` ← 24b       | ⏸️      | `tagTermContentConfig` in the registry, tree read + label override, term page metadata / breadcrumb / children, `feature {term}` (featured v3), `christmas-cookies` seed gains term records (L)                                                             |
| 24d     | `agent/24d-taxonomy-search` ← 24c    | ⏸️      | Resolver, `/search/terms`, one "all terms" source, hierarchical autocomplete / ⌘K, server descendant expansion + `group:` parity (L)                                                                                                                        |
| 24e     | `agent/24e-term-seats` ← 24d         | ⏸️      | Seats / CLI / API / MCP / skill v3 + the fixture acceptance test (D7) (L)                                                                                                                                                                                   |
| 24f     | `agent/24f-taxonomy-closeout` ← 24e  | ⏸️      | Backfill on the real repo (content task), the real story run, by-term measurement, backlog strikes, close-out, memory (S code / L content)                                                                                                                  |
| 24g     | conditional                          | ⏸️      | F8b partitions, only if 24f's by-term number exceeds 150 KB (L)                                                                                                                                                                                             |

**Next PR: 24b** — `agent/24b-taxonomy-adopt` stacked on
`agent/24a-taxonomy-engine` (draft PR #143; retarget to `main` after #143
merges, 22-T20). Start its plan-mode session from **D4 and D5**, and decide
**D5 first** — the answer changes what `Group` gains (only `tags`, or also a
narrowed `kind`) and what the recipe `/tags` route unions. Then: recipes
declare `recipeTagTaxonomy` (`name: "tag"`, `field: "tags"`, `version: "2"`,
`project` = today's `RecipeListEntry` projection) and delete `recipeTags` /
`recipesByTag`; readers move to `createCachedTaxonomyReads`; groups gain
`tags` (T7); portfolio declares + routes; all 15 recipe fixtures regenerated
in their own commit (T6). Facts to validate first: the recipe `TagPage`
reader's shape (`recipes` → `items`), `getAllTags()` callers, the
`group_update` patch schema, and the 24a close-out below (the `count` trade,
the third seat).

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

**Follow-ups filed:** none new beyond Deferred. F33's §10 row is **Done**
(573 vitest); §11.1 carries the "what 24a built" paragraph and the verdict.

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
