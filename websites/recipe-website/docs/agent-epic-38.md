# Epic 38 — Follow-through: reader UX, jobs and import polish, shopping v2, photo import, a content round

> **This is the durable source of truth for epic 38.** Read it before
> touching the `/drinks` page, the homepage intent tiles, the tag board and
> `/tags`, Make matching and staples, the `/jobs` page and job timeline, the
> local-model reading path (`editor/controller/llm/`), the shopping list's
> line parsing and merging, or the photo import.
> The orchestrator updates the roadmap **Status** column and the **Now**
> line at every phase boundary; workers add their phase's **Results** and
> **Traps** under their own headings. Earlier epics are cited by number with
> a prefix (`37-D4`, `36-T24`). Background: `agent-epic-37.md` (import jobs),
> `agent-epic-36.md` (the local model), `agent-epic-35.md` (the shopping
> list), `ui-overhaul.md` "Usability pass (2026-10-15)".

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 38a ∥ 38b (wave 1).

## Context

Roger, 2026-10-16: _"Let's plan next steps."_ The 2026-10-15 usability pass
(#239, #240, #243) and epic 37 (import jobs, #237–#242) are merged; neither is
deployed yet. A sweep of the durable docs found about 39 open backlog rows.
Roger chose all four directions offered:

- reader UX follow-through;
- jobs and import polish;
- photo / recipe-card import;
- shopping list v2.

He also chose a **60-day window** for `/drinks`' seasonal row (the open
question from the usability pass) and a **small content round**.

## Decisions

### D1 — `/drinks`' seasonal row has a 60-day window

The row keeps `orderByNextOccurrence`, but shows only when the next
drink-bearing holiday is at most 60 days away (Roger's pick). One
`withinDays(today, date, n)` helper serves it and the homepage's Coming-up
window.

### D2 — Reader counts follow aliases

Tag-board counts (intent tiles, Coming up, browse chips, `/tags`) count a
recipe that carries only an alias of a term, through the same `termKeys` the
search uses. `/tags` lists a term's aliases ("also: …").

### D3 — `?import=` never runs on GET

`/new-recipe?import=<url>` prefills the form and waits for one click.
Bookmarklets and links keep working; a crawler or prefetch can't start a job.

### D4 — Shopping v2 features are switches (35-D-style)

Sub-recipe expansion is a shopping setting, **on** by default. Browser-held
ticks ("Done shopping" sends one `PATCH`) are a setting, **off** by default.

### D5 — A photo import is a transcription, then a pasted-text import

The vision model only transcribes (`vision.transcribe`). The existing
pasted-text path does the reading: the extractor, the grounding guard (against
the transcription), and the 36e several-recipe split. Each model call is its
own GPU acquire, so the model swap is logged and the placement check runs for
both. Photos live under the job's dir, never in the meta, so Retry works.
Where there is no vision model (the Pi, CI) the photo mode is hidden; CI uses
a TEST_MODE stand-in transcriber.

### D6 — The content round applies only what needs no decision

Duplicate merges and the drink rows with an obvious fix are applied on the
real repo (workstation stopped, a scratch-clone dry run first, counts before
and after recorded here). Calls that are Roger's are listed, not applied.
The content repo is never pushed from a session.

## Roadmap

| Phase    | Size | Branch                  | Status | PR  | What                                                                                    |
| -------- | ---- | ----------------------- | ------ | --- | --------------------------------------------------------------------------------------- |
| 38a      | M    | `agent/38a-reader-ux`   | 🟡     |     | D1, D2: `/drinks` window + families, tile counts, `/tags` aliases, Make matching, AA.   |
| 38b      | M    | `agent/38b-jobs-polish` | 🟡     |     | D3: dish names, `/jobs` idle refresh and Pi card, Pi jobs volume, roundup steps, queue. |
| 38c      | M    | `agent/38c-reading`     | 📝     |     | Local-model post-processing (36-T23–T36), video link follow, several JSON-LD, cache.    |
| 38d      | M    | `agent/38d-shopping-v2` | 📝     |     | D4: `OR:` lines, sub-recipe expansion, amount-less merge, browser-held ticks.           |
| 38e      | L    | `agent/38e-photo`       | 📝     |     | D5: photo / recipe-card import (vision transcribe → text import) on every surface.      |
| 38f      | S    | (content repo)          | 📝     |     | D6: duplicate merges, `lunch` → `sandwich`, drink fixes; Roger's calls listed.          |
| 38-close | S    | `agent/38-close`        | 📝     |     | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                       |

Ordering, in waves: 38a ∥ 38b (disjoint: common/reader vs editor/jobs), then
38c ∥ 38d, then 38e (the GPU and a model pull), 38f whenever the workstation
editor is stopped (content only, no heavy work), then 38-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its own
  PR off fresh `origin/main`, opened ready after a local review. A read-only
  review agent reviews each M/L PR. Merge when every check that ran is green
  and the PR is `CLEAN`; merge commit; delete the branch. The next PR merges
  main before it merges.
- Machine memory: typecheck, vitest and builds go through
  `orchestrator/heavy.sh`, Playwright through `heavy-pw.sh`, at most two
  heavy workers at once. GPU real checks go through the orchestrator, which
  pauses the other GPU user first.

## Phases

### 38a — Reader UX follow-through (M)

- `/drinks` seasonal row: D1, in `common/components/DrinksPage/Seasonal.tsx`
  with a `withinDays` helper beside `withinComingUpWindow`.
- The ready list groups by drink family (Daiquiri ×2): one entry per family
  ("Daiquiri · 2 recipes", → `/tags/<family>`), singletons as today. A family
  is a child of `drink` not in `DRINK_STYLE_SLUGS`; the page data passes a
  slug → family map (`RecipeMatch.recipe` has no tags).
- Homepage intent tiles: a per-tile fallback in `homepageIntents` (hierarchy
  total if the slug is in the hierarchy, else the flat count); D2's alias
  counts in `readTagBoard` via `termKeys`.
- `/tags` lists aliases. The export's alias redirect stays client-side.
- Make matching: "tequila blanco" ≡ "blanco tequila" (word-order-insensitive
  two-word names, guarded; or `SYNONYMS` rows for blanco, reposado, añejo).
  Staples persist to editor settings when signed in and seed the browser; the
  export keeps the browser only.
- AA contrast on the form's submit error, the 36e picker and the roundup
  picker.

### 38b — Jobs polish (M)

- Dish names on the job page (`resultRows` reads `row.recipe.name` for
  `SplitReading` rows before "Recipe N").
- `/jobs` polls every 10 s while idle (2 s while live), paused while the tab
  is hidden.
- The `/jobs` card shows on every role; Settings → Tools stays
  workstation-only otherwise.
- `deploy:pi` mounts a host dir for `RECIPE_JOBS_DIR`.
- D3: `?import=` prefills and waits for the Import button.
- The roundup picker shows live steps from its chunk jobs (`useJobPoll`).
- Queue gaps: the save-time image fetch through `site:<host>`; the 403 drop
  list in the shared queue store; `SiteState` waiters honour tiers.

### 38c — Import reading fixes (M)

- Deterministic post-processing in the local-model path: ALL-CAPS names to
  title case (36-T25); "all in" is the total time (36-T26); an unnumbered
  method split into steps (36-T24); colon-less pasted sub-headings (36-T30);
  a source header that changes the reading (36-T23); a credit line taken as
  the only step (36-T36). Each has a unit test from the trap's real example.
- A video description with no recipe but one recipe link: follow it through
  the site queue (a `follow` step).
- A page with several JSON-LD `Recipe` nodes goes to the 36e picker.
- The last reading is cached by job spec hash in the job store, so a `--pick`
  retry after a several-recipe refusal doesn't re-run the model.
- Non-YouTube video start times (Vimeo `#t=`).

### 38d — Shopping list v2 (M)

- `OR:` lines are an alternative of the previous line, not their own row.
- Sub-recipe expansion (D4): a `[text](/recipe/slug)` line expands into the
  sub-recipe's ingredients, scaled where the amount reads, under a
  "for <sub-recipe>" note.
- Amount-less lines merge: "pinch salt" + "2 tsp salt" → "2 tsp salt + a
  pinch"; `AS_NEEDED` parts become a suffix.
- Browser-held ticks (D4), sent by "Done shopping" as one `PATCH`.

### 38e — Photo / recipe-card import (L)

- D5. `RECIPE_LLM_VISION_MODEL` (default `qwen2.5vl:7b`); `chatJson` gains
  `images?: Buffer[]` (Ollama `images`, OpenAI-style `image_url` parts).
- Surfaces: a form "Photo" mode (up to 4 images, job kind `form-photo`),
  `recipes import --photo <file…>`, `recipe_import` `photos: [path]` and
  multipart `/api/import`.
- Validation through `checkImageFile`/`readImageFile` (15 MB cap); an
  optional "use the photo as the recipe image" checkbox, off by default.

### 38f — Content round (S, real repo)

- Merges: marble rye, white chili, barbacoa ×2, arayes (the better-sourced
  one stays; features follow); `lunch` → `sandwich`.
- Drink rows with no decision: the red-wine-spritzer citation, the Sake Cosmo
  image.
- Roger's calls, listed here and not applied: the two kid-party drinks, a
  source for the Spicy Cascara Highball, the Zero-Proof Spritz, and the 51
  uncertain facet calls.

### 38-close (S)

- Close-out, the CLAUDE.md "Durable docs" bullet, backlog rows, memory,
  Roger's steps.

## Verification

- Per PR: typecheck ×2, the full vitest suite and the touched Playwright
  specs in build mode, through the heavy slot; CI green and `CLEAN`.
- 38a: `/drinks` with the make-drinks fixture shows one Daiquiri entry ×2;
  the seasonal row is hidden on a frozen date 61+ days out and shown at
  ≤ 60; tile counts include an alias-only fixture recipe; accessibility specs
  pass with the new error colour.
- 38b: a `form-url` batch's job page shows dish names; a CLI import appears
  on an idle `/jobs` within 10 s; `/new-recipe?import=` creates no job until
  the button is pressed.
- 38c: unit tests per trap example; a real-model check on a scratch clone
  (GPU coordinated) with one 36-T24/T25 paste.
- 38d: unit tests for `OR:`, expansion and the pinch merge; `shopping.spec`
  covers expansion and Done-shopping mode.
- 38e: a real check on a scratch clone (GPU coordinated): a photographed
  recipe card through `recipes import --photo card.jpg --dry-run --verbose`
  logs `vision.transcribe` then `llm.extract`, both at 100% GPU, and the
  recipe is grounded. The form's Photo mode shows live steps.
- 38f: the scratch-clone dry-run diff is reviewed before the real apply;
  each term's count before and after is recorded here.

## Traps

### 38a

### 38b

### 38c

### 38d

- **A link text the grammar reads as no name is no sub-recipe.** The check
  reads the link's text as an ingredient name; text that is a modifier or a
  unit ("Level 1", "Large Batch", a lone "B") reads as nothing, and the line
  stays as written — silently, with no warning. Real sub-recipe names are
  dish names; the unit tests had to rename their placeholders.
- **An editor without 38d drops `for` when it rewrites an item.**
  `parseShoppingItem` keeps known keys only, so a tick saved by the Pi before
  its deploy rewrites an expanded line without its "for Simple Syrup" note.
  The line itself stays. Likewise `shopping settings set features.subRecipes`
  (or `holdTicks`) with `--remote` against such an editor is `validation`
  (the strict schema), as 35p's `--force` was.
- **Next's route announcer is a `role="alert"` too**: a Playwright
  `getByRole("alert")` on `/shopping` needs a text filter.
- **The fixture reindex touches every LMDB file**: rebuild the one fixture's
  recipes index only (`rebuildIndex` per type, not
  `build-fixture-indexes.ts`, which rewrites every fixture), restore the
  `lock.mdb` files and untouched types from git, and delete the
  `.pagination-changes.json` it leaves (35d's trap).

### 38e

### 38f

## Results

### 38a — Reader UX follow-through

### 38b — Jobs polish

### 38c — Import reading fixes

### 38d — Shopping list v2

**Reindex needed: no.** No index, index value or spec version changed:
`parseIngredientLine` feeds Make in the browser (over the index's flattened
lines) and the shopping view, never an index. The shopping store gained one
optional item key (`for`) and two settings switches, both read leniently
(a file without them reads as before; an older editor ignores them).

New: `common/util/shoppingLines.ts` (`recipeLines`, moved out of the seat;
`subRecipeLink`; `expandRecipeLines`; `MAX_SUBRECIPE_DEPTH` = 3) and
`test/shoppingLines.test.ts`. Changed: `ingredientNames.ts` (the `OR:`
label, `orPrevious`, `parseIngredientList`'s fold; a bare "pinch salt" /
"dash bitters"), `shoppingTypes.ts` (`for`, `ShoppingSubRecipe`,
`features.subRecipes` on and `features.holdTicks` off), `shoppingView.ts`
(the `OR:` fold, `alternatives`, `forNote`, the as-needed suffix),
`shoppingTickSync.ts` (holding, `done()`, `setHold`), the seat's add, the
settings schema and the `shopping_settings_set` description, the page (a
"Done shopping" bar, row notes), the curator skill's shopping section, and
the `shopping` fixture (Simple Syrup and Lemonade, recipes index rebuilt).
The CLI needed nothing: `shopping settings set features.<name>` lists
`SHOPPING_FEATURES`, so `subRecipes` and `holdTicks` are there.

Decisions:

- **Dd1 — Sub-recipes expand when added, not on every render.** The view
  runs in the browser over stored items alone and cannot read recipes. So
  the seat stores the sub-recipe's own lines, each with `for` (the path of
  sub-recipes, outermost first: `{slug, name, called?}`) and `line` = its
  index in the sub-recipe; `recipe` stays the recipe that was added, so
  "remove Lemonade" takes its syrup lines too, and ticks and Clear need
  nothing new. The `subRecipes` switch therefore governs adds; lines already
  on the list stay as they are (said in the switch's help).
- **Dd2 — A line is a sub-recipe only when the link is its own name** with
  nothing but an amount before it (the text before the link, with a
  placeholder for the link, must read as that placeholder). "1 tsp maple
  syrup or [simple syrup](…)" buys maple syrup; "3 Tbsp tonkatsu sauce (or
  make [Homemade Tonkatsu Sauce](…))" buys the sauce; "½ oz rich [simple
  syrup](…)" is rich syrup, not the linked recipe. The multiplier:
  `N batches` / `N recipe` / a bare count → ×N (`half batch` → ×½); no amount
  → ×1; a pinch or a splash → ×1. A **measure** ("¾ oz [simple syrup](…)")
  lists **one batch per batch of the recipe above** and notes what was
  called for, scaled ("for Simple Syrup (1½ oz called for)" at ×2) — the
  brief's "unreadable → ×1 with a note", and the shopper can judge. An amount
  the parser cannot read at all is ×1 with the words as the note. Factors
  multiply down the path, and by the recipe's or plan's scale.
- **Dd3 — A sub-recipe's line merges with the recipe's own of that name**
  (the `nameKey` merge, unchanged): Lemonade's ¼ cup sugar and its syrup's ½
  cup are one row, "¾ cup sugar", noted "partly for Simple Syrup"
  ("for Simple Syrup" when every line of the row is), each source reading
  "… — 1/2 cup sugar (for Simple Syrup)". No separate "for" section: with
  aisles on, a sub-recipe's lines are in several aisles anyway.
- **Dd4 — Guards, as warnings, never errors**: an ancestor-path set (a cycle
  A → B → A keeps B's line to A as written), depth 3, a missing sub-recipe
  or one with no lines keeps the linking line as written. Each is one
  `warnings` entry on the add ("Kept "1 recipe lavender syrup" as written:
  there is no recipe "lavender-syrup".") — the add page, the CLI and MCP
  already print `warnings`. Reads are cached for the whole add (a plan names
  the syrup many times); the 35c item cap still bounds the result.
- **Dd5 — `OR:` lines fold on render, with no new stored field.** An item
  whose text opens with `OR:` joins the row of the line just above it in the
  same lot (recipe, plan path, scale, sub-recipe path; the nearest earlier
  id, so a recipe on the list twice finds its own), shown as "or ¼ cup (50g)
  green sanding sugar and ¼ cup (50g) red sanding sugar" under the row (and
  `· or …` in the copy text). Its id rides in the row's `ids` — a tick or a
  Clear takes it along — but not in the amounts, counts or checked state.
  Folding on render means the Christmas Baking list already on the real
  repo reads right with no rewrite. A typed `OR:` line, or one whose line
  above is gone, keeps its own row. Every switch off still folds it: it is
  grammar, not a feature.
- **Dd6 — Make: an `OR:` line is no requirement of its own.**
  `parseIngredientLine` strips the label and marks `orPrevious`; its body's
  parts joined by "and" before a new amount are each read as a line (no
  stray "cup" in a name); `parseIngredientList` adds the names to the
  previous requirement's alternatives, so either meets it and Make counts
  one line (Blossoms with green sanding sugar on hand and no granulated is
  makeable). After a heading, an `OR:` line stands alone.
- **Dd7 — Amount-less lines: a suffix, each kind once.** "pinch salt" + "2
  tsp salt" → "2 tsp salt + a pinch"; a dash → "+ a dash"; "to taste",
  "for garnish", a bare name and the other as-needed words → "+ as
  needed"; in that order (`AS_NEEDED_EXTRAS`), on the label, `quantity` and
  what is left of a partly ticked row. A row of only amount-less lines stays
  its name, as before. The other half was the name: "pinch salt" (no "a", no
  "of") read as the name `pinch salt`; `stripAmount` now drops a leading
  pinch or dash before a word, so it names salt — the one name-side change
  (Make reads "Dash Angostura bitters" as `angostura bitters` too).
- **Dd8 — Held ticks.** `TickSync` takes `hold` and a second storage,
  `heldStorage` (the page passes `localStorage`, key `shopping-held-ticks`,
  **no age limit** — a shop can outlast 35d's 10 minutes, and a locked
  phone may lose the tab). Holding, nothing is sent after the quiet spell,
  on hide, on `pagehide` or on leaving; "Done shopping" (`done()`) sends
  every held tick as one PATCH (a second only for ticks made during that
  flight). A failure — refused, 5xx or offline — keeps them, does not retry
  by itself, and the banner says "… Your ticks are kept on this device —
  press Done shopping to try again." Switching off sends what was held the
  usual way; switching on holds what is pending. The page counts **lines**
  (rows with an unsaved tick), not item ids: "2 lines not saved yet",
  "Saved 2 lines." With the switch off, the per-tick sync is unchanged (the
  existing `shoppingTickSync` tests pass as they were). The switch is shared
  (in `settings.json`, the 35 pattern); the ticks are per device.

Review fixes (amendments):

- **Dd9 — Only batches multiply** (amends Dd2). `N batch(es)` / `N
recipe(s)` (and link text that reads so, "2 [batches of pie dough](…)")
  → ×N. A bare count is pieces, not batches — the recipe's yield is not
  known at add time: "8 [corn tortillas](…)" and "2 [pie crusts](…)" (the
  old ×2 case; Sally's crust makes two) → ×1 with "for Corn Tortillas (8
  called for)", like a measure. A range, "1-2 batches [crust](…)" → ×1 with
  "1–2 batches called for" (`1-1/2` is still one and a half). The line is a
  sub-recipe only when nothing but a remark follows the link: empty, or
  parts opening with "," or "(" none of which is an alternative or an
  extra — "[Simple Syrup](…) or honey syrup", "(or 1 refrigerated crust)",
  ", plus flour for rolling", "+ …", "and …" keep the line as written (no
  warning: it is a choice, not a failure). An `OR:` line is never a
  sub-recipe (its body's link is the other way to make the line above).
- **Dd10 — An `OR:` combination offers only what its parts share** (amends
  Dd6). Parts joined by "plus", or "and"/"&" before an amount, are all
  needed; Make judges a line one item at a time, so a part cannot stand for
  the whole — "OR: 1 cup milk plus 1 Tbsp vinegar" must not let vinegar
  meet buttermilk. The combination offers the name its parts end in when
  that is two words or more: the Blossoms coating offers `sanding sugar`
  (green, red or plain sanding sugar meets it; label "granulated sugar or
  sanding sugar"); milk plus vinegar offers nothing, so buttermilk must be
  met itself. A one-part `OR:` line ("OR: 1 cup honey or maple syrup")
  offers each of its names, as before.
- **Dd11 — A sub-recipe line with an `OR:` line under it stays as written**
  (the simpler of the two fixes): the view then folds the `OR:` line onto
  that row, as Make counts the two as one line. Expanding it would put the
  sub-recipe's lines in another lot and leave the `OR:` line alone.
- **Dd12 — The seat folds as the view does.** `orParents` (exported from
  `shoppingView`) drives `patchShopping`'s name ticks — `shopping check
"granulated sugar"` also ticks the `OR:` items folded into that row,
  through a chain of `OR:` lines — and `clearShopping`, which takes an `OR:`
  item along with the line it folds into, ticked or not, so none is left
  as an "OR: …" row of its own.
- **Dd13 — Held ticks are shared by the browser's tabs** (amends Dd8). The
  held key is one per browser, so each change is read-change-write
  (`TickSync.mutate`): a tick keeps another tab's ticks, a Done settles
  only what it sent (a newer tick in another tab during the flight stays,
  and the same Done sends it next). A tab takes up another's ticks on the
  `storage` event (`refresh`), and Done first reads them, so Done in either
  tab sends every tick held in the browser. A tab that is not holding
  touches the key only to take its ticks and send them (on mount, or when
  the switch goes off) — never on a tick. A held storage that does not
  keep a write leaves the ticks in memory.
- Nits: an `OR:` alternative on a row merged from several recipes says
  whose it is ("… — in Peanut Butter Blossoms"); an add refused by the item
  cap says when sub-recipes went on as their own lines. Dd7's "each kind
  once" stands: two "pinch salt" lines beside "2 tsp salt" read "2 tsp
  salt + a pinch", not "+ 2 pinches" — a pinch is not worth counting.

For Roger's close-out: until the Pi is deployed, its old build refuses
`features.subRecipes` / `holdTicks` in a settings patch, drops them on any
settings save it makes, and drops `for` on any tick it rewrites —
transient, gone with the deploy.

Deferred:

- A line that names a recipe without linking it ("easy cookie icing", 35x)
  is not expanded: Make's name match over the whole corpus (25c) could
  feed it, but a guess on a shopping list buys the wrong things — link the
  line in the recipe instead.
- No undo of an expansion on the list (remove the rows, or switch off and
  add again).

Gates: see the PR (heavy slot held for the run).

### 38e — Photo / recipe-card import

### 38f — Content round

## Close-out
