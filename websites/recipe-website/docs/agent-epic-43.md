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

**Guest controls hidden.** The editor's recipe page (Delete, Edit, Copy,
Feature, Group: the whole `PageActions` row), group page (Delete, Feature,
Edit, Add to shopping list) and term pages (Feature, Edit, Add a narrower
term, and `/tags`'s New term) render them only with a session, read the way
the recipe and group pages already read it (`Boolean((await auth())?.user?.email)`).
The pages were already per-request renders (`force-dynamic`, and the root
layout's `auth()`), so nothing changes in rendering mode. `TagPage/routes.tsx`
is shared with the export, which must not import editor auth: `editorTagRoute`
and `editorTagIndexRoute` now take `signedIn`, and the editor's two route files
(`tags/page.tsx`, `tags/[tag]/page.tsx`) read the session and pass it in. The
export's `tagRoute` is untouched.

- New `guest-controls.spec.ts` (4 tests): signed out, none of the controls;
  after signing in on the page, all of them.
- Seven existing specs reached these controls signed out ("click Edit, then
  sign in"). They now go to the control's target (`/recipe/<slug>/edit`,
  `/group/new?recipe=`, `/featured-recipe/new?recipe=`, `/tags/new`,
  `/tags/new?parent=`), which still lands on the sign-in form with
  `redirectTo` kept: `recipe.spec`, `groups.spec` (2), `featured-recipes.spec`,
  `term-edit.spec` (2).
- Baselines moved (Docker, opened and checked): `recipe-detail-signed-out-e2e`
  and `recipe-6-multiplied-e2e` lose the Delete/Edit/Copy/Feature/Group row
  under the ingredients (the page is 49 px shorter). No other PNG changed.

**/shopping.**

- **The duplicate "gel food coloring"** (found in the real shopping store:
  two items, from `christmas-sugar-cookies-recipe-with-easy-icing` and
  `my-favorite-spritz-cookies`): "optional: gel food coloring & sprinkles for
  decorating" and "optional: gel food coloring, sprinkles, chocolate chips,
  and melted chocolate for decorating". The name reader never splits on `and`
  / `&` (right for "mac and cheese"), so the first line's name was the whole
  "gel food coloring sprinkle for decorating", while the comma form keys by
  its first item, "gel food coloring". Two keys, two rows. Fix, in
  `shoppingNameOf` only (`ingredientNames`, which Make shares, is untouched):
  a line that joins items with `&` or `and` and ends in a decorating tail
  (`for decorating|garnish|topping|dusting|dipping|sprinkling|serving`) is
  read by its first item, as the comma form is. Any other line is untouched.
- **"optional"** (`Da1`): the merge already marks a row optional when every
  source line is (`items.every(optional)`), so the mark was lost only because
  the two lines never shared a row. A row from some optional and some
  required lines is **not optional**: you buy it for the recipe that needs it.
  Recorded and pinned by a test; no "optional for X" text was added (it
  would change `buildShoppingView`'s output for every mixed row).
- Vitest: `shoppingView.test.ts` 35 → 38 (name keys, one merged optional
  row, all-vs-some optional). The 35 earlier tests are the contract and pass
  unchanged.

**Build timeout (42s-T2).** The editor's `next.config.mjs` sets
`staticPageGenerationTimeout: 180`. No `experimental.cpus`: not measured to
help (the default 7 workers built everything below). Main-checkout-shaped
build (`editor/content` linked to a scratch clone of the real content repo,
reindexed; `export/public/{image,uploads}` absolute links through it; scratch
removed afterwards): `next build` **303 static pages in 84 s** at load ~20,
no "Dynamic filesystem access" and no "leaves the filesystem root" warning.
That run would also have passed at the 60 s default, so it shows the setting
is harmless, not that it is needed; the failure it guards (42s-T2) needs a
loaded machine (~30).

**Gates.** `recipe-editor` typecheck clean; `recipe-website` `tsc --noEmit`
clean; `vitest run` 134 files, 2731 tests passed. Playwright (Docker, build
mode): `guest-controls recipe groups tag-pages term-edit shopping
featured-recipes reference-updates visual edit pages` specs, 243 tests: 241
passed, 2 failed on exactly the two baselines above; after regenerating them
`recipe.spec visual.spec` 86/86. Dev mode once (`guest-controls`, `term-edit`):
12 passed, 1 flaky (`term-edit:25`, the `/tags/bar-cookies/edit` URL wait at
5 s, a dev first-compile of an untouched click).

**Roger to confirm.** Da1: a merged row with a mix of optional and required
lines is shown as required (not "optional for X").

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

**What changed.** `/search` below the field is canvas B in both apps:

- **Narrow column** (`SearchForm/NarrowColumn.tsx`, replacing
  `TagFilterRail`): 43f's groups counted inside the displayed results
  (`countFacets` → `facetGroups`, `order: "total"`), each its top four rows
  and "N more"; a **Kind** row first (Drinks · Food → `setQueryKind`,
  shown on a site with `drink` when the results hold both or a Kind is
  set); the tags no facet places last ("Other tags", or "Tags" on a site
  with no vocabulary). Rows are `aria-pressed` toggles read back from the
  query (D3): on → the context's `toggleTagTerm` (so a half-typed word is
  replaced), off → `toggleFacet` (every spelling, a negation too). "Clear
  tags" heads the column while a `tag:` term is in; the footnote reads
  "Each adds its tag: to the search." Below `lg` it is the body of a
  **Narrow** sheet (Radix dialog, from the bottom) beside Sort.
- **Bands** (`SearchBands.tsx`, pure layout in `searchView.ts`): results
  of both kinds, with no Kind in the query, band into **Drinks** and
  **Food** — four cards, an "Also:" line of five names and "N more", and
  "All N drinks / dishes" writing the Kind. A `tag:` query **opens on its
  term** (`TermCard`: breadcrumb, description, count, Narrower chips
  counted inside the results, "Open the X page") and, when its results
  fall into holidays or Collections, **bands by date**: each holiday
  soonest first (`orderByNextOccurrence`, "4 · in 13 days"), each
  Collection, then **Any time** (the rest, as the page's grid). Anything
  else is one grid, revealed sixty at a time as before.
- **Cards** (`SearchCard.tsx`): 4:5 picture, the name with the free text
  marked, a mono meta line (a drink's style, else family; a dish's course
  at its most specific; then the time, else the speed & effort term), and
  the **why** line — the first ingredient the words mark with its amount
  as written in mono (`leadingAmount`, gated on `parseAmount`), else the
  description where that is what matched. Marks are styled from tokens
  (`SEARCH_MARKS`: an accent tint with an underline), on `/search` and in
  the palette only.
- **Term descriptions**: a new lazy document `/search/term-descriptions`
  (`readTermDescriptions`: each record's description flattened, capped at
  240 characters; editor route, and a `force-static` export route),
  fetched the first time a term card shows — `/search/terms` is on every
  page load and stays as it was.
- **Completions** carry counts (`query-autocomplete-count`): a tag's is
  what `tag:` finds (43f's subtree count over the corpus), an ingredient's
  the recipes `ingredient:` finds (`recipeLineCounter`, lines folded once,
  memoized per name); ingredient names are plural-blind on the last word
  (`pluralKeys`: a final `s`, or `es` — lime/limes, cheese/cheeses,
  tomato/tomatoes): one row in the more used one's place, spelled as the
  _shortest_ member, which every other member starts with, so
  `ingredient:"pumpkin seed"` finds the seeds' recipes too.
- **⌘K**: the recipes group always ends in **"All N results in search"**
  (with "N drinks · M food" when both), opened by its row or **Ctrl ↵ /
  ⌘ ↵** from anywhere in the list (prevented before cmdk, so plain ↵ still
  opens the highlighted row; with no recipe hits Ctrl ↵ still opens
  `/search?q=<input>` rather than the highlighted nav row); its count is
  withheld ("All results in search") while the input is ahead of the
  debounced query it counts; the pending status reads "Searching N
  recipes…"; rows carry the mono meta line and the why line instead of the
  description and two tag badges.
- **No result**: "Nothing mentions quince" / "Not a name, tag, ingredient
  or description in N recipes." (or "Nothing matches <query>" when filters
  are in it), **Import a recipe** for the signed-in owner only (a new
  `OwnerContext` from `AppProviders`; the export never sets it), **Clear
  search**, and **Or browse by** the facet roots with their term counts.
- **Masthead** drops its palette trigger on `/search` (both variants;
  ⌘K still opens it). The page's field is taller with a clear button.
- The ticker adds "· 73 drinks · 35 food" after its existing parts when the
  results hold both kinds.

**Parity.** `SearchContext` is untouched: `displayedRecipes`, its order and
`matchesFilter` are what they were; every layout is a partition of the
sorted list that keeps its order. `test/searchView.test.ts` pins that
(kinds and seasons: every result once, relative order kept, the first
card the top result) beside the unchanged `searchIndex.test.ts`.

**Decisions.**

- **Ds1 — the band holding the best match leads** (Drinks first for
  "lime", Food first for "syrup"), so the first card on the page is still
  the top-ranked result and the ranking specs read the same.
- **Ds2 — single-kind fallback** is the plain grid (with the reveal), not a
  band; "All N drinks" leads there. A `tag:` query's date bands need at
  least one holiday or Collection band; otherwise its results are the grid
  under the term card.
- **Ds3 — the subject** is the deepest positive `tag:` term when all of
  them lie on one line of the tree (so a pressed Narrower chip moves the
  card to the child), and only a term with a record; `tag:drink` is the
  Kind, never a subject. A bare carried tag gets no card.
- **Ds4 — date bands on the desktop are full bands** (head, four cards,
  Also line, "All N" when more than four), not the canvas state-strip's
  compressed thumbnail rows; on a phone the band grids are two columns
  rather than the board's sideways scroller (no inner horizontal scroll
  to fight the 390 px check).
- **Ds5 — the why line falls back to the description** when the words
  matched there and in no ingredient, so a description-only hit still
  explains itself (the board's cards show only ingredient lines).
- **Ds6 — the ticker keeps the query and filter count** (`“lime”`,
  `2 FILTERS`) and appends the kind split; the board's ticker drops the
  query, but the specs and the screen reader read it there.
- **Ds7 — the hand-over row is always there** when the palette has recipe
  hits (not only past five), so Ctrl ↵ always has a target.
- **Ds8 — row names** are the visible text ("dessert 2"); the old
  "Filter by tag X" labels went with the rail (`narrowRow` in
  `support/helpers.ts` finds a row by its label).

**Specs.** Updated in this commit: `search-tags` (Narrow rows for the rail
and the card chips; the why line for the "+N more" cap), `search-
autocomplete` (Narrow rows), `command-palette` (typed `tag:` filters where
it clicked rail chips; "All 60 results in search"; the counted searching
status), `empty-state` (the new copy; no Import for a reader),
`search-corpus-split` (`search-no-results`), `missing-media` (the card's
picture is decorative now). New: `search-facets.spec.ts` (bands and the
Kind, Narrow counts and toggles, card meta and why, a term with date
bands, no-result roots and the owner's Import, the masthead, completion
counts, the term description, the palette's hand-over row and Ctrl ↵, the
phone sheet with a 390 px overflow check). Baselines: `search-bands`,
`search-term`, `search-term-mobile` new.

**Review fixes** (a finisher took the phase over from here):

- **Completions offer the shortest plural form** (see Completions above):
  the old key stripped `es` too ("limes" → "lim", so lime/limes never
  met) and offered the more used spelling, so `ingredient:"pumpkin seeds"`
  dropped the recipes that say "pumpkin seed kernels". Groups are formed
  first and judged after, so a member already typed or matching no line
  no longer hides its group.
- **Focus survives a press.** Narrow groups were keyed on the query, so
  every toggle remounted them and dropped focus. Now keyed on the group
  (an opened "N more" closes when the free text changes); because groups
  and rows still reorder by count, the pressed row names itself
  (`data-focus-key`) and is focused again after the render that shows the
  new query; "N more" focuses the first revealed row, "Clear tags" the
  column's head. A band's "All N" focuses the first result, a Narrower
  chip the term card's name.
- **The palette's hand-over row**: Ctrl/⌘ ↵ opens `/search?q=<input>` with
  or without recipe hits (it fell through to the highlighted nav row);
  the debounce is dropped and the input committed; the count is withheld
  while the input is ahead of the counted query; `aria-keyshortcuts` on
  the row with its glyphs `aria-hidden`; only its top border is coloured
  (the item's transparent selection border showed as a box).
- Smaller: the band layouts memoized; a kind band's "N more" is the same
  button as its "All N"; the desktop aside unmounts while the phone sheet
  is open (one `data-testid="narrow"`); "All 1 drink" / "All 1 dish" at
  one, as `/drinks` says it.
- Found by the first Docker run: **the Narrow column is left out when it
  has no row** (`hasNarrowRows`), so a tagless corpus's results take the
  full width rather than sit beside an empty 232 px column, and the phone
  shows no empty Narrow button; `command-palette.spec`'s `tag:soup` and
  Groups-order cases count the hand-over row that now ends the recipes
  group (Ds7).
- **Ds9 — the band's "All N" stays when the band shows everything** (it
  still writes the Kind, which narrows the Narrow counts and the ticker).
- New checks in `search-facets.spec`: a Narrow row pressed from the
  keyboard keeps focus (on and off), "All 5 drinks" from the keyboard
  lands on the first result, plain ↵ opens the top recipe, Ctrl ↵ with no
  recipe hits opens `/search?q=pantry` (not "What can I make?"), one
  Narrow column while the sheet is open, and Escape hands focus back to
  the Narrow button. Vitest: the shortest form found from a singular-only
  line, -e and -es plurals deduped, a group judged by its passing members.

**Baselines** (Docker, build mode, `--update-snapshots=all` after the
main merge; other phases' PNGs put back). New: `search-bands`,
`search-term`, `search-term-mobile`. Moved: `search-page-empty`,
`search-page-with-hits` (4:5 cards in the B grid, full width when there
is nothing to narrow; the masthead trigger gone), `search-page-recents`
(the Narrow column beside the grid), `search-reveal-control` (1 px),
`search-no-results` ("Nothing mentions …", Clear search),
`palette-results`, `palette-deep-rows`, `palette-insert-rows` (rows with
the meta and why lines, the hand-over row). `search-autocomplete` and
`search-query-chips` came back pixel-identical and were left alone.
Compared with the B boards: the bands, Narrow column, term card and
date bands follow `B-desktop`; the phone follows `B-phone` but for Ds4
(two-column grids, not the sideways scroller) and the toolbar, where the
ticker keeps the query (Ds6) and wraps to three short lines beside Narrow
and Sort at 390 px.

**Gates.** `pnpm --filter recipe-editor typecheck` ✓; `pnpm --filter
recipe-website exec tsc --noEmit` ✓; `pnpm exec vitest run` 136 files,
2809 tests ✓ (after the 43a merge). Playwright in Docker, build mode:
search-facets, search-tags, search-autocomplete, search-query-language,
search-query-chips, search, search-live, search-cold-load,
search-corpus-split, missing-media — **99 passed**; command-palette,
empty-state, visual, mobile, accessibility, navigation, groups,
homepage-browse, tag-pages, drinks — **237 passed**. Dev mode (Docker):
search-facets and command-palette — 52 passed, 1 flaky (command-palette's
"live search surfaces a recipe and Enter navigates to it", unchanged by
43s: `next dev` compiling `/recipe/[slug]` on first visit outlasted the
5 s URL wait; passed on retry). After merging 43n (#297, ingredient
names): both typechecks ✓; vitest 137 files, 2954 tests, one timeout in
`cliJson`'s inventory process test under load (26/26 alone ✓); Docker
build mode search-autocomplete, search-tags, command-palette,
search-facets — **74 passed**, no baseline moved. axe (WCAG 2.2 tags) is
clean on `/search` desktop (bands, a term with date bands, no result) and
on the phone with the Narrow sheet open (`search-facets`); the phone run
asserts no sideways scroll at 390 px. Narrow rows are 30 px tall, the
inline "N more" / "All N" buttons 24 px.

**Roger to confirm.** Ds4 (full bands rather than the thumbnail rows on
the desktop's `tag:` view; two-column grids on a phone), Ds6 (the query
stays in the ticker, so the phone toolbar wraps it to three lines), Ds9
("All 1 dish" stays on a one-card band).

### 43t — /tags B "Narrow it down" (L)

Files: `common/components/TagPage/` (`shared.tsx`, `routes.tsx`), `readTermPage.ts`, `tagVocabulary.ts`.

- **Board:** h1 + "New term" (signed-in); **Find a tag** combobox (names + aliases, `searchTags`); **Combine** bar (tokens with facet name, × remove, live intersection count from the search corpus, "Show N recipes →" to `/search?q=tag:a tag:b`); Food shelf (4 facet columns + Collections, dot-leader rows nested, + to combine), **Holidays** aside (dated rows → `/holidays/<slug>`, "Each holiday's menu, in the almanac →"), Drinks shelf (Style, Strength & method, Spirit & base, Families run-in list), "N other tags" `<details>`.
- **Term page:** actions top-right (signed-in only), count ticker incl. aliases ("41 recipes · 1 plan · also filed as …"), holiday "when" card (countdown, "Open the X menu", "What can I make with these?"), plan card, pin slot, **"Narrow X"** chips filtering in place (counts within the term's recipes — read all the subtree's rows, not the 48-row cap, if 34a's rows are small enough; measure and record), list head with Grid/List, cards without the page's own tag.
- **Root page** (e.g. /tags/course): one photo row per narrower term by count, sub-chips, "And N more" dot-leaders, By course / Newest.
- Phone: Holidays first, accordions per facet, "Long-press to combine" hint (D1: a visible + button is fine instead; record).
- Tests: `tag-pages.spec`, `term-edit.spec`, `holidays.spec` term links; **first /tags baselines** (board, term, root; e2e + mobile).

#### Results (43t)

**Landed** (canvas B, "Narrow it down"). Three pages over 43f's facet model;
no index, projection or spec version changed — **reindex: none**.

- **Pure half** — `common/controller/tagBoardPage.ts`: `tagBoardData({terms,
recipes, groups})` (the board: four food columns, Collections, Holidays
  with recipe and plan counts, three drinks columns, the Families run-in
  list with nested families, other tags, "Find a tag" entries with trail,
  aliases and facet), `findTags` (label/slug first, then aliases, "also …"),
  and for term pages `pageTagSlugs` / `otherTags` (a card drops the page's
  own tags), `carriesTerm`, `narrowChips` (the "Narrow X" rows) and
  `rootSections` (a root page's sections), `isRootPage`, `tagSpelling` /
  `spelledTagQuery`. `test/tagBoardPage.test.ts` (16).
- **Reads** — `readTagBoardPage()` (`readTermPage.ts`): the same three
  values `readTagBoard` reads (the tree, the two whole by-term maps), so the
  board expires exactly as before. `termPageData` gains `allRecipes` (the
  subtree's every row, pinned first — it already built them before the
  48-cap), `pinnedCount` and `aliases`.
- **`/tags`** (`TagPage/Board.tsx`, client): the panel (h1, New term for a
  signed-in editor, Find a tag — an ARIA 1.2 combobox that opens the term,
  Combine), the Food shelf (Course, Main ingredient, Cuisine, Speed &
  effort + Collections; dot-leader rows nested by depth, `+` per row) beside
  the Holidays aside (the 5 soonest on the browser's day, `useToday`, each
  to `/holidays/<slug>`, "Each holiday's menu, in the almanac →"), the
  Drinks shelf (Style, Strength & method, Spirit & base, Families), and
  "N other tags" folded. Combine's count is `useQueryCount`: the search
  corpus through `matchesFilter` and the `tag:` expansion — what
  `/search?q=tag:a tag:b` will show (D3, Df9); only that count is a live
  region (a polite `sr-only` status), not the whole bar. Pictures for the
  holidays are rendered on the server (`TermPicture`, the almanac's rule),
  for the dated holidays only — the only ones the aside can show.
- **Term page** (`shared.tsx` `TermPageBody`, `TermRecipes.tsx`,
  `HolidayWhen.tsx`): crumbs (`Tags ›` then the ancestors), the editor's
  actions top right, h1, the count ticker ("41 recipes · 1 plan · also
  filed as christmas-cookies"), the description; a holiday's when card
  (days on the browser's day, date, Open the X menu, What can I make with
  these?) or the term's picture and What can I make; plan cards and, signed
  in with no pins, the pin slot; "Narrow X" chips over the subtree's rows,
  filtering in place; list head with Clear and Grid / List; cards without
  the page's own tags. The column is canvas B's 1152 px (`max-w-6xl`).
- **Root page** (`RootTermBody`, `RootViews.tsx`): a facet root with
  narrower terms (`isRootPage`, Dt8: `/tags/course`, `/tags/drink`,
  `/tags/holidays`) — one section per narrower term by count (three photos,
  its narrower terms as chips) for the first 7, "Only <Root> N" for the
  recipes tagged with the root alone, "And N more" dot-leaders after
  (narrower terms no recipe carries keep their count of plans, or 0 for the
  curator), a By course / Newest switch (Newest is 34a's capped list), What
  can I make, and on `holidays` the almanac link. A feature of a term
  renders the same body with the same vocabulary (`facetTermsFromTree`), so
  a featured root counts grandchildren and aliases as `/tags/<root>` does.
- **Session** — the editor's two route files read `auth()` and pass
  `signedIn` to `editorTagIndexRoute({signedIn})` / `editorTagRoute({params,
signedIn})` — 43a's shape, kept as one rule after the merge (common can't
  import the editor's auth); a guest sees no New term, Feature, Edit, Add a
  narrower term or pin slot (43a's rule for these pages).
- `TagPage/blockRows.ts` and `test/tagBlockRows.test.ts` are gone (the
  count-bar board's row budget); `TagIndexPage` takes the board data.

**Measured (Dt3).** A read-only scratch clone of the content repo
(`tmp/43/43t/content-clone`, deleted after), the subtree's rows as JSON
(`slug, date, name, image, tags` — 34a's rows): Christmas 41 rows = 8.1 KB
(2.0 KB gzipped), Cookies 45 = 8.7 KB, Fall Favorites 64 = 12 KB, Desserts
148 = 27 KB (6.4 KB), Holidays 139 = 27 KB, Drinks 222 = 41 KB, Course 597
= 105 KB (27 KB). The vocabulary for the chips' model: 232 terms = 14.6 KB
(3.1 KB). The real board (`tagBoardData` over the clone, after 43k): 603
dishes + 222 drinks; Course 597 (14 rows), Main ingredient 399, Cuisine
384, Speed & effort 327, Collections 86 (Fall Favorites 64, House recipes
18, Syrups 5 › Lavender 3…), Holidays 153 (8 dated), Style 217, Strength &
method 134, Spirit & base 201, Families 113 top-level / 144 with nested
(Spritz 10 with 6 children, Moscow Mule 6, Sangria 6…), **0 other tags**,
241 names and aliases; the board's serialized props 38.6 KB.

**Decisions.**

- **Dt1 — one pure board function over the facet model**, no second
  grouping; the server passes every carrier as `{tags}` from the by-term
  maps (`carriersFromRows`). Shelves count recipes (what "Show N recipes"
  opens); a holiday's plans and the other tags count plans too, as `/tags`
  always counted a bare tag.
- **Dt2 — Collections sit on the Food shelf (canvas B)**, and the Drinks
  shelf adds an "In collections" run-in line counted on drinks (House
  recipes 17, Fall Favorites 2 on the real corpus), so the drinks-heavy
  House collection is reachable from the bar's shelf too.
- **Dt3 — "Narrow X" reads all of the subtree's rows** (measured above;
  the biggest page that narrows, Desserts, is 27 KB). Root pages don't
  narrow, they show sections. Past `TERM_NARROW_ROW_LIMIT` (400 rows) the
  chips are left out rather than the page growing. With no chip pressed the
  grid is the server's cards (34a's cap and "See all N recipes"); a pressed
  chip or the List view draws client cards (`ClientListItem`,
  `PureRecipeImage`) from the rows. The chips also need the vocabulary on
  every narrowing page: 232 terms = 14.6 KB raw (3.1 KB gzipped) of
  serialized props, pictures stripped (`lean`). "See all N" after narrowing
  spells each tag as its carriers do (`spelledTagQuery`: `slow cooker`, not
  `slow-cooker`), as the unpressed link always did.
- **Dt4 — a visible `+` instead of long-press.** At `lg` and up, with a
  pointer that hovers, `+` shows on hover and focus (canvas B); below `lg`
  (the phone's disclosures) and on touch it is always there, 24 px. The phone hint reads "Tap + beside a row to combine it with
  another."
- **Dt5 — zero-count records leave the board** (they narrow nothing); Find
  a tag still finds them, a root page lists them at 0 under "And N more",
  and a term page's "Narrower:" line links every narrower term.
- **Dt6 — cards keep the date line.** Canvas B shows a time; 34a's by-term
  row carries no `totalTime`, and adding it is a projection change (a
  version bump and a reindex) — deferred. The cards do drop the page's own
  tags (the term, its ancestors and its subtree).
- **Dt7 — chips AND together** and every count is within what is already
  chosen; rows are the term's narrower terms, then up to 4 facet groups in
  `FACET_GROUPS` order, 6 chips each, a pressed chip always kept; "All N"
  clears. No Kind row.
- **Dt8 — a root page is a facet root with narrower terms**
  (`ROOT_PAGE_SLUGS` = `FACET_ROOT_ORDER`: course, main-ingredient,
  cuisine, effort, holidays, drink and spirit — `spirit` too, as Spirit &
  base is a facet column on the board). Every other term with narrower
  terms (Syrups › Lavender, Fall Favorites, a `dessert` with children) is a
  term page whose "Narrow X" leads with them. Both views are in the HTML
  (the switch only shows one), so the export carries every link.
- **Dt9 — plan cards** show the plan's picture, kind and size; canvas B's
  six-photo strip needs each plan's members read and is left out.
- **Dt10 — Families**: the 30 most made, then "All N families" opens the
  rest in place; a family's own families follow it in brackets
  ("Margarita 5 (Frozen Margarita, …)").
- **Dt11 — Holidays aside**: the 5 soonest dated holidays; undated ones
  live on the almanac. Find a tag opens the term page (it doesn't add to
  Combine).

**Review fixes** (after the read-only review): only the facet roots get
the root layout (Dt8); "Only <Root> N" on a root page; a narrower term only
plans carry keeps its count; the featured term page gets the vocabulary;
"See all N" after narrowing spells the page's tag as its carriers do; the
Combine live region is the count only; pictures for dated holidays only;
the vocabulary payload line in Dt3. Then origin/main merged twice (43a's
guest controls — one session rule, `editorTagRoute({params, signedIn})`,
43t's ghost actions top right; 43n's ingredient names, nothing on these
pages).

**Gates.**

- `pnpm --filter recipe-editor typecheck`, `pnpm --filter recipe-website
exec tsc --noEmit`: clean (after both merges).
- `pnpm exec vitest run`: 135 files / 2778 tests before the 43n merge; after
  it 136 files / 2923 tests with 3 load-timing failures in
  `test/queue.test.ts` (a 271 ms gap against 280, a 5 s timeout) and
  `test/cliJson.test.ts` (a 30 s CLI timeout) while the heavy slot was
  busy — both files plus `tagBoardPage` rerun alone: 3 files / 80 tests
  passed. Nothing in 43t touches either.
- Playwright, Docker, production build (`PLAYWRIGHT_BUILD=1`, e2e + mobile):
  `tags-board`, `tag-pages`, `term-edit`, `holidays`, `accessibility`,
  `featured-recipes`, `api-write`, `guest-controls` — 205 passed, 1 failed
  (`tag-pages`: a stale "Newest" click on `/tags/dessert`, no root page
  now); fixed, `tag-pages.spec` rerun 24/24.
- `tags-board.spec` in dev mode (Docker): 12/12.
- The 43n merge touched only ingredient, Make and shopping code, so the
  Playwright runs above were not repeated after it.

**Baselines.** First `/tags` baselines, Docker production mode,
`tags-board.spec.ts/`: `tags-board`, `tags-term` (`/tags/halloween`) and
`tags-root` (`/tags/drink`), each `-e2e` and `-mobile`. Each opened beside
canvas B: the panel (h1, Find a tag, Combine), the Food shelf with
Collections beside the Holidays aside (day count, date, recipes · plans,
picture), the Drinks shelf with Families and "In collections", the folded
other tags; the term page's crumbs, count ticker, when card, plan card,
"Narrow Halloween" rows and cards without the page's tags; the root page's
sections and By drinks / Newest switch. The fixture has no photos, so the
root sections show no photo row and the cards their monograms. No existing
baseline moved (no other spec snapshots a tag or featured term page).

**Roger to confirm.** Dt2 (House recipes on both shelves), Dt5 (empty
records off the board), Dt6 (the date, not the time, on term-page cards),
Dt7 (chips AND rather than one at a time), Dt8 (`spirit` gets the root
layout too; collections with narrower terms narrow instead), Dt9 (no
six-photo strip on the plan card).

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
    under `plan-mode`, then the viewport: `lg` and up Plan, decided once per
    page load — Dp1-12) and the made ticks under `plan-made:<slug>`, both
    via `useSyncExternalStore`, read after hydration. The editor's page is
    dynamic, so it hands `?mode=` to the store's server snapshot and a
    `?mode=cook` link renders Cook from the first byte (no Plan flash).
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

**Review fixes** (after the read-only review; commit e7cb10a3):

- **`planTimes` clauses.** A verb's time is read from its own clause only —
  up to a semicolon, "then", or another timed verb (bake, chill,
  refrigerate, let/allow). A lone "overnight" before any time is the answer
  for a chill and, new, for a rest (`PlanRest {min?, max?, overnight?}`).
  Near-miss tests: "Refrigerate dough overnight; the next day bake 10
  minutes." → chill overnight; "Let the dough rest overnight, then roll out
  and cut; bake 8 minutes." → rest overnight (the bake 8 min); "Let the
  dough rest, covered, then bake for 25 minutes." → no rest, bake 25.
- **The oven needs the oven's wording**: "preheat … to", "oven to",
  "bake/roast at", or "in a N° oven" around the number, and never in a
  sentence about the internal temperature, a thermometer, reads / registers
  / reaches, oil, frying or keeping warm. Tests: the Dutch-oven oil, the
  internal 205°F, the bread that reads 200°F (bake 35–40, no oven), "keep
  warm in a 200°F oven" read as none; the brief's positives and "Heat the
  oven to 425°F", "in a 180°C oven" read.
- **Smaller misses**: `FREEZE_RE` skips "freeze-dried"; a chill under a
  minute, or of glassware ("chill a coupe", "the glasses"), is none; "bake 2
  to 3 minutes longer / more", "another 5 minutes" is never the bake. A test
  each.
- **Save vs concurrent writes** (Dp1-11).
- **Cook mode's outline**: the by-label list starts with a visually hidden
  h2 ("The plan, by label") before its h3 labels.

**Decisions (review).**

- **Dp1-11 — a Save over a changed plan writes nothing.** The page sends
  `planItemsKey(items)` — a stable JSON key of the rows it rendered (key
  order and absent fields ignored; order and values count) — and
  `savePlanItems` passes `setItems` an `unchanged` check, which the seat
  runs on the stored rows before writing: on a mismatch it throws
  `validation` "The plan changed — reload to see it." and the page shows
  that under the bar. The read and the write are not one locked step (the
  seat reads before `updateContent` takes the write lock, as every
  `setItems` caller does today); the window is milliseconds, against a
  draft that was open for minutes. After `{ok}` the bar stays disabled
  ("Saving…") inside a `useTransition` until `router.refresh()` lands.
- **Dp1-12 — the viewport decides the default once.** Without `?mode=` or a
  stored choice, the first read in a page load picks Plan (≥ 1024 px) or
  Cook and keeps it: resizing across `lg` no longer flips the page, and a
  client navigation back to a plan in the same load keeps that default.
- **Dp1-13 — a rest can be "overnight".** `rest` became `PlanRest` (the
  minutes optional) so "rest overnight" is a fact, not a guess at the next
  number; the page quotes the rest's sentence only, so no wording changed.

**Merges.** origin/main merged three times: 43f (#295), 43a (#296 — its
group-page action bar gives way to 43p1's More menu, Dp1-10; its
`guest-controls.spec` group test now opens More before looking for Feature,
Edit and Delete) and 43n (#297; a `backlog.md` conflict only — both rows
kept struck).

**Gates** (final tree 6e79c1bc unless said):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: clean. ESLint on the phase's changed `.ts`/`.tsx`:
  clean.
- `pnpm exec vitest run`: 138 files, 3,025 tests — 3,022 passed and 3
  timed out under the machine's load (`cliJson` "keeps the inventory",
  `curationGit` "aborts a conflict", `siteWrites` "git_status and pending
  index refreshes"; an earlier full run timed out in `multiRecipe`
  instead); those four files alone: 4 files, 176 tests passed. Before the
  43n merge (c28d320d): 137 files, 2,880 tests passed.
- Playwright, Docker build mode: `plan-page.spec` 16/16 on the final tree;
  after the #296 merge `groups`, `api-write`, `featured-recipes`,
  `accessibility`, `shopping`, `header`, `guest-controls` 208 passed, 1
  failed — `featured-recipes` "features a group from the group page's
  Feature button" looked for Feature outside the More menu; fixed
  (d08ab1b6), then `featured-recipes` + `mcp-http` 60/60.
- Dev mode (Docker, `next dev`): `plan-page.spec` 16/16, `guest-controls`
  4/4. The first dev run lost the Sign In click in the four signed-in "plan
  at home" tests (Tp1-1); fixed in c28d320d.
- Axe WCAG 2.2 green in Plan (light, dark) and Cook (`plan-page.spec`).

**Baselines** (Docker only, `--update-snapshots=all`): `plan-page-e2e`,
`plans-list-e2e`, `plan-cook-mobile` regenerated after the 43f merge —
`plan-cook-mobile` is now the spec's 393 × 1600 viewport capture (it was
2,196 px tall), the other two moved by a one-pixel underline row; after the
#296 merge they regenerated pixel-identical, and after the 43n merge they
pass unchanged. Each opened against B's boards: Plan mode matches
`B-desktop` (guest view, so no Save, scale or shopping panel), Cook
matches `B-phone`, `/groups` matches `B-groups` with the placeholder in
place of the photo strip (the fixture recipes have no pictures).

**Traps.**

- **Tp1-1 — a frozen clock under `next dev` loses the Sign In click.**
  With `page.clock.setFixedTime` in the describe's `beforeEach`, every
  signed-in plan test timed out waiting for the sign-in form in dev mode
  (build mode passed). Only the tests that read the countdown freeze the
  clock now, and sign-in waits for the button to hydrate.

**Roger to confirm.**

- Dp1-2: the server renders Plan (a phone switches to Cook as it
  hydrates; a `?mode=cook` link now renders Cook from the server).
- Dp1-3: "1–2 away" on the shelf's middle tile instead of the board's "two
  away".
- Dp1-9: the plan's own picture kept under the description.
- Dp1-11: a Save over a plan that changed meanwhile is refused ("The plan
  changed — reload to see it.") rather than merged.
- Dp1-12: the viewport default is decided once per page load.

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

**What changed.** `/new-recipe` and `/recipe/<slug>/edit` are canvas B's
frame (board `B-start`, `B-desktop`, `B-phone`):

- **The frame** (`common/components/Form/RecipeFormFrame.tsx`): h1 (the
  edit page's "Editing recipe" eyebrow + name), a sticky section rail from
  `lg` — Start from (new only) · Recipe · Tags · Picture · Ingredients ·
  Steps · Times · Source — and the save card under it: **Create recipe** /
  **Save**, **Cancel** (to `/` or the recipe), and **"N changes · not
  saved"**. On a phone the rail is a jump row of section pills and the save
  card a sticky bar above the tab bar (the `/shopping` bar's pattern). The
  current section is marked from the scroll position (`aria-current`).
- **The rail's model** (`common/components/Form/sections.ts`, pure):
  statuses from the form state — "from the page/text/photo" while a
  section is unchanged since the import, "N chosen" tags, line and step
  counts, "N · all lines used" only when the recipe page's own matcher
  (`matchStepIngredients`, 42c1) names every line, the total (or prep +
  cook) time, the source's site or host, "needs a name", and "check" on a
  section with a field error. `changedFields` counts real field changes
  against the loaded values (CRLF, a trailing newline, a 0-minute time and
  `type: undefined` are not changes; source and drink count per part).
- **The sections** (`Form/index.tsx`): Recipe (name, description, yield),
  Tags, Picture and video, Ingredients, Steps (+ timelines), Times, Source
  and address (source link / site / author, slug, date, the Drink fold) —
  headings with rules, every field's name and submit shape unchanged (D4).
  The Add Ingredient / Instruction / Timeline buttons go outline: primary
  is Save's alone.
- **Start from** (`new-recipe/form.tsx`): five ways in as a radiogroup — A
  link, Text, Photo, Roundup, Blank — over the existing import modes and
  35r's `RoundupImport` (kept mounted, hidden, so a run survives a switch);
  Text and Photo are disabled with "No local model / vision model
  configured" where there is none. The live job panel (`ImportProgress`)
  sits inside; once an import fills the form the card folds to a
  **receipt** — the panel's one line with how it was read ("recipe data on
  the page — no model needed", "read by qwen3:8b") and **Start over**.
- **Duplicate check at Import time**: `recipeBySource` (`importList.ts`,
  over the roundup's own `existingBySource`) behind `sameSourceAction`
  (`new-recipe/duplicateActions.ts`); "Already in your recipes. X was
  imported from this link on 14 Oct 2026." with **Open it** / **Edit that
  one instead** / **Keep importing — save as a copy**, which sets the slug
  from `resolveCopySlug` (`recipes.ts`: `nextCopySlug`, the first free
  `-2`, `-3`…, counting on from a slug that already ends in a small number
  whose base exists: `cookies-2` → `cookies-3`, `best-of-2024` →
  `best-of-2024-2`) and
  says so in the rail ("Same link as X — you chose to keep a copy",
  `/recipe/x-2`). Asked again for a reopened `?job=`.
- **Errors**: the slug conflict's Overwrite path is unchanged; the Slug
  field now also says "This slug is taken: change it, or overwrite that
  recipe." (`withSlugConflict`), and the rail marks Source "check".

**Decisions.**

- **De1-1 one Save in the DOM.** The rail's card is portalled out of the
  recipe form (Start from is a `<form>` of its own; forms cannot nest), so
  its buttons carry `form="recipe-form"`; `useFormStatus` still works (the
  React tree is the form's). Which copy renders — rail card or phone bar —
  follows `(min-width: 64rem)` after hydration (`useWideRail`); the server
  renders the phone bar, hidden from `lg` by CSS. So there is one Save, one
  Overwrite and one message at a time (strict locators stay strict).
- **De1-2 the button names.** The canvas's copy wins: "Create recipe" and
  "Save". 109 lookups of the recipe form's `Submit` in 25 specs were
  rewritten by page (a script classifying each by the page it was on);
  every other form's Submit (featured, group, term, menus, pages) stays.
  Labels the specs find case-insensitively stay as they were where they are
  43e2's (Prep Time, Add Ingredient…); the Source block's are now "Source
  link", "Site", "Author".
- **De1-3 no focus move on a mode switch.** 36d moved focus to the field a
  mode link opened; with radios, focus stays on the radio (arrow keys move
  through the five). The specs that asserted the old focus now assert the
  field is shown.
- **De1-4 "Start over" re-opens the ways in; it does not clear the form.**
  The form keeps what the import gave it until the next import fills it
  (D1: conservative). Roger to confirm.
- **De1-5 the duplicate check informs only.** No index (or no match) is
  silence; the slug conflict at Create still stands behind it. It is asked
  for link imports (and a reopened link job), not for pasted text or photos.
- **De1-6 the picture's change** is seen from the form element's own
  `change`/`input` events on the file, URL and candidate inputs (the form
  instance does not hold them): it counts as one change and turns the rail's
  Picture to "new". It is compared with the inputs as the form mounted
  (set ones only: a checked box, a chosen file, typed text), so typing then
  deleting, or ticking then unticking, is back to no change.
- **De1-7 Import stays primary** (board `B-start`); every other button in
  the form is outline or ghost.
- **De1-8 the phone's pill row is `contain: inline-size`.** A scroll
  container still hands its content's min-content width up to an ancestor
  grid track: the pills stretched the page to ~660 px at 393 until
  contained (caught by the new spec's "nothing reaches past the screen"
  check, which lists the offending boxes).

- **De1-9 the duplicate check's match.** It uses the roundup's
  `sourceUrlKey`: host without `www.`, path without a trailing slash or a
  comment-page suffix, scheme, query (so `utm_*`) and fragment ignored. It
  does not know that `youtu.be/x` and `youtube.com/watch?v=x` are one video
  (the query is dropped, so the latter reads as `youtube.com/watch`); the
  slug conflict at Create still catches a same-named copy. Roger to confirm.
- **De1-10 a failed Create's counter.** After a slug conflict or a
  validation error the form reloads with what was sent; the change count
  compares against the pre-submit values (the import's recipe at the
  copy/auto slug), not those. Checked by the e2e specs rather than a unit
  test (it needs the server action's state).

**Traps.**

- The rail and the phone's jump row render only after hydration
  (`useWideRail`; the server renders the phone bar): a layout shift on load,
  and from `lg` there is no Save before hydration. Specs wait with
  `expectHydrated`.
- `nextCopySlug` counts on only from a number of at most two digits whose
  base exists; a year or any other trailing number is part of the name.

**Found, not fixed (43e2's):** an untouched save writes `"name": ""` into
every untitled step (the step-name input posts an empty string and the
schema keeps it) — pinned in `editFormRoundTrip.test.tsx` so the change is
seen when the steps section is reworked. The ingredient, tag and drink-spec
round-trip (D4) is exact.

**Review fixes.** The round-trip test now carries timelines, a video, a
cook time, an image and the date, and checks no clear flag rides along; a
failed Create counts "N changes" against the pre-submit values (De1-10);
`nextCopySlug` counts on only from a number of at most two digits whose base
exists; the Picture marker compares with the inputs as mounted. Two things
the Docker run found: on the current rail row the status text took the
`success` colour (4.25:1 on the accent fill; now the row's own text colour),
and the `sr-only` ": " spans inside the pill row were absolutely positioned
against the page, stretching it to 477 px at 393 (the `ol` is `relative`
now; the phone spec also asserts `scrollWidth`).

**Gates** (head after the 43n merge). `recipe-editor` typecheck and
`recipe-website` `tsc --noEmit` clean; vitest 138 files / 2,926 tests;
Docker build-mode Playwright on the branch's touched specs plus `term-edit`
(before the final merge): 425/425; after merging 43n, the form specs
(edit-form-frame, new-recipe, edit, accessibility, visual,
ingredient-preview, recipe): 195/195; `edit-form-frame.spec` once in dev
mode (Docker, no build): 5/5.

**Baselines moved** (Docker, `--update-snapshots`): `visual.spec`
`new-recipe-form`, `new-recipe-form-overwrite`, `edit-form-populated`,
`edit-form-overwrite`, `markdown-source-mode` (the form is the framed
sections now, wider ingredient column), `ingredient-preview.spec`'s preview
(524 → 840 px wide, the same reason), and new
`edit-form-frame.spec` `new-recipe-imported` (1280 px, after an import) and
`edit-form-mobile` (393 px, jump row and save bar).

**Roger to confirm:** De1-4 (Start over keeps the form); the receipt's
wording; Cancel on a new recipe goes to `/` without asking.

### 43e2 — Edit form B: tags, ingredients, steps, drinks (M–L)

- **Tags by facet** (43f): rows per facet with counts; chosen chips in the heading; "Anything else" combobox (`TagSearch` pattern) that can also add a new tag; the import's `suggestedTags` shown dashed until accepted when they match a term or alias; "a child brings its parent" follows skill v4's existing convention (check what imports store; record). Keep the control names specs rely on ("Add a tag", "Remove tag X") where possible.
- **Ingredients as rows:** index · mono amount column (`parseAmount`) · plain text with muted asides · actions; headings as tape rows; "Rows | Edit as text" toggle (the existing PasteField path); flags like "The * points at a note that did not come in".
- **Steps:** textarea per step with a "uses" row (`matchStepIngredients`, confident only), "a wait in it" chips (`findStepTimes`), footer "Every ingredient is named in a step" / "Not named in a step: …".
- **Drink spec** first on a drink: Method segmented control that also sets its style tag (shake→`shaken`, stir→`stirred`, build→`built`; blend sets none — record), Glass / Ice chips, Garnish.
- **Times** with the prep + cook hint; **Source and address** (slug, date); "Video" labelled once; drink spec / timelines "appear when …, add one anyway".
- Tests: `recipe.spec` drink spec, `recipe-tags-aggregate.spec`, `paste-review`/`paste-replace`, `ingredient-preview`, form vitest; baselines regenerated.

#### Results (43e2)

**What changed.** The insides of 43e1's sections, as canvas B draws them
(boards `B-desktop`, `B-phone`):

- **Tags by facet** (`Form/Tags/`, pure rules in `tagPicker.ts`): the
  chosen tags as chips in the section heading (each "Remove tag X", the
  hidden `tags[i]` inputs as before); a row per facet with corpus counts —
  food: Course, Main ingredient, Cuisine, Speed & effort, Holidays; a drink:
  Spirit & base, Style, Strength & method and the drink's name (Families,
  collapsed to the names it carries plus "another drink name…") — from 43f's
  `facetGroups` (`includeEmpty`, by label). A chosen row's children open
  after it ("Desserts › Cookies"). The import's `suggestedTags` that resolve
  to a term or alias show dashed in a "From the import" row until accepted
  ("Accept suggested tag X"); others are dropped. "Anything else" is the
  `TagSearch` combobox over the whole vocabulary (trail, count, alias), named
  "Add a tag": Enter takes the highlighted term, or adds the typed text as a
  new tag. Tags no facet places (Df6 — none on the real site since 43k; all
  of them in the record-less fixtures) stay one-click "Add tag X" buttons.
  The data is `readTagPicker()` (`readTermPage.ts`: the vocabulary plus
  `countFacets` over the recipe and group by-term maps), read by
  `/new-recipe`, `/recipe/<slug>/edit` and `/copy`, and shared from
  `RecipeFormShell` so the fields and the rail read one model.
- **Ingredients as rows** (`Form/Ingredients/`, `ingredientRows.ts`):
  index · amount column (mono, as written: "2 cups · 250g") · the line as
  plain text with its asides muted (brackets, a dash-led tail) and its
  inline markdown rendered · a ⋯ menu (Edit, Make it a heading / an
  ingredient, Insert a line above, Move up/down, Remove). Headings are tape
  rows. A click opens the row as plain text ("Ingredient N"); a row nobody
  edits posts its stored string back byte for byte; an edited one is marked
  up by `createIngredient` (D4) — typing it back to what it was restores the
  stored string. **Rows | Edit as text**: the whole list as one text, live
  (each edit is the list; a line that reads as before keeps its markup and
  heading flag), with the paste path's Find / Replace and heading review.
  Flags: a `*` that is not emphasis says "The * points at a note on the
  page that did not come in…" (with Open the page), and the rail says
  "12 · 1 check".
- **Steps** (`Form/Instructions/`, `stepChecks.ts`): numbered in reading
  order across groups; under each, "uses flour · baking soda" (42c1's
  `matchStepIngredients`, confident only; the chip is the line's short name
  from `parseIngredientLine`) and "a wait in it: chill 1 hour"
  (`findStepTimes`); the footer "Every ingredient is named in a step." or
  "Not named in a step: …".
- **Drink spec** (`Form/Drink/`, `drinkMethod.ts`): first on a drink, its
  own section and rail row. Method is a segmented control (pressing the
  chosen one clears it) that sets its style tag; Glass and Ice are the
  common values as chips plus a field; Garnish. Same `drink.*` names (the
  method a hidden input).
- **Times**: "Prep + cook is 1h 28m; the rest is the chill in step 2." —
  said only when one step plainly names a wait, else "the other 22m is
  waiting". **Source and address** ends with "A drink spec and timelines
  appear when the recipe is tagged a drink or has a timeline — add a drink
  spec · add a timeline"; timelines sit under the steps once there is one.
  **Video** is labelled once (the legend; the file input's label is
  `sr-only`, `FieldWrapper`/`FileInput` grew `labelClassName`).
- **43e1's found bug fixed**: an untouched save no longer writes `"name":
""` into every untitled step (De2-6).

**Decisions.**

- **De2-1 a child does not bring its parent into the stored tags.** The
  curator skill v4's convention (the linzers carry only `linzer` and reach
  `christmas-cookies` through the hierarchy, `examples.md` §9) and what
  imports store (no parent added): picking Cookies stores `cookies`; the
  Desserts row shows it is reached (outlined, "(through a chosen tag)") and
  a click there adds `dessert` explicitly. Unpicking a term removes every
  carried spelling of it (slug, label, alias) and nothing else. Roger to
  confirm.
- **De2-2 the picker's groups.** Collections (Fall Favorites, House,
  Syrups) are not a row: canvas B's placeholder sends them to Anything else.
  Families show only the names the drink carries. A drink is read from its
  tags (anything under `drink`, Df4) — or, with no vocabulary loaded, the
  literal `drink` tag.
- **De2-3 Method → tag: shake→`shaken`, stir→`stirred`, build→`built`,
  blend → none** (the vocabulary has no `blended` term; a one-off tag is
  what D6 avoids — the control says so). The control only takes away the
  tag it set: the loaded method's own tag, or one it added this visit; a tag
  picked by hand stays when the method changes.
- **De2-4 the amount column is the line as written**, cut with
  `ingredientGrammar`'s quantity/unit patterns (`splitLine`), not
  `parseAmount` → `formatAmount`: that converts units ("12 Tbsp" → "¾ cup"),
  which an edit form must not show as if it were written.
- **De2-5 the drink spec stays once shown**: clearing the method (and the
  tag it set) does not pull the section away mid-edit.
- **De2-6 an empty step name is no name**: `parseFormData`'s step `name`
  maps `""` to `undefined` (the shape is unchanged; it is what `source` and
  `drink` already did). A recipe saved since with `"name": ""` loses the
  empty key on its next save. Timelines' empty names/notes are untouched.
- **De2-7 the step name stays a field** (above the text, "Optional — most
  steps have none"): the data model has step names and the canvas has no
  place for them; 70 spec lookups use the field.
- **De2-8 labels kept**: "Prep Time", "Cook Time", "Total Time" (48 spec
  lookups by title), "Yield", "Add Instruction", "Paste Instructions" stay;
  "Add Ingredient" became "Add ingredient", with "Add a heading" beside it.

**Specs updated** (same commit): `ingredient-preview` rewritten for the
rows; `paste-replace`/`paste-review` (Edit as text / Rows), `new-recipe`,
`edit`, `yield`, `search-tags` (the paste steps), `recipe` (the drink spec:
add one anyway, Method sets `shaken`, clearing takes it back), `timeline`
("add a timeline" first). `recipe-tags-aggregate` unchanged ("Add tag X" on
the record-less corpus).

**Gates.** _Pending._

**Roger to confirm:** De2-1 (a child reaches its parent, not stored);
De2-3 (blend sets no tag); Collections only through Anything else; the
waits rule (a waiting word before the time, or half an hour or more).

### 43n — Ingredient names: ranges, synonyms, near-duplicates (M)

Files: `common/util/ingredientNames.ts` (`parseIngredientLine` :732, `toName` :370, `stripMarkup` :462), `ingredientAmount.ts`.

- **Parser fixes** (real lines from balela-salad): "1/2 cup to 1 cup Italian parsley – chopped" → `italian parsley` (today "to cup italian parsley"); "1/4- 1/2 teaspoon cayenne or aleppo chili flakes"; "garbanzo beans- (2 cans, drained…)"; "red bell pepper-diced". Survey the corpus read-only for other range / dash shapes and fix what's common; vitest on each shape.
- **Synonyms and descriptors:** a curated, small table where two names are one ingredient (mayo = mayonnaise, garbanzo = chickpea, …) and descriptors that don't change what you buy (mild, fresh, …) — applied in name normalization so Make, the shopping list's merge and step matching agree. Never merge varieties that matter (Italian parsley stays parsley-family via a pattern, not a synonym, unless the survey says the corpus uses them interchangeably — record).
- **Near-duplicate report** (`scripts/ingredient-dupes.ts`, read-only over a corpus copy): names that differ only by plural, descriptor, word order or a known synonym, with counts — feeds the table and the morning report (Roger picks further merges).
- **Index impact:** if normalized names feed an index or `specVersions`, bump per the rules (the index-version stamp rebuilds at start, 39b; record "reindex: automatic"). Run the shopping-view and makeable suites as the contract; expected diffs listed in Results.

#### Results (43n)

Branch `agent/43n-ingredient-names`. **Reindex needed: no** (names are
read at request time from stored lines; nothing an index, aggregate or
`specVersions` pins changed). **Deploy: yes** (Make, `/shopping`, the
recipe page's "Uses" and the `inventory make` seats read the new names).

Measured on a scratch clone of the content repo (825 recipes, 8,283
ingredient lines) with read-only dumps of every line's name, amount and
every step's "Uses", before (`origin/main` `db12c934`) and after (the
final code, review fixes included; the first-pass figures are in brackets):

|                                                                            | Before     | After                                      |
| -------------------------------------------------------------------------- | ---------- | ------------------------------------------ |
| Names still carrying amount debris (a unit, a number, a leading `to`/`or`) | 427 lines  | 22 (24)                                    |
| Lines whose name changed                                                   | —          | 999, 12.1 % (941)                          |
| Lines whose amount changed                                                 | —          | 1 ("1 packed cup cilantro": `1` → `1 cup`) |
| Distinct names (every alternative of every line)                           | 2,061      | 1,722 (1,727)                              |
| Step "Uses" matches                                                        | —          | +176 / −32 (+167 / −32)                    |
| Parse of all 8,283 lines, warm (min of 22 rounds)                          | 241–262 ms | 265–273 ms (505–510 ms)                    |

The 22 left are one-offs and typos ("50g gr 3Tbsp rainy mustard", "1
Tablespoon granulated sugar + 1/2 teaspoon cinnamon", "Half of 1/4
teaspoon"). Of the 32 step matches lost, most were false positives the old
garbage names produced — `tahini or chinese sesame paste note` matched
"(Note 4)", `raspberry conserve for swirling into the dough` every
"dough", `ground pork i use` every "use", `neutral oil enough to fill the
pot around deep` "deep" — and the rest are D3 working as meant: two lines
that now share a name ("for rolling: … granulated or coarse sugar" beside
"granulated sugar") or a head (`cheese`) show neither. The e2e fixtures
moved two names (`pork-carnitas` "ground cumin" → `cumin`,
`shallot-rice-pilaf` "freshly ground black pepper" → `black pepper`, a
staple either way) and no step match.

**1. Parser fixes** (`ingredientNames.ts`, `ingredientGrammar.ts`; each
shape a vitest case in `test/ingredientNames.test.ts`, "ranges, dashes and
amount shapes (43n)", with the line's old reading beside it):

- balela-salad's lines: "1/2 cup to 1 cup Italian parsley – chopped" →
  `italian parsley` (was `to cup italian parsley`); "… fresh mint- chopped"
  → `mint`; "1/4- 1/2 teaspoon cayenne or aleppo chili flakes" → `cayenne
pepper or aleppo chili flake`; "3 cups cooked garbanzo beans- ( 2 cans,
  drained and rinsed)" → `cooked chickpea`; "red bell pepper-diced" → `red
bell pepper` (already right; now pinned). `parseAmount` already read
  them (1 cup, ½ tsp, 3 cups, 1) — now pinned in `ingredientAmount.test.ts`.
- **A range or a second measure after the unit** (`secondMeasure`): "1/2
  cup to 2/3 cup", "3/4 cup to 7/8 cup (170g to 198g)", and the
  same-amount-two-ways shape of the Lagerstrom recipes, by far the most
  common debris (~300 lines): "50g or 1/2c heavy cream" was `or 2c heavy
cream`; "100g or 2 large carrots", "20g or 1/4 of a red onion".
- **A container after a measure** (`CONTAINER_AFTER_RE`): "15oz can",
  "One 15-ounce can", "12 ounce bag", "4 6-oz. bags", "two 4-ounce bars",
  "1-inch piece of", "2-inch knob". Every can shape reads `canned X`
  (Dn2, `withCanned`).
- **`tidyLine`** before anything else: `15-ounce` / `15- ounce` → `15
ounce`, `4 x 400g`, `8ish`, `3/4c+1tbsp`, `200g-250g`,
  `medium-to-large`, and a word dash with a space on either side as a comma
  (Dn1).
- **After the unit**: `(packed)` / `(can)` brackets, `55g (1/4) cup` (the
  bracket's unit after it), `4 lbs (meaty!) beef oxtail` (a bracket with a
  name after it is a remark, not "the unit is the name"), `1/2 cup plus 2
(150ml) tablespoons`.
- **The grammar** (shared with `parseAmount`): `NUMBER` reads `.5`
  (`1lb/.5kg`), `UNIT_ALT_RE` a range (`3-4lbs/1.5-2kg`), `MODIFIER`
  `packed`, `medium(-sized)`, `med`, `lrg`, `sm`. The one amount that moved
  is the packed cup (above).
- **Around the name**: a label before the amount ("egg wash: 1 large egg
  beaten with …", "for rolling: …", "optional topping: …"), "up to" /
  "roughly" before a quantity, an amount written last ("Bread flour 300g",
  "King Arthur Whole Wheat Flour 48g 40%", "Soy Sauce + 1 tsp"), "beaten
  with" / "mixed with" / "grated and …" / "+ extra" trailing remarks (not
  when the cut leaves only describing words — "finely chopped and toasted
  pecans" stays pecans), `(or substitute …)` / `(or sub …)` / `(or use …)`,
  `plus more` / `optional` / `Note 5` / `combination of both` dropped from
  `(or …)` lists, `OR` in capitals, "pinch or two", "zest 1 lemon".
- **The backlog's `(or A or B C)`** fell out of the same work (Dn6).

**2. Synonyms and descriptors.** A curated table in `toName` —
`NAME_SYNONYMS` (pattern → name, over the folded text) and
`NAME_DESCRIPTORS` (words dropped like `DESCRIPTIVE`'s), both exported for
the report. All three surfaces read names through `toName`, so a row moves
them together; `test/ingredientSynonyms.test.ts` proves it per pair (one
shopping key, an inventory item of either form meets a line of either
form, one merged row with the amounts added, a step that names the line
the other way finds it).

| Row                                                                                                                                                                                                                 | Lines it rewrote |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `ground` before black/white pepper, cinnamon, nutmeg, cumin, allspice, cardamom, turmeric, cayenne pepper → dropped                                                                                                 | 328              |
| a named cheese (feta, cheddar, mozzarella, ricotta, gruyère, parmesan, pecorino, provolone, cotija, monterey/pepper jack, gouda, fontina, asiago, manchego, halloumi, havarti, muenster, mascarpone) gains `cheese` | 58               |
| `full fat` → dropped                                                                                                                                                                                                | 36               |
| `cayenne`, `cayenne powder` → `cayenne pepper`                                                                                                                                                                      | 26               |
| `plain` before a yogurt → dropped                                                                                                                                                                                   | 23               |
| `AP flour`, `plain flour` → `all purpose flour`                                                                                                                                                                     | 18               |
| `distilled white` / `white distilled` / `distilled vinegar` → `white vinegar`                                                                                                                                       | 14               |
| `dry` before white/red wine → dropped                                                                                                                                                                               | 13               |
| `white sugar`, `granulated white sugar` → `granulated sugar`                                                                                                                                                        | 12               |
| `uncooked` (descriptor)                                                                                                                                                                                             | 11               |
| `unsweetened` before cocoa → dropped                                                                                                                                                                                | 10               |
| `mayo` → `mayonnaise`                                                                                                                                                                                               | 10               |
| `worcestershire` → `worcestershire sauce`                                                                                                                                                                           | 8                |
| `mild` (descriptor)                                                                                                                                                                                                 | 6                |
| `dijon` → `dijon mustard`; `parm`, `parmigiano(-reggiano)` → `parmesan`; `flat-leaf parsley` → `italian parsley`; `instant dry yeast` → `instant yeast`; `active yeast` → `active dry yeast`                        | 1–3 each         |

"mild feta cheese" + "feta cheese" (and "feta", "crumbled feta") are one
name, `feta cheese`; "mayo" and "mayonnaise" one, `mayonnaise`. Garbanzo =
chickpea was already a 32j synonym.

**3. Near-duplicate report**:
`editor/scripts/measure-ingredient-dupes.ts <content-dir> [--top N]`,
read-only and index-free like `measure-ingredient-names.ts` (the repo's
scripts live in `editor/scripts/`). Three sections: names that still
differ only by a plural, word order or a candidate word (grouped, with
line and recipe counts); "one word more" pairs both in the corpus; and
each table row with its line count. The scratch run is in the
orchestrator's scratch at `tmp/43/43n/dupes.md` (134 groups; re-run on
the final code — the canned rows below are its counts).
The top of what is **left for Roger to pick** (lines in brackets; none
merged by 43n):

1. salt (386) · kosher salt (99) · fine / coarse / flaky salt (≤4)
2. unsalted butter (205) · butter (70) · salted butter (5)
3. granulated sugar (171) · sugar (81)
4. light brown sugar (103) · dark brown sugar (91) · brown sugar (34)
5. olive oil (95) · extra virgin olive oil (57)
6. onion (57) · yellow onion (38) · white onion (25)
7. all purpose flour (186) · all purpose white flour (4) · unbleached (1)
8. instant yeast (42) · active dry yeast (13) · yeast (3)
9. ginger (38) · ground ginger (27) — fresh root vs the jar
10. pepper (50) · ground pepper (6) · white pepper (5)
11. smoked paprika (26) · paprika (21)
12. soy sauce (39) · low / reduced sodium soy sauce (4)
13. sea salt (19) · fine sea salt (12) · flaky sea salt (8)
14. ground beef (26) · lean ground beef (7)
15. chicken broth (19) · low / reduced sodium chicken broth (12) · chicken stock (22)
16. ground clove (23) · clove (6)
17. tomato (19) · canned tomato (10)
18. cheddar cheese (15) · sharp cheddar cheese (7) · sharp white / extra sharp (3)
19. cream cheese (17) · brick cream cheese (18)
20. yellow mustard (9) · mustard (8) · ground / dry mustard (6)
21. pumpkin puree (11) · canned pumpkin puree (11)
22. tomato paste (20) · canned tomato paste (4)
23. molasses (9) · dark molasses (9) · unsulphured molasses (8)
24. ground coriander (10) · coriander (3)
25. canned black bean (14) · black bean (3)
26. corn (7) · frozen corn (5) · canned corn (5)
27. creamy peanut butter (8) · creamy unsweetened peanut butter (2)
28. dry white wine was merged; sparkling wine (10) · dry sparkling wine (2) was not
29. cooked rice (3) · cooked white rice (2) · white rice (2) · rice (2)
30. bacon (8) · thick cut bacon (1)

**4. Index impact: none; reindex: not needed.** No index, aggregate or
`specVersions`-pinned module computes names: `/make` runs the parser over
the corpus in the browser, the `inventory make` seats over the same index
lines on the server, the shopping view and the recipe page at request
time. Stored state keyed by a name: the shopping settings'
`aisleOverrides` / `storeOverrides` (by `nameKey`) — the content repo has
no `shopping/settings.json` today, so nothing is orphaned (Tn2). Every
synonym row's name shelves where its old form did (`aisleFor` checked for
each row's before and after: spices, pantry, dairy, produce unchanged).
The aisles that moved are the canned lines going to the pantry (below)
and debris names now read right ("for rolling cup granulated" `other` →
`granulated sugar` pantry, "or 1c frozen pea" produce → `frozen pea`
frozen): 20 kinds of name against `origin/main`.

**5. Review fixes** (the read-only review of `ac854ec5`; each a vitest
case):

1. **Cayenne backtracking.** `cayenne(?: pepper)?(?: powder)?` backed off
   to `cayenne` in "2 cayenne peppers, sliced" and read `cayenne pepper
pepper`; the row is now `cayenne(?: pepper powder| powder)?(?!
peppers?\b)` ("cayenne peppers", "cayenne pepper powder" → `cayenne
pepper`).
2. **Cheese-row backtracking.** "pecorino romano cheese" backed off to
   `pecorino` (`pecorino cheese romano cheese`), the real line
   "cheddar-jack cheese blend" read `cheddar cheese jack cheese blend`,
   "ricotta salata" `ricotta cheese salata`. A `\b` before the lookahead,
   and the lookahead takes ` romano| jack| style| salata| reggiano`: they
   now read `pecorino romano cheese`, `cheddar jack cheese blend`,
   `ricotta salata`, `feta style cheese`.
3. **A label that is the name** (`dropLabel`). "Flour: 2 cups" read `cup`,
   "Kosher salt: 1 teaspoon" `teaspoon`. The label goes only when what
   follows still names something once its amount is gone, or when it names
   a part of the recipe (`optional`, `for …`, `egg wash`, `topping`,
   `filling`, `garnish`, `frosting`, `glaze`, `crust`, `dough`, `add-in`,
   …); otherwise the line reads as "Flour, 2 cups" — `flour`, `kosher
salt`, "Bread flour: 500g" `bread flour`, "Eggs: 2 large" `egg`. The
   corpus has no such line today (all 47 labelled lines name a part), so
   no name moved.
4. **`canned` for every can shape** (Dn2, rewritten): 75 more lines moved
   (below), Make unchanged, step matches +9 / −0 against the first pass.
5. **Speed.** The first pass parsed ~1.9× slower than `origin/main` (min
   505–510 ms against 273–281 ms for all 8,283 lines, warm, tsx on this
   machine at load 4–13); now 265–273 ms against 241–262 ms, ~1.07×. What
   did it, from a CPU profile (`toName` was 43 % of the time): each
   synonym table tested once as one combined alternation before its rows
   run (`anyRow`; a row can only fire on text an earlier row wrote, so a
   miss skips the table safely), `toName` on the prep cut only when the
   cut changed the text, the alias bracket's cheap prefix test before its
   `toName`, `TRAILING_AMOUNT_RE` behind a `/\d[\p{L}\s.%]{0,20}$/u`
   gate, `tidyLine`'s rewrites each behind a test for its character, and
   `stripMarkup` returning early when a line has no `<`, `[` or `&`. The
   dumps before and after the speed work are byte-identical.

Also from the review pass: a choice that is only a measure is dropped
("3 cups cooked black eyed peas (1/2 pound) or 2 15-ounce cans" was
`cooked black eyed pea or can`; "(or a 15 oz can, if u want I guess)"
was `… or can or if u want i guess`), `(or …)` parts opening with `if`
are remarks ("honey (or less, if using sweetened peanut butter)" was
`honey or if using sweetened peanut butter`), `(drained and rinsed)` is a
remark bracket (it left only its `and`), and "garbanzos beans" is
`chickpea` (was `chickpea bean`).

**Canned, re-measured** (Dn2) — 75 lines moved against the first pass,
all can lines: "1 (28 ounce) can crushed tomatoes", "1 can black beans",
"2 cans (15 ounces each) pinto beans", "1 can (14 oz) sweetened condensed
milk", "1 (13.5- ounce) can full-fat coconut milk", "1 can chiles in adobo
sauce", "1 can salmon", "15 ounces (can) refried beans", "2 (15-ounce
cans) chickpeas" and the like now read `canned X`; "15 ounce can or 260g
drained cooked black beans" `canned black bean or cooked black bean` (was
`canned cooked black bean` — the alternative restored), "1 (14-ounce)
can (drained and rinsed) or 1 package of frozen corn" `canned corn or
frozen corn`, "450g or 2 8oz cans tomato sauce" `canned tomato sauce or
tomato sauce`, "1 can corn or peas" `canned corn or canned pea`, "2 cans
black beans (or pinto or cannellini beans)" three canned alternatives;
"6-ounce can of water" is `water` again (a staple; it had become `canned
water`), and "1 (8-ounce) can refrigerated crescent roll dough" stays
`refrigerated crescent roll dough`. Left as they were: a can only in a
remark after the name ("12 ounces corn kernels (1 can, drained)", "1 1/2
cups black beans ((1 15-oz can …))") — the measure there is the ounces or
cups.

- **Make: unchanged.** `/make`'s buckets for a can-heavy pantry (black
  beans, tomatoes, chickpeas, kidney and pinto beans, corn, tomato sauce
  and paste, pumpkin puree, coconut milk, green chiles, onion, garlic, …;
  food scope, the default staples) are identical before and after (11 can
  make, 39 one away, 54 two away), and so are they with every can item
  typed `canned …` — a plain name on hand is the tail of `canned X`, and
  `canned X` on hand has `X` as its tail (vitest: black beans, tomatoes,
  chickpeas, kidney beans, either way). Make reads a name without its
  leading `canned` (`withoutCanned`, in `namesMatch`, `suggestNames`, Buy
  next's item, the add field's candidates and a card's add tapes), so "1 (15 oz) can beans" is
  still met by black beans on hand (Dm7's bare `bean`) and the add field
  still offers "black bean", not "canned black bean". The bean family
  already ignored `canned`. So the page reads as before — "Use black beans
  for chickpea", "Needs chickpea (swap: black beans)": its tapes are what
  a tap would add. A requirement's label keeps the can: the `inventory
make` seat's `missing` / `swaps[].line` say `canned chickpea`, and so do
  a static tape and `makeableBeans`' swap labels (`inventory` and
  `makeableBeans` tests updated; `make.spec` and `accessibility.spec`
  unchanged).
- **Shopping:** every `canned X` shelves in the pantry. Against the first
  pass, the moves are canned goods leaving fresh aisles — `tomato`,
  `petite tomato` (6 lines), `corn` (2), `green chile` (4), `green bean`,
  `ro tel tomato green chili` produce → pantry; `salmon`, `anchovy`
  meat-fish → pantry; "1 (14-ounce) can … or 1 package of frozen corn"
  frozen → pantry (its first choice is now the can); and "6-ounce can of
  water" back to `water`, a staple. A list
  holding "1 can black beans" and "1 cup black beans" now has two rows
  (`canned black bean`, `black bean`) where `origin/main` merged them as
  "1 can + 1 cup black beans" — as "28 oz can diced tomatoes" and "2
  tomatoes" were already two rows on `origin/main` (`can tomato`). A row
  counted in cans says `canned` once: "2 cans tomatoes", not "2 cans
  canned tomatoes" (`shoppingView` `displayName`; the key keeps it).
- **Steps:** a step says "the tomato sauce", not "the canned tomato
  sauce", so a `canned X` line also goes by `X` (`stepIngredients`
  `lineNames`). Against the first pass +9 / −0 ("Add the tomato sauce"
  finds "1 15 oz. can tomato sauce" again, "the beans" both bean cans in
  mediterranean-dense-bean-salad); against `origin/main` +176 / −32.
- **e2e fixtures:** `make-beans` reads six bean cans `canned …`,
  `christmas-cookies`' weeknight-chili two (`canned kidney bean`, `canned
tomato`); the shopping row reads "2 cans kidney beans" as before.

**For 43m.** Normalized names: `prepareCorpus(corpus).recipes.get(slug)
.requirements` (already parsed, cached) and, per requirement, each
`alternatives[i]` with `nameKey` (to count and dedupe — "in 34 of 120
drinks" is distinct recipes per `nameKey`) and `nameLabel` (to show; it is
also what a `/regex/` item should test, the folded words joined). A typed
pattern or tape normalizes through `toName(text)`. Count each
requirement's first alternative, or every alternative once per recipe;
skip `staple` and `optional` requirements. Every can line's name opens
with `canned` (Dn2): for "most used", count and show
`withoutCanned(alternative)` (as `suggestNames` and the add field do), or
"black beans" splits into two tapes; `beans.ts` already ignores `canned`.

**Decisions**

- **Dn1 — a dash after a word, with a space on either side, is a comma.**
  "fresh mint- chopped", "Italian parsley – chopped", "garbanzo beans- (2
  cans …)", "olive oil — plus more for the pan", "ground pork - i use
  80/20". Not when `or` follows (`ground beef -or ground lamb` keeps its
  alternative), and never a hyphen between letters: "red bell
  pepper-diced" reads right already (`diced` is descriptive), and
  "semi-sweet", "all-purpose", "fire-roasted" are one word each.
- **Dn2 — every can reads `canned X`** (the orchestrator's call at
  review). The old names kept the word only where the can came after a
  measure (`can tomato`), which kept "28 oz can diced tomatoes" apart from
  fresh tomatoes on a list and shelved it in the pantry (`aisles.ts` reads
  `can`/`canned` as a cue), while "1 (28 ounce) can crushed tomatoes" (the
  can as the unit) read `tomato` and shelved in produce. Now every shape —
  the can as the unit, after a measure, in the size bracket ("2 (15-ounce
  cans) chickpeas"), as a bracket ("15 ounces (can)") — reads `canned X`;
  each choice before the first comma is canned; a second measure joined
  by `or` offers the canned thing or the other, without `cooked` /
  `frozen` / `drained` on the canned one. Not water, refrigerated dough or
  whipped cream. Make is unaffected (tail rule); shopping keeps canned and
  fresh apart; step matching reads the name with and without `canned`.
  Other containers (bag, box, jar, bar, block, piece, knob, pack) are
  dropped.
- **Dn3 — a synonym's target is the longer name unless measured
  otherwise.** Shortening a name to one another line contains makes it
  ambiguous for step matching (D3 shows neither), so named cheeses gain
  `cheese` rather than losing it — and "Sprinkle the feta" now finds the
  feta line. The two rows that shorten — ground spices and `white vinegar`
  — were measured on the step dump: spice lines +17 / −4 (cayenne
  included), vinegar lines unchanged.
- **Dn4 — what was left apart** (varieties that matter, or amounts that
  don't add): `cooked` (two cups of cooked rice and a cup of rice don't
  add up on a list), low/reduced sodium, kosher vs table salt (volumes
  differ), salted vs unsalted butter, granulated sugar vs sugar, lean
  ground beef, ground ginger / mustard / cloves / coriander / thyme (the
  bare name is often fresh or another thing), dry vermouth, unsweetened
  applesauce. **Italian parsley** stays its own name: the survey found
  "italian parsley" in 2 lines and "flat leaf parsley" in 1, against
  "parsley" in 44, and no recipe using them as one — so `flat-leaf
parsley` → `italian parsley` (one plant, two names) and plain `parsley`
  stays; Make's tail rule already lets parsley on hand meet "Italian
  parsley".
- **Dn5 — a named cheese keeps its own word as a head** (`stepIngredients`
  `CLASS_HEADS`): "mozzarella cheese" goes by `cheese` and `mozzarella`, so
  a step that says "the mozzarella" still finds a line that now ends in
  `cheese`; the shared head `cheese` stays ambiguous between two cheese
  lines, as D3 wants.
- **Dn6 — `(or A or B C)` splits** (backlog row, struck): a `(or …)`
  group's text goes through `splitAlternatives` and `inheritTails` like
  the line's own, so "black beans (or pinto or cannellini beans)" is three
  alternatives and pinto on hand meets it strictly (`makeableBeans` test
  updated). `inheritTails` no longer lends a tail that opens with a
  connecting word: "Chambord or crème de mure" was `chambord de mure`.
- **Dn7 — the close tier's typo rule takes a class noun** (`makeable.ts`):
  "mozarella" on hand still comes close to "1 cup shredded mozzarella",
  now `mozzarella cheese`.

**Expected diffs in the contract suites** (all in this branch):
`ingredientNames.test.ts` — "dry red wine, such as Cabernet Sauvignon" →
`red wine` (×2, drink lines), "1/2 cup plus 2 tablespoons white sugar" →
`granulated sugar`, "kosher salt & freshly ground black pepper" → `kosher
salt` + `black pepper`, and from the review "1 can black beans" →
`canned black bean` (was `black bean`), "15 ounces (can) refried beans" →
`canned refried bean`, "1 (14-ounce) can (drained and rinsed) or 1
package of frozen corn" → `canned corn or frozen corn` (was `frozen
corn`), "1 (15-ounce/425g) can chickpeas, drained and rinsed" and "1 can
garbanzo beans, drained" → `canned chickpea`; `makeableBeans.test.ts` —
the `(or pinto or cannellini beans)` line has three alternatives and
reads `canned black bean or canned pinto bean or canned cannellini bean`,
and the bean-swap labels read `canned chickpea` / `canned kidney bean`;
`aisles.test.ts` — "1 (14 oz) can diced tomatoes" shelves in the pantry
(was produce: "the unit `can` is gone before the name"). `makeable`,
`makeMatchers`, `makeMatcherUi`, `shoppingView`, `shoppingLines`,
`stepIngredients`, `ingredientAmount`, `headsUp`: unchanged and green;
`inventory.test.ts` — the seat's bean-swap `line` and `missing` read
`canned chickpea` / `canned kidney bean`. e2e: no expectation moved.

**Roger to confirm:** the merges in the table (above), especially ground
spices → the bare spice, `dry` red/white wine → the wine, white sugar →
granulated sugar; `canned X` for every can (Dn2) — in particular that a
list now keeps "1 can black beans" and "1 cup black beans" on two rows
(fold `canned` in the shopping key if one row is wanted), and `canned chickpea` in the `inventory make` seat's labels (the page's tapes drop it); the label rule (a label is the name unless
something named follows it, or it names a part of the recipe); and which
of the 30 left to merge.

**Gates** (all through the capped heavy slot), on the final code (review
fixes included): `pnpm --filter recipe-editor typecheck` and `pnpm
--filter recipe-website exec tsc --noEmit` clean; `pnpm exec vitest run`
**2,872 / 2,873** — the one red a 30 s timeout under load (`cliJson`
"keeps the inventory…", the same test the first pass saw time out),
green re-run alone (26 / 26). Playwright in Docker build mode
(`DOCKER=1 heavy-pw.sh`), e2e + mobile: `make.spec`, `cook-view.spec`,
`recipe-cooking-order.spec`, `shopping.spec`, `shopping-modes.spec`,
`drinks.spec` and `accessibility.spec` 169 / 171, the two red being
bean-swap texts a first try had changed to "for canned chickpea" (the
page's tapes drop the can, so those edits were reverted); `make.spec` +
`accessibility.spec` re-run on the final code **115 / 115**. The first
pass: 2,840 / 2,842 and 103 passed. No baseline moved or was
regenerated: the page's tapes read as before, and the fixture names that
moved (above) show on no screenshot; no new spec, so no dev-mode run.

#### Traps (43n)

- **Tn1 — shortening a name can cost step matches.** A canonical name that
  another line's name contains is ambiguous (D3). Before adding a row that
  shortens, dump every step's "Uses" before and after (the 43n survey
  scripts did; `matchStepIngredients` over a scratch clone) — gains and
  losses both.
- **Tn2 — stored overrides are keyed by the old name.** `/shopping`'s
  aisle and store overrides are keyed by `nameKey` when they are written;
  a new synonym row orphans one written under the old name (the content
  repo has none today). Re-save the override, or re-key on read if it
  happens.
- **Tn3 — `inheritTails` runs after the table.** "instant or active dry
  yeast" builds `instant dry yeast` after `toName` has run, so the
  `instant dry yeast` row never sees it (3 lines). A row that must catch
  lent tails belongs after `inheritTails`, not in `toName`.

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
