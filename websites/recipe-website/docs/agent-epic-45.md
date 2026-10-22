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
  the text exactly. Text the recipe already carries says "“x” is already on
  this recipe." instead of offering a no-op. An import suggestion among the
  matches keeps its dashed outline.
- **Keyboard**: ↓/↑ move `aria-activedescendant`, Enter (or a comma) takes
  the highlighted option, else the exact match, else the new tag; Escape
  clears; Backspace never removes a chip. After an add the field clears and
  keeps focus (a click on an option never blurs it), and an `aria-live=polite`
  region says "Added X". The 43e2 blur rule stays: leaving the field takes
  only text that exactly names a term (without pulling focus back).
- Pure logic in `tagPicker.ts`: new `facetLabel(model, slug)` (the group that
  places the term or its nearest ancestor), `MATCH_LIMIT`, and
  `tagFieldOptions(picker, text, tags)` → `{matches, exact, newTag?,
already?}`; `exactOption` returns −1 for empty text. Removed as dead:
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

**Roger to confirm.** The group form now has the same quiet picker as the
recipe form (it showed every tag too). The drinks families' "find a drink
name…" shortcut went with the rows — a drink name is found by typing it.

**Tests.** `test/tagPicker.test.ts` (new, 22 tests: counts, `facetLabel`,
ranking, alias, chosen left out, the cap, empty state, `tagFieldOptions`'
new/exact/already, suggestions at rest, D4 adds). New
`playwright/tests/tag-picker.spec.ts` (type → keyboard add → chip → remove,
alias, new tag, already, Escape/Backspace, click keeps focus, axe on the
section at rest and typing; an import's suggestion at rest, accepted; phone
targets and wrap). Updated `recipe-tags-aggregate.spec`, `search-tags.spec`
(type, then the option) and the comment in `groups.spec`.

**Gates.** _(filled in after review)_

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
