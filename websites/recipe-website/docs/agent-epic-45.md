# Epic 45 — A quieter tag picker; fill a recipe's gaps from its source

> **This is the durable source of truth for epic 45.** Read it before
> touching the recipe form's tag picker (`common/components/Form/Tags/`) or
> re-importing into an existing recipe (the edit page's fill, `fillGaps`,
> the time and yield estimate). The orchestrator updates the roadmap
> **Status** column and the **Now** line at every phase boundary; workers
> add their phase's **Results** and **Traps** under their own headings, and
> decision amendments numbered by phase letter (`Ft1`, `Fg1`). Earlier
> epics are cited by number with a prefix (`43-De4`, `36-T23`). Background:
> `agent-epic-43.md` (43e1/43e2, the edit form B), `agent-epic-36.md` (the
> extractor and its never-estimate rule), `agent-epic-38.md` (38g, the
> Claude API backend), `agent-epic-37.md` (import jobs),
> `agent-import-tools.md` (inspect, yt-dlp, drafts).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 45a ∥ 45b (2026-10-22).

## Context

Roger, 2026-10-22, after epic 44 closed:

- "I want to hold off on the local ai setup for pi, just claude API for
  now." (No code: the Pi already runs AI on the Claude API only; recorded so
  no plan proposes Ollama or SearXNG there.)
- "I want to sometimes re-import a recipe to have AI fill in missing data
  e.g. http://uraninite:3000/recipe/1-hour-bagels has no time fields."
  That recipe came from a YouTube video: `prepTime`, `cookTime`,
  `totalTime` are 0, `recipeYield` is empty, and the video never states
  the times — they are only readable from the steps (25 min ferment,
  15–20 proof, 30 s boils, 15–17 min bake).
- "The tags selector shows like every tag and it's really ugly. Have it
  show no tags at first but have a dedicated area below to show
  auto-suggest tags that adapt to the currently typed value."

His answers (2026-10-22):

- **Fill flow: review in the edit form.** An action on the edit page fills
  only empty fields, marks each, and nothing is saved until Save.
- **Estimates: yes, marked "estimated".** When the source doesn't state
  times or yield, a model estimates them from the ingredients and steps.
- **Model: whatever the editor uses** (`RECIPE_LLM_*`: qwen on the
  workstation, the Claude API on the Pi).
- **Tag picker: the field and suggestions only.** Chosen tags as chips, a
  text field, and a suggestions area below that adapts as you type;
  nothing else shows until you type; the import's suggested tags appear
  there too, marked.

## Decisions

- **F1 nothing is lost.** The fill never replaces a non-empty value, and
  the tag picker keeps every way a tag reaches a recipe today (choose,
  remove, a new tag, accept an import suggestion, a child brings its
  parent — whatever 43e2 does).
- **F2 review, then save** (43e1's model): the fill only changes form
  state; the existing Save writes it as one commit. Undo returns the form
  to the stored recipe.
- **F3 empty means** `0` or absent for times, `""` (after trim) for
  strings, `[]` or absent for lists, absent for `image`, `video`, `drink`.
  `name` and `slug` are never filled.
- **F4 estimates are separate from extraction.** 36's extractor keeps its
  "never estimate or add up a time" rule; the estimate is its own small
  `chatJson` call with its own schema, validated and bounded, run only for
  the fields still empty after the source fill.
- **F5 the editor's model** (`llmConfig()`), through the GPU queue for a
  local model, as an import job step; no model configured → fill from the
  source only and say the estimate was skipped.
- **F6 never a real model in tests**; the orchestrator runs one real check
  on a scratch clone (GPU etiquette with Archilyzer).

## Roadmap

| Phase | What                                              | Size | Branch                         | Status |
| ----- | ------------------------------------------------- | ---- | ------------------------------ | ------ |
| 45a   | Tag picker: a field and suggestions as you type   | M    | `agent/45a-tags`               | 🟡     |
| 45b   | Fill gaps from the source, with marked estimates  | L    | `agent/45b-fill`               | 🟡     |
| 45e1  | Alternatives: the data and every reader           | L    | `agent/45e1-alternatives`      | 🟡     |
| 45e2  | Alternatives: authoring (form, import suggestion) | L    | `agent/45e2-alternatives-form` | 📝     |
| 45c   | Close-out                                         | S    | `agent/45-close`               | 📝     |

45a and 45b run in parallel (disjoint files except a line or two in
`Form/index.tsx`). Both move edit-form baselines: the second to merge
regenerates its baselines with `--update-snapshots=all` after merging main.

### 45a — Tag picker: a field and suggestions as you type

Files: `common/components/Form/Tags/` (`index.tsx`, `tagPicker.ts`),
`Form/index.tsx` (the mount), the group form if it shares the picker.

- **At rest:** the "Tags" heading with the chosen tags as chips (each with
  "Remove tag X"), the text field (`aria-label="Add a tag"`, kept), and
  below it a **Suggestions** area. With the field empty the area shows only
  the import's suggested tags (dashed, "Accept suggested tag X", kept) when
  there are any, otherwise a short hint ("Type to find a tag"). The facet
  rows and the "Other tags" list go.
- **Typing:** the area lists matches from `searchPickerTerms` (word-start
  on label, slug and aliases; exact first, then by count; chosen tags
  left out), each with its count and a muted facet name where it has one
  ("braise · 14 · Speed & effort"), capped (~12), plus **New tag "…"**
  when nothing matches exactly. Aliases resolve to their term.
- **Keyboard:** the field is an ARIA combobox over the suggestions listbox
  (`aria-activedescendant`); ↓/↑ move, Enter adds the highlighted (or the
  exact match, or the new tag), Escape clears the field, Backspace in an
  empty field does nothing destructive. After an add the field clears and
  keeps focus; a polite live region says "Added X".
- **Pointer:** a suggestion is a ≥ 24 px target ("Add tag X", kept for the
  specs); chips wrap at phone width.
- Tests: `tagPicker` vitest for the ranking and the empty state (none
  today); `recipe-tags-aggregate.spec`, `recipe.spec` tag cases,
  `groups.spec` tag cases, `edit-form-frame.spec`; a new spec for the
  type-ahead (type → suggestions → keyboard add → chip → remove; import
  suggestion accept; new tag; no tag rows at rest); axe on the form;
  baselines `edit-form-populated`, `new-recipe-form*`, `new-recipe-imported`,
  `edit-form-mobile` regenerated in Docker.

### 45b — Fill gaps from the source, with marked estimates

Files: a pure `fillGaps` next to `mergeExtraction`
(`controller/llm/importWithLlm.ts` or `controller/curation/fillGaps.ts`), a
new `controller/llm/estimateTimes.ts`, the edit page
(`src/app/(recipes)/recipe/[slug]/edit/`), `common/components/Form/`
(marks), the form import action, `cli/commands/`.

- **`fillGaps(stored, draft) → {recipe, filled: Field[]}`** (pure, F1/F3):
  fills only empty fields from the draft — description, the three times,
  yield, ingredients and instructions only when empty, image (through the
  existing checked image download) and video when absent, the drink spec
  when absent. Tags are never added: the draft's tags become the picker's
  import suggestions (45a's area).
- **`estimateTimes(recipe, {config, job, signal})`** (F4/F5): one
  `chatJson` call; the user message carries the name, yield text, the
  ingredients, the steps, and the facts `findStepTimes` / `readPlanTimes`
  read from them as hints; the answer
  `{prepTime?, cookTime?, totalTime?, recipeYield?, basis}` is zod-checked
  (whole minutes, 1–10,080; total ≥ cook and ≥ prep; yield ≤ 60 chars) and
  only fills fields `fillGaps` left empty. `basis` is one short sentence
  ("25 min ferment + 20 proof + 17 bake + ~10 shaping"). A bad or missing
  answer drops the estimate with a warning; nothing else fails.
- **Edit page:** a **Fill gaps from the source** action (in the rail's
  save card or the Source section; shown when the recipe has `source.url`
  or `video`) runs the form import as a job with the live import panel
  (43e1's `ImportProgress`), then remounts the form with the merged values
  while the rail's baseline stays the stored recipe — so "N changes · not
  saved" counts the fills. Each filled section is marked "from the source"
  and each estimated field "estimated" with the basis on hover/focus and
  in text; a summary line lists what was filled and estimated, with
  **Undo** (F2). A source that yields nothing new says so.
- **CLI:** `pnpm recipes fill <slug> [--no-estimate] [--json]` prints the
  patch, `filled` and `estimated` without writing (the write stays
  `recipes update`). MCP is unchanged (59 tools / 45 pre-approved); the
  curator can already do this with `page_inspect` + `recipe_update`.
- Tests: `fillGaps` vitest (each emptiness shape; never overwrites; tags
  never added; image only when absent); `estimateTimes` vitest with a
  stubbed `fetch` (prompt carries the hints, bounds, a bad answer dropped,
  a total below cook rejected, no model → skipped); a Playwright spec with
  the stand-in Ollama and a fixture page (the import specs' pattern): fill
  → marks and summary → Save → stored values; Undo; no source → no
  action; model off → source-only with the note; axe; baselines touched
  regenerated in Docker. The CLI command's test.

### 45d — "Error parsing recipe" with nothing to see (bug, M)

Roger, 2026-10-22 ~16:15 EDT: "I try to import
https://www.youtube.com/watch?v=wiCEyvooYYI and the form has a parsing
error 'Error parsing recipe' and I can't see the error." Branch
`agent/45d-import-errors`.

#### Results (45d)

**Root cause.** Not the video, and not an import that ended in a save.
The workstation's job store has no job for the YouTube URL; at 16:17 it
has `01M5JM5W4FK1FSY1PWY17F2N3W`, a `form-url` import of
`brianlagerstrom.com/recipes/everything-dough/` — the same recipe's page,
whose result carries the video as `videoImportUrl` (so the form showed the
YouTube link in its Video field). The page's JSON-LD ends its "LARGE
LOAF:" `HowToSection` with a `HowToStep` whose text is empty.
`mapInstructions` kept it as `{text: ""}`; Create posted it; the schema's
step `text: min(1)` refused it; and the action answered
`z.flattenError(…).fieldErrors`, which keeps only the first path segment —
`instructions`, a key no field rendered — with the bare "Error parsing
recipe". Reproduced in vitest on `origin/main` (the mapper keeps the empty
step; `parseRecipeFormData` on the posted shape fails with only
`instructions`) before any fix. On `main` the rail at least marked Steps
"check"; on Roger's 5ca3c53f (before 43e1) nothing did.

**Roger's trigger on main?** Yes until this phase: the mapper and the
schema are unchanged since 5ca3c53f. The other suspected triggers are not
real: on 5ca3c53f and on main the URL field is in its own `import-form`
(Enter there submits the import, not the recipe), every in-form button is
the component library's `Button` (`type="button"` by default), and a video
URL takes the import action like any other link.

**What changed.**

- **Imports drop blank rows** (`common/util/blankRows.ts`): an empty or
  whitespace-only (`&nbsp;` too) ingredient or step is no row; a group left
  with no steps is dropped; a nameless group's steps join the list. Applied
  at the page mapper (`mapInstructions`), the form's import result
  (`formImport.ts` `withLlm`, each batch reading too) and the curation
  input (`importedToInput`: CLI, MCP, the batch picker). The model's
  extractor already dropped blank steps (`instructionEntries`).
- **The form drops blank rows before it validates** (`parseFormData.ts`):
  an untouched "Add ingredient", a blank heading, a step with no name and
  no text, a nameless group whose steps are all blank — dropped, not
  refused. An all-blank list is no list. Kept rows are kept byte for byte
  (D4's round trip; 43e2's De2-6 empty step name is still no name).
- **Every refusal says where it is** (`controller/recipeFormErrors.ts`):
  the steps are checked by hand so the message names the step as the form
  numbers it (reading order across groups) — "Step 4 has no text"; a
  group shows no number, so it is named by its first step, its place or
  its name — "The group starting “Divide cold dough into…” needs a name",
  "The group after step 4 needs a name", "Group “Topping” has no steps",
  "… has only empty steps" — and "Name is required", "Video link isn't a
  URL", "Source link isn't a URL"; any other field's zod message is
  prefixed with what it is about ("Prep time: Invalid number", "Timeline
  1, event 2: …"). Filed under the top-level key the fields and the rail's
  markers already read (`videoImportUrl` / `imageImportUrl` mark Picture;
  a key no section holds is "Other"). The message counts every problem and
  names the sections in page order: **"Couldn't save: 2 problems —
  Picture, Steps."**
- **Shown where they belong**: `FormSection` takes `errors` and lists them
  under the heading (`data-testid="section-errors-<id>"`) for the problems
  no single field shows — Ingredients, Steps (steps and timelines),
  Picture and video (the video link) — beside the rail's "check" (43e1).
  The list is the section heading's description (`aria-describedby`), not
  a live region: the save's message is the one that announces.
  `mergeFieldErrors` de-duplicates (the server's and the field's "Name is
  required").
- **A video description's own lists, without the model**
  (`controller/descriptionRecipe.ts`): under a recipe heading (a short
  line that says "recipe" or "ingredients", followed by a list),
  `∙ • · ● ▪ ◦` / `- ` / `* ` lines are ingredients (through
  `createIngredient`, as imports mark them), `1.` / `1)` lines steps, and a
  short line before a list a heading (an ingredient part, or a step group:
  "Large Loaf", "Baguettes"…). A link (also a bare domain like
  `geni.us/abc` or `example.shop`, or an `@handle`), a timestamp, prose,
  or a heading about gear, tools, a kit, a code, a sponsor, a shop or an
  affiliate ends the block; it counts with two ingredient lines **and** a
  step, and only when the description has one recipe heading (two —
  "RECIPE 1: Pancakes … RECIPE 2: Waffles" — are the model's to split,
  36e). A body read here clears `partial`, except after a forced or failed
  model call. Brian Lagerstrom's
  description reads as 6 ingredients, 4 steps and five groups (Large Loaf
  4, Baguettes 3, Pizza 2, Bagels 4, Soft Pretzels 4); the gear list, the
  "WATCH NEXT" links and the chapters are left alone.
  `withDescriptionRecipe` runs **after** `applyLlm` and `followRecipeLink`
  in all three video paths (form, `inspect`, curation import), and only
  when the result has no ingredients and no steps and is not a batch or a
  followed page — so `ytdlpToRecipe` is unchanged, `auto` still asks the
  model for every video (`autoWantsModel` sees no body), and the model's
  reading always wins. It logs a `description` note in the job.

**Decisions.**

- **Dd1 blank rows are dropped, not refused** (the brief's "better
  still", which the orchestrator preferred). A blank row carries nothing;
  refusing it only ever produced this bug. What is still refused is
  something a person typed that cannot stand: a named step with no text, a
  group with steps and no name, a named group with no steps.
- **Dd2 errors keep top-level keys**, each message saying where it is,
  rather than a new `issues` field: `ContentFormState` is the engine's
  (portfolio shares it), and the fields and the rail already read the
  top-level keys. The problems no field shows are listed at their section.
- **Dd3 no old prefix**: "Error parsing recipe" is gone; the three
  `new-recipe.spec` cases that expected it now expect the save (a blank
  ingredient row, a blank step) or the new message ("Couldn't save: 1
  problem — Steps." and "The group starting “This is the first
  instruction” needs a name").
- **Dd4 the description reader is a fallback, never a mapper.** Putting it
  in `ytdlpToRecipe` would have given every such video a body, and `auto`
  would have stopped asking the model (`autoWantsModel`), losing the
  model's reading, splitting (36e) and the 38c follow.
- **Dd5 a group named in the description keeps its words** ("Large Loaf",
  trailing colon dropped); an ingredient part's heading gets the colon
  `createIngredient` reads as a heading ("Dough:").

**Tests.** vitest: `importRecipeSource` (a section ending with an empty and
an `&nbsp;` step, an empty section, a nameless section, a bare empty step
and string), `parseRecipeForm` (Roger's posted shape saves; blank rows
dropped; the refusals' sentences and the summary), `descriptionRecipe`
(the Everything Dough description from the e2e fixture; negatives: a gear
list of links, bulleted links under a recipe heading, chapter lists
numbered or not, timestamps after the steps, lists with no recipe heading,
one ingredient, emphasis lines, and the review's probe — gear behind bare
domains, tools with no links, a sponsor's code, handles, a list with no
steps, prose under the heading, two recipes together or apart; the model's
reading, a batch and a followed page never replaced; `partial` kept after a
forced or failed model). Playwright: new `import-errors.spec` (the
fixture page `uploads/everything-dough.html` imports and saves with the
blank step gone; the yt-dlp fixture `everything-dough.json` fills the form
with no model and saves; a refused save shows the message, the section
errors and the rail's "check", then saves once fixed), and the three
`new-recipe.spec` cases above.

**Review fixes** (after the review of 151406cf): the description reader's
false positives (bare domains and handles are links; gear/tool/kit/code/
sponsor/shop/affiliate headings never start or continue a block; a step is
required; two recipe headings are left to the model; `partial` kept after
a forced or failed model); groups named by first step, place or name;
timeline events by number; every problem counted; the section list
described by its heading rather than a live region; `videoImportUrl` /
`imageImportUrl` mark Picture and unknown keys say "Other".

**Found by the gates:** the curation input carries prose strings beside
`Instruction` objects (the photo picker's batch); `dropBlankSteps` read
them with `in` and threw (`photoImport.test.ts`). Blank rows now keep a
caller's prose lines and steps (`test/blankRows.test.ts`).

**Gates** (head after the review fixes; `origin/main` had not moved).
`recipe-editor` typecheck and `recipe-website` `tsc --noEmit` clean;
vitest 157 files / 3,462 tests; Playwright in Docker, build mode:
`import-errors`, `new-recipe`, `ytdlp-import`, `edit-form-frame`, `edit`,
`multi-recipe` 72/72; `import-errors` in dev mode (Docker): 2 passed, 1
flaky (the save's navigation to a cold-compiled recipe page over 5 s), then
3/3 with a 15 s wait on that navigation. No baselines moved.

**Roger to confirm:** Dd1 (blank rows dropped silently, no note); the
messages' wording ("Couldn't save: …", groups named by their first step);
the description reader's reach (one recipe heading, two ingredient lines
and a step) — a video with its recipe in lists now imports with no model.

**Traps (45d).**

- `z.flattenError(…).fieldErrors` keeps the first path segment only: a
  nested issue becomes a top-level key with zod's generic message. Say
  where in the message.
- The curation input's ingredients and steps may be strings as well as
  objects: a helper over imported rows must take both.

### 45e — Alternatives

Roger, 2026-10-22, on /recipe/25-minute-everything-bread-dough-lagerstrom (dough, then Large loaf / Baguettes / Pizza / Bagels / Soft pretzels shown one after another): "Could we put all the alternate baking methods as selectable alternatives rather than showing all sequentially?"

His answers:

- **Segmented tabs** on the recipe page. The pick is remembered on the device and can be linked.
- **Each option can have its own extra ingredients and a yield.**
- **Authoring:** an edit-form toggle, and imports that detect it. The orchestrator converts the everything-dough recipe after it ships.
- "**A generic 'alternative/parallel sections' construct** that can be used for many things, definitely not 'ways to finish' — maybe an alternative crumb and/or frosting in a complex cake framework recipe."
- "**Always mark when the AI makes a change** [so] the editor can approve it."

#### Decisions (45e)

- **G1, the data shape (backward-compatible).**
  - An optional `choice?: string` on an `InstructionGroup` and on a heading `Ingredient`.
  - **Consecutive** step groups with the same `choice` form one **set**. The `choice` value is the set's label ("Then make", "Crumb", "Frosting"), and each group's `name` is an option's label ("Bagels").
  - A recipe may have several sets.
  - An ingredient heading with the same `choice` and a name matching an option (`sectionKey`, as `matchStepIngredients` already pairs) owns that option's extra lines, up to the next heading.
  - An optional `recipeYield?: string` on a choice group is that option's yield.
  - Old data needs no change. Old readers and anything not yet taught see ordinary groups and headings, stacked as today.
- **G2, the default option is the first.** Wherever one value is needed (Make, the plan run sheet, JSON-LD, the index's counts, the shopping list from a plan), the default option stands in for its set. The chosen option is used only where a reader has chosen.
- **G3, choosing is per reader.** The pick is remembered per recipe in `localStorage`, read after hydration so the server renders the default (the U1 trap). It is linkable with a query parameter, e.g. `?pick=bagels` or `?pick=crumb:streusel,frosting:cream-cheese`; the worker chooses the exact shape and records it. An "All" choice shows every option stacked, and print shows all.
- **G4, step numbers count within the shown path.** Shared steps are numbered 1…n, and the chosen option's steps continue from n+1. Anchors and timer ids include the option slug where they fall inside an option, so `stepTimerId` never collides across options. Heads-up "step N" references follow the shown numbering.
- **G5, AI changes are marked and approved.** No import, model or curator path writes `choice` silently in the editor. A detected set arrives as a **suggestion** in the form ("These 5 groups look like alternatives — Make them a choice?"), marked like 45b's fills, and is applied only when the person accepts it and saves. CLI and MCP writes stay explicit.
- **G6, the JSON-LD fix.** Emit the default path and fix the existing bug where every `HowToSection` is named "To Store" (`View/JsonLD/index.tsx`:37) instead of `entry.name`.

#### Phases (45e)

| Phase   | What                                                                                                                                                                                        | Size | Branch                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------ |
| 45e1    | Data and every reader: schemas, recipe page tabs, cook view, shopping, Make, plans, JSON-LD                                                                                                 | L    | `agent/45e1-alternatives`      |
| 45e2    | Authoring: edit-form choice controls, per-option ingredients and yield, import detection as a marked suggestion, curator docs                                                               | L    | `agent/45e2-alternatives-form` |
| content | The orchestrator converts everything-dough (extras: molasses, baking soda, semolina, sauce and toppings; yields 1 loaf / 4 baguettes / 4 pizzas / 8 bagels / 8 pretzels), after 45e1 merges | S    | (real repo)                    |

#### 45e1 (files from the survey; verify each on origin/main)

- **Schema:**
  - `common/controller/types.ts`:7-22 (`Ingredient`, `InstructionGroup`).
  - `editor/controller/curation/schema.ts`:59-89, :139-150, :169-180: these are `strictObject`s, so add the keys.
  - `editor/controller/parseFormData.ts` `RecipeFormSchema`: `z.object` silently strips unknown keys. Add `choice` and the per-group `recipeYield`, and keep 45d's hand-written step checks.
  - `toIngredients` / `toInstructions` (schema.ts:836/846).
  - `common/util/recipeText.ts`. Round-trip test: a recipe with `choice` saved through the form with no changes is byte-identical (43-D4).
- **A pure model:** `common/util/alternatives.ts`. `readChoices(recipe)` returns `{sets: [{key, label, options: [{slug, label, groupIndexes, ingredientRange?, yield?}]}]}`, and `shownPath(recipe, picks)` returns the steps and ingredient lines on the chosen path with display numbers (G4). Vitest it hard, including recipes with no sets, two sets, a set at the start, mismatched ingredient headings, and an option with no extras.
- **Recipe page:**
  - `View/Instructions/index.tsx`: segmented tabs (Radix ToggleGroup or the site's segmented control; ≥ 24 px; keyboard; `aria-pressed` or a tablist, whichever is right) above each set, with the option's yield ("makes 8 bagels").
  - `View/Ingredients/index.tsx`: the rail shows the shared lines plus the chosen option's extras under its heading.
  - `JumpLinks`, `stepNumbers`, `stepId` and `stepTimerId` follow G4.
  - `matchStepIngredients` already pairs by section name. Check it.
  - `findHeadsUps` runs over the shown path. It is server-computed today, so either compute it per option or on the client; measure and record the choice.
  - MetaBar yield: the option's yield when chosen.
- **Cook view** (`FocusView`): `flattenSteps` over the shown path, with a compact picker at its top. `cookProgress`'s sessionStorage indices are keyed by the pick so a switch doesn't misread progress.
- **Consumers:**
  - `shoppingLines.recipeLines` takes `picks?` (default G2), and "add to list" from the recipe page sends the reader's pick.
  - `parseIngredientList` and `makeable`: Make counts the default option. The index value gains `ingredientChoices` if needed (bump the index value per 39b, so the stamp rebuilds; record "reindex: automatic").
  - `planTimes` / `readPlanPage`: the default option.
  - JSON-LD per G6.
  - The export site reuses `RecipeView`. Verify it with the export build.
- **Tests:**
  - Vitest: the model, schemas, the round trip, shopping and makeable with choices.
  - Playwright: a new `alternatives.spec` on a fixture recipe with one set and extras (tabs, pick, the rail changes, numbering, `?pick=` link, remembered after reload, "All", cook view, add-to-list sends the pick, axe), plus a two-set fixture.
  - New baselines (recipe page desktop and phone) in Docker. Existing recipe-page baselines must not move (old data renders as before).

#### Results (45e1)

**The model.** `common/util/alternatives.ts` is the browser's half and
imports nothing but slugify: the `Choices` model (`sets`, `entrySteps`,
`ingredientCount`), `shownPath(choices, picks)`, the pick helpers
(`resolvePicks`, `cookPicks`, `parsePickParam` / `formatPickParam`, the
localStorage pair) and `plainChoices` for a recipe with nothing to choose.
`common/util/readChoices.ts` is the server's half — `readChoices(recipe)`,
`recipeOnPath(recipe, picks?)`, `alternateLines(recipe)` — because pairing a
heading with its option goes through `sectionKey`, so through
`ingredientNames`, which 42c1 kept off the recipe page's bundle. The page
computes the model on the server and hands it to `ChoicesProvider`
(`View/Choices`), which every reader on the page reads: the steps, the
rail, the heads-up, the yield, the cook view and "Add to list".

**Decisions (De1-…).**

- **De1-1 a set needs two options.** A lone group with a `choice`, or a
  `choice` on a bare step, reads as an ordinary group. `choice` values and
  group names are compared by slug, so "Then make" / "then make" are one
  set and two groups called "Bagels" in one run are one option
  (`groupIndexes` has both). Set keys and option slugs are made unique
  (`-2`); an option slugged `all` becomes `all-2`. An unnamed group is
  labelled by its place ("Option 1", slug `option-1`) and never merges with
  another option, even one named "Option 1".
- **De1-2 an option's lines.** `ingredientLines` (a list, not the plan's
  `ingredientRange`): the heading carrying the set's label whose name meets
  the option's by `sectionKey` (falling back to the slug), through the line
  before the next heading — stored, or one `detectHeading` sees, as
  `lineNames` reads sections. A heading that meets no option, or names
  another set, is an ordinary heading and always shows.
- **De1-3 numbering (G4).** Every option is numbered from its set's start
  as if chosen; the shared steps after a set continue from the chosen
  option, and under "All" from the default (G2). Anchors: `step-N` for a
  shared step (unchanged), `step-<option>-N` inside an option,
  `step-<set>-<option>-N` when two sets share an option slug. Timer ids
  follow (`stepTimerId` takes the key: `step-bagels-6-0`); the cook view
  uses the same keys, so a timer started on the page is the same timer
  there.
- **De1-4 `?pick=` shapes.** `?pick=bagels` (a bare option slug names the
  first set with it), `?pick=all`, `?pick=crumb:streusel,frosting:all`.
  Written with `history.replaceState` when the reader picks, only for sets
  off their default (the default path drops the parameter); unknown parts
  are ignored. Precedence after hydration: the link, then the device's
  `recipe-pick:<slug>` (localStorage), then the default. The server and
  the first client render are always the default (U1).
- **De1-5 off-path content stays in the DOM**, marked `data-off-path` and
  hidden by a screen-only rule in `recipe.css`, so print shows every option
  stacked (the picker is `print:hidden`). The picker is a Radix
  ToggleGroup (single): `role="group"` named by the set's label, each
  option a `radio` with `aria-checked`, arrow keys between them, 32 px
  tall; "All" last. It sits at the top of the set; each option's group
  heading says "makes 8 bagels" when it has a yield; the rail's option
  headings say "Only for Bagels · choose another" (a link to the picker).
- **De1-6 heads-up on the client.** `headsUpCandidates` (server) returns
  every heads-up sentence with its entry and step; `selectHeadsUps`
  (`util/headsUpSelect.ts`, no imports) picks the path's in the browser and
  numbers them. Per-option server computation would need one answer per
  combination of picks across sets; the candidates are a handful of
  sentences (one for the test dough), and `isHeadsUp` stays on the server.
  `findHeadsUps` is now `selectHeadsUps` over `stepNumbers`, the same
  answer as before for every recipe. **The box never comes and goes with
  the pick (U1):** when any option has a note, the server renders the
  "Plan ahead" box and the client keeps it; a chosen path with no note
  says one muted line instead, "Nothing to plan ahead for Pretzels" (the
  chosen options of the sets whose other options hold a note). Notes off
  the path are not rendered, so print shows the path's notes only.
- **De1-7 one value (G2).** `recipeOnPath` (default path, "All" read as the
  default, the option's yield) feeds JSON-LD, the plan page's rows and
  run-sheet times (`planRecipeView`, the sub-plan rows). The jump row
  (`PathJumpLinks`, client) counts the reader's path as the steps do —
  `showJumpLinksOnPath` over `shownPath`'s lines and steps — so the server
  renders the default path's answer, and a recipe without alternatives
  gets exactly `showJumpLinks`' row. The shopping list's `recipeLines(recipe, picks?)` follows the
  pick (an "All" pick adds every option's lines); a plan or a sub-recipe
  adds the defaults. `shopping_add` gains `picks` (recipe adds only), which
  the recipe page sends; MCP sees it through the shared schema, its blurb
  is 45e2's. Its keys and values take up to 200 characters: they are
  slugs of labels and group names (plus `-2`), and a group name has no
  cap, so 80 refused a long option's "Add to list" as `validation`.
- **De1-8 Make.** The index value gains `ingredientAlternates` (lines off
  the default path), written only when non-empty, carried to `/make`'s
  corpus and to `readMakeCorpus`; `prepareRecipe` drops those lines'
  requirements. `recipeContentConfig.indexVersion` is now `"2"`:
  **reindex: automatic** — every instance rebuilds once at its next start.
- **De1-9 JSON-LD (G6).** Sections are named by their group (an unnamed one
  gets no name); "To Store" is gone. Only the default path is emitted.
- **De1-10 the form keeps it (43-D4).** 45e1 adds no controls: a group's
  `choice` / `recipeYield` and a heading's `choice` ride in hidden inputs
  and `parseFormData` keeps them, byte for byte
  (`editFormRoundTrip.test.tsx`). Text mode in the ingredients section
  re-reads lines and drops a heading's `choice` (45e2).
- **De1-11 the write schema** takes `choice` (trimmed, 1–80 characters) on a
  group and on a heading only, and `recipeYield` on a group. Nothing in
  this phase writes `choice` from a model (G5).
- **De1-12 `matchStepIngredients` unchanged.** Checked: an option's group
  and its heading meet by `sectionKey`, so an option's step is scoped to its
  own lines exactly as 42c1's "Crust" / "For the crust" are. A step's Uses
  list on the page drops lines off the reader's path.
- **De1-13 the cook view** cooks one path (`cookPicks`): a compact picker
  (no "All") at its top changes the page's pick too, and its ticks live
  under `cook-view:<slug>|<path>` — a recipe without alternatives keeps
  `cook-view:<slug>`.

**Known limits (for 45e2's form).**

- **Two sets with the same label** ("Frosting", a shared step, "Frosting"
  again) read as two sets (`frosting`, `frosting-2`), but an ingredient
  heading's `choice` names a set only by its label, so a heading binds to
  the first such set that has an option of its name. 45e2's form should
  refuse duplicate set labels in one recipe.
- The ingredients section's text mode drops a heading's `choice` (De1-10;
  45e2's).
- Option slugs are as long as their group names; nothing truncates them
  (the `picks` cap is 200).

**Review fixes (finisher, on 1450cfc9's review).** The heads-up box stays
across picks (De1-6); `picks` caps at 200 (De1-7); the jump row follows the
pick (De1-7); an unnamed option reads "Option N" (De1-1); the test that
rebuilt `findHeadsUps` from itself now checks hand-worked notes for the
plain dough's one path, and the jump row on a path has its own cases.
Assertions the first worker had guessed, settled against what is right:
the pretzels' dip step uses **both** its own lines ("1/4 cup baking soda",
"Flaky sea salt, for topping" — its "flaky salt" meets the topping salt,
not the dough's), so the spec now checks the exact list rather than
`toContainText` of one; the Make case (bread flour, water, salt, molasses
on the shelf makes the dough on its default, Bagels; without
`ingredientAlternates` the pretzels' lines count and it does not) was
already right and stays.

**Roger to confirm:** an "All" pick on the recipe page adds every option's
extras to the shopping list (the list follows what the page shows); the
yield sits in each option's heading line and in the meta strip, not in the
buttons; the rail's "Only for Bagels · choose another" note. **Accepted
after hydration:** a remembered or linked pick changes, once the page is
live, the meta strip's yield, the rail's option lines, the steps and their
numbers, and the jump row (which can appear or go when a pick crosses its
15-line threshold) — the heads-up box alone is held in place.

#### 45e2 (outline; brief written after 45e1)

- **Edit form, Steps:** select consecutive groups and "Make these a choice", label the set, reorder options, and a yield per option. **Ingredients:** a heading row can be tied to an option, which pairs by name automatically.
- **Import detection:** the extractor and the deterministic path propose a set when sibling sections are parallel endings. Shown as a marked suggestion (G5), accepted or dismissed in the form.
- The curator skill and the MCP `recipe_create` / `recipe_update` blurbs document `choice`.

### 45c — Close-out

Doc, CLAUDE.md bullet, backlog, memory; the orchestrator's real check on
1-hour-bagels in a scratch clone; Roger's steps (workstation update,
`pnpm deploy:pi`).

## Traps known at the start

- **36's extraction prompt forbids estimating** (`extractRecipe.ts` ~:106):
  don't relax it; estimates are F4's separate call.
- **The form stores a blank time as 0** (`durationSchema` in
  `parseFormData.ts`), and `recipeToFormValues` defaults times to 0: a 0
  is "empty" for the fill.
- **The new-recipe form applies an import by remounting the shell**
  (`key=…`, `recipe=…`); there is no field-level apply. The edit page's
  rail baseline must stay the stored recipe or the change count is wrong.
- **`suggestedTags` are never applied automatically** (43e2): keep it so.
- **The control names specs rely on** ("Add a tag", "Remove tag X",
  "Add tag X", "Accept suggested tag X") — keep them or update every spec.
