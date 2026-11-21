# Epic 49 — The shopping list: one ingredient, several names

> **This is the durable source of truth for epic 49.** Read it before
> touching `/shopping`'s merged rows, `common/util/shoppingMerges.ts`,
> `shoppingConsolidate.ts`, the merge decisions under `shopping/merges/`, or
> the `shopping merge` CLI. The orchestrator updates the roadmap **Status**
> column and the **Now** line; workers add their phase's **Results** and
> **Traps** under their own headings, with decision amendments numbered by
> phase letter (`Da1`, `Db1`…). Background: `agent-epic-35.md` (D1–D9: the
> list's storage, D3 "nothing derived is stored", D4 amounts),
> `agent-epic-38.md` (Dd1–Dd13: sub-recipes, `OR:` lines, the pinch merge),
> `agent-epic-42.md` (D5 and 42g: plan at home, shop in the store),
> `agent-epic-48.md` (48a's ingredient merges and `BARE_NAMES`; 48b's held
> writes).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded · 📝 proposed.

**Now:** 49a in review.

## Context

Roger, 2026-11-21: "I want to have a feature in the shopping list to
smartly propose deduplication and consolidation of items such that a single
ingredient from multiple recipes gets collapsed into one list entry with the
total of all entries it's made from e.g. "1 cup white flour" + "2 cups ap
flour" becomes something like 3 cups ap flour. Propositions should be
visible in the ui and editable either directly or by attaching a note for
ai follow ups."

The list already merges one name across recipes (35-D3, `nameKey`), and the
name tables (43n, 46g, 48a) fold many spellings into one name. What is left
is a name that keys apart but buys the same bag: "1 cup white flour" keys
as `white flour`, "2 cups AP flour" as `all purpose flour`, so the list
shows two rows. Folding them in the name tables would change Make and step
matching too, and some pairs are a judgement (salted and unsalted butter).
So epic 49 **proposes** instead: the list says "these look like one thing",
and Roger merges, edits or keeps them apart.

## Roadmap

| Phase | Branch                     | Size | Status | What                                                                                                |
| ----- | -------------------------- | ---- | ------ | --------------------------------------------------------------------------------------------------- |
| 49a   | `agent/49a-shopping-merge` | L    | 🟡     | Deterministic proposals from a curated table, decisions stored and editable, merged rows. No model. |
| 49b   | —                          | M    | 📝     | The note for the model, and "look for more with the model" returning the same proposal shape.       |

## 49a — Same thing, different names (L)

The design was decided before the build (Da1–Da8 below); the amendments the
code asked for are marked.

### Decisions

- **Da1 — Proposals are derived, decisions are stored.** The finder
  (`common/util/shoppingConsolidate.ts`, `findShoppingProposals`) runs over
  the stored items, settings and decisions on every read, like
  `buildShoppingView`; nothing derived is stored (35-D3). A decision is one
  file per id, `shopping/merges/<id>.json`, like items (35-D1), so the
  workstation and the Pi never touch the same file for two decisions. The
  id is a stable hash of the sorted name keys (`mergeIdOf`: two 32-bit
  FNV-1a hashes, 16 hex characters), so a proposal has the same id on every
  device and in every surface.
  - **Da1-1 (amends):** the finder takes the items, not the view's rows. A
    row carries no parsed amount, and loses its sources with the `sources`
    switch off; the finder groups the items by `shoppingNameOf(...).key`
    exactly as the view does (an `OR:` line rides on its parent, `orParents`).
- **Da2 — A curated equivalence table, which only proposes.**
  `SHOPPING_EQUIVALENTS` in `common/util/shoppingMerges.ts`, grounded in
  `measure-ingredient-dupes.ts` run read-only over a scratch clone of the
  content repo (below). Each set lists name keys that still key apart today:
  - all-purpose flour: `white`, `unbleached`, `bleached`, `unbleached white`
    and bare `flour` (not bread, cake, pastry, whole-wheat or almond);
  - granulated sugar: `cane`, `granulated cane`, `white cane` (not
    superfine, caster or coarse);
  - egg: `large`, `extra` (what "2 extra-large eggs" keys as today),
    `extra large`, `jumbo`;
  - garlic: `garlic clove` — "3 garlic cloves" counts as cloves
    (`countUnits`), so with "2 cloves garlic" it is "5 cloves garlic";
  - rolled oats: `old fashioned (rolled) oats`;
  - vanilla extract: a bare `vanilla`;
  - semisweet chocolate chips: `semi sweet` and `morsel` spellings;
  - panko: `panko breadcrumbs`, `japanese panko`;
  - kosher salt: `coarse kosher salt`;
  - black pepper: `cracked` and `coarse black pepper`.

  The brief's other examples — scallions and green onions, cilantro and
  fresh coriander, heavy and heavy whipping cream, confectioners' and
  powdered sugar, white and granulated sugar — **already merge today** (one
  name key, `SYNONYMS` / `NAME_SYNONYMS`), so they need no row and propose
  nothing: a row that already merges stays as it is. The judgement calls are
  left out (Roger to confirm, below).

- **Da3 — The proposal shape** (the one 49b's model returns too):
  `{id, rows: [{key, name, amountText, sources[]}], name, amount, estimated, line, reason}`.
  `name` is the set's generic name ("all-purpose flour"); `amount` is the
  sum, through `addAmounts` within a family (US and metric stay apart,
  35-D4). **Volume and weight** go through `GRAMS_PER_CUP` (flour 120,
  granulated sugar 200, brown sugar 213, powdered sugar 120, butter 227,
  rice 185, rolled oats 90, semisweet chips 170): every volume and weight
  part becomes grams, and the sum is written in the family and unit of the
  largest share, `estimated: true`, shown "≈ 3 cups". With no density the
  amount stays "1 cup + 120 g", as an unmerged row shows it. `reason`:
  "Both are all-purpose flour", "All 3 are all-purpose flour".
  - **Da3-1 (amends):** `line` was added to the shape — the after line as
    the list would write it ("3 cups all-purpose flour", "5 cloves garlic",
    "4 eggs"), so every surface says the same words and none re-implements
    the plural and count rules.
- **Da4 — Decisions.**
  `{id, keys[], status: "merged" | "apart", name?, amount?: {text, ids[]}, note?, decidedAt}`.
  - **Merged** is a rule, like `aisleOverrides`: a later list with the same
    names merges too.
  - **Da4-1 (amends):** a merged decision applies only while **two or more**
    of its names are on the list (`activeMerges`). One name alone reads as
    that row, unrenamed — "1 cup white flour" on its own is not relabelled
    "all-purpose flour".
  - **Apart**: the proposal never shows again for those keys.
  - **Da4-2 (amends): "those keys" means the proposal's whole key set is
    inside an apart decision's.** A new name joining (unbleached flour
    beside the two kept apart) changes the question, so the three are
    proposed again; Keep apart then stores the wider set and deletes the
    narrower apart decision.
  - **Da4-3 (amends): a merged row plus a new name.** A merged decision's
    rows count as one row to the finder. A third name in the set proposes
    the three together; Merge stores the wider decision and deletes the old
    one in the same commit (a merge sharing a name is absorbed). Keeping
    the wider set apart leaves the narrower merge as it is.
  - **Edited name**: the merged row's label, shown as typed (never made
    plural).
  - **Edited amount**: held while the merged row covers exactly the same
    item ids (the row's `ids`, `OR:` lines included). The server computes
    the ids — it builds the view with the new decision and takes the merged
    row's — so neither the page nor the CLI sends them. When the items
    change, the row shows the computed sum and says "your amount was for the
    old list".
  - `note` is stored only (≤ 2000 characters); nothing in 49a reads it.
- **Da5 — The view.** `buildShoppingView(items, settings, inventory,
staples, merges)` keys a merged decision's rows `merge:<id>`: one row with
  the decision's (or the set's) name, the summed or overridden amount, every
  item's id and source, and `row.merge = {id, keys, from[], estimated?,
amountEdited?, amountStale?, named?}`. The page shows **"merged from: 2
  cups all-purpose flour (Buttermilk Pancakes) · 1 cup white flour
  (Crêpes)"** and **Split** (at home; the row menu's "Split into its names"
  in both modes). Ticking, `need`, stores and aisles act on it as on any
  row.
  - **Da5-1 (the choice the brief asked to record): aisle and store route
    by the merged name's key** (`shoppingNameOf(label).key`), and the row's
    `nameKey` is that key — so the row menu's "Aisle (for every
    all-purpose flour)" writes one override that covers the merged row
    whichever of its names a later list brings. The on-hand check reads the
    merged name too.
  - **Da5-2:** the seat's name ticks follow merges (Dd12's "the seat folds
    as the view does"): `shopping check "all-purpose flour"` or `"white
flour"` ticks every item of the merged row.
- **Da6 — The UI** (Plan mode, the 42g panels). **"Same thing, different
  names"** sits in the left column under Add (so a phone's Plan shows it
  too): each proposal's lines with their recipes, "→ 3 cups all-purpose
  flour", the reason, and Merge / Edit / Keep apart. Edit opens a Name and
  an Amount field in place; its Merge sends only what was changed, so an
  untouched amount stays the computed sum (and follows the list). An answer
  says what it did in a status line and moves focus to the panel's
  heading. In Shop, merged rows are simply one row, and open proposals are
  one quiet line, "1 line looks like another under a different name.
  Review in Plan". 49b's "Note for the model" is **omitted** (a comment
  marks its slot in the Edit form), not shipped disabled.
- **Da7 — The surfaces.** `GET /api/shopping` (and `readShoppingView`)
  also answers `merges` and `proposals`; `POST /api/shopping/merges`
  (`{id | keys, status, name?, amount?, note?}`) and `DELETE
/api/shopping/merges?id=` (Split). CLI: `shopping merges`, `shopping
merge <id> [--name] [--amount] [--note]`, `shopping keep-apart <id>
[--note]`, `shopping split <id>`, all with `--json`. MCP: `shopping_get`
  returns `proposals` and `merges` and only reads; **no new MCP write tool**
  (the 59 / 45 counts and the skill's pre-approval list are unchanged).
- **Da8 — When the finder runs.** In the browser beside
  `buildShoppingView` (pure; a hundred lines is well under a millisecond),
  and in the seat for the API, CLI and MCP reads. **No new switch:**
  proposals show when the `merge` switch is on, and with it off there are no
  merged rows to propose or apply.

### Results

**What changed.**

- `common/util/shoppingMerges.ts` (new): the decision type, `mergeIdOf`,
  `parseShoppingMerge` / `canonicalShoppingMerge`, `activeMerges`, the
  curated `SHOPPING_EQUIVALENTS`, `GRAMS_PER_CUP` and
  `consolidateAmounts` (the density sum).
- `common/util/shoppingConsolidate.ts` (new): `findShoppingProposals`.
- `common/util/shoppingView.ts`: `buildShoppingView` takes `merges`;
  `row.merge`; a merged row's label, amount (≈, override, stale), routing
  and name key. `lineFor`, `quantityFor`, `factorOf`, `sourceOf` and
  `isNamed` exported for the finder. Rows without a decision are
  byte-identical (the existing `shoppingView` suite passes unchanged).
- `common/util/ingredientAmount.ts`: `unitSize` exported (a unit's size in
  its family's base unit), for the density sum.
- The seat (`editor/controller/curation/shopping.ts`):
  `readShoppingMerges`, `decideShoppingMerge`, `splitShoppingMerge` (each
  one write-lock scope, one commit, none when nothing changes); `readShopping`
  and `readShoppingView` answer `merges` and `proposals`; name ticks follow
  merges; `applyItems` generalised to `applyFiles` (same partial-commit and
  restore rules). Schemas `ShoppingMergeSchema` / `ShoppingSplitSchema`.
  Commit subjects: "Update shopping list: merge all purpose flour + white
  flour → King Arthur flour", "… keep apart …", "… split …", "… ask again
  about …" (splitting an apart decision).
- The page: `MergeProposals.tsx` (the panel and Shop's line), the row's
  "merged from" and Split, the stale-amount note, `useShoppingList`'s
  `merges`, `decideMerge`, `splitMerge`; server actions
  `decideShoppingListMerge` / `splitShoppingListMerge`. Surfaces without
  the actions (the recipe and plan pages' add buttons) show no proposals.
- HTTP `api/shopping/merges/route.ts`; CLI `merges`, `merge`, `keep-apart`,
  `split` and their `--help` lines; MCP `shopping_get`'s description and
  answer.
- The boundary test also refuses `shopping/merges` under `common/` and
  `export/`.

**The grounding run.** `measure-ingredient-dupes.ts`, read-only, on a
scratch clone of `/home/roger/Projects/recipe-content` (cloned to
`tmp/49/49a/content-clone`, deleted after): 1,003 recipes, 10,214 lines,
2,078 distinct names, 148 near-duplicate groups. The table's sets came from
its groups and a key check of each candidate line through
`shoppingNameOf`; `editor/content` was never read.

**specVersions.** Neither `shoppingView.ts` nor `ingredientNames.ts` is a
spec'd module; nothing is stored by name, so no reindex.

**Tests.**

- `test/shoppingConsolidate.test.ts` (new, 27): the table's keys and
  exclusions; `mergeIdOf` and the lenient parse; `consolidateAmounts`; the
  finder — Roger's example, cups + grams → ≈, scale, bread flour never,
  one-name rows, garlic cloves, apart suppression and re-asking, a merged
  row plus a third name, ticked and merge-off, ordering; the view — one row
  with both rows' ids and sources, the rule on a later list, one name alone,
  an edited name, an edited amount held then stale, ≈ and a partly ticked
  row, an edited amount on a partly ticked row, quantities off, routing
  by the merged name, merge off and apart.
- `test/shopping.test.ts`: eight seat cases (write, read and split, one
  commit each and the file shape; edited name and amount with server-side
  ids; the same answer twice commits once; keep apart then split; a wider
  merge absorbing the old file in one commit; a growing merge keeping its
  name and note; name ticks; refusals), and
  the boundary extended.
- `test/cliJson.test.ts`: `shopping --json` answers `merges` and
  `proposals`; a new case runs `shopping merges` (JSON and text), `merge
--name`, `split`, `keep-apart` and an unknown id (`not_found`).
- Playwright `shopping-merge.spec.ts` (new): the proposal with its lines
  and recipes, Merge → one row with "merged from" (commit, status line,
  focus on the heading, held after a reload), Split → two rows and the
  proposal back, with Split announced and focus on the first restored row;
  Edit → name and amount, then a third flour line → the sum
  and "your amount was for the old list"; Keep apart hidden after a reload;
  axe (WCAG 2.2 AA) on the panel in Edit and on a merged row; a `@visual`
  baseline of the panel; `@mobile`: Shop's quiet line → Plan → Merge →
  Shop shows one row and no sideways scroll.

**Review** (a read-only agent, before the gates; no blockers). Six
findings, all fixed in `fac198da`:

1. A merge that grew (a third name joining) dropped the absorbed merge's
   edited name and note. Merge now carries them, and the proposal shows that
   name.
2. A partly ticked row with an edited amount showed the computed remainder
   in its label beside the override. The override now stands, and the note
   says "1 of 2 ticked".
3. Split unmounted the pressed button, so focus fell to `<body>`. Split now
   says what it did in a status line and puts focus on the first restored
   row.
4. Every "Keep apart" had the same accessible name. It now names its
   proposal.
5. Proposals showed amounts with the `quantities` switch off. They now
   follow the switch.
6. A refused answer left a stale proposal. A refusal now reads the list
   again.

**Gates** (Docker, production build unless
said):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit`: clean.
- `pnpm exec vitest run`: 195 files, 4,276 tests. Two runs under a load
  average of 17–24 each timed out one or two 5 s cases in files 49a does
  not touch (`urlGuard.test.ts`'s source sweep, `editFormRoundTrip.test.tsx`'s
  typed-label case); both files pass alone (43/43). Every shopping, CLI and
  consolidation case passed in both runs.
- Playwright, `shopping.spec`, `shopping-modes.spec`, `shopping-merge.spec`,
  `accessibility.spec`, `visual.spec`: 131 passed and 1 failed (the new
  split-focus assertion named the row "all-purpose" where the list says
  "all purpose"). Fixed, then `shopping-merge.spec` again: 6/6. Dev mode
  (`next dev`), `shopping-merge.spec`: 6/6.
- **Baselines:** one new, `shopping-merge.spec.ts/shopping-merge-proposal-e2e.png`
  (the panel with Roger's flour), drawn in Docker and opened. No existing
  baseline moved: the fixture's lists hold no pair the table proposes.

### Roger to confirm

1. **Left out of the table, as judgement calls** — say which to add:
   salted / unsalted / plain butter; kosher / table / sea / plain salt;
   light / dark brown sugar and brown sugar (46g kept them apart for Make;
   the list could still propose them); vegetable / canola / neutral oil;
   olive / extra virgin olive oil; a bare "chocolate chips" beside
   semisweet; rice / long-grain rice; cornmeal / yellow cornmeal; canned /
   carton coconut milk.
2. **Bare "flour" is in the all-purpose set** (US recipes mean it so); a
   bread recipe's bare "flour" would be proposed with all-purpose too, and
   Keep apart answers it.
3. **No MCP write tool in 49a** (Da7): the curator can read proposals but
   not merge. A `shopping_merge` tool would make 60 tools / 46 pre-approved
   (or held back) and change the skill's list — 49b, or never?
4. **Da4-1:** a merged decision with only one of its names on the list
   leaves that row as it reads (not renamed to the merged name).
5. **Da4-2:** Keep apart hides a proposal until a new name joins the set;
   then the wider set is asked again.
6. **Da5-1:** a merged row's aisle and store follow the merged name
   ("all-purpose flour"), so one override covers it.
7. **The densities** (`GRAMS_PER_CUP`): King Arthur's chart, rounded; brown
   sugar packed. Rice 185 g is uncooked white rice.

### Left for 49b

- The **note for the model**: `note` is stored and validated already
  (`ShoppingMergeSchema`, ≤ 2000 characters, the CLI's `--note`); the Edit
  form has a marked slot for the field.
- **"Look for more with the model"**: a model returns `ShoppingProposal`s
  (Da3's shape, `line` included); `decideShoppingMerge` takes `{keys}` as
  well as `{id}`, so a model's proposal needs no table row to be merged, and
  `activeMerges` / `row.merge` apply to any keys. AI-made proposals need
  48b's marking and approval before Save (they are proposals already: only
  Merge writes).
- An MCP write tool, if Roger wants one (Roger to confirm 3).

### Traps

- **Ta1 — a merged row's amount override is checked against `row.ids`,
  `OR:` lines included.** The seat computes the ids from the view it would
  show; compare like with like if either side changes.
- **Ta2 — the CLI JSON case inherits the case above it.** The shopping
  case before it switches aisles off and never back, so the merge case
  matches the text without an aisle heading.

## 49b — A note for the model, and "look for more" (M)

Roger's ask, the part 49a left: "Propositions should be visible in the ui
and editable either directly or by attaching a note for ai follow ups." 49a
made them visible and editable; 49b adds the note for the model and a model
that looks for more, on 47i's pattern (one structured call, checked, marked,
applied only when Roger says so).

### Decisions

- **Db1 — A note, per proposal and per merged row.** A proposal's Edit has
  a "Note for the model" field and **Ask the model**; a merged row's menu
  has **Ask the model about this** (Plan only: in Shop the row is one line
  like any other), which opens the note at the top of the panel with the
  row's "merged from". The ask is a `shopping-merge` job (`task:
"revise"`): each row's name, amount and lines with their recipes, the
  list's line for them now, and the note. The model answers a verdict:
  `merge` (two or more of the rows **by number**, a name, an amount or ""
  for the list's own sum, `estimated`, a reason) or `apart` (a reason).
  - **Db1-1: rows by number, not by key.** The model names "1, 2", never a
    name key it could misspell; a number outside the rows is the
    "invented item" the check refuses. The keys are the asked rows'.
  - **Db1-2: the check is all or nothing** (47i's Di6): an unknown number,
    fewer than two rows, an empty or over-long name, an amount
    `ingredientAmount` reads no number in ("plenty", "some"), or a verdict
    that is neither refuses the answer and says why, in the panel and the
    CLI. With quantities off the model's amount is ignored.
  - **Db1-3: the suggestion is 49a's shape, built by the list.** The model
    gives the grouping, the name and maybe an amount; `proposalForKeys`
    (new, `shoppingConsolidate.ts`) builds the proposal from the list's
    own view with that decision — its rows, its line ("≈ 360 g all-purpose
    flour"), its sum when the model left the amount empty or said the sum
    again. A model amount with `estimated` reads "≈ …".
  - **Db1-4: Accept sends exactly what the job worked out** (`decision`,
    the seat's merge input): the keys, a name only when it is new (the
    list's own name typed again — "all purpose flour" for "all-purpose
    flour", case, spaces and hyphens aside — is none; compared as text, not
    by name key, since "plain flour" keys as all-purpose flour and Roger's
    "call it plain flour" wants the label), an amount only when it is the
    model's, and the note. A merged row's answer always sends its name.
    The note is stored with the decision only on Accept — or on an edited
    Merge, where the person typed it. Discard writes nothing.
  - **Db1-5: `replaces` (new in `ShoppingMergeSchema`).** A merged row the
    model narrows ("only these two") would be absorbed back into the old
    merge by Da4-3's rule. The accepted decision names the merge it
    replaces, which the seat drops first and deletes in the same commit.
    Keeping a merged row apart needs none: the same names are the same id,
    and the apart decision is written over it (one commit, "keep apart …").
- **Db2 — "Look for more with the model".** A button at the foot of the
  panel (shown with a model, merge on and two or more lines to buy). The
  job (`task: "find"`) sends the names still to buy, numbered, with their
  amounts where one was read — no recipes, no lines, condensed for qwen —
  and leaves out every name in a merged row or in an open table proposal
  (and ticked lines). Pairs already kept apart stay in, with one line
  "Kept apart already (do not group again): 3+4". The answer is groups of
  numbers with a name and a reason.
  - **Db2-1: the find check drops, group by group**, each with a line under
    "Left out by the check": an unknown number, a number already in an
    earlier group, a group under two names or with no name, and a set
    already kept apart, merged, or proposed by the table.
  - **Db2-2: a found proposal's amount is the list's sum**, never the
    model's (it is not asked for one): grouping and naming are its
    judgement, arithmetic is `addAmounts`'.
  - **Db2-3: derived, in the job's result only.** Found proposals show in
    the panel under the table's, each marked "Suggested by <model>", with
    Merge (`{keys, name?}`), Edit (name, amount, note, Ask) and Keep apart.
    They leave as they are answered, or when a decision since covers them
    (`stillOpen`); a new "Look for more" replaces them. Nothing is stored
    until Roger acts.
- **Db3 — The surfaces.** Server actions `startShoppingAsk` /
  `shoppingAskResultAction` (`controller/actions/shoppingAsk.ts`; the
  latter the 38-Tb5 long-poll for a job with no record). HTTP `POST
/api/shopping/merges/ask {task, id | keys, note, claude?, wait?}` — 202
  `{job, stored}`, or the result with `wait` — and `GET …?job=<id>`
  (`{job, status, live, result?, error?}`), read scope. CLI `shopping ask
<id> --note "…" [--claude] [--wait]` and `shopping find-merges
[--claude] [--wait]`, `--json` too; each prints the suggestion and the
  merge input Accept would send, and writes nothing.
  - **Db3-1: a local CLI run always waits**: the job lives in the CLI's
    process, so it runs to its end there; `--wait` matters with
    `--remote`, where without it the job's id is printed.
  - **Db3-2: no MCP tool** (as 49a's Da7 and 47i): `shopping_get` still
    reads proposals and merges; 59 tools / 45 pre-approved, unchanged.
- **Db4 — The model's limits.** Edit with AI's choice (`editModelFor`):
  the local model by default (`RECIPE_LLM_EDIT_MODEL`, else
  `RECIPE_LLM_MODEL`, thinking unless `RECIPE_LLM_EDIT_THINK=0`), the
  Claude API where it is the only model (the Pi) or when asked (`--claude`,
  "Try with Claude" beside a refused or failed answer). One structured
  call, no tools, the list as data and the note as the ask (a prompt line
  says the rows are never instructions). A Claude call is held to the
  curator's cost budget first; a local one to its context. A local job
  takes the GPU's line, a Claude one none.
