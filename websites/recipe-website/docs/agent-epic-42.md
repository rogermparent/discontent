# Epic 42 — The variants Roger picked: recipe page, /shopping, holidays, /drinks, homepage

> **This is the durable source of truth for epic 42.** Read it before
> touching the recipe page's layout (the cooking order, step↔ingredient
> matching, heads-up notes, the extra-wide three columns), the cook view,
> timer buttons in step text, `/shopping`'s layout, the holiday pages
> (`/holidays`, `/holidays/<slug>`) or their agent tools, `/drinks`, or the
> homepage. The orchestrator updates the roadmap **Status** column and the
> **Now** line at every phase boundary; workers add their phase's
> **Results** and **Traps** under their own headings, and decision
> amendments numbered by phase letter (`Da1`, `Dc1`; 42c1 and 42c2 use
> `Dc1…` and `Dc2-1…`). Earlier epics are cited by number with a prefix
> (`41-Dh2`, `40-D2`). Background: `agent-epic-41.md` (D6 hygiene, 41h's
> Make redesign — `Tape`, `MakeQuestion`, kinds — and its Close-out),
> `ui-overhaul.md` (the UI roadmap; "Usability pass (2026-10-15)").

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** wave 1 — 42a ∥ 42b, with the 42j canvases and 42k's content dry
run alongside (2026-10-18).

## Context

Epic 41 closed 2026-10-18 (#270–#280, main `1086d1c3`); the workstation
was updated and the Pi deployed and verified. Overnight, Claude Design
canvases showed three variants of four pages — A = refine, B = rethink,
C = bold — on a design system built from this codebase:

- Recipe page + cook view: https://claude.ai/artifact/RbiFUFraxCDuafSxfyDLzA
- `/drinks`: https://claude.ai/artifact/UQuSp1kAHRwjX2iUxJSpy7
- Homepage: https://claude.ai/artifact/UE1hJeoVDzzNo3XMtRCdD2
- `/shopping`: https://claude.ai/artifact/2ipce45U8LHKUZmZg3yxpd
- Design system: https://claude.ai/artifact/E3EfALpFiMvnstFCunLocU

Roger's picks (2026-10-18):

- **Recipe page:** B, the cooking order; plus C's timer buttons; plus a
  three-column layout on extra-wide screens with a switch to turn it off.
  Ingredient↔step matching shows only confident matches.
- **`/drinks`:** B, "Pour from your shelf". C, "the menu", becomes a
  holiday-specific page that works for recipes too, with a kind toggle like
  Make's.
- **Homepage:** B, "Now and next". C, "the almanac", becomes a separate
  holiday view tied to the holiday pages.
- **`/shopping`:** B, "Plan at home / Shop in the store".
- **Holidays:** `/holidays` is the almanac, `/holidays/<slug>` the menu.

Epic 41 follow-ups he chose: per-item editing of the saved list on `/make`
comes back (reverses 41-Dh2); outline buttons and toggles go back to the
faint `--border`, only real fields keep the 3:1 border (41f); resume-builder
takes Tailwind 4.3's default font (reverses 41-Dd2). Every other "Roger to
confirm" item from epic 41 stays as is.

Later the same evening Roger asked for more work to fill the night: 42h
(holidays for the agents), 42j (canvases for the next four pages) and 42k
(holidays across the year, content) were added.

Intended outcome: the four pages as Roger picked them plus the holiday
view, built on the site's components and tokens, each reviewed against its
canvas with screenshots regenerated in Docker; the agents able to read the
holidays; the almanac spanning the year; and the next round of canvases
ready for Roger's picks.

## Decisions

### D1 — Unattended: nothing waits on Roger

Where a phase meets a choice, it takes the conservative, reversible option,
records it in its Results as **"Roger to confirm"**, and keeps going. The
close-out lists every such item. Deploys, the content repo's pushes and
`pnpm workstation update` stay Roger's.

### D2 — The canvases are the spec for look and copy, not for data

Workers read their canvas with the Artifact tool (`read` the URL, then
`path`s from a `files` listing), and the design system's
`project/README.md` and `project/tokens.json` first. They build with the
site's own components and tokens — `derive.ts`, `theme.css`, `ui/*`, 41h's
`Tape` and `MakeQuestion`, the font-role variables — so the user-selectable
accent, neutrals and fonts keep working. Numbers, counts and matches come
from real data and logic, never from the canvases' hand-worked figures.

### D3 — Only confident matches

The recipe page's step↔ingredient lists and heads-up notes show nothing
rather than a guess: a step lists a line only on a whole-word match of the
line's name (or its unambiguous head noun, shared with no other line), and
a heads-up shows only for a short list of unambiguous phrases, quoting the
sentence it came from.

### D4 — Holiday dates live in code

Dates come from `common/util/holidays.ts`'s `HOLIDAY_RULES`; terms get no
date field. A holiday term without a rule shows undated, last.

### D5 — /shopping changes are presentation

`buildShoppingView`'s shared outputs stay as they are — `view.checked`
feeds `formatShoppingText`, `counts.remaining`, `viewForStore` and the
CLI/MCP `shopping_get`. The page regroups from `row.aisle` and the items'
sources.

### D6 — Test and build hygiene carried from epic 41

41-D6 unchanged: heavy commands in the capped slot (`heavy.sh`,
`heavy-pw.sh` with `DOCKER=1`, `heavy-bg.sh`); visual baselines regenerated
only in the Playwright Docker image and each moved or new image opened and
compared with its canvas; a new or changed spec once in dev mode; a
dependency or Next change built in the main checkout's symlink shape. Axe
with the WCAG 2.2 tags, no sideways scroll at phone width, targets ≥ 24 px
on every new surface.

### D7 — Content under 40-D2's rules

42k creates holiday terms and attaches existing recipes only on a clear
reason, and imports at most 8 recipes under 40-D2 (a reputable page with
structured data and an image, Sally's first, no near-duplicate, grounded
without `--allow-partial`, skill-v4 facets, one commit each, ≥ 15 s per
host, at most one retry after a 403). Nothing deleted, features untouched.

## Roadmap

| Phase    | Size | Branch                    | Status | PR  | What                                                                                          |
| -------- | ---- | ------------------------- | ------ | --- | --------------------------------------------------------------------------------------------- |
| 42a      | S    | `agent/42a-followups`     | 🟡     | —   | Per-item saved-list editing on `/make`, outline borders, resume-builder font, house-list e2e. |
| 42b      | S    | `agent/42b-tolerance`     | 🟡     | —   | Screenshot tolerance tightened (41-Tp1), proven 3× in dev and build mode.                     |
| 42j      | —    | (canvases)                | 🟡     | —   | Design canvases for `/search`, `/tags` + a term page, the meal-plan page, the edit form.      |
| 42k      | S    | (content repo)            | 🟡     | —   | D7: holiday terms for New Year's, Valentine's, St Patrick's, Easter, July 4th.                |
| 42c1     | L    | `agent/42c1-recipe`       | 📝     | —   | Recipe page in cooking order: sticky ingredients, "uses:", heads-up, three wide columns.      |
| 42g      | L    | `agent/42g-shopping`      | 📝     | —   | `/shopping`: in the store (aisle rail, aisle done) and at home (by plan and recipe).          |
| 42c2     | M–L  | `agent/42c2-cook`         | 📝     | —   | Cook view one step at a time, timer buttons, the drink scaler counting drinks.                |
| 42e      | M–L  | `agent/42e-holidays`      | 📝     | —   | `/holidays` (the almanac) and `/holidays/<slug>` (the menu), both apps.                       |
| 42d      | M    | `agent/42d-drinks`        | 📝     | —   | `/drinks`: pour from your shelf.                                                              |
| 42f      | M    | `agent/42f-home`          | 📝     | —   | Homepage: now and next.                                                                       |
| 42h      | S–M  | `agent/42h-holiday-tools` | 📝     | —   | Holidays for the agents: seat, CLI, API, MCP `holiday_list` / `holiday_get`.                  |
| 42s      | S–M  | `agent/42s-search`        | 🟡     | —   | Search without the IndexedDB wait: the index in memory, a palette loading state.              |
| 42-close | S    | `agent/42-close`          | 📝     | —   | Close-out, CLAUDE.md bullet, backlog, memory, the morning report.                             |

Ordering, in waves: **1** 42a ∥ 42b (42j and 42k's dry run alongside —
neither uses the heavy slot); **2** 42c1 ∥ 42g; **3** 42c2 ∥ 42e; **4** 42d ∥
42f (both link into 42e's pages); **5** 42h; then 42-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its
  own PR off fresh `origin/main`, opened ready after a local review. A
  read-only review agent reviews each M/L PR; a worker past ~300k tokens is
  replaced by a fresh finisher. Merge when every check that ran is green and
  the PR is `CLEAN`; merge commit; delete the branch. The next PR merges
  main before it merges. At most two PRs in CI at once.
- Machine memory: D6. At most two heavy workers at once, one queued heavy
  job each; the machine and the slot are shared with another session.
- Never deploy, never push the content repo, never `pnpm workstation
update`, never commit `editor/content`.

## Phases

### 42a — Epic 41 follow-ups (S)

- **Per-item saved-list editing on `/make`** (reverses 41-Dh2): a × on the
  outlined saved tapes (Saved / Both modes, signed-in editor only), each
  removal one commit through the existing per-item path (`patchInventory`,
  as `SavedInventoryEditor` used before 41h); an "Add to saved list" option
  in the shelf, signed-in only. The export and guests stay read-only; 41b's
  import guard (`test/exportInventoryGuard.test.ts`) stays green. Files:
  `common/components/MakePage/InventoryPanel.tsx`, `SavedInventory.tsx`,
  `Tape.tsx`, `index.tsx`.
- **Outline buttons and toggles use `border-border`** instead of
  `border-input` (`ui/button.tsx` outline variant, `ui/toggle.tsx`; 41f's
  outline note). Inputs, textareas and Select triggers keep 41f's
  `--input`. `test/theming.test.ts` changes only if it pinned buttons;
  moved baselines regenerated.
- **resume-builder** drops 41d1's font pin (41-Dd2) in its `globals.css`
  `@theme inline`.
- **41h's coverage gap:** an e2e for the export / editor-guest house list
  on `/make` (41h left it a render test).

### 42b — Screenshot tolerance tightened (S)

41-Tp1's backlog row: 52 stale baselines still passed at
`maxDiffPixelRatio: 0.02`. Tighten the recipe and portfolio configs (e.g.
`0.002`, or `threshold` + `maxDiffPixels`), measured against
Docker-generated baselines so CI stays stable; run each screenshot spec 3×
in Docker in both dev and build mode; strike the backlog row.

### 42c1 — Recipe page in cooking order (L)

Canvas B's recipe board, with C's three columns on extra-wide screens.

- **Layout.** Desktop: ingredients in a sticky side column, following the
  `.sticky-chrome` rules, never a raw `sticky` (`ui-overhaul.md` :1963).
  Steps carry a "uses:" list of their confidently matched lines (D3).
  Heads-up notes above the steps. Keep the meta bar, drink spec, jump
  links, Timeline and Appears in.
- **Matching:** a new pure `common/util/stepIngredients.ts` on
  `ingredientNames.ts` (`parseIngredientLine`, `toName`, `stripMarkup`),
  with unit tests on real-shaped fixtures, no-match cases included.
- **Heads-up:** only "the day before", "overnight", "1 day in advance",
  "chill … hours", "make ahead"-style patterns; show the matching sentence;
  a test list of positives and negatives.
- **Three columns at ≥ ~1600 px:** ingredients | steps | notes, Timeline
  and Appears in. A per-browser switch in the Appearance menu modelled on
  sticky chrome (`AppLayout/stickyChrome.ts`: key, pre-paint script, an
  `<html>` attribute; `useStickyChrome.tsx`; `nav.tsx`). Default on; below
  the breakpoint nothing changes.
- Files: `common/components/View/index.tsx` (`RecipeView`),
  `View/Ingredients/`, `View/Instructions/`, `View/shared.tsx`, the editor
  and export recipe routes.
- Tests: `recipe.spec`, `yield.spec`, `ingredient-preview.spec`,
  `timeline.spec`, `sticky-chrome.spec`; new specs for matches, heads-up
  and the wide switch. Baselines `recipe-detail-*`, `recipe-6-multiplied`,
  `recipe-mobile`, `yield-multiplied-half`,
  `featured-recipe-detail-signed-in`. The "Multiply" label and the testids
  stay.

#### Results (42c1)

**What changed.**

- `common/util/stepIngredients.ts` (pure): `matchStepIngredients(ingredients,
instructions)` → entry → step → line indices. Both sides go through
  `ingredientNames`' one pipeline (`parseIngredientLine` for a line's names,
  `toName` per clause of the step), and a name matches only as consecutive
  whole words inside one clause (the step is split at punctuation first).
  `stepNumbers` (its own module, so the client list doesn't ship
  `ingredientNames`) numbers steps straight through groups.
- `common/util/headsUp.ts` (pure): `findHeadsUps(instructions, timelines)` →
  up to 3 `{sentence, step?, source}`; `HEADS_UP_PATTERNS` is the whole list.
- `View/HeadsUp.tsx`: "Plan ahead" on `accent`, each note "Step N says
  “…”", the step a link to `#step-N`.
- `View/Instructions/`: every step a panel (number circle, checkbox + text,
  then its "Uses" list), a group as a heading with "steps a–b"; step ids
  `step-N`. `View/Ingredients/`: `IngredientLineText` (one rendering for the
  list and the "Uses" chips), the list labelled "Ingredients", and from `lg`
  the whole column is a sticky rail.
- `View/recipe.css` (both `globals.css` import it): one DOM, grid areas —
  one column below `lg`; from `lg` heads-up across the top, ingredients |
  steps (canvas B), body capped at 72rem; from 100rem, unless switched off,
  ingredients | steps | heads-up, cook schedule, Appears in (canvas C), cap
  102rem.
- `AppLayout/wideRecipe.ts` + `useWideRecipe.tsx`: the "Wide recipe columns"
  On/Off switch in Appearance (desktop popover and the phone sheet), key
  `recipe-wide-columns`, `data-recipe-columns="two"` on `<html>` only when
  off, a pre-paint script, `WideRecipeSync` in `AppProviders`.
- `RecipeView` computes matches and heads-ups on the server (both apps; the
  export renders them statically).

**Decisions.**

- **Dc1 — names, then a unique head.** A line goes by every alternative
  `parseIngredientLine` gives it (an infusion's loose flavour excluded) plus
  the text of any link in it (a sub-recipe's name). It matches on a whole
  name; or, for a name of 2+ words, on its head (the last word, or the word
  before a shape word: `half`, `piece`, `cube`, `chunk`, `strip`, `leaf`,
  `sprig`) when no other line's name contains that word. Heads never used
  alone: `ingredientNames`' generic heads (`juice`, `oil`, `water`…), its
  derived forms (`zest`, `wedge`…), and a short list of words that are verbs
  or the dish itself (`puree`, `paste`, `rub`, `glaze`, `cocktail`,
  `mixture`, `filling`, `frosting`, `wash`…). `pepper` stands for a name
  only when the name says black, white, ground or cracked: "salt and pepper"
  is never the bell pepper.
- **Dc2 — a shared name shows nothing.** A name is shared when another
  line's name _contains_ it as consecutive words, not only when it equals it
  (review of 0283b66f): two butter lines, salt in three places, eggs in the
  cornbread and the stuffing, "unsalted butter" beside "butter, for
  greasing", "bread flour" beside "flour, for dusting", "red bell pepper"
  beside "salt and pepper" — "the butter", "the flour", "the pepper" are
  listed for neither (D3). One exception, as confident as the rest: a step
  inside a group whose name is an ingredient heading's (`Crust` / `For the
crust:` / `Make the crust`, all `sectionKey` `crust`) weighs only that
  heading's lines against each other.
- **Dc3 — the longer name claims its words.** An occurrence inside a longer
  occurrence of another line's name belongs to that line ("brown sugar" is
  never also a bare `sugar` line's), counting ambiguous long names too.
- **Dc4 — `toName`'s synonyms apply to both sides.** "No synonyms" is read
  as no _new_ list: the step goes through the same `toName` the line does,
  so its existing rewrites (scallion → green onion) stay symmetric, and its
  compounds (`baking powder`, `egg yolk`, `ginger beer`) make "powder",
  "egg" and "beer" unable to match inside them.
- **Dc5 — the chip is the line, whole.** The "Uses" chip renders the stored
  line with the list's own `IngredientLineText` (Multiplyable, `markOunces`),
  so scaling and oz/ml/parts are identical by construction — no re-parse.
  The canvas's shortened names ("fresh thyme") would have needed a second
  reading of the line; not done. Consequence: a line's text is on the page
  twice, so unscoped `getByText(<line>)` in specs is ambiguous — two specs
  were scoped to `getByRole("list", { name: "Ingredients" })` (see Traps).
- **Dc6 — the rail is plain `sticky` at `--sticky-chrome-offset`.** Like
  portfolio's index plate and `/make`'s shelf (`InventoryPanel`): pinned
  beside the steps even when the masthead releases (Sticky headers Off, or a
  short viewport under Auto), its top then `1rem` instead of
  `header + 1rem`; it scrolls itself past the viewport's height. The
  Ingredients header inside keeps `.sticky-chrome` (so the policy, the print
  rule and `sticky-chrome.spec` are unchanged) and pins to the rail's top
  from `lg` (`lg:top-0`).
- **Dc7 — heads-up patterns.** "the day/night/evening before", "overnight"
  (not before oats, oatmeal, French toast, breakfast, casserole, chia,
  pudding, egg bake, cinnamon rolls), "N/a day(s) in advance|ahead|before",
  "make ahead / make-ahead / make it ahead", and "chill|refrigerate|marinate
  … N hour(s)" within one sentence and 60 characters, with N ≥ 2 or "at
  least N" — never "up to N hours" or "30 minutes to 1 hour". "Overnight"
  and the hours phrase don't count in a sentence about keeping what is made
  (leftovers, store, keeps). Read from step text
  and cook-schedule notes; not from the description (marketing copy: "Follow
  my make-ahead instructions below" is not a step). Each sentence once, at
  most 3, quoted with its step number.
- **Dc8 — steps number straight through groups** ("Stuffing · steps 3–7",
  canvas B), so a heads-up's "Step 4" and the list agree. Before, each
  group restarted at 1.
- **Dc9 — the third column is heads-up, cook schedule, Appears in.** The
  brief's "notes" read as the heads-up notes; the description stays in the
  hero. Below 100rem, and with the switch off, the two-column layout.
- **Dc10 — the switch's storage.** Default on and never persisted (the
  `useListMode` convention): only "off" is stored; the attribute is set only
  when off. Here the pre-paint script _is_ flash avoidance — the column
  count moves the layout.

**Deliberately not built (canvas B items that are 42c2's or later):** the
"Now" step, "Done — next step", a collapsed finished stage, stage chips, the
"Lit: what step 4 uses" highlight in the rail, and B's compact hero (176px
photo, action column) — the hero is unchanged.

**Matching on real shapes — true and false positives.** From the unit
fixtures (copied shapes of Sally's cornbread stuffing, a two-section pie, a
pumpkin pie with a linked crust, a Moscow mule, the linked-recipes fixture)
and the e2e fixtures' recipes run through the matcher:

- True: stuffing step 4 → onion, celery, thyme ("thyme leaves" headed by
  `thyme`), sage, parsley, black pepper, sausage (unique head of "uncooked
  mild Italian sausage"); step 3 and 5 → chicken broth (head `broth`); step 5
  → pecans (`pecan halves` headed by `pecan`). Pie: the crust's flour, salt,
  butter and the filling's eggs, brown sugar, salt, each by section. "roll
  out the chilled pie crust" → `[Pie Crust](…)`. "the kefir with the baked
  potatoes" → the kefir link and "mashed potatoes, leftover from [Baked
  Potatoes](…)". Mule: vodka, cranberry juice cocktail, lime juice, ginger
  beer. "the egg yolk" → "1 egg + 1 egg yolk" (head `egg yolk`). Carnitas
  (fixture): oil,
  pork shoulder, salt, onion, garlic, lime juice, chili powder, oregano,
  cumin, broth.
- True, but late: stuffing step 5's "sausage mixture" lists the sausage
  again; yogurt potato bread's last step "brush with melted butter" lists
  the dough's 2 tbsp butter (the brushing butter is extra). Kefir lists "1
  quart jar" (a jar listed as an ingredient, named in the step).
- Correctly none (D3): "Heat butter" and "whisk the broth and eggs" in the
  stuffing (two butter and two egg lines; no ingredient headings to scope
  by); "season with salt" outside the pie's sections; "the sugar" with
  granulated and brown sugar; "Top with beer" vs ginger beer; "a lime
  wedge" vs lime juice; "slice in half" vs pecan halves; "peppery" / "boil";
  "floured counter" vs flour; "the cornbread ingredients" names nothing.
- False negatives accepted: canvas B's step 4 butter and salt, step 3 eggs
  (shared names); "cream" for "heavy cream" (a compound); "olive oil" in a
  step when the line is "any cooking oil (… like olive oil …)" (aliases are
  not names here); "the egg" beside "1 egg + 1 egg yolk" and "1 egg, for the
  egg wash" (either); the kefir fixture's "milk" (inside "milk kefir
  grains"); "the sugar" beside "brown sugar" and "sugar".
- False positives: the first commit's matcher compared whole names for
  equality only, so a bare-name line won over the longer names containing
  it — the review found "butter, for greasing" listed for "Cream the
  butter", "flour, for dusting" for "Mix the flour", "sugar, for
  sprinkling", "salt and pepper" for "the bell pepper" and the green bell
  pepper for "season with salt and pepper", and the egg-wash egg for "add
  the egg". Fixed by Dc2's containment rule and the `pepper` qualifier;
  each shape is now a unit test. None left in the e2e fixtures beyond the
  "late" ones above.

**Heads-up, positives and negatives** — the test list in
`test/headsUp.test.ts` (17 positives, 19 negatives): "Prepare 1 day in
advance!", "Set aside to cool overnight.", "Chill 3-4 hours until firm.",
"Refrigerate at least 6 hours", "Marinate … 4 to 6 hours", "Make ahead: …",
"can be made 2 days ahead" count; "the overnight oats", "Let rest 5
minutes.", "Chill for 30 minutes.", "Chill the glass.", "Marinate for 20
minutes.", "Let the dough rise for 2 hours.", "Simmer for 2 hours.", and
(from the review) "Leftovers can be refrigerated for up to 48 hours.",
"Marinate for 30 minutes or up to 2 hours.", "Chill the dough for 30
minutes to 1 hour.", "Refrigerate for 1 hour, or until firm." don't.
No e2e fixture recipe has a heads-up; the new spec writes one through the
API.

**Also fixed:** a recipe with neither a photo nor a video drew an empty
16:10 (phone) / 24rem (desktop) frame above itself; it now draws none
(visible in the featured-recipe baseline and on the new spec's pie).

**Gates** (all through the capped wrappers):

- `pnpm --filter recipe-editor typecheck` ✅ and `pnpm --filter
recipe-website exec tsc --noEmit` ✅ (the export builds the same
  `RecipeView`).
- `pnpm exec vitest run`: 122 files, 2487 tests ✅ (new:
  `stepIngredients` 29, `headsUp` 42, `wideRecipe` 6).
- Playwright, Docker, build mode: `recipe`, `new-recipe`, `yield`,
  `ingredient-preview`, `timeline`, `sticky-chrome`, `bar-tools`,
  `accessibility`, `recipe-cooking-order`, `visual`, `mobile` — 202 passed;
  after the review fixes and the photo-frame fix, `recipe`, `new-recipe`,
  `recipe-cooking-order`, `visual`, `mobile`, `sticky-chrome`,
  `missing-media`, `youtube-video`, `yield` — 128 passed.
- Dev mode once (Docker), the new and changed specs (`recipe-cooking-order`,
  `sticky-chrome`, `recipe`, `new-recipe`): 84 passed, 1 flaky —
  `new-recipe.spec.ts:35` (naan import) timed out at 10 s waiting for
  "Multiply" on the first recipe-page visit of the run (dev's cold compile)
  and passed on retry.
- Baselines, regenerated in Docker only: `recipe-detail-signed-out`,
  `recipe-detail-signed-in`, `featured-recipe-detail-signed-in`,
  `recipe-6-multiplied`, `recipe-mobile`, and new `recipe-wide-columns`
  (1680 × 1000). `yield-multiplied-half` did not move. Compared with the
  canvas: B's two-column body (ingredients panel left, step panels with
  number circles and "Uses" chips, the accent heads-up with its calendar
  icon) and C's three columns match in structure; deliberately different —
  the hero (unchanged, not B's compact one), chips carrying the whole line,
  a checkbox beside the number circle (B ticks with the circle), no "Now"
  step. `recipe-mobile`'s full-page shot draws the sticky tab bar over the
  step (the known full-page trap; unchanged behaviour).
- Axe (WCAG 2.2 tags): the existing recipe-page sweeps (every preset ×
  light/dark) and the new spec's pie with heads-up and "Uses" in light and
  dark at 1680 — green. Phone: no sideways scroll (new `@mobile` check).

#### Traps (42c1)

- **A line's text is on the page twice now.** The "Uses" chips render the
  ingredient line itself, so an unscoped `page.getByText("1 1/2 tsp salt")`
  on a recipe page whose step names that line is a strict-mode violation.
  Scope to `getByRole("list", { name: "Ingredients", exact: true })` (the
  list is labelled for this) or to a step's `getByRole("list", { name:
"Uses" })`. `recipe.spec` and `new-recipe.spec`'s katsudon check were
  scoped; CI's full shards are the check for any other.
- **A pre-hydration assertion that polls proves nothing** unless the page
  cannot hydrate: the sync component sets the same attribute moments later.
  Abort `**/_next/static/**/*.js` first (both pre-paint specs now do).

**Roger to confirm.**

- The rail stays pinned with Sticky headers Off (Dc6) — or should Off
  release it too?
- The third column holds the heads-up, schedule and Appears in, not the
  description (Dc9).
- Shared names show nothing, even where canvas B listed them (Dc2).
- The "Uses" chip shows the whole line, not B's shortened name (Dc5).
- Phone: the "Uses" lists are shown, at 12px, rather than hidden as B's
  phone board does (no board drew a food recipe's steps on a phone).
- Step numbers run through groups (Dc8).
- B's compact hero not adopted; the hero is unchanged.

### 42c2 — Cook view, timers, drink count (M–L)

- **Timer buttons in step text:** `parseTimeText`
  (`editor/controller/llm/timeText.ts`) moves to `common/util/` and is
  re-exported so the editor's LLM code is unchanged. A markdown override
  like `VideoTime` turns "25 minutes" / "1 1/2 hours" into a timer button:
  tap to start, a visible countdown, sound and vibration after a user
  gesture; several timers at once, surviving navigation within the page; on
  the page and in the cook view.
- **Cook view (B)** (`View/FocusView/index.tsx`): one step at a time, Back
  / Done, the step's matched lines (42c1), a "show all steps" toggle; ticks
  persist per recipe in sessionStorage (D1: not localStorage); the wake lock
  and Esc stay.
- **Drink scaler counts drinks:** for a drink (drink spec or `drink` tag)
  the scaler reads "1 drink / 2 drinks / 4 drinks" over the same multiplier
  (`View/Multiplier/`, `ScaledYield`), units from the `UnitProvider`.
- Tests: `bar-tools.spec`, new cook-view and timer specs on a frozen clock,
  `parseTimeText` tests in its new home (`test/llmExtract.test.ts` and
  `tidyReading` keep passing).

### 42e — Holidays: the almanac and the menu pages (M–L)

- **Data:** the `holidays` root's children (Thanksgiving, Christmas with
  alias `christmas-cookies`, Halloween; more after 42k). Dates per D4
  (`nextOccurrence`, `countdownLabel`, `orderByNextOccurrence`,
  `withinComingUpWindow`).
- **`/holidays`, the almanac** (homepage canvas C): a to-scale timeline of
  the next ~12 months of holidays that have recipes, with countdowns
  (reusing `TimelineStrip/`); a card per holiday linking to its page; dates
  from the server's day first, then the browser's (the homepage ComingUp
  pattern; U1's masked `<time>` trap).
- **`/holidays/[slug]`, the menu** (`/drinks` canvas C, generalised): a
  printed-menu look, dot-leader columns grouped by course (the course
  facet) for dishes and by style for drinks; a kind toggle (recipes /
  dishes / drinks) reusing `MakePage/kinds.ts` and the `MakeQuestion`
  kind-menu pattern; the countdown, the term's description and image, a
  link to `/make?q=tag:<slug>`.
- Data reads reuse `resolveTermPage` (`readTermPage.ts`) or a slimmer read.
  Routes in both apps, `generateStaticParams` on the export. Linked from
  the term pages, the nav if there is room, and the footer.
- Tests: a new `holidays.spec` on a frozen clock (the `drinks-bar` fixture
  has Halloween and Christmas); unit tests for the view model; axe;
  baselines for both pages, e2e and mobile.

### 42g — /shopping: plan at home, shop in the store (L)

Canvas B, presentation only (D5).

- **In the store (phone):** one store at a time with an aisle rail (with
  the `stores` switch off, its default, one list with the rail); ticked
  rows stay in place, struck through, until their aisle is marked done
  (new per-browser state); on-hand rows collapse to one quiet line per
  aisle; a bottom bar with Add and Done shopping — with `holdTicks` off,
  Done clears checked, with Undo (recorded).
- **At home (desktop, or a Plan tab on the phone):** the list grouped by
  plan and recipe; "Remove these" per recipe or plan through the seat's
  `removeSource` `{recipe}` / `{plan}` (the page only sends `{for}` today);
  "Buy anyway"; the settings switches beside the list, each writing on
  change through the existing settings write (D1), the sheet kept for the
  phone.
- Native controls may move to Radix if keyboard and form semantics hold
  (40-Dc5). The `shopping-*` testids and `data-ready` stay.
- Tests: `shopping.spec`, `accessibility.spec`'s `/shopping`; vitest
  `shoppingView`, `shoppingTickSync`, `shoppingTickQueue`; the first
  `/shopping` baselines, e2e and mobile.

### 42d — /drinks: pour from your shelf (M)

Canvas B. The opening question "What drinks can I make?" with 41h's
`MakeQuestion`, kind fixed to drinks; the shelf (the saved list as tape for
a signed-in editor, the house list on the export when shared, otherwise the
browser's list); Pour now and Buy next from `useMakeable`; the current and
next holiday side by side (`withinComingUpWindow` sliced to 2), each
linking to `/holidays/<slug>`; a dot-leader index of spirit & base, style
and classics. Tests: `drinks.spec` (seasonal, frozen clock), `make.spec`
links, baselines `drinks-page-{e2e,mobile}`.

### 42f — Homepage: now and next (M)

Canvas B. A real search field beside the Make tile (submits to
`/search?q=…`, with the palette shortcut hint); intents as `tag:` chips;
"This season" — dated rows for the coming holidays linking to
`/holidays/<slug>`, and a link to the almanac; a right rail with the newest
plan and, for a signed-in editor, a shopping-list link; about half today's
height, the duplicate holiday showings gone. Tests: `homepage.spec`,
`homepage-browse.spec`, `empty-state.spec`, baselines `homepage-*`.

### 42h — Holidays for the agents (S–M)

As 41i did for Make: a read-only seat — `holidayList` (each holiday term
with its next date, days until, countdown label, recipe counts per kind)
and `holidayGet <slug>` (the menu's grouping as data: courses for dishes,
styles for drinks) — the CLI `recipes holidays [slug] --json`, an API route
if the other seats have one, and MCP `holiday_list` / `holiday_get`,
pre-approved as read-only in `.claude/settings.json` and the skill's
frontmatter (CLAUDE.md's 57/43 become 59/45). The curator skill learns
"what's coming up?". Tests follow the `mcp`, `cliJson` and `curatorSkill`
suites.

### 42j — Next-round design canvases (no code)

Four Claude Design canvases under epic 41's canvas brief, three variants
each (A refine, B rethink, C bold): `/search`; `/tags` with a term page;
the meal-plan (group) page; the recipe edit form. Nothing is implemented;
Roger picks in the morning.

### 42k — Holidays across the year (content)

`HOLIDAY_RULES` already dates New Year's, Valentine's, St Patrick's, Easter
and July 4th, but only three holiday terms exist, so the almanac would
cover October to December. D7: a term under `holidays` for each of those
with recipes (slugs from the rule keys), existing recipes attached on a
clear reason, at most 8 imports for holidays left thin. Dry run in scratch,
reviewed, applied through the CLI; `POST /api/revalidate` after.

### 42s — Search without the IndexedDB wait (S–M)

Added overnight after a design agent's first free-text search in a fresh
browser stayed on "Searching…" for 10–31 s, while ⌘K said "No results
found." The diagnosis (2026-10-18) traced it to FlexSearch's `IdxDB` adapter:
its commit does one `get` and one `put` per prefix key on the main thread,
18,257 gets and 18,881 puts for the 807-recipe corpus. That took 5–14 s on
the workstation, longer under load. It ran in every fresh browser and in
every browser after any content write, because the version marker moves on
each write, and search was gated on it. The server answers in under 0.8 s.
An in-memory build of the same index takes under 1.3 s, and a query about
1 ms. Scope: (A) build the index in memory and fetch `/search/ingredients`
lazily, (B) a palette loading state, (C) "Loading recipes…" in place of
"All 0 recipes".

#### Results

**What changed.**

- `common/components/SearchForm/searchIndex.ts` (new) is the engine, kept
  pure so it can be tested. `buildSearchIndex` builds the same FlexSearch
  `Document` as before (`tokenize: "forward"`; fields in the priority order
  name > tags > ingredients > description) in memory. It yields to the page
  whenever a slice passes a 10 ms budget, through `scheduler.yield()` or a
  `MessageChannel`, never `setTimeout`, which background tabs clamp.
  `searchSlugs` searches with `limit` set to the corpus size. `searchRecipes`
  looks the slugs up in the corpus the provider holds. `store` is off, so
  every hit carries the current `groups` and there is no stored copy that
  can go stale. `deleteLegacySearchIndex` removes the old databases and
  markers.
- `SearchContext.tsx` drops the `IdxDB` mount, the probe, the
  `/search/version` fetch and the populated-version marker. The
  ingredients, and the build after them, start on the first free text, on
  the ⌘K palette opening (`prefetchIndex`, a new context member), or on a
  filter that reads ingredients. A page that searches nothing never fetches
  `/search/ingredients`. The build waits for the ingredients to settle, so
  an ingredient-only word never gets a premature "No matches"; the previous
  build keeps answering during a rebuild (`keepPreviousData`, `gcTime: 0`).
  The search itself is a synchronous `useMemo`. The browse view's
  `displayedRecipes` stays `undefined` until `/search/all` lands, so the
  ticker says "Loading recipes…" instead of "All 0 recipes" (C).
  `indexReady` is gone from the context; nothing read it.
- ⌘K (B) has an always-mounted `role="status"` line above the listbox. It
  says "Searching recipes…" while text is typed, nothing has failed, no
  recipe hit is showing, and the index is unbuilt or the engine has not
  answered. Meanwhile the list is `aria-busy` and "No results found." is
  withheld. Opening the palette, from the shortcut or the trigger, calls
  `prefetchIndex`.
- The old persisted index is deleted once per browser, best effort. Where
  `indexedDB.databases()` exists, only names that are present are deleted;
  elsewhere only when an old marker is found. A fresh browser's IndexedDB
  is never touched. Route comments (`search/all`, `ingredients`, `groups`,
  `terms`, `version` in both apps) are updated. **The routes are
  unchanged.**

**Decisions.**

- **Ds1 — no persistence.** This reverses the IndexedDB persistence chosen
  in the original search overhaul (`ui-overhaul.md`, "Two latent IndexedDB
  bugs fixed": the `recipe-search-v2` rename, `clear()` before repopulate,
  `commit: false`). It also reverses what F4a and F27 built on it
  (`packages/cms/docs/incremental-regeneration.md` §12.8 and §12.12: "the
  version gate holds and the index is already in IndexedDB", so a repeat
  visit skips `/search/ingredients`). Those premises no longer hold, for
  three reasons. The editor re-downloads `/search/all` on every load
  anyway. Persistence saved only `/search/ingredients` (≈320 KB, ~30 ms
  from localhost) and a build of under a second. And it cost 5–30 s of
  serialized IndexedDB round trips in every fresh browser and after every
  content write, which on the workstation is often. The persisted index
  also brought two bug classes this removes: a marker outliving its
  database (`search-index-recovery.spec`), and a schema bump needing a DB
  rename (27d's `-v3`).
- **Ds2 — `limit` = corpus size (the 108 vs 103 discrepancy).** See below.
  Every query now returns every match.
- **Ds3 — lazy ingredients.** The triggers are free text, the palette
  opening, and an ingredient-reading filter. The palette prefetches on open
  rather than on hover, because open is the one signal that a search is
  coming. `/search` with no query no longer fetches them (F4a's saving, now
  on every cold load too).
- **Ds4 — the client stops reading `/search/version`.** Both apps keep the
  route (`measure-corpus-caching.ts` reads it, and it is the cheap "has the
  corpus moved" probe).
- **Ds5 — yielding by time budget (10 ms), not by recipe count**, per
  review: 100 recipes are ~100–150 ms on a desktop and several times that
  on a phone, while the user is typing after ⌘K.

**108 vs 103, explained.** Neither index was stale. FlexSearch's default
`limit` is 100 per field. For "lime" the ingredients field has 107 hits,
spread across nine resolution slots ([—, 2, 9, 9, 19, 16, 17, 19, 16]).

- The in-memory index honours the limit and cuts at 100, which gives 103
  merged hits.
- The `IdxDB` adapter's `get` (`src/db/indexeddb/index.js` l.218–250) takes
  `min(slot, limit)` from each slot and stops only when the count lands
  exactly on the limit. So for one-word queries it overshot to every hit:
  all 107, giving 108. "salt" got all 504 of its ingredient hits the same
  way, where the in-memory default answers 120.
- Multi-word queries go through `intersect`, which applied the limit in
  both engines.

The intended behaviour is every match: the ticker reports totals, and
`/search` reveals them 60 at a time. So the in-memory build was the one
missing hits, and passing `limit: corpusSize` fixes it. The vitest pins this
with 150 + 150 synthetic hits.

Measured against the old build in a browser on the real corpus (the
workstation's, `/search/all` 333 KB):

- One-word queries answer the same count and the same first 60 results: lime
  112 = 112, salt 525 = 525, sugar 308 = 308, chicken 100 = 100, creme 9 = 9.
- Multi-word queries now return their whole tail: "lime juice" went from 133
  to 272, with the first 60 identical.

Against a _capped_ search, ranks past ~100 regroup by field: every field's
hits now precede the next field's, so the name > tags > ingredients >
description tiering holds all the way down. The old build already behaved
this way for one-word queries. `store: true` with `enrich` and `store:
false` with slug lookup give identical results (six queries compared).

**Tests.** `test/searchIndex.test.ts` (new) pins the set and order for nine
fixture queries copied from `search-corpus`: accent folding, tag order,
ingredient-only, field priority, position ranking within a field, suggest,
and prefix. It also covers every match beyond 100 per field, the
time-budget yields, the real `yieldToMain`, the groups lookup, blank text,
and the legacy cleanup (present, absent, no `databases()`, blocked
storage). In Playwright: `search-cold-load.spec.ts` is new (a fresh
context's `/search?q=ginger` answers within 5 s of the corpus responses
with no IndexedDB database created; the browse view reads "Loading
recipes…" while `/search/all` is held; an old `flexsearch:recipe-search-v3`
plus marker is deleted on the next load). `search-corpus-split.spec.ts` is
rewritten: browsing skips the ingredients and free text fetches them; a
filter-only query fetches them; a query typed while they are held stays
"Searching…" and does not settle to "No matches"; the palette opening
fetches them; the bare negation. `command-palette.spec.ts` gains "a cold
palette says it is searching, never that nothing matched" (ingredients
held, status and axe, then rows, then a no-hit word shows "No results
found."). `drinks.spec.ts`' invitation test now opens the palette to
produce the failing ingredients request, which nothing on `/drinks` makes
unprompted any more. `search-index-recovery.spec.ts` is **retired**: its
subject, a localStorage marker vouching for an IndexedDB database it
outlived, no longer exists.

**Gates** (all through the capped wrappers):

- `pnpm --filter recipe-editor typecheck`: 0 errors.
- `pnpm --filter recipe-website exec tsc --noEmit`: 0 errors.
- `pnpm exec vitest run`: **123 files, 2,497 tests passed**, including
  `searchIndex.test.ts`'s 10.
- Playwright, Docker build mode, on `search-cold-load`,
  `search-corpus-split`, `command-palette`, `drinks`, `search-autocomplete`,
  `search-live` and `search-query-language`: **107 passed, 1 flaky**. The
  flaky one was `search-query-language` "a half-typed query…", which failed
  in its `beforeEach` on two tickers (42s-T1) and passed on retry.
- The four specs whose ticker is now scoped to `<main>`, rerun in build
  mode: **42/42 passed**.
- All seven specs once in Docker dev mode: **108/108 passed**.
- No baselines moved: every visual's end state is unchanged, and the new
  status line is `sr-only` and empty when idle.

**Timings**, before and after, back to back:

- **Before:** the workstation on `:3000`, the pre-42s production build.
- **After:** this branch's production build on `:3077`, against a scratch
  clone of the content repo (the same corpus: `/search/all` 333,084 B on
  both).
- Diagnosis script `repro.mjs`, one fresh context per run, headless Chromium
  at 1366 px.
- Load average 4.0–4.7 on 8 cores throughout. The diagnosis ran at 15–24,
  which is why its "before" was 5–7 s.

| run       | `/search?q=lime` → "112 results" (from navigation) | ⌘K "lime" → recipe rows (from Ctrl+K)               | warm reload          | IndexedDB after               | long tasks |
| --------- | -------------------------------------------------- | --------------------------------------------------- | -------------------- | ----------------------------- | ---------- |
| before    | 4.32 / 4.22 / 4.23 s                               | 2.27 / 2.14 / 2.26 s, "No results found." till then | 0.51 / 0.43 / 0.53 s | `flexsearch:recipe-search-v3` | 439–585 ms |
| **after** | **1.26 / 0.81 / 0.82 s**                           | **0.29 / 0.32 / 0.38 s**, never empty               | 0.76 / 0.58 / 0.68 s | none                          | 127–227 ms |

- **The cold first search is 3.4–5.2× faster.** What remains is the
  network plus a sub-second build.
- **⌘K is ready about 7× sooner**, and never claims "No results found."
  while it waits.
- **A warm reload costs ~0.1–0.2 s more** than restoring from IndexedDB,
  because each page load rebuilds the index. That cost now also replaces
  the 5–30 s full repopulate that every content write used to trigger.

**Traps.**

- **42s-T1 — a hidden second copy of `/search`.** Strict mode failed on
  two `search-ticker`s: the visible one read "All 67 recipes", and a hidden
  one stayed on "Loading recipes…". It is the same shape as 41-Th6 (there
  on `/make`, in dev) and was seen once, in build mode, in
  `search-query-language`'s `beforeEach`. The aria snapshot shows one
  ticker, so the copy is not exposed. It most likely predates 42s: a hidden
  copy before it would have read "All 0 recipes" and failed the same way. The fix:
  the search specs read the ticker inside `getByRole("main")`. Do the same
  in any new spec that reads a ticker.
- **42s-T2 — a production editor build against the real corpus can time
  out on `/tags/[tag]`.** At load ~30, the default 7 static-generation
  workers had three pages each take more than 60 s (`/tags/easy`,
  `/tags/holidays`), and the build failed. A scratch-only
  `experimental.cpus: 2` plus `staticPageGenerationTimeout: 600` built all
  292 pages in 71 s. The change was reverted and is not committed. It
  matters only for timing builds outside the workstation's own update.

**Roger to confirm.**

- Multi-word queries now return every match ("lime juice" 133 → 272). Ranks
  past ~100 group by field; the first 60 are unchanged in every query
  measured. One-word queries are unchanged against the old build. The
  alternative is a cap again (`limit: 100`), which gives the in-memory
  103-style truncation.
- Both apps keep `/search/version`, but the client no longer reads it
  (Ds4). Remove it in a later hygiene pass, or keep it?
- The palette prefetches on open only, not on hovering or focusing the
  trigger. A cold ⌘K waits ~0.3 s for the ingredients fetch and the build.
- A browser on the old build keeps its ~5.5 MB database until it next loads
  a 42s page, which deletes it.
- The warm reload is ~0.1–0.2 s slower (above). A Web Worker or an idle
  prebuild could hide it if it is ever noticed; neither was built.

### 42-close (S)

Close-out here, a CLAUDE.md "Durable docs" bullet, backlog rows, memory.
The morning-report artifact in epic 41's style: what to look at first (each
page with before/after screenshots from the Docker runs), what merged, the
canvases, "Roger to confirm", Roger's steps (`pnpm workstation update`,
`pnpm deploy:pi`; reindex only if a phase changed an index version — none
expected). The session's `content-engine-playwright:*` Docker tags removed.

## Verification

- **Every PR:** typecheck ×2 and vitest (with counts) through the capped
  wrappers; the touched specs in Docker build mode, new specs once in dev
  mode; CI green and `CLEAN` on every check, the main-checkout-shape build
  job included.
- **Per surface:** moved and new screenshots (Docker only) opened and
  compared with the canvas; axe with the WCAG 2.2 tags green; no sideways
  scroll at phone width; targets ≥ 24 px.
- **42b:** each screenshot spec passes 3× in dev and in build mode at the
  new tolerance. **42c1:** matching and heads-up unit tests, true and false
  positives listed in Results. **42c2:** timer specs on a frozen clock,
  `parseTimeText` tests in its new home. **42e:** a frozen-clock almanac;
  the export builds `/holidays/*` statically. **42g:** `shopping_get`, the
  copied text and the counts unchanged (the existing vitest is the
  contract); the first `/shopping` baselines.
- **After merge:** Roger checks each page on the workstation after `pnpm
workstation update`, from the morning report's list.

## Traps

## Results
