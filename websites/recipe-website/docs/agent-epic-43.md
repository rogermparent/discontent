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

_Pending._

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

_Pending._

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
