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

**Now:** epic 35 is **closed** (2026-10-14). Every code phase is merged
(#220–#227, main `dc8970a8`), and both content rounds plus a bean-salad
round are on the real content repo (`5a18b8d9..cf40dd67`, 164 commits, not
yet on the Pi — the workstation was stopped all day). What remains is the
morning checklist in "Close-out".

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

| Phase    | Branch                     | Size | Status  | What                                                                   |
| -------- | -------------------------- | ---- | ------- | ---------------------------------------------------------------------- |
| 35-plan  | `agent/35-plan`            | S    | ✅ #220 | This doc.                                                              |
| 35h      | content repo               | M    | ✅      | Extra Fall & Halloween content; `lunch` → `sandwich`; near-duplicates. |
| 35a      | `agent/35a-amounts`        | M    | ✅ #222 | D4: grammar module, `ingredientAmount.ts`, `measure-shopping.ts`.      |
| 35b      | `agent/35b-aisles-walk`    | S    | ✅ #221 | D5, D6: aisles, the group walk.                                        |
| 35p      | `agent/35p-polish`         | M    | ✅ #223 | D10–D12, inspect-list warning, browser term tools.                     |
| 35c      | `agent/35c-shopping-core`  | L    | ✅ #224 | D1–D3, D7, D8: storage, view, seat, API, CLI, MCP.                     |
| 35d      | `agent/35d-shopping-ui`    | L    | ✅ #226 | D9: `/shopping`, add buttons, palette, print.                          |
| 35r      | `agent/35r-roundup-picker` | M    | ✅ #225 | Roundup list picker in the import form.                                |
| 35q      | `agent/35q-hygiene`        | M    | ✅ #227 | F6/F7 paging, lazy CLI startup, stale doc statuses.                    |
| 35x      | content repo               | M    | ✅      | Christmas content round; a Christmas baking plan on the shopping list. |
| 35-close | `agent/35-close`           | S    | ✅      | Results, backlog, memory, the morning checklist.                       |

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
- Review round (35d), all with tests:

8. **Tick sync moved out of React** into `common/util/shoppingTickSync.ts`
   (`TickSync`, tested with a fake `fetch` and fake timers in
   `shoppingTickSync.test.ts`, 10 cases). Two lost-tick bugs fixed:
   leaving `/shopping` by a client-side link within 1.5 s now sends the
   pending ticks (`detach` on unmount → `keepalive`); and a flush while a
   request is in flight no longer returns early — `flush()` awaits the
   flight and loops while anything is pending, and `flushNow()` (hidden,
   pagehide, unmount) sends the whole pending map at once even mid-flight
   (a PATCH of ticks is idempotent).
9. **Clear checked removes exactly the ids shown ticked** —
   `update({remove: ids})` over the visible Checked fold (this store's
   rows, pending ticks included) — never the server's `clear("checked")`,
   which could take an item just unticked here or ticked unseen elsewhere.
   Its commit reads `Update shopping list: −egg −onion`. The page no
   longer uses `clearShoppingList` (the API, CLI and MCP still clear).
10. **Stored ticks are stamped** and dropped after 10 minutes
    (`STORED_TICKS_MAX_AGE_MS`); a restore schedules a flush; a
    `keepalive` send clears the stored copy so it cannot replay over
    another device's later changes.
11. **A read started before a later write's answer is ignored** (a write
    counter in the hook), so a slow reload on becoming visible cannot undo
    a tick on screen.
12. **Thrown server actions are caught** ("Couldn't reach the editor —
    check the connection and try again."), the Settings and Add buttons
    reset in `finally`, and the visibility reload catches.
13. Nits: a refusal resets the backoff so the next tick sends; a tick while
    retrying keeps saying "retrying"; the recipe's Add to list sits below
    the ingredient list, not in the sticky header; a scale ≤ 0 disables it
    with a reason; the row menu's "Always buy …" and aisle choice name the
    ingredient (`egg`), not the whole line, when merge is off; a per-item
    store can go back to Automatic (`storePinned` on the row says which
    rows chose their own); `row.quantity` joins as the label does (`2 + 1
cup`); the add box keeps lines past 200 in the box and says so; the
    tick commit poll in the spec accepts one commit or two.

Fixture `playwright/fixtures/test-content/shopping` and
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

### 35q

- **Anything awaited before a queue is joined reorders the queue.** The
  write lock's FIFO broke because `withWriteLock` awaited an `access` and a
  git-dir lookup before `queueTurn` (#223's CI: a, b, d, c), and
  `commitContentChanges` repeated it one level up with its own
  `directoryIsGitRepo` before `withWriteLock`. fs callbacks come back from
  the thread pool in any order. Take the place in line synchronously, then
  look things up. A new writer-side helper that awaits anything before
  calling `withWriteLock` or `serialInHold` brings the flake back.
- **An idle machine hides it.** Both ordering tests passed on the old code
  when the machine was quiet; they fail reliably only with a cold lookup in
  the mix (a second spelling of the directory, whose git dir is not
  memoised yet). The stress tests use one on purpose.
- **`pnpm recipes` was two pnpm processes.** The root script was
  `pnpm --filter recipe-editor recipes`, ~1.5 s of every call before node
  started. It now runs the editor's tsx directly; `INIT_CWD` is still the
  caller's directory, so relative paths resolve as before.
- **A page param on `/pages` is a search param**: both editors serve content
  pages at nested slugs through a root `[...slug]`, which a `/pages/[page]`
  segment would shadow.
- **`pages.spec` as a Playwright regex also matches `tag-pages.spec`** — the
  35q run was 36 tests, not 5.

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
  term (the vocabulary's slugs offered, labels shown) and, for a new one,
  its label — `import-list --term / --term-label`. A typed label is
  resolved to its term's slug on the server (`resolveTermSlug`: a known
  slug stands, else an exact label match ignoring case), because the seat
  slugs what it gets and "Speed & effort" would otherwise create
  `speed-and-effort` beside `effort`. With a term, existing items
  unlock, so a re-run can tag them too.
- **Import**: the client loops `importRoundupAction` over chunks of **at
  most three picks** (`ROUNDUP_CHUNK`; the action refuses more and passes it
  as the seat's `limit`). A call re-fetches the list page and then makes
  a page and an image request per pick, each 15 s after the last request
  to that site: seven requests, so ≥ 105 s against one site when the
  previous call just ended there, plus 15 s per 403 retry. The progress
  line reads "Imported 4 of 9 · fetching 5, 6, 7 from
  sallysbakingaddiction.com — one request every 15 s per site…"; each result
  links its recipe or says why it failed. **Stop** halts after the current
  call; **Resume (N left)** continues from the queue. A double-click on
  Import cannot land on Stop (Import stays put, disabled, as "Importing…";
  Stop sits by the progress line), the form's Import
  and Submit wait while a run is in flight, and recipe links open in a new
  tab. Leaving the page (an unmount) stops after the current call; a
  reload loses the
  progress (the section says so); listing again marks what landed.
- **Server side**: `authenticateUser` (`unauthenticated` otherwise), then
  `curationContextFor` — the context the API routes use, so each imported
  recipe (its own commit) and the term's create-and-assign revalidate as
  `/api/import-list` does. The input is a strict zod object, so a bad shape
  is `validation`; the URL and picks then go through the seat's own checks (`checkUrl`, the
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
4. **The form waits during a run** (a client wrapper, `workspace.tsx`, shares
   the flag), so a hand-made recipe cannot race the run for a slug.

Gates: `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; `pnpm exec vitest run` 70 files,
1479 tests passed. Playwright in build mode through the heavy slot
(`import-roundup.spec`, `new-recipe.spec`, `accessibility.spec`,
`visual.spec` with `--update-snapshots`): 90 passed; only the two
`new-recipe-form*` baselines changed, regenerated on this machine rather than
in the CI image. After the review fixes (unmount stop, new-tab links, term
slugs, Stop moved off Import, the form waiting, strict input): vitest 1481
passed; `import-roundup.spec` + `new-recipe.spec` 43 passed.

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
After the review round: vitest **72 files / 1530 tests**; Playwright
`shopping.spec /recipe.spec groups.spec yield.spec` **55/55**.

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

### 35q — Engine & editor hygiene

**Reindex needed: no.** No index, keyspace, index value or spec version
changed; no fixture index was rebuilt (the one new fixture, `many-pages`,
carries only its own pages index, built by `seed-pages.ts --many 21`).

**Write-lock FIFO.** `withWriteLock` now takes its place in line at call
time: each call joins a per-directory entry chain synchronously, starts its
lookups (`access`, the git dir) at once, but applies the result — the
re-entry check and `queueTurn`'s synchronous enqueue — only after every
earlier call has applied its own, then leaves the chain (never held through
a turn, so a re-entrant call cannot wait behind its own hold). The chain
keys on the directory's **real path** (`realpathSync`, cached per spelling;
`resolve` while it does not exist), as the lock file does, so a symlinked
spelling and the real one share a chain as they share a lock. The wait on
earlier callers **races the write's deadline** and ends in
`RepositoryBusyError`; a caller that gives up leaves the chain at once, so
one stuck lookup holds the rest only until their own deadlines (review
round).
`commitContentChanges` had the same bug one level up — its own
`directoryIsGitRepo` before `withWriteLock` — and was the cause of the local
`curationGit` "serialises two commits" flake; the check now runs inside the
lock and `serialInHold`. New tests: 20 writers × 5 rounds with nested
re-entry; mixed directory spellings plus a non-repo; 8 commits × 3 rounds in
one lock scope; and a symlink + real path alternating, for `withWriteLock`
(12 × 5) and for `commitContentChanges` in one hold (8 × 3). Each fails on `origin/main`'s code (the commit test with
both old modules). `shopping.test`'s walk-cap case (12 committed writes +
256 rows) gets a 30 s timeout — it took 4–8 s under load on either code.

**F6 — the editor lists page, without an index** (F29's finding taken
literally: the affordance is the change). The lists already read their
content index by `limit`/`offset`, and the values are a name and a date.
`@discontent/cms/content/listPage` (`parseListPage`, `readListPage`) and
`@discontent/component-library/components/ListPagination` (Newer / number /
Older, `?page=N`): F6c recipe `/pages`, F6b portfolio `/pages`, F6a
portfolio `/projects`, 20 a page; a bad or past-the-end page is a 404. F6d:
the resume home's "More" linked `/resumes`, which no longer existed — it now
lists every resume, paged. F6e closed: the menus pages are two fixed links.
**F7's two `[...slug]` routes stay open**: nothing now waits on a pages
index, the routes read `{name}` values only, and the real repo has no
pages (`incremental-regeneration.md` §11 has the reasoning).

**CLI startup** — interleaved A/B against an `origin/main` export at the
same load, 4 runs each, ms; reindex on a scratch clone of the real repo
(718 recipes; deleted afterwards):

| `pnpm --silent recipes …` | before    | after     |
| ------------------------- | --------- | --------- |
| `--help`                  | 3687–5072 | 1967–2114 |
| `list --limit 1 --json`   | 3307–6641 | 2655–4101 |
| `reindex --json`          | 5985–7077 | 3834–4653 |

Of a reindex, the rebuild itself is ~1.5 s (`timings.total` 1526). Where the
time went: the root script's second pnpm process (~1.5 s; the root
`recipes` script now runs the editor's tsx directly), the local backend
(~1 s; `resolve.ts` imports the chosen backend on demand, so `--help`, usage
errors and remote runs skip it), the page parsers (~0.35–0.45 s, loaded by
every command through `imageImport.ts` → `importRecipeData.ts`; the polite
fetch moved to `common/util/politeFetch.ts`, and `local.ts` imports the
import/inspect seats when called), and the engine's write path loaded just
to `instanceof` a `SlugConflictError` (now `@discontent/cms/content/errors`,
re-exported from `createContent`). What remains for `--help` is pnpm (~1 s)
and tsx (~0.5 s). `createBackend`/`resolveBackend` are async now; the CLI
and the stdio MCP server await them.

**Stale doc statuses** checked against the code: `agent-curation.md`
Deferred (per-item servings → 32g; the tag-vocabulary migration → epic 33;
"featured recipes as a group kind" is still a backlog row, annotated);
`agent-mcp.md` (the `group:` skill note and the server-side `group:` row →
30a; featured dedupe → 31a; read-only tokens → 27b, `.mcp.json` still
stdio-only). The backlog's epic-34 rows 35p fixed were already struck; a new
row records that resume-builder's Tailwind `@source` misses the shared kit
(F6d's pagination renders unstyled there until it is fixed).

Gates: editor typecheck and export `tsc` clean; portfolio editor typecheck
and resume-builder `tsc` clean (resume needs its gitignored
`next-env.d.ts`); vitest **72 files / 1533 tests**; Playwright (build mode,
heavy slot) `pages.spec` + `settings-nav.spec` — **36 passed** (the regex
also took `tag-pages.spec`), including the two new F6c cases. Portfolio and
resume Playwright not run locally (portfolio's prod build OOMs; CI's
portfolio job is the gate; resume-builder has no CI job); neither has a
list spec that pages.

### 35h — Extra Fall & Halloween content (applied 2026-10-14)

Review page: Artifact "Fall & Halloween Round" (https://claude.ai/artifact/82PXa5GheMWUDurTGmdEgH). Roger: "Go with your defaults".

- 42 imports, all from Sally's: 7 from the Halloween roundup (#2,6,8,9,11,12,13), 10 pumpkin desserts, 10 apple recipes, 8 fall dinners, 4 fall cakes (via `import-list --term halloween|fall`, ≤6 per call), 3 singles via `import --tags` (maple walnut tassies, maple pecan pie, homemade apple cider → warm-drinks). Sally's had savory fall dinners and a fall drink, so no other host was needed.
- Facets per import, assigned after the imports (no `missing`); `quick` from imported totalTime ≤ 30; `vegetarian` checked against ingredients ("vegetable broth" allowed).
- Cleanup: `lunch` tag removed from its 2 carriers (both already `sandwich`; a merge would alias `lunch` to every sandwich); `marble-rye-bread` deleted (same 9 ingredients as `marble-rye`, which has the photo); the other three "pairs" are different recipes (6/15, 1/14, 0/19 shared lines) — kept; "arayes" renamed "Arayes".
- Applied with the workstation **stopped** (found stopped since 02:45, pre-34c build): content `5a18b8d9..` 79 commits (42 creates, 9 roundup collection assigns, 25 assigns, 1 vegetarian fix, unassign lunch, delete, rename), clean tree. Imports ran ~25–30 s per recipe (images), 9 import-list calls in ~21 min.
- Checks (real repo, CLI): tag:fall 61 (24+37), tag:halloween 15 (8+7), tag:thanksgiving 30 (25+5), tag:warm-drinks 12, tag:holidays 53, tag:lunch 0, 718 recipes. Host page checks wait for the workstation (its sync pushes to the Pi).
- Traps: a relative `--content-dir` from a script resolves against the repo root → every carrier silently `missing` (rehearsal caught it). The dry run's suggestedTags are not written by import-list (only `--term`), so facets must be assigned.

### 35x — Christmas content round (applied 2026-10-14)

Review page: Artifact "Christmas Baking Round"
(https://claude.ai/artifact/PNGEXYTX2TYwHSCp8CSYJa). Roger: "Christmas looks
good" — defaults.

- 33 imports: 13 from Sally's 75 best Christmas cookies (its ItemList has 15
  entries; 2 were already here), 8 from her 5-ingredient holiday treats, 9 from
  her Christmas breakfast roundup (`import-list --term christmas`, ≤ 6 per
  call), and three drinks by `import --tags`: Sally's slow cooker hot
  chocolate, Once Upon a Chef's cooked eggnog and Umami Girl's wassail (Sally's
  has neither).
- Facets after the imports; `quick` from times (only the peppermint puppy
  chow); the make-ahead breakfast casserole also `pork` (sausage).
- No narrower terms under `christmas` — `tag:christmas tag:cookies` (23),
  `tag:christmas tag:breakfast` (9) and `tag:christmas tag:drink` (3) are the
  views. The feature was left as it was (Christmas featured since epic 34).
- Applied with the workstation **stopped** (still pre-34c; Roger hadn't run
  the update): content `fc33eaa2..` 53 commits; then the shopping-list check
  below (9 more).
- Checks (real repo, CLI): `tag:christmas` 41 (8 + 33), `tag:warm-drinks` 14,
  `tag:cookies` 43, `tag:holidays` 86; 770 recipes; clean tree.

**The shopping list on real content.** A meal plan `christmas-baking`
("Christmas Baking", tagged `christmas`): spritz, gingerbread, crinkles,
peanut butter blossoms, snowballs and the iced Christmas sugar cookies.
`recipes shopping add --group christmas-baking` added 66 items in one commit
(`Update shopping list: +Christmas Baking (66 items)`); the merged view reads
like a list — "4⅜ cups unsalted butter", "12⅝ cups all purpose flour",
"5 eggs", "2½ tsp baking soda", spices in their aisle. Rough edges, now
backlog rows: an "OR: ¼ cup green … and ¼ cup red sanding sugar" alternative
line becomes an item whose parsed name keeps stray "cup"s; a sub-recipe line
("easy cookie icing") is listed as an item; "pinch salt" sits apart from
"2 tsp salt". The list is Roger's now (`/shopping`; Clear from there).

### Side request — bean salads (Roger, 2026-10-14)

"Fetch me highly rated bean salad recipes … for what can I make." A research
agent read each candidate's own JSON-LD rating; 19 imported (most ≥ 4.6 with
≥ 50 ratings; a few 19–44 ratings where they filled a style gap), all from
other hosts — Sally's only bean dish is a corn and black bean salsa. Tagged
`salad`, `beans`, `easy`, cuisine, `vegetarian` (not the tuna or the
chicken-broth French lentils), `quick` from times (12). A new term
`bean-salads` ("Bean Salads", under `salad`) carries all 29 (10 existing + 19).
Content `e59adb3c..fc33eaa2`, 23 commits. `inventory make tag:bean-salads`
judges all 29 (none unjudged); none are makeable yet because the on-hand list
is all bar stock. One slug collision on import (`lentil-salad`, two sites) —
re-imported with `--slug french-lentil-salad-with-goat-cheese` and renamed.

## Close-out

### What landed (2026-10-14)

| PR   | Phase   | Merge      | Notes                                                                                                           |
| ---- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| #220 | 35-plan | `056bd9a4` | Plan.                                                                                                           |
| #221 | 35b     | `68883331` | Aisles 2.3 % `other`; the group walk.                                                                           |
| #222 | 35a     | `8e4c412e` | 99.7 % of food lines read; one review round (inch sizes, unit ranges, dozens, unit pairs, metric display).      |
| #224 | 35c     | `0d2d9c72` | One review round (fan-out caps, partial commits, truthful `changed`, reindex skip for shopping/inventory).      |
| #223 | 35p     | `9beb77dc` | One review round (no `editor/.env` under vitest, relative `RECIPE_ENV_FILE`); a writeLock flake → 35q.          |
| #225 | 35r     | `e66ea9ea` | One review round (loop stops on navigation, labels → slugs, form waits); the two moved baselines passed CI.     |
| #227 | 35q     | `81dff575` | FIFO fix keyed on the real path; F6 via `?page=N`; CLI `--help` ~4.3 s → ~2 s. No new index.                    |
| #226 | 35d     | `dc8970a8` | Two review rounds' worth of tick-queue fixes; CI baseline for the recipe page; a hydration wait for `next dev`. |

Every M/L PR had a review agent; each found real issues, two of them blocking
(35d's lost ticks). **No index layout changed: no reindex is needed.**

### Traps found at close

- **`gh pr merge --delete-branch` removes the worker's worktree** (it deletes
  the local branch, and the harness's worktree with it), so a worker cannot
  be resumed for its next phase. For a worker that continues: `gh pr merge
--merge`, then `gh api -X DELETE repos/rogermparent/discontent/git/refs/heads/<branch>`.
- **A relative `--content-dir` from a script resolves against the repo root**
  (the CLI runs from there), and every carrier is then silently `missing` —
  scripts pass absolute paths. (35p's `term assign` now refuses unknown slugs,
  which would have made this loud.)
- **Out-of-order lock waits** — writeLock's in-process queue was entered after
  async lookups, so same-process writers could run out of call order (CI flake
  on #223); fixed in 35q, keyed on the real path.
- **`next dev` hydration in Playwright**: a test that clicks right after
  navigation can click before React hydrates (35d's `@mobile` case in CI); the
  shopping page and the group add form expose `data-ready="true"`.
- **Visual baselines come from CI**, never the host: 35d took CI's
  `recipe-detail-signed-in-actual.png` from the shard's blob report.

### Backlog (new rows in `backlog.md`)

- Shopping list: alternative ("OR: …") lines, sub-recipe expansion (a line
  that links a recipe, e.g. "easy cookie icing"), and as-needed lines merging
  with measured ones ("pinch salt" + "2 tsp salt").
- Shopping list: keep ticks local until "Done shopping", if the per-batch
  commits turn out to be noise.
- The import form's roundup picker row is struck (35r).

### Morning checklist (Roger)

1. **`pnpm workstation update`** — the workstation has been stopped since
   02:45 on 2026-10-14 and is still on the build from 2026-10-13 21:09 (pre
   34c/34d). The update brings epics 34 and 35 and restarts the sync, which
   then pushes today's 164 content commits (`5a18b8d9..cf40dd67`) to the Pi.
   The main checkout is already at `dc8970a8`.
2. **`! pnpm deploy:pi`** — the Pi gets the shopping list, the import picker,
   the term tools and the write-lock fixes.
3. **No reindex** — no index layout changed (35q paged the lists without a
   new index).
4. Then check on both hosts: `/tags/fall` 61, `/tags/halloween` 15,
   `/tags/christmas` 41, `/tags/bean-salads` 29, `/shopping` shows the
   Christmas Baking list (phone width too), and `/group/christmas-baking`.
