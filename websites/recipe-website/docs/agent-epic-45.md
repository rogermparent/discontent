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

| Phase | What                                             | Size | Branch           | Status |
| ----- | ------------------------------------------------ | ---- | ---------------- | ------ |
| 45a   | Tag picker: a field and suggestions as you type  | M    | `agent/45a-tags` | 🟡     |
| 45b   | Fill gaps from the source, with marked estimates | L    | `agent/45b-fill` | 🟡     |
| 45c   | Close-out                                        | S    | `agent/45-close` | 📝     |

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

#### 45a Results

**What changed.**

- `Form/Tags/index.tsx` is now three pieces: `TagChips` (the chosen tags,
  "Remove tag X", the hidden `tags[i]` inputs; 24 px remove targets; wraps),
  `TagField` (the combobox "Add a tag" and the **Suggestions** area under it,
  over any `tags` / `onChange`), and the recipe form's adapters `ChosenTags`
  (heading) and `RecipeTagField` (section body). `TagFacets`, `RowChips`,
  `FacetLine`, `AnythingElse` and the unused `useTagsSayDrink` are gone.
- **At rest** the area shows only the import's suggestions — a "From the
  import" group of dashed chips, "Accept suggested tag X" — or the hint
  "Type to find a tag, or to add a new one." The facet rows, "Other tags" and
  the drink-name "find a drink name…" buttons are gone.
- **Typing** lists `searchPickerTerms` matches inline (a listbox, not a
  popup) — label, the alias typed in quotes, a muted facet name and the count
  — capped at `MATCH_LIMIT` = 12, then **New tag "…"** when no match spells
  the text exactly. Text already chosen says "“x” is already chosen."
  (neutral: the group form shares it) instead of offering a no-op. An import
  suggestion among the matches keeps its dashed outline. A parent the
  recipe already reaches through a chosen child is marked "· through
  Cookies" (and "Already reached through Cookies (a child brings its
  parent)" in its description) and ranked after the other matches — see
  Da4.
- **Keyboard**: ↓/↑ move `aria-activedescendant`, Enter (or a comma) takes
  the highlighted option, else the exact match, else the new tag; Escape
  clears; Backspace never removes a chip; Enter and comma do nothing while
  an IME is composing (`nativeEvent.isComposing`). After an add the field
  clears and keeps focus (a click on an option never blurs it), and an
  `aria-live=polite` region says "Added X" — remounted per add, so a repeat
  is announced again. Removing a chip moves focus to the chip that took its
  place (or the one before), or to the field when none are left. The 43e2
  blur rule stays: leaving the field takes only text that exactly names a
  term (without pulling focus back).
- Pure logic in `tagPicker.ts`: new `facetLabel(model, slug)` (the group that
  places the term or its nearest ancestor), `MATCH_LIMIT`, and
  `tagFieldOptions(picker, text, tags)` → `{matches, exact, newTag?,
already?}`; a match carries `through` (Da4); `exactOption` returns −1 for
  empty text. Removed as dead:
  `pickerGroups`, `PICKER_GROUPS`, `COLLAPSED_GROUPS`, `looseTags`,
  `serializeFacetCounts` / `deserializeFacetCounts` / `SerializedFacetCounts`.
- **The group form** (`Form/Group/index.tsx`) drew `ChipsInput` with every
  tag as a one-click add — the same complaint. It now draws `TagChips` +
  `TagField` inside its own `TagPickerProvider`, over its existing `useState`
  (still uncontrolled `FormData`, same `tags[i]` inputs); `/group/new` and
  `/group/<slug>/edit` read `readTagPicker()` instead of `readTagLabels()`.
  The term form keeps `ChipsInput` (pinned recipes, aliases — not tags).

**Decisions.**

- **Da1 the server sends less.** `TagPickerData` is now `{terms, counts}`
  with `counts` the subtree pairs only (`countFacets(...).subtree`); the rest
  of `FacetCounts` (kinds, drinks, own, ownDrinks, groups, other) fed only the
  facet rows. `TagPicker.counts` is a `Map<slug, number>`. The facet name per
  match comes from the model alone (`groupsOf`), so nothing else is needed.
- **Da2 no `allTags` fallback.** Carried-only tags are already terms in
  `readTagPicker`'s vocabulary, so the corpus's loose tags are found by
  typing. The `allTags` prop and its `readTagLabels()` read are gone from the
  new-recipe, edit and copy pages (one read fewer per form load), and
  `readTagLabels` itself — its last callers were the forms — is removed.
- **Da3 control names.** "Add a tag", "Remove tag X", "Accept suggested tag
  X" kept as they were. "Add tag X" is kept as the accessible name of a
  match, but a match is now an `option` in the listbox (combobox semantics),
  not a `button`, and appears only once typed: `recipe-tags-aggregate.spec`
  and `search-tags.spec` type first and look for the option. A new tag's
  option is named "New tag X".
- **Da4 a reached parent is offered, marked (F1).** On a recipe tagged
  `cookies`, typing "dess" still offers Desserts — choosing it adds
  `dessert`, as 43e2's rows let you press a reached row — but the match says
  "· through Cookies" and ranks after every match the recipe doesn't reach
  yet (an exact spelling still leads, so Enter on "Desserts" takes it). The
  conservative reading: nothing an author could do is taken away; the label
  tells them it is redundant under the child-only convention.

**Roger to confirm.**

- The group form now has the same quiet picker as the recipe form (it
  showed every tag too).
- The drinks families' "find a drink name…" shortcut went with the rows — a
  drink name is found by typing it.
- A comma in the field commits, like Enter (43e2's behaviour, kept): a tag
  can't contain a comma.
- Da4: a parent reached through a chosen child can still be added by hand
  (marked "through …"), rather than hidden.

**Tests.** `test/tagPicker.test.ts` (new, 23 tests: counts, `facetLabel`,
ranking, alias, chosen left out, a reached parent marked and last, the cap,
empty state, `tagFieldOptions`' new/exact/already, suggestions at rest, D4
adds). `test/editFormFields.test.ts`: the facet-row cases (`pickerGroups`,
`looseTags`) dropped, the rest kept on the slim `counts`, plus a reached-
parent case. `test/editFormRoundTrip.test.tsx`: counts from
`countFacets(...).subtree`; the facet-row checks became the chip, typing
"dess" (Desserts "through Cookies") and typing "cook" → "Add tag Cookies",
with the same posted `tags` (`["cookies","usa"]`, `["usa","christmas"]`).
New `playwright/tests/tag-picker.spec.ts` (type → keyboard add → chip →
remove with focus handed on, alias, a reached parent marked, new tag,
already chosen, Escape/Backspace, click keeps focus, axe on the section at
rest and typing; an import's suggestion at rest, accepted, the last chip
removed hands focus to the field; phone targets and wrap). Updated
`recipe-tags-aggregate.spec`, `search-tags.spec` (type, then the option)
and the comment in `groups.spec`.

**Gates** (after merging `origin/main` d5c37ef5).

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: clean.
- `pnpm exec vitest run`: 156 files, 3446 tests passed. After the last
  markup fix, the three picker files were run again: 61/61.
- Playwright in Docker, production build, with `tag-picker`,
  `recipe-tags-aggregate`, `search-tags`, `recipe`, `groups`,
  `edit-form-frame`, `tag-pages`, `new-recipe`, `visual` and `mobile`:
  169 passed, 1 failed, 1 flaky.
  - The failure was `tag-picker`'s axe check: `label-content-name-mismatch`
    on the options' `aria-label` (Ta1). It is fixed.
  - The flaky test was `visual` "make page starting from nothing": a
    `make-ticker` strict-mode hit, unrelated to 45a, which passed on retry.
- Rerun after the fix (Docker, production build), with `tag-picker`,
  `recipe-tags-aggregate`, `search-tags`, `groups` and `visual`: 74/74.
- `tag-picker.spec` in dev mode (Docker): 3/3.
- Baselines regenerated in Docker, all form views with the Tags section at
  rest (now the field, "Suggestions" and the hint), and each one opened:
  `edit-form-populated`, `edit-form-overwrite`, `markdown-source-mode`,
  `new-recipe-form`, `new-recipe-form-overwrite`, `new-recipe-imported` and
  `edit-form-mobile`.

#### 45a Traps

- **Ta1 an option's name must contain its visible text.** An `aria-label`
  like "Add tag Gin" on an option whose content also shows the facet and
  count fails axe's `label-content-name-mismatch` (WCAG 2.5.3). The fix:
  - Put the name in one sr-only text node ("Add tag Gin").
  - Mark the visible label `aria-hidden`, and make the facet, count, alias
    and "through" the option's description.
  - Keep the name in one text node. A name split across an sr-only "Add
    tag " and a visible label came out differently in jsdom
    (testing-library could not find "Add tag Desserts").

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
