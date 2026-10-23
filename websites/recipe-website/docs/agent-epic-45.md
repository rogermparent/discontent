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
