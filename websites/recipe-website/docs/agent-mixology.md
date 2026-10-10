# Mixology mode — "the recipe site as a bar quick-reference"

> **This is the durable source of truth for the epic-25 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before planning any `25x`
> phase. Update the roadmap **Status** column and the **Next** line at every
> phase boundary. Each phase gets its own plan-mode pass seeded from this doc.
> **25a is merged (#146 → `main` `14846959`, 2026-10-04); 25b (content) is
> done in the real content repo (2026-10-04), plus six tea drinks on top. 25c
> ("What can I make?", `/make`) and 25d (the editor's shared inventory) are
> merged (#149 → `6fda55ac`, #150 → `68ef8f6e`, 2026-10-05) and the real
> repo's `recipes` index is rebuilt with their fields. 25e (sourced imports)
> is done (2026-10-05 overnight): 104 cited recipes in the content repo,
> unpushed, plus the importer fix #152 (→ `d7eb7dda`). None of the epic
> touches 24d.** Epic 24's doc, `agent-taxonomy.md`, is
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

### D12 — Sourced drinks: "Drink (Site)", `<tag>-<site>`, a shared drink tag (25e)

A published drink is imported as its own recipe, never merged into a house
one. Name `"<Drink> (<Label>)"`, slug `<tag>-<site key>`
(`margarita-acouplecooks`, `zero-proof-aperol-spritz-acouplecooks`). Tags in
order: `drink`, one or two bases from a fixed list (`vodka gin rum tequila
whiskey brandy sake wine vermouth liqueur tea`; mezcal → tequila,
bourbon/rye → whiskey, pisco/cognac → brandy, prosecco → wine), one style,
`low-abv`/`zero-proof`, and the shared drink tag, so `/tags/margarita` lists
every version side by side. `source` carries the citation and its `name` is
the site's label ("A Couple Cooks", not the importer's hostname fallback).
House originals keep their slugs and gain `house` plus the shared tag of
their sourced counterpart. Syrups that drinks call for are recipes too
(`simple-syrup-acouplecooks`, `honey-syrup-acouplecooks`, the house
`lavender-syrup`), tagged `syrup` and the shared tag with no `drink` spec, and
lines link them. A zero-proof version of a classic gets its own tag
(`virgin-mojito`, `zero-proof-aperol-spritz`), not the classic's.

**Styles:** `sour`, `collins`, `stirred`, `built`, `highball`, `batch`. Since
27c (`agent-epic-27.md` D1), every drink whose `drink.method` is `shake` also
carries `shaken`. That tag names the method rather than a style, so a sour
carries `sour` and `shaken`, a citrus-free shaken drink (espresso martini,
French martini, alexanders) carries `shaken` alone, and "shaken but not sour"
is `tag:shaken -tag:sour`.

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
- **T9 — The Kitchn's image URLs have no filename.** They are Cloudinary
  URLs ending in an encoded, extension-less segment
  (`…/ar_16:9/k%2FPhoto%2FRecipes%2F…%2Fbloody-mary-441_1`), and
  `writeUploadFile` takes the last segment verbatim as the filename. Decode
  the `%2F`s and append `.jpg` (`…/k/Photo/Recipes/…/bloody-mary-441_1.jpg`):
  Cloudinary serves both, and the second stores as `bloody-mary-441_1.jpg`
  (checked at 25e: a 1500×844 JPEG). Separately, the importer takes
  `image[0]`, which on WordPress recipe sites (acouplecooks, Love and Lemons)
  is the smallest crop (225×225 / 500×500); strip `-\d+x\d+` before the
  extension for the full-size image.
- **T10 — No single request identity works for every site.** Imbibe 403s
  Node's default `fetch`; Cloudflare in front of acouplecooks 403s a Chrome
  `User-Agent` (a "Just a moment…" challenge — the TLS fingerprint isn't
  Chrome's). #151 broke acouplecooks; #152 asks plainly first and as a
  browser only after a 403. The Kitchn served ~13 recipe pages in a row and
  then 403'd both identities — after a 200-sitemap harvest the same evening —
  so space imports to that site out.
- **T11 — The `recipes` MCP server in a worktree session points at the
  worktree.** It resolves `editor/content` relative to the session, and a
  worktree has no content symlink: `git_status` answers `isRepo: false` and
  `inventory_get` an empty list at
  `.claude/worktrees/<name>/…/editor/content/inventory/on-hand.json`. Reads
  are harmless (nothing is created), but a write would land in the wrong
  place. From a worktree, use the CLI with `--content-dir`.
- **T4 — MCP advertises the transformed schema's input side.** `DrinkSpecSchema`
  is a `.transform`; `test/mcp.test.ts` pins that `recipe_create`'s
  `inputSchema` still shows `drink` as a strict object with the method enum.

- **T12 — An instruction group's steps must be objects.** At the top level
  `instructions` takes bare strings, but inside `{name, instructions}` each
  step must be `{"text": …}` (`InstructionGroupSchema` in
  `curation/schema.ts`), or the create fails `validation` on
  `instructions.N`. Seven of 25f's 77 payloads tripped it.

## Roadmap

| Step | Branch / where                     | Status  | Scope                                                                                                                                                      |
| ---- | ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | real content repo                  | ✅ done | 12 drinks via `recipes create` (2026-10-03)                                                                                                                |
| 25a  | `agent/25a-drink-spec` ← `main`    | ✅ done | `Recipe.drink` (D1–D4): type, form section, both parsers, curation schemas, card, skill, this doc (M)                                                      |
| 25b  | real content repo (no code)        | ✅ done | `drink` on the 12, garnish headings out, style tags; hand-written `drink` term tree with ratio descriptions; reindex the tag taxonomy (S code / M content) |
| 25c  | `agent/25c-make` ← `main`          | ✅ done | Matching (D9), index fields (D8), `/make` in both apps with a browser inventory (D10), ⌘K row, term-page link (L)                                          |
| 25d  | `agent/25d-shared-inventory` ← 25c | ✅ done | Editor's shared list `inventory/on-hand.json`: curation module, action, API, CLI, MCP seats (`inventory_set` held back), skill (M)                         |
| 25e  | real content repo (+ #152)         | ✅ done | 104 sourced imports (100 drinks, 4 syrups) as "Drink (Site)" with shared drink tags (D12), 18 house drinks tagged, shared inventory seeded (L content)     |
| 25f  | real content repo                  | ✅ done | Batch 2: 77 sourced drinks (rum/tiki, whiskey, gin and tequila classics, vodka and sake, spritzes, zero-proof) through 26b's `inspect` drafts (M content)  |

**Now: the epic's roadmap is done.** 25e landed overnight 2026-10-05 (below):
the content repo's branch `uraninite` gained 123 commits, unpushed —
pushing it is the user's call — and a running editor needs Settings →
Maintenance → Reload. What's left is the Deferred list, chiefly the parser
findings 25e measured. 24d hadn't started when 25c was
planned and 25c edits none of its files; after 24d lands, the one-line
follow-up is to pass the term resolver to `/make`'s `matchesFilter` so
`tag:drink` includes the narrower styles (every drink carries `drink` anyway).

**25f** (2026-10-06, at the user's "autonomously grab another batch of drink
recipes") added 77 more on `uraninite`, also unpushed — see its section.

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

### 25c — "What can I make?" `agent/25c-make` ✅ done (← `main` `7aeb3230`; #149 → `6fda55ac`)

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

### 25d — Shared inventory `agent/25d-shared-inventory` ✅ done (← 25c `eee4dc8f`; #150 → `68ef8f6e`)

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

| Source                                                                          | Result                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| acouplecooks.com, thekitchn.com, loveandlemons.com                              | ✅ import cleanly (JSON-LD Recipe, `source` with author)                                                                 |
| liquor.com, foodandwine.com, thespruceeats.com, allrecipes.com, seriouseats.com | ❌ 403 to any non-browser fetch, even with a browser UA (Dotdash Meredith bot wall)                                      |
| imbibemagazine.com                                                              | ✅ with #151: 403s Node's default UA, so the importer now asks as a browser; its `recipeIngredient` objects are read too |
| punchdrink.com, diffordsguide.com                                               | ❌ 200, but no Recipe in JSON-LD                                                                                         |

So "Margarita (Liquor.com)" as planned isn't reachable; the two-version
pairs come from acouplecooks / The Kitchn / Love and Lemons, and Imbibe once
#151 lands. The user chose (2026-10-05) to have the importer send a browser
`User-Agent` (`RECIPE_FETCH_HEADERS` in `importRecipeData.ts`); Imbibe's
JSON-LD then also needed object-shaped `recipeIngredient` entries read
(`ingredientText`). Neither gets past the Dotdash wall.

Inventory seed for 25e: the bottles, syrups and mixers the step-1 and tea
recipes name, plus the user's additions on 2026-10-04 — teas (green, black,
hibiscus, chamomile), dried lavender, non-alcoholic Gnista, orange bitters.

### 25e — Sourced drink imports ✅ done (real content repo, 2026-10-05 overnight, + #152)

Run unattended (the user asked for overnight progress with no check-ins), with
the CLI from worktree `agent-import-ua` and `--content-dir
/home/roger/Projects/recipe-content`. Scratch scripts and every intermediate
file were in the job's `tmp/25e/`.

1. **Harvest.** Every source had a reachable sitemap, so no web searches
   were needed: acouplecooks `post-sitemap{,2–5}.xml` (3,781 URLs), Imbibe
   `recipe-sitemap{,2–4}.xml` (3,452), Love and Lemons
   `post-sitemap{,2}.xml` (1,867), and The Kitchn's monthly
   `sitemap-YYYY-MM.xml` (203 files, 43,097 URLs — it answers a browser
   UA after all). Picks were made by hand from slug greps: up to two sites
   per drink, with acouplecooks first and an alternate for each pair.
2. **Dry runs** (115 candidates, about 10 s apart). The first one found the
   #151 regression (T10). It was fixed as **#152** (plain request first,
   browser headers only after a 403; unit tests for plain-first, retry on 403
   and no retry on 410; CI green; merged `d7eb7dda`) before anything was
   written. 104 accepted, 11 rejected:
   - Imbibe vodka collins and gin fizz: no Recipe JSON-LD on those older
     pages. Imbibe alcohol-free negroni: the importer throws
     `recipeInstructions?.map is not a function`, because its instructions
     are a bare string (Deferred).
   - The Kitchn cape codder: an article with no Recipe. Then The Kitchn
     answered 403 to both identities (T10), so its kalimotxo, lavender
     lemonade, Hibiscus Earl Grey iced tea, iced green tea, tea hot toddy,
     NA sangria and mint julep mocktail were dropped rather than retried.
3. **Normalize.** Four parallel subagents, one per group, wrote `recipe_create`
   payloads only (D12, the skill's drink-import checklist, T9's image
   rewrites) and rejected nothing. Their judgement calls:
   - acouplecooks' "Sake Cocktail" is a Sake Southside, and its "Elderflower
     Cocktail" is vodka + St-Germain + tonic, named "Elderflower Tonic". Both
     keep their keys' slugs and tags.
   - Imbibe's "Green Tea Mojito" has no rum and is tagged `zero-proof`.
   - Greyhounds are `gin`, because both pages put gin first. Amaretto sours
     also carry `whiskey` (bourbon is a real second base).
   - The Kitchn's 0-minute times became 5. Batch yields are estimated from
     volumes.
4. **Create**, one commit each. The four syrups went first (other lines link
   them), then one Kitchn recipe alone for T9, then the rest. 104 of 104
   succeeded: no failures, no slug conflicts, no `--overwrite`.

**Counts.** 104 recipes: 100 drinks and 4 syrups. By site: acouplecooks 56,
Imbibe 21, Love and Lemons 18, The Kitchn 9. By pick group: sours 25,
built/highball 20, stirred 16, batch/warm 10, spritz 9, tea 8, collins 7,
zero-proof 5, syrups 4. **41 two-site pairs**: amaretto sour, Aperol spritz,
bee's knees, bloody mary, boulevardier, cosmopolitan, cucumber martini,
daiquiri, dark 'n' stormy, dirty martini, French 75, gimlet, gin and tonic,
greyhound, hibiscus margarita, hibiscus tea, hot toddy, Hugo spritz, Irish
coffee, lavender syrup, lemon drop, Manhattan, margarita, martini, mojito,
Moscow mule, mulled wine, negroni, old fashioned, paloma, pisco sour, ranch
water, sangria, sea breeze, sidecar, Tom Collins, Vesper, vodka tonic, whiskey
sour, white sangria, white wine spritzer.

**House drinks.** All 18 originals gained `house`. Twelve also gained a
counterpart's shared tag:

| House original                                                                                                     | Shared tag      |
| ------------------------------------------------------------------------------------------------------------------ | --------------- |
| cosmopolitan, lemon-drop, elderflower-collins, cucumber-martini, bloody-mary, mulled-wine, sangria, lavender-syrup | their own slugs |
| zero-proof-gin-and-tonic                                                                                           | `gin-and-tonic` |
| spicy-mango-mule                                                                                                   | `moscow-mule`   |
| black-tea-sour                                                                                                     | `vodka-sour`    |
| chamomile-collins                                                                                                  | `vodka-collins` |

No published counterpart: saketini, cucumber-elderflower-sake-spritz,
vermouth-tonic, green-tea-sake-highball, hibiscus-gnista-highball,
lavender-gnista-tonic. In the same patches, two house syrup lines were linked:
Lavender Gnista Tonic → `/recipe/lavender-syrup` and Black Tea Sour →
`/recipe/simple-syrup-acouplecooks`.

**Inventory.** One `inventory add` commit with the 23 items the plan named.
It went through the CLI rather than MCP, because of T11.

**Verification.**

- **Index** (read-only LMDB walk): `tag:drink` 17 → 117. All 104 new recipes
  are on the index with `source.url`. 42 index rows carry
  `ingredientRecipeLinks` and 8 carry `ingredientHeadings`.
- **Pairs:** `search tag:<t>` for every shared tag lists both sourced
  versions, plus the house original where there is one.
- **Makeable** (`inventory make tag:drink`): 117 judged. Before → after the
  imports:

  | Measure | Before (17 drinks) | After (117 drinks) |
  | ------- | ------------------ | ------------------ |
  | canMake | 5                  | 5                  |
  | oneAway | 10                 | 20                 |
  | twoAway | 2                  | 20                 |
  | further | 0                  | 52                 |

  canMake is bloody-mary, cosmopolitan, cucumber-martini, lemon-drop and
  saketini. buyNext: soda water (unlocks 6), tonic water (4), simple syrup
  (3, helps 7), ginger beer (2), gin (1, helps 8). A linked simple syrup still
  counts as missing, because its recipe needs sugar, which isn't on the list
  (D9's one-level rule, working as designed).

- **Repo:** `git status` clean on `uraninite`. 762 → 885 commits = 1
  inventory + 104 creates + 18 updates.

**Parser findings** (`measure-ingredient-names.ts --tag drink`). **All fixed by
27c** (`agent-epic-27.md` D7), each with a regression test:

- **"X or Y" with a shared head word doubles it:**
  - "simple syrup or maple syrup" → `simple syrup syrup or maple syrup`
  - "vodka or citron vodka" → `vodka vodka or citron vodka`
  - "sweet or semi-sweet red vermouth" → `sweet sweet red vermouth or …`
- **Distribution invents a name:** "honey or maple syrup" → `honey syrup or
maple syrup`, which would match honey syrup.
- **Words lost or mis-split:**
  - "hot sauce" → `sauce`
  - "1/2 cup plus 2 tablespoons white sugar" → `plus tablespoon white sugar`
  - "1 (46- to 48-oz) bottle or can tomato juice" → `or can tomato juice`
  - "1 recipe lavender syrup" → `recipe lavender syrup` ("recipe" isn't a
    unit)
- **The soda alias reaches too far:** "grapefruit soda" →
  `grapefruit soda water`.
- **Fine:** "…, to top" mixers normalize well (club soda / sparkling /
  seltzer → `soda water`). Brands land in `aka`. No line is marked `@na`.

### 25f — Sourced drinks, batch 2 ✅ done (real content repo, 2026-10-06)

Run unattended, right after 26d merged, with the CLI from worktree
`agent-26d` (`main` `b67ed645`) and `--content-dir
/home/roger/Projects/recipe-content`. Scratch files were in the job's
`tmp/drinks2/`.

1. **Harvest.** The 25e sitemaps again: acouplecooks `post-sitemap{,2–5}`,
   Imbibe `recipe-sitemap{,2–4}`, Love and Lemons `post-sitemap{,2}` — 9,103
   URLs. The Kitchn was skipped (T10). A wish-list of ~110 classics was
   matched against slugs, minus the 117 drinks already in the repo, with up
   to two sites per drink and acouplecooks first.
2. **Inspect** (79 pages, read-only, ~4 s apart): every page answered 200
   with a Recipe node and ingredients, and none was partial.
3. **Normalize.** Five parallel subagents, one per group, wrote
   `recipe_create` payloads from each `draft` against a written spec (D12 plus
   the skill's checklist). A validator then checked slug, name, label, tag
   order/bases/style, units, fractions, markup, garnish lines, digits in
   steps, syrup links and thumbnails. Hand fixes after that:
   - Lime Rickey became the zero-proof soda-fountain drink, because Gin Rickey
     is its own recipe.
   - Brands moved behind generics: `coffee liqueur (Kahlua)`, `elderflower
liqueur (St-Germain)`, `raspberry liqueur (Chambord)`.
   - A page's bare author ("Sonja") was restored after a subagent expanded it.
   - Two rejects: Michelada (a beer base is outside D12's fixed list), and
     acouplecooks' hot apple cider, which is the same recipe as its mulled
     cider.
4. **Dry runs** of all 77: 70 clean at first. The other seven failed
   `validation` on bare-string steps _inside_ an instruction group (T12),
   and were clean once fixed. No conflicts; every image probed to a real
   filename.
5. **Create**, one commit each: 77 of 77 succeeded, 885 → 962 commits, tree
   clean.

**Counts.** 77 drinks: acouplecooks 60, Imbibe 10, Love and Lemons 7. By
group: rum 10, whiskey/brandy 15, gin 15, tequila/vodka/sake 21, spritz and
zero-proof 16. **13 new two-site pairs**: bellini, clover club,
espresso martini, jungle bird, last word, limoncello spritz, mimosa, mint
julep, negroni sbagliato, paper plane, penicillin, sazerac, watermelon
margarita. Zero-proof
additions: Shirley Temple, Arnold Palmer (`tea`), Lime Rickey, Mulled Cider.

**Verification.** `tag:drink` 117 → 194; `search tag:<shared>` lists both
versions for every new pair. `inventory make tag:drink`: canMake 5 (unchanged
— the same five), oneAway 20 → 31, twoAway 52, further 106; buyNext is still
soda water (unlocks 7), then tonic water and simple syrup.

**Judgement calls left as they are.**

- Espresso and French martinis are `sour`, because D12's styles have no
  "shaken, no citrus" slot.
- Brandy Alexander is `built` for the same reason (a shaken cream drink).
- A caipirinha is `built`, but the page shakes it.
- Imbibe's single-drink pages all publish `recipeYield: "10"`; it was
  overridden to "1 drink" by hand (Deferred).

## Deferred

- ~~The 25e parser findings above.~~ **Done by 27c** (`agent-epic-27.md` D7).
- ~~Importer: `recipeInstructions` given as one string (Imbibe's alcohol-free
  negroni); prefer the largest JSON-LD `image` over `image[0]` (T9)~~ — importer
  gaps → **epic 26 done** (`agent-import-tools.md`): string instructions,
  `recipeYield`, ranked images, extension-bearing filenames, the SEO
  fallback, `inspect` drafts and the `image` seat. ~~Still open: label
  `source.name` from a site map rather than the hostname fallback.~~ **Done by
  26d**: publisher → `og:site_name` → `KNOWN_SITES` → hostname
  (`common/util/siteNames.ts`).
- ~~Imbibe publishes `recipeYield: "10"` on single-drink pages (25f found it
  on all ten it imported); the importer could ignore a bare yield that
  disagrees with single-serving volumes, or the skill could say to check it.~~
  **Done by 27c** (`agent-epic-27.md` D10: `SITE_QUIRKS` drops it, and the
  skill checks yields).
- ~~A style for shaken, citrus-free drinks (espresso martini, French martini,
  Alexanders) — D12's six styles force them into `sour` or `built` (25f).~~
  **Done by 27c** (`agent-epic-27.md` D10: the `shaken` method tag).
- ~~The Kitchn picks dropped at 25e once it 403'd (T10).~~ **Done by 30d**
  (`agent-epic-30.md`): The Kitchn answered 200 on 2026-10-09; five picks
  imported, kalimotxo skipped (an article with no recipe data).
- ~~oz ↔ ml toggle; "make it for N" batching with a dilution note.~~ **Done
  by 27c** (`agent-epic-27.md` D8: oz · ml · parts, and the batching note).
- ~~A bar-side view (large type, wake lock).~~ **Done by 27c**
  (`agent-epic-27.md` D9: the focus view).
- More drinks from step 1's deferred list: ~~Sake Cosmo, Sake Bloody Mary, Red
  Snapper ZP, Ginger Mule ZP~~ (**done by 30d**; the mule is zero-proof, the
  Red Snapper is the gin one); ~~the spritzes and sodas~~ **done by 31f**
  (`agent-epic-31.md`): five of seven, with Spicy Cascara Highball and a
  Zero-Proof Spritz skipped for want of a real source. ~~A
  syrup-pairing chart as a term description or page~~ **done by 30d**: the
  `syrup` tag term, as a list (term descriptions have no table styles).
- ~~JSON-LD `recipeCategory` / `cookingMethod`; the importer mapping
  `recipeYield`, `recipeCategory`, `cookingMethod` (an existing gap, F6).~~
  **Done by 26d** (`agent-import-tools.md`): the export's JSON-LD carries
  `recipeCategory: "Drink"` and `cookingMethod` from `drink.method` (plus
  description, yield, ISO times, video); the importer reads category,
  cuisine, method and keywords into `suggestedTags` — hints, never tags.
  (`recipeYield` landed in 26a.) Glass and ice stay out: schema.org has no
  field for them.

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
