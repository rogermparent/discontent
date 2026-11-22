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
  liquid called for)"). Lines that count batches ("2 batches", "1 recipe";
  `SubRecipeLink.batches`) still multiply — their batches add, and cover the
  measured lines beside them; "1 batch" twice is two. The plan's or recipe's
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
9. Two bare-count lines linking one sub-recipe ("1 [pie dough]" for the
   bottom, "1 [pie dough]" for the lattice) are now one batch (De8; Dd9
   reads a bare count as pieces, not batches) — Sally's crust makes two.
10. `linked --scan` on the whole collection reads every recipe's page once,
    ≥ 15 s apart per site — hours for ~1,000 recipes; run it per slug or with
    `--limit` first.
