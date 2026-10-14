# Epic 35 — Shopping list, Halloween & Christmas content, curation polish, editor hygiene

> **This is the durable source of truth for epic 35.** Read it before touching
> the shopping list (`common/util/ingredientAmount.ts`, `aisles.ts`,
> `groupShoppingWalk.ts`, `shoppingView.ts`, `editor/controller/curation/shopping.ts`,
> `api/shopping`, `/shopping`, the `shopping_*` MCP tools), the ingredient
> grammar (`common/util/ingredientGrammar.ts`), `term assign`'s unknown-slug
> checks, root-page pins, the CLI's env loading, the import form's roundup
> picker, or F6/F7 paging.
> Update the roadmap **Status** column and the **Now** line at every phase
> boundary. Earlier epics are cited by number with a prefix (`34-D6`,
> `30-D5`). `agent-epic-34.md` (write lock, roundup import, seasonal round) is
> the background.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 35-plan open; 35a and 35b in progress; 35h (Halloween/fall content)
being prepared in the orchestrator.

## Context

Epic 34 closed on 2026-10-13 (main `8c2f81f6`, content `5a18b8d9`) with the
seasonal collections live. On 2026-10-14 Roger picked **all** of the next
directions:

1. **More Fall/Halloween content**, first, because Halloween is Oct 31.
2. **A shopping list from meal plans and recipes.** His answers: shared, in
   the content repo, so it syncs between the workstation and the Pi and works
   on his phone in the store; fed from meal plans and from any recipe;
   grouped by aisle and split by store (Hannaford and Market Basket; produce
   defaults to Market Basket); **"very configurable, a user may opt to only
   use features needed at the time"**.
3. **Curation & import polish** — epic 34's loose ends.
4. **Engine & editor hygiene.**
5. **A Christmas content round**, using Roger's own example of importing
   "top Christmas cookies" roundups. Last.

What exploration (2026-10-14) settled:

- **`--notify` 401:** the CLI never loads `editor/.env`, so it sends no token
  (`cli/backend/resolve.ts:118`, `cli/index.ts`). Epic 34's trap text ("a
  different token variable") is wrong; 35p fixes both.
- **`feature` dedupe** is already done (`AlreadyFeaturedError`); only
  `agent-mcp.md:3398` is stale.
- **Shopping list foundations:** `ingredientNames.ts` (`parseIngredientLine`,
  `nameKey`, the unit regexes), `makeable.ts` (`satisfies`,
  `DEFAULT_STAPLES`), `scale.ts` (`parseScale`), `resolveGroupItems` (one
  level), the inventory seat (`curation/inventory.ts`, the model for a shared
  file) and the copy-to-clipboard pattern (`MakePage/ImportExportDialog.tsx`).
- **Gaps:** no amount/unit/name parser, no unit merging beyond oz/ml, no
  aisle data, no group walk that keeps scale through nested plans.
- **The corpus is clean against the v4 vocabulary.** The only food stragglers
  are `lunch` (2 recipes) and 4 near-duplicate pairs (epic 33 Deferred).

Out of scope: deploys. The Pi is Roger's (`! pnpm deploy:pi`); `pnpm
workstation update` is still pending from epic 34's morning checklist (the
workstation runs the build it was restarted with on 2026-10-13 21:09, before
34c/34d's write lock).

## Decisions

### D1 — Shopping list storage: one file per item, no timestamps

`<content>/shopping/items/<ULID>.json`, one file per item, plus
`shopping/settings.json`. Not a content type, so no index. Item files carry
**no timestamps**, so Pi ↔ workstation edits merge cleanly in git: two
devices adding items, or ticking different items, never touch the same file.
(Ticking the same item on both is not a conflict: both sides wrote the same
bytes.) Two cases do conflict: one device ticks or flags an item while the
other clears it (modify/delete), or the two set _different_ flags on one item
(say `checked` and `need`, adjacent lines in a small file). The sync's merge
then aborts with `git_conflict`, nothing is lost, and the person resolves it
on the editor's Git page (keep either side; for modify/delete, deleting is
usually right). Both are rare because the list is used on one phone at a
time in the store, and "Clear checked" comes after the shop, once both
devices have synced.

### D2 — Item and settings shapes; every feature is a switch

- **Item:**
  `{id, text, recipe?, recipeName?, line?, scale?, via?, optional?, manual?, checked?, need?, store?}`.
  `text` is the ingredient line with markup removed, at 1×; `scale` and `via` (the group path) come from the
  walk (D6); `manual` marks free-text adds; `need` is "buy anyway" over
  on-hand.
- **Settings:**
  `{features: {merge, quantities, aisles, stores, onHand, sources}, aisleOrder, stores: [{id, name}], defaultStore, storeByAisle, aisleOverrides, storeOverrides}`.
  Defaults: merge, quantities, aisles and
  sources on; stores and onHand off. **Everything off = a plain checklist of
  raw lines** (Roger's "only use features needed at the time").
- Default stores Market Basket and Hannaford,
  `storeByAisle.produce = market-basket`, Hannaford the `defaultStore`; all editable.
- **Store order:** item `store` → `storeOverrides[nameKey]` →
  `storeByAisle[aisle]` → `defaultStore`.

### D3 — Nothing derived is stored

`common/util/shoppingView.ts` `buildShoppingView(items, settings, inventory,
staples)` computes merging, aisles, stores, on-hand (`satisfies`) and
quantities on every render; `formatShoppingText(view)` makes the copy text.
Storing only raw items is what lets each feature be a switch, and lets a
better parser or aisle table improve old lists.

### D4 — Amounts (35a)

`common/util/ingredientAmount.ts`: `parseAmount`, `normalizeUnit`,
`addAmounts`, `scaleAmount`, `formatAmount`, over the grammar moved unchanged
into `ingredientGrammar.ts`. Parsing follows `stripAmount`'s chain (`(14 oz)`
brackets, `plus|and`, `/1.5kg`); ranges round up; "to taste", "pinch" and
the like are "as needed"; unparseable → `null` and the caller keeps the raw
line. Unit families — US volume, metric volume, weight (oz/lb, g/kg), counts
— convert within themselves; containers (can, bunch, clove, stick…) are each
their own unit; oz is weight unless "fl oz"; **never** US ↔ metric. Display
joins families ("1 lb + 2 cups"), in the largest unit ≥ 1, rounded to ⅛ (½
for tsp). Target ≥ 90% of food lines parsed.

### D5 — Aisles (35b)

`common/util/aisles.ts`: `AISLES` = produce, meat-fish, dairy-eggs, bakery,
pantry, spices, frozen, other; `DEFAULT_AISLE_WORDS` (~300, checked against
the corpus); `aisleFor(name, overrides)` in order override → nameKey →
compounds → head word → any word → cues ("frozen", "ground/dried <spice>") →
`other`. Target ≤ 10% of food lines in `other`.

### D6 — The group walk keeps scale and counts repeats

`common/util/groupShoppingWalk.ts` `walkGroupRecipes(root, readGroup)`: an
**ancestor-path set**, not a global visited set — a sub-group listed twice
counts twice, while a cycle still stops; depth limit 32; scale is
`parseScale(item.scale) ?? 1` multiplied down the path.

### D7 — The seat: inventory-shaped, one commit per call

`editor/controller/curation/shopping.ts`, modelled on `inventory.ts`:
`readShopping`, `addToShopping({recipe, scale?} | {group, scale?} |
{items})`, `patchShopping({check, uncheck, remove, need, names,
removeSource, set})`, `clearShopping({scope})`, `updateShoppingSettings`.
Each runs under `withWriteLock` + `assertNoMergeInProgress` (34-D6), writes
atomically (34-D8), one commit per call, messages in the inventory's style:
`Update shopping list: +Week of Oct 19 (23 items)`, `✓eggs ✓flour (+3
more)`, `Clear shopping list: 12 checked`.

### D8 — Surfaces, and what is held back

- API `api/shopping` (GET, `?format=text`; POST; PATCH; DELETE) and
  `api/shopping/settings`, signed-in only; server actions `actions/shopping.ts`.
- CLI `recipes shopping [add|check|uncheck|remove|clear|settings]`.
- MCP: `shopping_get`, `shopping_add`, `shopping_check`, `shopping_remove`
  pre-approved; `shopping_clear` (destructive) and `shopping_settings_set`
  (Roger's setup) held back. Counts 49 → 55 tools, 37 → 41 pre-approved,
  12 → 14 held back — `.claude/settings.json`, SKILL.md frontmatter,
  CLAUDE.md.
- **Editor only**: no export-site version; a boundary test checks that
  `common/` and `export/` never name `shopping/items`.

### D9 — The page ticks optimistically and batches

`/shopping` (35d), mobile first: ticks are optimistic and batch into one
PATCH after 1.5 s idle or on `pagehide` (`keepalive`); retry on `busy`;
refresh when the page becomes visible again. So a run through the store is a
handful of commits, not one per item. (If the commit noise still bothers,
"keep ticks local until Done shopping" is a backlog row, not this epic.)

### D10 — `term assign` refuses unknown slugs (35p)

Throw `unknown_recipe` / `unknown_group` before writing, unless `force`,
matching the `group` seats. With `force`, a warning and a non-zero CLI exit.
Closes 34e's "assign before import lands under `missing`, exit 0" trap.

### D11 — The CLI and the stdio MCP load `editor/.env` (35p)

`process.loadEnvFile` (or `tsx --env-file`), so `--notify` sends
`RECIPE_API_TOKEN`. Environment variables already set win.

### D12 — Root pages accept subtree pins (35p)

`assertPinned` accepts carriers of any slug or alias in `subtreeKeys(tree,
slug)`; the page already applies pins over the merged rows (34-D1).

### D13 — Content rounds

Single-agent in the orchestrator, as 33/34e: a review Artifact, Roger's OK,
a rehearsal of the apply script on a reindexed scratch clone, the real apply
through the CLI, `POST /api/revalidate`, checks on both hosts. Sally's first
(34-D12), polite scraping (30-D5). If the workstation runs 34d+ by then, the
apply runs with it **up** as the write-safety proof; otherwise stop it first.

## Roadmap

| Phase    | Branch                     | Size | Status | What                                                                   |
| -------- | -------------------------- | ---- | ------ | ---------------------------------------------------------------------- |
| 35-plan  | `agent/35-plan`            | S    | 🟡     | This doc.                                                              |
| 35h      | content repo               | M    | 🟡     | Extra Fall & Halloween content; `lunch` → `sandwich`; near-duplicates. |
| 35a      | `agent/35a-amounts`        | M    | 🟡     | D4: grammar module, `ingredientAmount.ts`, `measure-shopping.ts`.      |
| 35b      | `agent/35b-aisles-walk`    | S    | 🟡     | D5, D6: aisles, the group walk.                                        |
| 35p      | `agent/35p-polish`         | M    | 📝     | D10–D12, inspect-list warning, browser term tools.                     |
| 35c      | `agent/35c-shopping-core`  | L    | 📝     | D1–D3, D7, D8: storage, view, seat, API, CLI, MCP.                     |
| 35d      | `agent/35d-shopping-ui`    | L    | 📝     | D9: `/shopping`, add buttons, palette, print.                          |
| 35r      | `agent/35r-roundup-picker` | M    | 📝     | Roundup list picker in the import form.                                |
| 35q      | `agent/35q-hygiene`        | M    | 📝     | F6/F7 paging, lazy CLI startup, stale doc statuses.                    |
| 35x      | content repo               | M    | 📝     | Christmas content round; a Christmas baking plan on the shopping list. |
| 35-close | `agent/35-close`           | S    | 📝     | Results, backlog, memory, the morning checklist.                       |

Ordering: 35h first (Halloween) and alongside 35a ∥ 35b. 35p starts once 35b
merges (≤ 2 PRs in CI), alongside 35c (35a + 35b). 35d after 35c; 35r after
35p, alongside 35d; 35q after 35r/35d leave CI. 35x after 35d merges and the
workstation is updated. 35h's docs ride on 35-close.

## How it runs

- One orchestrating session; code phases go to worktree workers (Opus), each
  its own PR off fresh `origin/main`, opened ready. Merge when every check
  that ran is green and the PR is `CLEAN`; merge commit; delete the branch;
  merge `main` into the next PR before merging it.
- A review agent on every M/L PR, on the local branch before its first push
  where possible.
- At most two PRs in CI at once; a worker holds its push and reports "ready
  to push" when two are open.
- Worker prompts carry the worktree setup (copy `.env.local`,
  `next-env.d.ts`), Playwright only in build mode through the heavy slot,
  scratch under `$CLAUDE_JOB_DIR/tmp/<phase>/`, never touching
  `editor/content`, the sandbox rules, and prettier before commit.

## Phases

### 35h — Extra Fall & Halloween content (orchestrator; Roger approves first)

- Candidates: the 7 not-yet-imported items of Sally's Halloween roundup
  (Reese's bark, pumpkin cupcakes, peanut butter blondies, candy bar
  blondies, black velvet cupcakes, candy corn pretzel hugs, pumpkin spice
  truffles; #14, the cookbook page, skipped); Sally's fall roundups (apple,
  pumpkin, maple) via `inspect-list`; a few savory fall dishes and fall
  drinks from other hosts only where Sally's has nothing.
- Cleanup carried along: `lunch` → `sandwich` (`term merge`); merges proposed
  for `marble-rye`/`marble-rye-bread`, `white-chili`/`white-chicken-chili`,
  `barbacoa-beef`/`-2`, `arayes`/`arayes-lebanese-…`.
- Method (34e's): reindex the scratch clone **before** `inspect-list`; a
  review page with facet tags per import; term assigns **after** imports,
  checking `missing`; rehearse on the scratch clone, then apply for real.
- Halloween stays featured; Fall too.

### 35a — Ingredient amounts (M, pure)

D4. The grammar moves unchanged (`test/ingredientNames.test.ts` green,
`measure-ingredient-names.ts` output identical); `test/ingredientAmount.test.ts`;
`editor/scripts/measure-shopping.ts` (amount half) reports % parsed, % with a
unit, % as needed, top 50 unparsed lines.

### 35b — Aisles + group walk (S, pure)

D5, D6. `test/aisles.test.ts`, `test/groupShoppingWalk.test.ts`
(`nested-groups` shapes, a duplicated sub-group, a cycle); the aisle measure.

### 35c — Shopping list core (L)

D1–D3, D7, D8. Tests: `test/shoppingView.test.ts` (each switch, mixed ticks,
store routing, on-hand, text format) and `test/shopping.test.ts` on a temp git
repo like `inventory.test.ts` (commits and messages, tick by name, remove a
recipe's source, refusal mid-merge, lock serialisation, **a two-clone merge
test**: both sides add and tick, `git merge` without conflict); the
`mcp.test.ts` and `curatorSkill.test.ts` counts. SKILL.md gets a "Shopping
list" section ("put this week's plan on the list", "I bought eggs").

### 35d — Shopping list UI (L, editor only, mobile first)

- `/shopping` (`editor/src/app/(recipes)/shopping/page.tsx`, force-dynamic,
  signed-in only); components in `common/components/ShoppingPage/` taking
  actions as props, as `MakePage` does. Header (counts, Copy, a Settings
  sheet with every switch, the store editor, aisle → store defaults, aisle
  order); a free-text add box; a store switch only when stores are on; aisle
  sections with sticky headings; rows ≥ 44 px with checkbox, quantity, a
  "from 2 recipes" disclosure, and a menu (store, with "always"; aisle;
  need-anyway; remove); folds at the bottom for "Probably on hand" and
  "Checked" (**Clear checked**).
- Add buttons: the group page `actions` slot (optional ×scale); recipe pages
  through a new `ingredientActions` slot on `RecipeView` inside
  `MultiplierProvider`, so the current scale carries.
- A command-palette entry (`destinations.ts`, `ownerOnly`); `print:` styles.
- Fixture `playwright/fixtures/test-content/shopping` and
  `playwright/tests/shopping.spec.ts`: add a plan and check the merged
  quantity, a tick commits, clear checked, the copy text, all switches off is
  a plain list, phone viewport.

### 35p — Curation & import polish (M)

D10–D12; `inspect-list` / `import-list` warn when the recipes index is
missing (`environmentExists(getIndexDirectory(...))`, as `readContentIndex`
does); browser term tools (an "Add a narrower term" link to
`/tags/new?parent=`, `NewTermPage` reads it; a rename / merge-into / delete
section on `/tags/<slug>/edit` over the existing seats, with a confirmation
step). Tests in `terms.test.ts`, `cliJson.test.ts`, `importList.test.ts`,
`term-edit.spec.ts`; fix epic 34's `--notify` trap text.

### 35r — Roundup list picker in the import form (M)

On `/new-recipe`: paste a roundup URL → `inspectList` shows the items,
existing ones marked → tick items, optionally choose a term → `importList`
in a loop (≤ 3 per call) with a progress line ("waiting 15 s for
sallysbakingaddiction.com…"); stop, and resume from `remaining`. Server
actions over the existing seats; the single-URL flow stays. Playwright with
a local fixture roundup page, as 34f's `api-write` case.

### 35q — Engine & editor hygiene (M)

- F6a–e real paging and F7's last two `[...slug]` routes
  (`packages/cms/docs/incremental-regeneration.md` §11), on the
  `recipes/page/[page]` + `Pagination` pattern; F6c (recipe editor pages)
  first; portfolio/resume lists rely on CI's portfolio job if the local
  build still OOMs. Pages need a pagination index (what blocks F7) → **a
  reindex after deploy if it lands; say so in the close-out.**
- CLI startup: lazy `await import()` of the `local` / `http` backends and
  heavy curation modules; measure `recipes reindex` wall time before and
  after (epic 29: ~7.9 s).
- Stale doc statuses: `agent-curation.md:3027,3042`;
  `agent-mcp.md:618,3398,3405,3415`; backlog rows for epic 34's traps.

### 35x — Christmas content round (orchestrator; last; Roger approves first)

`import-list --term christmas` (cookies also `cookies`) over Sally's
Christmas cookie roundups and holiday baking; holiday drinks (eggnog,
wassail…) from Sally's first. The review page asks whether to keep the
Christmas feature now or re-feature it in late November, and whether
`christmas` gets narrower terms. Applied with the workstation updated. Then
a "Christmas baking" meal plan goes on the shopping list as a real-content
check of 35c/35d.

## Verification

- Per PR: CI green; locally `pnpm --filter recipe-editor typecheck`,
  `pnpm --filter recipe-website exec tsc --noEmit`, `pnpm exec vitest run`,
  targeted Playwright specs in build mode via the heavy slot.
- 35a/35b: the measure on the real recipes (read-only) meets ≥ 90% parsed
  and ≤ 10% `other`; `ingredientNames` output unchanged.
- 35c: the two-clone merge test; `recipes shopping add --group <real plan>
--content-dir <scratch clone>` gives a sensible merged list and
  `shopping --json`'s text matches.
- 35d: on the workstation after the update — add a meal plan, tick at phone
  width, see the commit, see it on the Pi after the sync.
- 35p/35r: `term assign x --add nope` exits non-zero with `unknown_recipe`;
  `--notify` gets 200; the picker imports a fixture roundup.
- 35h/35x: counts match the review pages; pages and features render on both
  hosts.

## Traps

(Filled in per phase.)

## Results

### 35a — Ingredient amounts

`common/util/ingredientGrammar.ts` (the amount grammar — `UNITS`,
`UNIT_PATTERN`, `NUMBER`, `QUANTITY_WORDS`, `MODIFIER`, `QUANTITY_RE`,
`UNIT_RE`, `UNIT_ALT_RE`, `UNIT_OR_RE`, `UNIT_OF_RE` — moved out of
`ingredientNames` verbatim; `measure-ingredient-names.ts --all` output was
byte-identical before and after, and 35b's `half-and-half` lookahead now lives
there), `common/util/ingredientAmount.ts`, `editor/scripts/measure-shopping.ts`
(read-only, opens no index; `--lines` prints every food line beside its
amount), `test/ingredientAmount.test.ts` (98 cases).

```ts
type UnitFamily = "us-volume" | "metric-volume" | "us-weight" | "metric-weight" | "count" | "container";
interface AmountPart { qty: number; unit: string /* canonical; "" = count */; family: UnitFamily }
interface Amount { parts: AmountPart[] }            // parts: [] = as needed
AS_NEEDED; isAsNeeded(a)
parseAmount(line): Amount | null                    // null: numbers it can't read, or a heading
normalizeUnit(text): { unit, family } | null
addAmounts(...amounts): Amount                      // same family adds in the smaller unit
scaleAmount(a, factor: number | Fraction): Amount   // parts that come to ≤ 0 are dropped
formatAmount(a): string                             // "1 lb + 2 cups", "⅓ cup", "1.8 kg", "as needed"
```

Measure on the real repo: 677 recipes, 5,560 food lines (recipes with no
`drink` spec and no `drink` tag; stored and detected headings out), 893 drink
lines not measured.

| food lines                 | first pass | final     |
| -------------------------- | ---------- | --------- |
| read (amount or as needed) | 98.5%      | **99.7%** |
| with a unit                | 79.1%      | 80.5%     |
| as needed                  | 8.6%       | 8.5%      |
| — of which a bare name     | 8.3%       | 8.3%      |
| unread                     | 85 lines   | 16 lines  |

Target ≥ 90% met — 91.4% even counting bare names ("Kosher salt") as unread.
The 16 left: pie-crust notes, piping tips, `(1 Tbsp per serving)`, egg-wash
recipes in brackets.

Choices:

1. **A range takes its high end**, including one with a unit at both ends in
   one family (`200g-250g`, `2 tbsp to 1/4 cup`, `1 cup or 2 cups`); another
   family after `or` is the other measure (`100g or 1/2c` → 100 g).
2. **US and metric never convert**; `oz` is a weight unless `fl oz`.
3. **Sizes after a count**: before a container they describe it
   (`2 14.5oz cans`, `1 (15-ounce) can` → cans); a dimension leaves a count
   (`2 9-inch pie crusts` → 2, `10 inch tortillas` → 1); anything else
   multiplies, bracketed or not (`4 6-oz` and `4 (6 oz) fillets` → 24 oz)
   unless the bracket says about/total (`8 (about 2 lb) thighs` → 2 lb).
4. **As needed** = no amount and says so (to taste, pinch, dash, for
   serving, optional …) **or names no number at all**. An amount wins over a
   remark (`1 tbsp water, plus more as needed` → 1 tbsp), and adding as
   needed to an amount adds nothing.
5. **Amounts written after the name** are read (`Bread flour 300g`,
   `Salt, 5 g`, `flour 73g 60%`) only to the end of the line and with a unit
   unless a comma sets them off — `Dough from step 2` stays null.
6. **Display**: largest unit ≥ 1, to ⅛ (½ for tsp, never rounded to
   nothing; exact thirds kept). Cups below one only as ¼ ⅓ ½ ⅔ ¾, so 6 tbsp
   stays 6 tbsp. **No pints** on a list (2 cups is not "1 pint"). Metric in
   whole g/ml, tenths of a kg/l from 1000, rounded up.
7. **Everything amount-only stays local** to `ingredientAmount`: `2 Tb`,
   `2 fl. oz`, `1 and 1/2`, `a half cup`, `2 dozen`, `2 x 400g`, `1 lb 2 oz`
   are rewritten or read there, so `stripAmount` and the names are untouched.

Traps:

- **`UNIT_RE` wants whitespace after a unit**: `2 cloves, minced` was a count
  of 2. Handled in `readUnit` by spacing the comma, not in the grammar.
- **A bracket before a unit is the other measure**, not a size:
  `250 (1c) grams of water` first came out as 250 cups — "15⅝ gallons".
- **`1-1/2` reads as a range** (→ 1) unless rewritten to `1 1/2` first; the
  lookbehind keeps `1/2-3/4` a range. **`1,800`** is a thousands separator
  only as `d{1,3},ddd`; `1,5` stays a decimal.
- **`t` is a teaspoon and `T` a tablespoon** — the one case-sensitive unit.
- **Diff every changed line** when tuning: run `measure-shopping.ts --lines`
  before and after and diff the two — the 250-cups bug only showed that way,
  not in the percentages.

### 35b — Aisles + group walk

`common/util/aisles.ts` (`DEFAULT_AISLE_WORDS`: 549 keys after the chile
variety expansion), `common/util/groupShoppingWalk.ts`,
`editor/scripts/measure-aisles.ts` (read-only, opens no index). Measure on the
real repo: 468 food recipes (not `tag:drink`), 5,433 lines, 1,481 distinct
names; staples (water, ice) skipped, a line with alternatives counts as its
first.

| aisle      | lines          | distinct names |
| ---------- | -------------- | -------------- |
| produce    | 1011 (18.6%)   | 285 (19.2%)    |
| meat-fish  | 203 (3.7%)     | 113 (7.6%)     |
| dairy-eggs | 758 (14.0%)    | 137 (9.3%)     |
| bakery     | 58 (1.1%)      | 39 (2.6%)      |
| pantry     | 1904 (35.0%)   | 596 (40.2%)    |
| spices     | 1341 (24.7%)   | 190 (12.8%)    |
| frozen     | 33 (0.6%)      | 21 (1.4%)      |
| **other**  | **125 (2.3%)** | **100 (6.8%)** |

Target ≤ 10% met. What is left in `other`: things made, not bought (starter,
levain, poolish — mapped to `other` on purpose so `sourdough` can't lend them
bakery), parser junk, equipment, rare items. `--drinks`: 29.4% `other`,
mostly spirits and liqueurs, left off the grocery aisles (liquor store);
mixers, bitters and wine are pantry. `--aisle <a>` lists any aisle's names.

Choices:

1. **Cues run before the word steps**, not last as D5 had it: override →
   exact → cue → phrase (longest first) → last word → any word (right to
   left) → `other`. Otherwise the last word answers first ("frozen pea" →
   produce, "ground ginger" → produce). Cues: `frozen`; `canned`/`can`/
   `tinned`/`jarred`/`pickled` → pantry; `ground`/`powdered` send produce or
   spices to spices and leave the rest (ground beef stays meat, ground almond
   pantry); `dried` sends herbs/spices to spices, other produce to pantry.
2. **`dried` and `fresh` never reach `aisleFor` from a nameKey** —
   `ingredientNames` drops them as descriptive. Oregano, thyme, rosemary and
   sage default to spices; basil, parsley, cilantro, dill and mint to produce.
   The `dried` cue serves hand-written labels and overrides only.
3. **"1 can diced tomatoes" reads as fresh produce**: `can` is a unit, gone
   before the name. Pinned by a test.
4. **Scale is a `fraction.js` `Fraction`**, exact down the path.
5. **A `scale` on a `{group}` row is honoured** (the type allows it; the write
   schemas refuse it, so only a hand edit makes one).
6. **A malformed scale or `"0"` reads as 1**, as on the group page.
7. **`tooDeep` is a fourth result field**, beside `recipes` (each
   `{slug, scale, via, label?}`), `missing` and `cycles`. `via` runs from the
   root down to the listing group (`[root]` at the top); each group is read
   once per walk.

Also fixed in `ingredientNames`: "half-and-half" and "half & half" read as
the name `half` (8 food lines); now `half and half`.

Upstream junk seen while measuring (not fixed): water with a leftover
alternative amount ("or 4c water") is not caught as a staple; `singular`
keeps "chilis" and "pepperoncinis" (its `-is` rule).

### 35c — Shopping list core

New: `common/util/shoppingTypes.ts` (item and settings shapes,
`DEFAULT_SHOPPING_SETTINGS`, `normalizeShoppingSettings`,
`canonicalShoppingItem`, `parseShoppingItem`), `common/util/shoppingView.ts`
(`buildShoppingView`, `formatShoppingText`, `viewForStore`,
`shoppingNameOf`), the seat `editor/controller/curation/shopping.ts`, the
routes `api/shopping` and `api/shopping/settings`, the server actions
`controller/actions/shopping.ts` (for 35d), `cli/commands/shopping.ts`, six
MCP tools, `test/shoppingView.test.ts` (18) and `test/shopping.test.ts` (19).
Changed: `makeable.ts` exports `probablyOnHand` (the on-hand rule without the
corpus alias check), `UnknownRecipeError` takes `{forceHint: false}`, the
backend seam, `cli/index.ts`, `mcp/registry.ts`, the D8 allow-list
(`controller/buildIndexValue` for `flattenMarkdown`), and the counts in
`.claude/settings.json`, SKILL.md (frontmatter, a "8b. The shopping list"
section, "Held back", the CLI fallback) and CLAUDE.md.

Surface:

| Where   | What                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seat    | `readShopping`, `readShoppingView(ctx, {store?})`, `addToShopping`, `patchShopping`, `clearShopping`, `getShoppingSettings`, `updateShoppingSettings`                                                                                                                                                                                                                                                       |
| API     | `GET /api/shopping` → `{items, settings, view, text, path}` (`?format=text` → `text/plain`, `?store=<id>`); `POST` add; `PATCH` patch; `DELETE ?scope=checked\|all`; `GET`/`PATCH /api/shopping/settings`. Every verb authenticates; GETs need a read token, the rest a write token (no new scope — inventory has none).                                                                                    |
| Actions | `loadShoppingList`, `addToShoppingList`, `updateShoppingList`, `clearShoppingList`, `updateShoppingListSettings` → the result or `{error, code}` (so the page can retry on `busy`)                                                                                                                                                                                                                          |
| CLI     | `shopping [list] [--store id]`, `shopping add (--recipe s \| --group s) [--scale 2] \| <line…>`, `shopping check\|uncheck <id\|name…>`, `shopping remove <id…> \| --recipe s \| --group s`, `shopping clear [--all] [--yes]`, `shopping settings [set <key> <value…>]` (keys `features.<name> on\|off`, `default-store`, `store-for-aisle`, `store-for <name…>`, `aisle-for <name…>`); local and `--remote` |
| MCP     | `shopping_get {store?}` → `{text, view, settings}`; `shopping_add`; `shopping_check {ids?, names?, uncheck?}`; `shopping_remove {ids \| recipe \| group}` — pre-approved. `shopping_clear` (destructive) and `shopping_settings_set` held back. 55 tools, 41 pre-approved, 14 held back.                                                                                                                    |

Choices (departures from the brief marked):

1. **Item ids are lowercase ULIDs**, the file stem; a file's own `id` field
   is overridden by its name, and only files named like an id are read, so a
   patch can only ever touch files the list already holds. A file that does
   not parse (conflict markers mid-merge) is skipped, not fatal.
2. **Falsy flags and empty values are left out of the file** (`checked:
false` is no key), keys in D2's order: two devices that tick the same
   item write the same bytes, which the two-clone test merges cleanly.
3. **Scale is stored as `Fraction.toFraction()`** (`"2"`, `"1/2"`, `"3/2"`) —
   a plan's row scale times the call's `scale`; 1 is stored as no key.
4. **The merge key is the line's first name** (`nameKey`, as 35b counts a
   line with alternatives); a line no name can be read from keys on its
   folded text, so only identical lines merge. **`all-purpose flour` and
   `flour` are two rows** — exact names only, as the brief says.
5. **Display names go plural** when the amount is a count above one or a
   source line wrote the plural (`3 eggs`, `1 cup chocolate chips`), never
   for one of a thing. A partly ticked merged row's `label` shows what is
   left (`remaining`); `quantity` stays the total.
6. **Merge off, quantities on**: the raw line with a scale badge (`3 eggs
(2×)`), and `quantity` carries the scaled amount for the UI. All switches
   off is the raw lines in id order (pinned).
7. **Departure — `set` is `{ids, store | null}` only.** Per-item aisle is not
   in D2's item shape; an aisle belongs to the ingredient, so it is
   `settings.aisleOverrides` (keyed by name). "Always at this store" is
   `settings.storeOverrides`.
8. **Departure — `uncheckNames`** joins `names`, so "uncheck eggs" works
   from the CLI and `shopping_check {uncheck: true, names}`.
9. **Override keys go through `shoppingNameOf`** (`"Eggs"` → `egg`), the key
   the view routes and merges by. Replacing `stores` drops the routes and
   overrides that named a removed store (and moves `defaultStore` to the
   first); naming a store that does not exist anywhere else is `validation`.
10. **Unknown ids are reported (`unknown`), not refused**: 35d's batched
    ticks may name an item another device has just cleared. Names matching
    nothing come back in `unmatched`.
11. **`shopping_get {store}` turns stores on for that answer**, so "what's
    left at Market Basket" works whatever the page's switch says; an unknown
    store id is `validation`.
12. **Text format**: store headings upper-case, aisle headings `Produce:`,
    one plain line per row, unread lines indented `  · …` under their name,
    the on-hand fold last ("Probably on hand:"), ticked rows omitted unless
    `{checked: true}`; an empty list reads "The list is empty."
13. **Removal wins** inside one patch; commit subjects use `✓` tick, `☐`
    untick, `−` remove, `need:`/`-need:`, `name→store`, `-Chili (12 items)`
    for a source, shortened past 56 characters as the inventory's are.
14. **CLI lines are one per argument**, as `inventory add`; `remove` takes
    ids (not names); `clear` asks (or needs `--yes`) for both scopes.

Review round (all with tests):

15. **Caps.** A plan walk stops at `MAX_WALKED_RECIPES` = 500 recipe rows or
    `MAX_WALKED_GROUPS` = 2,000 group visits (`walkGroupRecipes`' new
    `limits`, answering `truncated: true`) and the add is refused with
    `validation`, nothing written — a sub-plan listed twice at every level
    would otherwise fan out as 2^depth inside the write lock. No add may take
    the list past `MAX_SHOPPING_ITEMS` = 5,000. Override maps hold at most
    1,000 entries, 200 per change. Typed lines collapse control characters
    (a pasted newline or tab) to a space.
16. **A failure never leaves files uncommitted.** A file write or delete
    that fails part-way commits what was done as `<message> (partial)` and
    rethrows (`withBatchCommit`'s convention); a commit that fails puts every
    touched file back from the bytes read just before the write (the
    settings file too), so the tree is as it was. `shoppingTestHooks` is the
    test seam.
17. **`changed` is truthful.** A patch writes only items whose final form
    differs from what is stored, so `{check: [x], uncheck: [x]}` is
    `changed: false` with no commit, and its parts drop out of the subject.
18. **Commit subjects for typed lines use the text as typed** (`+paper
towels +2 lemons`).
19. **An aisle override reaches a line no name can be read from** (keyed
    `text:…`), checked before `aisleFor`.
20. **"Nothing left to buy."** when every row is ticked; `viewForStore`
    counts the narrowed view itself.
21. **No reindex for a shopping or inventory commit from elsewhere.**
    `curation/unindexed.ts`: `changesOnlyUnindexed(dir, from, to)` (`git diff
--name-only -z --no-renames`; true only if every path is under
    `shopping/` or `inventory/`, false on any doubt — no stamp, a failed
    diff, one other path) and `advanceStampPastUnindexed` (under the write
    lock). The instance's D12 `reindexWhenForeign` and the pull/sync merge
    (`mergeLocked`, only when the stamp named the pre-merge HEAD) now move
    the stamp instead of rebuilding — no `refreshEditor`, no `onBulkChange`
    (`revalidatePath("/", "layout")`). Anything else rebuilds as before.
    Without this every tick the other device synced in cost a full reindex
    (2.5 s on the Pi) and a whole-site revalidate.

Gates: editor typecheck and export `tsc` clean; vitest **70 files / 1500 tests** (+2 files, +40 tests: shoppingView 18, shopping 19, mcp +1, curatorSkill +1, cliJson +1).
After the review round: vitest **70 files / 1512 tests** (+12: shopping +7,
shoppingView +2, groupShoppingWalk +1, curationGit +1, instance +1); both
typechecks clean. No Playwright (no pages; 35d builds the UI).

Traps:

- **`MergeInProgressError` has no `code`** — the `dirty_tree` mapping
  happens in `toErrorObject`; a test asserting `code` on the raw error fails.
- **35a's formatter gives `1 quart flour`** for 4 cups (largest unit ≥ 1;
  only pints are excluded). Fine for liquids, odd for flour and sugar on a
  list — a 35d/35-close call whether quarts (and gallons) should go the way
  of pints for dry goods.
- **A plan walk counts repeats, so it can explode**: cap it before walking
  inside the write lock (choice 15).
- **Every foreign HEAD move used to cost a full reindex**, a tick included;
  a new unindexed directory must join `UNINDEXED_DIRECTORIES` to skip it.
- **The real content repo has no meal plans yet** (no `groups/` directory),
  so the scratch check below made one in the clone.

Scratch check (real content at `ba2b1754`, cloned to the job's scratch dir
without media, reindexed with the CLI, deleted afterwards): a plan "Week of
Oct 19" — white chicken chili ×2, hard-shell beef tacos, skillet apple cider
chicken, and a nested "Soups" plan (carrot ginger, navy bean) — made in the
clone, then `recipes shopping add --group scratch-week-of-oct-19`: **86
items, 63 rows, one commit** ("Update shopping list: +Week of Oct 19 (86
items)"), a clean tree. `recipes shopping` and `shopping --json`'s `text`
were byte-identical. `shopping check onions garlic` ticked 5 lines in one
commit ("✓onions ✓garlic"; `white onion` and `yellow onion` are their own
rows), and `--store market-basket` printed the produce section. An excerpt
of the default view:

```
Produce:
2 + 1 cup onion
4 cans green chiles
25 g + 4 cloves garlic
2 lb + 1 carrots
cilantro

Meat & fish:
2 lb chicken breasts
2 lb ground beef

Pantry:
4 cans great northern beans
1 quart stock
1½ quarts low sodium chicken broth

Spices:
2 tsp + 10 g ground cumin
2 bay leaves
```

Read on the real list: a count joined to a measure reads badly (`2 + 1 cup
onion`, `2 lb + 1 carrots`) — 35a's join puts the bare count first with no
noun. Worth a look in 35d (show the count with its name, `2 onions + 1
cup`), along with the quarts above. Source junk shows through as written
(`8 ox sharp cheddar cheeses`).

### 35d — Shopping list UI

New: `editor/src/app/(recipes)/shopping/page.tsx` (force-dynamic; a guest is
sent to sign in), `common/components/ShoppingPage/` — `index.tsx` (the page),
`useShoppingList.ts` (state, tick batching, server actions as props),
`ShoppingRowView.tsx` (row + menu), `SettingsSheet.tsx`, `AddToShopping.tsx`
(the group and recipe buttons) — and `common/util/shoppingTickQueue.ts` (the
pure half of D9). Changed: `RecipeView` takes `ingredientActions` (rendered in
the Ingredients header, inside `MultiplierProvider`; only the editor's recipe
page passes it, and only when signed in); the editor's group page gets "Add to
shopping list" with an optional ×scale in its `actions` (signed in only); a
`/shopping` palette entry (`ownerOnly`); `loadShoppingList` now answers
`{items, settings, inventory}` — the browser builds the view itself (D3).

**The page, top to bottom (phone width):** a title row with **Copy** and
**Settings**; a counts line ("10 to buy · 2 probably on hand · 3 checked",
plus "Saving…" while ticks are pending); an error banner with Retry when a
flush was refused; the add box (a one-line textarea that grows; Enter adds,
a paste of several lines adds one item per line); the store switch (All /
Market Basket / Hannaford with counts) only when stores are on; then the
list — a store heading per store under All, aisle sections whose headings
are `sticky-chrome` under the masthead, rows of a 20 px checkbox with the
line as its `<label>` (row ≥ 44 px), the unread lines indented under it,
"1 of 2 ticked · optional · buy anyway" notes, a "from 2 recipes" disclosure
(recipe ×scale · plan path — line), and a ⋯ menu (store select with "Always
buy eggs at Hannaford", aisle select — for every line of that name —, "Buy
even if on hand", Remove). At the bottom, two folds: "Probably on hand (n)"
when on hand is on, and "Checked (n)" with **Clear checked** and an in-page
confirm ("Remove 4 ticked lines from the list?" → Clear 4 / Cancel). The
Settings sheet edits a draft — every switch with a line on what it does, the
stores (rename, remove, add), the default store, each aisle's store and the
aisle order (up/down) — saved as one change (one commit). Print hides every
control and both folds, keeps sections together and prints the checkboxes.

Choices:

1. **Ticks go to `PATCH /api/shopping` by `fetch`**, not a server action: a
   server action cannot be `keepalive`, and the route already takes the
   session cookie. After 1.5 s of quiet, on `visibilitychange → hidden` and
   on `pagehide` (`keepalive: true`); retried at 1, 2, 4 … 30 s on a 5xx or
   a dropped connection; a 4xx (signed out) shows the banner and keeps the
   ticks. Pending ticks live in memory and `sessionStorage` (try/catch) until
   the server answers; a tick and untick in one quiet spell cancel out.
   The page re-reads the list (`loadShoppingList`) when it becomes visible
   again. "Clear checked" flushes pending ticks first.
2. **Every other change is a server action** answered with the items (or the
   settings), applied when it returns — no optimistic add or remove.
3. **The view is computed in the browser** from the items with the pending
   ticks over them (`applyPending`), so a tick moves a row to Checked at once.
4. **Overrides from the row menu key by the row's name** (`eggs` → `egg`
   through `shoppingNameOf`), so "Always at this store" and the aisle choice
   apply to every line of that ingredient.
5. **Store choice is per viewer** (`localStorage`); an unknown or stale
   store falls back to All.
6. **No new dependencies**; native `<select>` and checkboxes (better on a
   phone, and real form controls), the library's Sheet, Popover and Dialog.
7. **35a display fixes** (asked for in review): no quarts on a list —
   volumes stay in cups up to a gallon (`1 quart stock` lists as 4 cups,
   18 cups as 1⅛ gallons); and a bare count beside a measure goes first with
   its noun — `2 onions + 1 cup`, `1 carrot + 2 lb` — instead of
   `2 + 1 cup onion` (`lineFor` in `shoppingView.ts`).

Fixture `playwright/fixtures/test-content/shopping`: Buttermilk Pancakes,
Spanish Omelette, Onion Soup; "Week of Oct 19" (pancakes ×2 + the nested
"Weeknight Dinners"); `inventory/on-hand.json` = olive oil; recipes and
groups indexed with `rebuildIndex` (a new fixture has no index directories,
so `build-fixture-indexes.ts` skips it until they exist — Traps).

Gates: editor typecheck and export `tsc` clean; vitest **71 files / 1520
tests** (+1 file, +8: shoppingTickQueue 5, shoppingView +1, ingredientAmount
+2), one 34c engine case (`curationGit` "serialises two commits started
together in one lock scope") failed once on order under load and passed on
rerun (89/89 for the file) — untouched here. Playwright in build mode through
the heavy slot: `shopping.spec groups.spec /recipe.spec command-palette.spec`
**88/89**, the one a locator in the new spec (a `summary` that also matched
the rows' source disclosures), fixed; `shopping.spec` rerun **8/8** (7 e2e +
1 `@mobile` on Pixel 5). After merging `origin/main` (35c as #224) and the
store switch moving to `useSyncExternalStore` (eslint's
`set-state-in-effect`): `shopping.spec /recipe.spec groups.spec` **53/53**.

Traps:

- **`build-fixture-indexes.ts` skips a new fixture**: it only rebuilds types
  whose index directory already exists. Create `recipes/index` and
  `groups/index` first (or call `rebuildIndex` for the one fixture), and drop
  the `.pagination-changes.json` it leaves.
- **A fixture's `groups/` is ignored by default** (`editor/.gitignore`:
  `/playwright/fixtures/test-content/*/groups/`, carved back out per
  fixture). The spec passes locally on the files on disk and fails in CI
  without the `!…/shopping/groups/` line — check the status lists them.
- **`common/` may not say "on-hand"** anywhere, comments and test ids
  included — the inventory boundary test greps for it. The fold's test id is
  `shopping-probably-have`.
- **A merged row's checkbox needs `indeterminate` set by ref**; React has no
  prop for it.

Deferred: drag-to-reorder aisles (up/down buttons instead); undo for Clear
(`git_revert` from /git does it); a per-row "ticked by" (the commit author
says who).

## Close-out

(At 35-close: what landed, traps found at close, backlog, memory, the
morning checklist — `pnpm workstation update`, Roger's `! pnpm deploy:pi`,
and whether a reindex is needed: none for the shopping list; **yes if 35q
adds a pages pagination index**.)
