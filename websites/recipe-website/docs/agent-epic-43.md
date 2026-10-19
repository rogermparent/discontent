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

Branch `agent/43n-ingredient-names`. **Reindex needed: no** (names are
read at request time from stored lines; nothing an index, aggregate or
`specVersions` pins changed). **Deploy: yes** (Make, `/shopping`, the
recipe page's "Uses" and the `inventory make` seats read the new names).

Measured on a scratch clone of the content repo (825 recipes, 8,283
ingredient lines) with read-only dumps of every line's name, amount and
every step's "Uses", before (`origin/main` `db12c934`) and after:

|                                                                            | Before    | After                                      |
| -------------------------------------------------------------------------- | --------- | ------------------------------------------ |
| Names still carrying amount debris (a unit, a number, a leading `to`/`or`) | 427 lines | 24                                         |
| Lines whose name changed                                                   | —         | 941 (11.4 %)                               |
| Lines whose amount changed                                                 | —         | 1 ("1 packed cup cilantro": `1` → `1 cup`) |
| Distinct names                                                             | 1,746     | 1,727                                      |
| Step "Uses" matches                                                        | —         | +167 / −32                                 |

The 24 left are one-offs and typos ("50g gr 3Tbsp rainy mustard", "1
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
  "1-inch piece of", "2-inch knob". A can or tin leaves `canned` (Dn2).
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
orchestrator's scratch at `tmp/43/43n/dupes.md` (134 groups, 560 pairs).
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
17. tomato (23) · canned tomato (6)
18. cheddar cheese (15) · sharp cheddar cheese (7) · sharp white / extra sharp (3)
19. cream cheese (17) · brick cream cheese (18)
20. yellow mustard (9) · mustard (8) · ground / dry mustard (6)
21. pumpkin puree (16) · canned pumpkin puree (5)
22. tomato paste (22) · canned tomato paste (2)
23. molasses (9) · dark molasses (9) · unsulphured molasses (8)
24. ground coriander (10) · coriander (3)
25. black bean (8) · canned black bean (8)
26. corn (9) · frozen corn (5) · canned corn (2)
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
rewritten name shelves where its old form did (`aisleFor` checked for
each row's before and after: spices, pantry, dairy, produce unchanged;
`can tomato` and `canned tomato` both pantry).

**For 43m.** Normalized names: `prepareCorpus(corpus).recipes.get(slug)
.requirements` (already parsed, cached) and, per requirement, each
`alternatives[i]` with `nameKey` (to count and dedupe — "in 34 of 120
drinks" is distinct recipes per `nameKey`) and `nameLabel` (to show; it is
also what a `/regex/` item should test, the folded words joined). A typed
pattern or tape normalizes through `toName(text)`. Count each
requirement's first alternative, or every alternative once per recipe;
skip `staple` and `optional` requirements. `canned black bean` and `black
bean` are two names (Dn2), as `can black bean` and `black bean` were: fold
them only if "most used" should — `beans.ts` already ignores `canned`.

**Decisions**

- **Dn1 — a dash after a word, with a space on either side, is a comma.**
  "fresh mint- chopped", "Italian parsley – chopped", "garbanzo beans- (2
  cans …)", "olive oil — plus more for the pan", "ground pork - i use
  80/20". Not when `or` follows (`ground beef -or ground lamb` keeps its
  alternative), and never a hyphen between letters: "red bell
  pepper-diced" reads right already (`diced` is descriptive), and
  "semi-sweet", "all-purpose", "fire-roasted" are one word each.
- **Dn2 — a can or tin after a measure becomes `canned`.** The old names
  kept the word (`can tomato`, `can black bean`), which kept "28 oz can
  diced tomatoes" apart from fresh tomatoes on a list and shelved it in the
  pantry (`aisles.ts` reads `can`/`canned` as a cue). Dropping it would
  have merged canned with fresh; `canned tomato` keeps both and reads as
  people write. Other containers (bag, box, jar, bar, block, piece, knob,
  pack) are dropped. "1 can black beans" (the can as the unit) still reads
  `black bean`, as before.
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
salt` + `black pepper`; `makeableBeans.test.ts` — the `(or pinto or
cannellini beans)` line has three alternatives and reads `black bean or
pinto bean or cannellini bean`. `makeable`, `makeMatchers`,
`makeMatcherUi`, `shoppingView`, `shoppingLines`, `stepIngredients`,
`ingredientAmount`, `aisles`, `headsUp`: unchanged and green.

**Roger to confirm:** the merges in the table (above), especially ground
spices → the bare spice, `dry` red/white wine → the wine, white sugar →
granulated sugar and `canned X` names; and which of the 30 left to merge.

**Gates** (all through the capped heavy slot): `pnpm --filter
recipe-editor typecheck` and `pnpm --filter recipe-website exec tsc
--noEmit` clean; `pnpm exec vitest run` on the final code 2,840 / 2,842 — the two red were
30 s timeouts under a load average of ~8 (`cliJson` "keeps the
inventory…", `instance` "syncs a workstation commit…"), both green re-run
alone (53/53); an earlier full run, before the `(or …)` split, was 2,839 /
2,839;
Playwright in Docker build mode (`DOCKER=1 heavy-pw.sh`), `make.spec`,
`cook-view.spec`, `recipe-cooking-order.spec`, `shopping.spec`,
`shopping-modes.spec`, `drinks.spec` × e2e + mobile: **103 passed**. No
baseline moved or was regenerated: the e2e fixtures changed two names
(above), neither on a screenshotted surface; no new spec, so no dev-mode
run.

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
