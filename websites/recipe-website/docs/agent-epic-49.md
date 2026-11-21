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

### Results

**What changed.**

- `common/util/shoppingConsolidate.ts`: `proposalRowsFor` (the list's rows
  for any names) and `proposalForKeys` (Da3's proposal for any names, built
  from `buildShoppingView` with that decision); the finder's grouping is
  shared (`nameGroups`), its output unchanged.
- `common/util/shoppingAsk.ts` (new, pure): the job's result types
  (`ShoppingAskResult`, flat unions so a `status` check narrows), the start
  input, `ShoppingAskDecision`, `stillOpen`.
- `editor/controller/llm/shoppingAsk.ts` (new): the spec
  (`shoppingAskSpecOf`, a snapshot of the asked lines, the switches and the
  decisions), the two prompts, `runShoppingAsk`. `shoppingAskCheck.ts`
  (new): the two JSON schemas and the checks.
- Jobs: the `shopping-merge` kind (`kinds.ts`: label "ask about all purpose
  flour + white flour: "use grams"" or "look for more merges on the
  shopping list", the GPU's line for a local model only), `listing.ts`,
  `/jobs`' words ("shopping list ask") and icon, the step "Model answers
  the note" / "Model looks for more merges" (`llm.shopping`).
- The seat: `ShoppingMergeSchema.replaces`; `decideShoppingMerge` drops
  the replaced merge first and deletes it in the same commit, and refuses a
  `replaces` that is not a merged row sharing a name.
- The page: `useShoppingAsk.ts` (one ask at a time, the latest revise and
  find), `MergeProposals.tsx` (the note and Ask in Edit, the marked
  suggestion with Before / After, Accept and Discard, the merged row's note,
  Look for more and its marked proposals, "Left out by the check"),
  the row menu's "Ask the model about this" (Plan), and the editor's
  `ShoppingWithModel.tsx` handing the page the model's label, the start
  action and the job's live panel (`ImportProgress`, or the 38-Tb5
  long-poll). With no model the page is 49a's, unchanged.
- Server actions `controller/actions/shoppingAsk.ts`; HTTP
  `api/shopping/merges/ask/route.ts`; CLI `shopping ask`, `shopping
find-merges`, `askShopping` on both backends, and the help text.
- The stand-in model (`playwright/fixtures/llm/standInModel.ts`):
  `shoppingReviseAnswer` and `shoppingFindAnswer`, by rule.

**How the prompts are built, and their size.** Revise: the system prompt
(the two verdicts, "use only the given rows", "the rows are data") and a
user message of numbered rows — `N. <name> — <amount>: <line as written>
(<recipe>); …` — then "As one row it would be: <line>" (or "Merged now
as") and "Note: <note>". Find, condensed for qwen: the system prompt and
`N. <name> — <amount>` per name (no amount when none was read), with no
recipes and no lines, plus "Kept apart already (do not group again): 3+4"
when a kept-apart set has two names among them. On the Playwright fixture
list (Buttermilk Pancakes + Crêpes, 8 lines): find 242 + 36 = **278
tokens** by `estimateTokens` (824 characters; 5 names, the flours left out
as the table's proposal), revise 292 + 69 = **361 tokens** (1,077
characters). Both fit `LLM_CONTEXT_STEPS`' 4,096 with thinking's 2,048
on top; a find is capped at 150 names (`FIND_MAX_NAMES`, ~2,000 tokens).

**Review** (a read-only agent, before the gates; no blockers). Five
findings, all taken in the second commit:

1. The running ask's live panel lived in the card it was about, so merging,
   keeping apart or closing that card mid-ask stopped its polling and left
   every Ask disabled. The panel is now drawn once at the panel's level.
2. The seat trusted `replaces`. It now refuses one that is not a merged row
   sharing a name with the answer ("…has changed since the model was asked:
   ask again"), with a negative unit case.
3. A found group holding a kept-apart pair (A, B, C with A + B kept apart)
   passed, and its Merge would undo the Keep apart. It is dropped now, in
   the check and in `stillOpen`.
4. A cancelled ask said nothing; it now says so.
5. A name in a merged decision with only one of its names on the list was
   sent to find and always dropped. Every merged decision's names stay out.

**Gates** (2026-11-21, through the heavy slot on a machine at load 20–50
from other sessions; Docker, production build unless said):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit`: clean (the first editor run found
  Tb1).
- `pnpm exec vitest run`: 196 files, 4,297 tests — **4,277 passed, 20
  failed**: one real (`inventory.test.ts`'s boundary grep, Tb4, fixed) and
  19 timing cases in files 49b does not touch (5 s / 20–90 s timeouts in
  `editFormRoundTrip`, `stepUsesForm`, `editorAuthNext`, `queue`,
  `urlGuard`'s source sweep, `makePatterns`' 200 ms bound, and `cliJson`
  cases after a timed-out one). Those nine files again, alone: 225 of 228,
  the three left the same timing cases (`urlGuard` 5.03 s, `makePatterns`
  851 ms, one `editFormRoundTrip`). New: `shoppingAsk.test.ts` (19 cases:
  `proposalForKeys`, the revise check — unknown items, an amount it can't
  read, an empty name, "apart", a narrowed merge's `replaces` — the find
  check's drops, the spec and both prompts with nothing decided sent, the
  job with `fetch` stubbed, its label and resources) and two seat cases in
  `shopping.test.ts` (`replaces` in one commit; a stale or made-up one
  refused).
- Playwright, `shopping-ask.spec` (new), `shopping-merge.spec`,
  `shopping.spec`, `shopping-modes.spec`, `edit-with-ai.spec`,
  `accessibility.spec`, `visual.spec`, e2e + mobile: **140/140**, first
  run, none retried.
- **Baselines: none moved, none new.** With the model pinned off (the
  suite's T18) the page draws nothing 49b adds.
- No dependency or Next-config change, so no main-checkout-shaped build.

**What a real check should try** (no model was run here): on the
workstation, a list with Buttermilk Pancakes and a crêpe recipe — a note
"use grams" on the flour proposal, "these are different, one is salted"
on a butter pair, "call it plain flour"; a merged row's "Ask the model
about this"; and "Look for more" on a real week's list (20–40 names),
judging each suggestion and timing qwen3:8b thinking. The same on the Pi
(Claude), with its cost per ask.

### Traps

- **Tb1 — narrowing needs flat unions.** The result type was first written
  as `Numbers & ({task: "revise"} & (A | B | C))`, and a `status` check did
  not narrow it (`decision` "does not exist"); a member whose status is
  `"refused" | "failed"` is not removed by `status !== "refused"` either.
  The result is a flat union now, refused and failed as members of their
  own.
- **Tb2 — "plain flour" keys as all-purpose flour.** Comparing the model's
  name to the list's by name key threw away Roger's own example ("call it
  plain flour"); names are compared as text (Db1-4).
- **Tb3 — a job's panel inside the card it is about** stops polling when
  the card goes (merged, kept apart, closed) and the ask never settles: one
  panel for the whole "Same thing, different names" (review 1).
- **Tb4 — the inventory boundary test greps common/ for "on-hand".** A
  comment in `shoppingConsolidate.ts` saying "the on-hand fold" failed it;
  it says "probably-at-home" now.
- **Tb5 — the stand-in answers at once**, so no spec presses Keep apart
  while an ask runs (review 1's suggested case); the unit of that fix is
  the panel drawn at the panel's level, seen by every spec here.

### Roger to confirm

1. **The model's note answer is applied only on Accept**, with the note
   stored in the decision then (and on an edited Merge, where you typed it);
   Discard writes nothing (Db1-4).
2. **Rows by number** in the model's answer, refused whole if one is not a
   row asked about (Db1-1, Db1-2).
3. **"Look for more" proposals use the list's sum**, never the model's
   arithmetic, and live only in the job's result until you act (Db2-2,
   Db2-3).
4. **"Ask the model about this" on a merged row is Plan only**, opening
   the note at the top of the panel (Db1).
5. **A local CLI run always waits** for the model; `--wait` follows a
   remote job (Db3-1).
6. **No MCP tool** for asks or merges (Db3-2), as 49a's Roger to confirm 3.
7. **The same model as Edit with AI**, thinking first on the local model
   (~20 s an ask measured in 47i); `RECIPE_LLM_EDIT_THINK=0` speeds both up
   (Db4).
8. **A merged row whose decision names a line no longer on the list**:
   the model sees only the rows on the list, so a "merge all" answer is a
   narrower decision that replaces the old one (`replaces`) and drops the
   absent name from it (the review's third nit).
9. The words: "Note for the model", "Ask the model", "Ask the model about
   this", "Suggested by <model>", "Before", "After", "Accept", "Discard",
   "Split this row and keep its names apart", "Keep these apart", "Look for
   more with the model", "Left out by the check", "<Model> found nothing
   more to merge in N names", "Try with Claude".

## 49c — Model answers worth trusting (M)

49b's real check (the orchestrator, 2026-11-21, qwen3:8b 100 % on the
workstation's GPU, a scratch clone of the content repo with six recipes and
the pumpkin bars on its list) was not good enough to give Roger: "use grams"
took 149 s and answered "≈ 990.75 g" (the model's own sum, wrong, and not
marked estimated) after overflowing its 4,096-token context; "Look for more"
timed out at 180 s thinking, and without thinking answered nonsense the
check let through (baking powder + soda as "leavening agents", olive oil +
butter as "oil", salt + kosher salt, salted + unsalted butter, groups of 6,
8 and 14 unrelated names).

### Decisions

- **Dc1 — The model names the unit, the code does the arithmetic.** The
  revise schema is `{verdict, items, name, unit, reason}`: `unit` is one of
  `ASKABLE_UNITS` (g, kg, oz, lb, ml, l, cup, tbsp, tsp — an enum in the
  JSON schema, so Ollama's grammar and Claude's structured output hold the
  model to it) or `""` for the list's own; `name` may be `""` for the
  list's own name (Db1-2's "empty name" refusal is gone). There is no
  `amount` and no `estimated`.
  - `mergedAmountInUnit` (`shoppingConsolidate.ts`) adds the names' lines
    as the merged row does (scaled, a counted name's container), and
    `amountInUnit` (`shoppingMerges.ts`) converts: US and metric of one kind
    exactly, a volume and a weight through 49a's `GRAMS_PER_CUP` (the
    curated set's density, else the row's name's, else one every name
    shares). A density sets `estimated`, shown "≈".
  - **Rounding** (`roundMetric`): whole grams or millilitres under 20, the
    nearest 5 under 100, the nearest 10 under 1,000, then tenths of a kilo
    or litre — "≈ 890 g", never "≈ 990.75 g". A US unit is written in that
    very unit, to the eighth ("use ounces" on 2 lb → "32 oz", "lb" for
    360 g → "≈ ¾ lb", "tbsp" on ¾ cup → "12 tbsp").
  - The converted amount travels as Db1-4's `amount` (`decision.amount`, an
    edited amount held while the row's lines are the same — Da4), **with
    `amountFor`, the item ids it was worked out for** (`mergedRowIds`: the
    merged row's ids, `OR:` lines included, as Ta1). The seat stores those
    ids rather than the row's at Accept (review 3), so a line added between
    the ask and Accept shows the list's sum and "your amount was for the
    old list". A unit the list says already (every part in exactly that
    unit; for grams, any metric weight) is no amount of its own.
  - **A number the model gives anyway is ignored and said in the job log**
    (`ignored: …` info lines and the step's `ignored`): an `amount` field
    (a non-strict answer), an amount in front of the name ("990 g
    all-purpose flour" → "all-purpose flour"; "00 flour" has no unit after
    its number and stays whole), or a number in the unit ("890 g" → g).
  - **Can't convert, plainly** (`cannotConvert` on the refused result): a
    count or a container asked into a weight or volume — "The list can't
    give garlic in grams: 6 cloves is a count, not a weight or a volume" —
    or a volume and a weight with no density on file ("…it has no weight
    for a cup of walnut on file, so 1½ cups can't be converted"). The panel
    and the CLI say the sentence alone, with no "answer was not used" and
    no "Try with Claude" (no model would change it), and the job's step is
    not marked failed. An unknown unit ("pinch") is an ordinary refusal.
- **Dc2 — Context with thinking.** A revise's `num_ctx` is the smallest of
  40a's steps holding its prompt, its answer (256) and
  `SHOPPING_THINK_TOKENS` = 4,096 (was Edit's 2,048): 49b's real ask used
  458 + 4,754 tokens. 40a's rules kept: the fixed steps (4,096 / 8,192 /
  12,288), the 3-characters-a-token estimate, the 95 % warning. A revise now
  asks 8,192 (6.2 GB, 100 % on the GPU in every run below; 40a measured the
  same). `shoppingAskContext` is the one computation, and a unit test holds
  the requested `num_ctx` to prompt + answer + thinking (and to the real
  5,212).
  - **Edit with AI has the same arithmetic** (`askEdit.ts`: prompt +
    the recipe again + 256 + `EDIT_THINK_TOKENS` 2,048) **and is left as it
    is.** 47i's ten real requests fit it: 11,668 tokens out thinking against
    3,162 not, so ~850 of thinking a request, the longest (70 s at ~33
    tokens/s) ~2,200 tokens with its answer, against a context that left
    ≥ 2,048 for it. A larger budget would move recipes whose prompt and
    answer are 4–6 k tokens from 8,192 to 12,288, which 40a measured
    spilling 10 % to the CPU. The 40a warning still says it if one
    overflows; a unit test now pins Edit's `num_ctx` to prompt + recipe +
    256 + 2,048. `EDIT_TIMEOUT_MS` is unchanged (Roger to confirm 4).
- **Dc3 — A stricter "Look for more".**
  - **The prompt** asks for "the same product, one a shopper buys
    interchangeably under either name", pairs or groups of at most 3, the
    name one of the group's own; lists the NOT-same examples (bread and
    all-purpose flour — 49b's, kept — baking powder
    and soda, butter and an oil, salted and unsalted butter, kosher and
    table or sea salt, brown and white sugar, powdered and coarse sugar, a
    spice and a blend with it in, olive and extra virgin olive oil); and
    forbids category names.
  - **The check**, after 49b's drops, refuses a group: over 3 names
    (`FIND_GROUP_MAX`); with a known-different pair; with two names where
    neither is the other with words added in front — "buttermilk" and "low
    fat buttermilk", "kosher salt" and "coarse kosher salt", "bell pepper"
    and "red bell pepper" pass, and "jalapeno" and "jalapeno pepper" once a
    trailing "pepper" or "cheese" is set aside; a bare word that names
    different things (32j's `CLOSE_HEAD_EXCLUDED`: salt, pepper, bean…) is
    not enough alone, but two names one kind of the known-different list
    holds together pass ("salt" and "table salt"); "heavy cream" and "sour
    cream", "chicken broth" and "beef broth", "baking powder" and "baking
    soda" do not (the review tightened a first rule — a shared word and one
    name's last word in the other — that let those through); named with a
    category word that none of its rows has (`CATEGORY_WORDS`: spice,
    seasoning, ingredient, leavening, agent, fat, herb, dish, recipe…); or
    named with no row's own name (the name's key is a row's, or holds every
    word of one). A number in front of a group's name ("2 cups buttermilk")
    is set aside and logged, as a revise's is. 43n's synonyms (scallions and
    green onions) fold such names into one row before the list ever
    reaches the model, so they need no rule here.
  - **The known-different list** (`SHOPPING_KNOWN_DIFFERENT`, beside 49a's
    table in `shoppingMerges.ts`): kinds of one thing, two names in
    different kinds known different — leavening (baking powder · soda ·
    yeast · cream of tartar), salted · unsalted butter, a fat · an oil
    (`*oil`), salts (table · kosher · sea · flaky finishing · seasoned),
    sugars (white ·
    superfine · brown · powdered · coarse), olive · extra virgin olive oil,
    oils (vegetable · canola · olive · coconut · sesame · avocado ·
    peanut), a spice · a blend (`*spice`, `*seasoning`, garam masala…),
    fresh · ground ginger, garlic · garlic powder, onion · onion powder, and
    after the review flours (all-purpose — 49a's set — · bread · cake and
    pastry · whole wheat · almond · self-rising · rye), oats (rolled · quick
    · steel-cut), milks (milk · buttermilk · coconut · almond · oat · soy ·
    evaporated · condensed), creams (cream · sour · cream cheese · ice
    cream · crème fraîche), broths (chicken · beef · vegetable) and
    vinegars (white · red wine · white wine · cider · balsamic · rice ·
    sherry). The
    table's finder skips any set holding such a pair, and a unit test holds
    every `SHOPPING_EQUIVALENTS` set free of one, so both read one list.
- **Dc4 — Think or not, and the timeout.**
  - **"Look for more" never thinks** (`shoppingAskThinks`), whatever
    `RECIPE_LLM_EDIT_THINK` says: thinking over 54 names ran past 180 s,
    and the stricter prompt and check do the work — 13–15 s, and every
    group the model offered was a nonsense one the check left out.
  - **It asks in chunks** of at most `FIND_CHUNK_NAMES` = 40 names, even
    (54 → 27 + 27), the names sorted by their last word so "flour" and
    "white flour" share a call. A chunk keeps the whole list's numbers, so
    nothing is renumbered; a number a chunk was not shown is refused as
    unknown. One step per call (`llm.shopping`, `call`/`of`/`names`), the
    numbers added up.
  - **An ask keeps thinking**, as Edit with AI (`RECIPE_LLM_EDIT_THINK=0`
    turns both off). Both modes answered all four asks right; thinking cost
    ~7 s more (15–19 s against 8–9 s, a cold load of ~7.7 s in each), and
    with the arithmetic gone it thinks ~350 tokens, not 4,500. The one
    long one (48 s, 1,471 tokens) was garlic "use grams", which it should
    have said no to quickly; it still answered the right thing.
  - `EDIT_TIMEOUT_MS` (180 s) is unchanged for both.

### Results

**What changed.**

- `common/util/shoppingMerges.ts`: `ASKABLE_UNITS`, `amountInUnit`,
  `roundMetric`; `SHOPPING_KNOWN_DIFFERENT`, `knownDifferent`,
  `knownDifferentPair`, `knownSameKind`.
- `common/util/shoppingConsolidate.ts`: `mergedAmountInUnit`,
  `mergedRowIds`; the finder skips a set with a known-different pair.
- The seat: `ShoppingMergeSchema.amountFor` (with an `amount` only), stored
  as the amount's ids when given; `ShoppingAskDecision.amountFor`.
- `common/util/shoppingAsk.ts`: the merge result's `amountFromModel` is now
  `unit` (the unit the list converted into); a refused revise may carry
  `cannotConvert`.
- `editor/controller/llm/shoppingAskCheck.ts`: the revise schema and check
  (Dc1); the find check's Dc3 rules (`FIND_GROUP_MAX`, `CATEGORY_WORDS`).
- `editor/controller/llm/shoppingAsk.ts`: both prompts; `findChunks`,
  `shoppingAskCalls`, `shoppingAskThinks`, `shoppingAskContext`,
  `SHOPPING_THINK_TOKENS`, `FIND_CHUNK_NAMES`; `runShoppingAsk` with a call
  per chunk and the ignored lines in the job log. Find's names are sorted
  by last word.
- `MergeProposals.tsx` and the CLI's `formatAsk`: the plain can't-convert
  sentence.
- The stand-in model answers a unit ("grams" → `g`), never an amount.
- `askEdit.ts` is unchanged.

**The real check** (qwen3:8b on the workstation's RX 6600, 100 % GPU,
nothing else loaded: VRAM under 2 GB and no `parakeet-cli` before every
run, the model unloaded after each, so every time includes a cold load of
~7–8 s). The scratch clone's list (six recipes and the pumpkin bars, 54
names for "Look for more"), `pnpm --silent recipes shopping ask <id>
--note … --wait --json` and `shopping find-merges --wait --json` from the
49c worktree; nothing was written. Before = main at `0511d913` (the first
two rows are the orchestrator's runs; the others ran in this worktree before
any change).

| Ask                                                     | Before                                                                                                                                                                                                                                                                                                                                                                                                                | After, thinking (the default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | After, `RECIPE_LLM_EDIT_THINK=0`        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| "use grams" on 7¼ cups all-purpose flour + 3 tbsp flour | 149 s, 458 + 4,754 tokens of a **4,096** context (overflowed): "≈ 990.75 g all-purpose flour", `estimated: false` — **wrong**                                                                                                                                                                                                                                                                                         | 19.3 s, 479 + 398 tokens at 8,192: unit `g` → the list's **"≈ 900 g all-purpose flour"** (7½ cups at 120 g; the sources sum to 7 cups + 7½ tbsp), estimated — **right**                                                                                                                                                                                                                                                                                                                                                                                                        | 9.2 s, 485 + 53: the same — **right**   |
| "call it plain flour"                                   | 39.6 s, 460 + 1,106: "7½ cups plain flour" — right                                                                                                                                                                                                                                                                                                                                                                    | 15.2 s, 481 + 340: "7½ cups plain flour" — **right**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 8.9 s, 487 + 44: the same — **right**   |
| "these are different" on garlic + garlic cloves         | 18.0 s, 317 + 387: keep apart — right                                                                                                                                                                                                                                                                                                                                                                                 | 16.0 s, 338 + 324: keep apart — **right**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 7.9 s, 344 + 33: keep apart — **right** |
| "use grams" on garlic (6 cloves)                        | —                                                                                                                                                                                                                                                                                                                                                                                                                     | 48.2 s, 1,471 out: unit `g` → "The list can't give garlic in grams: 6 cloves is a count, not a weight or a volume" — **right**                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                       |
| Look for more (54 names)                                | thinking: **timed out at 180 s**; not thinking: 26 s, 10 groups, **all 10 kept** — baking powder + soda "leavening agents", salt + kosher salt "salt", olive oil + butter "oil", cinnamon + pumpkin pie spice "spices", light brown + granulated sugar "sugar", unsalted + salted butter "butter", powdered + coarse sugar, 6 names "spices and seasonings", 8 "ingredients for dishes", 14 "ingredients for recipes" | never thinks, the final prompt and check: **15.3 s**, two calls of 27, 1,132 + 179 tokens; 5 groups, **all 5 left out by the check**: butter + salted + unsalted butter (salted and unsalted are different), apple + wild blueberry, canned corn + cilantro leaf + romaine lettuce, egg + lemon juice + vanilla extract (neither is the other with words in front), kosher salt + salt (different). "Found nothing more" — right: the list has no same-product pair the table does not already propose. (The first rule, before the review: 13.0 s, 3 groups, all 3 left out.) | (the same: find never thinks)           |

A second run of the first rule gave the same three groups in 13.9 s
(temperature 0). "use grams" again with the final code: 18.1 s, 479 +
398, "≈ 900 g all-purpose flour" with `amountFor` the flour lines' 8 ids.

**Tests** (`test/shoppingAsk.test.ts`; never a real model):

- The revise check: "use grams" → the list's ≈ 360 g, `unit: "g"`, ≈ and
  estimated, with `amountFor`; "grams" read as g; pounds → "≈ ¾ lb"; "cup"
  on cups converts nothing; `""` keeps the list's name; a model's amount, an amount in the
  name and a number in the unit each ignored and listed; "00 flour" kept;
  garlic cloves and walnuts (no density) answered `cannotConvert` with the
  sentence; an unknown unit refused; quantities off sets no unit.
- The arithmetic: 7¼ cups + 3 tbsp flour in grams → "890 g", estimated;
  `roundMetric` at 7, 43, 892.5 and 1,234; 2 lb → 910 g exactly and → "32
  oz"; ¾ cup → "12 tbsp"; 2 cups → 475 ml; cups to grams with and without
  a density; a count; nothing.
- The stricter find: every nonsense group of the real check, each with its
  reason; groups of 6 and 8; names neither of which is the other with
  words in front; jalapeño and red bell pepper sharing only "pepper"; a
  category and a stranger for a name; the review's look-alikes (bread +
  all-purpose, cake + plain and whole wheat + plain flour, rolled + quick
  oats, heavy + sour cream, chicken + beef broth, milk + coconut milk, cream
  cheese + cheddar, red + white wine vinegar, tomato + tomato paste, apple
  pie + pumpkin pie spice, fine + flaky sea salt) all left out; buttermilk +
  low-fat buttermilk, jalapeño + jalapeño pepper, bell + red bell pepper,
  salt + table salt and kosher + coarse kosher salt kept; a number in a
  group's name set aside and listed; scallions and green onions one row by
  43n's synonyms; no table set with a known-different pair.
- `test/shopping.test.ts`: the seat stores an ask's `amountFor` as the
  amount's ids, the row then shows its sum, and `amountFor` without an
  `amount` is refused.
- `num_ctx`: a revise's holds prompt + answer + `SHOPPING_THINK_TOKENS`
  (and 458 + 4,754); a find's holds its prompt and groups; a find never
  thinks, a revise follows `RECIPE_LLM_EDIT_THINK`. Chunks: 46 names → two
  calls of 23, numbered as the whole list, sorted by last word, and a
  number from the other chunk refused. `test/editRequest.test.ts`: Edit
  with AI's `num_ctx` holds prompt + recipe + 256 + `EDIT_THINK_TOKENS`.
- Playwright `shopping-ask.spec`: the Crêpes gains "1/2 cup low-fat
  buttermilk"; "use grams" still reads "≈ 360 g all-purpose flour", now
  the list's sum of the stand-in's unit; "Look for more" keeps buttermilk +
  low-fat buttermilk and shows salt + sea salt under "Left out by the check
  (1)" as known different.

**Review** (a read-only agent, before the gates; no blockers). Seven
findings, all taken in the second commit:

1. 49a's own exclusions (bread, cake, whole-wheat flour; quick oats) were
   not on the known-different list, and the prompt had lost 49b's
   bread-flour example. Both added (flours, oats), with tests.
2. The first head rule (a shared word, one name's last word in the other)
   let heavy + sour cream, chicken + beef broth, milk + coconut milk, cream
   cheese + cheddar, red + white wine vinegar, tomato + tomato paste and two
   pie spices through. Now one name must be the other with words in front
   (a trailing pepper or cheese aside), and milks, creams, broths and
   vinegars joined the known-different list.
3. A converted amount could be stale at Accept (a line added between the
   ask and Accept): the decision now carries `amountFor`, and the seat
   holds the amount to those ids.
4. A number in a found group's name passed ("2 cups buttermilk" → "2 cups 2
   cups buttermilk"); it is set aside and logged.
5. Salt + table salt was refused; two names in one kind of the
   known-different list now count as alike. The rule's synonyms clause was
   dead and is gone (43n folds those names first).
6. Flaky sea salt is a finishing salt: its own kind now (Roger to confirm
   3).
7. "use ounces" on pounds, or "tbsp" on cups, changed nothing: a US unit is
   now written in that unit. A can't-convert answer no longer marks the
   job's step failed.

### Traps

- **Tc1 — `ollama stop` does not free VRAM at once.** The before-run check
  read 6 GB for a moment after the model was stopped, and the 2-minute poll
  then cost two minutes; the run script waits 8 s after the stop.
- **Tc2 — a chunk's numbers are the whole list's.** A model answering a
  chunk sees only that chunk's names, so a number from another chunk is
  marked as text (`"30"`) before the check, which refuses it as unknown —
  never as a name it was not shown.
- **Tc3 — the stand-in's find rule pairs "salt" with "sea salt"**, which
  are now known different: the spec's pair is buttermilk and low-fat
  buttermilk, and the salts show the check's left-out line.

### Roger to confirm

1. **The model names a unit, the list converts** (Dc1): a converted amount
   is stored as the merged row's edited amount for the lines it was worked
   out for, so a later list with other lines shows the sum again and "your
   amount was for the old list" (as an edited amount does). Storing the
   unit as a rule on the decision instead would follow the list — a later
   phase, if you want it.
2. **Rounding**: grams to the nearest 5 under 100 and 10 under 1,000; a US
   unit in exactly that unit, to the eighth ("≈ ¾ lb", "32 oz").
3. **The known-different list** — say what to drop or add: vegetable and
   canola oil are known different (49a left them a judgement call), as are
   olive and extra virgin olive oil, kosher and plain salt, flaky and other
   sea salt, every sugar kind, and the review's flours, oats, milks,
   creams, broths and vinegars; light and dark brown sugar, plain and
   unsalted butter, and "neutral oil" beside any oil stay the model's (and
   your) judgement.
4. **Edit with AI's thinking budget stays 2,048** (Dc2): 47i's requests fit
   it; raise it to 4,096 if you see the full-context warning on an edit.
5. **Look for more never thinks**, and asks in chunks of up to 40 names;
   an ask keeps thinking (both right, ~7 s slower).
6. **A note asking for an impossible unit** says so in one sentence, with
   no "Try with Claude".
