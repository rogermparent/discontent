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

#### 45b Results

What changed (branch `agent/45b-fill`):

- **`fillGaps`** (`editor/controller/curation/fillGaps.ts`, pure and
  browser-safe): fills only empty fields (F3: `0`/absent times, blank
  strings, `[]` lists, absent image/video/drink) from the source's reading,
  in the form's order — description, yield, picture (`imageImportUrl`),
  video (`videoImportUrl`), ingredients, steps, the three times, the drink
  spec — and never from an empty value; never `name`, `slug`, `date`,
  `source`, `timelines` or `partial`. Tags are never added: the source's
  `suggestedTags` and `tags`, less the recipe's own (case-folded), come back
  as `suggestedTags`, which the picker offers through 43e2's existing
  `suggestedTags` path (45a's area). `applyEstimate` lays an estimate on the
  time/yield fields still empty; `estimateWanted` says which those are;
  `fillSourceUrl` is the link a fill reads — `source.url`, else `video`
  when it is a video host's page (an uploaded file is not).
- **`estimateTimes`** (`editor/controller/llm/estimateTimes.ts`, F4/F5):
  one `chatJson` call with its own system prompt and JSON Schema (no bounds
  in the schema — the Claude API refuses them — zod holds them:
  `EstimateAnswerSchema`). The user message carries the name, the known
  values, the ingredient lines and steps (markup stripped, cut at 12k
  chars), and the hints — every time `findStepTimes` reads in a step,
  named by `stepWaits`' verb ("step 2: rise 15 to 20 minutes"), and
  `readPlanTimes`' oven, bake and chill facts. Checked: whole minutes
  1–10,080 (a model's `0`/`null` reads as "left out"), a total no shorter
  than the prep or the cook time (the stored values included), a yield of
  at most 60 characters, a non-empty `basis` (cut to 200 characters). A bad
  answer, a failed call or no model drops the estimate with a warning;
  a cancel is rethrown. In a job it is an `llm.estimate` step with the
  model's tokens ("Model estimates the times and yield", `N estimated`).
  `numCtx` is `contextStep` of the prompt plus 256 answer tokens (40a). 36's
  extraction prompt is untouched.
- **`fillRecipe`** (`editor/controller/curation/fillRecipe.ts`) and a
  **`fill` job kind** (`{contentDirectory, slug, estimate?}`, resources
  gpu/ytdlp/site, writes nothing): reads the stored recipe, imports its
  `fillSourceUrl` with `importFromUrl(url, {llm: "auto", asOne: true})`,
  fills, then estimates the fields still empty when there are ingredients
  or steps to estimate from. Its result is `source` (the fillable reading),
  `filled`, `estimated` `{fields, values, basis, model}`, a `patch` for
  `recipes update` (`toDraft`'s plain lines, the picture as
  `imageImportUrl`), `suggestedTags`, `llm` and `warnings`.
- **Edit page**: a "Fill gaps from the source" strip at the head of the
  form column when the recipe has a source link or a video
  (`FillFromSource.tsx`, `fillActions.ts`): it names the empty fields,
  starts the `fill` job (`?fill=<job>` in the address, as `/new-recipe?job=`
  — a reload, or `/jobs/<id>`'s new "Open in the form", reopens it),
  follows it in 43e1's `ImportProgress` (now taking `words`: "Fill done",
  "Reading the source…"), then **re-runs `fillGaps` over the form's current
  values** (a typed edit survives) and remounts the form with them; the
  rail's baseline stays the stored recipe, so "N changes · not saved" counts
  the fills (a filled picture or video counts through the rail's new
  `extraChanges`). Marks: each filled section's heading says "from the
  source" (or "estimated", or both) where an import's "from the page" goes;
  each estimated field gets a dashed tape, "estimated · prep time", whose
  basis shows on hover and focus (Radix tooltip) and in text beside it
  ("Estimated by local model qwen3:8b: 25 min rise + …"); the rail's rows
  say "4 · filled" / "1h 15m · est." while the section holds what the fill
  left (an edit there drops the mark, as an edited estimate drops its
  tape). The summary lists what was filled and estimated, with **Undo**
  (remount on the stored recipe, the address back to `/edit`); a source
  with nothing new says so and changes nothing; the warnings (the model's
  notes, "No model is configured, so … were not estimated") follow it.
  Save is the existing update action: the picture downloads through the
  checked `fetchImageFile` (26a), the video is stored as its URL.
- **CLI**: `pnpm recipes fill <slug> [--no-estimate] [--out patch.json]
[--json]` prints the fill and its patch, writes nothing (`update` is the
  write); `--remote` posts `POST /api/recipe/<slug>/fill` (`read` scope, as
  `/api/inspect`). Help text added; no new environment key. MCP unchanged
  (59 tools / 45 pre-approved).

Decisions (Fb-n):

- **Fb1 — the action sits at the head of the form column**, not in the
  rail's save card or the Source section: the live panel needs the
  column's width (the rail is 13.75 rem), the phone's save card is the
  sticky bar (a panel there would cover the form), and the Source section
  is last, below the fold, while the marks and the summary want to be seen
  first. It is where /new-recipe's Start from sits. **Roger to confirm.**
- **Fb2 — the form fills its own current values, not the stored recipe**:
  the job answers the source's reading and the estimate, and the page runs
  `fillGaps` + `applyEstimate` again over what the form holds, so nothing
  typed before the fill is lost (F1 for the person's edits too). The CLI's
  patch is the stored recipe's.
- **Fb3 — the source is read in `auto` mode, as one recipe**: a page with
  recipe data is not re-read by a model (its data wins); a video's text
  is. `asOne` because a fill fills one recipe.
- **Fb4 — the marks are form state only**: nothing about a fill or an
  estimate is stored in the recipe; after Save an estimated time is a time.
  **Roger to confirm.**
- **Fb5 — the estimate is all or nothing**: an answer that fails a bound
  drops the whole estimate (one warning), rather than keeping its other
  fields — a total under the cook time says the model misread the recipe.
- **Fb6 — the estimate runs only with something to read**: no ingredients
  and no steps after the fill → no call, a warning.

Review fixes (the review of `25a3c8d6`, no blockers):

- **A fill or Undo after a failed Save wins.** The form used to key and
  fill on `state.formData` while a refused save's state stood, so an Undo
  said "Undone" over the filled values and a fresh Fill never remounted.
  The edit form now records the save state a fill or Undo came after
  (`passedState`): while that state stands, the fill (or the stored recipe)
  is what the form holds, and the refused save's message, errors and
  Overwrite go too; the next save's answer is a new state and wins again.
- **Picture and video edits survive a fill (F1, Fb2).** Only TanStack's
  values survived the remount; the picture and video inputs are
  uncontrolled. `common/components/Form/pictureCarry.ts` reads them off the
  form before the remount (`readPictureInputs`: the image file, the typed
  image URL, Remove Image, the video's mode, URL, file and Remove Video);
  `pictureTouched` says which of the picture and the video the person set
  (a video URL counts when it is not the saved one), and those are passed
  to `fillGaps` as `keep` — never filled — and carried back as the inputs'
  starting state (`ImageInput` `initialFile`/`initialUrl`/`initialClear`,
  `VideoInput` `initial`). A carried input counts as one change in the
  rail and its Picture status reads "new".
- **`?fill=<job>` checks the job.** The page applies only a `fill` job's
  result (`meta.kind`), and `isFillResult` (a slug and a `source` object)
  guards both the panel's result and `fillResultAction`'s; anything else
  says "That link isn't a fill for this recipe." (it said `That fill was
for "<slug>"` before, for another recipe's fill).
- **The form holds an estimate to the total rule.** `totalTimeProblem`
  (`fillGaps.ts`, browser-safe) is the rule `checkEstimate` throws on;
  `applyEstimate` now runs it over the form's values after laying the
  estimate, drops an estimated total shorter than a typed cook or prep time
  (or an estimated cook/prep longer than a total that is there) and answers
  a warning — "The estimated total time was dropped: the total (60 min) is
  shorter than the cook time (120 min)." — shown in the strip's notes. This
  is per field, unlike Fb5's all-or-nothing on the model's answer: the
  answer passed, and only the person's later value conflicts with it.
- **Heading marks follow edits.** A section heading's "from the source" /
  "estimated" now goes once the section differs from what the fill left
  (`fillKept`, the rail's rule, shared); the picture section holds files,
  not values, so it stays marked until Undo, as its rail row does.
- **Fb1 amended — a quiet line when nothing is empty.** When none of the
  fields the strip names is empty, it is one line: a ghost "Fill gaps from
  the source" button (36 px) and "Nothing looks empty." — a fill can still
  bring a video or a drink spec. The estimated tape keeps its height (a
  label, not a control).
- The "no model" vitest stubbed nothing and reached the stand-in when
  `RECIPE_LLM_URL` was exported; it now clears the `RECIPE_LLM_*`
  environment with `vi.stubEnv`. MCP `job_list`'s description names every
  kind (reindex, git-sync, agent, fill were missing); no test pins it.
- Backlog: the importer's missing private-host (SSRF) guard, the Pi as the
  exposure (predates 45b; not fixed here).

- The first gate runs found three faults in `fill-gaps.spec` itself and
  one in the vitest suite, none in the feature: the picker offers an
  import suggestion only for a tag with a term record (the spec now creates
  a "Breakfast" term first); a rail link's accessible name has no leading
  number (`/^Ingredients/`, not `/^4Ingredients/`); the edit page's own h1
  contains "Hour Bagels", so the post-Save wait is on the address (15 s,
  dev mode was slow) and the heading is matched exactly; and
  `fillGaps.ts`'s import of `Form/fillMarks` was off curation's D8
  allow-list (`test/curation.test.ts`; added — constants and pure
  functions, one type-only import).

Gates (after merging `origin/main` d5c37ef5):

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit`: clean.
- `pnpm exec vitest run`: 156 files, 3,454 tests passed (`fillGaps.test.ts`
  28, also green with `RECIPE_LLM_URL` exported).
- Playwright, Docker build mode: fill-gaps, edit, edit-form-frame,
  edit-duplicate-slug, jobs, new-recipe, photo-import, ytdlp-import,
  youtube-video and accessibility — 178 passed, the one failure the spec
  faults above; then fill-gaps, visual, recipe and ingredient-preview
  (every snapshot spec that opens an edit page) — 106 passed; fill-gaps
  again after the last spec edit — 6 passed. No baseline moved, none
  regenerated (the fixture recipes the snapshots open have no source link,
  so no strip).
- `fill-gaps.spec` in dev mode (Docker): 6 passed (an earlier dev run was
  flaky on the post-Save wait, fixed above).

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

**Gates (finisher, on origin/main 26b4ec58 = 45a + 45b merged in).**

- `pnpm --filter recipe-editor typecheck` and `pnpm --filter recipe-website
exec tsc --noEmit`: clean.
- `pnpm exec vitest run`: **160 files, 3546 tests passed.** The first run
  failed 2 in `reindexJobs.test.ts`, both De1-8's doing: the pinned index
  version hash moved (now `72c0224ea752c76e`), and the "a content index
  version" variant set `indexVersion: "2"`, which is now the real value —
  it bumps the current value instead.
- Playwright in Docker, build mode (alternatives, the recipe page specs,
  yield, cook view, shopping ×2, make, groups, plan page, `visual`,
  `mobile`, accessibility, timeline, edit — the regexes also took in
  multi-recipe): **369 of 370 passed.** The one failure was `visual`'s
  `git-page.png`: the git page prints the index version, and De1-8 moved
  it. Regenerated in Docker (only that PNG; the hash text is the whole
  diff), then 1/1.
- `alternatives.spec`: 13/13 in Docker build mode, 13/13 in dev mode.
- Baselines (Docker): new `alternatives-desktop-e2e.png` (Pretzels: the
  heads-up box with its "Nothing to plan ahead for Pretzels" line) and
  `alternatives-phone-mobile.png` (Bagels, the note). **No recipe-page
  baseline moved**; the one old PNG that moved is `git-page-e2e.png`, above.
- Export: `next build` of `recipe-website` on a scratch content dir with a
  choice recipe passed; `out/recipe/everything-dough.html` has the picker
  (Bagels `aria-checked="true"`, Pretzels, All), the default path's anchors
  (`step-bagels-2`, `step-bagels-3`, `step-pretzels-2` hidden, shared
  `step-4`), the "Plan ahead" box, JSON-LD `recipeYield` "8 bagels" and no
  "To Store".

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

#### Results (45e2)

**The Steps section.** A set is one block (`Form/Instructions/ChoiceSet.tsx`):
its **Choice label** (not posted itself — every option posts it as its
hidden `instructions[i].choice`), **Not a choice**, the note "A reader picks
one option. The first is the default: the recipe page shows it until they
pick another.", the set's problems as they are typed, its options as cards —
"Option 1 · default", **Option name**, **Option yield** (the group's
`recipeYield`), the steps, "Move option “Bagels” up / down" (inside the set
only) and "Remove option" — and **Add an option**. **Make a choice of
groups…** (shown when two groups that are in no set sit next to each other)
opens a panel: each such group gets "Include “Bagels” in the choice", a label
field, **Make these a choice** and Cancel; it says why it cannot yet ("Tick
at least two groups.", "The groups must sit next to each other, with no step
between them.", "Give the choice a label, such as “Then make”.", "Another
choice is already called “Frosting”."). An ordinary entry's ↑/↓ jump a whole
set rather than split it (`moveTarget`). The edits are pure
(`Instructions/choiceEdits.ts`).

**The rules** (`common/util/choiceChecks.ts`, shared by the form,
`parseFormData` and the curation schema) apply to a set the person has
**worked on** (see the review fixes below: a set as stored is never
judged). A
label is required ("The choice starting with “Large Loaf” needs a label"); a
set needs two options ("The choice “Then make” needs at least two options");
an option needs a name ("An option of the choice “Then make” needs a name" —
said instead of 45d's "The group … needs a name"), unique in its set ("… has
two options called “Bagels”"); and **two sets in one recipe can't share a
label** ("Two choices are called “Frosting”: give each its own label",
45e1's known limit). The server files them under `instructions`, so 45d's
summary says "Couldn't save: 1 problem — Steps." and the Steps section lists
them.

**Ingredients.** When the steps have sets, a heading row gets a select,
"Ingredient N option": "For every option" or "<set> › <option>"
(`Ingredients/headingTies.ts`). A heading with no tie whose name meets one
option's (`nameKey`, exported from `readChoices`) offers **Tie it to Then
make › Pretzels** — one click, never made by itself. A tie whose heading
name does not meet the option renames the heading to the option's name and
says so ("Renamed from “Toppings”: a heading pairs with its option by
name."), because the tie is by name (G1). A heading whose `choice` meets no
option says so. Relabelling a set moves its tied headings' `choice` along
(unless another set has the old label — the clash being fixed); Not a choice
unties them.

**Text mode keeps the tie.** A line that reads as before already kept its
object (and so its `choice`); an edited heading did not. `linesFromText` now
re-attaches a `choice` to a new heading whose `nameKey` still meets a tied
heading's ("For the bagels" → "For the Bagels:"). **No text syntax**: the
name is the tie. A heading renamed to something else loses it.

**Import detection** (`common/util/suggestChoices.ts`, pure, no model):
runs of consecutive named groups in no set, cut into stretches whose names
read as variants — one head noun with different words before it ("Vanilla
crumb" / "Chocolate crumb" → **Crumb**), one prefix before a colon or dash
("Frosting: cream cheese" → **Frosting**), every name a form or shape ("Large
Loaf", "Baguettes", "For bagels" → **Then make**), every name a method
("Stovetop", "Slow cooker" → **Method**), or every name an option/version
(**Version**). Proposed only after something shared (a step, a group or
another set), with step counts of a size (none more than 3× another, give or
take three), and no cross-reference (no option's steps name a sibling; no
later step names two options — a lasagna's two sauces). Never: names that
count or stage ("First rise", "Day 2"), verb-led names ("Make the dough" /
"Shape the dough"), shared heads that are parts ("Dry / Wet ingredients",
"layer"). A label the recipe already has gets a number ("Then make 2"). The
everything-dough video reads as `{label: "Then make", groups: [4…8]}`.

- **The form** (`formImport.ts` `withLlm`: URL, text and photo imports)
  carries it as `recipe.suggestedChoices`; the Steps section shows a marked
  card per suggestion — the dashed tape "suggested by the import", "These 5
  groups look like alternatives: Large Loaf, Baguettes, Pizza, Bagels and
  Soft Pretzels. Make them a choice, “Then make”?" — **Make it a choice** /
  **Not now**. Accepting changes form state only; the set block wears the
  same tape with "Not saved yet." and **Undo** (the groups ordinary again,
  the card back) until Save. A card whose groups an edit has moved is not
  shown (`suggestionFits`).
- **The edit page's fill** (45b) runs the heuristic over the merged recipe
  in the browser (filled steps or stored ones) and offers it the same way,
  "suggested by the fill".
- **CLI and MCP** never write `choice`: `page_inspect` (over
  `draft.instructions`), `recipe_import`'s dry run (the draft) and its
  create (the written recipe's entries) answer `suggestedChoices`, for the
  curator to apply with `recipe_update`.

**Docs.** The curator skill documents `choice`, an option's `recipeYield`,
headings tied to options, `suggestedChoices` as hints, and `picks` on
`shopping_add` (regenerated `skillText.generated.ts`). MCP: `recipe_create`
/ `recipe_update` carry `CHOICE_DESCRIPTION`; `shopping_add` documents
`picks`; `page_inspect` / `recipe_import` mention `suggestedChoices`. 59
tools / 45 pre-approved, unchanged.

**Decisions (De2-…).**

- **De2-1 deterministic detection only; the extractor is untouched.** The
  heuristic catches the everything-dough shape (both the video's
  description reading and a page's own sections), so 36's prompt gains no
  `parallel` hint and keeps its never-estimate rule (orchestrator: touch the
  extractor only if the heuristic missed it). **Roger to confirm.**
- **De2-2 a tie is by name.** Choosing an option whose name the heading's
  does not meet renames the heading to the option's name, said in a note;
  the data shape (G1) pairs by name and 45e1 reads it so.
- **De2-3 the form numbers steps in reading order** (as before, and as 45d's
  "Step N" messages count), not the page's G4 path numbering.
- **De2-4 the fill's suggestion is computed in the browser** over the merged
  recipe, rather than a `suggestedChoices` on the fill job's result: Fb2
  re-runs `fillGaps` over the form's own values, so only the browser knows
  the final steps. Shown only when a fill applies something; a fill with
  nothing new changes nothing (as 45b). **Roger to confirm.**
- **De2-5 option names unique in a set.** 45e1's reader merges two groups of
  one name into one option; the form refuses it instead (the brief's rule).
- **De2-6 (reversed by the review fixes) the curation write path judges
  every set**: `recipe_create` / `recipe_update` with `instructions` run
  `choiceProblems` over every set (`everySet`: each run of one label slug,
  a lone group included) and refuse a break as `validation`, in the form's
  words (`instructions.1.choice: The choice “Then make” needs at least two
options`). A write without `instructions` is not judged; neither are
  prose steps. The first worker had left it open (the readers cope,
  De1-1); with the form refusing what the API took, a curator's write
  could store a recipe the form then would not save once touched.
- **De2-7 the local curator skill (`skill-local.md`) is unchanged**: it has
  no recipe-shape section and a 1,200-token budget.

**Review fixes (finisher, on 715618bb's review).**

- **A set as stored, and a set worked on (De2-8).** The form reads stored
  sets exactly as `readChoices` does: a lone group with a `choice` (or two
  groups of one name) is an ordinary group that keeps its keys in hidden
  inputs; two sets of one label are two sets. Nothing judges them, so a
  save with no changes stays byte-identical (43-D4,
  `editFormRoundTrip.test.tsx`: both shapes). Once the person edits a set —
  its label, an option's name or yield, a move, an add, a remove — it is
  **worked on**: the form gives it an id (`InstructionsListInput`'s
  `worked`, by stable row key), each option posts it as a hidden
  `instructions[i].choiceSet` (read by `parseFormData`, never stored), and
  every rule applies, a set of one or a blank label included. The id, not
  the label, bounds a worked-on set (`choiceRuns(instructions, sets)`), so
  typing a neighbour's label never joins the two: it says "Two choices
  next to each other can't share a label" (the form and the server), and
  the edited block keeps its focus. A worked-on set next to a stored one of
  its label says the same. The server judges only what posts an id; the
  curation path judges everything (De2-6).
- **A label settles once (De2-9).** Typing in a set's label moves no
  headings; when the field is left (or Enter, which no longer submits the
  recipe) `settleLabel` moves the headings from the label they were last
  tied under to the new one — never to a blank label, never to one another
  set has (they wait under the old label, and move when the clash is
  fixed), never from one another set has. Backspacing "Then make" to "" and
  typing "Bake" ties them to "Bake"; typing "Frosting" through "Crumb" into
  "Crumbs" leaves the crumb's heading alone.
- **Stable keys** (`Form/stableKeys.ts`, `useStableKeys`): a row keeps its
  key while edited in place, moved, or as rows come and go — kept beside
  the form's values, never in them (`changedFields` and the fill compare
  the values). Option cards are keyed by it, so a second "Move option …
  down" moves the same card; the "Make a choice" ticks are kept by it; the
  accepted suggestion is tracked by its set's id, so a relabel or a
  numbered label (`freeLabel`, "Then make 2") keeps the mark and Undo; and
  a tie's "Renamed from …" note follows its ingredient row.
- **A tie's rename is undone**: "For every option", or a tie to an option
  the old name meets, gives the heading its old name back (while it still
  has the name the tie gave it — an edit since is the person's own).
- **Focus** after each action: "Make a choice of groups…" → the panel
  (`tabIndex=-1`, described by its instructions); "Make these a choice" and
  "Make it a choice" → the new set's label; Cancel → "Make a choice of
  groups…"; "Not a choice" → the first former option's name; "Not now" →
  the next suggestion card, else the first of its groups; Undo → the
  card's "Make it a choice"; "Remove option" → the name of the card that
  takes its place, else the one before; a move → the moved card's button
  (its other one at an end); "Add an option" → the new option's name.
  Option-name problems are linked to their field (`aria-describedby`,
  `aria-invalid`; `TextInput` gained `invalid`), and the label's too.
- **Minor.** A second heading of one option (same label, same name) is
  tied, as `readChoices` gives it that option's lines, not "dangling". The
  `recipe_import` blurb reads "as page_inspect does (after a create, its
  indexes count the written recipe's instructions)".
- **`suggestChoices`'s forms are of one kind** (dough, batter, pie, cookie,
  shaped, dish): "Tortillas" / "Tacos", "Burger buns" / "Burgers",
  "Meatballs" / "Sandwich" and "Pastry" / "Tart" are no longer suggested
  (vitest negatives); "Pizza" / "Calzones" and "Cupcakes" / "Layer cake"
  still are. Remaining on the reviewer's probe, all arguably real
  alternatives and only ever a suggestion: "White sauce" / "Red sauce"
  (Sauce), "Hot chocolate" / "Iced chocolate", "Dry rub" / "Wet rub", the
  method pairs, "Cookies" / "Bars", "Dinner rolls" / "Sandwich loaf".

**Gates (finisher, so far; origin/main still f7a161a6, so no merge).**
Both typechecks clean; eslint clean on the changed files; `choiceForm`,
`suggestChoices` and `editFormRoundTrip` 69/69 (before a test-helper fix,
68/69). The full `vitest run` was stopped by the machine's low-memory reaper
early on; the one failure it had shown (`alternatives.test.ts`, a 45e1 case
writing a set of one through the curation schema, which De2-6 now refuses)
is fixed. Still to run: the full vitest, the Docker build-mode specs, the
dev-mode `alternatives-form.spec`, and any moved baselines.

**Roger to confirm:** De2-1, De2-4; the label words ("Then make", "Method",
"Version", a head noun); a tie renaming its heading (De2-2); the curation
path refusing what breaks a rule (De2-6 reversed).

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
