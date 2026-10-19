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

### 42b

- **Tb1 — `toHaveScreenshot` has no `style` option.** That option belongs to
  `page.screenshot`; the matcher takes `stylePath` (a CSS file, relative to
  the config) and silently ignores an unknown `style` key. 42b's first
  attempt to hide Next's dev badge passed `style` and changed nothing, which
  cost a 27-minute rerun.
- **Tb2 — `next dev` draws a badge on every page.** It is the "N" at the
  bottom left, a fixed element: 912 px on every desktop capture, 200–950 on
  mobile, and it lands at the bottom of a full page that scrolled to its
  end. Baselines are production renders, while CI's Recipe shards and the
  Portfolio job run dev. So any budget under ~1 000 px fails every dev-mode
  page unless `playwright/support/screenshot.css` hides `nextjs-portal`.
- **Tb3 — `maxDiffPixels` beside `maxDiffPixelRatio` means the smaller one
  wins.** Playwright's comparator takes the minimum when both are set, per
  call and config alike. A per-call ratio "loosening" a page under the 100 px
  config would tighten nothing and loosen nothing. `SnapshotOptions` now
  offers `maxDiffPixels` only.
- **Tb4 — Staleness under the budget still hides.** Plain
  `--update-snapshots` (`changed`) never rewrites a baseline that passes,
  so a page can drift by up to 100 px per capture (1 500 on the three edit-form
  pages) unseen. That is a few glyphs, not an input border. Rewrite with
  `--update-snapshots=all` when in doubt (41-Dp1).

## Results

### 42b — Screenshot tolerance tightened

Branch `agent/42b-tolerance`. Test configuration only: **reindex no, deploy
no**. No baseline moved.

**What changed**

- **Recipe and portfolio configs:** `maxDiffPixelRatio: 0.02` becomes
  `threshold: 0.2` + `maxDiffPixels: 100`. The threshold is pixelmatch's
  default, now written out. Both configs also get
  `stylePath: "./playwright/support/screenshot.css"` (Db2). The CMS demo and
  resume-builder have no screenshot specs.
- **`playwright/support/screenshot.css` (new, both editors):**
  `nextjs-portal { display: none !important; }`.
- **`support/visual.ts` (both):** `SnapshotOptions.maxDiffPixelRatio`
  becomes `maxDiffPixels` (Tb3).
- **`visual.spec.ts` (recipe):** `EDIT_FORM_IMAGE = { maxDiffPixels: 1_500 }`
  for edit form populated, edit form with slug conflict, and markdown source
  mode (Db3). The search reveal control's 5 % override is gone (Db4).

**Method.** Measured in CI's Playwright image (`docker-pw.sh`, Playwright
1.64.1), against the committed 41d2 baselines. A temporary, uncommitted
change made every capture compare at threshold 0 and 0 px, with a soft
assertion so that each test reached all its captures. Every capture that was
not byte-identical left an `-actual.png`. A script then recounted each one
with Playwright's own comparator (`getComparator("image/png")`) at
thresholds 0, 0.05, 0.1 and 0.2. Runs: the 12 recipe screenshot specs with
`--repeat-each=3 --retries=0` (138 captures per run) in build mode, then in
dev mode before and after hiding the badge. Portfolio's `visual` spec ran
the same way (33 captures per run) in build and in dev mode.

**Measured noise.** Differing pixels against the baseline, worst of 3
captures; every capture not listed was byte-identical.

| Capture                                                | Build, t=0 | Build, t=0.2 | Dev, t=0 | Dev, t=0.2 |
| ------------------------------------------------------ | ---------- | ------------ | -------- | ---------- |
| `edit-form-populated`                                  | 13 034     | 206          | 12 703   | 10         |
| `edit-form-overwrite`                                  | 10 202     | 87           | 13 034   | 27         |
| `markdown-source-mode`                                 | 9 122      | 87           | 11 531   | 206        |
| `git-page`, `make-page-specs`, `yield-multiplied-half` | 1          | 0            | 0–1      | 0          |
| the other 40 recipe baselines                          | 0          | 0            | 0        | 0          |
| portfolio, all 11                                      | 0          | 0            | 0        | 0          |

- **The edit-form noise is the "Recipe 6" preview image.** The diff's box
  sits on the downscaled image (x 459–825, y 762–870) and nowhere else on
  the page. Chromium resamples it slightly differently from run to run.
  Across all 18 build and dev captures of these three pages, the most the
  image moved was **599 px at t=0.2**: a dev capture from the first dev run,
  with the badge's pixels counted separately.
- **Dev mode before the stylesheet.** Next's badge added a constant 912 px
  to every desktop capture, and 200–950 px on mobile (Tb2). The first fix,
  a `style` option, changed nothing (Tb1). The re-run with `stylePath`
  gave the table's dev columns.
- **A functional dev-only failure, not visual.** `command-palette.spec:151`
  ("live search … Enter navigates") failed once per full dev run, as the
  first test against a cold `next dev`. It took no screenshot, and CI
  retries it. It is outside 42b's scope and left as observed.

**Staleness caught (step 4).** I compared each of the 57 baselines as they
stood before 41d2 (`c3101dfd^`), as the expected image, against today's
41d2 baseline, as the actual image (today's page in CI's image). The
comparator was Playwright's, with each rule as the config would apply it.
50 of the 57 differ. The other 7 show no difference at threshold 0.2: the
three Make images, two palette rows, paste-replace, and the reveal control
(147 px at 0.1).

| Rule                                       | Old baselines that now fail |
| ------------------------------------------ | --------------------------- |
| `maxDiffPixelRatio: 0.02` (before)         | 0 of 57                     |
| `maxDiffPixelRatio: 0.002`                 | 32                          |
| `threshold 0.2` + `maxDiffPixels: 800`     | 32                          |
| `threshold 0.2` + `maxDiffPixels: 250`     | 44                          |
| **`threshold 0.2` + `maxDiffPixels: 100`** | **48**                      |

Examples that passed at 0.02 and fail now:

- `empty-state/homepage-empty`: 563 px. The diff is exactly 41f's 3:1
  search-input border.
- `visual/recipe-detail-signed-out`: 1 156 px, from 41f's input and
  checkbox borders.
- `empty-state/bookmarks-empty`: 17 592 px. This is July's "My Bookmarks"
  page from Tp1.

The two that still pass are `footer-mobile` (13 px) and `homepage-mobile`
(76 px). Both changed only text antialiasing: the wordmark is drawn
grayscale in one and subpixel in the other. A redesign moves more than
that.

**Decisions**

- **Db1 — One absolute budget, `maxDiffPixels: 100` at threshold 0.2.** A
  ratio scales the budget with page height: 0.002 of the 1280×3300 edit
  form is 8 400 px, and a redesigned input border is ~500 px. The noise
  outside one image is 0 px at t=0.2 (at most 1 px at t=0), so the margin
  is wide, and 100 px is still 5× under the smallest real change measured
  (563 px). A lower `threshold` (0.1) raised noise and real changes by
  about the same factor (edit-form noise 206 → 1 094 px,
  `homepage-empty` 563 → 3 238 px), so it bought no separation.
- **Db2 — Hide Next's dev badge from captures** with a `stylePath`
  stylesheet, not `devIndicators: false` in `next.config`. That keeps the
  change test-only: no Next or Turbopack config, nothing for the
  main-checkout build to trace, and Roger keeps the badge in his own
  `next dev`. In production the rule matches nothing.
- **Db3 — The edit form's image gets a per-call 1 500 px; it is not masked.**
  That is 2.5× the worst 599 px, and still about 13× under the ~19 000 px
  the edit form moved between July and 41d2. A mask would need three
  baselines regenerated, and 42a may regenerate the same edit-form PNGs
  for its outline borders. This choice touches no PNG.
- **Db4 — The reveal control's 5 % (`maxDiffPixelRatio: 0.05`, #132) is
  removed.** Its reason was host-drawn baselines against CI's fonts; since
  41b every baseline is drawn in CI's image. Its noise measured 0, and the
  config's 100 px is 2.4 % of that 118×36 element. Left in, Tb3 would have
  made it a no-op anyway.
- **Db5 — No baseline regenerated.** The measurement found none already
  off: every byte-different capture is the image noise above.

**Gates**

- Recipe, the 47 tests that take a screenshot, picked by a `--grep` over
  their titles in the 12 spec files (all 46 baselines), with
  `--repeat-each=3 --retries=0` in CI's image:
  - **build: 141 passed** (4.8 min).
  - **dev: 141 passed** (6.2 min).
- Portfolio `visual.spec` (11 baselines), `--repeat-each=3 --retries=0`:
  - **build: 33 passed**.
  - **dev: 33 passed**.
- No retries anywhere; no flaky test, no exit 137.
- `pnpm --filter recipe-editor typecheck`: clean. It includes
  `playwright/**`.
- `pnpm --filter recipe-website exec tsc --noEmit`: clean.
- Portfolio editor `tsc --noEmit`: clean.
- `pnpm exec vitest run`: **119 files, 2 410 tests passed**.
- Main-checkout-shaped build: not run. Nothing here is in Next's build
  graph.

**Roger to confirm**

- The 100 px budget. If CI's runners rasterise differently from this
  machine's Docker, the PR's own CI will be the first to say so: its Recipe
  shards run these specs in dev mode. No CI run was available before
  review.
- 1 500 px for the three edit-form pages, rather than masking the preview
  image. A mask would bring them under the 100 px rule, but needs three
  baselines regenerated.
- Hiding `nextjs-portal` in captures. That also hides a dev-mode error
  overlay from a screenshot; the specs' own assertions still fail on the
  error.
