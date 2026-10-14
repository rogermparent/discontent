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
(Ticking the same item on both is the only conflict, and both sides wrote the
same value.)

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

`cli/editorEnv.ts`, from the entry blocks of `cli/index.ts` and
`mcp/server.ts`, so `--notify` sends `RECIPE_API_TOKEN`. As built (35p):

- **An allow-list**: only `RECIPE_API_TOKEN` and `RECIPE_EDITOR_URL` are taken
  from the file. `RECIPE_API_URL` or `CONTENT_DIRECTORY` there would change
  which corpus a bare `pnpm recipes` writes to, so the rest is ignored.
- **The environment wins, and `""` is unset.** Parsed with `util.parseEnv`
  (Node ≥ 20.12, now the root `engines.node`), not `process.loadEnvFile`:
  that one counts an empty variable as set, and `.mcp.json` passes
  `RECIPE_API_TOKEN` as `""` when the shell has none (23-T27), so it would
  never fill the one variable this is for.
- **The file** is `editor/.env` from the module, or `RECIPE_ENV_FILE`
  (relative to `INIT_CWD`, else the cwd). Under vitest (`VITEST` set) with no
  `RECIPE_ENV_FILE`, nothing is loaded, so spawned test children never carry
  the real token.
- **The token goes where the CLI goes**: with `--remote` / `RECIPE_API_URL`
  and no token in the shell, the file's token — the workstation's — is sent
  to that editor; against the Pi that is a 401, and exporting the Pi's token
  (which wins) is the fix.

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

### 35p

- **`process.loadEnvFile` counts `""` as set.** `.mcp.json` hands the MCP
  server `RECIPE_API_TOKEN: "${RECIPE_API_TOKEN:-}"`, which is `""` whenever
  the launching shell has none (23-T27), so `loadEnvFile` would never fill
  the one variable D11 is for. Checked on Node 22.23: a shell value wins, an
  empty one blocks the file. `cli/editorEnv.ts` parses with `util.parseEnv`
  and treats `""` as unset, as `resolve.ts`'s `envValue` does.
- **An unindexed corpus now warns on every roundup call.** A brand-new
  content directory (or a test's tmpdir) has no recipes index until the
  first write or a reindex, so `inspect-list` / `import-list` there carry
  the missing-index warning — including a real import's result, because the
  index is checked when the list is read, before the first recipe lands.
- **`assertPinned` checks the tree as it is before the write.** An
  `updateTerm` that drops an alias (or a parent's child) and pins in the
  same patch is checked against the old aliases: a recipe reachable only
  through the alias being dropped is accepted, then falls off the page,
  which ignores a pin it does not list. Pin in a second update if it
  matters.
- **D10's pre-check is existence, not a parse.** Reading each `add`'s data
  file up front made a corrupt file fail before any write, which broke F34's
  `(partial)` contract (`curationGit.test.ts`). The check is `exists()` on
  the data file; a file that is there but broken still fails part-way and
  commits what landed.

### 35r

- **The visual baselines of `/new-recipe` move.** The picker is a collapsed
  `<details>` above the form, so `new-recipe-form-e2e.png` and
  `new-recipe-form-overwrite-e2e.png` (`visual.spec.ts`) were regenerated;
  any later change to the section's closed height does it again.
- **The progress line cannot count down.** One call is one `importList`
  with up to three picks; the 15 s waits happen inside it, on the server,
  where a server action cannot stream them. The line names what is being
  fetched and from which site, and the 15 s rule.

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

### 35p — Curation & import polish

**`term assign` refuses unknown slugs (D10).** `assignTerm` checks that every
`add` names a data file of its `type` before anything is written and throws
`unknown_recipe` (`recipes: [...]`) or `unknown_group` (`groups: [...]`, with
the `--force` hint) naming all of them. `force` is a `TermAssignSchema` field,
so it rides the API body as is; the CLI has `--force`, MCP `term_assign` a
`force` input and a rewritten description. Forced, a missing slug is reported
under `missing` as before, now with a `warnings` line per slug (a `remove` of
a carrier that is not there gets one too, and never throws). The CLI grew a
`CommandDef.exitCode` hook: `term assign` exits **1 whenever `missing` is
non-empty** — the result object still prints. The curator skill says import
first, then assign, and not to reach for `force`.

**The CLI and the stdio MCP load `editor/.env` (D11)** — `cli/editorEnv.ts`,
called from the `require.main` blocks of `cli/index.ts` and `mcp/server.ts`
(so a test that imports `main` keeps its own environment). The file is
`../.env` from the module, or `RECIPE_ENV_FILE`. **Only `RECIPE_API_TOKEN`
and `RECIPE_EDITOR_URL` are read** (decision below); a variable already set
and non-empty wins. Epic 34's trap text is corrected (34e Traps).

**`inspect-list` / `import-list` warn on a missing recipes index.**
`existingBySource` asks `environmentExists(getIndexDirectory(...))` first, as
`readContentIndex` does, and both results carry `warnings: [MISSING_INDEX_WARNING]`
("…`existing` is empty — every item reads as new. Reindex first"). The CLI
prints it as a `! …` line in the human format and on stderr under `--json`,
the convention every other `warnings` follows.

**Root pages pin their subtree (D12).** `assertPinned` reads the tree
aggregate and accepts a recipe when any tag slugs to a key of
`subtreeKeys(tree, slug)` — a narrower term or an alias of one; the refusal
now says "…or a narrower one". The page already applied pins over the merged
subtree rows (34-D1; `tagTerms.test.ts` pins `course` → `sugar`). The edit
page's pin suggestions come from the subtree's rows too, and the field's help
text says so.

**Browser term tools.** The editor term page has **Add a narrower term** →
`/tags/new?parent=<slug>` for a term with a record (only a record can be a
parent); `/tags/new` preselects `?parent=` when the select offers it and
ignores it otherwise. `/tags/<slug>/edit` has a **Rename, merge or delete**
section (`tags/[tag]/edit/tools.tsx`) over `renameTerm` / `mergeTerm` /
`deleteTerm`, through three server actions beside the form's
(`actions/tagTerms.ts`) and a Next-free half, `controller/termTools.ts`. Each
tool's first submit (button or Enter) opens an in-page confirmation that
names the slugs and the carrier count; **Confirm rename / merge / delete**
writes. A rename or merge redirects to the destination's edit page, a delete
to its own, with the outcome in the query
(`?done=renamed&from=cookies&recipes=8&groups=0&alias=1`) printed as a
notice; the deleted slug's edit
page shows the notice instead of a 404. Delete offers "Also remove the tag
from its N recipes and M groups" (the seat's `unassign`) when the term is
carried, and a refusal says to tick it.

Choices:

1. **Allow-list, not the whole file.** The main checkout's `editor/.env`
   holds only `RECIPE_API_TOKEN` today, but it is the editor app's file:
   `RECIPE_API_URL` there would turn every bare `pnpm recipes` remote, and
   `CONTENT_DIRECTORY` would point it at another corpus. So only the two
   variables that say how to _reach_ an editor are taken. `RECIPE_EDITOR_URL`
   set in the file turns notify on for every local write, as it does from a
   shell.
2. **Exit 1 for any `missing`**, a forced add or a remove alike: one rule —
   the call did not do everything it named.
3. **Notices live on the edit page**, which is per-request already; reading a
   query on `/tags/<slug>` would make every prerendered term page dynamic.
4. **Inline confirmation, not `ConfirmDeleteButton`'s dialog**: three tools
   with fields and refusal messages in one section, and the dialog portals
   its confirm away from the form whose error it would need to show. The
   confirm buttons have their own names, as that component's note asks.
5. **`@discontent/cms/lmdb/environmentCache` joins the D8 allow-list**
   (`curation.test.ts`) — `fs` and LMDB only, under every content read.

Gates: `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; `pnpm exec vitest run` 68 files,
1373 tests passed (69 files, 1472 tests after merging 35a and the review fixes); Playwright in build mode through the heavy slot
(`term-edit.spec`, `api-write.spec`, `tag-pages.spec`) 59/59 passed.

**`--force` needs the new editor.** `force` is a new key in the strict
`TermAssignSchema`, so `term assign --force --remote <editor>` against an
editor not yet redeployed with 35p (the Pi until `pnpm deploy:pi`) fails
`validation` (unrecognized key). A plain assign there still answers the old
way — an unknown slug lands in `missing`, nothing refused — and the new CLI
exits 1 on it.

Not done: the real `--notify` → 200 check against the workstation (it was
stopped during this phase); the process test drives `--notify` at a fake
editor and checks the bearer token instead.

### 35r — Roundup list picker

`/new-recipe` has an **Import from a roundup** section (`RoundupImport.tsx`,
a collapsed `<details>` above the form); the single-URL import inside the
form is unchanged.

- **List**: a server action over `inspectList` (`roundupActions.ts`) shows
  each item — number, name, thumbnail, host — with `existing` ones linked to
  their recipe and locked; the seat's `warnings` (35p's missing index)
  print above; a page that is not a roundup shows the seat's `reason` and an
  "Import it as one recipe" link to `/new-recipe?import=<url>`.
- **Pick**: everything new starts ticked; Select all / none. An optional
  term (typed, with the tag labels as suggestions) and, for a new one, its
  label — `import-list --term / --term-label`. With a term, existing items
  unlock, so a re-run can tag them too.
- **Import**: the client loops `importRoundupAction` over chunks of **at
  most three picks** (`ROUNDUP_CHUNK`; the action refuses more and passes it
  as the seat's `limit`), so one call is ~90 s at worst of 15 s per-site
  pacing. The progress line reads "Imported 4 of 9 · fetching 5, 6, 7 from
  sallysbakingaddiction.com — one request every 15 s per site…"; each result
  links its recipe or says why it failed. **Stop** halts after the current
  call; **Resume (N left)** continues from the queue. A reload loses the
  progress (the section says so); listing again marks what landed.
- **Server side**: `authenticateUser`, then `curationContextFor` — the
  context the API routes use, so each imported recipe (its own commit) and
  the term's create-and-assign revalidate as `/api/import-list` does. The
  URL and picks go through the seat's own checks (`checkUrl`, the
  importer's fetch guards, `ImportListOptionsSchema`). Errors come back as
  `{error}` objects so the loop can stop and say why.
- **Pure halves**, unit-tested (`test/roundupPicker.test.ts`):
  `controller/roundupPicker.ts` (client-safe: `nextChunk`, `hostsOf`,
  `progressLine`) and `controller/roundupSettle.ts` (server: one call's
  answer per pick). `settleChunk` requeues what the seat handed back in
  `remaining`, except a dropped site's picks — dropped for an hour, they
  would come back forever — which are reported, and a call that made no
  progress stops the loop (`stalled`).
- **Fixtures**: `importable-uploads/uploads/roundup-five.html` lists five
  tiny recipe pages (`picker-*.html`, local pictures) — one more call than
  three, so the spec can stop between calls.

Choices:

1. **Settle on the server.** Matching a dropped site needs `siteKey`, whose
   module (`roundupPage.ts`) parses HTML; the client gets outcomes instead.
2. **Existing items are locked unless a term is chosen**: importing one is
   a no-op (`existing`), but tagging it is the reason to tick it.
3. **No `sessionStorage`**: re-listing already marks what landed, and a
   half-restored queue against a page that changed is worse than none.

Gates: `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; `pnpm exec vitest run` 70 files,
1479 tests passed. Playwright in build mode through the heavy slot
(`import-roundup.spec`, `new-recipe.spec`, `accessibility.spec`,
`visual.spec` with `--update-snapshots`): 90 passed; only the two
`new-recipe-form*` baselines changed, regenerated on this machine rather than
in the CI image.

## Close-out

(At 35-close: what landed, traps found at close, backlog, memory, the
morning checklist — `pnpm workstation update`, Roger's `! pnpm deploy:pi`,
and whether a reindex is needed: none for the shopping list; **yes if 35q
adds a pages pagination index**.)
