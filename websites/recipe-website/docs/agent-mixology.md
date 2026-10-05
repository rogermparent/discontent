# Mixology mode — "the recipe site as a bar quick-reference"

> **This is the durable source of truth for the epic-25 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before planning any `25x`
> phase. Update the roadmap **Status** column and the **Next** line at every
> phase boundary. Each phase gets its own plan-mode pass seeded from this doc.
> **25a is merged (#146 → `main` `14846959`, 2026-10-04); 25b (content) is
> done in the real content repo (2026-10-04), plus six tea drinks on top. 25c
> ("What can I make?", `/make`) is in review; 25d (the editor's shared
> inventory) and 25e (sourced imports) follow — planned 2026-10-05, ahead of
> 24d, which they don't touch.** Epic 24's doc, `agent-taxonomy.md`, is
> cited by number with a `24-` prefix (`24-D5`); epic 22's and 23's the same
> way (`22-D6`, `23-D13`).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

## Why this exists

The user is learning mixology and wants the recipe app to be what they reach
for behind the bar: open a drink, read its spec at a glance, browse drinks by
style to learn the ratios, and — eventually — ask "what can I make with what
I have?". The track is run as small steps with a plan-mode pass between each.

- **Step 1 (content, 2026-10-03, no code).** Twelve drinks created in the real
  content repo with `pnpm --silent recipes create` (content commits
  `0302d63…08b67b6`): cosmopolitan, lemon-drop, elderflower-collins, saketini,
  cucumber-martini, bloody-mary, spicy-mango-mule,
  cucumber-elderflower-sake-spritz, vermouth-tonic, zero-proof-gin-and-tonic,
  mulled-wine, sangria. Tagged `drink` + base spirit + `low-abv` /
  `zero-proof`; the garnish as a "Garnish" ingredient heading; glass and
  method in the first instruction — the best the schema allowed then.
- **Step 2 = this epic's 25a + 25b.** Make drinks _read like drinks_: a spec
  card (method · glass · ice · garnish) on the recipe page, and drink
  **styles** (sour, collins, …) as browsable term pages whose descriptions
  carry the ratio.
- **Step 3 = 25c–25e.** "What can I make with…": `/make` with a browser
  inventory (25c), the editor's shared list (25d), and ~100 sourced drink
  imports to filter (25e).

## Execution model

Same as epics 22–24: a plan-mode pass per phase seeded from this doc, an Opus
implementer in a worktree off `origin/main`, a draft PR, and a merge only on
the user's go-ahead. Content phases run against the real content repo from
the updated main checkout and commit there; nothing under `editor/content`
is ever committed here.

## Facts validated before the epic (2026-10-03, on `origin/main` = `8bd91a96`)

- **F1 — The user's local `main` was 50 behind `origin/main`.** Branch from
  `origin/main`; pulling the user's checkout is their call.
- **F2 — Term records already work** (24c read side):
  `taxonomies/tag/data/<slug>/term.json` = `{label, date, description?,
parent?, pinned?}`; `/tags/<slug>` renders the description as Markdown with
  a breadcrumb and "Narrower" chips. The real repo has
  `taxonomies/tag/{index,aggregates}` and its `.gitignore` covers `*.mdb`.
  Term **writes** (CLI/MCP) only arrive at 24e, so records are hand-written
  until then (the 24c seed route).
- **F3 — Collections are a dead end for styles.** 24-D5 folds collections
  into terms, and `Group.kind` narrows to `"meal-plan"` at 24e with no
  migration — a style made as a collection now would be stranded.
- **F4 — Nothing in 24d–24f touches `Recipe` fields, `View` or
  `buildIndexValue`**, so a new optional recipe field conflicts with nothing
  in flight. 25c's matching does collide with 24d's search rewrite.
- **F5 — `source` is the precedent** for an optional nested block: form
  inputs named `source.url` etc. are nested by lodash `set` in
  `packages/cms/forms/parseFormData.ts`; `sourceSchema` collapses blanks; it is
  not on the index, so it needed no fixture or `SEARCH_DB_NAME` change (22-D6).
- **F6 — JSON-LD and the importer** know nothing about glass or ice
  (schema.org has no such properties) and the importer does not even map
  `recipeYield` today.

## Decisions log (D-list)

### D1 — One optional nested object on `Recipe`

`drink?: { method?: "shake" | "stir" | "build" | "blend"; glass?: string;
ice?: string; garnish?: string }` (`DrinkSpec`, `DRINK_METHODS` in
`common/controller/types.ts`). **Its presence is what makes a recipe a drink**
for the card; there is no separate flag. Not indexed (F5).

### D2 — The garnish lives in the spec, not the ingredient list

The card shows the whole bar spec, and 25c's "can make now" must not count a
lime wheel as a missing bottle. 25b moves the step-1 garnish headings out.

### D3 — Blanks never reach disk

Both write paths trim every part, drop empty ones, and drop the whole block
when nothing is left. The form's `drinkSchema` (`editor/controller/
parseFormData.ts`) returns `undefined`; the curation `DrinkSpecSchema`
returns `null`, which `put` reads as "clear" (D4).

### D4 — Patch semantics: whole-object replace

In a curation patch (`recipe_update`, `recipes update`, `PATCH /api/…`),
`drink` **replaces** the stored spec; `null` — or an object with nothing left
after trimming — clears it; omitted leaves it alone. No merge: a spec is four
small fields, and merge-vs-replace ambiguity is the bug a hand-written patch
would hit. Documented in the curator skill.

### D5 — Form: a collapsible "Drink" section

A `<details>` after the times row, `open` only when the recipe already has a
`drink`, so food recipes' forms look unchanged. Method is a `SelectInput`
with a blank option; glass and ice are `TextInput`s with a `<datalist>` of
common values (coupe, martini, rocks, highball, wine, mug / up, cubes,
crushed, large cube); garnish is free text.

### D6 — Card: a second `MetaBar` strip

`DrinkSpecBar` (`common/components/View/DrinkSpec.tsx`) renders right after
the Prep · Cook · Total · Yield strip, reusing `MetaBar`, method shown as
Shaken/Stirred/Built/Blended. `data-testid="drink-spec"`. Editor, export and
featured pages all render `RecipeView`, so all three get it.

### D7 — Styles are tag terms, not collections

Per F3. Root term `drink` ("Drinks") with children `sour`, `collins`,
`stirred`, `built`, `highball`, `batch`, `low-abv`, `zero-proof`; each child's
Markdown description carries the ratio/technique — the learning reference —
and `pinned` orders its drinks.

### D8 — Two stored index fields, no FlexSearch change (25c)

`buildRecipeIndexValue` gains `ingredientHeadings` (line indexes) and
`ingredientRecipeLinks` (`{line, slug}` per `/recipe/<slug>` link, relative
or absolute on any host), both written **only when non-empty** so every other
recipe re-indexes to its old bytes. They ride `/search/all` to the browser —
flattening loses a heading's `type` and a link's target, and `/make` sees only
the index. Neither is a FlexSearch field, so `SEARCH_DB_NAME` is unbumped.
Until the real repo is reindexed, readers fall back to `detectHeading` (which
misses 146 of 298 real headings — `Filling`, `Dough`, …) and to name matching.

### D9 — Matching rules (25c)

Two pure files, both run in the browser and (25d) on the server:
`common/util/ingredientNames.ts` turns a line — or an inventory item, through
the same `toName` — into words: quantity, unit and `of` stripped (a unit only
after a quantity or before `of`), cut at the first top-level comma, brands in
parentheses and `such as X` kept as **aliases**, `(or X)` and `or`/`/` as
alternatives (a one-word left part inherits the right's tail: "lemon or lime
juice"), `X-infused Y` → Y plus a **loose** X, compounds joined
(`ginger beer`), synonyms folded (`club soda`/`seltzer`/`soda` → `soda water`,
`tonic` → `tonic water`), descriptive words dropped, naive singular, `@na` for
non-alcoholic/zero-proof/alcohol-free (never "virgin"). Optional: garnish /
to-taste / `optional` lines and anything under a garnish/optional/to-serve
heading. Staples: water, ice.

`common/util/makeable.ts`: an item meets a line by an unambiguous alias
(checked first, so `Gnista` meets "non-alcoholic aperitif (Gnista)"; `Toschi`
names five syrups and meets none), else — with the **NA guard** both ways —
generic⊂specific by word tail either way (a lone vague head like `syrup`,
`liqueur`, `tea` never stands for a longer name), a **derived form** (`lime` →
`lime juice`, `hibiscus` → `hibiscus tea`, `garlic` → `garlic clove`; not
bitters), or loosely for an infusion's flavour. An unmet line can be met by
making a recipe it links or names exactly (whole corpus, one level, never
itself). Distance = missing required lines; buckets 0/1/2/further; "Buy next"
ranks by one-away recipes unlocked, then two-away helped, top 5.

### D10 — Inventory storage: the export never reads a shared list (25c/25d)

The export is browser-only: `localStorage` `make-inventory-v1` holds an
overlay `{added, removed}` (empty `shared` there, so `added` is the list) and
`make-last-query` the scope. **No export route or file exposes the editor's
list** — 25d's `inventory/on-hand.json` is not a content type, so no index,
registry entry or build ever sees it. Plain-text import/export (one per line;
a comma line, bullets, checkboxes, `#` comments, JSON array or `{items}`
accepted; 80 chars, 500 items) is the bridge between sites and browsers.

The editor (25d) layers that overlay on a committed list,
`<content>/inventory/on-hand.json` = `{"items": [...]}` (sorted, so it diffs
line by line), read **only for a signed-in session** — a guest's `/make` is
the export's page, and every `/api/inventory*` verb, GET included, goes
through `requireCurationContext`. A browser's changes reach it as an
`{add, remove}` diff (never the whole list, so a save can't drop what someone
else added), one commit each. Nothing caches the file, so no write
revalidates anything and the CLI/MCP writes carry no stale-editor hint.

### D11 — Inventory seats: four pre-approved, `inventory_set` held back (25d)

`inventory_get`, `inventory_add`, `inventory_remove` and `inventory_makeable`
join the curator's pre-approved tools (25 now: settings, skill frontmatter,
CLAUDE.md); `inventory_set` is registered but held back with the other
destructive seats — it replaces the whole list. `inventory_makeable` scopes
through `searchRecipes` (so 24d's resolver reaches it) and judges with the
same `analyzeMakeable` the page runs, over index values read with the two D8
fields. CLI: `recipes inventory [list|add <item…>|remove <item…>|set --file
f|make [<query…>]]`; a bare `inventory` is `list`, the one table command with
a default; `set --file` reads the page's Export text or JSON.

## Traps (T-list)

- **T1 — `getByLabel` matches substrings.** The Drink inputs are labelled
  Method / Glass / Ice / Garnish, none of which contains or is contained in
  another label the suite queries (checked against every `getByLabel` string
  at 25a). Rename with that in mind (`22a`'s "Source Site" precedent).
- **T2 — The curation schema is strict.** A `glas` typo inside `drink` is a
  validation error, and a CLI run from a checkout older than 25a rejects
  `drink` outright — run 25b from the updated main checkout.
- **T3 — Visual baselines.** Five form screenshots gain the collapsed Drink
  summary line and were regenerated at 25a: new-recipe, edit-populated, the
  two overwrite shots, and `markdown-source-mode` (the plan named four; the
  fifth is the edit form too). Nothing else moved.
- **T5 — Run Playwright on the default port.** The `importable-uploads`
  fixture pages hard-code `http://localhost:3019/uploads/…` as the image URL,
  so with `PLAYWRIGHT_PORT` set to anything else four image-import tests in
  `new-recipe.spec.ts` fail (`:192`, `:1296`, `:1351`, `:1403`) for no reason
  of the change's. They pass on 3019.
- **T6 — `build-fixture-indexes.ts` skips a fixture with no index
  directory.** It rebuilds only indexes that exist (opening one creates it), so
  a brand-new fixture of bare `recipe.json` files stays unindexed and every
  page reads an empty corpus. `mkdir -p <fixture>/recipes/index` first. The
  run also rewrites every other fixture's `.mdb` bytes: revert all but the
  ones whose meaning changed (25c kept `linked-recipes` and the new
  `make-drinks`).
- **T7 — FlexSearch's document type takes no tuples and no interfaces.**
  Every `MassagedRecipeEntry` field reaches `index.update()`, whose
  `DocumentData` has an index signature: a `[number, string][]` or an
  `interface`-typed object fails to typecheck. Index fields headed for the
  browser are plain `type` aliases of objects (`IngredientRecipeLink`).
- **T8 — `tag:` takes the tag string, not the slug or the label.** It matches
  by word prefix, so `tag:slow-cooker` misses "slow cooker" and a record's
  label "Drinks" misses `drink`. The term page's `/make` link uses a carrier's
  own tag string whose `tagSlug` is the term's.
- **T4 — MCP advertises the transformed schema's input side.** `DrinkSpecSchema`
  is a `.transform`; `test/mcp.test.ts` pins that `recipe_create`'s
  `inputSchema` still shows `drink` as a strict object with the method enum.

## Roadmap

| Step    | Branch / where                     | Status    | Scope                                                                                                                                                      |
| ------- | ---------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | real content repo                  | ✅ done   | 12 drinks via `recipes create` (2026-10-03)                                                                                                                |
| 25a     | `agent/25a-drink-spec` ← `main`    | ✅ done   | `Recipe.drink` (D1–D4): type, form section, both parsers, curation schemas, card, skill, this doc (M)                                                      |
| 25b     | real content repo (no code)        | ✅ done   | `drink` on the 12, garnish headings out, style tags; hand-written `drink` term tree with ratio descriptions; reindex the tag taxonomy (S code / M content) |
| **25c** | `agent/25c-make` ← `main`          | 🟡 review | Matching (D9), index fields (D8), `/make` in both apps with a browser inventory (D10), ⌘K row, term-page link (L)                                          |
| 25d     | `agent/25d-shared-inventory` ← 25c | 🟡 review | Editor's shared list `inventory/on-hand.json`: curation module, action, API, CLI, MCP seats (`inventory_set` held back), skill (M)                         |
| 25e     | real content repo (no code)        | ⬜        | ~100 sourced drink imports ("Drink (Site)", shared drink tag), sourced versions of the 18 house drinks, seed the shared inventory, reindex (L content)     |

**Now: 25c and 25d in review (25d stacked on 25c); 25e (content) after both
merge.** 24d hadn't started when 25c was
planned and 25c edits none of its files; after 24d lands, the one-line
follow-up is to pass the term resolver to `/make`'s `matchesFilter` so
`tag:drink` includes the narrower styles (every drink carries `drink` anyway).

## Phase detail

### 25a — Drink spec `agent/25a-drink-spec` ✅ done (← `main` `8bd91a96`)

Worktree `.claude/worktrees/agent-25a`.

Changed: `common/controller/{types,formState}.ts`;
`common/components/Form/{formContext,index}.tsx`;
`common/components/View/{DrinkSpec,index}.tsx`;
`editor/controller/parseFormData.ts`; `editor/controller/actions/index.ts`
(`formDataFromParsed`, `buildRecipeData`); `editor/controller/curation/
{schema,recipes}.ts`; `.claude/skills/recipe-curator/SKILL.md`.
API/CLI/MCP pick `drink` up unchanged (they import the schemas);
`ROW_FIELDS` is untouched — the spec is read with `recipe_get`.

Tests: `test/curation.test.ts` › "drink spec" (round-trip, trim, all-blank
dropped, unknown key and bad method rejected, patch replace / keep / `null` /
`{}`); `test/parseRecipeForm.test.ts` (form half of D3);
`test/mcp.test.ts` (T4); Playwright `recipe.spec.ts` › "drink spec" (fill →
card, edit prefill, clear → no card, no card on a plain recipe); the four
form baselines in `visual.spec.ts` regenerated (T3).

**Merged 2026-10-04** as #146 → `main` `14846959`, all 12 CI checks green;
remote branch deleted.

Gate results (2026-10-04): both typechecks clean; vitest 34 files / 616
tests; Playwright `recipe edit new-recipe api-write accessibility` 102 passed
on port 3125 with the four T5 image-import failures, which then passed on
3019 alongside `visual.spec.ts` (20 passed, the five T3 baselines failing as
expected and regenerated, 5 passed); CLI `create` → `show` with `drink` on a
scratch `CONTENT_DIRECTORY` stores the trimmed spec without the blank part.

Gates:

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run
pnpm --filter recipe-editor e2e-dev -- recipe.spec.ts edit.spec.ts new-recipe.spec.ts api-write.spec.ts accessibility.spec.ts visual.spec.ts
```

### 25b — Content ✅ done (real content repo)

Run the CLI from the updated main checkout (T2).

1. `recipes update <slug> --file patch.json` for the 12: add `drink`
   (method/glass/ice/garnish from the step-1 data), drop the Garnish heading
   and its lines from `ingredients`, drop a glass/method opener from
   `instructions` where it only restated the spec, add a style tag:
   cosmopolitan, lemon-drop → `sour`; elderflower-collins → `collins`;
   saketini, cucumber-martini → `stirred`; bloody-mary → `built`;
   spicy-mango-mule, cucumber-elderflower-sake-spritz, vermouth-tonic,
   zero-proof-gin-and-tonic → `highball`; mulled-wine, sangria → `batch`.
2. Hand-write `taxonomies/tag/data/<slug>/term.json` (D7) with distinct epoch
   dates: root `drink` ("Drinks", an overview of the styles) and its children,
   each description carrying the ratio — sour 2 : ¾ : ¾ shaken; collins = a
   sour lengthened with soda, tall; stirred = spirit-forward, no juice,
   martini ≈ 5 : 1; built = in the glass; highball ≈ 1 : 3; batch = scale up
   and add ≈ 20 % water to pre-mixed stirred drinks, soda per glass; low-ABV =
   a wine-strength base; zero-proof = NA spirit 1 : 1 — and a `pinned` order.
3. Reindex the tag taxonomy (Settings → Maintenance → Reload Term Database, or
   `pnpm --silent recipes reindex` with the user's go-ahead), commit the term
   records in the content repo, and check `/tags/drink` and `/tags/sour`
   (breadcrumb, narrower chips, description, pinned drinks) and
   `/recipe/cosmopolitan` (card, no Garnish heading).

**Close-out (2026-10-04).** Content repo branch `uraninite`, unpushed (the
user's). Every write was rehearsed first on a scratch copy of the affected
recipes.

- 12 `Update recipe:` commits (`e2d75b4…794fe46`). Garnish heading + line
  removed from 11 (sangria never had one); eight standalone "Garnish with …"
  steps dropped. Technique steps that mention the garnish stay (the
  Cosmopolitan's expressed twist, the Bloody Mary's "stir and garnish").
  Mulled wine has no `method` — warming in a pan is none of the four — and
  `ice: "none, served warm"`. Elderflower Collins' glass is `collins`.
- `967791b` — nine term records, root `drink` first, one minute apart from
  `2026-10-04T00:00Z`. The root has no `pinned`; its page lists every drink.
- `recipes reindex tag-terms` on the user's go-ahead; the `tree` aggregate
  read back with `drink` as the root and the eight styles under it. The
  running editor was not reachable from the job session, so its Reload is
  the user's.
- `tag:drink` still returns the 12 (17 after the tea drinks below).

**Tea drinks (2026-10-04, same session, user's pick).** The user added teas
(green, black, hibiscus, chamomile), dried lavender, non-alcoholic Gnista and
orange bitters to what they have, and chose six recipes: Hibiscus Gnista
Highball, Chamomile Collins, Black Tea Sour, Green Tea Sake Highball,
Lavender Syrup, Lavender Gnista Tonic (`a9b11e6…4702030`). Plus `1 dash
orange bitters, optional` on Cucumber Martini, Saketini and Vermouth Tonic
(`7b4e89d…25ac612`). Conventions they set: `tea` as the base tag; infusions
and cold brews as a named instruction group, so the ingredient list is what
goes in the glass; the syrup is tagged `syrup` with no `drink` spec. No
bitters on zero-proof drinks — bitters are mostly alcohol.

### 25c — "What can I make?" `agent/25c-make` 🟡 review (← `main` `7aeb3230`)

Planned 2026-10-05 with Roger: generic ("What can I make with…"), scoped by
the search language (`tag:drink` default), no masthead link — entry points are
a ⌘K "Go to" row and a "What can I make with these?" link on term pages. The
open questions from the sketch were settled as: names extracted from the
free-text lines (D9) rather than a second vocabulary; storage per D10;
optional lines and "to top" mixers per D9; intermediate components via the
one-level sub-recipe rule, which also covers infusions loosely.

- **Pure core:** `common/util/ingredientNames.ts`, `makeable.ts`,
  `inventoryText.ts`; `normalizeIngredientText` split out of
  `createIngredient` so names see lines as the form stored them.
  `editor/scripts/measure-ingredient-names.ts` (read-only, opens no index —
  safe on the live repo) prints each line beside its requirement.
- **Index:** D8. `linked-recipes` regenerated; new fixture `make-drinks`.
- **UI:** `common/components/MakePage/` (`useInventory` in `useListMode`'s
  shape; inventory `<aside>` with a disclosure on narrow screens, chips with
  sibling remove buttons, `<datalist>` from `suggestNames`; import/export
  `Dialog`; ticker; Buy next; Can make / One away / Two away / Further). Routes
  `make/page.tsx` in both apps inside `<Suspense>` (`useSearchParams`). The
  only `SearchContext` change is `export` on `fetchIngredients`.

**Gate results (2026-10-05):** both typechecks clean; `vitest` 726/726
(+ `ingredientNames` 73, `makeable` 20, `inventoryText` 13, index fields 2);
`recipe-website build` against a scratch copy of `make-drinks` — `/make`
prerendered static (`○`), `/search/all` carries both fields; Playwright
`make.spec.ts` 14/14; `visual.spec` `make-page` baseline added (palette
baselines unmoved — the new row is below their crop); `command-palette.spec`
36/36 and the gate's eight specs (`accessibility visual search
search-corpus-split recipe tree featured-recipes tag-pages`) 175/175 — three
tests (two palette Enter/click navigations, one featured click-through) timed
out at 5 s on a `next dev` cold compile once and passed alone on rerun.

### 25d — Shared inventory `agent/25d-shared-inventory` 🟡 review (← 25c `eee4dc8f`)

- **Curation:** `editor/controller/curation/inventory.ts` — `readInventory`,
  `patchInventory`, `setInventory`, `makeable` (D10/D11); schemas
  `InventoryPatchSchema`, `InventorySetSchema`, `InventoryMakeQuerySchema`.
  Node-only, inside the D8 allow-list (`util/*` is how it reaches the matcher;
  `DEFAULT_MAKE_QUERY` moved to `util/makeable.ts` for that).
- **Seats:** `CuratorBackend` gains four methods (local + HTTP);
  `api/inventory` (GET/PATCH/PUT) and `api/inventory/make`, all
  authenticated; `cli/commands/inventory.ts`; five MCP tools (D11).
- **Editor UI:** `make/page.tsx` reads the list for a session only and passes
  `shared` + the `saveInventoryChanges` action; chips carry
  `data-source="shared"|"browser"`, hidden shared items list with Undo, and
  `SharedChanges` offers Save / Discard.
- **Skill:** "8. What's on hand" and the drink-import checklist (naming
  "Drink (Site)", units, house-syrup links); held-back list gains
  `inventory_set`.

**Gate results (2026-10-05):** both typechecks clean; `vitest` (+
`inventory.test.ts` 13 incl. the export-boundary check; `mcp`, `cliJson`,
`curatorSkill` extended); CLI smoke on a scratch git copy of `make-drinks` —
`inventory add` made one commit `Update inventory: +Gnista +tonic water
+sugar +lavender`, `list`, `make` and `make tag:zero-proof --json` agree with
the page's rules; `vitest` 741/741; Playwright `make.spec.ts` 18/18 (+4:
guest sees nothing and the API answers 401, signed-in shows the shared list,
hide-and-undo, save-and-reload) and the gate's eleven specs (`accessibility
command-palette visual search search-corpus-split recipe tree
featured-recipes tag-pages api-write mcp-http`) 238/238 clean;
`recipe-website build` from a content dir that _contains_
`inventory/on-hand.json` — `/make` static, nothing in `export/out` names or
copies the list.

### 25e — source probe (2026-10-05, dry runs only, nothing written)

`recipe_import {dryRun: true}` per candidate domain, then `curl` to tell a
block from a missing recipe:

| Source                                                                          | Result                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| acouplecooks.com, thekitchn.com, loveandlemons.com                              | ✅ import cleanly (JSON-LD Recipe, `source` with author)                              |
| liquor.com, foodandwine.com, thespruceeats.com, allrecipes.com, seriouseats.com | ❌ 403 to any non-browser fetch, even with a browser UA (Dotdash Meredith bot wall)   |
| imbibemagazine.com                                                              | ⚠️ has a Recipe in JSON-LD, but 403s Node's default `fetch` UA; a browser UA gets 200 |
| punchdrink.com, diffordsguide.com                                               | ❌ 200, but no Recipe in JSON-LD                                                      |

So "Margarita (Liquor.com)" as planned isn't reachable; the two-version
pairs come from acouplecooks / The Kitchn / Love and Lemons. Imbibe would
need the importer to send a browser `User-Agent` (`importRecipeData.ts:220`)
— a decision for the user, not taken here.

Inventory seed for 25e: the bottles, syrups and mixers the step-1 and tea
recipes name, plus the user's additions on 2026-10-04 — teas (green, black,
hibiscus, chamomile), dried lavender, non-alcoholic Gnista, orange bitters.

## Deferred

- oz ↔ ml toggle; "make it for N" batching with a dilution note.
- A bar-side view (large type, wake lock).
- More drinks from step 1's deferred list (Sake Cosmo, Sake Bloody Mary, Red
  Snapper ZP, Ginger Mule ZP, the spritzes and sodas); a syrup-pairing chart
  as a term description or page.
- JSON-LD `recipeCategory` / `cookingMethod`; the importer mapping
  `recipeYield`, `recipeCategory`, `cookingMethod` (an existing gap, F6).

## Key files

- `common/controller/types.ts` — `DrinkSpec`, `DRINK_METHODS`,
  `DRINK_METHOD_LABELS`.
- `common/components/View/DrinkSpec.tsx` — the card.
- `common/components/Form/index.tsx` — the Drink section.
- `editor/controller/parseFormData.ts` — `drinkSchema`.
- `editor/controller/curation/schema.ts` — `DrinkSpecSchema`.
- `common/util/ingredientNames.ts`, `common/util/makeable.ts`,
  `common/util/inventoryText.ts` — 25c's matching and inventory text (D9/D10).
- `common/components/MakePage/` — `/make` (both apps' `make/page.tsx` mount it).
- `editor/scripts/measure-ingredient-names.ts` — what the parser makes of a corpus.
