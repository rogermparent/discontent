# Epic 48 — Roger's picks, built

> **This is the durable source of truth for epic 48.** Read it before
> touching `/curator`, `/jobs` and a job's page, Settings and `/git`, the
> homepage, ⌘K's holiday rows, term-page card times, `/drinks`' Browse the
> bar, a holiday menu's drink groupings, the tagging post-check, or the
> ingredient-name tables. The orchestrator updates the roadmap **Status**
> column and the **Now** line; workers add their phase's **Results** and
> **Traps** under their own headings, with decision amendments numbered by
> phase letter (`Da1`, `Db1`…). Background: `agent-epic-47.md` (47d's
> canvases, 47h's fixes), `agent-epic-46.md` (the decisions 48a changes).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded · 📝 proposed.

**Now:** in progress (planned 2026-11-17). 48a and 48k first; then 48b → 48c → 48d → 48e, one heavy worker at a time; 48-close.

## Context

Epic 47 closed on 2026-11-17 (#332–#342, main `e00e0854`). Roger answered
its picks page the same evening: https://claude.ai/artifact/MeV82ZbXtvYsNq4SbNS2zn
(db collection `picks`, 62 decisions, read 2026-11-17). Every design canvas
(47d) went to variant **B**:

- `/curator` — https://claude.ai/artifact/1eW56Q6JuyQKXQucG1F9Fy → **B "Ask, watch, approve"**
- `/jobs` and a job's page — https://claude.ai/artifact/NHrPGNf5TYuvtzBp3naVwx → **B "Now / needs a look / history"**
- Settings and `/git` — https://claude.ai/artifact/FASzPFRYuYwBqJSEvFr6FX → **B "Is everything in sync?"**
- The homepage — https://claude.ai/artifact/5Hka15zkvWJ6xXbBohgNA3 → **B "Tonight, then the next feast"**

Seven of epic 46's decisions were "change" (48a); the rest of the page was
"keep" (no work). All ten proposed terms were "add", two of the three
alternatives candidates "convert" (48k), and every "found along the way"
item "fix" (in 48b–48e, and 47h had landed some already).

## How it runs

Epics 43–47's way of working, unchanged:

- Orchestrator plus worktree workers, one PR per phase. The worker
  contract and review brief are `tmp/47/`'s, with 47→48.
- A read-only review agent on each M/L branch before its gates. A fresh
  finisher takes over when a worker passes ~400k tokens.
- Heavy work only through `heavy.sh` / `heavy-pw.sh` (Docker) /
  `heavy-bg.sh`, one at a time. A job that exits 137 is reported, not
  retried. Baselines only in Docker.
- Merge on green CLEAN CI, one at a time.
- Never a real model in tests. GPU etiquette with Archilyzer.
- Content writes go through the **CLI from the updated main checkout**,
  not the session's long-lived MCP server (the stale-code trap), followed
  by `POST /api/revalidate`. Never `editor/content`.
- Every AI change in the editor is marked and needs approval (memory
  `ai-changes-need-approval`). Small tasks run on the local model first
  (memory `local-model-for-small-tasks`).
- No deploys unless Roger asks.

## Phases

| Phase    | What                                                                                   | Size | Status |
| -------- | -------------------------------------------------------------------------------------- | ---- | ------ |
| 48a      | Epic 46 decisions Roger changed + this doc                                             | M    | 🟡     |
| 48b      | `/curator` variant B + the heads-up as its own callout (47h row 3)                     | L    | 📝     |
| 48c      | `/jobs` + job page variant B + a page's own picture without the polite gap (47h row 7) | L    | 📝     |
| 48d      | Settings + `/git` variant B + an API token screen (47h row 11)                         | L    | 📝     |
| 48e      | Homepage variant B (incl. the next holiday's menu by course: 47h row 13)               | L    | 📝     |
| 48k      | Content: 10 terms, 2 choice conversions (orchestrator, CLI)                            | S    | 📝     |
| 48-close | Doc, memory, report                                                                    | S    | 📝     |

Order: 48k (no heavy slot) alongside 48a; then 48b → 48c → 48d → 48e, one
heavy worker at a time; 48-close.

### 48a: The changed decisions (M; branch `agent/48a-decisions`)

Each item is Roger's "change" on the picks page, with his note:

- **46-d-tag** — a local-model bulk tagging run gets a **post-check that
  lists what it missed** (recipes the search found that the run didn't
  tag). Note: "Add a post-check that lists what it missed".
- **46-e-rows** — ⌘K: **prioritise individual recipe matches and tags;
  holidays stay as a secondary option**. Note: "prioritize individual
  matches and tags for search while still keeping holidays as a secondary
  option".
- **46-e-total** — a card with prep + cook but no total **shows prep +
  cook** instead of its date. Note: "Show prep + cook when there's no
  total".
- **46-g-ka** — merge King Arthur unbleached all-purpose flour **into
  all-purpose flour** (46g's mechanism).
- **46-g-pepper** — merge bare "pepper" **into black pepper** (46g's
  mechanism; "salt and pepper" lines follow).
- **46-h-drinks** — `/drinks`: Strength & method becomes **its own fourth
  column**. Note: "Its own fourth column".
- **46-h-menu** — a holiday menu's drinks: **style then strength stays the
  default, but views/groupings are configurable** (the reader can switch).
  Note: "Style then strength default, but configurable views/groups".

#### Results (48a)

**46-d-tag — the tagging post-check** (`editor/controller/agent/changes.ts`).

- **What it reads.** The loop keeps each `recipe_search`'s rows — slug,
  name, tags, capped at `FOUND_MAX` = 200 — and its `total` on the tool
  result as `found` (`searchFound`), taken from the **uncut** result as a
  write's `summary` is (44d), so a result cut for the model's context still
  counts. The wire mappers pick their fields, so `found` never reaches a
  model.
- **The check** (`tagMisses`, pure). For each term the run's `term_assign`
  calls put on recipes: the searches that found at least one recipe an
  assign for that term named (the search the tagging came from, not every
  search of the run), less what an assign named (`add`) or took the term
  off (`remove`) and less a row whose tags already carry the term. Only
  assigns that answered (not an error) and only on recipes (`type: group`
  is not checked). `unseen` is the most matches any of those searches had
  beyond the rows it returned.
- **Where it shows.** `runChanges` puts `missed` (up to `MISSED_MAX` = 24,
  with names), `missedCount` and `unseen` on the term it checks, so
  `/api/agent/<id>/changes` carries them. "What changed" adds **Check what
  it left out**: "Tag korean: The search also found 1 recipe it did not
  tag: Bibimbap." (each a link), or "… and 14 more it did not return".
  Nothing is written: it is a list for the person to look over.

**46-e-rows — ⌘K's holiday rows**
(`common/components/CommandPalette/holidayRows.ts`).

- While typing, **one** holiday row at most (`PALETTE_HOLIDAY_MATCH_LIMIT`),
  still after the recipe rows, Groups and the tag rows ("Narrow this
  search"); an empty palette's **Coming up** keeps two
  (`PALETTE_HOLIDAY_LIMIT`).
- With one row, the holiday a typed name names leads its namesakes: each
  holiday now carries its `names` (label, slug, aliases as folded words),
  and one equal to the typed words goes first, so "christmas" offers
  Christmas, not the sooner Christmas Eve. A prefix ("christ") still takes
  the soonest.
- The command-palette spec checks that the recipes group comes before the
  holiday group.

**46-e-total — prep + cook on a card.**

- The by-term row carries `prepTime` and `cookTime` when the recipe has no
  total (`recipeTagTaxonomy`, version **"3" → "4"**, stored `1.4`); a row
  with a total keeps just `totalTime`, and a row with no times has none of
  the keys. `RecipeListEntry` gains the two optional fields (type-only in
  `paginationConfigs.ts`, no bump).
- `cardTime` (`List/shared.tsx`) shows the total, else prep + cook — the
  sum the recipe page's total already makes (`pathTimes`) and search's
  `minutesOf` — in the same `<time dateTime="PT65M">1 h 5 m</time>`; with no
  time at all the card keeps its date.
- **Reindex: automatic.** The taxonomy version moves the site's index
  version (`reindexJobs`' pin `4a3e71b1227164cb` → `5c2fcd4101c80966`), so
  every instance rebuilds once at its next start. Fixtures regenerated in
  their own commit: only the recipe `tags` / `by-tag` aggregates kept, as
  46e did.

**46-g-ka and 46-g-pepper — two more merges** (`common/util/ingredientNames.ts`).

- **The mechanism is code tables, not content** (46g's): names are read at
  request time from the stored lines, so nothing in the content repo is
  rewritten and there is no real run to make. `ingredientNames.ts` is not
  `specVersions`-pinned and no index stores names, so no reindex.
- **King Arthur.** ing-7's row is now
  `(?:king arthur(?: unbleached)?|unbleached)(?= all purpose flour)` → "",
  so "King Arthur Unbleached All-Purpose Flour" (and a plain "King Arthur
  All-Purpose Flour") is `all purpose flour`. King Arthur's bread, whole
  wheat, golden wheat, pastry and pizza flours keep their names.
- **Pepper.** `BARE_NAMES` gains `pepper → black pepper` (Dg1's
  line-names-only rule), so "1/2 teaspoon pepper", "freshly ground pepper"
  (ing-10 already read it as `pepper`) and the pepper of "salt and pepper"
  read as black pepper. A step's bare "pepper" already meant black pepper
  (`QUALIFIED_HEADS`), and a typed `pepper` on hand still meets the line by
  its tail.
- **"hot pepper" is a compound** (Da2): `hot` is a descriptive word, so
  "Hot pepper (to taste, habanero, scotch bonnet…)" read as a bare
  `pepper` and would have become black pepper. As `COMPOUNDS`' "hot pepper"
  it is its own name, and "hot pepper sauce" / "hot pepper leaves" read
  `hot pepper sauce` / `hot pepper leaf` (they were `pepper sauce` /
  `pepper leaf`).

**The merge's dry run** — every line's name, shopping key and step "Uses"
dumped before (`e00e0854`) and after on a scratch clone of the content repo
(950 recipes, 9,667 lines; 46g's scripts, `tmp/48/48a/code/`; the clone
removed afterwards; the per-line list is `tmp/48/48a/merge-dry-run.tsv`):

|                        | Before | After                 |
| ---------------------- | ------ | --------------------- |
| Lines whose name moved | —      | 90 (61 shopping keys) |
| Distinct names         | 2,074  | 2,073                 |
| Step "Uses" matches    | 6,468  | 6,467 (−2 / +1)       |

- **King Arthur: 23 lines in 22 recipes** → `all purpose flour` (20 plain,
  3 as one side of an "or": pizza flour blend, pastry flour blend, bread
  flour): babkallah, bread-machine-sourdough-discard-loaf,
  chocolate-mushroom-buns, cinna-bites, easiest-pizza-king-arthur,
  golden-pita-bread, graham-crackers, king-arthur-bread-machine-bread,
  naan-bread, naturally-leavened-sourdough-bread, new-england-anadama-bread,
  night-moves-anadama (2), old-fashioned-maine-sourdough-waffles,
  semolina-garlic-swirl-bread, simple-tortillas, soft-breadsticks,
  sourdough-cornbread, super-fast-thin-crust-pizza-dough,
  sweet-potato-sandwich-bread, turkey-dinner-pie,
  white-chocolate-macadamia-nut-tart, yogurt-potato-bread.
- **Pepper: 63 lines in 60 recipes** → `black pepper`: 34 bare, 26
  "salt and pepper", 3 "kosher salt and pepper".
- **Hot pepper: 4 lines** kept off black pepper (2 in trinidad-curry-chicken,
  chicken-tinola's leaves, crunchy-air-fried-deviled-eggs' sauce).
- **Steps lost (2):** ground-beef-stroganoff and ground-beef-yogurt-stroganoff
  each have a "Pepper" line and a "black pepper" line, now one name, and
  their step "…sour cream, dijon, and black pepper" matches the first of
  the two only. **Gained (1):** graham-crackers' "all-purpose flour" step.
- **Make** (the inventory items typed against every line): `king arthur
all purpose flour` on hand now meets 23 more lines. `bell pepper`,
  `lemon pepper` and `white pepper` on hand no longer meet the 66 bare
  "pepper" lines (they did by the tail rule — a bell pepper never stood
  for black pepper); `black pepper`, `pepper` and the default staple still
  meet them all, and none of them meets the hot pepper lines any more. A
  typed "salt and pepper" item (not split, as items never are) now meets
  nothing.

**46-h-drinks — Strength & method, a fourth column**
(`common/components/DrinksPage/BarIndex.tsx`).

- Browse the bar lays out one group a column, wide: Spirit & base, Style,
  Strength & method, then the Classics on two shares. The tracks follow the
  columns there are (`GRID_COLUMNS`, static strings for Tailwind), so a bar
  with no methods or no classics still fills the row. A phone is
  unchanged: each group its own disclosure.
- The drinks spec checks, wide, that the four groups sit side by side.

**46-h-menu — a menu's drinks, grouped as the reader likes**
(`common/controller/holidaysPage.ts`, `HolidaysPage/HolidayMenu.tsx`).

- `DRINK_GROUPINGS`: **Style** (style then strength, the default, 46h's),
  **Spirit** (spirit & base, in the tree's order), **Method** (shaken,
  stirred, built), **A–Z** (one list by name). Each but A–Z ends in "More".
- A "Group drinks by" switch (the term pages' `Segmented`) sits on the
  menu's Drinks wherever two or more drinks show — beside the Drinks
  heading when the menu shows both kinds, above the list when it shows
  drinks only; never on Dishes. It lives in `?drinks=<id>` beside `?kind=`
  (`menuQuery` writes both, each left out at its default), so a link keeps
  it; the export's static HTML is the default.
- The menu data carries each drink's `spirit` and `method` slugs and the
  two term lists (`drinkTerms`); the browser groups (`drinkMenuGroups`), so
  the recipes ride once. By spirit, a line's right-hand side names its
  style instead of repeating the heading.
- `holiday_get`, the CLI's `holidays get` and the lead cards keep the
  default grouping.

#### Decisions (48a)

- **Da1 — the post-check runs for every model**, not just the local one:
  it costs nothing, writes nothing, and a Claude run can leave a hit out
  too. Only the person sees it; the model is not told (a model told would
  write more, and 48b holds writes for approval anyway).
- **Da2 — "hot pepper" is a compound**, not a row: it keeps a chilli line
  off black pepper without touching how "hot" reads elsewhere ("hot
  water", "hot Italian sausage").
- **Da3 — the bare-pepper rule is `BARE_NAMES`**, as Dg1's sugar is: a
  line's whole name only, never a step's words or a typed inventory item,
  so a step's "pepper" stays the head the step matcher qualifies.
- **Da4 — ⌘K's "fewer" is one row while typing**; the empty palette's
  Coming up keeps two (no search to give way to there).
- **Da5 — a card's prep + cook is summed on the card, not the row**, so
  the row still says what the recipe says; a recipe with only a prep or
  only a cook time shows that, as the recipe page's total does.
- **Da6 — the drinks' grouping is per link, not remembered**: `?drinks=`
  like `?kind=`, with no browser storage, so the static export and the
  first render agree.

#### Traps (48a)

- **Ta1 — `hot` is descriptive.** A name whose only other word is a
  descriptive one reads bare ("Hot pepper" was `pepper`); a `BARE_NAMES`
  entry reaches it unless a compound claims the pair first. Check a new
  bare entry against "<descriptive word> <name>" lines in the dump.
- **Ta2 — a fixture run rewrites far more than the version bump moved.**
  `build-fixture-indexes.ts` rewrote 206 files; only the recipe `tags` /
  `by-tag` aggregates (76 files) were kept (46e's rule).

#### Gates (48a)

(Filled in after the runs.)

#### Roger to confirm (48a)

- Da1: the post-check on Claude runs too, and shown only to you.
- Da4: one holiday row while typing, two on an empty palette.
- Da5: a recipe with only a cook (or only a prep) time shows that time on
  its card.
- "cracked pepper" (4 lines) stays its own name, as "cracked black pepper"
  (7) does: neither is a bare "pepper".
- The two stroganoffs' "Pepper" and "black pepper" lines are now one name
  twice: their recipes could drop one line.
- The drinks' groupings are Style · Spirit · Method · A–Z, kept in the
  link, not remembered per browser; `holiday_get` keeps Style.

### 48b: `/curator` variant B (L)

Build variant B as drawn, on today's code, with the canvas's scoping notes:
writes held until Save/approve (ai-changes-need-approval), Ask → Working →
Review, Claude/qwen per ask with cost, found recipes as Import buttons, a
review count in ⌘K; **the model's heads-up is a callout** (47h row 3,
Roger "fix"). Where B needs something the code lacks (held writes
answering like a dry run), build the smallest honest version and record
it. 48a's "Check what it left out" list moves into B's review.

### 48c: `/jobs` and a job's page, variant B (L)

A live chip in the masthead, live steps with why-waiting sentences,
failures grouped by cause with a next step, rounds folded; the job page as
a timeline of sentences with "where the minute went". **Roger's decision
(2026-11-17, 47h row 7 "fix"): a page's own picture may follow its page
without the per-site polite gap** — one picture per page fetch, same
registrable domain, still one request at a time and still counted for the
next page. Record it as an amendment to 30-D5.

### 48d: Settings and `/git`, variant B (L)

One "Sync & upkeep" page opening on a status sentence, the two machines
side by side with what moved, upkeep rows with when-you'd-need-it, git
under Advanced, a conflict as a recipe choice (keep both), an Account &
devices page — **with an API token screen** (create with scopes, list,
revoke; 27b's token scopes; 47h row 11, Roger "fix"). 47e's sessions are
per editor: say so on the page.

### 48e: The homepage, variant B (L)

Search + Ask field, Tonight (quick dinner / ready now / warm drink), the
next holiday as its menu by course (fixes the Thanksgiving strip having no
turkey, stuffing or pie) + Start a plan / Ask the curator (editor only),
Christmas with its Christmas Baking plan, new by batch and cuisine,
Holidays in the masthead (47h already added it).

### 48k: Content (S; the orchestrator, CLI from the main checkout)

Terms (all "add"): `pies` (Pies & tarts — **not under dessert**: Roger
"make sure savory pies don't get lumped under dessert"; sweet pies keep
`dessert`), `bars` (Bars & brownies, under dessert), `tofu` (main
ingredient), `thai` (cuisine), `eggnog` (Eggnog & nogs, drink),
`hot-chocolate` (drink), `jamaican`, `trinidadian`, `cuban`,
`puerto-rican` (under caribbean). Choices: convert `frittata` (Variation)
and `ropa-vieja` (Method); skip `sinigang-na-baboy`.

### 48-close — Close-out

Doc, memory, report.
