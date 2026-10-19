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
