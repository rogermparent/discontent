# Epic 32 — Term follow-ups, F34 batched commits, the by-term split, plan scale, an unattended run

> **This is the durable source of truth for the epic-32 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching deletes that
> move features (`curation/terms.ts` `deleteTerm`, `curation/groups.ts`
> `deleteGroup`), the term image seat, batched term commits
> (`withBatchCommit`, `packages/cms/content/*` `commit: false`), the by-term
> aggregate (`packages/cms/taxonomies/`), ingredient completion in search,
> meal-plan item `scale`, the Make page (`common/components/MakePage/`,
> `makeable.ts`, `ingredientNames.ts`), `SidebarLayout`'s sticky chrome, or
> term aliases.
> Update the roadmap **Status** column and the **Now** line at every phase
> boundary. Earlier epics are cited by number with a prefix (`24-D6`,
> `31-T5`). `agent-taxonomy.md` (epic 24) and `agent-epic-31.md` are the
> design behind 32b–32e and 32i: read `24-D1`–`24-D9`, `24-T1`–`24-T19` and
> `31-D2` first.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** epic 32 is **closed** (2026-10-10). Every code phase merged
(#197–#207); 32-close adds the results, the end-to-end checks on a scratch
clone, a path-traversal fix found while checking slugs, the backlog and the
**morning checklist for Roger** (in "Close-out" below; order matters). 32k
waits for Roger's go.

## Context

Epic 31 closed on 2026-10-10 with nothing in flight, and Roger wants a few
hours of autonomous work. Scouting the backlog, `agent-epic-31.md` Deferred and
the code turned up one real engine trigger and a set of curation and UI items
that need no further product calls:

- **The F8b trigger has fired.** A jq simulation of the real repo puts the
  by-term record at **~197 KB** (threshold ~150 KB, F28 §12.13). The cause is
  the 208 drinks × 5–6 tags. Every write folds and hashes the whole record, at
  1.6–2× the normal cost.
- Five deferred term items, the remaining backlog rows, and some hygiene.

**Out of scope, because they need Roger's judgment:** the 24f real-repo
vocabulary backfill (facet roots, one-off drink tags, "house", `easy` vs
`quick`), the real Christmas-Cookies story run, all content calls, deploys and
content pushes. **The real content repo is never written** this epic;
measurements use a scratch clone.

Roger's decisions (2026-10-10): delete re-points the feature to the parent,
else unfeatures it (terms and groups); term image = full parity; plan items get
a multiplier with a public `?scale`; aliases are search-only, last and
droppable.

## Decisions

### D1 — A delete moves the feature: to the parent, else unfeatures it

Decided with Roger. Deleting a term whose record has a `parent` re-points every
feature of that term at the parent; deleting a term with no parent unfeatures
them. Deleting a group unfeatures its features. Supersedes 31c's "a feature of
the deleted term is left dangling".

### D2 — Term image parity

Decided with Roger. A term picture takes everything a recipe picture takes: a
URL, an uploaded file, or a clear — on the seat, the browser form, the API, the
CLI and MCP.

### D3 — F34 partial failure: commit what was written, then rethrow

When a batched multi-carrier write fails part-way, the paths written so far are
committed as `<message> (partial)` and the error is rethrown. The tree stays
clean, so `git_revert` works on the partial commit.

### D4 — `scale` is a multiplier string; `?scale` is public

Decided with Roger. A meal-plan item's `scale` is a `fraction.js`-parseable
string (`"2"`, `"1/2"`, `"1.5"`), validated on write. `?scale=` on a recipe page
is public and works in the static export.

### D5 — Aliases are search-only; `term_merge` records the old slug

Decided with Roger. An alias makes search, autocomplete and `/tags/<alias>`
reach the canonical term. Nothing is canonicalised at write time. `term_merge`
appends the merged-away slug to `into`'s aliases. This phase is last and
droppable.

### D6 — The 24e/24f backfill and the story run stay Roger's

The real-repo vocabulary backfill (24f) and the real Christmas-Cookies story run
are not done here. 32e's measurement uses a scratch clone and writes nothing to
the real repo.

### D7 — Autonomy and merge rules

Each phase is its own PR off a fresh `origin/main`, opened **ready** by its
worker and merged by the orchestrator under the standing grant: all 12 checks
green and the state CLEAN, `gh pr merge <n> --merge --delete-branch`, merge
commits, never `--admin`, never a push to `main`, never a force-push. **No
deploys and no content pushes**; both are Roger's. Stop rules are in "How it
runs".

### D8 — Make page: type-agnostic by code (32j); food tags are content (32k, Roger's)

Decided with Roger. 32j makes the Make page work for any kind of recipe on
whatever tags exist — a kind switch, refine chips that drill down without a
hierarchy, looser ingredient matching, a type-agnostic default query. Tagging
the food corpus is a content call: 32k, run only on Roger's explicit go.

## Roadmap

| Phase    | Scope                                                                    | Size    | Branch                     | Status            |
| -------- | ------------------------------------------------------------------------ | ------- | -------------------------- | ----------------- |
| 32-plan  | Epic doc + CLAUDE.md line, backlog marks                                 | docs    | `agent/32-plan`            | ✅ #197           |
| 32a      | Hygiene                                                                  | S       | `agent/32a-hygiene`        | ✅ #198           |
| 32b      | Features follow a deleted term/group                                     | S–M     | `agent/32b-delete-feature` | ✅ #200           |
| 32c      | Term image upload, full parity                                           | M–L     | `agent/32c-term-image`     | ✅ #203           |
| 32d      | F34 batched commits for term assign/rename/merge                         | M–L     | `agent/32d-batch-commit`   | ✅ #205           |
| 32e      | 24g: measure, then split the by-term record                              | L       | `agent/32e-by-term`        | ✅ #204           |
| 32f      | Ingredient completion in search                                          | S–M     | `agent/32f-ingredient-ac`  | ✅ #199           |
| 32g      | Meal-plan item `scale` + `?scale` on recipe pages                        | M       | `agent/32g-plan-scale`     | ✅ #202           |
| 32j      | Make anything: kind switch, refine drill-down, loose ingredient matching | M–L     | `agent/32j-make-any`       | ✅ #206           |
| 32h      | `SidebarLayout` + portfolio masthead on sticky-chrome                    | S       | `agent/32h-sticky-sidebar` | ✅ #201           |
| 32i      | Term aliases, search-only (droppable)                                    | L       | `agent/32i-aliases`        | ✅ #207           |
| 32k      | Food vocabulary for the corpus (content; Roger's go needed)              | content | —                          | ⏸️ awaiting Roger |
| 32-close | Results, backlog strikes, morning checklist, memory                      | docs    | `agent/32-close`           | 🟡 #208           |

**Order.** Strictly sequential, in the table's order: 32-plan → 32a → 32b → 32c
→ 32d → 32e → 32f → 32g → 32j → 32h → 32i → 32-close. 32j was added by Roger
after the plan and runs after 32g; 32h and 32i stay last and are the phases
dropped if time runs out (32i first, then 32h). 32k is content: it waits for
Roger's go (D8) and is not part of the unattended sequence.

## Phase detail

### 32a — Hygiene (S)

- Drop `TaxonomyConfig.terms` and the now-unused import from
  `packages/cms/taxonomies/types.ts:126-134` (`24-T17`). Fix the comments in
  `common/controller/tagTermContentConfig.ts:16-24`,
  `test/tagTerms.test.ts:421`, `incremental-regeneration.md:1854` and
  `agent-taxonomy.md`. Keep the import-order tripwire test.
- Remove `unix-dgram` from `onlyBuiltDependencies` in `pnpm-workspace.yaml` (or
  add it to `ignoredBuiltDependencies`), which silences the CI `gyp ERR!`. The
  lockfile stays valid. Strike `backlog.md:86-90`.
- Stale comment: `common/controller/types.ts:322` ("F32 follow-up") → renames
  shipped in 31d.
- Stale corpus numbers in the docs: "437 recipes" → 665.

**Gate:** typechecks, vitest. CI is the install check.

### 32b — Features follow a deleted term or group (S–M)

Per D1.

- `deleteTerm` (`editor/controller/curation/terms.ts:1246-1280`) finds features
  with `term === slug`:
  - if the record has a `parent`, it re-points them with `repointFeatures`
    (`terms.ts:1186-1235`);
  - otherwise it unfeatures them with `featured.ts` `unfeature` (`:301`).
- `TermDeleteResult` (`:236-245`) gains `featured`/`unfeatured`.
- Fix the gap in `repointFeatures`: if `into` is already featured, the
  duplicate is unfeatured (keep one), per `31-D2`. This also fixes `mergeTerm`.
- `group_delete` (`curation/groups.ts:701-721`) unfeatures its features.
- Update the MCP descriptions (`mcp/registry.ts:731-733` + group delete), the
  CLI delete text (`cli/commands/term.ts`, `group.ts`), the skill's SKILL.md
  wording, and the `deleteTerm` docblock.

**Tests:** `test/terms.test.ts` `describe("deleteTerm")` (feature harness
`:387-416`), `test/featured.test.ts`, the groups tests.

**Playwright:** `featured-recipes`, `term-edit`.

### 32c — Term image upload, full parity (M–L)

Per D2.

- **Seat:** a term image seat modelled on `curation/recipeImage.ts`
  `setRecipeImage` (`:55-131`), taking `{url}|{file}|{clear}`, with
  `checkImageFile` / `readImageFile` from `controller/imageImport.ts` (`:307`,
  `:337`). Either generalise `recipeImage.ts` over a content config or add
  `termImage.ts`; prefer generalising if it stays readable.
- `createTerm`/`updateTerm` take an optional non-schema `{imageFile?: File}`; a
  file beats a URL.
- **Form:**
  - `termForm.ts` `TermFormSchema` gets `image: z.instanceof(File)`, with
    0-byte files dropped.
  - `FIELD_OF_PATH` maps `image`.
  - `common/components/Form/Term/index.tsx` drops `allowFile={false}`.
- **Transports:**
  - a multipart route
    `editor/src/app/api/taxonomies/[taxonomy]/[slug]/image/route.ts`, shaped
    like `api/recipe/[slug]/image/route.ts`;
  - CLI `recipes term image <slug> --file|--url|--clear`
    (`cli/commands/term.ts`, `cli/backend/{local,http,types}.ts`);
  - MCP `term_set_image` in `mcp/registry.ts`.
- **Tool lists:** `TOOL_NAMES` 46 → 47; `.claude/settings.json` and the skill's
  `allowed-tools` go 34 → 35 pre-approved (non-destructive); update
  `curatorSkill.test.ts`, CLAUDE.md's count (34 → 35) and this doc.

**Tests:** `test/termForm.test.ts`, `test/terms.test.ts`,
`test/imageImport.test.ts`, `test/mcp.test.ts`, `test/cliJson.test.ts`,
`test/curatorSkill.test.ts`.

**Playwright:** `term-edit.spec.ts` gains a `setInputFiles` case (pattern:
`groups.spec.ts`).

### 32d — F34: one commit per multi-carrier term write (M–L)

Per D3.

- **Engine**
  (`packages/cms/content/{types,createContent,updateContent,deleteContent}.ts`):
  an opt-in `commit: false` option, with the result returning the touched
  paths. Default behaviour stays byte-identical.
- **Curation:** a `withBatchCommit(ctx, message, fn)` helper that collects paths
  from `updateRecipe`/`updateGroup`/`writeTermRecord`/`deleteTermRecord`/
  `repointFeatures` and makes one `commitContentChanges`
  (`packages/cms/git/commit.ts:51-60`) at the end.
  - `onWrite` stays per write.
  - D3: on an error it commits the paths written so far as
    `<message> (partial)` and rethrows.
- **Apply to:** `assignTerm`, `renameTerm`, `mergeTerm`, and
  `deleteTerm --unassign`. Message shape: `Assign term: cookies (+5 recipes)`.
- **Wording:** "one commit each" in the MCP `INSTRUCTIONS` (`registry.ts:309`),
  the term tool descriptions, SKILL.md L250/L267, `examples.md`, and
  `agent-taxonomy.md` Deferred.

**Tests:** `test/curationGit.test.ts` (asserts `commits[0].files`,
`:184-196`): one commit for an N-carrier assign, rename and merge; a partial
case. Also `mcp.test.ts` / `curatorSkill.test.ts` if wording is pinned.

**Playwright:** `git.spec.ts`, `api-write.spec.ts`.

### 32e — 24g: measure, then split the by-term record (L, conditional)

1. **Measure first.**
   - Make a scratch clone of `/home/roger/Projects/recipe-content` into the
     worker's scratch dir (`git clone`, read-only on the original).
   - Reindex the clone with `main`'s CLI (`--content-dir`).
   - Run `editor/scripts/measure-engine-scale.ts` `reportByTag()` with
     `CONTENT_DIRECTORY=<clone>`.
   - Record the bytes and fold time in this doc. If the number is **under
     150 KB**, record it, strike 24g as not needed, and stop the phase (a docs
     PR only).
2. **If it is over:** a design section in this doc first, as the phase's first
   commit.
   - Per-term records, so a write folds and hashes only the terms it touches
     and invalidates only those tag pages' cache tags. This is F8b's intent,
     applied to the aggregate (record keyed by term) rather than to pagination
     partitions. The worker validates which shape fits
     `packages/cms/taxonomies/` (byTerm aggregate, `finalize`, `hashValue`,
     `readAggregate`) against §12.13 and F33.
   - Bump the versions; regenerate fixtures in their own commit (`31-T6`'s
     fixture rule). A real-repo reindex is needed after the merge (the
     morning checklist).
3. **Re-measure** on the clone: bytes per term record, fold time for a
   one-recipe name edit. Before/after go in this doc and in
   `incremental-regeneration.md` (F8b row, §12.13 note).

**Tests:** `test/taxonomies.test.ts`, `test/tagTerms.test.ts`,
`test/specVersions.test.ts`, engine tests in `packages/cms`.

**Playwright:** `tag-pages`, `search-tags`; demo `aggregates.spec.ts`;
portfolio tag routes.

#### 32e measurement (step 1, 2026-10-10)

Scratch clone of `recipe-content` at `6532d71`, reindexed with `main`'s CLI
(`recipes --content-dir <clone> reindex`, 676 ms), then
`measure-engine-scale.ts` on a fresh `cp -a` of it per run. A new `TARGET=<slug>`
knob points the edit scenarios at a tagged recipe; the default target (a
featured recipe) carries no tags, so its `name-edit` moved nothing.

- **The by-tag record is 200,805 B** (200,901 B after the measured name edit):
  172 tags, the largest `drink` with 208 recipes, 19 tags over `perPage`
  (`drink` 208, `shaken` 77, `sour` 62, `highball` 60, `vodka` 40). **Over the
  150 KB threshold, so 24g goes ahead.**
- **Aggregate fold, no-op floor:** 22.6 / 24.3 ms (min of 7, two runs). F28
  had 4.4 ms at 436 recipes with two tags in the corpus.
- **One `name-edit` on `amaretto-sour-acouplecooks`** (six tags): the fold
  took 35.5 / 36.9 ms and reported `moved: by-tag`. That rewrites the whole
  200 KB record and fires the one tag behind every tag page: 172 term pages
  plus `/tags`, for one recipe's six.
- **Where the floor goes** (a throwaway profile, min of 7): the content-index
  walk is 4.4 ms; each of the two taxonomy folds is about 7.7 ms, nearly all of
  it `termsOf` normalising and slugging every tag, done once per fold; and
  `hashValue` over the by-tag value is 4.6 ms (stringify 4.1). Reading the
  stored 200 KB record back is 0.7 ms.

#### 32e design (step 2)

**A keyed aggregate: one record per key, in the same environment.** This is
F8b's intent (bounded work and bounded invalidation per partition) applied to
the aggregate kind, where F8b itself was about pagination partitions. It is not
a pagination index per term: a term page is unpaginated, and nothing reads one
term's items by page.

- **`AggregateConfig.keyed?: true`.** `finalize` must return a plain object.
  The pass stores each key's value as its own record, hashes each one, and
  reports which keys moved. `byTermAggregate` declares it, so recipes, groups,
  portfolio projects and the demo notes all get it with no site edit.
- **Layout** in `<type>/aggregates/<name>/`:
  - `[0]` is the header: an ordinary `AggregateRecord` whose `value` is
    `{keys: n}`. Its `hash` is the hash of the per-key hashes and its
    `specHash` is the usual one. Small, so a one-term read checks the spec for
    free.
  - `[1, key]` holds one key's value: `{label, items}` for a term.
  - `[2]` holds `Record<key, hash>`, read only by the writer to diff.
- **The write** stays one walk, because the terms aggregate and every declared
  aggregate need it, and the kind trusts nothing it stored (§11.1). After the
  walk, a keyed aggregate hashes each key's value, compares the hashes with
  `[2]`, and in **one transaction** writes the keys that moved, removes the
  keys that vanished, and rewrites `[2]` and the header. A spec change clears
  the environment and writes everything. A pass that moved nothing writes
  nothing, as before.
- **`AggregateUpdateResult.keys`**, present only on a keyed aggregate: the
  keys that moved (added, changed or removed). `changed` keeps its meaning
  (any key moved).
- **Cache tags** follow pagination's shape. `aggregate:<type>:<name>` stays the
  catch-all; every cached read of the aggregate carries it, and only the
  repair seat fires it, so `derivedTagsOf` does not change.
  `…:whole` is on the whole-value read, and `…:key:<key>` on one key's read.
  `revalidateAggregateResults` fires `whole` and each moved key for a keyed
  result, and `value` for any other. So a name edit on the amaretto sour
  invalidates six term pages and `/tags`, not 173 pages.
- **Reads.**
  - `readAggregate` still returns the whole value for a keyed aggregate. It
    is assembled from `[1, *]`, so every whole-value caller keeps working.
  - New: `readAggregateKey(options, key)`, and `readTaxonomyByTermEntry` on
    top of it.
  - `createCachedAggregateRead` gains `readKey(key)`, one `unstable_cache`
    wrapper per key. (Corrected at review: the wrapper is built inside
    `React.cache` and kept nowhere, as `cachedItemRead.ts` does. It is not
    kept in a map the way pagination's `readPage` keeps its wrappers.)
    `createCachedTaxonomyReads().byTerm` therefore has `read()` (whole) and
    `readKey(slug)`.
- **Readers move to the narrow read where they can.**
  - `resolveTermPage` reads the term's two entries with `readKey` and takes
    its breadcrumb and child counts from the two `terms` values (9.5 KB, which
    `/tags` already reads). A term's `count` is its row length by
    construction, since both folds see the same walk and the same
    first-label rule.
  - `readTermPageSlugs` and portfolio's `generateTagStaticParams` take their
    slugs from `terms` too.
  - Portfolio's `tagRoute` uses `readKey`.
  - `readTagTree` (`/tags`) keeps the whole read, because it needs every term's
    carriers for distinct subtree totals. It is one page under `…:whole`.
  - The demo reads only `terms`. Search reads `terms` and the tree, never
    by-term.
- **Fold cost.** `termsOf` is memoised per index value and taxonomy (a
  `WeakMap` on the value object the walk hands both folds), so the two folds
  slug each carrier's tags once between them rather than once each.
- **Versions.** `TAXONOMY_FOLD_VERSION` goes `"1"` → `"2"`. The by-term layout
  moved, and the memo edits the pinned fold module. `keyed` also enters
  `computeAggregateSpecHash` (only when set, so no other aggregate's hash
  moves). Until a reindex, a by-tag environment in the old layout reads as
  `null`, never computed (24-T5), never as a wrong value. The site taxonomy
  versions stay where they are: the engine half covers it. (Correction from
  step 3: no index-version stamp exists to force a rebuild, because 29b's was
  deferred. The reindex below is a manual step.)
- **Fixtures** (T6) are regenerated in their own commit with the
  `build-fixture-indexes.ts` scripts. (Correction: there are two, recipe and
  portfolio. The demo commits no indexes.)
- **Morning checklist: the real repo needs a `reindex` after this merges**,
  and the Pi gets one on its next deploy. Until then both taxonomy values read
  `null`: `/tags` is empty and a term page without a record 404s, as after
  24b. The first recipe or group write also heals its own type, because a spec
  change rewrites everything.

#### 32e re-measurement (step 3)

The same clone, reindexed with this branch's CLI, and the same script with
`TARGET=amaretto-sour-acouplecooks`:

| by-tag on the real corpus (665)      | before                            | after                                                    |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------- |
| stored as                            | one record, 200,805 B             | 172 records: max 38,272 B (`drink`), median 298, min 181 |
| a six-tag `name-edit` writes         | the whole record, 200,901 B       | its 6 terms, 75 KB, plus 14 KB of hashes                 |
| …and reports / expires               | `by-tag`: 172 tag pages + `/tags` | `by-tag[6]`: 6 tag pages + `/tags`                       |
| fold, no-op floor (script, min of 7) | 22.6 / 24.3 ms                    | 17.4 / 20.9 ms                                           |
| aggregate pass, no-op (A/B)          | 21.9 / 25.0 ms                    | 15.9 / 18.3 ms                                           |
| aggregate pass, the name edit (A/B)  | 24.6 / 25.8 ms                    | 17.7 / 18.0 ms                                           |
| full `reindex` (CLI, min / median)   | 646 / 655 ms                      | 624 / 639 ms                                             |

The A/B rows: `main`'s engine (extracted with `git archive`) and this branch's,
run interleaved on fresh copies of the clone at load 4.5–4.6. Each run toggled
the recipe's `name` 21 times and timed `updateAggregates` alone; the figure is
the minimum, from two runs each.

- **Most of the time saved is the `termsOf` memo.** The no-op pass writes
  nothing in either engine, and it dropped about 6 ms. The store's own cost,
  the edit pass minus the no-op, is 0–3 ms either way, because hashing every
  term's value is still the same bytes.
- **The split buys bytes and invalidation.** 89 KB written instead of 201 KB,
  6 term pages expired instead of 172, and a term page decodes one record
  (298 B at the median) instead of 200 KB.
- **The reindex did not slow down**: the 172 records go in one transaction.

### 32f — Ingredient completion in search (S–M)

- `common/components/SearchForm/QueryAutocomplete.tsx` `optionsFor`
  (`:130-150`), keeping the `:138-143` comment's rationale in mind:
  - when the caret is in an `ingredient:` value, enable the existing
    `["recipe-ingredients"]` query (`SearchContext.tsx:536-548`);
  - show a "Loading ingredients…" row, then complete from `suggestNames()`
    (`common/util/makeable.ts:402-423`), as `MakePage/index.tsx:130-149` does.
- No new route (client-side option a).
- Check that `suggestNames`' staple-skipping still makes sense for food. If
  not, add an option rather than changing the Make page's behaviour.

**Tests:** `test/queryLanguage.test.ts`, `test/makeable.test.ts`.

**Playwright:** `search-autocomplete.spec.ts` gains an `ingredient:` case.

### 32g — Meal-plan item `scale` (M)

Per D4.

- Optional `scale?: string` (a `fraction.js`-parseable value, validated) on:
  - `WithItemText` / `GroupItem` (`common/controller/types.ts:309-342`);
  - `GroupItemObjectSchema` (`curation/schema.ts:204-214`), the string form
    `slug:label@2` in `toGroupItems` (`:586-612`);
  - `addItem` (`curation/groups.ts:641-667`), the MCP `group_add_item`
    (`registry.ts:833-852`), the CLI `--scale` and its output
    (`cli/commands/group.ts`);
  - the backends and the `POST /api/group/[slug]/items` route;
  - the form row (`common/components/Form/Group/index.tsx:229-275`) and
    `parseGroupFormData.ts`.
- **Not** on `GroupEntryItem`, so there is no index or fixture change (like
  `note`).
- **Page:** `GroupItems.tsx` shows a "2×" badge and links to
  `/recipe/<slug>?scale=2`.
- **Recipe page:** `MultiplierProvider`
  (`common/components/View/Multiplier/Provider.tsx`) seeds from `?scale` on the
  client via `useSearchParams` inside Suspense; this works in the static
  export. Pattern: MakePage.

**Tests:** `test/{groups,curation,mcp,cliJson,curationHttp}.test.ts`.

**Playwright:** `groups.spec.ts`, `yield.spec.ts`, plus a `?scale` case.

### 32j — Make anything: drill-down for every kind, loose ingredient matching (M–L)

Added 2026-10-10 at Roger's request: "the 'what can I make' page [should be]
even more type-agnostic … pick different top level tags and drill down … the
'what I have's [should] match similar ingredient lines … find any kind of
recipe, dinner or drink."

**Findings (scouted on `main` 75080cc6):**

- The page has been scope-agnostic since 28g (#176):
  - `FIRST_VISIT_QUERY = ""` (`common/components/MakePage/index.tsx:43`);
  - root chips come from `rootsInScope` (`MakePage/tagTree.ts:84`), with their
    children from `childrenInScope`;
  - 31b made `tag:<parent>` cover a parent's whole subtree (`scope.ts:35`).
- It still _looks_ drinks-only for three reasons:
  1. In the real corpus, **444 of the 457 non-drink recipes have no tags at
     all** (665 recipes; the top 22 tags are all drink tags; food's best are
     `vegetarian`, `quick` and `american` at 6 each).
  2. The only hierarchy is `drink`, so drilling down exists only for drinks.
  3. The page remembers the last scope, which for Roger was `tag:drink`.
- The drinks default survives in `DEFAULT_MAKE_QUERY = "tag:drink"`
  (`common/util/makeable.ts:26`). It is used by CLI `inventory make`, MCP
  `inventory_makeable` (`mcp/registry.ts:1021`) and `/api/inventory/make`.
- Matching (`satisfies`, `makeable.ts:103`) has these gaps:
  - Both sides go through `toName` (`common/util/ingredientNames.ts:410`).
  - `SYNONYMS` (:313) knows only soda and tonic, with no food synonyms.
  - `DESCRIPTIVE` (:209) drops prep words, but not trailing phrases without a
    comma: "onion cut into wedges" → `onion cut into wedge`.
  - There is no tolerance for typos or near-plurals.
  - Staples (:374) are only water and ice, so every dinner recipe is blocked
    on salt and pepper.

**Code (this phase), all in `common/`:**

1. **Drill down without a hierarchy.**
   - After a pick, show "Refine" chips: the tags that co-occur most in the
     current scope. Exclude picked tags and their ancestors, and exclude tags
     carried by (nearly) every recipe in scope. Cap at ~12.
   - A tag with tree children shows the children first, then the
     co-occurring tags.
   - Pure function in `tagTree.ts` (e.g. `refinementsInScope`), tested in
     `test/makeTags.test.ts`.
2. **A kind switch.**
   - A small segmented control above the chips: Anything / Food / Drinks.
   - It maps to a site-level list, e.g. `MAKE_KINDS` in `common/` (Drinks =
     `tag:drink`, Food = `-tag:drink`, Anything = ``). It is composed with
the tag picks in `?q=` through the existing query language.
   - Check the query language supports a negated tag in scope; it should,
     since `positiveTagValues` implies negatives exist. If not, add it there,
     with tests in `test/queryLanguage.test.ts`.
   - No engine change; the list is site config, not hardcoded in `packages/`.
3. **Looser matching** (`ingredientNames.ts`, `makeable.ts`):
   - Strip trailing prep phrases on the line side: "cut into …", "for
     serving", "to taste", "plus more …", "divided", "at room temperature",
     "softened", "melted", "peeled and …", "or more". An "A or B" line gives
     both as aliases.
   - Add a food `SYNONYMS` set: scallion / green onion / spring onion,
     cilantro / fresh coriander, garbanzo / chickpea, confectioners' /
     powdered / icing sugar, zucchini / courgette, eggplant / aubergine,
     heavy cream / heavy whipping cream / double cream, ground beef /
     hamburger, bell pepper / sweet pepper, and a few more obvious pairs. Keep
     it data, tested.
   - Add a **close-match tier.** When the strict rules fail, a line whose head
     noun matches an inventory item's head, or is within edit distance 1 for
     words of 5+ letters (typos, odd plurals), counts as "close".
     - `analyzeMakeable` reports it separately.
     - The page shows it ("close: you have _onion_ for _shallot_…" style, or
       a "≈" marker on the line).
     - A toggle, default **on**, counts close matches as had.
     - Don't change existing strict results; the drinks tests must keep
       passing. The no-alcohol guard and `GENERIC_HEADS` still apply to close
       matches; "juice" never stands for "lime juice".
   - Add **food staples:** salt, black pepper, water and ice count as always
     on hand. Better is an "Assume I always have" editable list in the
     inventory panel, kept in the browser beside the list, defaulting to
     those four. `suggestNames` keeps skipping staples.
4. **The default goes type-agnostic.**
   - `DEFAULT_MAKE_QUERY` → `""` (every recipe) for the CLI, MCP and API;
     `--query tag:drink` still narrows.
   - Update the MCP description, the CLI help, the skill's SKILL.md "what can
     I make?" wording, and `curatorSkill.test.ts` / `mcp.test.ts` where
     pinned.
5. **Wording audit.** The page, inventory panel and empty states lose
   bar-only words ("bottles", "bar") where they mean "what I have".
6. **Remembered scope:** leave it as is, but make the kind switch and the
   chips obvious enough that a remembered `tag:drink` reads as a choice.

**Not in this phase:** tagging the food corpus. That's a content call (see
32k / Roger's decision); this phase must make the page work on whatever tags
exist.

- **Tests:** `test/makeable.test.ts` (prep phrases, synonyms, close tier,
  onion / green onion / shallot, staples), `test/ingredientNames.test.ts`,
  `test/makeTags.test.ts` (refinements), `test/queryLanguage.test.ts` if
  touched, `test/inventory.test.ts`, `test/mcp.test.ts`,
  `test/cliJson.test.ts`, `test/curatorSkill.test.ts`.
- **Playwright:** `make.spec.ts`.
  - Add a few _food_ recipes, tagged and untagged, to the make fixture, or a
    sibling `make-food/` fixture.
  - New cases: the kind switch, refine chips drilling down on a tag without
    children, a close match counted and shown, salt/pepper staples.

### 32h — `SidebarLayout` on sticky-chrome (S)

- Portfolio's masthead
  (`websites/portfolio/common/components/AppLayout/index.tsx:41`) moves from
  `sticky top-0` → `.sticky-chrome` (auto). It gets the short-viewport release,
  which is a deliberate behaviour change.
- `packages/component-library/components/SidebarLayout/index.tsx:89-95` →
  `.sticky-chrome top-[var(--sticky-chrome-offset)]`; update its comment.
- Re-check portfolio `Index/index.tsx:108`'s offset and recipe
  `View/Ingredients/index.tsx:114`.
- Tick `ui-overhaul.md:2016` and strike the backlog row.

**Playwright:** recipe `sticky-chrome`, `settings-nav`; portfolio `chrome`,
`settings`, `visual`. Baselines should not move; if they do, investigate before
updating.

### 32i — Term aliases, search-only (L, droppable)

Per D5.

- **Record:** `aliases?: string[]` on `TagTerm`
  (`common/controller/types.ts:172`).
- **Input:** `TermInputSchema`/`TermPatchSchema` (`curation/schema.ts:352-382`).
  Validation: an alias may not slug to another term or to another term's alias.
- **Merge:** `mergeTerm` (`terms.ts:1086`) appends the old slug as an alias of
  `into`.
- **Index:** carried through `tagTermContentConfig.ts` `buildIndexValue`, and
  the tree aggregate (`packages/cms/taxonomies/tree.ts:67-74`) gets
  `TermTreeNode.aliases` with a version bump. Alternatively a site aggregate,
  if the engine change is awkward.
- **Search:** `buildTagExpansion` `bySpelling`
  (`common/controller/tagExpansion.ts:39-50`),
  `editor/controller/curation/tagResolver.ts`, `readSearchTerms`
  (`readTermPage.ts:107-133`), `tagOptions` (`tagVocabulary.ts:256-284`),
  autocomplete (`SearchContext.tsx:453-465`, `QueryAutocomplete.tsx:88`).
  Typing an alias offers the canonical term.
- **Routes:** `/tags/<alias>` redirects to the term.
- **Tools:** term form ChipsInput, CLI `--alias`, MCP term_create/update text,
  `getTerm` output.
- **Not included:** no write-time canonicalisation (D5).

**Tests:** `tagExpansion`, `queryLanguage`, `curation`, `terms`, `termForm`,
`taxonomies`, `specVersions`, `cliJson`, `mcp`.

**Playwright:** `search-tags`, `search-autocomplete`, `term-edit`, `tag-pages`.

### 32k — Food vocabulary for the corpus (content; Roger's go needed)

Per D8. 444 of the 457 food (non-drink) recipes have no tags at all, so 32j's
drill-down has nothing to drill into for food until the corpus is tagged.

- **Proposed:** a course/kind root — e.g. `main`, `side`, `dessert`,
  `breakfast`, `bread`, `soup`, `snack`, `sauce`, `baked-goods` — created as
  term records and applied by the recipe-curator workflow (`term_create`, then
  `term_assign`).
- **It writes the real content repo**, so it runs **only on Roger's explicit
  go**. Without it, the phase is a proposal built from a scratch clone (the
  vocabulary and a per-recipe assignment list for Roger to review), and nothing
  is written to `/home/roger/Projects/recipe-content`.
- Like 24f's backfill (D6), the vocabulary choices are Roger's.

### 32-close

Done: the Results entry "32-close" and the "Close-out" section at the end
(e2e checks, deferred notes, the morning checklist as run).

- Results table (PR, merge sha, gates) and the 32e measurement.
- Strike the backlog rows.
- **Morning checklist for Roger:**
  - pull main in the main checkout;
  - `pnpm workstation update`;
  - real-repo reindex if 32e or 32i bumped a spec;
  - `pnpm deploy:pi`;
  - look at `/tags/<slug>/edit` image upload, a scaled plan, ingredient
    autocomplete and aliases.
- Update the memory files (`epic-32.md`, MEMORY.md, `orchestrator-role.md`).
  The orchestrator writes memory itself.

## How it runs

The orchestrator is the root session, on `main`. It **never edits the main
checkout**: the workstation service (`recipe-workstation.service`) runs from
it.

**Per phase, strictly sequential:**

1. Spawn one worker: `Agent` (general-purpose, `model: "opus"`,
   `isolation: "worktree"`, background). Its prompt contains:
   - this phase's section of this doc, the D-list, and the traps;
   - the key files from the phase section;
   - the setup and gates from "Worker contract".
2. The worker implements, runs the gates, commits, pushes `agent/32x-…`, opens
   a **ready** PR against `main`, and reports the PR number. It never merges.
3. The orchestrator waits for CI with
   `~/.claude/projects/-home-roger-Projects-content-engine/orchestrator/wait-pr.sh`.
   It runs in the background and is backed by a 20-minute ScheduleWakeup. On a
   failure, `ci-fail.sh` pulls the log and the excerpt goes to the worker via
   SendMessage. Shards that failed for infrastructure reasons are rerun.
4. Review. A diff of S size the orchestrator reads itself; for M/L, a
   general-purpose review agent reads `gh pr diff` against the phase section
   and reports blocking findings only. Fixes go back to the worker.
5. Merge when all 12 checks are green and the state is CLEAN:
   `gh pr merge <n> --merge --delete-branch`. Sequential phases branch from a
   fresh `origin/main`, so no update-branch dance is needed.
6. Next phase.

**Stop rules:**

- A phase that is still red after two fix rounds is closed (PR left open as a
  draft), recorded here, and skipped. Later phases continue only if they don't
  depend on it.
- If the machine is under memory pressure (MemAvailable < 6 GB for long), local
  Playwright is skipped and CI's four Recipe shards are the gate.
- The trailing phases (32i, then 32h) are the ones dropped if time runs out.

### Worker contract (every code phase)

- **Setup:** copy `websites/recipe-website/editor/.env.local` and
  `websites/recipe-website/export/next-env.d.ts` from the main checkout. Copy
  the editor `.env.local` to `websites/portfolio/editor/.env.local` too, for
  portfolio specs.
- **Gates:**
  - `pnpm --filter recipe-editor typecheck`
  - `pnpm --filter recipe-website exec tsc --noEmit`
  - `pnpm exec vitest run`
  - the phase's targeted Playwright specs with `PLAYWRIGHT_BUILD=1`, through
    `orchestrator/heavy-pw.sh <worktree> <log-name> <spec…>` (the heavy slot).
    If the slot is held for more than 15 min, say so and rely on CI.
- **Before commit:** run prettier on the changed files (pre-commit runs
  `prettier --check`). A comment-only edit to a spec'd module means
  `vitest run -u test/specVersions.test.ts`.
- **Docs:** update the phase's roadmap row and its Results entry here in the
  same PR. Never touch `editor/content`.
- **Commit trailer:**
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **PR body:** ends with the Claude Code line.

## Shared-machine rules

Other sessions run on the same machine.

- **Every heavy step takes Archilyzer's machine-wide slot**, one wrap per step
  (each `next build`, each Playwright run, each export build, the full
  `vitest run`). `orchestrator/heavy-pw.sh` wraps Playwright; anything else:

  ```
  HEAVY_LOCK_FILE=/home/roger/Projects/yt-dlp-transcript-browser/.git/heavy-queue.lock \
    node /home/roger/Projects/yt-dlp-transcript-browser/scripts/queue-lock.mjs --heavy -- <cmd…>
  ```

  It waits for the slot, then for **MemAvailable ≥ 6000 MB**; "waiting for the
  heavy slot" is normal. Never set `HEAVY=0`.

- **Local e2e is build+start only**: `PLAYWRIGHT_BUILD=1`, port 3019, under
  `setsid nohup` (which `heavy-pw.sh` does).
- **Never edit the main checkout** (`/home/roger/Projects/content-engine`): the
  workstation editor runs from it. Work happens in worktrees under
  `.claude/worktrees/`.
- **Never write the real content repo** `/home/roger/Projects/recipe-content`
  (and never `editor/content`, the symlink to it). 32e and 32-close read it
  only, through a scratch `git clone`. **Baseline: clean at `6532d71`**; at
  32-close `git -C /home/roger/Projects/recipe-content status` must be
  unchanged from that (or from wherever the workstation sync moved it), with
  no commits by this epic.
- **Never touch :3001** — another project's live editor.
- **Sandbox:** git from script files, the Edit tool for exact edits, no
  heredocs or loops that name git twice.

## Verification

Per phase:

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
<heavy slot> pnpm exec vitest run
orchestrator/heavy-pw.sh <worktree> <log> <specs…>   # PLAYWRIGHT_BUILD=1, port 3019
```

Then CI: all 12 checks green and the state CLEAN before merge. Then a review
against the phase section.

**End to end at 32-close,** on a scratch clone of the real repo (reindexed with
`main`'s CLI, never the real repo):

- `recipes term delete` on a featured child term → the feature re-points to the
  parent;
- `recipes term image <slug> --file <png>` → one commit;
- `recipes term assign cookies --add a b c` → **one** commit of 4 files;
- `recipes group add <plan> <recipe> --scale 2` → `group get` shows it;
- `recipes search 'tag:<alias>'` finds the term's carriers;
- the by-term record size from 32e.

`git -C /home/roger/Projects/recipe-content status` is unchanged from the start
(clean at `6532d71`, or wherever the workstation moved it). No commits by this
epic.

## Risks and traps known up front

- **T1 — The taxonomy traps still hold.** `24-T1` (lmdb `open` creates — also
  `30-T1`), `24-T5` (featured spec bumps need a reindex), `24-T8` (a term is
  never its own parent), `24-T14` (`generateStaticParams` keeps the `_`
  placeholder for mocks), `24-T15`–`24-T18` (no value import from a taxonomy
  module reaches a content config; 32a removes `TaxonomyConfig.terms` but keeps
  the import-order tripwire).
- **T2 — The real content repo is read-only this epic.** The workstation sync
  pushes any commit there to the Pi within seconds (`31-T5`), so a stray write
  would not stay local. Measurements and end-to-end checks use a scratch clone.
- **T3 — A worktree's MCP server points at the worktree** (`23-T11`), so
  checks against a clone use the CLI with `--content-dir`.
- **T4 — The shared heavy slot is the bottleneck** (`31-T6`). If it is held
  more than 15 min, the worker says so and CI's four Recipe shards are the
  gate.
- **T5 — Background watchers are reaped under memory pressure** (`31-T7`).
  If `wait-pr.sh` is stopped, poll with one-off status calls.
- **T6 — Spec bumps need fixtures and a reindex.** 32e (and 32i, if it bumps
  the tree aggregate) regenerate fixtures in their own commit, and the real
  repo needs a reindex after the merge (the morning checklist).
- **T7 — Playwright habits.** Spec args are a regex; use
  `getByLabel(..., {exact: true})`; give featured entries explicit slugs (the
  T26 flake); never `pkill -f` your own pattern; after a killed run,
  `rm -rf test-content test-settings test-remotes test-clones` from
  `websites/recipe-website/editor`.
- **T8 — A comment-only edit to a spec'd module moves its hash.** Run
  `vitest run -u test/specVersions.test.ts`.

## Results

Per phase: PR, merge sha (`gh pr view <n> --json mergeCommit`) and gates.
Every phase merged under D7 (all 12 checks green, state CLEAN). Merge order
differs from the table's at one spot: 32d (#205) merged before 32e (#204).
The 32e measurement is in its phase detail and summarised in "Close-out", with
the end-to-end checks.

| Phase    | PR   | Merge      | Gates                                                                                                                                                                                                                                                    |
| -------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 32-plan  | #197 | `dafc6834` | docs only; CI 12/12                                                                                                                                                                                                                                      |
| 32a      | #198 | `d414c2f6` | typechecks ✅; vitest 1040/1040 (56 files); `pnpm install --frozen-lockfile` ✅; no Playwright (per plan); CI 12/12                                                                                                                                      |
| 32b      | #200 | `2cbb35f2` | typechecks ✅; vitest 1048/1048 (56 files); Playwright `featured-recipes` + `term-edit` 55/55 (build); CI 12/12                                                                                                                                          |
| 32c      | #203 | `74adba98` | typechecks ✅; vitest 1074/1074 (56 files); Playwright `term-edit` + `api-write` 29/29 (build); CI 12/12                                                                                                                                                 |
| 32d      | #205 | `1946716c` | typechecks ✅; vitest 1094/1094 (56 files); Playwright `git` + `api-write` not run locally (heavy slot held > 15 min), CI shards are the gate; CI 12/12                                                                                                  |
| 32e      | #204 | `afc9d3df` | typechecks ✅ (recipe, export, portfolio, demo); vitest 1105/1105 (56 files) after the review fixes; Playwright not run locally (slot held > 15 min) — CI; CI 12/12                                                                                      |
| 32f      | #199 | `4216441b` | typechecks ✅; vitest 1050/1050 (56 files); `search-autocomplete.spec` 13/13 (build+start); CI 12/12                                                                                                                                                     |
| 32h      | #201 | `65de06a7` | typechecks ✅ (recipe, export, portfolio); vitest 1058/1058; Playwright recipe 20/20 (build), portfolio 22/22 (dev — see entry); CI 12/12                                                                                                                |
| 32g      | #202 | `1cd36fa9` | typechecks ✅; vitest 1068/1068 (56 files); Playwright `groups` + `yield` + `recipe` 47/47 (build); export `next build` ✅; CI 12/12                                                                                                                     |
| 32j      | #206 | `78d62b32` | typechecks ✅; vitest 1148/1148 (56 files); Playwright not a local gate (see entry) — CI's Recipe shards; CI 12/12                                                                                                                                       |
| 32i      | #207 | `e246733f` | typechecks ✅ (recipe, export, portfolio, demo); vitest 1193/1193 (56 files, after merging 32j); Playwright `search-tags` + `search-autocomplete` + `term-edit` + `tag-pages` 43/43, then `make` + `search-tags` 31/31 after the merge (build); CI 12/12 |
| 32-close | #208 |            | typechecks ✅; vitest 1217/1217 (57 files); e2e on a scratch clone 7/7 (see Close-out); Playwright `path-traversal` + `api-write` + `groups` 62/62 (build); CI                                                                                           |

### 32a — Hygiene

- **`TaxonomyConfig.terms` is gone** (`24-T17`), with its
  `AnyContentTypeConfig` import. Nothing read it. The import-order tripwire in
  `test/tagTerms.test.ts` is unchanged apart from its comment. Comments in
  `tagTermContentConfig.ts`, `incremental-regeneration.md` (F33) and
  `agent-taxonomy.md` (D2 snippet, T17, 24c results, follow-ups) now say the
  field was dropped here.
- **`unix-dgram` moved to `ignoredBuiltDependencies`** rather than just being
  removed from `onlyBuiltDependencies`. An explicit ignore keeps pnpm from
  listing it under "ignored builds" on every install. It is an optional native
  dependency of `hot-shots` (through `@netlify/build`), and nothing here loads
  it. The lockfile records neither list, so it stays valid:
  `pnpm install --frozen-lockfile` passes, and reinstalling the package from
  scratch leaves it unbuilt (no `build/`). CI's Playwright image is the real
  check for the missing `gyp ERR!`.
- **The stale F32 comments** in `common/controller/types.ts` (the `GroupItem`
  docblock, plus the same claim on `groupName`) now say that renames follow
  since 31d, deletes dangle, and array edges borrow nothing (`31-D1`).
- **Corpus numbers.** `agent-curation.md`'s intro now reads "437 recipes at
  the time of writing, now 665". The 24a by-term size risk gains the current
  figure: a jq simulation of the real repo at 665 recipes put it at ≈ 197 KB
  (> 150 KB), driven by the 208 drinks × 5–6 tags; 32e measures it. The
  "two tags in total" sentences are historical and stay as written.
- `specVersions` didn't move: none of the edited modules is pinned.

### 32b — Features follow a deleted term or group

**What changed.**

- `curation/featured.ts`: `findAllFeatured` (every entry of a target, newest
  first — the index's default order, which `findFeatured` always had; it is
  now `findAllFeatured(…)[0]`) and `unfeatureTarget` (unfeature each, one
  commit each, return the slugs).
- `deleteTerm`: after the children move up, the term's features are
  re-pointed at its parent with `repointFeatures`, or unfeatured when it has
  no parent. Both happen before the record is deleted, so a failure part-way
  leaves the record and whatever still names it intact. `TermDeleteResult`
  gains `featured` and `unfeatured`.
- `repointFeatures` dedupes (31-D2): when `into` is already featured, `from`'s
  entries are unfeatured and `into`'s own entry stays. `TermMergeResult` gains
  `unfeatured`, so `mergeTerm` is fixed too. It now finds entries through
  `findAllFeatured`.
- `curation/groups.ts` `deleteGroup` unfeatures the group after deleting it,
  returning the new `GroupDeleteResult` (`unfeatured`). The CLI backends'
  `deleteGroup` type follows.
- **The browser group delete** (`actions/groups.ts`) now goes through the
  curation seat with `curationContextFor`, then makes the same `/groups`
  redirect. Before, it was the generic delete, which would have left the
  browser and `group_delete` disagreeing about D1. The confirm dialog says a
  featured group comes off the strip. `featured-recipes.spec`'s "deleting the
  group leaves a 'Group not found' card" became "deleting the group unfeatures
  it".
- Wording: the MCP `term_delete` / `term_merge` / `group_delete`
  descriptions, the CLI `term delete` / `group delete` confirm prompts and
  their text output (`re-pointed features:` / `unfeatured:`), `term merge`'s
  output, the `deleteTerm` / `mergeTerm` docblocks, and SKILL.md's "Held back"
  section (the only place it can name those tools). No test pinned the old
  wording.

**Decisions.**

- **Keep one, the target's.** When the parent (or the merge target) is
  already featured, every entry of the deleted term goes and the target's own
  entry is untouched: no write to the entry that is already right. Two
  entries of a term re-pointed at an unfeatured parent stay two, because that
  duplicate was made on purpose (`again`).
- **A parent must still have a record.** `deleteTerm` checks the parent's
  record before re-pointing (a feature of a record-less term is the nameless
  card). In practice `assertParent` already guarantees this.
- **A carried-only term** has no features of its own (`feature` needs a
  record), so the unfeature branch only finds an entry left dangling by an
  older delete, and removes it.
- **Group: delete first, then unfeature**, so a failure part-way leaves at
  worst the dangling feature every delete used to leave. Recipe deletes are
  out of scope (D1 names terms and groups).

**Tests.** `terms.test.ts` `deleteTerm`: re-point to the parent, unfeature
with no parent (two entries), unfeature when the parent is already featured,
another term's feature left alone. `mergeTerm`: unfeature when the target is
already featured. `featured.test.ts`: `findAllFeatured` / `findFeatured` /
`unfeatureTarget` order and events, and group delete. `curation.test.ts`
groups: delete unfeatures, other features stay.

### 32c — Term image upload, full parity

**What changed.**

- **The seat.** `curation/recipeImage.ts` is generalised rather than copied:
  a private `setImage` over an `ImageTarget` (content config, commit noun,
  not-found message, path and URL helpers), and `setRecipeImage` /
  `setTermImage` are one line each. A recipe and a term record differ only
  there: both are keyed `[date, slug]` and keep the picture as an `image`
  upload. `setTermImage(ctx, slug, {url}|{file}|{clear})` commits
  `Update term image: <slug>`. Clearing a term with no picture commits
  nothing, and a term with carriers but no record is `not_found` ("…
  term_create writes one"). Result types: `ImageSeatInput` / `ImageSeatResult`,
  aliased as `RecipeImage*` (unchanged for callers) and `TermImage*`.
- **`createTerm` / `updateTerm`** take a third, non-schema argument
  `TermWriteOptions {imageFile?: File}`. `termImageFile` resolves the picture:
  the file, checked with `checkImageFile`, else the URL, fetched. A file
  beats a URL (which is then never downloaded) and, on an update, a clear,
  the same precedence as the recipe and group forms. A refused file is
  re-thrown as `validation` with one issue on `image` ("The image was
  refused"), so the form shows the reason next to the file input. Both seats
  now also return the 2 MB `largeImageWarning`, as group writes do.
- **The form.** `TermFormSchema.image` is `z.instanceof(File)`, with 0-byte
  files (an untouched input) turned into `undefined`. `submitTermForm` passes
  it to the seat as `{imageFile}`; the JSON patch and input never carry it.
  `FIELD_OF_PATH` maps `image` (beside `imageImportUrl`) to the picture.
  `Form/Term` drops `allowFile={false}`, so the term form now has the file
  input, the Image URL field and "Remove Image". `ImageInput` keeps the
  `allowFile` prop, but no caller turns it off any more.
- **Transports.**
  - `PUT /api/taxonomies/<taxonomy>/<slug>/image`: multipart `file`, or JSON
    `{url}` / `{clear: true}`. It is built like `api/recipe/[slug]/image`,
    plus `assertTaxonomy`, and uses `requireCurationContext`, so it needs a
    write-scoped token or a session.
  - CLI `recipes term image <slug> (--url | --file | --clear)`. The command
    is `cli/commands/term.ts` `termImage`; `setTermImage` is on the backend
    seam (`types` / `local` / `http`). The HTTP backend uploads `--file` as
    multipart, like `setRecipeImage`. `--help` lists the command.
  - MCP `term_set_image {slug, url | path | clear}`: the same schema and
    refinement as `recipe_set_image`, `WRITES` annotation, pre-approved.
- **Tool lists.** `TOOL_NAMES` 46 → 47. `.claude/settings.json` and the
  skill's `allowed-tools` go 34 → 35. CLAUDE.md now says 35. SKILL.md
  mentions `term_set_image` under "Fixing an image later" and in the CLI
  fallback mapping.

**Decisions.**

- **Generalise, don't copy.** The two seats would have been the same 80
  lines with four words changed. `ImageTarget` is about 10 lines, and each
  seat keeps its own name and docblock. The file keeps its name
  (`recipeImage.ts`), because earlier epics' docs point at it.
- **The form's file goes through `createTerm` / `updateTerm`, not
  `setTermImage`.** A submit with a new picture and a new label is one
  commit, as it is for a recipe or a group. `setTermImage` is the seat for
  the transports that change only the picture.
- **A file beats a clear** as well as a URL, matching
  `actions/index.ts` / `actions/groups.ts`. The term seat's
  `imageImportUrl: null` loses to a file in the same call.
- **`curatorSkill.test.ts` pins the counts** (47 tools, 35 pre-approved) and
  checks CLAUDE.md's "pre-approves its N" and "lists the same N" against them.
  Before, nothing checked that sentence.

**Tests.** `terms.test.ts` "term pictures (32c)" (6): `setTermImage` URL →
file → clear with write events, a no-op clear, the carried-only `not_found`,
a non-image, the empty choice; create with a file beating a URL (fetch never
called); update where a file beats a URL and a clear, then a URL, then null;
a refused upload filed under `image` with nothing written; the 2 MB warning.
`termForm.test.ts` (+4): the `image` issue mapping, the 0-byte drop and the
file kept out of the JSON, upload on create and edit (a file beating a typed
URL, with no fetch stub), clear with an untouched file input, a refused file
on the picture field. `imageImport.test.ts` (+3): `checkImageFile` /
`readImageFile`. `mcp.test.ts` (+1): `term_set_image` path → clear,
`not_found` before the record exists, two sources refused.
`cliJson.test.ts` (+1): `term image --file` → `--url` (local server) →
`--clear`, one commit each, with `Update term image: <slug>`, plus the
not-found and usage errors. `curatorSkill.test.ts` (+1): the counts.
Playwright: `term-edit.spec` (+1): `setInputFiles` on Cookies' edit form →
`term-image` on `/tags/cookies`, record intact → "Remove Image" clears it.
`api-write.spec` (+2): the route (404 with no record; 401 / 403 read token /
404 unknown taxonomy; URL → upload → the term page draws it with no reload →
400 for a non-image → clear) and `term image --file` over `--remote`.

### 32d — F34: one commit per multi-carrier term write

**What changed.**

- **Engine** (`packages/cms/content/`): `createContent`, `updateContent` and
  `deleteContent` take `commit?: boolean` (default `true`). With
  `commit: false` the write does everything but the git commit — files,
  index, pagination, aggregates, dependents — and its `ContentWriteResult`
  carries `touchedPaths`, the paths it would have staged (relative to the
  content directory; for a delete, the removed directories). Without it the
  call and the result are exactly what they were: no `touchedPaths` key, the
  same commit. F34 row in `incremental-regeneration.md`.
- **Curation** (`editor/controller/curation/batch.ts`):
  `withBatchCommit(ctx, message, fn)` runs `fn` with a derived context whose
  `batch` collects paths, then makes one `commitContentChanges` with the
  author and the deduplicated paths. `context.ts` gains `batch?:
CommitBatch`, `batchOptions(ctx)` (spreads `commit: false` inside a batch,
  nothing outside one) and `collectBatch(ctx, result)`. The writes that
  honour it are the ones the four seats reach: `updateRecipe`,
  `updateGroup`, `writeTermRecord`, `deleteTermRecord`, `repointFeatures`'
  feature update and `unfeature` (so `unfeatureTarget` too). `onWrite` still
  fires once per write, with that write's own result.
- **D3, the partial.** If `fn` throws, the paths collected so far are
  committed as `<message> (partial)` and the error is rethrown. The tree is
  clean afterwards, and `git_revert` of the partial undoes exactly what
  landed (tested). If that commit fails too, the seat's own error still
  wins; the writes are then uncommitted and `git_status` shows them.
- **Applied to** `assignTerm`, `renameTerm`, `mergeTerm` and `deleteTerm`.
  `deleteTerm` is batched whole, with or without `unassign`, because its
  child re-parents and feature moves were separate commits even without
  carriers.
- **Messages.** The tail lists the nonzero counts of what was written, so a
  seat that wrote only its record keeps the message it always had:
  - `Assign term: cookies (+5 recipes)`; `Unassign term: cookies (-2
recipes)` for a remove-only call; `Assign term: bread (+2 recipes, -1
recipe)` for both; `(+2 groups)` with `type: "group"`.
  - `Rename term: cookies → biscuits (2 recipes, 1 group)`, or the bare
    `Rename term: holiday → festive` when only the record moved (the old
    record commit's message, unchanged).
  - `Merge term: sweets → dessert (2 recipes, 1 child, 1 feature)`.
  - `Delete term: bread (2 recipes, 1 child, 1 feature)`, or the bare
    `Delete term: bread`.
  - A partial counts what landed before the failure:
    `Assign term: cookies (+1 recipe) (partial)`. The message is a thunk read
    at commit time, and the seats fill their result as each write lands
    (`retagAll` takes the accumulator), so the counts are right either way.
- **Wording.** The MCP `INSTRUCTIONS` ("…land as one commit per call — a
  failure part-way commits what was written as "… (partial)""), the
  `term_assign` / `term_rename` / `term_merge` / `term_delete` descriptions,
  SKILL.md (assign and rename, plus what to do with a partial — report the
  hash; `git_revert` stays held back), `examples.md`'s report step, the
  `terms.ts` module docblock and seat docblocks, and `agent-taxonomy.md`
  Deferred (F34 struck, done by 32d). No test pinned the old wording.

**Decisions.**

- **The batch rides the context**, not a module global: `{...ctx, batch}`
  is handed to the inner seats, so two requests in one editor process cannot
  share a batch, and a nested `withBatchCommit` joins the outer one.
- **`touchedPaths` only with `commit: false`.** Always returning it would
  have changed every default result, and existing `toEqual`s on results
  with it. The option is the only way to ask for the paths.
- **No paths, no commit.** `commitContentChanges` reads an empty path list
  as `./*`, so a batch that wrote nothing (an assign whose carriers already
  had the tag) skips the commit rather than sweeping the tree.
- **Limit of the partial.** It commits what each finished engine write
  reported. A throw _inside_ one engine write, after it wrote a file but
  before it returned, leaves that file uncommitted: the same as an
  unbatched write that fails that way, and outside D3's case (a seat that
  fails between writes).

**Tests.** `curationGit.test.ts` "batched term writes (F34)" (8): an assign
over 3 recipes (plus one unchanged) is one commit with 3 files and 3
`onWrite` events; add/remove counts, the `Unassign` shape, and no commit for
no-op or missing-only assigns; groups; a rename with a record, 2 recipes and
a group; a record-only rename keeps the bare message; a merge with carriers,
a child and a feature; a delete with `unassign`, a child and a feature; a
partial (a committed unparseable carrier mid-list → one `(partial)` commit
of the first carrier, clean tree, `SyntaxError` rethrown, then `gitRevert`
of it). "engine writes with commit: false (F34)" (2): create → rename →
delete without a commit, each returning its paths, and a default create's
result keys and commit unchanged. `api-write.spec` (+1, the git describe):
an assign over two recipes through the API is one commit with both files,
the tree is clean, and one revert untags both.

### 32e — 24g: the by-term record, measured and split

**Measured over the threshold:** 200,805 B on a scratch clone of the real repo
(172 tags, `drink` on 208). So 24g was built, as **F35, keyed aggregates**.
The measurement, the design and the re-measurement are in the phase section
above, and the engine side is in `incremental-regeneration.md` (§11.1 F35, the
F8b entry, the §12.13 F8b row and its note).

**What changed.**

- **Engine (`packages/cms/aggregates/`).**
  - `AggregateConfig.keyed`. A keyed value is stored as a header at `[0]`,
    one record per key at `[1, key]` and the per-key hashes at `[2]`. A write
    diffs the hashes and, in one transaction, writes the moved keys and
    removes the vanished ones.
  - `AggregateUpdateResult.keys` names the moved keys.
  - `readAggregate` reassembles a keyed value. `readAggregateKey` reads one
    key.
  - `createCachedAggregateRead().readKey(k)` builds one `unstable_cache`
    wrapper per key, tagged `aggregate:<type>:<name>:key:<k>`. The whole read
    is tagged `…:whole`, and both carry the plain tag, which only a repair
    fires.
  - `revalidateAggregateResults` fires `whole` and each moved key.
  - `keyed` joins `computeAggregateSpecHash`, but only when set.
- **Taxonomies.**
  - `byTermAggregate` is keyed.
  - `termsOf` is memoised per index value and declaration, so the two folds
    slug each carrier's tags once between them.
  - `TAXONOMY_FOLD_VERSION` went `"1"` → `"2"`.
  - New: `readTaxonomyByTermEntry`, and `byTerm.readKey(slug)` on
    `createCachedTaxonomyReads`.
- **Readers.**
  - `resolveTermPage` reads its two rows with `readKey` and its breadcrumb
    and child counts from the two term clouds, through
    `mergeTagVocabulary`.
  - `readTermPageSlugs` and portfolio's `generateTagStaticParams` take their
    slugs from the clouds.
  - Portfolio's `tagRoute` reads one row.
  - `readTagTree` (`/tags`) keeps the whole map: a distinct subtree total
    needs every term's carriers.
  - The demo reads only `terms`. Search reads `terms` and the tree, so
    neither moved.
- **`measure-engine-scale.ts`** gains `TARGET=<slug>`. Its by-tag report reads
  the keyed layout (whole bytes, per-term max/median/min, the header) and
  names the moved keys.
- **Fixtures** regenerated in their own commit: every recipe and portfolio
  fixture, 170 `.mdb` files. The demo commits no indexes.

**Decisions.**

- **The aggregate, not pagination.** F8b's own design partitions a
  pagination index, and no term page is paginated. What cost was the record:
  its bytes, its hash and its single cache tag. So the aggregate kind got the
  partition, and `partitionsOf` stays deferred on its own trigger.
- **The walk stays whole.** "A write folds and hashes only the terms it
  touches" would need the write's delta, and the aggregate kind deliberately
  re-folds and trusts nothing it stored (§11.1). The terms aggregate and the
  declared ones need the walk anyway. What is bounded is everything after the
  fold: the writes, the expiries and the reads. The walk got cheaper through
  the memo instead.
- **Hashes apart from the header.** A one-term read checks the spec against
  a header of about 200 bytes, not against 14 KB of hashes. The writer's diff
  never decodes a value it is not rewriting.
- **The plain tag became the catch-all**, as `pagination:<type>:<name>` is.
  `derivedTagsOf` and every repair seat are unchanged, and a write never
  fires it for a keyed aggregate.
- **Counts from the clouds.** On a term page they equal the old row-length
  counts by construction (one walk, the same first-label rule). The clouds
  are 9.5 KB, which `/tags` reads anyway. **The cost:** every term page now
  also depends on the two whole term clouds, which expire on any change to a
  count or a label (a carrier joining or leaving any term). A recipe gaining
  a tag therefore still expires every term page through
  `aggregate:recipes:tags`. What no longer does is the commoner write, a
  change only to a carrier's row (its name or image), which moves `by-tag`
  keys and never a count. Making counts per-term too, by keying the cloud,
  would remove that dependency; it is not done here.
- **The engine version, not the sites'.** One constant invalidates every
  site's taxonomy values (recipes, groups, projects, notes). `keyed` in the
  spec hash is a second guard against a layout mix-up. **The bump also
  invalidates the non-keyed `terms` clouds, deliberately** (review note).
  `keyed` alone would already have moved the by-term spec hash. But the
  memo edits the pinned fold module, the bump is the convention for that,
  and a reindex is required anyway, so keeping the clouds valid would save
  nothing on the morning checklist. It would only save the window before the
  reindex, in which a term page without a record 404s either way, because
  its rows read `null`.
- **Key wrappers are built per read, not kept** (review B2). An earlier
  revision kept a module-scope map of one `unstable_cache` wrapper per key,
  as pagination does per page. But `/tags/<slug>` is public on the Pi editor,
  so a crawler could grow that map without bound. `readKey` now builds its
  wrapper inside `React.cache` and keeps nothing, which is
  `cachedItemRead.ts`'s pattern. Per-request dedupe is unchanged, and the
  entries live in Next's incremental cache.
- **Diff inside the transaction; deletes from the records** (review B1). An
  earlier revision read the header and the hash map before
  `await db.transaction(...)`. lmdb-js runs the callback in a later batch,
  so two overlapping passes could diff against the same stale hashes. One
  adding `x` and one removing it could then leave a `[1, x]` record that no
  hash listed: a permanent ghost, because the header hash still matched and
  the early return stopped every later pass, a reindex included.
  - Now every read and the diff run inside the callback, which sees the
    write transaction; LMDB serialises those across processes.
  - The delete set is a key-only scan of the stored records minus the new
    keys, so any stray record is removed by the next pass, rebuild or not.
    A record the value has but the store lacks is restored the same way.
  - The early return requires the records to match, not just the header
    hash.
  - What remains is common to every aggregate: a pass that folded an older
    corpus can still store last, because no lock spans a whole pass. Its
    result is consistent, though, and the next pass corrects it.

**Tests.**

- `taxonomies.test.ts`: the five pass-result assertions gain `keys`. A new
  describe covers:
  - the stored layout;
  - only moved terms rewritten and reported (a `putSync` spy);
  - a vanished term removed and reported;
  - a no-op pass writing nothing (`updatedAt` held);
  - `readTaxonomyByTermEntry` for a hit, a miss and never-folded;
  - an old single-record layout reading `null`, then replaced;
  - `keyed` in the spec hash only when set;
  - a non-object keyed value refused, and a one-key read of an unkeyed
    aggregate refused;
  - the memo slugging once per tag;
  - (review B1) a planted stray key record removed and reported by the next
    pass with the header hash unchanged, a deleted key record restored, a
    stray cleared by `rebuildIndex`, and two overlapping passes leaving
    records and hashes in agreement, with the next pass converging.
- `cachedReadKeys.test.ts`: per-key wrappers, their keys and tags, and (review
  B2) no wrapper retained between reads.
- `revalidateContentWrite.test.ts`: `whole` plus moved keys fire, and nothing
  fires for an unmoved keyed aggregate.
- `exportStaticParams.test.ts`: the mocks feed `terms.read` from the same
  keysets.
- `specVersions`: the taxonomy fold module, version 1 → 2.

**Gates.**

- **Typechecks:** `recipe-editor` and `recipe-website` (export) pass, and so
  do `tsc --noEmit` in the portfolio editor and the CMS demo.
- **vitest, full suite, before merging `origin/main`:** 1073/1074. The one
  failure was `christmasCookies.test.ts` reading the stale fixture, and it
  passes after the fixture commit.
- **vitest, targeted, after the merge:** 210/210 across 11 files
  (`taxonomies`, `cachedReadKeys`, `revalidateContentWrite`,
  `exportStaticParams`, `christmasCookies`, `specVersions`, `groups`,
  `terms`, `tagTerms`, `aggregates`, `revalidateDerived`).
- **After the review fixes (B1, B2), full vitest in the heavy slot:**
  1105/1105 across 56 files. `origin/main` had not moved.
- **Playwright was not run locally.** `tag-pages`, `search-tags`,
  `recipe-tags-aggregate` and `term-edit` were queued through `heavy-pw.sh`
  and waited more than 20 minutes. The slot was held by 32j, itself waiting
  on MemAvailable at about 3.8 GB against the 6 GB floor. So CI is the gate:
  the four Recipe shards, "CMS demo" (`aggregates.spec`) and "Portfolio"
  (the tag routes).
- **The real-corpus checks** are in the phase section above.

**Morning checklist.** The real repo needs a `reindex` after this merges
(`pnpm recipes reindex`, or the editor's Maintenance → Rebuild). The Pi needs
one too, at its next deploy. Until then `/tags` is empty and record-less term
pages 404 (24-T5), or until the first recipe or group write heals that type.
Nothing triggers the rebuild automatically: the index-version stamp was 29b's,
and 29b is deferred.

### 32f — Ingredient completion in search

- **What it does.** With the caret in an `ingredient:` value,
  `useQueryAutocomplete` enables the shared `["recipe-ingredients"]` query
  (the one `SearchProvider` and `MakePage` declare, so whoever asks first
  fetches for all, and `staleTime: Infinity` keeps it). Until it lands, the
  list shows a "Loading ingredients…" row; then it offers `suggestNames()` by
  folded prefix, most used first, at most eight. A multi-word name is written
  quoted (`ingredient:"chicken thigh"`). The `optionsFor` comment now gives
  the reason a conditional fetch is fine here: one request per page load, not
  one per keystroke. A failed fetch shows no list rather than a row that
  never stops loading.
- **Candidates are checked against the lines.** `suggestNames` returns
  _normalized_ names ("fresh lime juice" → `lime juice`, "2 cups cherries" →
  `cherry`), but `ingredient:` matches lines as written, and `cherry` starts
  no word of "cherries". So `ingredientOptions` (exported from
  `QueryAutocomplete.tsx`) keeps a candidate only if the filter would match
  some line. The check is `anyLineMatcher` in `queryLanguage.ts`: the lines
  are folded and split into words once, and it gives `fieldMatches`' answer
  exactly (the tests hold the two side by side). The loop stops at eight
  rows, so only what is shown gets checked. Folded duplicates (an alias
  folding to a line name) collapse to the first.
- **Built lazily.** The names and the matcher are built the first time an
  `ingredient:` value asks, cached per ingredients document in a `WeakMap`
  (not before the display corpus lands). A search that fetched the lines for
  its own reasons (a populate, an `ingredient:beef` filter) doesn't pay for a
  pass over the corpus nobody asked for.
- **Loading row and a11y.** The row is a `role="status"` paragraph above the
  listbox, not an option, so it can't be arrowed to or accepted and the
  active-index arithmetic is unchanged. Meanwhile the listbox is empty and
  `aria-busy`, which `aria-required-children` accepts (the spec runs axe in
  that state). Keyboard, pointer and dismissal are the tag completion's,
  unchanged.
- **Staples (decision).** `suggestNames` skipping water and ice is right for
  the Make page: they always count as on hand, so nobody adds them to an
  inventory. It is wrong for search, which offers what the lines say;
  `ingredient:wat` not offering "water" would read as a bug. So
  `suggestNames(corpus, { includeStaples })` gained an option, default
  `false`. The Make page's behaviour is unchanged, and 32j can keep "suggest
  skips staples" as is.
- **No new route**, no spec or fixture change; `specVersions` didn't move.
- **Tests.** `queryLanguage.test.ts`: `completionsAt` inside an
  `ingredient:` value (bare, half-typed, after another term, negated,
  quoted), `anyLineMatcher` vs `fieldMatches`, and `ingredientOptions`
  (prefix, the line check, already-typed, dedupe, the quoted term filtering
  correctly, the cap). `makeable.test.ts`: `includeStaples`.
  `search-autocomplete.spec.ts`: an `ingredient:c` → `ch` → pick case, and a
  loading case that holds `/search/ingredients` (row shown, axe clean, then
  options, then click to accept).

### 32h — `SidebarLayout` and the portfolio masthead on sticky-chrome

- **Portfolio's masthead** is `sticky-chrome top-0` (was `sticky top-0`).
  Portfolio has no Sticky headers toggle and writes no `data-sticky-chrome`,
  so it is always `auto`: pinned at 600px of viewport height and above,
  released below. That release is the deliberate behaviour change. A new
  `chrome.spec` case checks it at 851×393 and back at 1280×720.
- **`SidebarLayout`'s rail** is `sticky-chrome top-[var(--header-height)]`
  (was `sticky top-[var(--header-height)]`), and its comment says why. It
  releases in lockstep with the masthead (short viewport, or recipe's "Off"),
  so a rail taller than a short viewport no longer hides its last links. The
  phase text suggested `top-[var(--sticky-chrome-offset)]`. **Decision: keep
  `--header-height`**, the convention the Ingredients header already set. On
  a `.sticky-chrome` element the two behave the same: position and offset
  come from one condition, so whenever the box is sticky the offset equals
  `--header-height`, and when it is released (static) `top` is inert. One
  convention instead of two:
  - `.sticky-chrome` elements read `--header-height`;
  - plain `sticky` elements that must stay pinned after the masthead releases
    read `--sticky-chrome-offset`.

  `theme.css` now says this at the class.

- **Re-checked offsets.**
  - Portfolio `Index` plate: `top-[calc(var(--header-height)+2rem)]` becomes
    `top-[calc(var(--sticky-chrome-offset)+2rem)]`. It stays plain `sticky`,
    because it is content, not chrome, and it is only 13.5rem tall. Once the
    masthead releases, it pins 2rem from the top instead of leaving a 3.5rem
    dead band.
  - Recipe `View/Ingredients`: already `.sticky-chrome` with `--header-height`
    and the inert-`top` comment. Unchanged.
- **Comments.**
  - `theme.css`'s `.sticky-chrome` block lists all four adopters and the
    plain-`sticky` + offset alternative.
  - `stickyChrome.ts` no longer says portfolio "can adopt" the class, and its
    type doc names the settings sidebar.
- **Tests.**
  - `sticky-chrome.spec` gains a "settings sidebar" describe with two cases:
    - pinned at 1280×720 and released with the masthead at 1280×560;
    - released under "Off" at 720.
  - Portfolio's `chrome.spec` gains the short-viewport case.
- **Baselines did not move.** Recipe `visual` was not in this run. Portfolio's
  `visual.spec` (index, masthead, settings sidebar, postures) passed 11/11
  unchanged at 1280×720, where everything is still pinned. A sticky box is in
  normal flow either way.
- **Gates.**
  - typechecks: recipe-editor, recipe-website export and portfolio-website-editor
    all ✅;
  - vitest 1058/1058 after merging main (1040/1040 before), under the heavy slot;
  - Playwright recipe `sticky-chrome.spec` + `settings-nav.spec`: 20/20,
    `PLAYWRIGHT_BUILD=1`, heavy slot;
  - Playwright portfolio `chrome` + `settings` + `visual`: 22/22 under the
    heavy slot, in **dev mode** (what CI's portfolio job runs).
- **The portfolio production build ran out of memory locally.** It hit the
  ~4 GB V8 heap limit after ~190 s of `next build --webpack`, inside the slot,
  with ~7 GB free. Next also warned that it inferred the workspace root as the
  main checkout, because the worktree's `pnpm-lock.yaml` sits nested under
  the main checkout's. That may be the cause. It wasn't investigated further
  and isn't caused by this diff. CI's portfolio job uses `next dev`, so the
  build is never exercised there either.
- `specVersions` didn't move: none of the edited modules is pinned.

### 32g — Meal-plan item `scale` + `?scale` on recipe pages

**What changed.**

- `common/util/scale.ts`: `parseScale` (what `fraction.js` reads, trimmed,
  positive only — 0, `0/4`, negatives, `2/0` and junk are `null`),
  `isValidScale`, `SCALE_MESSAGE`, and `formatScale` for the badge (`2×`,
  `½×`, `1½×`, else a ≤2-place decimal: `1.2×`). One parser for the write
  schemas, the group page and the recipe page, so a plan can't store a value
  its own link would then ignore.
- `GroupItem` (via `WithItemText`) gains `scale?: string`, stored trimmed but
  otherwise as written. **Not** on `GroupEntryItem`: `buildGroupIndexValue`
  already picks fields, so no index, fixture or spec version moved
  (`groups.test.ts` pins the absence by keys, like `note`).
- `GroupItemObjectSchema` validates it (`ScaleSchema()`) and refuses it on a
  `{group}` row. `addItem` now parses its item through that schema, so the
  seat, the `POST /api/group/[slug]/items` route (which destructures
  `scale`), both CLI backends (the type gains `scale`; HTTP already spread
  the options) and MCP `group_add_item` (new `scale`) share one rule.
  `group_set_items` and `group_create` take it in the object form and the
  shorthand.
- CLI: `group add <g> <recipe> --scale 2`; `group show` prints
  `Tue — First Recipe (first-recipe) ×2`; `--item slug[:label][@scale]`.
- Form: recipe rows get a Scale field (placeholder `1`); group rows have
  none. `parseGroupFormData` validates it (the message lands on `items`,
  above the rows) and drops a scale a forged post puts on a group row.
- `GroupItems` badges a scaled row beside its label
  (`data-testid="group-item-scale"`, with an sr-only "Scale ") and passes
  `href="/recipe/<slug>?scale=<value>"` to `RecipeListItem`, which gained an
  optional `href`. A 1× scale, or a stored value the parser refuses, shows
  nothing and links plainly.
- `MultiplierProvider` seeds from `?scale` through a `ScaleFromSearchParams`
  child: `useSearchParams` inside its own `<Suspense fallback={null}>`, a
  `useEffect` keyed on the value, invalid values ignored. The reader's later
  clicks win.
- MCP descriptions and SKILL.md's item grammar name `scale`.

**Decisions.**

- **Shorthand grammar: the scale comes off the end first.**
  `TRAILING_SCALE = /@([-+0-9./]+)$/`, then `slug:label` splits at the first
  colon as before. No whitespace or letters after the `@`, so
  `"Dinner @ 7pm"` and `"Lunch@home"` stay labels; a sign is admitted only so
  `"stew@-1"` fails validation (`items.<n>.scale`) instead of becoming a slug.
  A slug can contain neither `:` nor `@`. The one label it can misread is one
  that itself ends in `@<number>`; the object form covers that. The
  shorthand's scale is validated in `toGroupItems` (the input schema can only
  say "a string") by re-parsing the expanded item through
  `GroupItemObjectSchema`.
- **Recipe rows only.** A sub-group has no quantities; a scale there would be
  a value nothing reads, so every write path refuses it (the form silently
  drops it, since a group row has no Scale input).
- **The Suspense boundary wraps only the hook.** Wrapping the recipe view
  (MakePage's shape) would make the export ship a fallback instead of the
  recipe. A null-rendering child in its own boundary keeps the page
  prerendered whole; the export built against a scratch copy of
  `three-recipes-groups` and `out/recipe/first-recipe.html` carries the
  recipe's content, with one bailout marker (this boundary). The cost: the
  static page paints 1× and moves to 2× after hydration.
- **MCP-level validation.** `group_add_item`'s `scale` uses `ScaleSchema()`
  (the curation schemas are imported unchanged, per the registry's rule), so a
  bad object-form scale is rejected before dispatch in the SDK's shape (T28);
  a bad shorthand scale in `group_set_items` comes back as the layer's
  `validation` with `items.<n>.scale`. `mcp.test.ts` pins both.
- `addItem` now validates before `requireGroup`, so a bad item on a missing
  group reports `validation` rather than `not_found`.

**Tests.** `curation.test.ts`: shorthand (`@2`, `@1/2`, `@1.5`, `@` in
prose, a colon in the label), object form trimmed, `addItem` with
`"1 1/2"`, the resolved row; refusals (0, -1, abc, 2/0, 0/3, shorthand
`@0`/`@-2`, object `"0"`, group rows) with nothing written. `groups.test.ts`:
off the index, `parseScale`, `formatScale`, `parseGroupFormData` keep/drop/
refuse. `mcp.test.ts`: add/set with scale, SDK-shape and layer-shape
refusals. `cliJson.test.ts`: `--item …@1/2`, `group add --scale 2`, JSON and
text `group show`, `--scale 0` refused (`TIMEOUT * 3`: five processes).
`curationHttp.test.ts`: the route's body schema answers a bad scale with a
400 on `scale`. `groups.spec.ts`: the form case (0 refused, then `½×` and
`?scale=1%2F2`, read back on edit) and an API-written plan (badges, `?scale=2`
link, recipe opens with Multiply `2`, `4 cups flour`, `8 naan`, Double batch
pressed; `?scale=0`/`lots` ignored; `?scale=1%2F2` halves).

**Gates.** typechecks ✅ (editor, export); vitest 1068/1068 (56 files) after
merging origin/main at 32h; Playwright `groups.spec` + `yield.spec` +
`recipe.spec` 47/47 (build, heavy slot); export `next build` ✅ (scratch
fixture copy). `specVersions` didn't move.

### 32j — Make anything: kind switch, refine drill-down, loose matching

**The page.**

- **Kind switch** (`MakePage/kinds.ts`, `KindSwitch.tsx`). `MAKE_KINDS` is
  site config in `common/`: Anything `""`, Food `-tag:drink`, Drinks
  `tag:drink`. The kind lives in `?q=` like everything else.
  - `withKind` takes every kind's top-level terms out, puts the chosen one in
    front and keeps the words. A remaining top-level `OR` is wrapped in
    parentheses. Tag picks are kept unless the page's `keepTag` says nothing
    in the corpus carries them under the new kind (review fix): Drinks →
    Food drops `tag:sour` rather than landing on an empty
    `-tag:drink tag:sour`.
  - `kindOfQuery` reads the kind back: the most specific kind whose terms are
    all ANDed at the top level. A `tag:drink` inside an `OR` is the person's,
    not a kind.
  - The negated tag needed no query-language change: `-tag:drink` already
    parsed and evaluated, through the 31b resolver, so it excludes the whole
    drink subtree.
  - The control is a fieldset of native radios ("Kind of recipe"). Arrow keys
    work, and the "Drinks" tag chip keeps its button name to itself. Each
    radio is transparent and covers its segment.
  - Each segment shows what it would hold now (count `aria-hidden`).
  - The switch only shows when some kind splits the corpus (0 < n < all).
  - A remembered `tag:drink` reads as the Drinks segment checked (item 6).
- **Refine chips** (`tagTree.ts` `refinementsInScope`). They show after a
  pick:
  - a picked tag's tree children first;
  - then the tags that co-occur most in the scope;
  - never a pick or an ancestor of one;
  - never a tag on ≥ 90% of the scope (it would change nothing);
  - at most 12, and none when the scope is 0–1 recipes.

  **Decision: the top-level row now counts the scope without the tag picks**
  (`withoutTagPicks`: the kind and any typed terms stay). The top row holds
  still while picks drill down, and on a flat vocabulary the Refine row isn't
  a re-sorted copy of it. A Refine chip already shown in an open children row
  is left out, so no tag has two buttons. The 28g specs pass unchanged.

- **Close toggle** under the ticker, "Count close matches (≈) as had", on by
  default.
  - A card shows `≈ onion for shallot` (`make-close`).
  - With the toggle off, the line is missing and says
    `Missing: shallot (close: onion)`.
- **"Assume I always have"** is a folded editor in the inventory panel:
  chips, add, and "Reset to salt, pepper, water, ice".
  `useMakeSettings` keeps both settings in `localStorage`
  (`make-settings-v1`). It stores only what was changed, so a better default
  still reaches anyone who never touched it.
- **Wording.** The empty state says "what's in your kitchen or bar — produce,
  pantry staples, bottles". The scope placeholder is `tag:quick chicken`.

**Matching** (`ingredientNames.ts`, `makeable.ts`).

- **Lines.** These line fixes all came from the real corpus's dinner lines
  (`measure-ingredient-names.ts --all` on a scratch clone):
  - trailing prep phrases are cut ("cut into …", "at room temperature",
    "plus more …", "divided", "to taste", "trimmed and …", "or as needed",
    and others);
  - remark parentheses are dropped before the amount (`(or more)` kept
    `tbsp` as the name);
  - `boneless, skinless` no longer wins the comma cut (it read `boneless`);
  - `(or margarine, or more butter)` gives margarine or butter;
  - an amount in two units (`3.5lb/1.5kg`, `1 cup/240ml`) reads as one
    amount;
  - "cool", "lukewarm" and "tepid" are descriptive, so the water is a
    staple;
  - trailing connectives are trimmed;
  - **salt and pepper** split into two requirements. It is the one `and`
    that names two things; "half and half" and "macaroni and cheese" stay
    whole.
  - "A or B" lines already gave both alternatives (now tested with food).
- **Food synonyms**: scallion / spring onion → green onion; fresh coriander →
  cilantro; garbanzo → chickpea; confectioners' / icing → powdered sugar;
  caster → superfine; courgette → zucchini; aubergine → eggplant; double /
  whipping → heavy cream; hamburger (not buns) / beef mince → ground beef;
  sweet pepper / capsicum → bell pepper; rocket → arugula; prawn → shrimp;
  bicarbonate of soda → baking soda (read before the bare-soda rule);
  chilli → chili; yoghurt → yogurt; evoo.
  - `chile` is left alone. Folding it would relabel the drinks test's "ancho
    chile liqueur".
  - **Flavoured salts are compounds** (celery, garlic, onion, seasoned salt).
    With salt assumed on hand, a Bloody Mary's celery salt must not come for
    free.
- **Staples.** `DEFAULT_STAPLES = salt, black pepper, water, ice`, matched
  like inventory items. `black pepper` meets "pepper" and `salt` meets
  "kosher salt". A one-word staple also meets the water/ice lines
  `STAPLES` marks. `analyzeMakeable(…, { staples })` takes the page's
  edited list. `suggestNames` still skips only water and ice.
- **Close tier** (`closeTo`). It is tried only after the strict rules and a
  sub-recipe have failed, and is reported as `RecipeMatch.close:
{requirement, item}[]`. `countClose` defaults to `true`; when false, close
  lines are also in `missing`. The rules, as data at the end of
  `ingredientNames.ts`:
  - curated substitute groups: the oils, shallot/onion,
    butter/margarine/ghee, broth/stock/bouillon, sour cream/yogurt/crème
    fraîche;
  - one-way pairs: egg → egg white / yolk;
  - same non-generic head on two longer names, except ambiguous heads:
    pepper, bean, leaf, flake, paste, chip, seed, seasoning, salt, spice,
    bitters, vermouth;
  - class-noun drop, **one way**: the shorter name on hand stands in for the
    line with its kind (garlic → garlic powder, parmesan → parmesan cheese,
    basmati → basmati rice), never the reverse. Only cheese also goes the
    other way. `CLASS_NOUNS` is cheese, chili, rice, pasta and powder.
    Vinegar, wine, noodle, squash and seed are out: rice ≠ rice vinegar,
    spaghetti ≠ spaghetti squash;
  - typo: one word one edit apart, re-run through the strict rules. **Both
    words 6+ letters with the same first letter** (review fix). It is
    allowed only when the item's word is one the corpus never uses or the
    line's word is rare (≤ 2), and never for known pairs (cherry/sherry,
    tomato/potato, mustard/custard, fresco/fresno …). Mozarella, parmesean,
    tomatoe and chesse still match.

  **Review fixes** (first push of #206). The class-noun rule went both ways,
  and pepper, extract and lettuce were class nouns, so the real corpus had
  false "had"s:
  - lemon pepper or lemon extract on hand met whole-lemon lines (Whiskey
    Smash, Hot Toddy, the sangrias);
  - lemon met lemon pepper, and butter met "head butter lettuce";
  - almond extract met sliced almonds;
  - garlic powder met 88 fresh-garlic lines.

  At five letters with any first letter, the typo rule also matched real
  words: capers ↔ paper, Lillet ↔ (chicken thigh / anchovy) fillets,
  basil/basic, sheet/sheep, grape/grade. Each pair is now a negative test.

  The no-alcohol guard and `GENERIC_HEADS` hold: "juice" is never close to
  "lime juice", and "lemon juice" is never close to "lime juice".

- **Strict results didn't change for drinks** except through the staples:
  Paloma, Salty Dog and Frozen Margarita no longer miss their rim salt.
  `make-drinks`' specs and every existing matcher test pass unchanged.
  Three label tests changed on purpose: "green onion/scallion" is one name
  now, and "Salt and pepper" is two.

- **Speed** (review fix). The first push called `closeTo` for every unmet
  line × every item (~2 µs a pair), toggle or not: ~10× main's time. The fix
  has three parts:
  - **Answers by requirement signature.** Strict answers (`met`) and close
    answers (`nearest`) are cached by requirement signature, since lines
    repeat across the corpus (6,496 requirements, ~1,950 distinct). The
    caches are kept with the prepared corpus (a `WeakMap`) while the
    inventory and staples stay the same, so retyping the scope, which is the
    page's per-keystroke rerun, judges no line twice. The toggle only
    re-buckets.
  - **`CloseIndex` over the items.** Items are indexed by close group, pair,
    head, words and `<first letter>:<length>`, so `closeTo` sees only the
    candidates: 1,840 calls per cold run at 40 items, not one per unmet line
    per item. Line keys are
    memoized per name object.
  - **`useDeferredValue`.** `/make` computes the scope from a deferred copy
    of the query, so typing stays responsive while the results catch up.

  `measure-makeable.ts --bench N` times `analyzeMakeable` over all 665 real
  recipes with the N most-used names as the inventory. "Cold" is a new list
  each run; "warm" is the same list again, as when the scope changes.
  Medians in ms on this workstation:

  | items | main   | first push | now, cold | now, warm |
  | ----- | ------ | ---------- | --------- | --------- |
  | 40    | ~20–33 | ~327       | 32        | 7.8       |
  | 80    | ~49–57 | ~481       | 44        | 6.9       |
  | 150   | ~50–64 | ~570       | 68        | 6.2       |

  Main's figures are the range of two runs on a shared machine.
  Cold is now 0.9–1.1× main and warm is 4–8× faster.
  `makeable.test.ts` checks that a cached answer equals a fresh one, and that
  a changed list or staples is judged afresh.

**Default query `""`** for `inventory_makeable`, `recipes inventory make` and
`/api/inventory/make`; `tag:drink` still narrows. Rows gain
`close?: {needs, have}[]`, and the CLI prints `close: onion for shallot`.
Wording changed in all of these:

- MCP `inventory_makeable` (every recipe, `-tag:drink` for food, staples,
  `close`) and `inventory_get` (pantry first);
- CLI usage and docblock, the schema and route comments;
- SKILL.md §8: "what can I make?" means any recipe, the first example has no
  `query`, plus the row shape and the staples.

`curatorSkill.test.ts` pins the §8 wording.

**Real corpus** (read-only scratch clone of `recipe-content` at its HEAD,
665 recipes, `scripts/measure-makeable.ts`, new and read-only; main's matcher
swapped in for "before").

- **Food**: 457 non-drink recipes, 1 unjudged. Pantry: onion, garlic,
  chicken thighs, rice, butter, olive oil, eggs, flour, milk, lemon.

  |                           | can make | one away     | two away | further |
  | ------------------------- | -------- | ------------ | -------- | ------- |
  | before (main)             | 0        | 8            | 16       | 432     |
  | after, close off          | 5        | 13           | 27       | 411     |
  | after, close on (default) | 5        | 15 (2 via ≈) | 35       | 401     |

  Most of the gain is salt as a staple. Five tortilla, flatbread and noodle
  recipes were blocked only on it. The close tier adds egg → egg yolk and
  olive oil → vegetable / canola / neutral oil. The corpus is heavy on baking
  and drink syrups, and real dinners need more than ten items, so most stay
  "further".

- **Drinks** (no regression check): 208 drinks with a 20-item bar.

  |                  | can make | one away | two away | further |
  | ---------------- | -------- | -------- | -------- | ------- |
  | before           | 35       | 55       | 60       | 58      |
  | after, close off | 35       | 58       | 58       | 57      |
  | after, close on  | 37       | 59       | 58       | 54      |

  No drink got further away. The close matches are white rum for dark, aged
  and pineapple rum.

  Re-measured after the review fixes on a fresh clone (since deleted): both
  tables are unchanged, because none of the removed rules fired for these
  two pantries. A probe pantry of the review's pairs (lemon pepper, lemon
  and almond extract, garlic powder, capers, Lillet, lemon, butter, basil,
  onion, olive oil, eggs) now gives only olive oil → vegetable oil and eggs →
  yolk as close matches.

**Tests.**

- `makeable.test.ts` "food (32j)":
  - prep phrases, A-or-B, synonyms on both sides, flavoured salt;
  - close by substitute / head / kind / typo, never on vague, ambiguous or
    wrong-way names;
  - the typo guard;
  - staples on and edited;
  - close counted, reported and turned off;
  - strict drink buckets unchanged with the tier on.
- `ingredientNames.test.ts`: 27 food lines, cool water, salt and pepper.
- `makeTags.test.ts`: Refine (children first, ubiquity, a flat food
  vocabulary), `kindOfQuery`, `withKind`, `withoutTagPicks`.
- `inventory.test.ts`: the "" default, `tag:drink` narrowing, and a close
  row.
- `mcp.test.ts`: the default and `tag:drink`.
- `curatorSkill.test.ts`: the §8 wording.
- **Playwright** `make.spec.ts` gained a "dinner as well as drinks" describe
  on the new `make-food` fixture:
  - six food recipes, tagged (side, vegetarian, dinner, quick) and
    untagged, plus two drinks;
  - indexes built with `recipes reindex` on a scratch copy;
  - no term records, so a flat vocabulary like the real food.

  Five cases: the kind switch (including a remembered `tag:drink`), Refine
  drilling side → quick, a close match shown and turned off (with axe), the
  salt staple removed and reset, and courgette / "cut into" read loosely.

- **The `make-page-e2e.png` baseline moved** (1280×2214 → 1280×2280). The
  page gained the kind switch row, the "Count close matches" line and the
  folded "Assume I always have (4)" box. CI shard 4 failed on exactly that
  (3% of pixels). The new baseline is CI's own `make-page-actual.png`, taken
  from the run's blob report: byte-identical across its three retries, and
  checked by eye. The review fixes don't change this page; its drinks
  inventory has no close lines. There is no mobile variant: `visual.spec`
  runs only on `e2e`.
- **`make-food` indexes rebuilt after the 32e merge.** CI shard 2 failed
  "refine chips drill down a tag with no children" on all three retries: the
  top-level tag row was empty. 32e (#204) made the by-term aggregate keyed
  and regenerated every fixture, but `make-food` was added on this branch
  with indexes built by the old CLI. The route's tag vocabulary read nothing
  from them, while the kind switch, which reads recipe tags directly, kept
  working. Rebuilt with `recipes reindex` on a scratch copy (the
  `recipes/{index,pagination,aggregates}` it writes). **Trap (T6, again):** a
  fixture added on a branch that later merges a spec bump has to be
  rebuilt after the merge.

**Gates.**

- typechecks: recipe-editor and the export (`tsc --noEmit`) ✅, after
  merging origin/main at 32c (#203). Review round: re-run after merging
  origin/main at 32d (#205) and again at 32e (#204);
- vitest 1134/1134 (56 files), under the heavy slot, after the merge.
  Review round: 1148/1148 (56 files), heavy slot, after merging 32d;
- Playwright `make.spec` locally, after the 32e merge and the `make-food`
  rebuild: 26/26 (`PLAYWRIGHT_BUILD=1`, heavy slot);
- Playwright: the local `make.spec` + `search-autocomplete.spec` run
  (`PLAYWRIGHT_BUILD=1`) sat in the heavy slot for ~28 minutes waiting for
  memory, and the orchestrator killed it. An orphaned child then ran all
  39 tests to the end with no failure reported, but it was killed before the
  summary, and its `test-content` was removed mid-run, so it doesn't count
  as a gate. CI's four Recipe shards are the e2e gate for this phase, by the
  orchestrator's call.
- `specVersions` didn't move: none of the edited modules is pinned.

**Deferred.**

- Tagging the food corpus (32k, Roger's).
- `tequila blanco` read as a kind of tequila: word order, a drinks
  follow-up.
- Synonyms for broth/stock, which stay close-tier on purpose.
- A shared, editor-side staples list. The list stays per browser, like the
  overlay.

### 32i — Term aliases, search-only

**What changed.**

- **Engine** (`packages/cms/taxonomies/`). `Term.aliases?: string[]`. The
  term index carries it (`TermIndexValue.aliases`: the non-empty strings,
  absent when none), and the tree folds it (`TermTreeNode.aliases`).
  `termTreeAggregate` version `"1"` → `"2"`. The engine only carries the
  strings; what an alias means is the site's.
- **Search.**
  - `buildTagExpansion` (`tagExpansion.ts`) takes `aliases` on a `TermNode`.
    Each alias's folded spellings (as typed and as its slug) map to its term,
    so `tag:<alias>` expands exactly as `tag:<term>` does, subtree included.
    The alias spellings also join the expansion, so a carrier still tagged
    with an alias (a merged term's old slug, a synonym typed later) is found
    by `tag:<term>` and by its ancestors.
  - `tagOptions` (`tagVocabulary.ts`) carries each record's aliases from the
    tree. Every resolver is built from it, so `/search/terms` (editor and
    export), the server's `readTagResolver` (`recipe_search`, `list --tag`)
    and `/make` all see aliases with no change of their own.
  - Autocomplete: `tagCompletionOptions` (was the private `tagOptions` in
    `QueryAutocomplete.tsx`, now exported) lists the tags first, then for
    each alias matching the prefix offers its term's label (`also called
<alias>`), replacing with `tag:<label>`. An alias typed in full still
    offers its term. A term is never offered twice. `tagAliasesOf(allTerms)`
    keeps only aliases of terms something carries, as `allTags` does.
- **Routes.**
  - `aliasTarget(tree, slug)` and `aliasSlugs(tree, taken)` in
    `tagVocabulary.ts`. `resolveTermAlias` and
    `readTermPageSlugsWithAliases` in `readTermPage.ts`.
  - The editor's `/tags/<alias>` answers with `redirect()` (307).
  - The export's `/tags/[tag]` uses `generateExportTagStaticParams`, which is
    the page slugs plus every alias that is no term of its own. `tagRoute`
    renders `TagAliasRedirect` (`TagPage/AliasRedirect.tsx`, a client
    component) for an alias: a hoisted `<meta http-equiv="refresh" content="0;url=/tags/<term>">`
    for a full load, `router.replace` for a client navigation, a canonical
    link and a plain link.
  - `generateTagMetadata` titles an alias with its term's label.
- **Seats** (`curation/terms.ts`, `schema.ts`).
  - `aliases` on `TermInputSchema` and `TermPatchSchema`. A patch replaces
    the list and `null` clears it.
  - `assertAliases` normalises each alias as a tag (`normalizeTag`) and
    dedupes by slug. Each alias **added** by the write may not slug to the
    term itself, to another term (a record, or a tag something carries), or
    to another record's alias, and may not be spelled like another term's
    label (folded as `tag:` folds it, typed or slugged). Each clash is one
    `validation` issue on `aliases.<i>` naming the term it hits.
  - `createTerm` refuses a slug that is another record's alias, and
    `renameTerm` a `to` that is (`validation` on `slug` / `to`). A rename
    onto one of the term's own aliases drops that alias.
  - The reverse, from the review: a label spelled like another record's
    alias is refused on `label` by `createTerm`, by `updateTerm` when the
    label changes, and by `renameTerm` when its label changes.
  - `mergeTerm` appends `from` and `from`'s aliases to `into`'s aliases,
    inside its existing batch commit:
    - the moved record carries them when `into` had no record;
    - one write of `into`'s record covers pinned and aliases when it had one;
    - a bare `from` into a record writes that record;
    - a bare tag into a bare tag records nothing;
    - an alias of `from` that a third record already lists is skipped.
  - `TermMergeResult.aliases` is `into`'s list after the merge. `getTerm`
    lifts `record.aliases` to `aliases`, and `term_list` rows carry
    `aliases` when set (spread only when set, so old rows keep their exact
    shape).
- **Tools.**
  - The term form has an Aliases `ChipsInput` (item label "synonym", so the
    controls read "Add a synonym" and "Remove synonym x").
  - `termForm.ts` parses `aliases[i]`; an edit with no chips clears them.
    `aliases.<i>` issues land on the field.
  - CLI: `term create --alias A …`; `term update --alias A … |
--clear-aliases`; `term get` prints them. `--help` lists the flags.
  - MCP: the `INSTRUCTIONS` term sentence and the `term_list` / `term_get` /
    `term_create` / `term_update` / `term_merge` descriptions name aliases.
    SKILL.md has one paragraph. Tool counts are unchanged.

**Decisions.**

- **The engine tree, not a site aggregate.** Aliases are a generic
  vocabulary notion (a synonym, SKOS's `altLabel`), and the tree already
  carries `label`, `parent` and `image` for exactly this kind of reader. One
  more optional field kept every reader on the one read it already made. A
  site aggregate would have added a fourth source to every resolver.
- **In search, a record's own spelling beats an alias, and an alias beats a
  carried-only term.** The seat refuses both clashes, so this is about what
  reaches disk anyway.
  - A record's slug and label are a curator's name for that term. Another
    term's alias must never take them over: record B at `british-biscuits`
    labelled "Biscuits" keeps `tag:"Biscuits"` even if `cookies` lists
    `biscuits` (a hand edit), and B's spellings never join `cookies`'
    expansion. This came from the review, as the blocker. `TagOption` gained
    `record?: true` so the browser's resolver can tell, and the expansion
    drops an alias spelling that another record owns.
  - Nothing canonicalises carriers (D5), so a recipe can come to carry the
    alias as a tag after it was recorded. If that carried-only term won,
    `tag:biscuits` would suddenly shrink to the one recipe. With the alias
    winning, it keeps meaning the canonical term, and that term's expansion
    includes the alias spelling, so the stray carrier is found too.
- **A real page beats an alias redirect.** `/tags/<slug>` redirects only when
  `resolveTermPage` is `null` (no record, no carriers). A slug with carriers
  of its own lists things the canonical page does not, so it keeps its page.
  **So the two can disagree, on purpose.** When carriers also carry the
  alias spelling as a tag, `/tags/<alias>` renders that bare carried-tag page
  (only those carriers), while `tag:<alias>` resolves to the term (the
  term's subtree plus those carriers).
- **Kept aliases are not rechecked.** Re-validating the whole list on every
  update would make the term form refuse any edit once a recipe carries an
  old alias, for a state the record cannot fix. Only additions are checked.
- **The export emits a redirect page.** A static file cannot send a 3xx, so
  the page itself does the redirect (as above). The editor's params stay the
  plain list: it redirects on demand, and prerendering a `redirect()` at
  build would bake one in for no gain.
- **Aliases are normalised like tags** (lowercased, whitespace collapsed), so
  they compare and print like the tags they stand in for.
- **Rename does not record the old slug.** D5 asks this of `term_merge`
  only. A rename that wanted it could pass `aliases` in a follow-up
  `term_update`. Left as is.

**Tests.**

- `tagExpansion.test.ts` (+7):
  - an alias expands as its term does, by typed and slug spelling;
  - an alias-tagged carrier is found by the term and an ancestor;
  - an alias beats a carried term of the same spelling;
  - a record's label and slug beat another term's alias, and don't leak into
    its expansion (review);
  - the tree's aliases reach `buildTagExpansionFromTree` and `tagOptions`;
  - `aliasTarget` / `aliasSlugs`;
  - fixture parity: `recipe_search tag:biscuits` = `tag:cookies` =
    `matchesFilter` over the `/search/terms` vocabulary, including a recipe
    tagged `biscuits` after the alias was recorded.
- `terms.test.ts` (+8): normalise and dedupe on create; `getTerm` /
  `listTerms`; the four refusals as four issues with nothing written;
  replace, null and `[]` clear, a kept alias that became a carried tag
  survives an update while adding a carried one is refused; a new term or a
  rename onto another's alias refused; a rename onto its own alias drops it;
  the merge's four record shapes, and `tag:<from>` still finding the carrier.
  From the review: an alias spelled like another term's label refused; a new
  label, a relabel and a rename's label spelled like an alias refused on
  `label`, with an unchanged label not rechecked; a merge skipping an alias
  of `from` that a third record lists.
- `makeTags.test.ts`: `tagOptions` rows for records carry `record: true`.
- `taxonomies.test.ts` (+1): the tree carries aliases, and no key for none.
- `termForm.test.ts` (+2, and two cases extended): the patch and input
  shapes; the `aliases.0` issue mapping; `submitTermForm` saving, refusing on
  Aliases with the echo, and clearing.
- `queryLanguage.test.ts` (+3): `tagAliasesOf` and `tagCompletionOptions`.
- `exportStaticParams.test.ts` (+1): the export's params add the aliases that
  have no page of their own; the shared params don't.
- `cliJson.test.ts` (+1): `--alias` create, `get`, `search tag:<alias>`,
  replace, the `--alias` + `--clear-aliases` usage error, a clash, clear.
- `mcp.test.ts` (+1): the descriptions, `term_create` with aliases →
  `term_get` → `recipe_search tag:<alias>`, and the clash in the layer's
  shape.
- `curationGit.test.ts`: the merge commit now also holds `into`'s record.
- `specVersions`: the tree fold, 1 → 2.
- Playwright:
  - `term-edit.spec` (+1): add an alias chip, then `/tags/biscuits` →
    `/tags/cookies`; a clashing chip is refused on the field with nothing
    saved.
  - `tag-pages.spec` (+1): an alias via the API, then `/search?q=tag:biscuits`
    shows Cookies' 8; `/tags/biscuits` redirects; a non-alias is still a 404.
  - `search-autocomplete.spec` (+1): `tag:swe` offers "Dessert" (also called
    sweets), accepting it gives the 3 desserts.

**Fixtures** regenerated in their own commit (T6,
`build-fixture-indexes.ts`): the tree spec moved in `christmas-cookies` and
`make-drinks`, and the rest is the script's usual rewrite.

**Gates.** Typechecks ✅: `recipe-editor`, `recipe-website`
(export), and `tsc --noEmit` in the portfolio editor and the CMS demo (the
engine's term types moved). Full vitest in the heavy slot: 1136/1136, then 1139/1139 after the review fix, across
56 files. Playwright, build+start through `heavy-pw.sh`: `search-tags` +
`search-autocomplete` + `term-edit` + `tag-pages`, 43/43, the 3 new cases
included. The run left the fixtures clean.

**After merging `origin/main` at 32j (#206):** typechecks ✅; full vitest in
the heavy slot 1193/1193 across 56 files; Playwright `make` + `search-tags`
31/31 (build). 32j's new `make-food` fixture needed no regeneration. It has
no term records, so it has no tree aggregate for the version bump to stale.
A full `build-fixture-indexes.ts` run changed no aggregate's `data.mdb` in
any fixture (only the usual index and pagination rewrites, discarded), so
every tree on disk is already at version 2.

**Morning checklist.** The tree's spec moved, so the real repo needs a
`reindex` (already on the list for 32e). Until then the guarded read returns
`null` for the tree (30a): `/tags` loses "By kind", term pages lose their
breadcrumb and children, and `tag:` loses its hierarchy. A term write heals
the tree too, but the reindex is the fix. The Pi needs the same at its next
deploy.

**Deferred.** No write-time canonicalisation (D5). Rename doesn't record the
old slug. `/tags` doesn't list aliases. The export's redirect page needs JS
or a meta-refresh-honouring client; there's no server redirect there.

### 32-close — results, e2e checks, a path-traversal fix, backlog

**What changed (code, one commit with tests).**

- **32g nits.** Global `--help` shows `group add … [--scale 2]` and
  `--item slug[:label][@scale]`. The `group_create` MCP description lists
  `scale?` in the item object and the `@2` shorthand. `formatScale` shows the
  fraction for a valid scale too small for two places (`0.001` → `1/1000×`,
  not `0×`); the validator is unchanged, so no stored value changes meaning.
  `parseGroupFormData` checks a scale only on a row it keeps, so a blank row
  (or a group row, which has no Scale input) with junk in Scale is dropped
  instead of failing the form; the issue path keeps the row's form index.
- **`term assign <t> --add a b c`** used to write `a` and silently drop `b`
  and `c` (stray positionals; found by e2e check 3). It is now a `usage`
  error naming the strays; the flag repeats (`--add a --add b`).
- **Path traversal (security).** See "The slug finding" below. Fixed in two
  places: the recipe uploads route, and an engine-level slug guard.
- CLAUDE.md states the tool count (47 registered, 35 pre-approved, 12 held
  back); `curatorSkill.test.ts` now pins the 47 sentence too.

**The slug finding: exploitable, unauthenticated, now fixed.** Next 16
decodes each dynamic segment with `decodeURIComponent`
(`route-matcher.js`), so `..%2F` arrives in `params` as `../`.

- **`GET /uploads/recipe/<slug>/uploads/<filename>` was an arbitrary file
  read.** It joined both params under `<content>/uploads/recipe/` with no
  guard. Confirmed read-only against the running workstation editor (:3000,
  bound to `0.0.0.0`, no session):
  `/uploads/recipe/x/uploads/..%2F..%2F..%2F..%2Frecipes%2Fdata%2F<slug>%2Frecipe.json`
  answered 200 with the recipe's JSON, and ten `..%2F` then `etc%2Fhostname`
  answered 200. Any file the editor process can open was readable by anyone
  who can reach the port. Portfolio's project-uploads route and both sites'
  `/uploads/[filename]` and `/image/[...filePath]` routes already confined
  their params with `resolveWithin`; this one route had been missed. It now
  confines the slug and the filename, one `resolveWithin` each, and a refusal
  is a 404. **The workstation and the Pi keep the hole until they run this
  build** (the morning checklist's `pnpm workstation update` and
  `pnpm deploy:pi`).
- **The engine's write and read paths were reachable, but not usefully.**
  `getContentItemDirectory` did `resolve(dataDir, slug)`. Every authenticated
  route that takes a slug (recipe image, term PATCH/DELETE/image, group
  routes, recipe update/delete) reads `<dir>/<dataFilename>` first and 404s
  when it is missing. So a write or a delete could only land where a file with
  that type's name (`recipe.json`, `term.json`, `group.json`) already existed,
  and the public pages could only read such a file. Not exploitable in
  practice, but one missing read away from a recursive `rm`.
- **The guard** (`packages/cms/content/filesystem.ts`): a slug must be one
  path segment (non-empty, not `.` or `..`, no `/`, `\`, `%`, or control
  character), and the resolved path must stay strictly inside the type's data
  or uploads directory. `getContentItemDirectory`, `getContentFilePath`,
  `getUploadsDirectory`, `getUploadsBaseDirectory` and `getUploadFilePath`
  all go through it (new `getTypeUploadsDirectory` is the type-wide root,
  which `curation/git.ts` used to get by passing `""`). It throws
  `InvalidSlugError`, which carries `code: "ENOENT"` on purpose:
  `readContentFileOrNull` returns `null`, the curation layer answers
  `not_found`, the routes 404, and a refused slug looks exactly like an
  absent one. No spec'd module moved (`filesystem.ts` is not pinned).
  Checked through the CLI on the clone: `show ../recipes/data/bloody-mary`,
  `term update ../../../recipes/data/bloody-mary` and
  `delete ../../groups/data/e2e-plan --yes` each answered `not_found`, and
  the plan was still there.
- **Tests:** `test/contentSlug.test.ts` (new, 21): the guard over `..`, `.`,
  `""`, `../x`, `a/b`, `a\b`, an absolute path, decoded and still-encoded
  `%2E%2E%2F`, a NUL; null on read and `not_found` on the wire; a delete that
  leaves the sibling type's file alone; the uploads route serving an upload
  and 404ing five traversals (filename, slug, absolute). `groups.test.ts`
  (+3): the tiny-scale label, the dropped blank and group rows, the form
  index. `cliJson.test.ts`: the stray-positional refusal.
  `path-traversal.spec.ts` (+1): the recipe uploads route serves an upload
  and 404s a filename and a slug traversal to a fixture file that exists.

**Gates.** typechecks ✅ (editor, export); vitest 1217/1217 (57 files); e2e 7/7 on
the clone; Playwright `path-traversal` + `api-write` + `groups` 62/62 (build, heavy slot).

## Close-out

### End-to-end checks

On a scratch clone of `recipe-content` at `6532d71`,
reindexed with this branch's CLI (`main` plus the fixes above;
`--content-dir <clone>`, 1,381 ms):

| #   | Check                                     | Result                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `term delete` on a featured child term    | ✅ `e2e-child` (parent `e2e-parent`, both with records) featured as `e2e-feature`, then deleted: `{"featured":["e2e-feature"],"unfeatured":[]}`; the feature file now names `"term": "e2e-parent"`. One commit, `Delete term: e2e-child (1 feature)`, 2 files (the feature and the record).            |
| 2   | `term image <slug> --file <png>`          | ✅ one commit, `Update term image: e2e-parent`: the record plus `uploads/tag-term/e2e-parent/uploads/<png>`; tree clean.                                                                                                                                                                               |
| 3   | `term assign <t> --add a --add b --add c` | ✅ **one** commit, `Assign term: e2e-parent (+3 recipes)`, of **3 files**: the three `recipe.json`s. Not 4: an assign never touches the term record (it holds label, parent, pinned, aliases, not carriers). The first try, `--add a b c`, wrote only `a`, which is the CLI fix above.                 |
| 4   | `group add <plan> <recipe> --scale 2`     | ✅ `group show e2e-plan` has `{"recipe":"bijou-acouplecooks","label":"Tue","scale":"2"}`; one commit.                                                                                                                                                                                                  |
| 5   | alias, then `search 'tag:<alias>'`        | ✅ `term update e2e-parent --alias "E2E Alias"`; `tag:e2e-alias` and `tag:"e2e alias"` both return `total: 4`, the term's four carriers.                                                                                                                                                               |
| 6   | by-term record sizes after the reindex    | ✅ 172 records. JSON bytes (32e's unit): largest `drink` 38,256, then `shaken` 14,229, `sour` 11,540; median 277; smallest `easy` 181; 198,208 summed. Stored msgpack: `drink` 26,351, median 247, 143,264 summed; header 186 B, hash map 13,438 B. Groups' by-tag: 0 records (no groups in the repo). |
| 7   | `inventory make --json`, no query         | ✅ `query: ""`, `total: 665` (the whole corpus, food and drinks; 23 items on hand). Food in the tiers: 7 of 41 one-away (`honey-syrup-acouplecooks`, `lavender-syrup`, …), 9 of 50 shown two-away (`chicken-wings`, `cilantro-lime-yogurt-sauce`, …); 5 can-make, all drinks.                          |

### The real content repo

The clone was deleted afterwards. **The real repo is untouched:**
`git -C /home/roger/Projects/recipe-content status --short` is empty and
`log --oneline -1` is still `6532d71 Create recipe: butter-lettuce-salad`, the
epic's baseline (the workstation sync hadn't moved it). No commit by this
epic.

### The 32e measurement, summarised

The by-tag record had reached 200,805 B (172 tags,
`drink` 208 recipes), over F8b's 150 KB trigger, and a six-tag recipe's name
edit rewrote all of it and expired all 172 term pages. 32e made it a keyed
aggregate, one record per term (`AggregateConfig.keyed`, `[0]` header,
`[1, key]` values, `[2]` hashes), with `readAggregateKey` and per-key cache
tags. The same edit now writes its 6 terms (75 KB plus 14 KB of hashes) and
expires 6 term pages plus `/tags`. The no-op fold went 22.6 → 17.4 ms, mostly
from memoising `termsOf`, and the full reindex didn't slow down (646 → 624 ms).
The close-out reindex above has the same shape (largest 38 KB, median under
300 B).

### Deferred / backlog

Non-blocking review notes and deferrals from the phases, none of them
started. Rows that need a phase are in `backlog.md` too.

- **32c:** `termImageFile` re-wraps only `ValidationError` from the file
  check; anything else surfaces as it was thrown.
- **32d** (F34 batches):
  - while a batch runs its files stay uncommitted for all N writes, with no
    write lock, so a concurrent write's commit can sweep them in and a
    workstation sync can see a dirty tree;
  - an engine write that throws after writing a file leaves that file
    uncommitted, as unbatched writes already did;
  - pre-staged files ride along in any commit.
    Candidate: an engine write lock, and touched paths attached to errors
    (backlog).
- **32e:** term pages still depend on the two whole `terms` clouds for their
  counts, so a carrier joining or leaving any term expires every term page.
  Keying the clouds would remove that (backlog). 29b's index-version stamp
  stays deferred, so a spec bump still needs a manual reindex.
- **32h:** the portfolio `PLAYWRIGHT_BUILD=1` production build runs out of
  heap locally (`next build --webpack` hits the ~4 GB V8 limit after ~190 s;
  from a worktree Next picks the main checkout as the workspace root).
  Nothing local needs that build today (backlog).
- **32i:** a term rename doesn't record the old slug as an alias (D5 asks it
  of `term_merge` only); `/tags` doesn't list aliases; no write-time
  canonicalisation; the export's alias redirect is a client-side page
  (backlog for the rename).
- **32j:** "tequila blanco" read as a kind of tequila (word order); broth and
  stock stay close matches on purpose; the staples list is per browser
  (backlog).
- **32k:** tagging the 444 untagged food recipes, Roger's call (backlog).
- **32-close:** the engine guard covers the content-type paths. The sites'
  own `filesystemDirectories.ts` helpers (`getRecipeUploadPath` and its group
  and term twins) still `join` without a guard. Every caller now passes a
  slug that has already been through the engine (an image rendered from a
  stored record) or is confined itself (the uploads route), so this is
  defence in depth, not a hole.

### Morning checklist for Roger

Order matters. The main checkout was deliberately left at `1946716c` (32d):
the workstation runs a built `next start` from it, and 32e and 32i changed
index layouts that build can't read. A CLI or MCP write from newer source
would write the new layout under the old server.

1. **`git pull`** in the main checkout (`/home/roger/Projects/content-engine`).
2. **`pnpm workstation update`**: rebuild and restart
   `recipe-workstation.service`. This also closes the uploads-route file read
   on :3000.
3. **Reindex the real repo:** `pnpm --silent recipes reindex --json` with no
   `CONTENT_DIRECTORY`, so it goes through the `editor/content` symlink. Until
   then `/tags` is empty, record-less term pages 404, and `tag:` loses its
   hierarchy and aliases. **Only after this** use the CLI or MCP against the
   real repo.
4. **`pnpm deploy:pi`**: the Pi's indexes are built here, and the Pi gets the
   uploads-route fix too.
5. **Look at:**
   - `/tags/<slug>/edit`: upload a term image;
   - a meal plan with a scaled item: the `2×` badge, and the
     `/recipe/<slug>?scale=2` link opening scaled;
   - `ingredient:` autocomplete in the search field;
   - `/make`: the kind switch (Anything / Food / Drinks), refine chips, close
     matches and staples;
   - `tag:<alias>` in search, and `/tags/<alias>` redirecting.
6. **Decide 32k:** tagging the 444 untagged food recipes, so the Make page's
   food drill-down has tags to work with. The proposal is in 32k above.
