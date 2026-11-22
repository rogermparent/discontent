# Epic 50 — The shopping list as layers

> **This is the durable source of truth for epic 50.** Read it before
> touching how `/shopping` composes its rows (`buildShoppingView`'s
> `compose`), `common/util/shoppingLayers.ts`, `shoppingChanges.ts`, the
> layer and rule files under the list's directory, or the `shopping
changes` / `change` / `leave-off` / `restore` CLI. The orchestrator
> updates the roadmap **Status** column and the **Now** line; workers add
> their phase's **Results** and **Traps** under their own headings, with
> decision amendments numbered by phase letter (`Da1`, `Db1`…).
> Background: `agent-epic-35.md` (D1–D9: the list's storage, one file per
> item, D3 "nothing derived is stored", every feature a switch),
> `agent-epic-49.md` (49a's merge decisions and `GRAMS_PER_CUP`, 49b's
> asks, 49c's `amountInUnit` and the known-different list).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded · 📝 proposed.

**Now:** 50a in review.

## Context

Roger, 2026-11-21, after trying 49's "Look for more" on his real list:

> The AI shopping list handler should take a more "human-like" look at the
> list and suggest merges and changes that pare the list down to something
> that's more useful when shopping, including dropping things like "pear
> poaching liquid" from a poached pears recipe because that's not something
> you buy, but something that occurs when making the recipe. […] It should
> be easy to walk through each operation the model suggests, and instead of
> fully changing the list we should keep a sort of layered composition that
> allows us to better take advantage of the context and undo things if
> needed.

And: "being able to save, load, and switch lists would be nice to have a
clean shopping list associated with a meal plan or something."

## Roadmap

| Phase | Branch                      | Size | Status | What                                                                                                                                                                      |
| ----- | --------------------------- | ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50a   | `agent/50a-shopping-layers` | L    | 🟡     | The layer model and its storage; deterministic fixes found on Roger's real list; a minimal UI for layers.                                                                 |
| 50b   | —                           | L    | 📝     | "Tidy with the model": a whole-list pass proposing judgement calls (drop what the recipe makes, use what you're buying, rename, convert, merge), with a structural check. |
| 50c   | —                           | M    | 📝     | The walkthrough: one suggestion at a time — Accept, Skip, Edit, a note to the model — and a Changes panel.                                                                |
| 50d   | —                           | M    | 📝     | Saved lists: save, switch, start a clean list, optionally tied to a meal plan (a group).                                                                                  |

- **50b** sends the composed list's rows (`promptRowsOf`, Da9) and each
  recipe's step text; its checker is loose and structural, and 49c's
  known-different list becomes a warning on the card, not a rejection.
- **50c** writes each accepted suggestion as one layer (`from` names the
  suggestion), so undo is turning it off.
- **50d** moves `SHOPPING_LIST_PATHS` (items, layers) under a directory per
  list; the rules, merges and settings stay every list's.

## 50a — Layers, rules and the list's own mistakes (L)

### Decisions

- **Da1 — Three stages, composed in common.** `buildShoppingView(items,
settings, inventory, staples, merges, compose?)`: **base** (the rows the
  items make — each line parsed, one row per name; "As written") →
  **rules** (49a's merge decisions, then leave-off) → **layers** (this
  list's, in id order). Without `compose` the view is the base plus 49a's
  merges exactly as before, so every internal caller (proposals,
  `mergedRowIds`, the seat's name ticks, a merge's amount ids) and every
  existing test is unchanged; the page, `readShoppingView`, the CLI and
  `shopping_get` pass one. Pure, in the browser beside the view.
- **Da2 — A layer.** `{id (ULID, lower case), ops[], reason?, note?, by:
{kind: "you" | "model", model?}, at, on, from?}`, one file per layer,
  `<list>/layers/<ulid>.json`, keys in that order. Ops (one or more, applied
  together, one reason):
  `merge {ids (≥ 2), name?, amount?}` · `rename {ids, name}` · `drop {ids,
reason}` · `amount {ids, amount | unit}` · `note {ids, text}` · `aisle
{ids, aisle}`. Written through `ShoppingLayerAddSchema` (zod, strict;
  every id must be on the list **now** — a change is about the list as it
  is), read leniently (`parseShoppingLayer`: an op it does not know is
  dropped, a layer with none is no layer; `on` unless explicitly `false`).
  Bounds: 20 ops, 500 ids an op, 500 layers a list. `note` is stored for
  50c and read by nothing in 50a.
- **Da3 — Rules: leave-off.** 49a's `merges/` decisions are rules already
  and keep their storage. The new kind, one file per name,
  `rules/<id>.json`: `{id, kind: "leave-off", key, name?, leaveOff, reason?,
decidedAt}`, id = `ruleIdOf("leave-off", key)` (49a's FNV pair), so a
  name is one file on every device. **Built in:** water as recipes write
  it — water, cold, warm, hot, boiling, tap and ice water (they key as
  `water`, `tap water`, `ice water`; tonic, coconut and sparkling water do
  not) — left off with the reason "tap water". **Restore** of a built-in
  writes `leaveOff: false`; leaving it off again deletes that rule (the
  built-in says it); a person's own leave-off restored deletes its file. A
  row is left off when **every** one of its names is.
- **Da4 — How layers apply.**
  - In id (ULID) order; off layers and **stale** ones (no op id still on
    the list) apply nothing and stale ones are hidden.
  - Ops reach **rows** through item ids: after a merge, any of its ids
    reaches the merged row; a row taken off (a rule's or a drop) is reached
    by none. An op applies to whatever ids remain.
  - `merge` joins the rows it reaches (two or more; one is skipped and
    says "only one of its rows is on the list"); the row is keyed
    `layer:<id>:<op>`, sits where the first row was and routes as it did,
    reads `name` (as typed) or the first row's name, and sums through the
    density of the name, else one every name shares. A drop of a merged
    row drops it whole.
  - `amount` is the person's own text, held as 49a's edited amount is; or
    a `unit` — the code converts (49c's `amountInUnit`), "≈" through a
    density, and a count or a missing density is skipped with 49c's
    sentence. With quantities off an amount op is skipped.
  - `rename` labels the row as typed; `note` adds a line under the row
    (and the copy text); `aisle` moves the row, and its store routes by the
    new aisle unless an item pins one.
  - **Removal takes a layer with its last items** (`layersGoingWith`): a
    patch removal, Clear checked, Done shopping or Clear all deletes, in
    the same commit, every layer none of whose items is left. A layer with
    some items left stays.
- **Da5 — What the view carries.** A composed row with any change has
  `changes: [{source: layer | rule, id, op, by?, reason?, text, skipped?}]`
  (a 49a merge is a `rule` step, first) and `asWritten` (the base rows'
  labels it came from). `view.leftOff: [{row, reason, source: built-in |
rule | layer, by?, id?, key?}]` and `counts.leftOff`. Every row may carry
  `estimated` (≈) and `notes`. Left-off rows are in no store list, the
  counts or the copy text; `viewForStore` narrows them too.
- **Da6 — Paths in one place.** `SHOPPING_LIST_PATHS = {items, layers}`
  (this list's; 50d moves them per list) and `SHOPPING_RULE_PATHS =
{merges, rules, settings}` (every list's), in the seat. The boundary test
  now refuses `shopping/layers` and `shopping/rules` under `common/` and
  `export/` too.
- **Da7 — No new switch.** Rules and layers apply whatever the switches
  say (a layer is something a person asked for); "As written" is the way
  to see the list without them. A layer merge joins rows with merge off
  too.
- **Da8 — 49's Edit and Split stay rules.** Merge, Edit, Keep apart and
  Split answer a question about **names** ("these are one thing to buy")
  and 49a's Roger-to-confirm 4–6 settled that as a rule for every list, so
  they keep writing `merges/`. Layers are for this list's own calls (50c
  writes the model's accepted suggestions as layers). **Restore** of a row
  a layer dropped turns that whole layer off — it may carry other ops (the
  cinnamon-sugar example: a drop and two amounts with one reason) — and
  the Changes panel turns it back on.
- **Da9 — Rows for the model (50b).** `promptRowsOf(view)`
  (`shoppingChanges.ts`): per row to buy, `{key, label, name, amount?,
aisle?, lines: [{text, recipe?}]}` — lines only with `sources` on. 50b's
  recipe step text comes from the seat's `readRecipe` (each item's `recipe`
  slug → `instructions`, flattened as `recipeLines` flattens ingredients);
  not built here.
- **Da10 — The deterministic fixes** (each on Roger's real lines, tests in
  `shoppingLayers.test.ts`):
  1. **One name in cups and grams sums** through `GRAMS_PER_CUP` (49a's
     `consolidateAmounts`), in the unit of the largest share, "≈". Added:
     heavy, whipping and light cream, half and half, milk, whole milk,
     buttermilk, sour cream, cream cheese, yogurt and Greek yogurt at
     King Arthur's 227 g a cup, and water at 237 g. A name with no density
     keeps "2 tsp + 10 g cumin". A 49a proposal's row reads the same.
  2. **"mashed russet or Yukon Gold potatoes"** → `russet potato`
     (produce). `mashed` is a preparation now (`DESCRIPTIVE`: "2 cups
     mashed potatoes" buys potatoes, as "1 mashed banana" a banana), and
     `yukon gold` a compound, so the left one-word part lends the head
     (`potato`), not `gold potato`. Also: a colour alone (red, yellow,
     white, green, black, brown, golden, purple) borrows a one-word right
     noun — "1 lb red or yellow onions" was `red`, now `red onion`. "light
     or dark brown sugar", "lemon or lime juice" and "honey or maple
     syrup" read as before; 38's `OR:` lines are untouched (they never go
     through `inheritTails`).
  3. **"optional: sprinkles for decorating"**: the `optional:` prefix was
     already optional (43n); the name was `sprinkle for decorating`.
     `sprinkles`, `nonpareils` and `jimmies` join `INVARIABLE` (with oats,
     grits, greens, molasses, bitters), the list never pluralises such a
     word again (`keepsItsForm`), the aisle table knows the plural, and a
     purpose tail — "for decorating / garnish / dusting / sprinkling /
     frying / greasing / brushing / dipping / drizzling" — is cut as "for
     serving" was. The row reads `sprinkles`, in Pantry, optional.
  4. **"1⅓ tbsp vanilla extract"** (1½ + 1 + 1½ tsp) reads **"1 tbsp + 1
     tsp"**: `formatAmount` writes a tablespoon whole or as a half, and the
     rest in teaspoons to the quarter ("5 tsp" → "1 tbsp + 2 tsp", "4½
     tsp" → "1½ tbsp"). Only the shopping list calls `formatAmount`.
  5. **"Vegetable shortening or vegetable oil for frying"** — nothing
     deterministic. The line names both (`vegetable shortening`, then
     `vegetable oil`, its "for frying" now cut), and the list already holds
     "1 cup vegetable oil" for the pumpkin bars; folding the doughnuts'
     line into it would undercount (frying wants a quart or more, the bars
     a cup) and the choice between shortening and oil is the cook's. A
     judgement — 50b's ("use what you're already buying", with a note
     about how much).
- **Da11 — Surfaces.** HTTP `/api/shopping/layers` (`GET` the listings
  `{layer, ops, text, stale}`; `POST` add; `PATCH {id, on}`; `DELETE
?id=`) and `/api/shopping/rules` (`POST {name, leaveOff, reason?}`);
  `GET /api/shopping` answers `layers` and `rules` and a composed view,
  `?as-written=1` the base. Server actions `addShoppingListLayer`,
  `setShoppingListLayer`, `removeShoppingListLayer`,
  `setShoppingListLeaveOff`. CLI `shopping changes`, `shopping change add
(--file <json> | --stdin)`, `shopping change on|off|rm <id>`, `shopping
list --as-written` (and the list's text now ends with "Left off the
  list:"), plus `shopping leave-off <name…> [--reason]` and `shopping
restore <name…>` for the rules. MCP: `shopping_get` answers `layers` and
  its `view.leftOff`; **no new tool** (59 / 45). Commit subjects: "Update
  shopping list: change: Leave off strained pear poaching liquid: the
  poaching makes it", "… change off: …", "… change on: …", "… remove
  change: …", "… leave off ice" / "… buy water again".
- **Da12 — The page (Plan; 50c builds the walkthrough).** A changed row
  shows a **changed** marker; its details list "As written: …" then each
  change with who made it and why. "**Left off the list (N)**", collapsed
  under the list, each row with its reason, who ("always left off", "your
  rule for every list", "by you", "suggested by <model>") and **Restore**.
  "**Changes (N)**" in the left column, in order, each with an **On**
  switch and **Remove**. "**As written**" (a switch above the list) shows
  the base rows. Shop shows the composed list only. A note shows under its
  row in both modes.

### Results

**What changed.**

- `common/util/shoppingLayers.ts` (new): the layer, op and rule types,
  `parseShoppingLayer` / `canonicalShoppingLayer`, `parseShoppingRule`,
  `ruleIdOf`, `isStaleLayer`, `sortLayers`, the built-in leave-off set and
  `leaveOffVerdicts`.
- `common/util/shoppingChanges.ts` (new): `describeOp`, `listLayers` (the
  panel's, the CLI's and the commit subjects' words) and `promptRowsOf`.
- `common/util/shoppingView.ts`: `buildShoppingView` takes a `compose`;
  the groups become drafts, rules and layers apply to them (`applyOp`),
  `render` makes each row (a layer's amount, aisle, notes, chain, as
  written); `ShoppingChange`, `ShoppingLeftOff`, `ShoppingCompose`;
  `row.estimated`, `row.notes`, `row.changes`, `row.asWritten`;
  `view.leftOff`. A plain row now sums through its name's density.
- `shoppingMerges.ts` (the dairy and water densities),
  `shoppingConsolidate.ts` (a proposal row's own sum by density),
  `ingredientNames.ts` (`mashed`, `yukon gold`, plural-only words,
  `keepsItsForm`, colours lending, purpose tails), `ingredientAmount.ts`
  (tablespoons), `aisles.ts` (the plural sprinkles).
- The seat: `readShoppingLayers`, `readShoppingRules`, `addShoppingLayer`,
  `setShoppingLayer`, `removeShoppingLayer`, `setShoppingLeaveOff`,
  `layersGoingWith` (patch and clear), `readShoppingView`'s `asWritten`,
  `SHOPPING_LIST_PATHS` / `SHOPPING_RULE_PATHS`; schemas
  `ShoppingLayerAddSchema`, `…SetSchema`, `…RemoveSchema`,
  `ShoppingLeaveOffSchema`.
- The page: `Layers.tsx` (`ChangesPanel`, `LeftOffPanel`,
  `AsWrittenSwitch`), the row's marker and chain (`ShoppingRowView`),
  `useShoppingList`'s `layers`, `rules`, `addLayer`, `setLayer`,
  `removeLayer`, `leaveOff`, and the editor page's actions.
- HTTP, CLI (and `--help`), MCP `shopping_get`, the curator skill's 8b
  (and `skillText.generated.ts`).

**Before / after, Roger's real list** (scratch clone
`tmp/50/real/content`, 54 items, `shopping list` from main and from this
branch, no layers):

| Before (main `41655888`)          | After (50a)                                    |
| --------------------------------- | ---------------------------------------------- |
| _(Other)_ `1 cup mashed russet`   | _(Produce)_ `1 cup russet potatoes`            |
| `1¾ cups + 135 g heavy cream`     | `≈ 2⅜ cups heavy cream`                        |
| `4 cups + 10 g all purpose flour` | `≈ 4⅛ cups all purpose flour`                  |
| `2⅛ cups + 90 g granulated sugar` | `≈ 2½ cups granulated sugar`                   |
| `sprinkle for decorating`         | `sprinkles` (Pantry, optional)                 |
| `1⅓ tbsp vanilla extract`         | `1 tbsp + 1 tsp vanilla extract`               |
| _(Other)_ `¼ cup + 70 g water`    | Left off the list: `≈ 130 g water — tap water` |
| `vegetable shortening`            | `vegetable shortening` (Da10.5: 50b's call)    |

Every other row is unchanged (33 rows before; 32 to buy and one left off
after). Then two layers on a second scratch clone, through the CLI
(`shopping change add --file`): a drop of the poaching liquid ("the
poaching makes it"), and the brief's cinnamon-sugar shape — a drop of
"Cinnamon sugar, for dusting" with a note on the cinnamon, one reason.
`shopping changes` listed both `[on]`; the list lost the two rows, gained
"· +1 tsp for the cinnamon sugar" under the cinnamon, and its "Left off the
list:" said each with "(you)"; `change off` put the liquid back, `restore
water` brought the water back ("Update shopping list: buy water again").
One commit each; the clone was deleted after.

**Tests.** `test/shoppingLayers.test.ts` (new): the composition (no
compose is the base; water built in and a rule bringing it back; a
person's leave-off; id order; off; stale; whatever ids remain; a merge then
a rename of one of its ids; a drop after a merge, and an op on a dropped
row; a merge of one row; an amount convert with a density, without one,
and within a kind; an own amount and quantities off; note and aisle and the
copy text; a 49a merge as a rule step; merge off; left-off rows' stores),
storage round trips (a layer through its canonical form, the lenient read,
a rule's id), the built-in set, `promptRowsOf`, and the five fixes on the
real lines. `test/shopping.test.ts`: four seat cases (add, compose, off,
on, remove — one commit each and the file's shape; refusals; Restore of
water and a person's rule; a removal and Clear all taking layers in the
same commit) and the boundary. `test/ingredientAmount.test.ts`: two
tablespoon expectations follow Da10.4. Playwright
`shopping-layers.spec.ts` (new): a change through the API → marker and
chain, Changes off/on/Remove, Shop composed only; water left off and
Restore; a drop's Restore turning its change off; As written; axe (WCAG
2.2 AA) on the panels and a changed row; a `@visual` baseline of the
Changes panel. `shopping.spec.ts`'s Lemonade case now finds its water in
"Left off the list".

**Review** (a read-only agent, before the gates; no blockers). Seven
findings, all taken in the second commit:

1. Restore of a person's leave-off sent the row's label, which the seat
   keyed again: a canned name's label drops "canned" (`canned tomato` reads
   "tomatoes"), so nothing matched and the panel still said "Back on the
   list". Restore now sends the rule's `key` (`ShoppingLeaveOffSchema`
   takes `name` or `key`), and says so only when something changed.
2. The chain said an op applied when it did not: an amount on a raw line
   (merge off), and an amount or another part's aisle on a row a later
   layer merged. Those steps are now marked `skipped` ("this line shows as
   written (merge is off)", "merged into another row later").
3. A unit convert into `tbsp` (a layer's, or a 49c ask's) still wrote
   "1⅓ tbsp": `amountInUnit` now writes tablespoons through the same rule
   (`tablespoons`, exported from `ingredientAmount.ts`).
4. Name keys that moved (purpose tails, `mashed`, the plural-only words)
   leave stored overrides and 49a merges on the old keys unmatched — Ta3.
5. "2 cups water or chicken stock" keyed as water and was left off: a row
   is left off only when every alternative of every line is too.
6. `promptRowsOf` had no item ids, which layers are tied to: it has `ids`.
7. A doc comment had slid above the wrong set (`NOUNLESS`).

**Gates.** `recipe-editor` typecheck and `recipe-website` `tsc --noEmit`
clean. Full vitest 4,345 tests with 4 failures (cliJson, shoppingLayers,
editFormRoundTrip, shopping), all fixed in `ce3e6ab7`; the four files pass
alone, 129/129 (editFormRoundTrip is the known 5 s timing case). Playwright
in Docker, production build: `shopping-layers`, `shopping`, `shopping-modes`,
`shopping-merge`, `shopping-ask` and `accessibility` 114 of 115 on the first
run; the one failure, `shopping.spec` 38d, counted the sub-recipe's lines
as 2 where the page now counts 1 (its water is left off); the spec follows,
and `shopping.spec` passes 11/11. `shopping-layers.spec` also passes 6/6 in
`next dev`. Baselines regenerated in Docker: new
`shopping-layers-changes-e2e.png`; `shopping-plan-e2e.png` and
`shopping-plan-mobile.png` moved (the lemonade's water is under "Left off the
list (1)"); the in-store PNGs did not move.

### Roger to confirm

1. **Water is left off built in** (water, cold, warm, hot, boiling, tap,
   ice water), with Restore writing a rule for every list (Da3). Say if
   ice (bags of it) or anything else should join.
2. **A row is left off only when every one of its names — and every
   alternative — is** (a merged row of water and stock stays; so does "2
   cups water or chicken stock").
3. **Restore of a row a change dropped turns that whole change off** (Da8):
   a change may carry other ops with the same reason.
4. **49's Merge, Edit, Keep apart and Split stay rules for every list**
   (Da8); only the model's accepted suggestions (50c) and your own changes
   are this list's layers.
5. **Rules and changes ignore the switches** (Da7), with "As written" the
   way to see the list without them; amount changes follow quantities.
6. **A merged layer row stays where its first row was** (aisle and store)
   unless an aisle op moves it (Da4) — 49a's merged rows route by the
   merged name instead.
7. **Densities** (Da10.1): dairy at 227 g a cup (King Arthur), water at
   237 g; butter's "1 lb + 2 cups" now reads "≈ 4 cups butter" (the share
   in cups is the larger by a gram).
8. **Tablespoons**: whole or a half, the rest in teaspoons ("1 tbsp + 1
   tsp"), everywhere the list writes an amount (Da10.4).
9. **"mashed" is a preparation** everywhere names are read — Make too
   ("2 cups mashed potatoes" is met by potatoes on hand) (Da10.2).
10. **Shortening or oil for frying** is left to 50b (Da10.5).
11. **A change names items on the list now** — the seat refuses an id that
    is not (Da2); the brief's "ops apply to whatever ids remain" is for
    later removals.

### Traps

- **Ta1 — `buildShoppingView` without `compose` is the old view on
  purpose.** The proposals finder, `mergedRowIds`, the seat's merged-name
  ticks and a merge's amount ids all build views internally; giving them a
  compose would leave water out of a proposal or move a merged row's ids.
  Pass one only where a person reads the list.
- **Ta3 — names that key differently now leave old name-keyed data
  behind.** `powdered sugar for dusting` keys as `powdered sugar`, `mashed
potato` as `potato`, `sprinkle` as `sprinkles`: an `aisleOverrides` or
  `storeOverrides` entry, or a 49a merge, stored under the old key stops
  matching (no migration; the search indexes never store these names, so no
  reindex). Set the override again if one goes quiet.
- **Ta2 — the boundary test greps `common/` for the list's directories.**
  `shoppingLayers.ts` and `shoppingChanges.ts` say "this list's layers",
  never the path (as 49b's Tb4).

## 50b — "Tidy with the model": judgement calls, any model, kept runs (L)

Roger's answers on the mock-up (all OK): one card at a time with Accept the
rest (50c); built-in fixes apply without a card; store sizes wanted; "check
at home first" is a section, not a drop; a change belongs to its list
("Always do this" is 50c's rule); saved lists are 50d's; qwen3:8b by
default, 14b measured, Claude on the Pi — "make it easily selectable … run
3:14b or Claude against the original or iterate on these results".

### Decisions

- **Db1 — A run is a `shopping-tidy` job** (the 37 store, its step log,
  `llm.tidy` "Model tidies the list"), its spec a snapshot (47i's Di2):
  - **Rows**: 50a's `promptRowsOf` over the list composed `on` —
    `current` (rules and this list's layers) or `original` (the items and
    the rules only: 49a's merges, leave-off) — with sources on whatever the
    page's switch says, numbered from 1. Each row is one line: `N. <label>
[<aisle>, optional] ← <line> (<recipe>); …`.
  - **Steps, trimmed**: every recipe behind the items, the sub-recipes
    (38d's `for` slugs) too, split into sentences; a sentence is kept when
    it bears on buying (`STEP_CUE`: reserve, poach, fry, deep / depth,
    optional, if desired / if you want, garnish, decorate, dust, toss,
    sprinkle, brush, liquid, store-bought / homemade, substitute, instead,
    or use), at most 900 characters a recipe. On Roger's list: 8
    sentences of 3 recipes (the poaching liquid twice, the frying depth,
    the cinnamon-sugar toss, the flour for dusting).
  - **Told**: on `current`, the titles of accepted suggestions whose layer
    is on ("Done already"); on both, every suggestion a person skipped
    that still names an item on the list, with its rows and ops ("do not
    suggest these again", Db5).
- **Db2 — The model is picked per run** (`tidyModels`, `GET
/api/shopping/tidy/models`): `{models: [{id, words, name, api,
default?}], unavailable: [{id, words, why}]}` — 48-close #12's shape.
  Ids: the local default `RECIPE_LLM_MODEL` (qwen3:8b), each Ollama model
  in `RECIPE_LLM_TIDY_MODELS` (comma or space separated; one Ollama's
  `/api/tags` does not list is unavailable, "Not installed here: `ollama
pull …` to offer it"), and `claude` when `RECIPE_LLM_CLAUDE_API_KEY` (or
  `RECIPE_LLM_API=anthropic`) is set ("Not set up here: add
  RECIPE_LLM_CLAUDE_API_KEY to this editor's editor/.env to offer it"
  otherwise). The default is `RECIPE_LLM_TIDY_MODEL` when it names an
  offered choice, else the first (the local default; Claude on the Pi).
  Never a key or a URL. A run names its choice (`choice`), so "run it
  again" and a card's note reuse it.
- **Db3 — The model's ops, and the code's arithmetic.** The answer is
  `{suggestions: [{kind, title, reason, ops: [{op, rows, text}],
confidence}]}` (a JSON schema, so Ollama's grammar and Claude's
  structured output hold it). `op` is one of `drop` (text: why) · `add`
  (text: only the extra amount) · `merge` (text: a name or "") · `rename`
  · `package` (one row; the store size, no name) · `check` · `note` ·
  `unit` (one of 49c's `ASKABLE_UNITS`), turned into 50a's ops on item
  ids: drop → `drop`, add → **`amount {add}`** (new in 50a's vocabulary),
  merge → `merge`, rename → `rename`, package → `amount {amount}` plus a
  `note` "≈ 2⅜ cups needed" the code writes from the row, check → `aisle
check`, note → `note`, unit → `amount {unit}`.
  - **`amount {add}`** is summed by the list on every read
    (`amountPlus`): over an earlier layer's amount, else the lines' sum
    through the name's density, written as the list writes amounts ("1
    cup" + "2½ qt" → "11 cups"; "1½ tsp" + "1 tbsp" → "1½ tbsp"); a delta
    it can't read is a skipped step that says so. So the frying oil
    follows the list when the bars' cup changes.
  - **Store sizes** are the one model-written label: the package is the
    row's amount, the needed amount stays under the row as a note, and the
    card says "Package size is the model's guess". A package that is the
    amount the list says already ("8 oz" for 8 oz) is no change.
- **Db4 — The check is structural** (`checkTidyAnswer`). A suggestion is
  left out — a sentence under "Left out by the check" — only when it names
  a row not on the list, changes a row an earlier op of the same
  suggestion left off, has a malformed op (no rows, an op the list has no
  word for, a merge of one row, an empty name or note, a package for
  several rows), an amount, delta or package with no number the list
  reads, a unit the list can't give, more than 20 ops, or a leave-off
  without a reason. 49c's judgements are **warnings** on the card: a
  known-different pair ("49's rules keep leavening apart (baking powder and
  baking soda)"), more than three rows ("Merges 4 rows; 49's check took at
  most 3"), two names neither of which is the other with words in front,
  and a lone leave-off of a line a recipe needs ("Leaves off vegetable
  oil, which a recipe needs, with nothing else on the list for it"). A
  suggestion with the same ops as one skipped before, or made earlier in
  the answer, is left out ("repeats a suggestion skipped or made
  already").
- **Db5 — Runs are kept**, one file per run, `shopping/tidy/<ulid>.json`
  (`SHOPPING_LIST_PATHS.tidy`, so 50d moves them with the list): `{id,
model, choice, on, at, think, durationMs, promptTokens, outputTokens,
costEstimateUsd?, suggestions, status, leftOut, rows}` — `rows` the
  numbered rows the model read, for the record and 50c's cards. A
  suggestion's id is `<run id>-<n>`. One commit a run ("Update shopping
  list: tidy with qwen3:8b (current): 7 suggestions"); the oldest goes past
  100 runs, in the same commit.
  - **Accept** writes the suggestion as one layer — its ops, its title as
    the reason, `by: {kind: "model", model}`, `from: <suggestion id>` —
    through the seat's own layer schema, and marks it `accepted` with the
    layer's id, **in one commit** ("… accept: Make the cinnamon sugar
    (qwen3:8b)"). **Skip** marks it `skipped` ("… skip: …"). Doing either
    again changes nothing; Skip of an accepted one is refused (turn its change off in Changes).
  - **Stale** is worked out on read, never stored: a pending suggestion
    any of whose items has left the list; Accept refuses it ("run Tidy
    again"). Runs stay through Clear all (their suggestions go stale).
  - **Iterating**: a run `on: "current"` reads the accepted layers (they
    are in the rows) and is told what was done and skipped; an `original`
    run reads neither layers nor "done", only what was skipped.
- **Db6 — A note on a card** (`POST …/suggestions/<id>/ask {note,
model?}`, `shopping ask <suggestion-id> --note`): a `shopping-tidy` job
  (`task: "revise"`) over the run's list now, on the run's choice or the
  one named, with the earlier suggestion and the note; its first checked
  suggestion takes the card's place with the same id, `revised: {note, at,
model}`, pending again (one commit, "… revise: <old title> → <new
  title>"). Refused once the card is accepted; a failed or empty answer
  leaves the card as it was.
- **Db7 — "Look for more" is replaced; the note ask stays.** The page's
  "Look for more with the model" button and `shopping find-merges` are
  gone (the command says what replaced it); the tidy run looks at the
  whole list instead. 49b's note on a proposal or a merged row stays: it
  answers a question about a **name rule for every list** (49a's merges),
  where a tidy card's note answers a call on **this list** — not the same
  thing twice. The API's `task: "find"` stays for an older CLI with
  `--remote` (Roger to confirm 6).
  - **`check` is an aisle**, "Check at home first", first in `AISLES`
    and kept first in a stored order from before it; nothing routes to it
    by name, only an `aisle` op (a tidy card's, or a person's move).
- **Db8 — Context, thinking and time** (measured below):
  `TIDY_TIMEOUT_MS` (10 min, the model's load included) is its own;
  `num_ctx` is the smallest 40a step holding the prompt (3 characters a
  token), `TIDY_ANSWER_TOKENS` and, thinking, `TIDY_THINK_TOKENS`
  (`tidyContext`); a list too long for 12,288 is refused, not chunked —
  one call sees the whole list, since the judgement needs it (the
  cinnamon sugar uses the list's sugar). `RECIPE_LLM_TIDY_THINK=0` turns
  thinking off.
  - **Tb1's fix**: a call allowed past 240 s (`STREAM_AFTER_MS`) asks
    Ollama to stream, and the chunks are joined into one answer
    (`joinStream`) — Node's `fetch` gives up on headers at 300 s.
- **Db9 — Surfaces.** HTTP: `GET /api/shopping/tidy/models`; `POST
/api/shopping/tidy {model?, on?, dryRun?, wait?}` (202 `{job, stored}`,
  or the result with `wait`) and `GET ?job=`; `GET
/api/shopping/tidy/runs[?limit]` and `…/runs/<id>` (each suggestion's
  status now, its ops in words, counts); `POST
/api/shopping/tidy/suggestions/<id>/accept|skip|ask`. CLI: `shopping
tidy [--model m] [--original] [--wait] [--dry-run]`, `shopping
tidy-models`, `shopping suggestions [--run id] [--all]`, `shopping
accept|skip <id>`, `shopping ask <suggestion-id> --note "…" [--model
m]`. MCP: `shopping_get` answers `tidy` — the latest run's pending
  suggestions `{run, model, on, suggestions: [{id, kind, title, reason,
text, warnings}]}` — and no new tool (59 / 45); the skill's 8b says
  so. The page (Plan, minimal — 50c replaces it): "Tidy with the model"
  with a Model select (unavailable ones disabled, with why), "Read: the
  current list / the original", the pending suggestions with Accept and
  Skip, and "Left out by the check (N)". Accepted ones show in Changes.

### Results

**What changed.**

- `common/util/shoppingTidy.ts` (new, pure): the kinds and their words,
  the suggestion, run and model-choice types, `tidyStatusOf` (stale on
  read), `tidyRunView`, `parseTidyRun` / `serializeTidyRun`,
  `skippedSuggestions`, the job's result type.
- `editor/controller/llm/shoppingTidy.ts` (new): `tidyModels` /
  `readTidyModels` / `tidyConfigFor`, `trimSteps`, `tidyRowsOf`,
  `storedTidySpec` / `storedTidyAskSpec`, the prompts, `tidyThinks`,
  `tidyContext`, `runShoppingTidy`. `shoppingTidyCheck.ts` (new): the JSON
  schema and `checkTidyAnswer`.
- 50a's vocabulary: `amount {add}` (`shoppingLayers.ts`, the seat's
  schema, `describeOp`, `shoppingView.ts`'s `amountPlus`); `promptRowsOf`
  marks `optional`; the `check` aisle (`aisles.ts`, kept first by
  `normalizeShoppingSettings`).
- The seat: `SHOPPING_LIST_PATHS.tidy`, `readTidyRuns`, `readTidyRun`,
  `writeTidyRun`, `decideTidySuggestion`, `reviseTidySuggestion`.
- The client: `STREAM_AFTER_MS` and `joinStream` (Tb1).
- Jobs: the `shopping-tidy` kind (label, the GPU's line for a local
  model, `specWrites`, `/jobs`' words and icon, the `llm.tidy` step).
- HTTP routes under `/api/shopping/tidy`, server actions
  `controller/actions/shoppingTidy.ts`, the CLI commands and `--help`, the
  MCP `shopping_get`'s `tidy`, the skill's 8b and `skillText.generated.ts`.
- The page: `Tidy.tsx` (`TidyPanel`) in Plan; `MergeProposals.tsx` loses
  "Look for more"; the editor's page reads the models and the latest run.
- The stand-in model's `shoppingTidyAnswer`.

**The measurement** (the acceptance test). Roger's real list, cloned
(`tmp/50/real/content`: Pumpkin Bars, Pear Panna Cotta Cake, Maine Potato
Doughnuts — 54 lines, 32 rows to buy, 8 step sentences); `pnpm recipes
shopping tidy --model … [--original] --dry-run --json` from this worktree,
one run at a time, VRAM under 2 GB and no `parakeet-cli` before each, the
model stopped after. "Current" is a second clone with golden cards 1–3
written as layers by hand (poach the pears: the liquid and the purée left
off, +5 pears with a note; fry in the vegetable oil: the shortening left
off, +2½ qt oil; the cinnamon sugar: left off, +1 tbsp cinnamon, +¼ cup
sugar), so "current" asks for the other six. Scored by
`tmp/50/50b/scripts/score.mjs` (each golden card by its ops: the right
rows in the right op, a merge of at most four rows; harmful: a merge of
baking powder and soda, butter and an oil or shortening, two sugars, more
than four rows or two unrelated names, a leave-off with nothing in its
place, an `add` with nothing left off — the list already counts every
line), then read by eye: the scorer's calls stand, but for 14b's "Remove
optional pear" (the firm pear is optional, a garnish) — a judgement, not
harm.

| Run | Model, on                         | Placement, `num_ctx`                    | Time                                                   | Tokens in + out | Kept / left out | Golden found                                                         | Harmful                                                                                                                                                                                    |
| --- | --------------------------------- | --------------------------------------- | ------------------------------------------------------ | --------------- | --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | qwen3:8b thinking, original       | 90 % GPU / 10 % CPU, 12,288             | **timed out at 600 s** (and at 300 s before Tb1's fix) | —               | —               | —                                                                    | —                                                                                                                                                                                          |
| 2   | qwen3:8b, original (first prompt) | 100 % GPU, 8,192                        | 67 s                                                   | 2,211 + 1,478   | 15 / 0          | 1 poach, 7 check                                                     | 2: butter + shortening merged; the pear purée and firm pear left off                                                                                                                       |
| 3   | qwen3:8b, original (final prompt) | 100 % GPU, 8,192                        | **45 s**                                               | 2,311 + 1,242   | 8 / 2           | **3**: 1 poach, 7 check, 9 sprinkles                                 | 1: baking powder + soda merged (warned "49's rules keep leavening apart")                                                                                                                  |
| 4   | qwen3:8b, current (1–3 accepted)  | 100 % GPU, 8,192                        | **37 s**                                               | 2,172 + 1,100   | 10 / 0          | **2 of 6**: 7 check, 8 vanilla (a note: extract instead of the bean) | 6: the 6 pears left off (undoing card 1), granulated + powdered sugar merged, and four `add`s that count a recipe's lines twice (+3 eggs, +8 oz cream cheese, +3 tbsp butter, +2 cups oil) |
| 5   | qwen3:14b, original               | **62 % GPU / 38 % CPU**, 8,192 (10 GB)  | 353 s                                                  | 2,311 + 998     | 10 / 0          | **2**: 1 poach, 9 sprinkles                                          | 2: butter + egg white merged; a 23-row "Combine flour rows" (warned)                                                                                                                       |
| 6   | qwen3:14b, current                | 62 % / 38 %, 8,192                      | **timed out at 600 s**                                 | —               | —               | —                                                                    | —                                                                                                                                                                                          |
| —   | Claude                            | not measured: no key on the workstation |                                                        |                 |                 |                                                                      |                                                                                                                                                                                            |

Neither model found the frying oil, the cinnamon sugar (on the original),
salt + table salt, the egg white or a useful store size; both offered
"butterm" → "butter" (a rename the recipe's typo invited — Roger fixed the
recipe in the mock-up, not in this clone). The first prompt's store sizes
repeated the amount ("8 oz cream cheese" as 8 oz): the check now leaves a
package equal to the row's amount out, and says a package smaller than
the need ("1 quart" for 11 cups of oil) on the card; a lone `add` is
warned too. Those warnings came after runs 3–5 and so are not in their
cards.

**The default: qwen3:8b, not thinking.** On these numbers 14b is no
better (2 golden cards against 3, as harmful) and 8–16 times slower on
the RX 6600, where it does not fit (10 GB at 8,192: 38 % on the CPU), and
thinking did not finish on either. 8b's output is a starting point at
best: most of the golden set is beyond it, and the current-list run's
harm is the kind the structural check lets through by design (Db4) — the
warnings say it, Roger decides. Claude on the Pi is the case to measure
next (Roger to confirm 1).

**Tests.** `test/shoppingTidy.test.ts` (new, 16): the check — a
well-formed suggestion in 50a's ops; each refusal (a row not on the list,
a row changed after its leave-off, an unknown op, no rows, a merge of one,
an empty rename, an amount that does not read, a package with no size or
for two rows, an unknown unit, a leave-off with no reason, no ops, an
answer that is not a list); the warnings that were 49c's refusals (baking
powder + soda, a merge of four, no shared head; salt + table salt none);
a store size's note and warning; a package that is the amount already;
check at home; a lone drop of a needed row; a repeat of a skipped
suggestion. The delta in the view ("1 cup" + "2½ qt" → "11 cups", "1½
tsp" + "1 tbsp" → "1½ tbsp", "2 cups" + "¼ cup", a delta that does not
read). The models (8b default, 14b installed, a model not installed,
Claude with and without a key, the Pi, `RECIPE_LLM_TIDY_MODEL`, never the
key). `num_ctx` and thinking; streaming's `joinStream`; `trimSteps`. In a
real git repository: a run kept in one commit, Accept writing one layer
`from` the suggestion and the run in one commit, the oil then "11 cups",
Accept again unchanged, Skip, the next spec told what was done and
skipped, `original` without the layer, a stale suggestion refused, an
unknown id `not_found`, and a stored run's lenient read. Playwright
`shopping-tidy.spec.ts` (new): a run through the stand-in → two
suggestions and one left out, the commit, axe; Accept → one change and the
salts under "Check at home first"; Skip; a run on current that makes none
again; the runs API's counts; the models API and the disabled Claude
option; a run on the original after an Accept. `shopping-ask.spec.ts`
loses its two "Look for more" cases.

**Review** (a read-only agent, before the gates; no blockers). Six
findings, five taken in the second commit:

1. Accept was not idempotent: "run it against the original" brings an
   accepted card back, and a second Accept added its amounts twice. Now a
   change on the list is passed to the check — left out as a repeat on
   `current`, warned "Already on this list as a change" on `original` —
   and the seat refuses an Accept whose ops are on the list already.
2. The revise path had no test: one now (a skipped card revised is
   pending with the same id, one commit; refused once accepted).
3. The repeat check signed a leave-off by its words: a leave-off, an aisle
   and a note are signed by what they do to which items now
   (`opsSignature`, moved to `shoppingTidy.ts`).
4. "Check at home first" was offered in a row's "Aisle (for every …)",
   which writes a rule by name: filtered out (it is a change of one
   list).
5. A rejected server action in the panel said nothing: Start and
   Accept/Skip catch it. (The other half — a streamed error chunk — is
   already said: `joinStream` keeps the last chunk's `error`, which
   `answeredFailure` reads.)
6. The spec's salt assertion could pass on "sea salt" alone: it counts
   the two rows in the aisle.

**Gates** (2026-11-21, through the heavy slot; Docker, production build
unless said):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit`: clean.
- `pnpm exec vitest run`: 198 files, 4,361 tests — 4,355 passed, 6
  failed: four this phase's (`aisles`, `jobs`, `shoppingView` following
  the `check` aisle and the new kind; `urlGuard`'s fetch sweep finding
  Ollama's model list outside `client.ts`), fixed in the second commit,
  and two known 5 s timing cases (`urlGuard`'s source sweep,
  `editFormRoundTrip`'s typed label, 49b/49c's). The nine touched files
  again, alone: 266 of 268, the same two timing cases.
- Playwright `shopping-tidy`, `shopping-ask`, `shopping`,
  `shopping-layers`, `shopping-modes`, `shopping-merge`, `accessibility`
  (e2e + mobile): **115/115**, first run. `shopping-tidy.spec` in `next
dev` (Docker) failed: the panel kept "Tidying…" (Tb4).
- **After merging main (50e, `04f61a0c`) and the Tb4 fix** (2026-11-21):
  both typechecks clean; `pnpm exec vitest run` **201 files, 4,385/4,385**
  (the new `shoppingTidyPanel` test included, and the two timing cases
  passed this time); Playwright `shopping-tidy`, `shopping-ask`,
  `shopping`, `shopping-layers`, `shopping-modes`, `shopping-merge`,
  `import-linked`, `accessibility` (e2e + mobile, Docker production)
  **117/117**, first run; `shopping-tidy.spec` in `next dev` (Docker)
  **2/2**.
- **Baselines: none moved, none new** (the suite pins the model off, so
  the page draws no tidy panel).
- No dependency or Next-config change, so no main-checkout-shaped build.

### Roger to confirm

1. **qwen3:8b, not thinking, is the default** (Db8): 45 s a run, 3 of the
   9 golden cards on the original list; 14b found 2 in 353 s and did not
   finish on the current list. Run Claude when a key is set
   (`RECIPE_LLM_CLAUDE_API_KEY` on the workstation, the Pi's own) and say
   whether it should be the default where it exists.
2. **Thinking is off** unless `RECIPE_LLM_TIDY_THINK=1`: 8b thinking did
   not answer in 10 minutes.
3. **`RECIPE_LLM_TIDY_MODELS=qwen3:14b`** is what offers 14b here; it is
   not in `editor/.env` yet — add it if you want it in the picker.
4. **The check refuses only structure** (Db4); a merge of baking powder
   and soda reaches a card, warned. Say if any warning should be a
   refusal again.
5. **Store sizes** keep the needed amount as a note under the row
   ("≈ 2⅜ cups needed") and always say "Package size is the model's
   guess".
6. **"Look for more" is gone** from the page and the CLI; the API's
   `task: "find"` stays for an older CLI — delete it (and its check) in
   50c?
7. **Runs stay through Clear all** (their suggestions go stale), at most
   100 kept.
8. **An `add` is summed as the list writes amounts**: "1 cup" + "2½ qt"
   reads "11 cups vegetable oil", not "2¾ qt".
9. The words: "Tidy with the model", "Read: the current list (with your
   changes) / the original (as written, with the rules)", "Suggestions
   (N)", "Accept", "Skip", "Left out by the check (N)", "Check at home
   first", the kinds (Leave off, Combine, Make it, Merge, Store sizes,
   Check at home, Swap, Rename).

### Traps

- **Tb1 — Node's `fetch` waits 300 s for headers.** A non-streamed
  Ollama call that takes longer fails as "fetch failed" (unreachable) at
  300 s, whatever its own timeout says: undici's `headersTimeout`. A call
  allowed past 240 s streams now (`STREAM_AFTER_MS`, `joinStream`).
- **Tb2 — a count's added amount is not pluralised**: "+5" on "1 firm
  pear" reads "6 firm pear" (an amount set by a layer keeps the name as
  the row has it, as 49a's edited amounts do).
- **Tb4 — under `next dev` the panel kept "Tidying…" (fixed).** The job
  did end: the job store said `done`, `live: false`, result in hand,
  about a second after the click. The fault was the panel's unmount flag.
  `Tidy.tsx` set `stopped.current = true` in an effect's cleanup and never
  set it back. React's Strict Mode (on under `next dev`, not in a
  production build) mounts, cleans up and mounts again, so the flag was
  already true before the first click. The follow loop then returned on
  its first answer without clearing "Tidying…" or showing the result. The
  effect now sets the flag false on every mount.
  `test/shoppingTidyPanel.test.tsx` renders the panel in `<StrictMode>`
  and fails without the fix. None of the first suspects was the cause:
  the client reads either body by its content type (NDJSON through
  `joinStream`, anything else as JSON), so the stand-in's one JSON body
  for a `stream: true` request is fine; the seat's dynamic imports and
  the GPU line ran normally (the job's step log shows each). An unmount
  flag needs setting on mount as well, wherever an effect's cleanup sets
  it; `RoundupImport`'s `stopRef` is safe because each run resets it.
- **Tb3 — the scorer's first merge rule counted a 23-row merge** as three
  golden cards; a golden merge is at most four rows now. Read the
  scorer's calls by eye.

## 50c — Walk through the suggestions, one card at a time (L)

The spec is the mock-up Roger approved (artifact `M3sTTwEeGe8QgWmZfUTNWQ`,
all seven questions OK), with his note on the model: "make it easily
selectable (e.g. 'looks like qwen 3:8b didn't do a good job, I want to run
3:14b or Claude against the original or to iterate on these results')".

### Decisions

- **Dc1 — One panel, "Suggestions", first in Plan's left column**
  (`Walkthrough.tsx`): the cards one at a time with progress dots and "N
  accepted · N skipped · N to go", then "Tidy with the model" (`Tidy.tsx`'s
  `TidyControls`) and its earlier runs. Card first, the list beside it on a
  wide screen; on a phone the panel is above the others (Plan's list is
  Shop's there, unchanged). 49a's "Same thing, different names" panel and
  50b's minimal tidy panel are gone; 49b's asks that belong to no card (a
  merged row's "Ask the model about this", the running ask) show in this
  panel (`MergeAsks`). Split and "Ask the model about this" stay on the row.
- **Dc2 — After is composed** (`shoppingWalk.ts`, `suggestionDiff`): the
  list as the page composes it (`composeWalk`, 50a's `buildShoppingView`
  with merges, rules and layers) with the card's ops added as one more layer
  whose id sorts after every ULID — exactly what Accept writes. Now is the
  rows the ops' items are in; After the same items' rows, or what was left
  off and why, a row's notes, and "moved to <aisle>".
- **Dc3 — Built-in cards come first**, then the picked run's (not mixed: the
  table's merges are deterministic and settle names the model's cards then
  read as one row; a model card's ops reach rows by item id either way).
  "Same thing, different names: <name>", by "Built-in": **Accept** = 49a's
  Merge (a rule for every list, as before), **Skip** is this page only (the
  proposal is asked again next time — a proposal has no stored skip), **Keep
  apart** is 49a's (a rule), **Edit** the name and amount, and — with a model
  here — **Tell the model…** is 49b's note. Kept apart counts as skipped in
  the tally but is not offered to reopen (it is a rule: switch it off in
  Changes). A stale model card (an item left) is not a card.
- **Dc4 — Edit, then Accept as edited** (`walkFields`, `applyWalkEdits`):
  a merge's name and amount (empty: the list's own), a rename's name, an own
  or added amount, a note — the After lines follow as you type. The seat
  refuses an edit that changes anything else (`sameShape`: the ops, their
  rows, a drop's reason, an aisle, a unit). The layer stores the person's
  ops and `edited: {at, ops}` — the model's own — `by` stays the model's;
  the run's status says `edited: true`; the commit is "accept (edited): …";
  the chain and Changes say "suggested by qwen3:8b, edited by you". An
  Accept whose ops equal the model's is no edit.
- **Dc5 — "Always do this"** (`promoteLayer`, the seat's
  `promoteShoppingLayer`): a change of this list said again by its lines'
  names — a merge of two or more names → 49a's merge decision (its name
  kept), a rename → a rename rule, a leave-off → a leave-off rule (its
  reason kept), an aisle → `aisleOverrides` (the routing table the row's
  "Aisle (for every list)" writes). The change itself goes in the same
  commit ("Update shopping list: always: …"): the rules do it now. Refused,
  for the whole change, with the reason under the disabled button: an amount
  or a note ("Amounts and notes stay on this list: they follow its recipes,
  and another list's lines differ."), a merge with its own amount, "Check at
  home first" (this list's cupboard check, 50b's review 4), a merge of one
  name, and a merge whose names a rule merges with others already.
- **Dc6 — A rename rule** (`rules/<id>.json`, `kind: "rename"`, `key`,
  `name`, `label`; `ruleIdOf("rename", key)`): a row of that one name reads
  `label` on every list, after the leave-offs and before this list's layers;
  a row of several names (a merge) keeps its own name. `ShoppingRule` is a
  union of the leave-off and rename kinds.
- **Dc7 — Rules switch off and keep their file**: `on: false` on a rule's
  file or a 49a merge decision (stored only when off). Off applies nothing:
  a merge's rows show apart and its proposal comes back as a card; a
  kept-apart pair may be proposed again; a merge decided again is on. The
  Rules tier (`listRules`), collapsed: the built-in water names (their
  switch is 50a's Restore / leave off again; no Remove), a person's
  leave-offs and renames (switch, Remove), merges and kept-apart pairs
  (switch; Remove is 49a's Split), aisles by name (Remove only — a setting).
  "This list": each change with its switch, Remove and "Always do this".
- **Dc8 — Runs**: the page reads the 20 newest (`TIDY_RUNS_SHOWN`); "Earlier
  runs" lists each with model, on, when and its counts now, and picking one
  shows its remaining cards. Iterate is a new run on the current list (it is
  told what was accepted and skipped, 50b's Db1). The model is radio cards
  as on /curator (48-close #12): one this editor can't run stays in view,
  disabled, saying what to set. A card's note asks the model the picker
  names ("Ask qwen3:8b again with this note"), so a card can be re-asked of
  14b or Claude; the revised card replaces the old one (50b's Db6), shown
  "Revised" with the note.
- **Dc9 — Keys and focus**: A / S / E answer while focus is in the panel and
  not in a field (WCAG 2.1.4: single-key shortcuts only where the component
  has focus), with `aria-keyshortcuts` on the buttons. After an action focus
  goes to the next card's title, or the done state's heading; the counts and
  what happened are in the panel's `role="status"`. The run's progress links
  its steps on `/jobs/<id>`.
- **Dc10 — Surfaces.** Server actions `setShoppingListRule`,
  `removeShoppingListRule`, `promoteShoppingListLayer`, `askShoppingTidy`,
  `shoppingTidyRuns`, and `decideShoppingTidy`'s `ops`; HTTP `PATCH` /
  `DELETE /api/shopping/rules` and `POST /api/shopping/layers/always`; CLI
  `shopping change always <id>` and `shopping rule on|off rule|merge <id> |
rm rule <id> | rm aisle <key>`. No new MCP tool (59 / 45).

### Results

**What changed.**

- `common/util/shoppingWalk.ts` (new, pure): `composeWalk`,
  `suggestionDiff`, `walkFields` / `applyWalkEdits` / `sameShape` /
  `isEdited`, `promoteLayer` and `LIST_ONLY_WHY`, `listRules`, the queue
  (`walkCards`, `walkCounts`, `nextCard`) and the runs (`runHistory`,
  `pickRun`).
- `shoppingLayers.ts`: `ShoppingRule` is the leave-off and rename union,
  `on: false`, `ruleIsOn`, `renameRules`; a layer's `edited`.
  `shoppingMerges.ts`: a decision's `on: false` (`activeMerges` skips it);
  `shoppingConsolidate.ts`: an apart decision switched off proposes again;
  `shoppingView.ts`: rename rules, a change's `edited`; `shoppingTidy.ts`: a
  suggestion's `edited`, `TIDY_RUNS_SHOWN`.
- The page: `Walkthrough.tsx` (new), `Tidy.tsx` (`TidyControls`, the
  model radio cards, `RunTime`), `MergeProposals.tsx` (its pieces kept for
  the built-in card; `MergeAsks`), `Layers.tsx` (the two tiers),
  `PlanView.tsx`, `useShoppingList`'s `setRule`, `removeRule`,
  `promoteLayer`, `canRule`; `ShoppingRowView`'s `changedBy` says an edit.
- The seat: `setShoppingRuleOn`, `removeShoppingRule`,
  `promoteShoppingLayer`, `decideTidySuggestion`'s `ops`; schemas
  `ShoppingRuleSetSchema`, `ShoppingRuleRemoveSchema`,
  `ShoppingLayerPromoteSchema`, `TidyAcceptEditSchema`; a switched-off
  merge does not grow a new one.
- Actions, the editor page (the 20 newest runs, the new actions), HTTP
  (`/api/shopping/rules` PATCH and DELETE, `/api/shopping/layers/always`),
  the CLI and both backends; the stand-in model's third tidy card ("Say
  large eggs", a rename).

**Tests.** `test/shoppingWalk.test.ts` (new): After by composition (a
leave-off and an added amount, equal to the accepted layer's list; an aisle
move, a merge, a note); edits (the fields, a note-only edit, empty refused,
the shape check); "Always do this" (each kind; amounts, notes, a merge's
amount, one name, Check at home, a rename of several names and a change
switched off refused); rename rules and switching off (a rule, a merge's
proposal back); the tier's listing; run history and picking; the queue
(built-in first, the next card, a gone item's card dropped). In a real
repository: an edited Accept (the person's ops, the model's kept, "(edited)",
a new shape refused, the model's own ops no edit); "Always do this" in one
commit (merge, rename, aisle and the layer's file), an amount refused; a
rule off, on, removed; an aisle removed; a merge off and on; a merge
promotion that clashes with a rule refused. `shoppingTidyPanel.test.tsx`
renders the walkthrough in Strict Mode (Tb4). Playwright
`shopping-walkthrough.spec.ts` (new): a run walked with A, S and E (typing
"as said" in the field presses nothing), a note re-asking a card (Revised),
the done state reopening the skipped card, "suggested by …, edited by you";
Keep apart then Accept the rest; "Always do this" on the rename, refused on
the store size with its reason; the rules tier (the rename switched off);
axe on the panel and Changes; a phone's Plan with the card first and no
sideways scroll. `accessibility.spec` gains the walkthrough with Edit open
and the rules tier, light and dark. `shopping-merge`, `shopping-ask`,
`shopping-tidy` and `shopping-layers` follow the cards and the two tiers.

**Review** (a read-only agent, before the gates; no blockers). Eight
findings, seven taken in the second commit: a note-only edit was dropped
(`isEdited` compared a signature that leaves a note's text out); "Always do
this" on a rename of a row of several names wrote a rule per name; Accept
the rest hid where it stopped; a pending card whose line had left the list
still showed; "Always do this" was offered on a change switched off; a held
key accepted card after card, and E on a model card left focus on the title;
`shopping-ask.spec` had lost its focus assertion. Not taken: a switched-on
merge decision overlapping another is not checked (`activeMerges` gives a
name to the first by id, as for a hand edit).

**Gates:** not run yet — the machine ran out of memory while the editor
typecheck waited in the heavy slot (the session reaped it); see the
hand-back.

### Roger to confirm

1. **Built-in cards come first**, then the run's (Dc3), and Skip on a
   built-in card lasts for this page only (the proposal is asked again on a
   reload); Keep apart is the way to stop it.
2. **Kept apart counts as skipped** in "N accepted · N skipped · N to go"
   and is not offered to reopen.
3. **An edit can change names, amounts, added amounts and notes only**
   (Dc4) — not which lines, a drop's reason or an aisle.
4. **"Always do this" removes the change** from this list in the same commit
   (the rules do it now), and refuses amounts, notes, a merge's own amount,
   Check at home and a rename of a merged row (Dc5).
5. **An aisle by name stays the routing setting** (`aisleOverrides`, what the
   row's "Aisle (for every list)" writes): in the Rules tier it has Remove
   but no switch.
6. **Switching a 49a merge off** shows its rows apart and brings its card
   back; switching a kept-apart pair off lets it be proposed again (Dc7).
7. **The keys work only while focus is in the Suggestions panel** (Dc9);
   say if they should work anywhere on the page.
8. **A card's note asks the model the picker names**, not the run's own
   (Dc8) — the "run 14b or Claude on these results" case.
9. **The Changes panel always shows** now (its rules tier has the built-in
   water), with the tier collapsed.
10. **The page reads the 20 newest runs** for "Earlier runs".
11. An edited Accept is page-only: the HTTP and CLI `accept` take no edit.

## 50e — Imports follow the recipes a recipe links to (M–L)

Roger, 2026-11-21: _"Ideally importing recipes should also follow and import
attached recipes like this."_ Pear Panna Cotta Cake
(`zoebakes.com/2019/10/13/pear-panna-cotta-cake/`) needs 2 cups of
poached-pear purée and 1½ cups of the strained poaching liquid; its purée line
carries "poach the pears as instructed here", a link to Zoë's poached pears.
The import kept neither the link nor that recipe, so the shopping list asked
for "pear poaching liquid". And once both lines were linked by hand, the list
bought **two** batches — 16 pears and 2 bottles of wine.

### Decisions

- **De1 — Where a link counts.** `common/util/linkedRecipes.ts`
  (`findLinkedRecipes`, pure, on the roundup reader's link rules: the
  canonical URL, `sourceUrlKey`, `siteKey`, and the new `isNonRecipeLink` —
  `roundupPage`'s own `skipUrl`, so the two readers drop the same share,
  shop, archive, file and private links). In order:
  1. **The recipe card's ingredient items** (WPRM, Tasty, Mediavine and the
     card classes, or `itemtype=…/Recipe`) — a link anywhere in the item, its
     name or its note, is that line's. Same site: always; another site: only
     when the item says "recipe". A link after "or" / "instead of" / "in place
     of" ("200 g sour cream **or** [creme fraiche]") is the line's
     alternative, not its source: left alone. A second link on one line
     (Sally's "Flaky Pie Crust (what I used) or All Butter Pie Crust") is an
     alternative too: the first is followed.
  2. **The card's steps and notes** — only with a cue in the link's words or
     its sentence ("recipe", "instructions", "how to make", "see my …"), or
     when the link's words name an ingredient line no item link took.
  3. **The article body** — only with a cue. "For this spin … I combined
     [Swedish Cream] with a poached pear puree" is prose; so is Sally's "if
     you have [homemade vanilla extract], go ahead and use it" (it names the
     vanilla line, and the body may not link a line by name: a choice is not
     a sub-recipe).

  A cued link whose words name one of the recipe's own section headings
  ("Swedish Cream" over "Sour cream panna cotta (Swedish cream)") is that
  section written out here: left alone. Ingredient links first, then steps,
  notes, body; same site first; **at most 5** (`MAX_LINKED_RECIPES`), the
  rest reported. Nothing is fetched here; the links ride on the reading as
  `linked` (`ApplyLlmResult.linked`, `curation/pageLinks.ts`), found where
  the HTML is (`importPage`, the form's page path).

- **De2 — A link is a recipe only when its page reads as one.** Each
  candidate, once and in order: a recipe already imported from that link
  (`recipeBySource`, the duplicate check's own matching) is linked to and not
  fetched; otherwise `importPage(url, {llm: mode, asOne: true})` — the
  site's queue and polite gap, the SSRF-guarded fetch, the same `--llm` mode
  as the parent. No ingredient lines, or only the SEO fallback, is
  `not-a-recipe`. One level deep: a linked page's own links are never
  followed. Each is a `linked` step in the job log.
- **De3 — Imported first, its own commit, then the parent.** "Create recipe:
  poached-pears (linked from zoebakes.com/2019/10/13/pear-panna-cotta-cake)",
  then the cake. A linked recipe whose slug another source holds is
  `failed` (no suffix made up, no link). The follow is skipped when the
  parent's own slug is taken (its create would fail and leave the linked ones
  for nothing). A dry run fetches the linked pages too and answers
  `would-import` with the slug a create would use.
- **De4 — Which line a linked recipe makes** (`common/util/linkedLines.ts`,
  deterministic, no model). By **link**: the page's link sat on that line (or
  a card step's link named it). By **name**: the recipe's name less filler
  (Easy, Homemade, Best, Recipe…), words singular and -ed/-ing off (poached,
  poaching → poach), crust ≡ dough ≡ pastry; the line must hold the name's
  head ("pear", "crust") and another of its words ("pear poaching liquid" ←
  Poached Pears; "pie dough" ← All-Butter Pie Crust), or a method product
  (purée, liquid, syrup, mash, sauce) when the name opens with a method
  ("pear purée" ← Poached Pears). Never a heading, a line that links a recipe
  already, or one of the linked recipe's own ingredients (Poached Pears uses
  "pear juice": the cake's pear juice would be bought). One recipe per line,
  link before name. The model is not asked: the rule reaches the brief's
  examples, and what it misses becomes a note (De6), which is the safe miss.
- **De5 — The parent's tags only where the linked page says them**
  (`fittingTags`): a tag reaches the linked recipe when its words (folded,
  singular) are in the linked page's categories, cuisine, method or keywords
  (`suggestedTags`) or its name. Zoë's poached pears page has no categories,
  so `--tags dessert,pear` gives it `pear` only. No blind copy.
- **De6 — The line rewrite is 38d's sub-recipe form** (Dd2): the amount, the
  line's own words as the link, then the remark — "2 cups (600g) [pear
  puree](/recipe/poached-pears)", "1 1/2 cups (350ml) [Pear Poaching
  Liquid](/recipe/poached-pears) (strained)". A line with an alternative
  after the link stays a choice on the list (Dd9) and says so
  (`expands: false`). A linked recipe no line makes is a note: "Uses:
  [Poached Pears](/recipe/poached-pears)" — unless a line links it already.
- **De7 — Every rewrite is marked for approval.** The form gets
  `recipe.linkedLines` (`LinkedLineMark`: before, after, slug, name, how);
  each row holding the rewrite shows "The import linked this line to Poached
  Pears — the page links it here. It read “…”." with **Keep the link** and
  **Undo** (back to the page's words). Like 45b's and 47i's marks it does not
  block Save. The CLI and MCP answer `linked: {recipes, lines, notes?,
skipped?}` (each line `from` → `to`), and the job log has a `linked` info
  line with every rewrite.
- **De8 — One batch for a sub-recipe several lines share**
  (`expandRecipeLines`): within one recipe's own lines, the lines linking one
  sub-recipe open it **once**, at the first, noting every line it covers
  ("for Poached Pears (2 cups poached pear purée and 1½ cups pear poaching
  liquid called for)"). Lines that count still add (De14). The plan's or recipe's
  scale multiplies as before. Dd3 is untouched: the expanded lines merge with
  the recipe's own of the same name in the view. One line alone is exactly as
  before.
- **De9 — NFC.** `createIngredient` stores its line composed: the cause of
  the cake's decomposed "purée" was `normalizeIngredientText`'s NFKD (kept,
  for the fractions — the readers decompose again themselves). Every text an
  import hands over is composed too (`composed()` in `importedToInput`). The
  shopping name keys and the search fold were already indifferent (both strip
  marks after NFD: `fold`), now a test says so.
- **De10 — Surfaces.** The form: "Follow linked recipes" (on by default)
  beside the URL field; the `form-url` job names the corpus and its author
  only while it is on (`specWrites` says so), and its panel lists "Also
  imported: …" / "Linked to your …" with links, and what was not followed.
  CLI `import <url> --linked auto|off`; MCP `recipe_import` and `/api/import`
  take `linked` (URL imports only; no new tool, still 59). `recipes linked
--scan [--slug s …] [--limit n] [--dry-run]` — a `linked-scan` job — reads
  each stored recipe's source page again, politely, matches its links against
  the **stored** lines, and writes one commit per recipe that changes (none in
  a dry run); local only (the HTTP backend answers `usage`). Roundup imports
  (`import-list`) do not follow: their items are one level already. Text and
  photo imports have no page to read links from.

Review amendments:

- **De11 — A one-word name claims only the thing** (amends De4): the line's
  own name must end in the recipe's head, or in a method's product — "2 tbsp
  maple syrup" is no Simple Syrup, "bread cubes" no Homemade Bread,
  "roasted garlic mashed potatoes" no Roasted Garlic; "simple" is no filler.
- **De12 — Mentioned is not used** (amends De1): a step's, note's or post
  link that names no line must say it is used — "as instructed here", "how
  to make", "made with my", "use my" — or it is left alone ("mentioned, not
  used by any line"): "see my scones", "try my apple pie recipe" are
  cross-promotions, not recipes this one needs.
- **De14 — Counts add, measures share one batch** (amends De8; the
  coordinator's rule after review). Among one recipe's lines linking one
  sub-recipe, a line that **counts** — a bare count ("1 [All-Butter Pie
  Crust]"), batches ("2 batches", "half batch"), no amount (×1), a range or
  an unreadable amount (×1, as alone) — adds its factor: a double-crust pie's
  bottom and top are two crusts. A line that **measures** what the
  sub-recipe makes ("2 cups purée", "¾ oz simple syrup", "1 can") is covered
  by one batch, however many measured lines there are: the cake's purée and
  poaching liquid are one batch of pears (16 → 8). Mixed: the counts' sum,
  raised to one batch when it is under one and a measured line is there
  ("half batch" + "1 cup purée" → one batch); measures never add a second.
  The note names every line, counts and measures alike. One line alone is
  exactly as before (Dd2/Dd9).
- **De13 — The scan keeps an edit made while it read** (`scanLinked`): the
  recipe is read again before the write; changed since, it is `failed`
  ("edited while its page was read — nothing written; scan it again").

### Results

- New: `common/util/linkedRecipes.ts`, `common/util/linkedLines.ts`,
  `editor/controller/curation/linkedImport.ts` (`followLinked`,
  `scanLinked`, `fittingTags`), `linkedMode.ts`, `pageLinks.ts`,
  `cli/commands/linked.ts`, `new-recipe/LinkedSummary.tsx`; the `linked-scan`
  job kind.
- Changed: `importRecipe.ts` (`importPage` finds links; `finishImport`
  follows them; `linked` on the results; `composed`), `formImport.ts`,
  `jobs/kinds.ts` (`form-url` may name the corpus; `linked-scan`),
  `importRequest.ts`, the CLI's `import` and help, the MCP description,
  `shoppingLines.ts` (De8), `parseIngredients.ts` (De9), the form's
  Ingredients rows and import panel, the curator skill (and
  `skillText.generated.ts`).
- Fixtures: `test/fixtures/linked/` — the two Zoë Bakes pages and Sally's
  My Favorite Pecan Pie, each fetched **once** (2026-11-21, a browser UA,
  ≥ 15 s apart), trimmed (scripts other than JSON-LD, styles, attributes).
  The poached-pears link redirects to `/2026/09/15/easy-poached-pears/`.
  Hand-written `linked-cake.html` / `linked-pears.html` for the spec.
- **Scratch clone** (`tmp/50/link/content`, the cake with both lines linked
  by hand): the list held **16 pears, 2 bottles each of wine and pear
  juice**; the cake removed and added again with 50e: **8 pears, 1 bottle
  each**, the row noted "for Poached Pears (2 cups poached pear purée and 1½
  cups pear poaching liquid called for)".
- `linked --scan --dry-run --slug pear-panna-cotta-cake` on the scratch
  clone (the page answered from the fixture, not fetched again): `unchanged`
  — Poached Pears here already, lines 12 and 22 link it already; the crème
  fraîche link left alone ("offered instead of this line").
- Gates (after merging main `ffdd14b7`): editor typecheck ✓; export
  `tsc --noEmit` ✓; vitest 4,365 tests in 199 files — 4,362 passed, 3 failed
  only under load (5 s timeouts in `urlGuard` and `editFormRoundTrip`, both
  passing alone, and `agentLocal`'s prompt budget, fixed by leaving `linked`
  out of the local view and then passing). Playwright in Docker, production:
  `import-linked`, `import-errors`, `import-roundup`, `import-ssrf`, every
  `shopping*`, `edit-form-frame`, `recipe-notes` — **63 passed**;
  `import-linked` once in dev mode — 2 passed. Baselines moved (Docker):
  `visual.spec.ts/new-recipe-form-e2e.png` and
  `new-recipe-form-overwrite-e2e.png` (the switch's line). No new dynamic fs
  call in traced code, so no main-checkout-shaped build.

### Traps

- **Te1 — A page's card and its JSON-LD disagree on lines.** The link lives
  in the card's HTML (WPRM puts "poach the pears as instructed here" in the
  item's note); the JSON-LD's `recipeIngredient` has no links. Items are
  matched to the imported (or stored) lines by their words (≥ 60% of the
  line's words in the item, "600g" read as "600 g", ties by place), not by
  position — a model's reading, headings, or a person's edits move them.
- **Te2 — `stripMarkup` drops links.** For a person reading a rewrite, only
  the number markup is undone (`plain` in `linkedImport.ts`).

### Roger to confirm

1. Body links follow only with a cue ("recipe", "instructions", "see my");
   card steps and notes also when their link names a line (De1). Too strict
   or too loose?
2. Linked recipes are written at once, even from the form — before the
   parent is saved (De3/De10). Cancel leaves them. Alternative: create them
   only at Create.
3. Tags carry only where the linked page says them (De5).
4. "Uses: …" notes for a linked recipe no line makes (De6) — wanted, or
   noise?
5. The marks don't block Save (De7), as 45b/47i's don't.
6. A slug taken by another source's recipe fails the linked import (no
   `-zoebakes` suffix).
7. A name rule match like "1 tsp vanilla extract" ← a card note's "Homemade
   Vanilla Extract" would expand into its own lines on the list (De4).
8. Linked pages are read in the parent's `--llm` mode (the brief's rule):
   under `auto` a linked page with no recipe data is read by the model, and
   a trusted reading is imported. The review suggested `off` unless the
   parent was `force`.
9. `linked --scan` on the whole collection reads every recipe's page once,
   ≥ 15 s apart per site — hours for ~1,000 recipes; run it per slug or with
   `--limit` first.
