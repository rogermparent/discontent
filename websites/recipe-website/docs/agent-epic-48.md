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
  calls **added** to recipes (a remove-only assign is not checked): the
  searches that found at least one recipe an assign added it to (the
  search the tagging came from, not every search of the run), less what an
  assign named (`add`) or took the term off (`remove`) and less a row
  whose tags already carry the term. Only assigns that answered (not an
  error) and only on recipes (`type: group` is not checked). `unseen` is
  the largest of those searches' totals less the distinct rows they
  returned, so a search paged with `offset` counts its pages together.
- **The term is the one written**: the assign's result slug (its summary's
  when the content was cut), else the asked-for slug through the site's
  `tagSlug` — "Korean" is `korean`, the key "What changed" lists. A row's
  tags are compared through `tagSlug` too ("Mac & Cheese" is
  `mac-and-cheese`). A row carrying only an **alias or a child** of the
  term still reads as missed: the check has no term records, and it is a
  list to look over, so a false hit costs a glance.
- **Where it shows.** `runChanges` puts `missed` (up to `MISSED_MAX` = 24,
  with names), `missedCount` and `unseen` on the term it checks, so
  `/api/agent/<id>/changes` carries them. "What changed" adds **Check what
  it left out**: "Tag korean: The search also found 3 recipes it did not
  tag: Bibimbap, Japchae, and 1 more. It had 14 more matches than it
  returned." — each name a link, right after the clause it belongs to
  (`missedParts`; `missedNote` is the same as one line of text). Nothing
  is written: it is a list for the person to look over.

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
  `(?:king arthur(?: (?:organic|unbleached))*|unbleached)(?= all purpose flour)`
  → "", so "King Arthur Unbleached All-Purpose Flour", "King Arthur
  Organic All-Purpose Flour" and a plain "King Arthur All-Purpose Flour"
  are `all purpose flour`. King Arthur's bread, whole
  wheat, golden wheat, pastry and pizza flours keep their names.
- **Pepper.** `BARE_NAMES` gains `pepper → black pepper` (Dg1's
  line-names-only rule), so "1/2 teaspoon pepper", "freshly ground pepper"
  (ing-10 already read it as `pepper`) and the pepper of "salt and pepper"
  read as black pepper. A step's bare "pepper" already meant black pepper
  (`QUALIFIED_HEADS`), and a typed `pepper` on hand still meets the line by
  its tail.
- **A counted pepper is the vegetable** (review): `BARE_NAME_SKIPS` leaves
  a line that says "peppers" or counts with no unit ("2 peppers, diced",
  "1 large pepper", "2 (8 oz) peppers") as `pepper`; "1/2 tsp. pepper",
  "pinch pepper" and "a pinch of pepper" still read black. No line of the
  dry run below moved back: all 63 of its moved pepper lines have a unit
  or no amount.
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
- The drinks spec checks, wide, that the four groups sit side by side —
  at 1280 px and again at exactly 1024 px (`lg`, the narrowest the row
  gets: the narrow tracks are ~172 px there, ~200 px at 1280), where no
  leader wraps and no column overflows its track. So the row stays from
  `lg`, not `xl`.

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

- **Review fixes** (after the read-only review): the post-check keys on
  the term written (`tagSlug`), skips remove-only assigns, counts paged
  searches together; "it did not tag: <names>" then "It had N more
  matches…"; counted peppers stay `pepper`; King Arthur Organic; drinks at
  1024 px.
- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: clean, before and after merging `origin/main`
  (#343, Next.js 16.4.6).
- Lint (`lint-staged --diff` against the merge base, as CI): clean.
- `pnpm exec vitest run`: 187 files, **4,139 tests** — 4,128 passed in the
  full run on a loaded machine (load ~14) and the 11 that timed out there
  (`cliJson`, `editFormRoundTrip`, `stepUsesForm`, `makePatterns`' 200 ms
  budget) passed alone (4 files, 89 tests).
- Playwright in Docker, production build: drinks, holidays,
  command-palette, curator, tag-pages, visual, shopping (+ shopping-modes),
  make, accessibility — **274 passed, 2 failed**: the two baselines below,
  as expected. Regenerated in Docker (`--update-snapshots`, 40 passed):
  - `drinks.spec.ts/drinks-page-e2e.png` — Strength & method is its own
    fourth column.
  - `visual.spec.ts/git-page-e2e.png` — the index version moved; and the
    old baseline still showed "in sync" beside "no upstream", which 47h
    took away (it had hidden under the tolerance).
    `drinks-page-mobile` did not move.
- After merging `origin/main` (Next.js 16.4.6): drinks, visual and curator
  in Docker again — **47 passed**, the new baselines included.
- CI's first run (#344) found a third baseline the local set did not run:
  `edit-form-frame.spec.ts/new-recipe-imported-e2e.png` — the naan
  fixture's "King Arthur Unbleached All-Purpose Flour" now reads `all
purpose flour` in "Not named in a step". Regenerated in Docker (5
  passed).

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

#### Results (48b)

**Held writes — the smallest honest version** (`controller/agent/held.ts`,
`tools/bridge.ts`, `loop.ts`).

- **What is held.** Every write of the grant (E1) the registry marks
  `readOnlyHint: false`, but `git_fetch` (it moves only the remote's refs):
  21 tools, `HELD_WRITE_TOOLS`. `test/curatorHeld.test.ts` holds the list to
  the registry's annotations, so a new write tool is held unless someone
  adds it deliberately as a read.
- **What the model reads.** A held call is checked as the real one is (its
  zod schema, its URLs through the SSRF guard, a local file refused) and
  then answers `{held: true, note, …}` and writes nothing. The four tools
  that take `dryRun` (`recipe_import`, `recipe_import_list`,
  `recipe_create`, `recipe_update`) run as a dry run and the model gets
  that answer inside the held one (the slug an import would land at, a
  create's record), so a chain (import → tag its slug) still works; an
  error there is the answer, not a proposal. `term_assign` answers its
  split as the content stands (`wouldAdd`, `alreadyTagged`, `missing` — a
  slug a held import or create may make). A dry run the model asks for
  itself is a read and runs unheld. A held import's answer is page text
  (E7: `untrustedResult`).
- **What the transcript keeps.** The tool-result message gains `held`, a
  preview read from the **uncut** answer (slug, name, a batch's recipes, the
  tag split) for the review; the wire mappers pick their fields, so it never
  reaches a model (tested on the Claude and Ollama wires). A held answer
  has no `summary`: `changes.ts` counts nothing for it.
- **The prompts.** A held run's system prompt says writes wait for the
  person (`HOLD_RULE`, `LOCAL_HOLD_RULE`): carry on as if applied, use the
  dry run's slug, never repeat or read back a held call, say what you
  propose. The local prompt and tools stay under 44e's 3,500-token budget.

**The review** (`controller/agent/review.ts`, `reviewStore.ts`;
`GET`/`POST /api/agent/<id>/review`).

- `GET` lists the conversation's held calls in the model's order — phrase
  ("Create “Pork Braise”", "Tag 2 recipes middle-eastern"), input, preview,
  state (`pending`, `applied`, `discarded`, `failed`), and for a tag each
  recipe it adds as the content stands now (name, picture, tags, already
  tagged, not a recipe yet) with 48a's post-check.
- `POST {decisions: [{call, apply, add?}]}` (write scope) applies the ticked
  calls **in the model's order** whatever order the Save lists them in (a
  create before the tag that names it), through the same bridge the run
  had, unheld, as the person; skips the rest; records each decision in
  `<job>.review.json` beside the run the call was made in.
- `add` narrows a tag to the recipes left ticked (`narrowedAdd`: only slugs
  the model asked for); a tag with every recipe unticked is skipped. A call
  already decided, or not this conversation's, is `validation`; a run still
  working is `job_live` (409). A call that fails is recorded with the
  tool's error ("unknown_recipe: …") and the rest still run.
- What changed (`curatorRunChanges`), the recent runs' counts and ⌘K read
  the decisions: an applied call's summary is the real write's.
- A follow-up's model is told what was decided since (`decisionsNote`, in
  its system prompt): "Create “Apple Pie” (call toolu_01): approved and
  written." The model is never re-asked on Save.
- `pruneJobs` removes a run's review file with it (and an orphaned one).

**The page** (`src/curator/*`), variant B as drawn:

- **Layout.** Desktop: the side column (h1, the ask with who answers, the
  runs) left, the run right; idle, the ask sits in the main column with
  three examples and a "How a run goes" strip. Phone: one column — the
  head with "Runs · N" (a jump to the list), the run, then the ask and the
  runs; the run's footer (status, Stop, follow-up) still rides above the
  tab bar (Ed10).
- **The run.** An eyebrow (Run · model · when), the first ask as the
  title, **Ask → Working → Review** (`StageStrip`, `aria-current="step"`),
  the **budget meter** (a Claude run's estimate so far of its cap, moving
  as each turn ends; a local run's turns of 40, "Free"), then per ask:
  **What it did** in plain words (`didLines`: looked in your recipes, read
  the web — searches and pages with their sites —, pages that read
  nothing, wants to make N changes, failed or never ran, working on…)
  with "Show the N tool calls" opening 44d's rows; the **heads-up callout**;
  the answer; and on the newest ask the **found recipes**.
- **Review before it saves** (`ReviewPanel`): marked "suggested by
  <model>", every held change ticked to start, a tag's recipes one per
  row (checkbox "Tag <recipe> <term>", picture, its tags and "+ term",
  "skipped by you — stays as it is" when unticked), "Already tagged, no
  change: …", 48a's "Check what it left out" while it waits; "Save N
  changes" / "Skip all"; after Save each says Saved / Skipped / Failed and
  a status line ("Saved 1, skipped 1.") takes focus. What changed follows.
- **Runs** (`RecentRuns`): All / To review / Changed (the term pages'
  `Segmented`), each row with its pill (Review N, Saved N, Changed N,
  Read only), "heads up", when, its cost; the total under the list.
  `?show=review` opens the list on To review (⌘K's link for several runs).
- **Who answers** (`ModelChoice`): with one model the setup line stays
  (44d's words) plus a Claude run's cost line; with two, a radio per model
  with its note ("Searches the web · runs here cost $0.04–$0.31 · stops at
  $1.00"; "Free · best for reads and single imports · no web search").
- **⌘K.** Go to → Curator carries "1 run waiting for your review: <ask>"
  and a "Review N" pill, and opens that run (or `?show=review`); the
  hand-off row says who answers and what runs like it cost ("qwen3:8b ·
  free, on this machine · opens the ask filled in; you start it").
  `GET /api/agent/summary` (read scope) answers both; the palette reads it
  each time it opens.

#### Decisions (48b)

- **Db1 — Held, not dry-run-and-replay.** A held write answers the model
  at once and writes nothing; Save runs the call the model made, not a
  replay of the conversation. Canvas B's risk note ("a held write answers
  the model like a dry run") is the four `dryRun` tools; the others answer
  "held" and, for a tag, its split. A model told "held" carries on; a
  chain is applied in order.
- **Db2 — One commit per applied call**, the tools' own, not one commit
  per Save as B drew it: each stays revertable on its own from Git, and no
  new commit path was needed. Decisions live beside the run that made the
  call (`<job>.review.json`), not in the transcript only that run appends,
  so a follow-up's view and the first run's agree. One Save at a time in
  the editor's process (only its route decides).
- **Db3 — Only a tag narrows.** `term_assign`'s `add` is the one list a
  person trims (B's drawing); every other call is applied whole or
  skipped. Never widened.
- **Db4 — The model learns the decisions on its next turn**, from a note
  in a follow-up's system prompt; nothing re-runs it on Save.
- **Db5 — Who answers.** The editor's own model (`RECIPE_LLM_*`) first and
  picked by default — no spend by default on the workstation, whose own
  model is qwen; B drew Claude ticked. Claude sits beside a local model
  only with 47i's `RECIPE_LLM_CLAUDE_API_KEY`. A follow-up keeps its
  conversation's model (Claude's raw blocks replay only to Claude). The
  cost range is the listed runs' cheapest and dearest.
- **Db6 — The budget moves per turn** (amends Ed2): each turn's usage is a
  `turn` record in the transcript as it ends, summed on the page. The
  footer's tokens still come with the end record.
- **Db7 — The heads-up is the model's word, given a place.** Both prompts
  ask for a paragraph opening **Heads up:**; the page lifts each such
  paragraph (bold or not, "Heads-up", quoted) into the callout and leaves
  the rest of the answer. The site's own facts (a 404, a failed call) are
  "What it did" lines, not the callout.
- **Db8 — Found recipes** are the newest answer's Markdown links on a host
  the conversation saw, with a path, off this site, not already imported
  (held or done), at most six. Import opens `/new-recipe?import=<url>` (the
  import form, whose own Save writes); "Import all N" sends a follow-up
  that comes back held. The Claude prompt asks for found recipes as links.
- **Db9 — Who holds.** The page's runs, and `POST /api/agent` unless told
  otherwise; `recipes agent --remote` sends `hold: false` and a local
  `recipes agent` and the 44e harness never hold (a person at the
  terminal, as Claude Code writes). The MCP server is untouched.

#### Left out, or for later (48b)

- B's "Waited 26 s … the polite pause" line: the page does not read the
  step log, where the waits are; 48c's why-waiting sentences own them.
- B's "Run again" button (a follow-up or the examples cover it) and its
  per-recipe "why: ⅓ cup tahini" line (no matched-line data on a tag).
- "Today · 4 runs": the total is over the listed runs, not today (the
  server's day is not the reader's).
- The model radio is unit- and component-tested only: the suite has no
  Claude stand-in, so Playwright sees the one-model page.

#### Roger to confirm (48b)

- Db2: one commit per saved change, not one per Save.
- Db5: the editor's own model is the default pick (qwen on the
  workstation, Claude on the Pi); B had Claude ticked.
- Db9: the CLI's `recipes agent` still writes at once.
- Db8: Import opens the import form (its Save writes), not a held import.
- A heads-up only shows when the model writes one ("Heads up:"); a model
  that buries it mid-paragraph leaves it in the answer.
- The model radio needs `RECIPE_LLM_CLAUDE_API_KEY` in the workstation's
  `editor/.env` to offer Claude there.

#### Review fixes (48b, after the read-only review of d5f75be3)

- **No write applied twice.** Save checks every decision — its narrowing
  too — before it runs any, and records each decision as soon as its call
  returns, not after the loop: a refusal part-way, or a restart during a
  long import, no longer leaves a landed write looking pending.
- **An untag is reviewable.** A held `term_assign` with `remove`s shows
  them as a row of their own ("Untag recipe old-tag: apple-pie") with a
  checkbox; Save sends `{apply: true, add: []}` for an untag-only call, and
  `remove: []` when only the untag is unticked (`narrowedList` narrows
  `remove` as it does `add`).
- **A pruned run's calls expire.** A held call whose run has been pruned
  (its review file with it) reads `expired`, not pending: not counted on
  ⌘K or the runs list, never applied; a follow-up's model hears so.
- **Save waits for the newest run.** A Save from an older run's view is
  `job_live` while any follow-up of it is still working
  (`conversationLive`), so the working model never misses a decision.
- **Every import dry run is page text** (E7): the model's own
  `recipe_import` / `recipe_import_list` dry run is wrapped too, not only a
  held one (it was not before 48b either).
- "Open page" on a found recipe is named "Open page: <name> on <site> …"
  (axe's label-content-name-mismatch).

#### Gates (48b)

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: clean (heavy slot), after the review fixes.
- `pnpm exec vitest run`: **189 files, 4,158 tests**, all passed. New:
  `test/curatorHeld.test.ts` (the held list against the registry, the
  bridge's held answers, a held run end to end, Save in order with a
  narrowed tag and a skip, re-decisions and widened adds refused, a bad
  narrowing running nothing, an untag, expiry after pruning, the
  follow-up's decisions note, unheld CLI runs, the model choice) and
  `test/curatorRunSummary.test.ts` (heads-up lifting, found recipes, the
  live cost, held rows, "What it did"). Updated for the `turn` record and
  `hold: true`: `agentJobs`, `agentRoute`, `curatorNewerWebTools`,
  `curatorPage`.
- Playwright in Docker, production build: `curator`, `command-palette`,
  `accessibility`, `visual` — **153 passed**. `curator.spec` gains "holds a
  run's writes for review: save one, skip one" (Working then Review, the
  heads-up callout, a found recipe's Import link, ⌘K's count, untick one,
  Save, only the saved recipe written, the runs list's pill, axe); its
  other tests' checks moved onto the held flow (a Save before What changed,
  the answer's links in `curator-answer`, the raw calls behind "Show the N
  tool calls", 48a's list in the review then in What changed).
- **Baselines moved** (regenerated in Docker, `--update-snapshots`, each
  opened): `curator.spec.ts/curator-idle-e2e.png` (the ask with "How a run
  goes"), `curator-finished-e2e.png` (the run as B draws it, with its
  review waiting) and `curator-phone-e2e.png` (the same at 390 px). The run's
  times and the stage strip are masked. No other baseline moved.
- Dev mode once (Docker, `next dev`): `curator.spec` **8 passed**.

### 48c: `/jobs` and a job's page, variant B (L)

A live chip in the masthead, live steps with why-waiting sentences,
failures grouped by cause with a next step, rounds folded; the job page as
a timeline of sentences with "where the minute went". **Roger's decision
(2026-11-17, 47h row 7 "fix"): a page's own picture may follow its page
without the per-site polite gap** — one picture per page fetch, same
registrable domain, still one request at a time and still counted for the
next page. Record it as an amendment to 30-D5.

#### Results (48c)

**The picture follows its page** (Dc1; `curation/sitePacing.ts`,
`jobs/queue.ts`, `jobs/steps.ts`, `curation/importList.ts`).

- A page's parse names its pictures to the pacer (`namePictures`; every
  seat through `parsePage`, a roundup's items through their pacer). The
  site's last request is remembered (`SiteState.pages`): its URL, when it
  ended, and the shared slot's stamp it left (`release()` now answers it).
- A picture whose URL that page named, on the page's site (`paceKey`), may
  skip the gap once: it still takes the line and the shared `site:` slot
  (one request at a time), and the slot's gap is waived only while its
  clock still reads the page's own release (`waiveGapAfter`), so any
  request in between, in any process, owes the gap again. The pass is
  judged again once the slot is held (a redirect may have ended on the
  site meanwhile), a 403 retry of the picture waits the gap, and the
  picture stamps the clock: the next page waits 15 s after it. A
  `pace.follow` note says so in the job's log. Noted under 30-D5 too.

**`/jobs`, variant B** (`src/app/(editor)/jobs/`; out of Settings).

- **The masthead's chip** (`src/jobs/JobsLiveChip.tsx`, AppLayout's new
  `liveStatus`): "2 running · 1 queued" (the phone: "2 · 1") while a job
  runs or waits, linking to `/jobs`, `aria-current` there; nothing at all
  while idle, so no baseline moved. One poll of `GET /api/jobs/live` per
  page (5 s live, 20 s idle, none while hidden), signed in only; the
  export never gets it. Hidden in screenshots (`screenshot.css`).
- **Now:** a card per live job — its kind (and a run's model), its name,
  its time so far, Stop / Cancel, its steps so far as a strip
  (`liveStrip`: "Searched your recipes ×3 → Fetched a page"), and why it
  waits (`whyWaiting`): its place in a line and who holds it (the GPU, a
  site, yt-dlp, the repository's line), the polite pause for a site and
  when it ends ("Waiting 9.0 s for example.com … Next request at
  20:00:12", from a `pace.wait` or the shared slot's last release), or
  what it holds and who waits behind it ("Model reads the recipe: holding
  the GPU. Nothing is waiting behind it.").
- **Needs a look** (`attentionGroups`): every failed, interrupted, or
  done-but-read-nothing job, grouped by cause — a site's wall by site and
  status (401/402/403/451: "Paste the text"), every 404/410 in one group
  ("Show the N"), 429, 5xx, no recipe card, a process that ended, any
  other failure by kind and code. A later job that read the same page (a
  paste of its text, another try) puts it right ("pasted … Later it went
  in as X"); a group with nothing left open is dropped. Cancelled jobs are
  never listed. Dismiss is per browser (localStorage) and holds until a
  newer job joins the group; "Show the N dismissed" brings them back.
- **History** (`foldRounds`): by day (UTC until hydrated, then the
  reader's), each round — consecutive jobs of one kind, each started under
  10 min after the last ended — one row ("4 inspects · drinks.test",
  names, "1 not found" / "all read", a curator round's cost), opening to
  its jobs; a single job is named by what it read. B's filter (All,
  Imports, Inspects, Curator, Repository); "One row per job" (`?rows=each`)
  unfolds them.
- **The machine:** Lines (holder, then the line, "Free"), the fortnight's
  counts (or "The newest N jobs" past the 300 read), the model imports read
  with (38g's section).
- `GET /api/jobs/board` (read scope) feeds it: the rows plus the page read,
  a non-2xx status, the recipe read or written, a run's cost and model
  (`boardJob`), the live jobs' logs (≤ 8, their last 400 lines), the queue
  with each line's `lastRelease`. `GET /api/jobs`, `recipes jobs`, MCP
  `job_list` / `job_get` are unchanged (`ResourceView` gains only an
  optional `lastRelease`).

**A job's page:** an eyebrow (kind, model, when), the ask or label as the
title, its status and error, Cancel / Retry / Open in the form; **Where
the minute went** (`timeSplit`: each step's own time by kind — the model,
waiting, fetching, tools, saving, everything else — a hatched wait, and a
sentence when waits were a quarter of it); **What it did** (`jobStory`):
the step log as sentences on a time rail — "Read www.example.com · 200 ·
84 kB", "Waited 14.6 s for example.com · its polite gap", "Model reads the
recipe · qwen3:8b · 12/12 lines found" with "9.0 s of that was loading
qwen3:8b onto the GPU", a curator run's tools in the curator's words with
the turns folded and "Wrote the answer"; beside it the result, warnings and
**For the curious** (tokens, cost, process, ids, every step to scale — 37c's
bars — and the raw log).

#### Decisions (48c)

- **Dc1 — amends 30-D5** (Roger, 2026-11-17, 47h row 7): a page's own
  picture may follow its page without the per-site gap — one picture per
  page fetch, the URL the page named, on its registrable domain; still one
  request at a time and counted for the next page. Void if anything else
  asked the site since, in any process.
- **Dc2 — `/jobs` is a page of its own**, as B draws it: out of the
  Settings route group (no sidebar there), still Settings' Jobs item and
  Tools' link, and the chip. The footer is unchanged (B drew Jobs there):
  the owner footer is on every signed-in baseline.
- **Dc3 — a round is time and kind** (B's own rule): the store keeps no
  batch id. A roundup import is already one job.
- **Dc4 — the sentences are computed in the browser** from the board's
  data with the reader's clock (nothing timed on the server's render), so
  the countdown moves between reads and nothing mismatches on hydration.
- **Dc5 — B's filter replaces the Kind and Status selects** on the page;
  "Needs a look" is what the failed filter was for. The API keeps both.
- **Dc6 — dismissals are per browser**, not shared state: a viewer's
  convenience, and a group comes back when a newer job joins it.

#### Left out, or for later (48c)

- B's planned steps ("Check the lines", "Open in the form" still to come,
  "step 3 of 5"): the log knows only steps that began.
- "Min in polite gaps" over 14 days: it would read every log on each poll.
- A deep link that opens the form in Text mode with the source filled
  ("Paste sauced-bacon-jam"): the button opens `/new-recipe`.
- The job page's why-sentence has no queue to read, so a shared slot's
  gap there says "Waiting for X's polite pause" without its end.
- B's topic words on a round ("· drinks"): there is no topic in the record.

#### Roger to confirm (48c)

- Dc1 as built: the pass covers the picture the page itself named (its
  ranked images); a picture the caller overrides (`image:`) waits the gap.
- Dc2: the footer has no Jobs link (Settings → Jobs, the chip, the page).
- The chip shows only while something is live; idle, nothing marks Jobs.
- Rounds: one kind, gaps under 10 min — a mixed evening (roundups, imports
  and rebuilds) is several rows, not B's one "Thanksgiving" row.

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
