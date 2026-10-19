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
| 42m      | M    | `agent/42m-bean-swaps`    | 🟡     | —   | Bean swaps on `/make`: their own tier, a switch, and `inventory make`'s `beanSwap`.           |
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

### 42m — Bean swaps on Make (M)

Roger, 2026-10-18 (live): "Add many different bean salad recipes which I
will look up in the what can I make tool. I should be able to see many
recipes with different beans and be able to **loosen the bean restrictions
to substitute different beans if needed as a separate tier**." The salads
themselves are a content phase running alongside; this is the tier.

Strict and close matching stay as they were — `bean` is still out of the
same-head rule, so black beans never _meet_ a chickpea line. A bean family
(`common/util/beans.ts`) says which beans stand in for one another; a
recipe short only of family beans, each coverable by a bean on hand, is
listed in its own "With a bean swap" group with "Use [pinto beans] for
[black bean]". It never becomes "can make" and moves no other count. A
switch beside "Count close matches" turns it off, per browser; the agents'
`inventory make` returns the same group (41i parity).

#### Results

**What changed.**

- `common/util/beans.ts` (new, pure): `BEAN_KINDS` (the family, by kind),
  `beanKind` / `beanKindOf` (a name's kind, through `toName`, after a few
  leading "how it's sold" words — `cooked`, `canned`, `can of`, `15-ounce`,
  `low-sodium`, `no-salt-added`), `isBeanLine` (every alternative a family
  bean), `beanFor` (which bean on hand to swap in).
- `util/makeable.ts`: `MakeableOptions.beanSwaps` (default `false` in the
  pure judge; the page and the seat pass it), `RecipeMatch.swaps`, and
  `MakeableAnalysis.beanSwap` — the same match objects as in their bucket,
  sorted by name.
- `/make`: the "With a bean swap" section after "Can make now" (photo and
  spec cards: one "Use [have] for [needs]" line per swap, the bean on hand
  a `have` tape and the line's a dashed `missing` tape); in the bucket the
  recipe also sits in, "Needs [chickpea] (swap: black beans)"; the ticker
  adds "· N with a bean swap" when N > 0; the switch "Let beans stand in
  for each other" under "Count close matches" (`make-settings-v1`
  `beanSwaps`, stored only as `false`).
- Agents: `inventory_makeable` / `recipes inventory make` /
  `GET /api/inventory/make` take `beanSwaps` (`--no-bean-swaps`,
  `beanSwaps=0`), answer `beanSwaps: boolean` always and `beanSwap: [{slug,
name, swaps: [{line, use}]}]` while it is on (capped at `limit`); the
  CLI's text prints "With a bean swap (N)" after the buckets; the tool
  description, the CLI help and the curator skill's §8 say so. Existing
  fields keep their shapes.
- Fixture `make-beans` (four salads, copied shapes: Chickpea Cucumber
  Salad, Black Bean and Corn Salad, Two Bean Salad, Classic Three Bean Salad
  with green beans); indexes built on a scratch copy with
  `rebuildFixtureIndexes` (seeded from `make-food`'s index, since a type
  with no index is skipped) and copied back.

**The family (Dm1).** Black (black, black turtle); red (kidney — red, dark
red, light red — red, small red, adzuki/azuki); pinto (pinto, borlotti,
cranberry, anasazi, pink); white (cannellini, white, white kidney, navy,
great northern, haricot, flageolet, marrow); chickpea (chickpeas, garbanzo
— folded already — ceci); butter (butter, lima, baby lima); black-eyed peas
(and cowpeas); mung; fava (and broad); and "any": beans, mixed beans, bean
medley, bean mix, three/four/five bean mix. Bare varieties count where
they name nothing else, as an `(or …)` alternative leaves them ("black
beans (or pinto)"): pinto, borlotti, anasazi, kidney, red kidney,
adzuki/azuki, navy, great northern, cannellini, lima, fava, ceci — never
black, white, red, butter or cranberry. 42n's shapes read as members:
"cranberry beans (borlotti)", "fava beans (broad beans)", "kidney beans
(rajma)" (the parenthetical is an alias), and "black beans (or pinto or
cannellini beans)" (each of its beans). **Left out:** green, string,
wax and runner beans; edamame and soybeans; lentils and split peas; bean
sprouts; coffee, cocoa, vanilla and jelly beans; refried, baked and chili
beans (sauced); bean paste; romano beans (borlotti in Italy, a flat green
bean in the US).

**Decisions.**

- **Dm1 — The family is an exact list, by kind.** After the leading "how
  it's sold" words, a name must be one of the listed names exactly; no tail
  rule, which would let `beans` claim green, vanilla and coffee beans. The
  kind only orders the choice: the line's own kind first (navy for
  cannellini), then any named bean in list order, then a mix. An A-or-B line
  is a bean line only when every alternative is a family bean ("chickpeas or
  lentils" is not).
- **Dm2 — The tier is beside the buckets, not one of them.** A swap recipe
  stays in one/two/further away, its `missing` and `distance` unchanged, so
  every other count, the headings, the ticker's first four numbers and Buy
  next are exactly as before (Buy next still offers chickpeas for it). The
  card shows twice: in "With a bean swap" (what to swap) and in its bucket
  ("Needs chickpea (swap: black beans)").
- **Dm3 — "Every requirement met except beans"** is "every line in
  `missing` is a bean line", so it follows `countClose`: with close matches
  off, a close non-bean line keeps a recipe out. Staples count as on hand
  for the swap as they do for everything else, so an "Assume I always have"
  bean can be swapped in.
- **Dm4 — One bean may cover several lines**; a three-bean salad from one
  can is listed, saying the same bean for each.
- **Dm5 — Featuring follows the matcher, not the swap.** Featuring
  `chickpeas` keeps recipes whose required line chickpeas meet, and those in
  the tier show their swap; featuring `black beans` does not pull in
  chickpea recipes it could stand in for.
- **Dm6 — Defaults.** On by default on `/make` and in the seat; off by
  default in the pure `analyzeMakeable` (pages that show counts only — the
  homepage tile, `/drinks` — never ask, and pay nothing). The ticker leaves
  the tier out at 0, so a drinks scope reads as before.
- **Dm7 — A bare `beans` names only the family** (review, a pre-existing
  matcher gap fixed narrowly): an inventory item `beans` used to meet "1 lb
  green beans", "1 vanilla bean" and "coffee beans" strictly (`bean` is no
  vague head), and green beans on hand met a line asking for "beans". Now,
  in `namesMatch`, a name that is only `bean` meets a longer one only when
  that is a family bean (`isFamilyBeanWords`) — "black beans", "mixed
  beans", "canned beans" yes; green, wax, string, vanilla, coffee, cocoa and
  jelly beans no. It touches nothing but the word `bean`. It can lower
  can-make counts for a list holding plain "beans", and the shopping list's
  "probably on hand" fold (the same `satisfies`) no longer folds green beans
  under it.
- **Dm8 — An `(or …)` with `or` inside is read in the family only.** The
  parser leaves "black beans (or pinto or cannellini beans)" as two
  alternatives, `black bean` and `pinto or cannellini bean`, and a bare
  `(or pinto)` without the noun. `beanKinds` splits a name on `or` and
  lends the last part's noun to a part without it, so the line is a bean
  line naming black, pinto and white. Strict matching is unchanged:
  cannellini beans on hand meet it (the tail of `pinto or cannellini
bean`), but pinto beans don't, so with pinto it lands in the tier ("Use
  pinto beans for black bean or pinto or cannellini bean"). **Follow-up:** split
  `(or A or B C)` into alternatives and lend the noun in the parser
  (`alternativeParts` / `inheritTails`) — a matcher-wide change, out of this
  phase.

**Roger to confirm.** The family list and its exclusions (Dm1: chili beans,
romano beans, lentils as a later family of their own?); a swap recipe shown
in both the tier and its bucket (Dm2) rather than moved; the switch on by
default and its wording; featuring not widened by swaps (Dm5); a bare
"beans" on the list no longer meeting green/vanilla/coffee beans, which
can lower can-make counts (Dm7); the swap text's singular line name — "Use
pinto beans for kidney bean", matching "Needs chickpea" (`requirementLabel`).

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
