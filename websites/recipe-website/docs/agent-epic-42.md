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

#### Results (42a)

Branch `agent/42a-followups`. **Reindex needed: no. Deploy: yes** (the
`/make` shelf and outline borders change; no content or index change).

Roger chose all four on 2026-10-18 after reading epic 41's results; each
reverses or completes an epic-41 decision (`agent-epic-41.md`).

**1. Per-item saved-list editing back on `/make` (reverses 41-Dh2, "the
per-item saved-list editor is gone").**
Signed in, in Count from's Saved and Both modes, every outlined saved tape
(`data-kind="saved"`) has a × named "Remove <item> from the saved list".
It sends `{add: [], remove: [item]}` through the existing
`saveInventoryChanges` → `patchInventory` path — one commit,
"Update inventory: −gin" — and the label goes when the server's list comes
back. The toast says "Removed gin from the saved list." and its Undo (or
Ctrl+Z) sends `{add: [gin]}`, a second commit. Focus moves to the label
that took its place, or to the add field when the list is empty. Writes
run one after another (a promise chain in `MakePage`), and each sets the
saved list to the one the server answered with. A failure shows as an
alert under the group and leaves the list as it was. "Save to editor"
(41-Dh2's whole-list move) stays, and its diff reads the updated list. This
browser's own tapes keep their ×, which still edits only this browser's
list.

- **Da1 — "Add to saved list" is a small form in the saved group.** It
  sits under the saved labels (Saved and Both modes, signed in only): a
  field labelled "Add to saved list" (read as a list, like the add field)
  and an outline "Add". `savedAdditions` leaves out what the saved list
  already has, so "Campari, gin" adds Campari alone, in one commit
  ("Update inventory: +Campari"). Undo removes only what that add brought.
  Something already on the list gets a plain toast and no commit. I kept it
  out of the add combobox: that field is "Buy next as search" for this
  browser's list (41-Dh3), and a second target in it would make Enter
  ambiguous.
- **Da2 — non-optimistic.** A label leaves when the commit lands, not when
  it is clicked, so a refused write (mid-merge, `busy`) never shows a list
  the repo doesn't have. The cost is a commit's latency (≈ 0.1–0.5 s
  locally) before the label goes.
- The export and the editor guest stay read-only. `InventoryPanel` edits
  only a list of kind `saved`, and only when the page passes `savedEdit`,
  which `MakePage` does only with `saved` (the signed-in editor's route).
  A house list never gets × or the form, even if handed the edits (render
  test). `exportInventoryGuard` stays green: the export still reaches no
  editor code.

**2. Outline buttons and toggles back on `--border` (41f's Df1 and its
"Roger to confirm": the alternative of moving them to `border-border` to
keep their hairline).** `ui/button.tsx` outline and `ui/toggle.tsx` outline now use
`border-border`. Inputs, textareas, Select triggers and the shared `Form`
field class keep 41f's `--input` (≥ 3.1:1), and the checkbox keeps 40g's
`border-muted-foreground`. Their text
names them, so WCAG 1.4.11 doesn't ask for a 3:1 boundary. `theming.test.ts`
never pinned buttons, so only its comment (and `derive.ts`'s) changed.
Make's own `border-input` boxes (the Count from frame, the phone's shelf
toggle, the save confirm) are hand-written classes, not the kit's outline
variant, and stay as 41h drew them.

**3. resume-builder takes Tailwind 4.3's default sans (reverses 41d1's
Dd2, "resume-builder keeps Tailwind 4.1's default sans stack").**
The four-line `--font-sans` pin is gone from its `@theme inline`.
resume-builder has no screenshot baselines, so nothing moves there.

**4. The house list e2e (41h's "Coverage — the export / guest house list
is a render test, not an e2e").** A new `make.spec`
describe: with "Share my saved inventory on the export" off, nothing is
baked and a guest has no Count from. On (`writeSettings`), the snapshot is
exactly the saved list (gin, tonic water). The guest gets Count from (This
browser 0 / House list 2 / Both), House list counts Gin and Tonic, the
heading reads "House list shared with this site · 2", and the tapes are
outlined (`data-kind="saved"`), featurable (`ingredient:gin` joins the
query) and carry no ×, no "Add to saved list" and no "Save to editor".
Both gives the union with this browser's vodka. The export itself isn't
covered: `export-page.spec` never builds the static site. The guest page
renders the same `MakePage` with the same `secondary` prop, and
`exportHouseInventory.test.ts` pins the bake (Ta1).

**Roger to confirm.**

- Da1: "Add to saved list" lives in the saved group, which shows only in
  Saved or Both. The alternative is a second target in the shelf's add
  combobox.
- Da2: a removed saved label waits for its commit before it goes.
- Ta1: the editor guest's pages ignore the share setting. If an editor
  guest should see the house list whenever sharing is on, the guest branch
  of `make/page.tsx` and `drinks/page.tsx` would read the saved list when
  `shareInventoryOnExport` is true. That is a product change, so I didn't
  make it.

**Moved baselines** (Docker, build mode, `--update-snapshots=all` over
every recipe spec with screenshots, then a pixel diff of each rewritten PNG
against HEAD; the six with 0 changed pixels — `homepage-empty`,
`homepage-mobile`, `homepage-three-recipes`, `homepage-two-pages`,
`layout-footer-signed-{in,out}` — were byte-only re-encodes and were
restored). Twelve moved, each opened and checked against its diff. In every
one the changed pixels are outline-button or toggle borders, and nothing
else moved except the one noted:

- `make-page`, `make-page-specs`, `make-mobile`: Clear, Import / export and
  Buy next's "I have this" (0.06–0.07 % of pixels).
- `recipe-detail-signed-{in,out}`, `featured-recipe-detail-signed-in`,
  `recipe-6-multiplied`, `recipe-mobile`: the "Cook view" button (258 px).
- `git-page`: Checkout, Fetch, Pull, Push.
- `markdown-source-mode`: the instruction row's outline icon button.
- `edit-form-populated`, `edit-form-overwrite`: the same icon button, and
  also anti-aliasing along the edge of the "Recipe 6" preview image's
  lettering. That image isn't a control. Its edge noise was already stale
  in the old baseline and comes along because the page has to be
  regenerated anyway.

Portfolio: `visual.spec` (11 baselines) regenerated the same way in Docker,
and no PNG changed. resume-builder has no baselines.

**After merging 42c1 (#282).** Five baselines conflicted, the ones both
phases touched: `recipe-detail-signed-{in,out}`,
`featured-recipe-detail-signed-in`, `recipe-6-multiplied`, `recipe-mobile`.
I took main's side, then regenerated every screenshot spec again in Docker
build mode (`recipe-cooking-order` included) and pixel-diffed. Six moved,
each by the "Cook view" outline border alone (258 px), and I opened each:
those five on 42c1's new layout, plus 42c1's new `recipe-wide-columns`.
Noise-only rewrites were restored: `git-page` (5 px), both `edit-form-*`
(only the preview image's lettering), and the zero-pixel re-encodes.

**Gates** (every heavy step through the capped slot):

- `pnpm --filter recipe-editor typecheck` ✓,
  `pnpm --filter recipe-website exec tsc --noEmit` ✓, resume-builder
  `tsc --noEmit` ✓ (with its gitignored `next-env.d.ts` copied in).
- `pnpm exec vitest run`: **119 files, 2416 tests passed**, including
  `makeInventoryPanel` (+6: per-item edits, failure keeps the draft, never
  on a house list or without edits, `savedAdditions` ×2),
  `exportInventoryGuard` and `exportHouseInventory` unchanged and green.
- Playwright, Docker, build mode: `make.spec`, `accessibility.spec`,
  `export-page.spec` and every screenshot spec (`visual`, `mobile`,
  `recipe`, `yield`, `drinks`, `empty-state`, `footer`, `header`,
  `ingredient-preview`, `menus`, `command-palette`, `paste-replace`):
  **244 passed**, no retries.
- Playwright, Docker, dev mode (once, for the new checks): `make.spec` and
  `accessibility.spec` `--grep=make`: **42 passed**.
- resume-builder Playwright: **not run locally.** `.dockerignore` keeps
  resume-builder out of the Playwright image, and the host has no Chromium
  for Playwright 1.64 (`chromium_headless_shell-1248` missing; every test
  failed at launch). Its own CI job (path-filtered on
  `websites/resume-builder/**`) runs it on this PR. The change there is the
  `--font-sans` stack alone, and nothing in its specs asserts on fonts.
- lint-staged (prettier + eslint) ✓ on commit.
- After the 42c1 merge: both typechecks ✓. The regeneration run in Docker
  build mode had **255 passed, 1 flaky**: `visual` "search page with no
  query" saw two copies of the search field (a stale second page, the
  Tf5 shape) and passed on retry #2; this phase doesn't touch it. The
  check run without `--update-snapshots`, in Docker build mode, over
  `visual`, `mobile`, `recipe-cooking-order`, `recipe`, `make` and
  `accessibility`: **157 passed**, no retries.

**Backlog:** no row matches 42a, so nothing is struck.

#### Traps (42a)

- **Ta1 — the editor guest's house list is the process's, not the
  setting's.** An editor guest's `/make` and `/drinks` read
  `SITE_HOUSE_INVENTORY` from the editor process's own environment
  (`secondaryInventory()` with no reader), which only an export Build's
  child process is ever given. Ticking "Share my saved inventory on the
  export" changes the next export, not the editor's guest pages. An e2e of
  the house list therefore needs the variable in the server process:
  `/settings/test-house-inventory?bake=1` (TEST_MODE only) sets it from
  `exportBuildEnv`, and `afterEach` takes it away.

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

### 42g

- **Tg1 — `useShoppingList.ts` failed eslint on `main`.** The
  eslint-plugin-react-hooks 7 rule `react-hooks/refs` flags the `TickSync`
  made in a `useState` initializer: its `onItems` bumps a ref. Nobody had
  touched the file since the plugin update. lint-staged lints whole files,
  so the next phase to change it hit an error it didn't cause. 42g moved the
  counter to a tiny `WriteCounter` object held in state. A plain
  `{ current }` object fails a different rule, `react-hooks/immutability`.
- **Tg2 — A sticky bar's jump offset is its `top` plus its height.** The
  shop bar is `.sticky-chrome`. When the reader's setting or a short
  viewport releases it, the position is `static` and there is no offset.
  `pinnedBottom()` in `ShopView.tsx` reads both from computed style. Don't
  hard-code the masthead's height.
- **Tg3 — A scroll spy never reaches the last aisle on a short page.** The
  last section can't scroll up to the bar, so "the last section whose top
  passed the bar" stays on the one before it. When the page is scrolled to
  the end, the last aisle is current. The spy picks by position, not rail
  order, because done aisles fold away above the open ones.
- **Tg4 — An sr-only suffix across flex items gains a space.** Chrome reads
  `Buy anyway<span class="sr-only">: salt</span>` inside an `inline-flex`
  button as "Buy anyway : salt". An `aria-label` fixes the spacing, but
  only if its visible text is the start of the name. If the visible text
  sits elsewhere, as the rail's "Pantry" plus "4" did, axe's
  `label-content-name-mismatch` fails. The rail chips stay named by their
  content, with sr-only words, and their specs match the name with
  `/^Pantry ?4 left$/`.
- **Tg5 — Pinned bars break full-page screenshots and axe.** A full-page
  capture paints a sticky bar part-way down the page.
  - Shop's baselines are viewport captures taken from the top
    (`inView()` in `shopping-modes.spec.ts`).
  - Axe's `target-size` rule calls a control scrolled under a pinned bar
    "partially obscured", which depends on where the page stopped. The
    in-store a11y sweep runs in a viewport tall enough not to scroll.
- **Tg6 — `common/` may not contain the text "on-hand", not even in a
  comment.** `test/inventory.test.ts` greps every `common/` and `export/`
  source for it, as its boundary check that the export never reads the
  shared inventory. Write "probably on hand".
- **Tg7 — An optimistic control for Playwright's `check()`.** A controlled
  checkbox that waits for the server's answer fails `uncheck()` with
  "Clicking the checkbox did not change its state". Show the new state
  while the write is out.

### 42e

- **Te1 — `react-hooks/refs` refuses a ref inside an object.** The first
  cut of the shared kind menu was a hook returning `{open, wrapRef,
buttonRef, …}` and two components taking it as a prop; the React
  compiler's lint flags every property read on that object during render
  ("Cannot access refs during render"), even `menu.open`. Element state
  through callback refs trips `set-state-in-effect` instead. What passes:
  one component owning its refs, with the heading as a render prop
  (`KindMenu`'s `children(word)`).
- **Te2 — a holiday's alias can carry another holiday's rule.** 42k's
  `new-years` term lists `new-years-eve` as an alias, and `new-years-eve`
  has its own rule (31 December). The rule lookup is slug first, then
  aliases in order (`holidayRuleKey`), so New Year's is 1 January; a lookup
  that tried aliases first, or merged them, would date it a day early.
- **Te3 — the kind change is `history.replaceState`, not
  `router.replace`.** On the editor `router.replace("?kind=…")` re-requests
  the page's RSC payload for a change only the browser cares about; Next
  keeps `useSearchParams` in step with the History API, so the page
  narrows without a round trip, on the export too.

## Results

### 42g — /shopping: plan at home, shop in the store

Canvas B, presentation only (D5). `buildShoppingView`, `formatShoppingText`,
`viewForStore`, the tick queue and sync, and their three vitest suites are
unchanged. The CLI/MCP `shopping_get` reads `readShoppingView`, which is
also unchanged. The page regroups the view through new pure helpers in
`common/util/shoppingPage.ts`:

- `shopAisles`: rows in their aisles, with ticked rows put back in place.
- `listOrigins` and `removalPatch`: what is on the list by plan and recipe,
  and the one write that removes an origin's lines.
- `readDoneAisles`, `aisleIsDone` and `markAisle`: the per-browser "aisle
  done" state.
- `rowsHolding`: the row counter the page already used.

`test/shoppingPage.test.ts` covers them, including a check that the shared
view and its copy text come out byte-identical.

**What changed.** `ShoppingPage/index.tsx` now only chooses between two
layouts: `ShopView.tsx` and `PlanView.tsx`. The pieces both use moved,
unchanged in behaviour, to `parts.tsx`: Copy, the add box, the store
buttons, Clear checked, Done shopping, expired ticks, sub-recipes and the
confirm-in-place remove. The per-browser state lives in `shopState.ts`.

- **Shop, in the store (a phone's default):**
  - A sticky store bar holds the Plan/Shop switch, the store `<select>`
    when Stores is on, a "4 of 10 ticked · 6 left" progress bar and the
    aisle rail. Each rail chip jumps to its aisle, the aisle in view is
    `aria-current="location"`, and a done aisle shows a tick.
  - Rows are bigger: a 17 px label and a 24 px box. A ticked row stays in
    place, struck through.
  - Each aisle ends with "Aisle done". A done aisle folds into one line at
    the top, which can be opened, with Undo.
  - On-hand rows collapse to one quiet line in their aisle ("Probably at
    home already: olive oil"). It opens to each row, each with Buy anyway.
  - The bottom bar sits above the phone tab bar, in thumb reach, under the
    same sticky-chrome policy. It holds Add (opens the add box), the tick
    or held-tick status, Undo and Done shopping.
- **Plan, at home (a wide screen's default, or the phone's Plan tab):**
  - The header holds the title, the counts (unchanged text), the mode
    switch, Copy, Print and Settings.
  - The left panels are:
    - the add box;
    - **What's on it**: each plan, with its recipes linked beneath it,
      each recipe added on its own, and the typed lines, each with Remove
      these;
    - Sub-recipes, now a panel instead of a fold;
    - **Switches**: every feature as a `role="switch"` checkbox that
      writes on change, plus "Stores and aisles", which opens the
      settings sheet. Desktop only.
  - The main column holds the store buttons, the list by store and aisle
    (two columns from `xl`), "Probably on hand" with Buy anyway per row,
    and the Checked fold with Clear checked.
  - On a phone, Plan shows the panels and ends in **Start shopping**, a
    button per store with its count. The list itself is Shop's there.
- **Plan names:** `readShoppingPlanNames` in the seat reads the names of
  the plans in the items' `via[0]`. They go to the page as `plans` on its
  state, from both `page.tsx` and `loadShoppingList`. Nothing else reads
  them.

**Decisions.**

- **Dg1 — Mode is per browser, defaulting to the viewport.** It's stored in
  `localStorage` under `shopping-mode`. With no choice yet, `(min-width:
1024px)` gives Plan and anything narrower gives Shop. The server renders
  Shop, so the phone in the aisle never flashes; a desktop switches to Plan
  as it hydrates.
- **Dg2 — "Aisle done" lives in localStorage, not sessionStorage.** Phone
  browsers discard background tabs mid-trip, and a session-scoped state
  would lose the done aisles with the tab.
  - The key is `shopping-aisles-done`, scoped by store id, `"all"`, or
    `"list"` when Stores is off.
  - Each entry stores the item ids its rows held, so any new line opens
    the aisle again, even more eggs merged into the eggs row. Lines taken
    off leave it done.
  - Entries expire after 12 hours (a trip), so last week's done aisles
    never hide this week's eggs.
  - The entries are forgotten when Done shopping's clear lands.
- **Dg3 — "Grouped by plan and recipe" is the canvas's "What's on it"
  panel.** The list itself stays by store and aisle, as the canvas draws it.
  - Each plan is grouped by its outermost plan (`via[0]`), with the recipes
    it brought.
  - Remove these sends `removeSource {group}` or `{recipe}` when that takes
    exactly the lines shown, so the commit reads "-Week of Oct 19 (12
    items)". A recipe also on a plan, or a plan also nested in another on
    the list, goes by `remove: ids`, because `removeSource` would take
    more than is shown. Typed lines always go by ids.
  - Removal is confirmed in place, as sub-recipes are (39c). There is no
    Undo: the existing remove has none, and re-adding can't restore the
    items' ticks, scales or sources.
- **Dg4 — Done shopping in Shop finishes the trip.**
  - With `holdTicks` on, the held ticks are saved first, as one change
    (38d, unchanged).
  - Then, held or not, the ticked lines in this store's list are hidden at
    once and removed 8 s later as one commit ("−egg −onion"), unless Undo
    comes first.
  - When the window closes, Undo goes. The lines stay hidden until the
    write lands, or come back with the error if it fails. Until then Done
    shopping stays disabled, so there is only one clear at a time.
  - Hiding or leaving the page inside that window sends the removal at
    once, as a `keepalive` PATCH to `/api/shopping`. Either way, the
    trip's done aisles are forgotten.
  - Plan's Done shopping (`holdTicks` on) stays save-only, and Clear
    checked stays in the Checked fold, so both 38d/39 specs are unchanged.
- **Dg5 — Buy anyway is the existing per-item `need` flag** (`{need: ids}`,
  as the row menu's "Buy even if on hand" sets). The store's shape is
  unchanged.
- **Dg6 — Native controls kept (40-Dc5).** Checkboxes, the store
  `<select>` (the OS picker on a phone) and the switches, which are native
  checkboxes with `role="switch"` as on `/make`. `ui/` has no Switch.
- **Dg7 — Kept beyond the canvas:**
  - The Settings button stays in Plan's header on desktop too. The specs
    and the a11y sweep open the sheet by it, and "Stores and aisles" opens
    the same, now controllable, sheet.
  - Plan keeps the store buttons, for narrowing and per-store Copy.
  - Plan keeps the Checked fold, which is :109's contract.
- **Dg8 — Phone Plan hides the list on screen only** (the canvas). A
  printout is narrower than `lg` too and keeps it, through a
  `@media screen` arbitrary variant.
- **Dg9 — The rail lists aisles with rows to tick.** An aisle holding only
  on-hand rows gets no chip, and is never "done": it keeps its on-hand line
  and Buy anyway.
- **Dg10 — Focus follows what replaced the pressed control:**
  - "Aisle done" → the folded line.
  - The folded line's Undo → the aisle.
  - Done shopping → its Undo.
  - Undo → Done shopping.
  - The Plan/Shop switch → the new layout's pressed button.
  - Closing the sheet opened from "Stores and aisles" → that button.

  The bottom bar's live region announces only what Done shopping did, and
  a save that is retrying. It does not announce each tick's count.

- **Dg11 — The rail chips sit on the faint `--border`, like 42a's outline
  buttons and toggles.** The canvas drew them on `--input`. A done chip
  differs from an open one by its muted text and tick. The store
  `<select>` is a real field and keeps `--input` (41f).

**Spec changes and reasons.**

- `shopping.spec` :425 (mobile): a phone opens in Shop, so the add box is
  opened from the bottom bar's "Add an item" first. The test now also
  asserts the ticked line stays in place, checked, and that there is no
  Checked fold.
- The other `shopping.spec` tests run in Plan on Desktop Chrome, unchanged:
  the Checked fold :109, Done shopping :313, the week-old tick :368 and the
  stores :196.
- `accessibility.spec`'s `/shopping` test now also sweeps the in-store
  view. It covers the store select, a ticked row, an aisle folded as done,
  an on-hand line opened and the add box.
- New `shopping-modes.spec.ts`:
  - On mobile: the rail jump (the bar doesn't cover the target, no sideways
    scroll), the struck tick until "Aisle done" with Undo surviving a
    reload, the on-hand line with Buy anyway, one store at a time, Done
    shopping with `holdTicks` off plus Undo, and Plan on the phone with
    Start shopping.
  - On desktop: the grouping, Remove these for a plan and for a recipe,
    Buy anyway, the switches beside the list, and the mode remembered.
  - Four `@visual` baselines.

**Gates** (all through the capped slot):

- `pnpm --filter recipe-editor typecheck` and
  `pnpm --filter recipe-website exec tsc --noEmit` both clean on the final
  head.
- `pnpm exec vitest run`: 2432/2433 the first time. The one failure was
  `inventory.test`'s boundary grep (Tg6), fixed by rewording two comments.
  Then the inventory, shopping, shoppingView, tick-sync, tick-queue and
  shoppingPage files ran at 162/162.
- `shoppingView`, `shoppingTickSync` and `shoppingTickQueue` are unchanged
  and green.
- Playwright in Docker, production build (`DOCKER=1 heavy-pw.sh … shopping
accessibility.spec`): `shopping.spec`, `shopping-modes.spec` and
  `accessibility.spec`, e2e and mobile, **87/87**.
- The same specs in dev mode (`docker-pw.sh` without `PLAYWRIGHT_BUILD`):
  **87/87**.
- The CLI/MCP `shopping_get` path (`readShoppingView`) is untouched, so no
  byte check was needed.

**Baselines (new, Docker only):**

- `shopping-plan-e2e`: a full page, with the panels beside the list by
  aisle and Probably on hand with Buy anyway.
- `shopping-shop-e2e`: the viewport.
- `shopping-plan-mobile`: the viewport, panels and Start shopping.
- `shopping-shop-mobile`: the viewport, with the store bar, rail, progress,
  a struck row and the bottom bar above the tab bar.

Each one was opened and compared with B-desktop, B-phone and
B-plan-phone. The layout, order and copy follow the boards. The numbers
are the fixture's own.

**Roger to confirm.**

- Dg1: the mode's default by viewport, and Shop as the server's first
  render.
- Dg2: aisle-done in localStorage with a 12-hour expiry.
- Dg3: "What's on it" as the at-home grouping, with confirm in place
  rather than Undo.
- Dg4: Done shopping in Shop clears the ticked lines after an 8 s Undo,
  including after saving held ticks. In Plan it is unchanged.
- Dg7: the extras kept beyond the canvas (the Settings button, the store
  buttons, the Checked fold).
- Dg8: the phone's Plan without the list.

### 42e — Holidays: the almanac and the menu pages

**What changed.**

- **`/holidays`, the almanac** (homepage canvas C): a header ("The year
  ahead · N holidays", today's date), a ruler of the next 365 days from
  `md` up — a tick on the first of each month with the year on January,
  a dot per dated holiday, labels stacked in up to three lanes when they
  crowd (`rulerLanes`: Christmas and New Year's) — then **Next up**, three
  countdown cards (the soonest larger, its number in the accent; picture,
  date, "9 dishes · 3 drinks", its first three recipes pinned first, "The
  Halloween menu"), **Later in the year** as one row each, and **Any time**
  for holidays with no rule. Files: `common/components/HolidaysPage/`
  (`index.tsx`, `Almanac.tsx`).
- **`/holidays/<slug>`, the menu** (/drinks canvas C, generalised): the
  "Holidays · counts" eyebrow and the holiday's date over the headline
  "**13** days to Halloween.", the record's description and picture, four
  lead cards of the kind shown (pinned first), "Then Christmas, in 68 days
  — 1 drink." to the next holiday's menu, then **On the menu:
  _recipes_** — the kind word is `/make`'s kind menu — with dot-leader
  groups in newspaper columns: dishes by course, drinks by style, "More"
  for the rest, each line's right-hand side the dish's main ingredient or
  the drink's spirit. With both kinds shown, the groups sit under Dishes
  and Drinks. "What can I make?" goes to `/make?q=` + `withKind(tag:<slug>,
kind)`. Files: `HolidayMenu.tsx`, `HolidayMenuPage.tsx`.
- **Data:** `common/controller/holidaysPage.ts` (pure: `holidayEntries`,
  `holidayMenuData`, `almanacView`, `rulerLanes`, `holidayAfter`,
  `menuGroups`, `menuCourses`, `holidayAliasTarget`) and
  `controller/data/readHolidays.ts` (the tree, each holiday's record, one
  cached by-term row per key of the holidays' subtrees — `/drinks`' and
  the term page's pattern). `util/holidays.ts` gains `holidayRuleKey` (slug,
  then aliases), an optional `rule` on items for `orderByNextOccurrence` /
  `withinComingUpWindow` / `nextSeasonal` (unchanged without it),
  `formatDayShort`, `formatMonthTick`, `addDays`.
- **Routes in both apps:** `editor/src/app/(recipes)/holidays/page.tsx`,
  `holidays/[slug]/page.tsx`, and the export's, defined once in
  `HolidaysPage/routes.tsx`. The export's `generateStaticParams` emits
  every holiday and every alias of one; with none, one `_` placeholder that
  answers 404 (the `generateTagStaticParams` guard).
- **The kind menu** moved out of `MakeQuestion` into
  `MakePage/KindMenu.tsx` (Te1), markup and behaviour unchanged; `SLOT` is
  exported for the holiday heading.
- **Links:** a holiday's term page says "See the Halloween menu", the
  `holidays` root's "The almanac: every holiday, by date"
  (`TagPage/shared.tsx`); the footer's default Browse column gains
  Holidays after Drinks on a site that has a `holidays` root with a child
  (`AppLayout`, a cached tree read in a try/catch; `NAV_ICONS` gets
  `calendar-heart`). `TagAliasRedirect` takes a `base` for the export's
  alias pages.

**Decisions.**

- **De1 — dates per D4, by slug then alias.** A holiday child with no
  rule is undated and last ("Any time"); a holiday further than 365 days
  off (a late Easter after an early one) keeps its card but no dot.
- **De2 — today is the browser's (U1).** The server's day orders the
  first render; countdown numbers and today's date wait for the browser's
  day (`useToday(null)`), so the export's HTML never prints a stale number.
  Dates are `<time>` (masked in baselines).
- **De3 — only holidays with recipes** are on the almanac (plans alone do
  not count: the menu lists recipes). A holiday child with none still has
  a menu page that says so.
- **De4 — the kind lives in `?kind=<word>`** (`dishes`, `drinks`; none for
  recipes), read with `useSearchParams` under a `Suspense` whose fallback
  is the whole menu — the export's static HTML.
- **De5 — course order is a meal's** (`MENU_COURSE_ORDER`: breakfast,
  snacks, soup, salad, mains, sides, bread, sauces, desserts; other
  courses after, in tree order); styles keep `DRINK_STYLE_SLUGS`' order. A
  recipe in two courses goes under the earlier in that order, whatever
  order its tags are in (`earliestTerm`; a dessert-and-breakfast pie is
  breakfast); a drink in two styles likewise.
- **De6 — the right-hand side of a menu line** is the dish's main
  ingredient or the drink's spirit, not a time: the by-term rows carry no
  times, and adding them would change the tag index's projection (a
  reindex).
- **De7 — an alias redirects.** `/holidays/christmas-cookies` → the
  editor redirects; the export emits a page that sends the reader on. A
  slug that is neither a holiday nor an alias of one is a 404.
- **De8 — `TimelineStrip` was not reused.** It draws one recipe's
  schedule as proportional segments; the almanac is a calendar ruler with
  points. A new `Ruler` inside `Almanac.tsx` rather than a fork.
- **De9 — no masthead link.** Six destinations fill the masthead at `md`,
  and a masthead change moves every full-page baseline; the almanac is in
  the footer — only on sites with holidays, so only `drinks-bar`'s footer
  moved (both `drinks-page` baselines, e2e and mobile, regenerated) — and
  linked from the term pages.

**Roger to confirm.** De3 (plans don't put a holiday on the almanac);
De5's course order; De6 (main ingredient / spirit at the end of the
dotted line); De9 (footer only — a masthead or ⌘K palette entry is a
small follow-up); the homepage's "All holidays" still goes to
`/tags/holidays` — 42f's redesign links the almanac.

**Gates** (2026-10-19, all through the capped heavy slot).

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit`: clean.
- vitest: 120 files, 2434 tests passed (new: `test/holidaysPage.test.ts` —
  rule lookup by slug then alias incl. 42k's `new-years` shape, almanac
  order and undated last, the 365-day ruler across a year end, a late
  Easter off the ruler, label lanes, the next holiday, menu grouping by
  course and style with More, pins first, a two-course dish under the
  earlier course, kinds, alias targets).
- Export build (`next build`, `output: "export"`) against a scratch copy
  of `drinks-bar`: `○ /holidays`, `● /holidays/halloween`,
  `● /holidays/christmas` prerendered as static HTML; the index's footer
  links `/holidays`.
- Playwright in Docker, build mode: holidays, accessibility, drinks, make,
  tag-pages, footer, homepage-browse, menus — **173 passed**. Dev mode
  once (Docker): holidays and accessibility — **76 passed**.
- Baselines (Docker): new `holidays-almanac` and `holidays-menu`, e2e and
  mobile, on the frozen clock; `drinks-page` e2e and mobile moved (the
  footer's Holidays link, nothing else). Each opened and compared with its
  canvas: the almanac is canvas C's "The season" (ruler, big countdowns,
  cards) as a page; the menu is the /drinks canvas C's hero and dot-leader
  menu. With the fixture's two holidays the Next up row has an empty third
  column, and every picture is a monogram (the fixture has no photos).
