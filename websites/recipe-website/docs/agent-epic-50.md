# Epic 50

> 50e's section, written on its own branch before 50a's doc reached main:
> expect a docs merge (the roadmap, **Now** and the other phases are 50a's
> file's).

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
- Gates: see below.

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
8. `linked --scan` on the whole collection reads every recipe's page once,
   ≥ 15 s apart per site — hours for ~1,000 recipes; run it per slug or with
   `--limit` first.
