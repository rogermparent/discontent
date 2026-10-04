# Mixology mode — "the recipe site as a bar quick-reference"

> **This is the durable source of truth for the epic-25 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before planning any `25x`
> phase. Update the roadmap **Status** column and the **Next** line at every
> phase boundary. Each phase gets its own plan-mode pass seeded from this doc.
> **25a is in review (draft PR, `agent/25a-drink-spec` ← `main` `8bd91a96`);
> 25b (content) follows its merge.** Epic 24's doc, `agent-taxonomy.md`, is
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
- **Step 3 = 25c.** Bar inventory and "can make now / one bottle away".

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
- **T4 — MCP advertises the transformed schema's input side.** `DrinkSpecSchema`
  is a `.transform`; `test/mcp.test.ts` pins that `recipe_create`'s
  `inputSchema` still shows `drink` as a strict object with the method enum.

## Roadmap

| Step    | Branch / where                     | Status  | Scope                                                                                                                                                      |
| ------- | ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | real content repo                  | ✅ done | 12 drinks via `recipes create` (2026-10-03)                                                                                                                |
| **25a** | `agent/25a-drink-spec` ← `main`    | 🟡 PR   | `Recipe.drink` (D1–D4): type, form section, both parsers, curation schemas, card, skill, this doc (M)                                                      |
| 25b     | real content repo (no code)        | ⏸️      | `drink` on the 12, garnish headings out, style tags; hand-written `drink` term tree with ratio descriptions; reindex the tag taxonomy (S code / M content) |
| 25c     | `agent/25c-bar-inventory` ← `main` | ⏸️      | Bar inventory + "can make now / one bottle away" — after 24d (search resolver), ideally 24e (term writes) (L)                                              |

**Next: 25b**, once the 25a PR merges.

## Phase detail

### 25a — Drink spec `agent/25a-drink-spec` 🟡 (← `main` `8bd91a96`)

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

### 25b — Content (after 25a merges; real content repo)

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

### 25c — Bar inventory (sketch; its own plan pass)

After 24d and ideally 24e. Must match on the **generic** ingredient (the
brand in parens is ignored). Open questions for that plan: generic-name
extraction from free-text lines vs. explicit ingredient terms (a second
vocabulary reverses 24's "one vocabulary" and needs a decision); inventory as
a content type vs. a settings document; optional lines ("…, optional") and
"to top" mixers.

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
