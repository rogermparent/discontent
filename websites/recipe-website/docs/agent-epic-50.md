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

**Gates.** _(filled in below when run)_

### Roger to confirm

1. **Water is left off built in** (water, cold, warm, hot, boiling, tap,
   ice water), with Restore writing a rule for every list (Da3). Say if
   ice (bags of it) or anything else should join.
2. **A row is left off only when every one of its names is** (a merged row
   of water and stock stays).
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
- **Ta2 — the boundary test greps `common/` for the list's directories.**
  `shoppingLayers.ts` and `shoppingChanges.ts` say "this list's layers",
  never the path (as 49b's Tb4).
