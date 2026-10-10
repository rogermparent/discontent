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

**Now:** 32-plan (this doc) is open as a PR. Every other phase is planned and
runs strictly in sequence after it.

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
| 32a      | Hygiene                                                                  | S       | `agent/32a-hygiene`        | 🟡 #198           |
| 32b      | Features follow a deleted term/group                                     | S–M     | `agent/32b-delete-feature` | 🟡 #200           |
| 32c      | Term image upload, full parity                                           | M–L     | `agent/32c-term-image`     | 🟡 #203           |
| 32d      | F34 batched commits for term assign/rename/merge                         | M–L     | `agent/32d-batch-commit`   | 🟡 #PRNUM         |
| 32e      | 24g: measure, then split the by-term record                              | L       | `agent/32e-by-term`        | 📝 planned        |
| 32f      | Ingredient completion in search                                          | S–M     | `agent/32f-ingredient-ac`  | 🟡 #199           |
| 32g      | Meal-plan item `scale` + `?scale` on recipe pages                        | M       | `agent/32g-plan-scale`     | 🟡 #202           |
| 32j      | Make anything: kind switch, refine drill-down, loose ingredient matching | M–L     | `agent/32j-make-any`       | 📝 planned        |
| 32h      | `SidebarLayout` + portfolio masthead on sticky-chrome                    | S       | `agent/32h-sticky-sidebar` | 🟡 #201           |
| 32i      | Term aliases, search-only (droppable)                                    | L       | `agent/32i-aliases`        | 📝 planned        |
| 32k      | Food vocabulary for the corpus (content; Roger's go needed)              | content | —                          | ⏸️ awaiting Roger |
| 32-close | Results, backlog strikes, morning checklist, memory                      | docs    | `agent/32-close`           | 📝 planned        |

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

To be filled per phase (PR, merge sha, gates), with the 32e measurement and
the end-to-end checks at 32-close.

| Phase   | PR     | Merge      | Gates                                                                                                                               |
| ------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 32-plan | #197   | `dafc6834` | docs only; CI 12/12                                                                                                                 |
| 32a     | #198   |            | typechecks ✅; vitest 1040/1040 (56 files); `pnpm install --frozen-lockfile` ✅; no Playwright (per plan); CI                       |
| 32b     | #200   |            | typechecks ✅; vitest 1048/1048 (56 files); Playwright `featured-recipes` + `term-edit` 55/55 (build); CI                           |
| 32c     | #203   |            | typechecks ✅; vitest 1074/1074 (56 files); Playwright `term-edit` + `api-write` 29/29 (build); CI                                  |
| 32d     | #PRNUM |            | typechecks ✅; vitest GATECOUNT; Playwright `git` + `api-write` PWCOUNT (build); CI                                                 |
| 32f     | #199   |            | typechecks ✅; vitest 1050/1050 (56 files); `search-autocomplete.spec` 13/13 (build+start); CI                                      |
| 32h     | #201   |            | typechecks ✅ (recipe, export, portfolio); vitest 1058/1058; Playwright recipe 20/20 (build), portfolio 22/22 (dev — see entry); CI |
| 32g     | #202   |            | typechecks ✅; vitest 1068/1068 (56 files); Playwright `groups` + `yield` + `recipe` 47/47 (build); export `next build` ✅; CI      |

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
