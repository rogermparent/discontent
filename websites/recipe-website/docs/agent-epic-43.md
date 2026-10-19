# Epic 43 — Search, tags, meal plan and edit form as picked; What can I make from nothing; Ask

> **This is the durable source of truth for epic 43.** Read it before
> touching `/search` (the Narrow column, bands, the term card, ⌘K's last
> row), `/tags` and term pages (the board, Combine, Narrow chips, root
> pages), the meal-plan page and `/groups` (plan and cook modes, the run
> sheet, `planTimes.ts`), the recipe edit and new-recipe forms (the section
> rail, Start from, the duplicate check, tags by facet, ingredient rows),
> the facet model (`common/util/facets.ts`), ingredient-name normalization
> (ranges, synonyms, descriptors), What can I make (start from nothing,
> pattern items) or Ask. The orchestrator updates the roadmap **Status**
> column and the **Now** line at every phase boundary; workers add their
> phase's **Results** and **Traps** under their own headings, and decision
> amendments numbered by phase letter (`Da1`, `Ds1`; 43p1/43p2 and
> 43e1/43e2 use `Dp1-1…`, `Dp2-1…`, `De1-1…`, `De2-1…`). Earlier epics are
> cited by number with a prefix (`42-Dc1`, `41-Dh2`). Background:
> `agent-epic-42.md` (its 42j Results are the findings on today's pages,
> its Close-out the "Roger to confirm" list), `ui-overhaul.md`.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** wave 1 — 43a ∥ 43f ∥ 43n, and 43k's dry run (2026-10-19).

## Context

Epic 42 closed 2026-10-19 (#281–#293, main `5ca3c53f`). Overnight, four Claude Design canvases (42j) showed three variants each. Roger picked:

- **/search: B, "Sorted by what it is"** — https://claude.ai/artifact/42whDEiU23xTV8h9fc8Rbc (local `tmp/42/canvas-search/canvas/project/B-*.dc.html`)
- **/tags + term page: B, "Narrow it down"** — https://claude.ai/artifact/KBfnxjqGgAzsegiXMxcurh (`tmp/42/canvas-tags/root/project/B-*.dc.html`)
- **Meal plan: B, "Plan at home, cook through it", plus C's run-sheet features** — https://claude.ai/artifact/X7m2vXCZ1Kskek2naGeY1t (`tmp/42/canvas-plan/root/project/B-*`, `C-*`)
- **Recipe edit form: B, "Review, then save"** — https://claude.ai/artifact/Ba1WK5PsrjWh7whdfrH6dF (`tmp/42/canvas-edit/root/project/B-*`)

His other answers (2026-10-19): start now, unattended, report at the end; all four 42 follow-ups ride along (guest edit controls hidden, the shopping-list fixes, tag cleanup content, the workstation build timeout); the run sheet takes all of C's features.

Then, on What can I make and search (Roger, 2026-10-19): "the 'what can I make' page is hard to get started on with no ingredients — 'buy next' should show the most used ingredients in the filter result so I can easily build a stockpile from nothing after a clear. The 'let beans stand in for each other' checkbox is a bit too specific and I'm not sure the efficacy of the close matches button; I prefer being able to do a string match or regex for an ingredient (e.g. 'bean'), especially with off dupe ingredients like 'mayo' and 'mayonnaise', 'to cup italian parsley' in balela-salad, and 'mild feta cheese' + 'feta cheese' across recipes. I'm also interested in an AI-based search … ask a natural language question … prefill 'what can I make' and other pages." His answers: **plain items stay exact; patterns opt in** (`bean*`, `/regex/`, "Match every line with 'bean'"), refinable like 42m2's "any bean"; **both switches go** (the bean-swap tier is replaced by patterns; close matching stays on underneath without a switch); **Ask runs in the editor only and prefills pages** (never writes; not on the export). The "to cup italian parsley" name is a parser bug: "1/2 cup to 1 cup Italian parsley" doesn't parse the range.

Intended outcome: the four pages as picked, built on the site's components, tokens and real data; one shared facet model behind search, tags and the edit form's tag picker; the 42 backlog items fixed; What can I make that starts from nothing and matches the way Roger thinks about ingredients; an Ask box that turns a question into a filled-in page; a morning-report artifact.

The canvases' local copies (boards `*.dc.html`, the canvas CSS,
`canvas.json` notes) are in the orchestrator's scratch under
`tmp/42/canvas-{search,tags,plan,edit}/`.

## Decisions

- **D1 unattended:** conservative, reversible choices recorded as "Roger to confirm".
- **D2 one facet model:** a pure `common/util/facets.ts` (43f) groups the term tree into the boards' facets — Food: Course, Main ingredient, Cuisine, Speed & effort, Collections (root-level non-facet terms), Holidays; Drinks: Style, Strength & method (zero-proof, low-ABV, shaken/stirred…), Spirit & base, Families (children of `drink` that aren't a style or method — derived in code, no new record field) — with subtree totals and counts within any recipe set. Search's facet column, /tags' shelves, the term page's "Narrow" chips and the edit form's tag picker all use it. Builds on `FACET_ROOT_ORDER` (`homepageFacets.ts`), `DRINK_STYLE_SLUGS` (`drinksPage.ts`), `MakePage/tagTree.ts`.
- **D3 query stays the truth:** search facet rows and /tags' Combine write `tag:` terms into `?q=` (AND, today's semantics); no new filter state. "Kind: Drinks/Food" maps to `tag:drink` / `-tag:drink`.
- **D4 edit form keeps the data model:** same zod schema and server actions; ingredients shown as plain text with an amount column and re-marked on save (`stripMultiplyable` / `createIngredient` already round-trip); nothing a recipe stores is dropped.
- **D5 meal plan:** reorder + scale save as one commit through the existing group update; "made" and "mixed" ticks live in the browser (localStorage keyed by plan; "ticks stay on this phone"); chill / keeps / per-batch minutes / oven temperature / yields are read from step text by a pure parser that only reports what it finds plainly, and the page says "from the steps".
- **D6 content (43k):** tags are never removed from recipes; one-off drink-name tags become family terms under `drink` or aliases of existing terms only on a clear match; `house` gets a term record; dry run reviewed by the orchestrator first.

## Roadmap

| Phase    | Size | Branch                       | Status | PR  | What                                                                                           |
| -------- | ---- | ---------------------------- | ------ | --- | ---------------------------------------------------------------------------------------------- |
| 43a      | S    | `agent/43a-followups`        | 🟡     | —   | Epic 42 follow-ups: guest controls hidden, /shopping optional + duplicate rows, build timeout. |
| 43f      | S–M  | `agent/43f-facets`           | 🟡     | —   | The facet model (`common/util/facets.ts`) behind search, /tags and the tag picker.             |
| 43n      | M    | `agent/43n-ingredient-names` | 🟡     | —   | Ingredient names: ranges, dashes, synonyms, descriptors, a near-duplicate report.              |
| 43k      | S    | (content repo)               | 🟡     | —   | Tag cleanup: one-off drink-name tags to families or aliases, a `house` term.                   |
| 43s      | L    | `agent/43s-search`           | 📝     | —   | /search B "Sorted by what it is": Narrow column, bands, term card, ⌘K row.                     |
| 43t      | L    | `agent/43t-tags`             | 📝     | —   | /tags B "Narrow it down": board, Combine, term page, root pages.                               |
| 43p1     | L    | `agent/43p1-plan`            | 📝     | —   | Meal plan B: plan mode, cook mode, `planTimes.ts`, /groups.                                    |
| 43p2     | M    | `agent/43p2-run-sheet`       | 📝     | —   | The run sheet: C's features on the plan page.                                                  |
| 43e1     | L    | `agent/43e1-edit-form`       | 📝     | —   | Edit form B: section rail, Start from, duplicate check, save card.                             |
| 43e2     | M–L  | `agent/43e2-edit-fields`     | 📝     | —   | Edit form B: tags by facet, ingredient rows, steps, drink spec.                                |
| 43m      | M–L  | `agent/43m-make`             | 📝     | —   | What can I make: start from nothing, pattern items, both switches gone.                        |
| 43q      | L    | `agent/43q-ask`              | 📝     | —   | Ask: a question becomes a filled-in page (editor only, never writes).                          |
| 43-close | S    | `agent/43-close`             | 📝     | —   | Close-out, CLAUDE.md bullet, backlog, memory, the morning report.                              |

Ordering, in waves: **1** 43a ∥ 43f ∥ 43n (43k's dry run alongside); **2**
43s ∥ 43t ∥ 43p1 ∥ 43e1 (disjoint files; at most three queued for the heavy
slot); **3** 43p2 ∥ 43e2 ∥ 43m (on 43p1, 43e1 and 43n); **4** 43q (after
43s and 43m); then 43-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its
  own PR off fresh `origin/main`. A read-only review agent reviews every
  M/L branch **before its gates**; a worker past ~400k tokens hands its
  gates to a fresh finisher. Merge when every check that ran is green and
  the PR is `CLEAN`; merge commit; delete the branch. Strict up-to-date
  protection serialises merges: at most two PRs in CI, merged one at a
  time, the next merging main first.
- After merging main into a branch that owns screenshot baselines, the
  worker regenerates them with `--update-snapshots=all` in Docker (42's
  Tm2-1).
- Machine memory: 42's D6 — every heavy job through `heavy.sh` /
  `heavy-pw.sh` (Docker) / `heavy-bg.sh`, capped; at most three of the
  epic's jobs queued. The machine and the slot are shared with another
  session.
- Doc conflicts between parallel PRs: keep both sides; the close-out
  restructures the doc.
- Never deploy, never push the content repo, never `pnpm workstation
update`, never commit `editor/content`.

## Phases

### 43a — Epic 42 follow-ups (S)

- **Guest controls hidden:** recipe page (`editor/.../recipe/[slug]/page.tsx` — Delete/Edit/Copy/Feature/Group behind the existing `signedIn`), group page (`group/[slug]/page.tsx:58`), term pages (`TagPage/routes.tsx` `editorTagRoute`/`editorTagIndexRoute` — read the session; check the route is already dynamic via the root layout's `auth()`). Regenerate `recipe-detail-signed-out` etc. in Docker.
- **/shopping:** merged rows keep "optional" when every source line is optional (or show "optional for X" — decide by reading `shoppingView.ts` merge; record), and "gel food coloring" merges into one row; `shoppingView` vitest extended (the contract stays: change only these two behaviours).
- **Workstation build timeout (42s-T2):** editor `next.config` `staticPageGenerationTimeout` raised (e.g. 180 s) and, if measured to help, a bounded `experimental.cpus`; main-checkout-shaped build to verify.

#### Results (43a)

_Pending._

### 43f — The facet model (S–M)

`common/util/facets.ts` per D2 + vitest on real-shaped trees (drink styles vs methods vs families, Collections, holidays, nested children like Cookies › Linzer, aliases, counts within a result set, subtree totals). Read side: whatever the client already has (`/search/terms` `SearchTerm[]` via `useSearch().allTerms`; server `readTagBoard`/`readTagOptions`). No UI.

#### Results (43f)

**Landed.** `common/util/facets.ts` — the one facet model (D2), pure (no
reads; client- and server-safe: it imports only modules the browser already
loads), and `test/facets.test.ts` (33 tests). One additive change elsewhere:
`tagExpansion.ts` exports `buildTermLookup` — the spelling → term map
`tag:` already resolved by, pulled out into `spellingIndex` and shared by
`buildTagExpansion`, so a tag counted under a term is exactly the tag
`tag:<term>` finds. Review fixes (second commit): `matchesFilter` matches
a term's subtree only (Df9), Collections are of either kind (Df1), and a
row's click clears an exclusion.

**API summary (for 43s, 43t, 43e2, 43q).**

- **Input** — `FacetTerm {slug, label, parent?, aliases?, record?, image?}`.
  Adapters: `facetTermsFromOptions(SearchTerm[] | TagOption[])` (the
  browser's `useSearch().allTerms`, or `readTagOptions()`; carried-only
  terms included, no images), `facetTermsFromTree(tree)` (records, with
  images), `facetTermsFromBoard(readTagBoard())`. `carriersFromRows(byTerm
map)` turns a whole by-term map into `{slug, tags}[]` for the server.
- **Model** — `buildFacetModel(terms)` → `{terms, resolve(tag), ancestors,
children, groups, groupsOf}`. `groups` are `FacetGroupShape {id, kind,
label, root?, rows: slug[]}` in `FACET_GROUPS` order: food `course`,
  `main-ingredient`, `cuisine`, `effort`; `collections` (kind `"any"`); food
  `holidays`; drinks `style`, `strength-method`, `spirit`, `families`.
  `facetGroups({kind})` keeps the `"any"` group for either kind. Root-backed groups take
  their heading from the root record ("Speed & effort", "Spirit & base").
  Cycles and dangling parents are broken (`tagOptions`' rule).
- **Counts** — `countFacets(model, recipes: {tags?}[])` → `{total, kinds:
{food, drinks}, subtree, drinks, own, ownDrinks, groups, other}`. Any set:
  the corpus (/tags, the edit form), the current results (search's Narrow),
  a term's recipes ("Narrow X"). A recipe counts once per term over its
  subtree and aliases; `groups` is each group's distinct recipes (the
  heading number, "Course 571"); `other` is the "N other tags" list.
- **Rows** — `facetGroups(model, counts, {includeEmpty, keep, sort:
"count"|"label", order: "fixed"|"total", kind})` → `FacetGroup {…shape,
total, rows: FacetRow[]}`; `FacetRow {slug, label, count, ownCount,
depth, group, aliases?, image?, rule?, children}` nested (Desserts ›
  Cookies › Linzer Cookies), ties by label then slug. Holiday rows carry
  `rule` (the `HOLIDAY_RULES` key via `holidayRuleKey`, so an alias dates
  it) for `nextOccurrence` / `orderByNextOccurrence`. Helpers:
  `flattenRows` (depth-first, for dot-leader lists), `limitRows(rows, n,
keep)` → `{rows, hidden}` ("5 more", a selected row kept past the cut),
  `narrowRows(model, counts, {exclude, limit, kind})` (a term page's chips:
  rows some but not all of the set carries, minus the term's own line).
- **Query (D3)** — over `queryLanguage.ts` (the brief's `hastQuery.ts` is the
  HTML helper; the parser is `components/SearchForm/queryLanguage.ts`):
  `activeFacetSlugs(model, q)` (positive `tag:` values resolved, so
  `tag:Mains` presses Mains), `toggleFacet(model, q, slug)` (removes every
  positive spelling of the term; else removes an exclusion — `-tag:sour`
  back to neutral; else appends `tag:<slug>`), `queryKind` /
  `setQueryKind(model, q, "drinks"|"food"|undefined)` (`tag:drink` /
  `-tag:drink`), `facetQuery(slugs, kind?)` and `facetSearchHref` (/tags'
  Combine → `/search?q=tag%3Amain%20tag%3Achicken`).

**Checked on real shapes** (illustrative, not targets — the counts come
from whatever the content is). A read-only scratch clone of the content
repo after 43k (`95ce65f5`, `tmp/43/43f/`, deleted after) through
`facetTermsFromTree` + `countFacets`: 825 recipes = 222 drinks + 603 food;
Course 597 (Desserts 148 › Cookies 45 › Linzer 3; Salads 77 › Bean Salads 48
— "bean salads" as carried resolves), Main ingredient 399, Cuisine 384,
Speed & effort 327, Collections 86 (Fall Favorites 64, House recipes 18,
Syrups 5 › Lavender Syrup 3…), Holidays 153 (8 rows, each dated); Style 217
(7), Strength & method 134 (Shaken 79, Zero-proof 30, Low-ABV 29), Spirit &
base 201 (11), Families 209 (113 top-level rows, e.g. Spritz 10 › Aperol
Spritz 3 › Zero Proof Aperol Spritz); **0 other tags** (before 43k: 90, the
canvas's number). "Narrow Christmas" over its 41 recipes: Desserts 29,
American 27, Cookies 23, Easy 12, Breakfast 9, Chocolate 6 — the canvas's
chips. **Count/click parity:** for all 225 rows (any depth), the row's
count equals what `tag:<slug>` finds through `matchesFilter` with the
tree's resolver (drinks rows over drinks) — 0 mismatches, which Df9 is for.

**Decisions.**

- **Df1 — Collections** are the _recorded_ roots that are no food facet
  root, `drink`, `spirit` or `holidays` (after 43k: `fall`, `house`,
  `syrup`). They have **no kind** (`kind: "any"`): House is mostly drinks
  and Syrups are bar recipes, Fall Favorites dishes, so the group shows for
  `kind: "drinks"` and `"food"` alike and the counts within the set decide
  which rows it has. `/tags` draws it on the Food shelf (canvas B). A new
  facet root added to the vocabulary also lands in Collections until it is
  listed in `FACET_ROOT_ORDER` (and `FACET_GROUPS`).
- **Df2 — Style vs Strength & method.** `DRINK_STRENGTH_METHOD_SLUGS =
zero-proof, low-abv, shaken`; Style is the rest of `DRINK_STYLE_SLUGS`
  (sour, highball, collins, stirred, built, batch, warm-drinks). `stirred`
  and `built` stay styles: the vocabulary's records and agent-mixology.md
  call them styles, and canvas B files them there; `shaken` is the one
  method tag (27c D1). No `blended` term exists. A slug in neither list
  that sits under `drink` is a Family.
- **Df3 — Families** are derived: children of `drink` in neither list (no
  record field). A family's own children nest under it.
- **Df4 — drinks groups count drinks only** (a recipe under `drink`), as
  `/drinks` does (a `tea` cake is no Tea drink); food groups, Collections
  (either kind, Df1) and Holidays count every recipe in the set (holidays
  mix dishes and drinks). `kinds.food` is "not under `drink`".
- **Df5 — Kind** is read from terms resolving to `drink` itself (any
  spelling, `-` or `NOT`); a query saying both is no kind. `setQueryKind`
  drops them all and appends one.
- **Df6 — Other tags** = tags no term spells, plus terms with no record (a
  string only recipes carry). Every record is placed (it hangs under a
  group's root or row, or is a Collection), so a record is never "other";
  since 43k recorded the one-off drink names, the list is empty today.
- **Df7 — row values are slugs** (`tag:main`), not labels: unique and never
  quoted; activeness is resolved through the model, so typed labels
  (`tag:Mains`) still press and un-press the row.
- **Df8 — a listed slug stays in its list** wherever it sits: a style moved
  under `holidays` one day would still be a Style row and not a holiday.
- **Df9 — `tag:<term>` matches the term's subtree only** (D3 count/click
  parity; `matchesFilter` in `queryLanguage.ts`). Before, a `tag:` value
  was always also a word-start prefix match, so a facet row's click found
  more than its count: `tag:side` found the Sidecar, `tag:french` French 75
  and French Martini, `tag:mexican` the Mexican Mule, `tag:gin` /
  `tag:vodka` / `tag:wine` the drink-name families starting with them. Now
  a value the resolver names (`expandTerm`: slug, label, alias) matches
  only carriers whose folded spelling or slug is in that subtree; a value
  that names no term (`tag:sid`, still being typed) keeps the prefix match,
  as does any search without a resolver (the corpus before
  `/search/terms` lands). The server's `recipe_search` / `list --tag` share
  `matchesFilter`, so the CLI and MCP narrow the same way. The e2e specs
  were grepped for prefix reliance: every `tag:` value they type is either
  an exact fixture tag or names no term (`tag:des`, `tag:swe`), so no
  expected diff; `search-query-language`, `search-tags` and
  `search-query-chips` rerun in Docker (below).

**Gates.** `pnpm --filter recipe-editor typecheck` ✓, `pnpm --filter
recipe-website exec tsc --noEmit` ✓, `pnpm exec vitest run` **135 files /
2763 tests** ✓ (all through `heavy.sh`; after the review fixes —
`facets.test.ts` 33, `tagExpansion.test.ts` 20 with Df9's two). Playwright for Df9, Docker production build:
`search-query-language`, `search-tags`, `search-query-chips` — **36
passed**. No UI.

**Roger to confirm.** Df2 — `stirred` and `built` as styles (the canvas and
the records) rather than methods beside `shaken`; moving them is a
one-line change to `DRINK_STRENGTH_METHOD_SLUGS`. Df9 — a whole term name
after `tag:` no longer also prefix-matches longer tags (`tag:gin` is the
Gin drinks, not Gin and Tonic unless it carries `gin`). A half-typed
value still prefix-matches; going back is the one `if (!subtree)` branch.

### 43k — Tag cleanup (content, orchestrator-run agent)

Dry run → orchestrator review → apply through the CLI (D6): the ~90 one-off "other tags" (mostly drink names) classified into a family term under `drink`, an alias of an existing term, or left; `house` (18 recipes) read and given a term record. Then the /tags board's "Other tags" is short. Revalidate; verify counts.

#### Results (43k)

_Pending._

### 43s — /search B "Sorted by what it is" (L)

Files: `common/components/SearchForm/` (`SearchResults.tsx`, `TagFilterRail.tsx` → facet column, `SearchList`), `CommandPalette/index.tsx`, the masthead (`AppLayout`).

- Left **Narrow** column from 43f, counts within results, top 2–4 per group + "N more", rows toggle `tag:` (D3); Kind row; footnote copy.
- **Bands:** Drinks / Food with "All N drinks / dishes" (writes `tag:drink` / `-tag:drink`), 4 cards + "Also:" names line; single-kind fallback per the canvas.
- **`tag:` query opens on the term:** term card (breadcrumb, description, count, Narrower chips, "Open the X page"), then bands by date: upcoming holidays (42e's `holidaysPage`/`holidays.ts`), collections, "Any time".
- **Cards:** 4:5 image, `<mark>` styled from tokens, meta (style/course · time), the "why" line with the matched ingredient's quantity in mono (`parseAmount`, only once ingredients are loaded).
- Completions with counts (dedupe "pumpkin seed/seeds"); ⌘K's last row **"All N results in search"** (Ctrl ↵); no-result state ("Nothing mentions quince", Import a recipe — signed-in only, Clear, "Or browse by" roots); masthead drops its search trigger on /search; phone toolbar with a **Narrow** sheet (Radix dialog).
- Tests: the search specs, `command-palette.spec`, `empty-state` `search-no-results`, `visual.spec` search baselines (regenerate), new specs for facets/bands/term card/palette row.

#### Results (43s)

_Pending._

### 43t — /tags B "Narrow it down" (L)

Files: `common/components/TagPage/` (`shared.tsx`, `routes.tsx`), `readTermPage.ts`, `tagVocabulary.ts`.

- **Board:** h1 + "New term" (signed-in); **Find a tag** combobox (names + aliases, `searchTags`); **Combine** bar (tokens with facet name, × remove, live intersection count from the search corpus, "Show N recipes →" to `/search?q=tag:a tag:b`); Food shelf (4 facet columns + Collections, dot-leader rows nested, + to combine), **Holidays** aside (dated rows → `/holidays/<slug>`, "Each holiday's menu, in the almanac →"), Drinks shelf (Style, Strength & method, Spirit & base, Families run-in list), "N other tags" `<details>`.
- **Term page:** actions top-right (signed-in only), count ticker incl. aliases ("41 recipes · 1 plan · also filed as …"), holiday "when" card (countdown, "Open the X menu", "What can I make with these?"), plan card, pin slot, **"Narrow X"** chips filtering in place (counts within the term's recipes — read all the subtree's rows, not the 48-row cap, if 34a's rows are small enough; measure and record), list head with Grid/List, cards without the page's own tag.
- **Root page** (e.g. /tags/course): one photo row per narrower term by count, sub-chips, "And N more" dot-leaders, By course / Newest.
- Phone: Holidays first, accordions per facet, "Long-press to combine" hint (D1: a visible + button is fine instead; record).
- Tests: `tag-pages.spec`, `term-edit.spec`, `holidays.spec` term links; **first /tags baselines** (board, term, root; e2e + mobile).

#### Results (43t)

_Pending._

### 43p1 — Meal plan B "Plan at home, cook through it" (L)

Files: `editor/.../group/[slug]/page.tsx`, `common/components/GroupDetailPage/`, `groups/` list, a new pure `common/util/planTimes.ts`.

- **Parser** `planTimes.ts` on `headsUp.ts`, `timeText.ts findStepTimes`, `stepIngredients`: per recipe → chill (min/max), keeps N days, rest, per-batch bake minutes (min/max), oven temperature, yield (number/range + unit from `recipe.yield`), "then N min in the freezer"-style extras; only plain statements (D5); unit tests on real-shaped fixtures with positives and negatives.
- **Plan mode** (desktop default): head (Plans eyebrow with holiday countdown from the plan's tags, Plan/Cook segmented, More menu with Edit/Feature/Delete signed-in only); "In order" rows (drag handle, number, thumb, name, "time · yield · N ingredients", heads-up line, scale select, row menu) with **one Save** for reorder + scale (D5); "Add a recipe or a plan by name"; label headings (a label starting with a day is a day); sub-plan rows expand in place (`walkGroupRecipes`).
- **Rail:** Shopping list (from the shopping store: lines/rows/ticked, Open list / Take it off the list via `removeSource {group}`), From your shelf (`useMakeable` over `group:<slug>` → ready/two away/need more + missing tapes, "Open in Make" `/make?q=group:`), Make ahead (from the parser).
- **Cook mode** (phone default): progress "N of M made" (ticks per browser, D5), **Up next** card (photo, caption, heads-up note, Open in cook view, Mark made), Still to make, Made, link rows.
- **/groups list:** B's row cards (thumb strip, holiday eyebrow, counts, on-list caption, Plan / Cook buttons), "+ New plan", no lone pagination icon; masthead marks Plans current.
- Timer ids get the recipe slug if timers appear here (`stepTimerId` collides across recipes); `MultiplierProvider` gains an `initial` scale if needed.
- Tests: `groups.spec` (reading, scale, nesting, edit), new plan-mode/cook-mode specs; **first group-page baselines** (plan e2e, cook mobile, /groups).

#### Results (43p1)

Branch `agent/43p1-plan`. **Reindex needed: no** (no index, projection or
spec version moved; groups write through the existing `setItems` /
`addItem` seats). **Deploy: yes** — the plan page and `/groups` change in
both apps.

**What changed.**

- **`common/util/planTimes.ts`** (pure, D5) — the parser 43p2 builds on.
  `readPlanTimes(recipe)` reads each recipe's **steps only** (never the
  description) and returns, each as a `PlanFact {value, sentence, step}`
  (the quoted sentence and its page step number, through groups as 42c1's
  Dc8):
  - `chill` — `{min?, max?, atLeast?, overnight?}` in minutes: "chill for at
    least 3 hours", "1-2 hours", "must be chilled for 1 hour", "in the
    refrigerator for 2 hours", "… or overnight", "refrigerate overnight";
  - `keeps` — `{count, max?, unit: day|week}`: "or up to 3 days", "made 2
    days ahead", "keeps 2-3 days" (only beside dough / chill / make-ahead
    words; never leftovers, room temperature, the freezer, or stored baked
    goods);
  - `rest` — "let it sit … about 20 minutes", "let stand 5-10 minutes";
  - `bake` — `{min, max?, about?, perBatch}`: the first "bake … N minutes"
    (not pre-bake, par-bake, blind bake, baked, baking); `perBatch` when the
    steps say "batch" or the yield / sentence is cookies-like;
  - `oven` — `{degrees, unit}`: "350°F (177°C)", "375 degrees F", "180°C",
    "400 F"; a unit is required;
  - `extras[]` — `freeze` ("… in the freezer for 10 minutes", "then 10
    minutes in the freezer") and `set` ("allow the icing to set for 24
    hours", what sets named);
  - `yield` (from `recipeYield`, no sentence) — `{min, max?, unit, about?,
text}`: "84 bite-size cookies", "20-22 cookies", "Makes about 24",
    "Serves 4", "Servings: 8", "2 dozen cookies" (×12), Multiplyable markup.
    The single-sentence readers (`readChill`, `readKeeps`, `readRest`,
    `readBake`, `readOven`, `readExtra`, `parseYield`) are exported, with the
    wording (`formatChill`, `formatChillShort`, `formatKeeps`, `formatDays`,
    `formatBake`, `formatOven`, `formatExtra`, `formatYield`, `formatSpan`,
    `formatMinutes`) and the plan summary `summarizeMakeAhead(entries)` →
    `{recipes, chilling (longest first), doughs, keepsDays, ovens (commonest
first, with counts), extras}`. **For 43p2:** call `readPlanTimes` per
    recipe (the page already has it on every row as `row.recipe.times`, from
    `readPlanPage`), `summarizeMakeAhead` for the hero stats and the day-before
    list, `times.bake.value` (min/max, `perBatch`) for the oven bars,
    `times.yield` for the yields, and print "not set" where a field is absent.
- **`common/util/planPage.ts`** (pure): the page's view model — row types
  (`PlanRowView`, `PlanRecipeView`, `PlanSubPlanView`, `PlanPageData`),
  `readLabel` (a label that starts with a day is a day), `labelRuns`
  (consecutive rows that share a label share a heading), `rowCaption`
  ("1 h · 84 bite-size cookies · 6 ingredients", "… · no time or yield set"),
  `yieldLine` (scaled: "16 servings at 2×"), `headsUpLine`, `cookCaption`,
  `aheadNotes`, the draft (`initialDraft`, `moveRow`, `removeRow`,
  `setRowScale`, `draftItems`, `draftChanges`, the scale presets) and the
  tick keys (`tickKeys`, `madeStorageKey`, `parseTicks`).
- **`common/controller/data/readPlanPage.ts`** (both apps, cached reads
  only): the rows `resolveGroupItems` read, each recipe's `readPlanTimes`,
  each sub-plan walked (`walkGroupRecipes`, capped at 48) for the row that
  opens in place, and the holiday the plan is for (its first tag that is a
  `holidays` child or an alias of one, dated by `holidayRule`).
- **The plan page** (`common/components/GroupDetailPage/`): `index.tsx`
  stays the server component both routes render — it reads the data,
  renders the pictures (server `RecipeImage`, so the export generates them
  at build time), the description and Appears in, and hands plain data to
  the client `PlanPage`:
  - `PlanHead.tsx` — the eyebrow "Plans · Meal plan · for Christmas, 25 Dec
    · in 68 days" (date and countdown on the browser's day, 42-De2), the
    title, description, the plan's own picture, tags, "N recipes · created
    …", "Search within this plan", the Plan/Cook switch, and — signed in —
    **More** (Edit, Feature, Delete, which asks in an alert dialog outside
    the popover).
  - `PlanList.tsx` — **Plan mode**: "In order", label headings, rows with a
    drag handle (HTML5 drag, armed from the handle), number, 72 px thumb,
    name, caption, the heads-up line from the steps and the item's note; a
    scale select (½× · 1× · 1½× · 2× · 3× · 4×, plus a row's own odd value)
    and a row menu (Move up, Move down, Remove from the plan) when signed
    in. Every change is a **draft** — "2 changes · not saved", Undo, Save —
    and **Save** writes them as **one commit** through `setItems` (D5).
    "Add a recipe or a plan by name" (recipes and the other plans from the
    search corpus, matches as buttons) is one commit through `addItem`.
    Sub-plan rows show a 2×2 mosaic and open their recipes in place.
  - `PlanRail.tsx` — **Shopping list** (signed in): "This plan is on your
    list: 12 lines, merged into N rows. None ticked yet.", Open list, Take
    it off the list (confirmed in place, `removeSource {group}`, one
    commit) — or, off the list, the existing Add to shopping list with its
    scale. **From your shelf**: `useMakeable` over `group:<slug>` (Count
    from and the staples as on /make) → ready / 1–2 away / need more, the
    nearest recipe's missing lines as dashed tapes, Open in Make. **Make
    ahead**: "3 of 4 doughs chill. Mix them the day before; they keep 3
    days.", the chill list longest first, "All four bake at 350°F.", the
    extras, "From the steps."
  - `CookList.tsx` — **Cook mode**: "N of M made" with a bar ("ticks stay
    on this phone"; "the sub-plan counts as one"), **Up next** (photo, time
    · yield · per-batch minutes at the oven, the chill/rest sentences
    quoted with their step, Open in cook view, Mark made), Still to make,
    Made, Start over, then the Shopping list / From your shelf / Make ahead
    line rows (a fold where there is something to open). A plan with labels
    cooks by label instead: day headings, "up next" on the current one, the
    ticks inline and "Cook <recipe> at 2×".
  - `planState.ts` — the mode (`?mode=` first, then this browser's choice
    under `plan-mode`, then the viewport: `lg` and up Plan) and the made
    ticks under `plan-made:<slug>`, both via `useSyncExternalStore`, read
    after hydration.
- **The cook view opens from a link**: `FocusViewButton` opens at
  `?cook=1` as the recipe page hydrates and drops the parameter when it
  closes (`util/cookViewParam.ts`); the plan's links carry `?scale=` too.
- **`/groups`** (`GroupIndexPage/shared.tsx`, `GroupThumbnail/PlanStrip.tsx`):
  B's row cards — up to six member photos (the plan's own picture first,
  then members, then the placeholder; `group-thumbnail` / `data-group-image`
  kept), the kind and holiday eyebrow with its countdown, name,
  description, counts, "on your shopping list (N lines)" (signed in), and
  Plan / Cook links into the modes; "N plans · newest first", **New plan**
  in the head (signed in, the editor's own `groups/routes.tsx`), the
  pagination only when there is more than one page, B's footnote.
- **The masthead marks Plans** on a plan page: `navCurrent` gives
  `aria-current="true"` for a page in a destination's section (`/group/x`
  in Plans), styled as the current page; `"page"` stays the page's own.
- **The editor's routes**: `group/[slug]/page.tsx` builds the editor props
  for a signed-in session only (Save, Add, Delete, the shopping summary,
  the saved list as From your shelf's second list); a guest gets the
  export's read-only page with the house list when one is baked. The export
  route passes the house list. New server actions `savePlanItems` and
  `addPlanItem` in `controller/actions/groups.ts`.

**Decisions.**

- **Dp1-1 — the heads-up line claims no absence.** The board's "No chill ·
  7–9 min a batch" is not drawn: a parser that found nothing can't say there
  is nothing. Only what the steps state shows.
- **Dp1-2 — the server renders Plan.** The ordered list is the document:
  the export's static HTML and a reader without scripts get the whole plan,
  and a phone switches to Cook as it hydrates (the opposite of 42-Dg1's
  Shop-first, because a plan page is read at home more than in a hurry).
  `?mode=plan|cook` (the /groups buttons) wins over the stored choice.
- **Dp1-3 — "1–2 away" for the shelf's middle tile.** The board says "two
  away"; the tile counts one-away and two-away recipes together, so it says
  so.
- **Dp1-4 — Add is its own commit and waits for Save.** With unsaved
  reorder/scale changes the add field is disabled ("Save or undo the
  changes above first."), so an add never lands under a draft that hasn't
  been written.
- **Dp1-5 — Save is forced past dangling rows.** `setItems` refuses an
  unknown recipe unless forced; the page only writes back rows the plan
  already had, so a dangling row (a legitimate state, D3) doesn't block a
  reorder. Remove is part of the draft, not an immediate write.
- **Dp1-6 — ticks are per browser, never expire.** `plan-made:<slug>`, in
  localStorage (D5), with Start over. A sub-plan row is one tick; its own
  recipes' ticks are the sub-plan's page's, shown as "N made".
- **Dp1-7 — timers and `MultiplierProvider` untouched.** No timer runs on
  the plan page (Open in cook view goes to the recipe, whose timers keep
  42c2's ids), and `?scale=` already seeds the recipe's multiplier, so
  neither needed the change the plan allowed for.
- **Dp1-8 — no new dependency for drag.** Native HTML5 drag-and-drop from
  the handle on a wide screen; the row menu's Move up / Move down is the
  keyboard's and the phone's way (HTML5 drag doesn't fire on touch).
- **Dp1-9 — the plan's own picture stays** (max 24 rem, under the
  description), though B's board draws none: 22h's picture and its specs
  are kept.
- **Dp1-10 — 43a overlap.** 43a also hides the group page's guest
  controls; this phase replaces that bottom bar entirely (the More menu,
  signed in only). Whichever merges second keeps this version.

**Not built:** the board's 225 px sugar-cookie photo is a content matter
(the stored image is small); the row thumbnail is 72 px, so it no longer
shows. C's run sheet is 43p2's — the page's modes are a component switch
in `PlanPage.tsx`, so a third section slots in beside Plan and Cook.

_Gates, baselines and "Roger to confirm": below once run._

### 43p2 — The run sheet: C's features on the plan (M)

On 43p1's page and parser: hero stats (recipes · doughs chill · one oven °F · yields summed as a range "+ X" for unset), **Day before · mix + chill** checklist with chill tapes and per-dough "mixed" ticks (separate from "made"), **Baking day** per-batch oven bars drawn to scale (max from the plan's longest bake), the run-sheet table on desktop (# · recipe · day before · baking day · makes · made), big mono yields, the **shopping docket** (torn edge via `clip-path`, aisle counts, "the big ones" from `buildShoppingView` read-only), header copy "Start the bake". Where the parser finds nothing, the column says so ("not set"). Baselines regenerated.

#### Results (43p2)

_Pending._

### 43e1 — Edit form B: review, then save (L)

Files: `editor/.../new-recipe/` (`form.tsx`, `workspace.tsx`, `ImportProgress.tsx`), `recipe/[slug]/edit/`, `common/components/Form/` (`index.tsx`, `RecipeFormShell.tsx`).

- Layout: a sticky **section rail** (Start from · Recipe · Tags · Picture · Ingredients · Steps · Times · Source; statuses from the form state: "✓ imported", "from the page", "N chosen", "12 · 1 check", "6 · all lines used"), the save card in the rail ("Create recipe" / "Save" + "Cancel" + "N changes · not saved"; on the phone a sticky save bar above the tab bar), sections as headings with rules, sentence-case labels, primary only on Save.
- **Start from** card: five ways in (Link, Text, Photo, Roundup, Blank) as a radiogroup over the existing import modes and `RoundupImport`; the live job panel inside (reuse `ImportProgress`); collapses to a **receipt** after the import.
- **Duplicate check at Import time** by source link: export `existingBySource` (`curation/importList.ts`) behind a server action; the flag "Already in your recipes" with Open it / Edit that one instead / Keep importing — save as a copy (a `-2` slug helper next to `resolveCreateSlug`).
- Edit mode: the same rail and sections (no Start from), Save/Cancel, change count; phone jump row of section pills.
- Error states: inline under fields + a rail marker; the slug-conflict Overwrite path still works.
- Tests: `new-recipe.spec`, `edit.spec`, `jobs.spec`, duplicate-slug specs, `accessibility.spec` forms; baselines `new-recipe-form*`, `edit-form*` regenerated; a new duplicate-flag spec.

#### Results (43e1)

_Pending._

### 43e2 — Edit form B: tags, ingredients, steps, drinks (M–L)

- **Tags by facet** (43f): rows per facet with counts; chosen chips in the heading; "Anything else" combobox (`TagSearch` pattern) that can also add a new tag; the import's `suggestedTags` shown dashed until accepted when they match a term or alias; "a child brings its parent" follows skill v4's existing convention (check what imports store; record). Keep the control names specs rely on ("Add a tag", "Remove tag X") where possible.
- **Ingredients as rows:** index · mono amount column (`parseAmount`) · plain text with muted asides · actions; headings as tape rows; "Rows | Edit as text" toggle (the existing PasteField path); flags like "The * points at a note that did not come in".
- **Steps:** textarea per step with a "uses" row (`matchStepIngredients`, confident only), "a wait in it" chips (`findStepTimes`), footer "Every ingredient is named in a step" / "Not named in a step: …".
- **Drink spec** first on a drink: Method segmented control that also sets its style tag (shake→`shaken`, stir→`stirred`, build→`built`; blend sets none — record), Glass / Ice chips, Garnish.
- **Times** with the prep + cook hint; **Source and address** (slug, date); "Video" labelled once; drink spec / timelines "appear when …, add one anyway".
- Tests: `recipe.spec` drink spec, `recipe-tags-aggregate.spec`, `paste-review`/`paste-replace`, `ingredient-preview`, form vitest; baselines regenerated.

#### Results (43e2)

_Pending._

### 43n — Ingredient names: ranges, synonyms, near-duplicates (M)

Files: `common/util/ingredientNames.ts` (`parseIngredientLine` :732, `toName` :370, `stripMarkup` :462), `ingredientAmount.ts`.

- **Parser fixes** (real lines from balela-salad): "1/2 cup to 1 cup Italian parsley – chopped" → `italian parsley` (today "to cup italian parsley"); "1/4- 1/2 teaspoon cayenne or aleppo chili flakes"; "garbanzo beans- (2 cans, drained…)"; "red bell pepper-diced". Survey the corpus read-only for other range / dash shapes and fix what's common; vitest on each shape.
- **Synonyms and descriptors:** a curated, small table where two names are one ingredient (mayo = mayonnaise, garbanzo = chickpea, …) and descriptors that don't change what you buy (mild, fresh, …) — applied in name normalization so Make, the shopping list's merge and step matching agree. Never merge varieties that matter (Italian parsley stays parsley-family via a pattern, not a synonym, unless the survey says the corpus uses them interchangeably — record).
- **Near-duplicate report** (`scripts/ingredient-dupes.ts`, read-only over a corpus copy): names that differ only by plural, descriptor, word order or a known synonym, with counts — feeds the table and the morning report (Roger picks further merges).
- **Index impact:** if normalized names feed an index or `specVersions`, bump per the rules (the index-version stamp rebuilds at start, 39b; record "reindex: automatic"). Run the shopping-view and makeable suites as the contract; expected diffs listed in Results.

#### Results (43n)

_Pending._

### 43m — What can I make: start from nothing, pattern items (M–L)

Files: `common/util/makeable.ts`, `matchers.ts`, `beans.ts`, `MakePage/` (`index.tsx`, `MakeResults.tsx`, `InventoryPanel.tsx`, `AddField.tsx`, `MatcherTape.tsx`, `useInventory.ts`), the inventory seat + CLI/MCP.

- **Start from nothing:** when the counted list is empty (and as a small "Most used here" tab beside Buy next otherwise — record), show the ingredients the scoped recipes use most (normalized names via 43n, counts "in 34 of 120 drinks"), each a tap-to-add tape with Undo; Clear lands there.
- **Pattern items:** `bean*` (any line naming a word starting "bean"), `/regex/` (case-insensitive over the line's normalized name; length-capped, compiled safely, an invalid pattern shows an inline error), and the add field's "Match every line with 'X'" option; pattern tapes look like 42m2's matcher tape and **refine** the same way (members found in scope with counts → "Keep only these"). `any bean` keeps working (read as the bean family pattern) so saved lists don't break.
- **Remove** the bean-swap tier and its switch, and the "Count close matches" switch (close matching stays on underneath); settings migration tolerant of old keys; the CLI/MCP `inventory make` drops `beanSwap` / `--no-bean-swaps` but still accepts the flag as a no-op (record), and supports pattern items (41i parity).
- Tests: makeable/matchers vitest (patterns, regex errors, refine, empty-start ranking), `make.spec` (start from nothing → tap to add, a `bean*` and a `/may(o|onnaise)/` item, refine), CLI/MCP suites; `make-page-*` baselines regenerated.

#### Results (43m)

_Pending._

### 43q — Ask: AI search that fills in a page (L)

Editor only (D1: never on the export; never writes).

- **Server:** `POST /api/ask` (signed-in or the read scope the other read APIs use) → the existing LLM layer (`chatJson`, 36; Claude API backend, 38g; `RECIPE_LLM_*`, through the GPU queue for the local model) with a prompt carrying the query language, the facet/term vocabulary (43f) and the page targets; the model returns JSON validated by zod: `{page: "search"|"make"|"holiday"|"tag"|"plan", q?, kind?, features?, patterns?, slug?}` → a URL. A grounding check rejects tags/terms that don't exist (no invented tags). Timeout and a plain "Couldn't work that out — searching for the words instead" fallback to `/search?q=<question>`.
- **UI:** an "Ask" row in ⌘K when the input reads like a question (or Tab to Ask), and an Ask toggle on /search; a short "Opening What can I make: drinks with lime" line while it routes; the resulting page shows "Filled in from: <question>" with an undo-able query.
- **Prefill targets:** /make (kind, featured ingredients, pattern items as a temporary scope — not written to the saved list), /search (query), `/holidays/<slug>` (kind), `/tags/<slug>`, a plan.
- Tests: vitest with a stubbed model (`vi.stubGlobal` fetch) for parsing, grounding and fallback; a Playwright spec with the stub (`OLLAMA_STUB_PORT`); never a real model in tests. The orchestrator runs one real check on the workstation (GPU etiquette with Archilyzer) and records latency; the Pi path is Roger's to try after deploy.

#### Results (43q)

_Pending._

### 43-close (S)

Close-out in `agent-epic-43.md`, CLAUDE.md bullet, backlog rows, memory, the morning-report artifact (what to look at first, before/after screenshots, what merged, Roger to confirm, Roger's steps: `pnpm workstation update` on a quiet machine, `pnpm deploy:pi`, reindex only if an index version changed), remove the session's `content-engine-playwright:agent-*` tags.

#### Results (43-close)

_Pending._

## Verification

- **Every PR:** typecheck ×2 and vitest (counts) via the capped wrappers; touched specs in Docker build mode, new specs once in dev mode; CI green and CLEAN incl. the main-checkout-shape build; review agent findings fixed before gates.
- **Per surface:** baselines regenerated in Docker only (`=all` after merging main), each opened against its canvas board; axe WCAG 2.2 green; no sideways scroll at phone width; targets ≥ 24 px.
- **Per phase:** 43f / 43p1 parser unit tests with real-shaped positives and negatives listed in Results; 43s ranking/result parity (the 42s limit and `matchesFilter` unchanged — existing vitest is the contract); 43e1/43e2 a save round-trip test proving an imported recipe's stored ingredients, tags and drink spec are identical before and after an edit with no changes (D4); 43a the shopping vitest contract plus the two fixes; 43k counts verified by `term get` and revalidate.
- **43n / 43m / 43q:** the parser shapes from balela-salad and the survey as vitest cases; the near-duplicate report attached to Results; pattern and empty-start specs; Ask with a stubbed model only in tests, plus one recorded real run on the workstation.
- **After merge:** Roger checks /search, /tags, a term page, /tags/course, a meal plan (plan + cook), /groups, the new-recipe and edit forms on the workstation after `pnpm workstation update`.

## Close-out

_Pending (43-close)._
