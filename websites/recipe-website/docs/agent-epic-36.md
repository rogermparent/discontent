# Epic 36 — Local-model recipe imports (Qwen via Ollama)

> **This is the durable source of truth for epic 36.** Read it before touching
> `editor/controller/llm/` (the local-model client, the extractor, `applyLlm`),
> `common/util/pageText.ts`, the `--llm` option on `import` / `inspect` /
> `import-list`, the text import mode, or the import form's "Extract with AI"
> toggle.
> Update the roadmap **Status** column and the **Now** line at every phase
> boundary. Earlier epics are cited by number with a prefix (`26-D3`,
> `35-D11`). `agent-import-tools.md` (epic 26: page parsing, the SEO
> fallback, `inspect`, drafts) is the background.

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** closed — 36a–36e all merged (#230–#235, main a7a989f0,
2026-10-15).

## Context

Roger wants recipe imports that use a local model (2026-10-14).

- **Today:** imports read only the JSON-LD `Recipe` node. A page without one
  (an old blog, a page with plain text) falls back to an "SEO" `partial` that
  has only the title, description and image (`mapRecipePage`,
  `common/util/importRecipeData.ts:423`). The only thing that fills in
  ingredients and steps is the curator agent itself, reading the page with
  WebFetch (26-D12).
- **Already on this workstation:** `ollama.service` 0.34.3 (Vulkan) with
  qwen3:8b, qwen3:14b, qwen2.5:7b, mistral-nemo and gemma2. The GPU is an
  RX 6600 with 8 GB of VRAM.
- **Measured 2026-10-14** (qwen3:8b, schema-constrained JSON, `think:false`,
  temperature 0):
  - A short page: copied ingredients and steps verbatim in about 4 s warm.
  - A 6.5k-token page (`num_ctx` 12288) with a recipe buried after 22 KB of
    noise: it found the recipe and split a run-on paragraph into ingredient
    lines; 31 s wall, including an 11 s cold load; prompt read at ~400 tok/s,
    output at ~37 tok/s; 6.8 GB VRAM, 100% on the GPU.
  - Times came back as English ("15 minutes"), so the prompt asks for
    integer minutes.

**Roger's decisions:**

- **When:** automatically as a fallback when a page has no schema, **plus** an
  opt-in "force" toggle for pages whose schema is bad.
- **Where:** the workstation only. The Pi has no model, so the feature reports
  "not configured" there.
- **Default model:** qwen3:8b, configurable.
- **Also (added while the plan was being opened):** an AI **text** import
  mode — paste a recipe's text and have the model structure it (D8, 36c).
  His example: a Brian Lagerstrom YouTube description, ingredients and
  instructions mixed with sponsor and link noise.

## Decisions

### D1 — Config in `editor/.env`; nothing set means off

- `RECIPE_LLM_URL` (e.g. `http://localhost:11434`), `RECIPE_LLM_MODEL`
  (default `qwen3:8b`) and `RECIPE_LLM_API` (`ollama` by default, or `openai`
  for llama.cpp / LM Studio / vLLM `/v1/chat/completions` with
  `response_format: json_schema`).
- _Amended by 38g (`agent-epic-38.md` Dg1):_ a third style,
  `RECIPE_LLM_API=anthropic` — the Claude API, on only with the new
  `RECIPE_LLM_API_KEY`; `RECIPE_LLM_URL` is optional for it (default
  `https://api.anthropic.com`) and `RECIPE_LLM_MODEL` defaults to
  `claude-sonnet-5`. This is how the Pi reads imports with a model.
- Next loads `editor/.env` for the workstation service. The CLI and the stdio
  MCP load it once the keys are added to `EDITOR_ENV_KEYS`
  (`editor/cli/editorEnv.ts:23`, 35-D11).
- The Pi's container doesn't set them, so the feature is off there with no
  code checking which host it is on. This deliberately avoids `readSettings`,
  because the CLI run from the repo root never sees `editor/settings` (the
  yt-dlp trap, `ytdlp.ts:57`).

### D2 — An editor controller only

- The client lives in `editor/controller/llm/` (26-D4: external tools live in
  the editor controller).
- Plain `fetch`, no SDK (T1: no ESM-only packages under tsx CJS), and
  lazy-imported (35q CLI startup).
- `common/` gets only the page-to-text helper.

### D3 — Mode `auto | force | off`, default `auto`

- **auto:** the model runs only when the mapper's result is `partial`, i.e.
  no Recipe node.
- **force:** the model runs even when a Recipe node exists, and its fields
  replace the schema's. Image, video, source and `suggestedTags` still come
  from the page.
- **off:** never.
- With no model configured, `auto` quietly does nothing, and `force` fails
  with `import_failed` "no local model configured (RECIPE_LLM_URL)".
- Video URLs: when yt-dlp's description holds a recipe, `auto` extracts it
  from title plus description, since a video has no schema either.

### D4 — Grounding guard against made-up lines

- Each extracted ingredient line is checked against the source text (the
  page text, the video description, or the pasted text in D8), after
  normalising fractions and whitespace and dropping punctuation. It counts as
  grounded if it appears there, or if ≥ 80% of its tokens do.
- The result carries `llm: {model, grounded, total}`. If fewer than 90% of
  lines are grounded, or there are no ingredients or no instructions, it
  stays `partial`, so 26-D3's `allowPartial` gate still means "not
  trustworthy".
- Otherwise `partial` clears and a warning says "extracted by local model
  qwen3:8b — N/M ingredient lines found verbatim on the page; check it".

### D5 — No marker stored in the recipe

- Provenance stays `source` (the page URL), and the model's involvement lives
  in the result, warnings, form notice and commit message
  ("Import … (local model)").
- No schema change, no reindex.

### D6 — Page text

- New `pageText(html)`:
  - parse with `hast-util-from-html` (already a dependency);
  - drop script, style, nav, header, footer, aside, form, iframe and comment
    sections (`#comments`, `.comments`, `.comment-list`);
  - prefer a recipe-card container (class contains `recipe`, e.g.
    wprm/tasty), then `article` / `.entry-content` / `main` (the heuristics in
    `roundupPage.ts`), then the body;
  - emit markdown (keeps list structure) through the existing hast → mdast →
    markdown chain (`decodeText`, `importRecipeData.ts:32`);
  - cap at about 24k characters (~7k tokens), cutting from the middle of the
    leading story, never the end.
- The request uses `num_ctx: 12288` (measured to fit 8 GB at 6.8 GB),
  `think: false`, `temperature: 0`, `keep_alive: "10m"`, and a 180 s timeout.

### D7 — Prompt and schema

- The model returns `{found, name, description?, recipeYield?, prepMinutes?,
cookMinutes?, totalMinutes?, ingredients: string[], instructions:
[{section?, steps: string[]}]}`.
- The prompt says: copy lines verbatim, keep section headings as their own
  ingredient lines ending in ":" (`createIngredient` already detects
  headings), don't invent amounts, `found=false` when there is no recipe.
- The output maps into `Partial<ImportedRecipe>` with the existing
  `createIngredient` and the `InstructionGroup` shape, so the rest of the
  pipeline (`importedToInput`, `toDraft`, dry run, the form) is unchanged.

### D8 — Text import mode (36c)

Roger's addition: paste a recipe's text and get a structured recipe. **The
use case he named:** a YouTube description, e.g. a Brian Lagerstrom video,
which lists the ingredients and instructions among a lot of other material —
sponsor reads, affiliate and gear links, Patreon and social links, chapter
timestamps, "music by …" credits. Emails, notes and pages the importer can't
fetch work the same way.

- The same extractor (D6 skipped: the text is the input, capped the same
  way), the same D7 prompt and mapping, the same D4 grounding against the
  pasted text, the same `partial` gate.
- The D7 prompt also says what to ignore: links, sponsor and merch text,
  timestamps / chapter lists, social handles, equipment lists. Ingredient
  lines in descriptions often carry weights and volumes together
  ("500g (4 cups) bread flour") or several sub-recipes ("Dough:",
  "Sauce:") — keep them verbatim, the sections as heading lines.
- An optional **source URL** field: given one, `source` is built from it
  (`buildSource`), and a video URL (`isVideoUrl`) also sets `video`, so a
  pasted description keeps its provenance. No image from the text; an image
  can come from the URL's page the usual way only if the person imports by
  URL instead. Without a URL, no `source`. `name` comes from the model,
  falling back to the first non-empty line.
- Pasting is the reliable path for YouTube: the URL path (D3's video case)
  depends on yt-dlp reaching the video, which the Pi and some networks can't;
  pasted text needs only the model.
- Unlike D3 there is no fallback to fall back from: with no model configured
  the text mode is unavailable (`import_failed` "no local model configured";
  the form hides or disables it the same way as the toggle).
- **Surfaces:** the form gets a "Paste text" tab beside the URL field; the CLI
  `import --text <file|-> [--source <url>]` (mutually exclusive with the
  positional URL); the HTTP backend and `api/import` take `{text, source?}`
  instead of `{url}`; the MCP `recipe_import` takes `text` (+ `source`) as
  an alternative to `url` (no new tool —
  the tool count is unchanged); `--dry-run` / drafts work as for URLs.
- The commit message says "Import … (local model, pasted text)".

### D9 — "Give it the URL": the video path reads everything useful (36d)

Roger, 2026-10-15, after pasting a Lagerstrom description into "Paste
text": _"I'm thinking more a direct 'give the URL and the server handles
everything' type of feature — if that's already in and the paste box is
ignored when a URL is provided, we'll want to evoke that idea more in the
UI."_ The URL path already did it (36b); the form hid it.

- **The model's text for a video** is the title, the description, and the
  **creator's** comments: their pinned one and their longest, when those
  differ both ("Creator's pinned comment:" / "Creator's comment:" blocks,
  each capped at 6 000 characters, so both fit the 24k text cap). D4
  grounds against the whole of it.
- **Only the uploader's comments, ever** (review): a channel can pin a
  _viewer's_ comment ("I used 2 cups sugar and baked 10 min longer!"),
  which is untrusted, and D4 grounds only ingredients. `pinned` orders the
  creator's comments; it never admits anyone else's. Replies are dropped
  too.
- **Comments only when a model will read them** (`videoFetchOptions`: a
  model configured and the mode not `off`), YouTube only, with
  `--write-comments --extractor-args
"youtube:max_comments=10,10,0,0;comment_sort=top"`: ten top-level
  comments, no replies; the pinned one is listed first. Measured at
  +0–1 s per fetch, so they are fetched on every model import rather
  than only after a first reading fails. A failed run with comments is
  retried once without.
- **Every yt-dlp run is `--no-playlist -J -- <url>`** (review): a
  `watch?v=X&list=PL…` URL would otherwise extract the whole playlist, and
  `--` keeps any URL from being read as an option.
- **Not the chapters** — measured (Results): never better, three times
  worse.
- **The video's tags** become `suggestedTags` through `suggestTags` (the
  page path's limit of 10), minus tags that name the channel.
- **The form says it:** helper text under the URL field, a live hint for a
  video URL, a video pending note, the force box reworded ("Re-read with AI
  even if the page has recipe data") and hidden for videos, and pasting
  demoted from a co-equal radio to a secondary "No link? Paste the recipe
  text instead" button (D8's "Paste text tab" is now that fallback).
- **The notice after a video import** names what was read: "read from the
  video's description and pinned comment by local model qwen3:8b — 28/28
  ingredient lines found verbatim; check it".

### D10 — Several recipes in one video or paste (36e)

Roger, 2026-10-15: _"Could we also add support for multiple recipes on one
video? e.g. https://www.youtube.com/watch?v=Z8J2HgaaSgQ&t=32s is a video
with three thanksgiving sides, including an extra separate recipe for the
fried shallots that go on top of green bean casserole"_. Before 36e it came
back as one recipe, "Holiday Sides 3 Ways", 44/44 lines verbatim and 19
steps, all four mashed together. (The brief called this D9; 36d had taken
D9, so it is D10.)

- **Two stages, not one call** — measured (Results). A deterministic gate
  first (`mayHoldSeveral`: at least two ingredient blocks with prose
  between them — a method paragraph, a link, a sentence); only a text that
  passes it gets the model's **list** (`listRecipes`: each separate recipe's
  name, heading line and first ingredient, copied). A list of two or more
  gets one short **question** (`isOneDish`); a dish in parts is read as one.
  Otherwise the text is **cut** at each listed start (`locateRecipes`,
  `sliceText`: every line from the first start on is in exactly one slice)
  and each slice goes through the **unchanged** D7 extractor. One call
  returning `recipes[]` (the other design) changed single-recipe readings
  (T46); the two stages leave every text that fails the gate, or that the
  list calls one recipe, byte for byte as before.
- **Looking is its own attempt** (review). The list, the question and the
  slice readings run under one deadline (`SPLIT_DEADLINE_MS`, 240 s, with
  the caller's signal); a failed call there — a timeout, bad JSON, the
  deadline — becomes a note and the text is read as one, as before 36e. A
  slice's own failed call leaves that recipe out, like a discarded one.
  Only the caller's abort ends the import.
- **Heading lines are checked** (review): a heading matched with
  decoration must be a short line with no amount and no timestamp ("FRIED
  SHALLOTS (FOR THE CASSEROLE)", not "2 cups fried shallots" nor "5:04
  Stuffing"), and its first ingredient must follow within a few lines, or
  the first ingredient is the start.
- **Only video text and pasted text** (`applyLlm`'s `split`): pages are
  never split, and a page with several JSON-LD `Recipe` nodes still takes
  the first (backlog).
- **Trust is per recipe.** Each slice is grounded against itself and
  settled on its own (`settleExtraction`: the 36b floor, D4, T21): one
  reading under the floor is left out with a warning, and its position in
  the list stays a gap (`leftOut`; a pick of it says why); one under 90% is `partial` for
  pasted text, and kept but marked untrusted (`trusted: false`) for a video
  under auto (T21's rule). Fewer than two left is read as one recipe.
- **Names** come from the list ("Stuffing", where the slice's reading says
  "STUFFING"), and the video's description is no recipe's description (it
  is every recipe's at once). The thumbnail, channel, `source` and
  suggested tags are the batch's.
- **Components:** an ingredient line naming another recipe of the batch —
  every word of its name, and "see recipe below" (or "recipe follows", "see
  above"), or nothing but the name — becomes a markdown link,
  `[Crispy fried shallots (or onions) - see recipe below](/recipe/fried-shallots)`:
  the line verbatim as the link's text. Links are made after the batch's
  slugs are settled, and the recipes others name are created first: a line
  links to a recipe `imported` or `existing` in this batch, or — when the
  named recipe is not in the batch — to the recipe already at its slug if
  that one came from the same source (an earlier `--pick`; T52). Never to
  another source's recipe of the same name; an unlinked line says why in
  the warnings. A dry run and `inspect` link to the slug a create would
  use, and so does the form's "Edit this one first". The link is 25c's
  `ingredientRecipeLinks` convention, so `/make` reads it too.
- **Chapters:** each recipe is placed in the chapter whose title holds most
  of its name's words (≥ half); a component with none of its own (the
  shallots) takes the chapter of the recipe that names it. The start goes
  into `source.url` and the stored `video` as YouTube's `t=<seconds>s`;
  a recipe with no chapter gets no `t` at all (not the one pasted);
  the recipe page's player starts there (`config.youtube.start`, read from
  the stored URL — the embed ignores `t=`, T47).
- **Surfaces:** `recipes import` (URL or `--text`) refuses (`usage`, naming
  the recipes) unless `--all` or `--pick` — by **name** (`--pick "Green
Bean Casserole"`, case and dashes aside; a name not found this time is
  refused with what was) or by position (`--pick 1,3`, which a re-read can
  shift); `--as-one` (`asOne`) reads the text as one recipe, never split.
  A pick whose slug holds the same source's recipe is `existing` and
  skipped (as a roundup's), so `--all` again after a partial run imports
  only what is missing; another source's recipe there is a `slug_conflict`
  for that pick alone — no suffix is made up. `--dry-run` shows them all,
  `--out d.json` writes `d-1.json`, `d-2.json`…; one recipe needs no flag.
  `ImportBatchResult` is `{batch: true, found: [...], recipes: [...]}`.
  `inspect` / `page_inspect` add `recipes: [{n, name, chapter?, slug,
draft, llm}]` and keep `recipe` / `draft` as the first one's. MCP
  `recipe_import` and `/api/import` take `pick` (names or positions), `all`
  and `asOne` (tool count unchanged); the HTTP backend waits 285 s for
  `/api/import`, under undici's 300 s. Commits: `Create recipe: <slug> (local model, 3 of 4 from
youtube.com/watch?v=…)`, or `(local model, pasted text, 3 of 4)`.
- **The form** shows a picker (`BatchPicker`, on 35r's `PickList`): name,
  ingredient count, lines found in the text, chapter time; every trusted
  recipe ticked; "Import N selected" creates them in one server action
  with no second reading (`importBatchPicks`, the seat's own) and unticks
  everything it tried; a row that failed on a taken slug says so in the
  form's words and offers a slug field pre-filled `<slug>-<channel>`;
  "Edit this one first" fills the form with one, its links kept; "Import
  as one recipe instead" fills it with all the parts as one
  (`mergeReadings`) — the way out when the model splits a dish anyway.

## Roadmap

| Phase    | Branch                   | Size | Status  | What                                                                                                                               |
| -------- | ------------------------ | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 36-plan  | `agent/36-plan`          | S    | ✅ #230 | This doc.                                                                                                                          |
| 36a      | `agent/36a-llm-core`     | M    | ✅ #231 | D1, D2, D4, D6, D7: `pageText`, the client, the extractor, gate.                                                                   |
| 36b      | `agent/36b-llm-wire`     | M    | ✅ #232 | D3, D5: `applyLlm` in seats, form, CLI, API, MCP; Settings line.                                                                   |
| 36c      | `agent/36c-llm-text`     | M    | ✅ #233 | D8: text import mode in the form, CLI, API, MCP.                                                                                   |
| 36-close | `agent/36c-llm-text`     | S    | ✅ #233 | Results, D12/SKILL.md updates, backlog, memory, Roger's steps.                                                                     |
| 36d      | `agent/36d-video-url`    | M    | ✅ #234 | D9: the video path reads the pinned comment and tags; the form says "give it the URL".                                             |
| 36e      | `agent/36e-multi-recipe` | M–L  | ✅ #235 | D10: several recipes in one video or paste — split, trusted and linked per recipe, chapter starts, the picker, `--all` / `--pick`. |

Ordering: strictly sequential — 36b needs 36a's extractor, 36c needs 36b's
plumbing (`ImportOptions`, the zod bodies, the form). 36-close after 36c.

## How it runs

- One orchestrating session; code phases go to worktree workers (Opus), each
  its own PR off fresh `origin/main`, opened ready. Merge when every check
  that ran is green and the PR is `CLEAN`; merge commit; delete the branch.
- A review agent on every M PR, on the local branch before its first push.
- At most two PRs in CI at once.
- Never a real model in CI: tests stub `fetch` (`vi.stubGlobal`). The real
  model runs only in local measurement and verification, against scratch
  clones, never `editor/content`.

## Phases

### 36a — Extractor core + measurement gate (M)

- `common/util/pageText.ts` and `test/pageText.test.ts`, using the fixtures
  in `test/fixtures/roundups/*.html` and the inline `recipeHtml()` style from
  `test/importRecipeSource.test.ts:27`.
- `editor/controller/llm/client.ts`: `llmConfig()` (env, D1),
  `chatJson({system, user, schema})` for both `ollama` (`/api/chat` with
  `format: schema`, `options.num_ctx`) and `openai`
  (`/v1/chat/completions` with `response_format`). Typed errors:
  unreachable, timeout, bad JSON.
- `editor/controller/llm/extractRecipe.ts`:
  `extractRecipeWithLlm({text, url, meta})` →
  `{recipe: Partial<ImportedRecipe>, llm: {model, grounded, total}} |
{found: false}`, with the grounding check (D4) and the mapping (D7). It
  reuses `createIngredient` (`common/util/parseIngredients.ts:99`) and
  `buildSource` (`importRecipeData.ts:112`). `url` is optional (D8 uses it
  without one).
- `test/llmExtract.test.ts`: stubs `fetch`; covers both API shapes,
  grounding pass and fail, headings, `found:false`, timeout, and
  unconfigured.
- `editor/scripts/measure-llm-import.ts` (local only, needs Ollama):
  - **The gate:** force mode on about 15 _schema_ pages, compared against
    their own JSON-LD: ingredient-line recall and precision, step count,
    time-field agreement, wall time per page.
  - **The real use:** about 10 no-schema pages, reported as found /
    grounded / time.
  - **The text mode (D8):** about 5 YouTube descriptions with a recipe in
    them (Brian Lagerstrom's first — Roger's example), fetched once with
    yt-dlp's metadata only (`--skip-download`), run as raw text. Report
    found / grounded / time and eyeball that no sponsor, link or timestamp
    line became an ingredient or step.
  - Pages are fetched once into scratch under the polite gap, then re-run
    offline per model: qwen3:8b, plus qwen3:14b and qwen2.5:7b for
    comparison.
  - **Target:** ≥ 95% ingredient recall and ≥ 95% grounded on schema pages,
    and the median warm page ≤ 30 s. If qwen3:8b misses, tune D6/D7 before
    36b.

### 36b — Wiring: seats, form, CLI, API, MCP (M)

- **One shared entry point**, `editor/controller/llm/importWithLlm.ts`
  `applyLlm(url, html, mapped, mode)`, called from four places:
  1. `importFromUrl` (`curation/importRecipe.ts`), which needs the html, so
     it calls `fetchRecipePage` + `parseRecipePage` + `mapRecipePage` instead
     of `importRecipeData`;
  2. `inspectUrl` (`curation/inspect.ts:176`; its result gets `llm` and the
     draft is filled);
  3. `importItem` (`curation/importList.ts:522`; roundups — `auto` fills
     pages that are refused as `partial` today);
  4. the form's `reduceRecipeImport` (`new-recipe/common.tsx:26`; still a
     direct call, with `BROWSER_RETRY`).
- **Video path:** after `ytdlpToRecipe`, `auto` sends title + description
  through the extractor (both `common.tsx` and the seat).
- **The mode option, end to end:** CLI `import`, `inspect`, `import-list`
  take `--llm auto|force|off`; `ImportOptions` in `cli/backend/types.ts` and
  the HTTP backend (`http.ts:257`); the zod bodies in `api/import/route.ts`
  and `api/inspect`; the MCP `inputSchema` of `recipe_import` and
  `page_inspect` (`mcp/registry.ts`), tool count unchanged. Results and
  warnings carry `llm`. `RECIPE_LLM_*` join `EDITOR_ENV_KEYS`.
- **Form (`new-recipe/form.tsx`):** an "Extract with AI (local model)"
  checkbox that sends `force` (default `auto`); disabled with "No local model
  configured" when `llmConfig()` is empty (passed from `page.tsx`); a pending
  note ("Reading the page with qwen3:8b…" — first use loads the model,
  ~10 s); the notice beside the existing `partial` notice shows the model and
  the grounded count.
- **Status:** a read-only "Local model" line on the Settings page (URL,
  model, reachable or not), `GET /api/tags` or `/v1/models`, 2 s timeout.
- **Tests:** `test/curation.test.ts` (`stubWeb` extended to answer the model
  URL): auto fills a no-schema page; force overrides schema; ungrounded stays
  partial; unconfigured is a no-op or `import_failed`; the dry-run draft
  matches. `test/importList.test.ts`: a no-schema roundup item imports
  through auto. `test/cliJson.test.ts`: `--llm` and the env keys.
  Playwright `new-recipe.spec.ts`: the toggle is disabled when unconfigured
  (CI has no model); the model path stays in unit tests.

### 36c — Text import mode (M)

- D8 on top of 36b: `importFromText` in `curation/importRecipe.ts` (or
  beside it) → the extractor → `importedToInput` / `toDraft`.
- CLI `import --text <file|->`, HTTP backend, `api/import` `{text}`, MCP
  `recipe_import` `text` (exactly one of `url` / `text`).
- Form: a "Paste text" tab, unavailable without a model; the same pending
  note and grounded notice.
- Tests: the seat with stubbed `fetch` (grounded, ungrounded, found:false,
  unconfigured), `cliJson` (`--text -` from stdin, url+text refused), the
  API zod body; Playwright: the tab is disabled when unconfigured.
- Local check with the real model: a pasted Brian Lagerstrom YouTube
  description (with and without its video URL as the source), a pasted
  Sally's recipe and a messy emailed one, `--dry-run` against a scratch
  clone.

### 36-close (S)

- Results and traps here; a CLAUDE.md pointer; a backlog row: photo /
  recipe-card import with a vision model (qwen2.5vl) as a follow-up.
- Update agent-import-tools D12 and the curator SKILL.md partial-page
  section: a result with `llm` should be spot-checked against the page;
  WebFetch is the fallback only when no model is configured; text mode for
  pasted recipes.
- Memory: `epic-36.md` and the MEMORY.md line.
- **Roger's steps:** add `RECIPE_LLM_URL=http://localhost:11434` (and
  optionally `RECIPE_LLM_MODEL`) to `editor/.env`; `pnpm workstation update`
  from the repo root; no Pi deploy needed for function (the Pi stays off),
  though deploying keeps the image current; no reindex.

### 36d — "Give it the URL" (M, reopened 2026-10-15)

- D9 on top of 36c. **A:** the video path sends the pinned comment (only
  when a model will read it) and maps the video's tags to
  `suggestedTags`; chapters are measured against the 36a YouTube corpus and
  kept or left out on the numbers. **B:** `/new-recipe` says the server
  handles a URL — helper text (`aria-describedby`), a video hint, a video
  pending note, the paste mode as a secondary toggle, the force box
  reworded and hidden for videos; `isVideoUrl` in a module the client can
  load.
- Tests: unit (the mimic with comments, chapters and tags; the comment
  fetched only with a model; tags → `suggestedTags`; grounding against the
  combined text); Playwright `new-recipe`, `ytdlp-import`, `youtube-video`,
  `visual` (baselines regenerated first), `accessibility`.
- Real check (qwen3:8b, scratch clone, `--dry-run`): the Lagerstrom pasta
  salad, a description with no method, a recipe only in a pinned comment —
  with and without the comment fetch.

### 36e — Several recipes in one video or paste (M–L)

- D10 on top of 36d. Measure one call returning `recipes[]` against a list
  call then the D7 extractor per slice, on Roger's video (Lagerstrom's
  "Holiday Sides 3 Ways", `Z8J2HgaaSgQ`) and the 36a/36d corpus; pick on
  the split's correctness, grounding per recipe, wall time and no change
  to single-recipe readings.
- Per-recipe trust; component links resolved to the batch's slugs; each
  recipe's chapter in its `source` (and the player's start).
- Surfaces: the `/new-recipe` picker on 35r's list; CLI `--all` / `--pick`
  and the refusal without either; `inspect` `recipes`; MCP and the API's
  `pick` / `all`; one commit per recipe; the curator SKILL.md note.
- Tests: unit (the split, the links, the chapters, per-recipe trust, a
  single recipe unchanged, `--all` / `--pick` / the refusal, MCP, the
  route); Playwright with a stand-in model behind a TEST_MODE seam
  (`multi-recipe.spec`), plus `new-recipe`, `ytdlp-import`,
  `youtube-video`, `import-roundup`, `visual`, `accessibility`.
- Real check (qwen3:8b, scratch clone): the video gives 4 recipes, the
  shallot line links, each has its chapter; the pasta salad stays one.

## Verification

- **Per PR:** CI green; locally `pnpm --filter recipe-editor typecheck`,
  `pnpm --filter recipe-website exec tsc --noEmit`, `pnpm exec vitest run`,
  and `new-recipe.spec.ts` in build mode through the heavy slot.
- **36a:** the `measure-llm-import.ts` numbers meet the gate on qwen3:8b and
  are recorded below.
- **36b, real model, against a scratch clone** (never `editor/content`):
  `recipes import <no-schema URL> --dry-run --json --content-dir <scratch>`
  returns full ingredients and instructions, `llm.grounded/total`, and no
  `partial`; `--llm force` on a Sally's page roughly matches its JSON-LD;
  `--llm off` gives today's partial.
- **36c:** `recipes import --text - --dry-run --json` on a pasted Lagerstrom
  description returns a grounded draft with no marketing lines in it.
- **After Roger's `.env` and workstation update:** on the workstation,
  `/new-recipe` with a no-schema URL fills the form, the checkbox and the
  text tab work; on the Pi, both show "No local model configured".

## Traps

### 36a

- **T1 — At temperature 0, qwen3:8b still turns on wording.** Moving one
  prompt rule from the middle of a bullet list to its end changed Brian
  Lagerstrom's drunken noodles from 12 to 16 ingredient lines, and adding
  `"100-150g"` to an example changed the pasta salad. A single probe proves
  nothing; deterministic guards (`fillSkippedLines`, `parseTimeText`) are what
  hold. Re-run the whole corpus after any prompt edit.
- **T2 — Grounding cannot see an omission.** The noodles with four of
  sixteen lines skipped were 12/12 grounded. `fillSkippedLines` covers the
  inside of the list; a recipe whose _last_ lines are skipped still loses
  them.
- **T3 — Garbled copies.** qwen3:8b now and then mangles a word it is copying
  ("1 cup desicc cated coconut", "desicc thaned"; "36,0g warm water" for
  "360g"). An ingredient line like that is ungrounded (and
  `fillSkippedLines` swaps in the source line); a garbled _step_ is not
  checked at all — D4 grounds ingredients only. Hence "check it".
- **T4 — Ollama's grammar emits required properties first.** The answer's
  key order is `found, name, ingredients, instructions`, then the optional
  ones — not the schema's order. Nothing depends on it, but don't read an
  early `instructions: []` as the model "running out".
- **T5 — qwen3:14b does not fit 8 GB at `num_ctx` 12288:** 11 GB,
  40%/60% CPU/GPU, 15 s cold load, ~177 s for a King Arthur page, and the
  first page (Lagerstrom's key lime pie) hit the 180 s timeout. Not usable on
  the RX 6600 at this context; qwen3:8b is 6.8 GB, 100% GPU.
- **T6 — `<pre>` became a fenced code block** through hast → mdast →
  markdown, and inside the fence qwen3:8b returned the ingredients but no
  steps (CMU's Anzac biscuits). `pageText` renders `pre` as lines.
- **T7 — The markdown chain has no GFM:** a `<table>` throws "Cannot handle
  unknown node `table`" in `mdast-util-to-markdown`. `pageText` flattens
  tables first. `importRecipeData`'s `decodeText` would still throw on a
  table inside a JSON-LD string (pre-existing, not seen in the wild).
- **T8 — Pages repeat themselves invisibly.** PUNCH prints every ingredient
  twice, once in a `display:none` microdata `<li>`; King Arthur puts the
  ingredient list in an `<aside>`. `pageText` drops `display:none` / `hidden`
  and keeps chrome elements whose class names the recipe.
- **T9 — Corpus pitfalls.** `en.wikibooks.org/wiki/Cookbook:Pancake` (and
  `:Hummus`, `:Banana_Bread`, `:Chocolate_Chip_Cookies`) are articles or
  disambiguation pages; the recipes are `Cookbook:Hummus_I` etc. — so they
  served as negatives. thewoksoflife.com answers a Cloudflare challenge (403
  twice; dropped). The JSON-LD reference has its own typos (Lagerstrom's
  "instant y east"), which the model "fixes".
- **T10 — Scripts in the job scratch dir can't import workspace packages by
  name** (`recipe-website-common/...` resolves from the importing file), and
  tsx runs them as CommonJS, so no top-level `await`. Use absolute paths and
  an async IIFE, or put the script under `editor/scripts/`.
- **T11 — Page-wide grounding passed changed amounts** (review). Checking a
  line's words against the whole page let "3 cups (125g) flour" find its 3 in
  "3 eggs". Grounding is now line by line (`groundLine`), which needs the
  page text to keep an ingredient on one line: Bon Appétit's grid
  (`<p>¾</p><div>cup … yogurt</div>`) rendered the amount on a line of its
  own and graded **1/11** until `pageText` joined amount-only blocks to the
  next block. A sudden low grade on a site whose recall is fine is a
  `pageText` layout problem, not a model problem.
- **T12 — Put-back lines inflated the ratio** (review). Grounding counted
  `fillSkippedLines`' lines, which are source text by construction: a 4-line
  answer with 2 inventions read 20/22. Grounding now grades the model's own
  lines before the fill; `added` is reported apart.
- **T13 — Position matching was too loose** (review). A substring rule with
  no length limit and "earliest wins" on ties put "Sauce:" on an intro
  sentence (and the gap then filled "20% off with code …"), a lone "4" on
  "1/4 tsp salt", "For the dough:" on "1 cup water for the dough". Matching
  is now whole words over the longer line (filler words aside), headings
  only to short lines, ties to the line after the previous match; gaps are
  ≤ 4 lines, never cross an Instructions label, and skip promotions,
  temperatures, times and sentences.
- **T14 — Pathological pages.** WordPress puts `sidebar` on `<body>` (the
  drop-region rule emptied the page); 400 nested `recipe` divs took 17 s in
  the on-demand text-length index; very deep nesting overflows the
  recursive hast → mdast → markdown chain (`RangeError`). Fixed by never
  dropping `html`/`body`/`main`, a bottom-up length pass, and a tag-stripping
  fallback.

### 36b

- **T15 — A Recipe node can be empty, and a video has none.** D3's "auto
  runs when the result is `partial`" missed two cases: yt-dlp's recipe is
  never `partial` but has no ingredients, and some pages carry a Recipe node
  with no ingredients (36a's Joshua Weissman page). `autoWantsModel` asks
  instead whether the mapper found a recipe **body** — ingredients or steps.
- **T16 — `mapRecipePage` answers `undefined`, not `partial`, for a page
  with no title, description or image** (textfiles.com's plain-text pages).
  `applyLlm` treats "nothing" as eligible under auto, so those import now;
  a non-2xx page is never read, whatever the mode.
- **T17 — The visual baselines of `/new-recipe` moved again** (35r's trap):
  the "Extract with AI" line is a row under the URL field.
  `new-recipe-form-e2e.png` and `new-recipe-form-overwrite-e2e.png` were
  regenerated (`--update-snapshots -g "new-recipe form"` through the heavy
  slot). Any change to that row's height does it again.
- **T18 — A model in `editor/.env` would leak into the Playwright suite.**
  Next loads `editor/.env`, so a checkout whose `.env` sets
  `RECIPE_LLM_URL` (the main checkout after Roger's step) would see an
  enabled toggle, a "reachable" Tools card, and auto-mode model calls on
  the fixtures' no-schema imports. `playwright.config.ts` pins
  `webServer.env: {RECIPE_LLM_URL: ""}` (review round): Playwright spawns
  with `{...process.env, ...env}` and `@next/env` never overrides a
  variable already set, `""` included. That covers `new-recipe.spec`'s
  toggle test, `settings-nav.spec`'s Tools card, the `/new-recipe` visual
  baselines and the auto-mode fixture imports. **Caveat:** in dev mode
  `reuseExistingServer` adopts a server already on the port, which keeps
  its own environment — stop a hand-started `next dev` before a local run.
- **T19 — A model call is not a site request, so it is not paced** — and
  it overlaps the 15 s gap rather than adding to it. A roundup item read by
  the model costs ~4–30 s more; under `force` with a slow model, six dry-run
  items could approach `IMPORT_LIST_HTTP_TIMEOUT_MS` (285 s). Keep `--limit`
  low with `--llm force` on `import-list`.
- **T20 — The prompt's "a servings line is the yield" still slips.** PUNCH's
  Last Word came back with `Serving: 1` as its first ingredient line (it is
  on the page, so it grounds). And a step copied as "8 Serve immediately…"
  keeps its bare number (`cleanStep` strips "8." and "8)", not "8 "). Both
  are what "check it" is for; neither is worth a prompt edit (T1).
- **T21 — An untrusted reading must not turn an import into a refusal**
  (review). Under auto, a video (or an empty Recipe node) is not `partial`,
  so it imported before 36b; the first cut set `partial` on any untrusted
  extraction, so a Lagerstrom description with ingredients and "watch the
  video for the method" (3/3 verbatim, 0 steps) was refused where `--llm
off` created it. The rule now: under auto, a result that was not partial
  never becomes partial.
- **T22 — An empty list from the model wiped the schema's** (review). Under
  force, `ingredients: []` has `total = 0`, so the floor never fires, and
  the merge replaced the schema's list with `[]` (steps likewise). The
  merge keeps the page's list when the model's is empty, and says so.

### 36c

- **T23 — A source URL changes the reading** (T1 again). The pasta salad
  pasted alone came back 27/27 verbatim with both "Pasta Salad:" and
  "Dressing:"; with `--source <its YouTube URL>` the prompt gains one
  "Source URL:" line, and the same text came back without the "Pasta
  Salad:" heading and with "50g-75g pepperoncini" garbled to "50g-7,
  pepperoncini" (25/26, still trusted; `fillSkippedLines` put the source
  line back). The pizza was identical either way. Don't read a difference
  between two runs as a regression of the source path.
- **T24 — An unnumbered, lower-case method stays one step.** Aunt Carol's
  emailed chili ("brown the chicken … take it out. cook the onion …") came
  back as a single five-sentence step, despite the prompt's "split it at
  sentence boundaries" rule. D4 grounds ingredients only and one step
  counts, so it is trusted. A deterministic sentence split would fix it;
  not done (a prompt edit is T1's gamble, and a split rule has to step
  around abbreviations like "min." and "approx.").
- **T25 — Names come back as the text writes them.** Lagerstrom's
  descriptions head the recipe "DRUNKEN NOODLES RECIPE:" and "PEANUT BUTTER
  COOKIE RECIPE:", and that is the name. `--name` (or the form's Name
  field) is the fix; not normalised, since a case rule would mangle real
  capitals.
- **T26 — "Takes about an hour all in" became `prepTime` 60**, not
  `totalTime`. The prompt says "as the text labels them"; an unlabelled
  time is a guess either way. "Check it".
- **T27 — React 19 resets an uncontrolled form after its action.** The
  "Paste text" box and its source field are controlled (`useState`) so a
  failed import (no recipe found, model unreachable) keeps the paste; the
  URL field stays uncontrolled as before.
- **T28 — A schema refusal on `recipe_import` is the SDK's shape.** `url`
  and `text` together, or neither, or `llm` with `text`, fail in
  `ImportRequestSchema`'s refine, which the MCP SDK answers as its own
  `isError` text (as for any schema error, `mcp.test`'s "hash the schema
  rejects"), not `{error: {code}}`. `/api/import` answers it as
  `validation` with the issue paths.
- **T29 — The `/new-recipe` baselines moved again** (T17): the URL / Paste
  text radio row sits above the URL field.
- **T30 — A copied card's colon-less sub-heading is an ingredient.**
  Sally's card text, copied, reads "Icing" on its own line; the model
  copied it verbatim (as told) without the colon D7 asks headings to end
  with, so `createIngredient` made it an ingredient. On a page the same
  card has an `<h4>` and `pageText` keeps it a markdown heading, which the
  extractor turns into a heading line (36a step 4); pasted plain text has
  no such mark. Delete it in the form, or add the colon before pasting.
- **T31 — A long paste lost its middle silently** (review). `capText` keeps
  the first ~3k and the last ~21k characters of anything over 24k, so an
  email thread whose recipe sits in a quoted middle part read as "found no
  recipe". The cut is now said, in the warnings and in the failure.
- **T32 — `JSON.stringify` is not an HTML escape** (review, pre-existing).
  `RecipeJsonLD` put `JSON.stringify(recipe)` into a `<script>` through
  `dangerouslySetInnerHTML`; a name holding `</script>` closed the tag — a
  stored XSS reachable from any imported page, and now from a pasted
  text's first line. `serializeJsonLD` escapes `<`, `>`, `&` as `<`
  etc. It was the only `ld+json` renderer; the other inline sinks (theme
  CSS, pre-paint scripts) are built from derived colours and fixed code.
- **T33 — An old editor answers `text` as a zod issue** (review). The
  pre-36c `/api/import` body is a `strictObject({url, …})`: a `--remote`
  `--text` against it came back as "Invalid input" with an `Unrecognized
key: "text"` issue. The HTTP backend now names the cause.
- **T34 — Mocking `apiContext` makes a route testable** (review). A route
  under `src/app/api` imports `recipe-editor/controller/apiContext`, which
  pulls in `next/cache`; `vi.mock` of that one module (returning a tmpdir
  context) lets `test/importRoute.test.ts` call `POST` directly, and the
  same handler can sit behind a 127.0.0.1 server for the HTTP backend.

### 36d

- **T35 — Chapter titles become steps.** The D7 prompt says to ignore
  chapter lists, and qwen3:8b mostly does — until there is nothing else.
  Sivan's challah (empty description) with only its chapters came back as
  nine chapter titles for steps and no ingredients, which auto keeps (T21);
  Lagerstrom's English muffins (ingredients, no method) came back with a
  "Chapters:" section of "0:21 Preparing the pre-ferment" lines. So the
  chapters are not sent (D9). If they are ever wanted, they need a
  deterministic home (an outline note), not the model's text.
- **T36 — A credit line can be the only step.** The English muffins'
  description has no method; the model made "THANKS TO AMERICAS TEST
  KITCHEN AND SERIOUS EATS FOR THE RECIPE INSPIRATION HERE." the one
  step, and 10/11 grounded with one step is trusted. Same with or without
  the comment fetch (pre-existing). Backlog.
- **T37 — A pinned comment of notes costs a model call.** Chinese Cooking
  Demystified pins 2 400 characters of notes (laomian, yeast, fermentation
  times — no ingredient list). With it, qwen3:8b invented 67 ingredient
  lines (0/67 grounded) in 30.5 s, and the 36b floor discarded them: the
  import is what it was, but the reading took 30 s instead of 1 s. The
  floor is what makes sending comments safe.
- **T38 — Keep the comment fetch small and ordered.** With
  `comment_sort=top` the pinned comment was the first one in all four
  videos that had one. yt-dlp's `max_comments` is `max-comments,
max-parents,max-replies,max-replies-per-thread`: `10,10,0,0` is ten
  top-level comments and no replies. Another extractor ignores the `youtube:` arguments and
  `--write-comments` would fetch every comment, so comments are asked of
  YouTube URLs only.
- **T39 — The mimic answered by argument position.** `ytdlp-mimic.mjs` read
  the URL as the argument after `-J`; with the review's `-J -- <url>` it
  reads the one after `--` (falling back to after `-J`). It also drops a
  fixture's `comments` unless `--write-comments` is passed (as yt-dlp
  does), fails a `failWithComments` fixture only when comments are asked
  for, and logs its argv to `YTDLP_MIMIC_LOG` for the unit tests.
- **T40 — The `/new-recipe` baselines moved again** (T17, T29): the helper
  text under the URL field and the paste toggle under Import.
  `new-recipe-form-e2e.png` and `new-recipe-form-overwrite-e2e.png`
  regenerated in their own heavy-slot run first.
- **T41 — A pinned comment is not the creator's word** (review). The first
  cut kept any pinned comment and preferred it; a channel can pin a
  viewer's tip, which then reached the model as the "recipe" while the
  creator's own unpinned comment was dropped. Only `author_is_uploader`
  comments are kept now, and the pinned and the longest both go when they
  differ. Fixture `responses/pinned-viewer.json`.
- **T42 — A live region that is `display: none` is often not announced**
  (review). The video hint's `<p aria-live>` had `empty:hidden`; it is
  always rendered now, with `empty:mb-0` so an empty one takes no height
  (the baselines did not move).
- **T43 — A `&list=` URL extracts the playlist** (review). Without
  `--no-playlist`, `watch?v=X&list=PL…` asks yt-dlp for every video in the
  list; with comments that ran into the 45 s timeout and then the 30 s
  retry before failing.

### 36e

- **T44 — The list splits a recipe in sections.** Asked of every text,
  stage 1 split Lagerstrom's pasta salad into "Fully Loaded Italian Pasta
  Salad" (14 lines, no steps, partial) and "Homemade Dressing". The gate
  is what keeps it out: "Pasta Salad:" and "Dressing:" are one ingredient
  block (no prose between), so the list is never asked. Of the 16 texts
  measured, 5 pass the gate: the two real batches and three single
  recipes (chili, ciabatta, butter chicken).
- **T45 — One dish in parts reads as several.** The list split the butter
  chicken ("2 Recipes in 1 Dish": CHICKEN + MARINADE, SAUCE, RICE), both
  runs, and a title rule in the prompt made it four. A `oneDish` field in
  the list's own schema fixed the chicken and turned the ciabatta into five
  "recipes" (BIGA, AUTOLYSE, FINAL MIX…) — T1 again. As a separate short
  question it answered 15 of 16 texts right (the 16th, Chinese Cooking
  Demystified's danhonggao, never passes the gate), at 0.3–4 s. The picker's
  "Import as one recipe instead" is the way out when it is still wrong.
- **T46 — One call changed single readings.** With `recipes[]` in the
  schema and the prompt reworded for it, qwen3:8b gave the chili a second
  "CLIFFS NOTES CHILI VARIATION" recipe (8 lines, no steps), dropped
  Sally's icing lines (12/12 instead of 16/16), split the butter chicken in
  four, read Sivan's challah 5/6 and granola 5/6 (6/6 and 9/10 alone), and
  renamed half the corpus. The split itself was as good as stage 2's.
- **T47 — The YouTube embed ignores `t=`.** `youtube-video-element` builds
  its iframe URL from the video id and its own `config`; react-player
  passes `config.youtube` through, so the view reads the start back out of
  the stored URL (`videoStartSeconds`) and passes `{youtube: {start}}`. The
  `source.url` link starts there on YouTube itself.
- **T48 — `crypto.randomUUID()` is undefined over plain http.** Browsers
  expose it only in a secure context; the Pi's editor is `http://…:3000`.
  The picker's form keys count instead (the 36c server-side key is fine).
- **T49 — `createIngredient` wraps numbers inside a link's target** —
  fixed in the review round, for every caller (a link typed by hand into
  the form had the same problem, before 36e).
  `[2 cups 7-layer dip](/recipe/7-layer-dip)` became
  `…(/recipe/<Multiplyable baseNumber="7" />-layer-dip)`: a dry run's or
  `inspect`'s draft holds the link as plain text, and `create --file` with
  it broke a slug with a digit. Now each `](…)` target is held aside while
  the numbers are marked (a digit-free placeholder — a digit in it would be
  marked too) and put back.
- **T50 — A several-recipe import only exists with a model, and the suite
  has none** (T18). `/settings/test-llm?url=` (TEST_MODE only, like
  `/settings/test-editor-role`) points the server at a loopback stand-in
  for one spec; `playwright/fixtures/llm/standInModel.ts` answers by rule,
  and the unit tests use the same stand-in behind a stubbed `fetch`.
- **T51 — The shared thumbnail would be paced four times.** Per-site
  pacing (30-D5) puts 15 s between requests to one host: four creates each
  downloading the same thumbnail would wait 45 s. The batch probes and
  downloads each picture URL once.
- **T52 — Generic names meet the real corpus.** The real `--all` into a
  scratch clone of the content repo failed the casserole alone:
  `green-bean-casserole` already exists there. Side dishes are named like
  side dishes, so a taken slug is the common case, not the edge: the pick
  fails with `slug_conflict` and "import this one on its own with
  `--pick 3 --slug <another>`", and the others land. That re-run is a
  batch of one, so its shallot line would have lost its link — hence the
  second link rule: a named recipe outside the batch is linked when the
  recipe at its slug came from the same video (`source.url` without `t`).
- **T53 — Under load, T37's comment of notes timed out.** With another
  session's `next build` and a game's shader cache compiling on the same
  machine, the danhonggao reading (67 invented lines, 30.5 s in 36d) hit
  the 180 s timeout, read alone and in the two-stage run (the one-call
  variant answered in 21.6 s, 1/27 grounded — under the floor). Pre-existing; times in
  36e's tables are from that loaded machine.
- **T54 — `youtube-video.spec` asks the real YouTube.** Its first test
  imports `jNQXAC9IVRw` with no mimic, so a machine with yt-dlp on its
  PATH runs it for real; on 2026-10-15 yt-dlp answered "Requested format is
  not available" after ~4 s, and the form was still "Fetching the video
  with yt-dlp…" when the 5 s `toBeChecked` gave up — twice, on a branch
  that does not touch that path (CI has no yt-dlp, and the bare link comes
  back at once). The test now sets `ytdlpPath` to a missing binary, so it
  never asks YouTube on any machine; the 5 s wait stands (review).
- **T55 — The several-recipe look shared the reading's `try`** (review).
  A list call that timed out or answered bad JSON lost the whole import —
  the chili, one recipe that passes the gate, would have come back with
  nothing; a slice's failure lost the slices already read. Now the look is
  its own attempt under one 240 s deadline, a failed slice is left out
  alone, and only the caller's own abort ends the import.
- **T56 — A loose heading match cut a recipe short** (review). The
  decoration-tolerant pass ("STUFFING" in "STUFFING ✨") also matched
  "2 cups fried shallots" for a "FRIED SHALLOTS" heading — ending the
  casserole one line early — and "5:04 Stuffing" in a chapter list at the
  top. It accepts only short lines with no amount and no timestamp now,
  and checks the first ingredient follows the heading.
- **T57 — Positions shift between readings** (review). Every import call
  reads the video again, and the first cut renumbered the recipes after
  one was left out: `--pick 3` could name another recipe the second time.
  Positions are the list's now (gaps allowed, a gap refused with its
  reason), and names are the recommended pick — the refusal, `--help`,
  MCP and the skill say so.
- **T58 — Ollama loads to CPU if VRAM is busy at load time** (the real
  check, review verification). Roger's own speech-to-text tool
  (`parakeet-cli`) takes up to ~8 GB of the one shared GPU at times;
  `ollama`'s fit pass sees too little free VRAM at that instant and
  offloads 0/37 layers, not some — a four-recipe text that reads in
  ~40–60 s warm on the GPU took 142–243 s per recipe on the CPU (~3.3
  tok/s) and the single-call `--text --dry-run` hit the 180 s per-call
  timeout outright before the GPU was free. `ollama ps`'s `PROCESSOR`
  column shows the split (`98%/2% CPU/GPU` vs `100% GPU`); `ollama stop
qwen3:8b` unloads it, and the next call reloads fresh — onto the GPU
  once VRAM is actually free. Check `ollama ps` before trusting a
  timing, and stop the model rather than retry if it shows mostly CPU.
  Automated by epic 37 (37b): the GPU acquire hook frees VRAM before a
  model call; if the model still loads on the CPU, the queue unloads it
  and retries once. The `llm.placement` warning reports the reading.

## Results

### 36a — Extractor core + measurement gate

**Built.**

- `common/util/pageText.ts` — `pageText(html)` / `pageTextDetail` /
  `capText`, with two helpers factored out rather than copied:
  `common/util/hastQuery.ts` (`textOf`, `attr`, `classes`, `walk`,
  `elements`, `CONTENT_CLASS`, `articleRoot`, now also used by
  `roundupPage.ts`) and `common/util/htmlMarkdown.ts` (`hastToMarkdown`,
  `htmlToMarkdown` — `importRecipeData`'s `decodeText`, unchanged).
- `editor/controller/llm/client.ts` — `llmConfig(env)` (D1; `""` is unset),
  `chatJson` for `ollama` (`/api/chat`, `format`, `think:false`,
  `num_ctx` 12288, temperature 0, `keep_alive` 10m) and `openai`
  (`/v1/chat/completions`, `response_format: json_schema`, temperature 0; a
  URL already ending in `/v1` is not doubled, a trailing slash is stripped),
  180 s `AbortSignal` timeout, `LlmError` with `kind` `unconfigured |
unreachable | timeout | http | bad_json` (a 200 whose body is not a JSON
  object is `bad_json`; the caller's own abort is passed through, not
  reported as a timeout). Plain `fetch`.
- `editor/controller/llm/extractRecipe.ts` — `extractRecipeWithLlm({text,
url?, meta?, sourceKind?})` → `{found: true, recipe, llm: {model, grounded,
total, verbatim, ungrounded?, added?, durationMs}, warnings}` or `{found:
false, llm}`. Exports `LLM_RECIPE_SCHEMA`, `LLM_RECIPE_SYSTEM_PROMPT`,
  `buildRecipeUserPrompt`, `normaliseForGrounding`, `groundLine`,
  `isGrounded`, `sourcePositions`, `fillSkippedLines`, `parseTimeText`,
  `llmWarning` for 36b/36c. `url` given: `source` via `buildSource`, and
  `videoImportUrl` for a video URL (D8). **`recipe` carries only the time
  keys it has** — no `prepTime: undefined` — so 36b can spread it over a
  schema's recipe without losing the schema's times.
- `editor/scripts/measure-llm-import.ts` — `fetch` (polite, once, into a
  scratch cache; yt-dlp metadata only) and `run --model … [--set …]
[--only …]` (offline; warm-up call; unloads the model after unless
  `--keep`).
- Tests: `test/pageText.test.ts` (22), `test/llmExtract.test.ts` (68), fetch
  stubbed with `vi.stubGlobal`.

**Corpus** (fetched once, 2026-10-14, 15 s apart, scratch only): 17 schema
pages — 8 Sally's, 3 Brian Lagerstrom, 2 King Arthur, Bon Appétit, RecipeTin
Eats, Love & Lemons, A Couple Cooks; 16 no-schema pages — 11 recipes (PUNCH
×3 with microdata only, Wikibooks `Hummus_I` and `Chocolate_Chip_Cookies_I`,
CMU's 1993 recipe archive ×2, textfiles.com ×3 plain text, plus Joshua
Weissman's page whose Recipe node has no ingredients) and 5 negatives (four
Wikibooks articles and the CMU index); 6 YouTube descriptions — 5 Brian
Lagerstrom (pasta salad, drunken noodles, Neapolitan pizza, peanut butter
cookies, focaccia) and Chinese Cooking Demystified's danhonggao, whose
description only links to the recipe (a negative).

**Gate: qwen3:8b passes, with the review's stricter grounding** (final code,
`review2-qwen3-8b`; grounding line by line, the model's own lines only):

| set                  | pages | found | trusted | grounded (verbatim) | recall (loose / exact) | precision | steps got/ref | times agree      | lines put back | median s | max s |
| -------------------- | ----- | ----- | ------- | ------------------- | ---------------------- | --------- | ------------- | ---------------- | -------------- | -------- | ----- |
| schema (force)       | 17    | 17    | 17      | 100% (99.6%)        | 100% / 99.6%           | 99.6%     | 169/158       | 40/46, 0 made up | 1              | 20.2     | 46.2  |
| no-schema            | 16    | 11    | 10      | 99.1% (99.1%)       | –                      | –         | 72            | –                | 1              | 3.7      | 25.3  |
| YouTube (pasted, D8) | 6     | 5     | 5       | 100% (100%)         | 74/74 by hand          | –         | 52            | –                | 5              | 15.9     | 19.5  |

- Target ≥ 95% recall, ≥ 95% grounded, median ≤ 30 s: **100%, 100%,
  20.2 s.** Cold load 5–9 s (6.8 GB, 100% GPU). The slowest page is Sally's
  maple pecan sticky buns (8.6k characters of card, ~1 700 output tokens at
  ~37 tok/s): output length, not page length, sets the time.
- The one schema line found but not verbatim is Lagerstrom's "1 tiny pinch
  instant yeast", where the page says "instant y east" (T9).
- All 11 no-schema recipes found; **10 trusted**. CMU's Anzac biscuits is
  `partial` at **8/9**: the model garbled "desiccated" ("desicc thaned
  coconut"); `fillSkippedLines` swaps in the source line, but the guard now
  grades the model's own lines, and 8/9 is under 90%. That is the guard
  working as the review asked; it was "trusted" before only because the
  put-back line counted.
- All 5 Lagerstrom descriptions found and trusted, every line verbatim;
  all 6 negatives `found: false` in 1–4 s.
- Before the amount-join fix (T11), the same run had Bon Appétit at 1/11
  grounded and `partial` — schema grounded 96.0%, still over the gate.
- **YouTube noise:** no URL, sponsor, gear, timestamp, chapter or music line
  became an ingredient or a step (the script's `NOISE` check plus reading
  every line). Sub-recipe headings kept ("Dough:", "Tomato Sauce:",
  "Toppings:"; "Pasta Salad:", "Dressing:"), dual-unit lines verbatim
  ("225g (½ lb) chicken thigh, …"), ranges kept ("5-8g (1tsp) thai chile").
- Precision's one extra line is King Arthur's footnote "For best results,
  measure ingredients by weight." The 6 time misses are King Arthur's (its
  times are outside the card, 6/6) — none made up.
- Steps run over the reference (169/158) because the model splits a step
  that holds several sentences; the words are the page's.

**Comparison** (same corpus, one model at a time; measured before the
review, with page-wide grounding — not re-run, the review asked for
qwen3:8b only):

| model      | schema recall | grounded | trusted (schema / no-schema / YouTube) | times              | median s | notes                                                                                                                      |
| ---------- | ------------- | -------- | -------------------------------------- | ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| qwen3:8b   | 100%          | 100%     | 17/17, 11/11, 5/5                      | 40/46              | 20.2     | 6.8 GB, 100% GPU                                                                                                           |
| qwen2.5:7b | **88.8%**     | 100%     | 17/17, 11/11, 5/5                      | 38/46 (+1 made up) | 17.6     | 5.4 GB; drops second sections — Sally's frosting and icing, Lagerstrom's dressing (13/26) and 1-dough (3/9); steps 126/158 |
| qwen3:14b  | –             | –        | –                                      | –                  | ~177     | 11 GB, 40/60 CPU/GPU; first page timed out (T5); stopped after two                                                         |

**Tuning, in order** (qwen3:8b; each re-run over the whole cached corpus):

1. **As planned** (D6 as written, integer minutes, `[{section, steps}]`):
   recall 99.6%, grounded 100%, median 22.2 s — the gate already passed. But
   times agreed 29/46 (Sally's "3 hours, 45 minutes" came back as 234), three
   short no-schema pages had no steps (PUNCH's doubled lines, CMU's `<pre>`
   fence, textfiles' collapsed lines), and a smallest-element card rule
   picked Sally's _step list_ (it says "the wet ingredients").
2. **Times as text** (`prepTime: "3 hours, 45 minutes"` → `parseTimeText`),
   a "servings line is the yield" and a "an unheaded paragraph is the
   method" rule, `display:none` dropped, `<pre>` as lines, plain-text pages
   unparsed: times 40/46, the short pages fixed. Wikibooks' Hummus _article_
   then came back as an invented recipe — **0/9 grounded, `partial`**: D4
   caught it (later runs answer `found: false`). Sally's Star Bread lost
   all its steps (`instructions: []`).
3. **Flat instructions** (`"Name:"` lines open a section, like
   ingredients): Star Bread 9/9, every schema page trusted.
4. **Skipped lines.** Reading the YouTube output found the noodles at 12/16
   and the pasta salad at 25/26 while grounded 100% (T2). A "copy the whole
   list, approximate amounts and ranges included" rule fixed it in a probe
   but not reliably (T1), so `fillSkippedLines` puts back any amount-led
   source line inside the copied list's span, and replaces a garbled copy
   (T3). Markdown headings the model copies ("#### Cream Cheese Frosting")
   become heading lines.
5. **Review round** (T11–T14): grounding line by line with every number
   required, graded on the model's own lines before the fill; position
   matching and gap filling tightened; Bon Appétit's amount grid joined;
   `parseTimeText` ranges with fractions ("1 1/2 to 2 hours" → 120), "half
   an hour", "an hour and a half", "1 hour 30", seconds. Schema pages stay
   at 100% grounded / 100% recall; the no-schema set loses one trusted
   page (Anzac, above).

**D6 amendments** (what `pageText` does beyond the plan):

- The recipe card is chosen by **labels**, not by `class*=recipe` alone: a
  known plugin root (`wprm-recipe-container`, `tasty-recipes`,
  `mv-create-card`, …) holding a short "Ingredients" element and a short
  "Instructions/Directions/Method" element; else the smallest
  `recipe`-classed element holding both, widened through `recipe`-classed
  ancestors that add ≤ 3 000 characters (the card's title/times header).
  _Why:_ the plain rule chose Sally's instruction list (step 1).
- `nav`/`aside`/`form`/`header`/`footer` are dropped **unless their class
  names the recipe** (King Arthur's `<aside class="recipe__ingredients">`);
  an `<article>`'s own header and footer stay. Comment, sidebar,
  related-post and share regions are matched by **whole class/id tokens**,
  so a wrapper's `has-sidebar` doesn't take the page.
- `display:none` and `hidden` elements dropped (PUNCH's doubled lines).
- Links, `strong`/`em`/`b`/`i` unwrapped (no URLs, no `**` for the model to
  copy); tables flattened (T7); `<pre>` rendered as lines (T6); a response
  with no HTML tag at all is used as text (textfiles.com).
- The article path widens `.entry-content` to its enclosing `<article>`
  (the post title lives in the article's header).
- `html`, `body` and `main` are never dropped by class, `hidden` or
  `display:none`; if pruning leaves nothing, the body is rendered with only
  scripts and styles removed (T14).
- A table cell holding blocks is a block (no "1 cup flour2 eggs"); rows are
  blocks.
- An amount-only block followed by another block is joined onto it
  (Bon Appétit, T11).
- Text lengths for the card search come from one bottom-up pass; a
  `RangeError` from very deep nesting falls back to `strippedPageText`, a
  tag-stripping render with no tree (T14).

**D7 amendments:**

- `prepTime` / `cookTime` / `totalTime` are **strings copied as written**,
  converted by `parseTimeText` (hours, minutes, seconds, days, fractions,
  "an hour", "half an hour", "an hour and a half", "1 hour 30", ranges →
  the upper end, fractions included). _Why:_ arithmetic, not reading, was the error
  (234 for 3 h 45 min); agreement 29/46 → 40/46, the rest are King Arthur
  times outside its card.
- `instructions` is a **flat `string[]`** with `"Name:"` lines as section
  headings, mapped to `InstructionGroup`s; `{section, steps}` objects are
  still read. _Why:_ the nested shape let the model close the list empty
  (Star Bread, step 2).
- Prompt additions: copy the whole ingredient list (approximate amounts and
  ranges included); a servings/yield line is `recipeYield`, never an
  ingredient; an unheaded paragraph after the ingredients is the method;
  never add up a time.

**D4 amendments (review):**

- **Line by line.** `groundLine` grades a line against each source line:
  `verbatim` when it is a run of whole words of one line once normalised;
  `found` when one line holds **every number** of it and ≥ 80% of its words
  (filler words like "for the" aside); else `missing`. "3 cups (125g)
  flour" against "1 cup (125g) flour" is missing even with "3 eggs" on the
  page.
- **The model's own lines.** `grounded`/`total` and the `partial` gate
  count only what the model returned, graded before `fillSkippedLines`;
  put-back lines are `llm.added` and never raise the ratio.
- **"Verbatim" only when it was.** The warning says "N/M ingredient lines
  found verbatim" only when every line was `verbatim`, else "found";
  `llm.verbatim` carries the count.

**D4 addition:** `fillSkippedLines` (step 4) places each copied line in the
source (`sourcePositions`: whole words over the longer line, every number
required, headings only on lines of ≤ 6 words, ties to the line after the
previous match) and fills only gaps of ≤ 4 non-blank lines between two
consecutive placed lines, never across an Instructions/Directions/Method
label, and only amount-led lines that are not promotions (`%`, "code"),
temperatures (`°`), times ("10 minutes later"), links or sentences.
`llm.added` lists them and the warning says "(N it skipped added back from
the list)". Open for 36b:
D4 keeps a low-grounded result as `partial` _with_ the model's lines — the
Hummus article came back as nine invented lines, all flagged. 36b may want
to drop an extraction's lines below some floor (say 50%) rather than show
them in the form.

**Gates** (after the review fixes). `pnpm --filter recipe-editor typecheck`
clean; `pnpm --filter recipe-website exec tsc --noEmit` clean;
`pnpm exec vitest run` 78 files / 1662 tests passed; Playwright (build
mode, heavy slot) `new-recipe.spec` + `import-roundup.spec`:
43 passed. No reindex, no schema change.

### 36b — Wiring

**Reindex needed: no.** No index, schema or spec version changed; nothing
new is stored in a recipe (D5).

**Built.**

- `editor/controller/llm/importWithLlm.ts` — `applyLlm({url?, source,
mapped, mode?, config?})` → `{recipe, llm?, warnings}`, the only place
  that decides auto / force / off. `source` is `{html, ok?, meta?}` (a page:
  `pageText` runs inside) or `{text, meta?}` (a video's title +
  description, `videoSource(meta)`; 36c's pasted text slots in here).
  Also `assertLlmMode` (force with no model, before anything is fetched),
  `autoWantsModel`, `mergeExtraction`, `usedModel`, `GROUNDED_FLOOR`. The
  extractor and `pageText` are `await import`ed when the model runs.
- `editor/controller/llm/mode.ts` — `LLM_MODES`, `LlmMode`, `isLlmMode`,
  no imports: the CLI's option parsing, the zod bodies and the MCP schemas
  name the modes without loading the client (35q).
- `client.ts` gains `llmStatus(config)`: one `GET` of `/api/tags` (Ollama)
  or `/v1/models` (OpenAI), 2 s, never throws — `{reachable,
modelAvailable?, error?}`.
- **Seats.** `importFromUrl(url, {llm})` now fetches with `fetchRecipePage`
  → `parseRecipePage` → `mapRecipePage` (the paced queue as before) and
  answers `{recipe, llm?, warnings}`; video hosts go through yt-dlp, then
  `applyLlm` on title + description. `importAndCreate` takes `llm`; its
  dry-run and create results carry `llm` and the warnings (ahead of the
  image warnings); a create whose recipe has the model's lines commits
  `Create recipe: <slug> (local model)` (`createRecipe`'s new `commitNote`).
  `inspectUrl(url, {llm})` returns `llm` and `warnings`, and its `recipe` /
  `draft` are the model's reading. `importItem` (roundups) runs every item
  through `applyLlm` with the call's `llm` (`ImportListOptionsSchema`);
  a no-schema item that the model reads trustworthily is imported (commit
  "(local model)"), one that stays partial still fails with the reason.
- **Surfaces.** CLI `import`, `inspect`, `import-list` take
  `--llm auto|force|off` (`llmOption`: anything else is `usage`), the human
  format prints a "local model (mode): … N/M ingredient lines grounded"
  line; `--help` lists `RECIPE_LLM_URL/MODEL/API` and a paragraph on the
  modes. `ImportOptions.llm`, `InspectOptions` and the HTTP backend's
  `inspect(url, options)`; zod `llm` on `/api/import`, `/api/inspect` and
  (through the options schema) `/api/import-list`; MCP `recipe_import`,
  `page_inspect` and `recipe_import_list` take `llm` (tool count unchanged,
  descriptions say what `llm` in a result means). `RECIPE_LLM_URL`,
  `RECIPE_LLM_MODEL`, `RECIPE_LLM_API` join `EDITOR_ENV_KEYS`, with the
  header comment's allow-list now "how to reach something".
- **Form.** `reduceRecipeImport(state, url, mode)` (page and video paths,
  still `BROWSER_RETRY`); the action sends `force` when "Extract with AI
  (local model)" is ticked, else `auto`. The box is disabled with "— No
  local model configured" when `page.tsx`'s `llmConfig()` is empty; a
  pending note names the model; the warnings show in a `role="status"`
  notice (`data-testid="llm-notice"`), and the SEO-only notice is shown only
  when the model's lines are not in the form.
- **Settings → Tools:** a "Local model" card — server, API, model, and
  reachable / unreachable (why) / "reachable, but <model> is not pulled";
  "No local model configured …" when unset (the Pi). Tools rather than Site
  details: it sits beside the yt-dlp path, the other external tool.

**D3 amendments.**

- **auto runs when the mapper found no recipe body**: no Recipe node
  (`partial`), nothing at all (`undefined` from an OK page — T16), or a
  Recipe node / video with no ingredients and no steps (T15). A non-2xx
  page is never read.
- **force fails on any model failure**, not only "unconfigured": a timeout
  or an unreachable server under force is `import_failed` ("local model
  failed: …"). Under auto it is a warning ("local model not used — …") and
  `llm.error`, and the import goes on as before.
- **force on a roundup with no model is refused before the list is
  fetched** (`assertLlmMode`), rather than failing every item alike.
- **The merge** (`mergeExtraction`): the model's name, description,
  yield and times where it gave them, its ingredients and steps always;
  the page's image, images, video, source and suggested tags always. A
  schema's description or times survive a force that has none.

**D4 amendment — the grounding floor** (the orchestrator's decision on
36a's open question). Under `GROUNDED_FLOOR` (50%) of the model's own lines
grounded, `applyLlm` throws the reading away: the recipe is what the mapper
gave (today's SEO partial; the schema's recipe under force), `llm` keeps the
counts with `discarded: true`, and the warning says "local model output
discarded — only N/M ingredient lines found on the page". From 50% (exactly
half is kept) to under 90% the lines are kept and the result is `partial`,
so a create needs `allowPartial` and its refusal names the model's reading.
`found: false` keeps the mapper's result with "local model qwen3:8b found no
recipe on the page".

**`llm` in results:** `{model, mode, found, grounded?, total?, verbatim?,
ungrounded?, added?, durationMs?, discarded?, error?}` — present whenever
the model was asked (or, under auto, failed); absent under off, with no
model, or when auto had no reason to ask.

**Real model** (qwen3:8b on the workstation's Ollama, one call at a time,
`--dry-run --json --content-dir <scratch clone>`, 2026-10-15; the clone was
deleted after). Offline = 36a's cached pages served from 127.0.0.1 (no
network); live = one fetch per host.

| run                                         | result                                                                                                                                                                                                   | model s |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| PUNCH Negroni (microdata only), `off`       | partial: name only, 0 ingredients — today's behaviour                                                                                                                                                    | –       |
| same, `auto`                                | not partial; 5/5 verbatim, 4 steps                                                                                                                                                                       | 9.4     |
| CMU Gingerbread Men, `off` / `auto`         | partial / 11/11 verbatim, 5 steps, yield "Makes about 5 dozen"                                                                                                                                           | 5.9     |
| textfiles.com black bean chili, `auto`      | 16/16 verbatim, 7 steps (was `undefined` → "No schema.org Recipe found" before — T16)                                                                                                                    | 13.1    |
| Wikibooks `Cookbook:Hummus_I`, `auto`       | 9/9 verbatim, 9 steps                                                                                                                                                                                    | 8.9     |
| Wikibooks `Cookbook:Hummus` (article)       | `found: false`, stays partial, "found no recipe on the page"                                                                                                                                             | 2.3     |
| Sally's apple pie, `auto` → `force`         | auto: schema, no model call. force: 10/10 lines **identical** to the JSON-LD, 11/11 steps, times 180/65/420                                                                                              | 29.0    |
| Sally's Star Bread, `auto` → `force`        | 10/10 identical, 9/9 steps, times 150/30/180 agree                                                                                                                                                       | 27.5    |
| **live** PUNCH Last Word, `auto`            | not partial; 6/6 verbatim (incl. "Serving: 1" — T20), 4 steps; 17.5 s wall                                                                                                                               | 3.9     |
| **live** Sally's pumpkin roll, `force`      | 16/16 JSON-LD lines + the "Cream Cheese Frosting:" heading; 11/11 steps; times 25/18/225 agree; 25.7 s wall                                                                                              | 22.7    |
| **live** CMU Anzac biscuits, `off`          | partial, name only; 2.6 s wall                                                                                                                                                                           | –       |
| **live** YouTube `lo2pf0pYB9U` (Lagerstrom) | yt-dlp reached it; `auto` read title + description: 28/28 verbatim, "Pasta Salad:" / "Dressing:" headings, 8 steps; no sponsor, link or timestamp line; image, video and source from yt-dlp; 25.1 s wall | 17.5    |

**Gates.** `pnpm --filter recipe-editor typecheck` clean;
`pnpm --filter recipe-website exec tsc --noEmit` clean; `pnpm exec vitest
run` 79 files / 1683 tests passed (new: `test/importWithLlm.test.ts`, 6;
`curation` +9 — auto fills a no-schema page and the dry-run draft, force
over schema, 3/4 kept partial and 1/4 discarded, an ungrounded force falls
back to the schema, off and found:false, unreachable under auto and force,
unconfigured auto no-op and force `import_failed`, inspect, the video path
through the yt-dlp mimic (new fixture `responses/recipe.json`);
`importList` +3 — a no-schema roundup item through auto with its
"(local model)" commit, off / no model still refused, force with no model
refused before fetching; `cliJson` +1 — `--llm maybe` is `usage`, force
with no model, the model's URL from `RECIPE_ENV_FILE`; `editorEnv` +1;
`mcp` +1; the HTTP backend posts `llm`). Playwright (build mode, heavy
slot) `new-recipe.spec`, `settings-nav.spec`, `accessibility.spec`,
`import-roundup.spec`, `visual.spec`: **100 passed** (the two
`/new-recipe` baselines regenerated first, T17).

**Review round** (7 findings, fixed in one commit):

1. **Auto never makes a non-partial result partial** (T21). When the
   mapper's result was not `partial` (a video, an empty Recipe node), an
   untrusted reading at ≥ 50% is kept _without_ `partial`, with "local model
   …'s reading is incomplete — <why>; kept, since the import had nothing in
   its place; check it against the source". Under force, and over an SEO
   partial, D4 stands. `partial` is now decided by `applyLlm` on the merged
   result: the model's lines ≥ 90% grounded (or none of its own, the page's
   kept), an ingredient and a step.
2. **Empty lists never wipe the page's** (T22): `mergeExtraction` keeps
   the mapper's ingredients or steps when the model's are empty, and the
   warnings say "the local model returned no <list>: the page's own <list>
   are kept".
3. **Playwright pins `RECIPE_LLM_URL=""`** in `webServer.env` (T18).
4. **Force with no text to read** (yt-dlp missing, an empty page) **warns**
   — "local model not used — no text to read", `llm.error` — rather than
   raising: the mapper's result is still a result (a video's bare link with
   `--name`), and nothing was asked of the model that could fail. Under
   auto it stays silent.
5. `mapRecipePage` is back inside the fetch `try`: malformed JSON-LD is
   `import_failed` again (not `internal`), and the message names the URL
   as given (fragment included).
6. The model's title hint is the mapper's name first, then the page's
   `<title>`, so force never trades a schema's clean name for "X | Site".
7. `displayUrl` strips `user:password@`, the query and the fragment from
   the model URL in every `LlmError` message and on the Tools card.

Tests: `importWithLlm.test` +6 (exactly 90% trusted and 80% partial, empty
ingredients / steps under force keep the schema's, auto never partial over
a video with force partial for comparison, force with no text, the title
hint, `displayUrl`); `curation` +3 (the ingredients-only video imports and
creates under auto — new mimic fixture `responses/ingredients-only.json`;
force with yt-dlp missing warns; malformed JSON-LD is `import_failed`).
Gates: typecheck and `tsc --noEmit` clean; `vitest` 79 files / 1692 tests;
Playwright (build mode, heavy slot) `new-recipe`, `settings-nav`,
`import-roundup`, `visual`: **74 passed**.

**Left for 36c** (as briefed): `ImportOptions` / `api/import` / the CLI
`import` / MCP `recipe_import` take `url` today; `applyLlm`'s `{text}`
source, `videoSource` and the result's `llm` / `warnings` are what the
`text` (+ `source`) mode needs. **Not done:** the form's own submit commit
says nothing of the model (the form's create is the person's edit, not an
import); the `import-list` human format prints no per-item `llm` line
(`--json` carries it).

### 36c — Text import mode

**Reindex needed: no.** No index, schema or spec version changed; a pasted
import stores an ordinary recipe (D5).

**Built.**

- `readPastedText({text, source?, config?})` in
  `controller/llm/importWithLlm.ts` — the one reading of pasted text, used
  by the seat and the form. It is `applyLlm` under `force` with nothing
  mapped: the same extractor, `capText` cap, D4 grounding (against the
  pasted text, "in the text" in the warnings) and 36b's 50% floor. With
  nothing to fall back to, every way of not getting a recipe is
  `import_failed`: no model ("no local model configured (RECIPE_LLM_URL)",
  before any request), a failed call ("local model failed: …"), `found:
false` and a discarded reading ("No recipe read from the pasted text —
  <the warning>"). Between 50% and 90% the recipe is `partial`, so a create
  needs `allowPartial`, as for a page. Empty text, text over
  `PASTED_TEXT_MAX_CHARS` (100 000; the model still sees at most 24k) and a
  source that is not an http(s) URL are `validation`. CRLF is normalised.
  `pastedSourceUrl` drops the fragment (the URL importer's rule); the
  extractor cites it with `buildSource` and a video URL also sets
  `videoImportUrl`. **Nothing is fetched from the source** — no image
  either. The name is the model's, else the text's first non-empty line
  (36a's `firstLine`); `--name` wins.
- **Seat:** `importFromText(ctx, {text, source?, …})` in
  `curation/importRecipe.ts`, beside `importAndCreate`; both now end in one
  private `finishImport` (the `partial` gate, the dry run and its draft, the
  create), so the two cannot drift. A create commits `Create recipe:
<slug> (local model, pasted text)` (36b's `commitNote`). A dry run carries
  `pastedText: true` and `url` only when a source was given
  (`ImportDryRunResult.url` is now optional).
- **One request schema:** `controller/curation/importRequest.ts`
  (`ImportRequestSchema`, `importTarget`) — `zod` and the mode names only,
  so the MCP server's startup is unchanged (35q). Exactly one of `url` /
  `text`; `source` only with `text`; `llm` only with `url` (text always
  uses the model). `/api/import` and MCP `recipe_import` both use it.
- **CLI:** `recipes import --text <file|-> [--source <url>]` with `--tags`,
  `--slug`, `--name`, `--image`, `--dry-run [--out]`, `--overwrite`,
  `--allow-partial` as for a URL. A URL and `--text` together, `--source`
  without `--text`, `--llm` with `--text`: `usage`. `-` reads stdin
  (`readTextInput` in `cli/input.ts`; an unreadable file or empty text is
  `validation`). The human format says `dry run: pasted text (source …)`.
  `--help` has the usage line and a paragraph.
- **Backends:** `CuratorBackend.importText(text, ImportTextOptions)`; the
  local one calls the seat, the HTTP one posts `{text, source?, …}` to
  `/api/import`.
- **MCP:** `recipe_import` takes `text` (+ `source`) as the alternative to
  `url`; title "Import a recipe from a URL or pasted text", description
  extended. Tool count unchanged (55).
- **Form (`/new-recipe`):** "URL" / "Paste text" radio buttons in a
  fieldset (legend "Import from", screen-reader only) above the import
  field. "Paste text" is disabled with "— No local model configured" when
  `llmConfig()` is empty, as the "Extract with AI" box is. The text tab
  shows a "Recipe text" textarea and a "Source URL (optional)" field
  (controlled, T27); the action branches on `importMode=text` to
  `reduceTextImport` (`new-recipe/common.tsx`), which calls
  `readPastedText` and fills the form as a URL import does. Pending note
  "Reading the text with qwen3:8b… (the first use loads the model,
  ~10 s)"; the warnings go to the same `llm-notice`. `RecipeActionState`
  gains `key` (a pasted import has no URL to remount the form with).

**Real model** (qwen3:8b on the workstation's Ollama, one call at a time;
`recipes import --text … --dry-run --json --content-dir <absolute scratch
clone>`, 2026-10-15; the clone was deleted after). The five Lagerstrom
descriptions are 36a's cached yt-dlp metadata (not fetched again), pasted
as the raw description; the Sally's recipe is 36a's cached Iced Oatmeal
Cookies page reduced to its card's text, as a person copying it would get
(ratings line, "Print Recipe", "Cook Mode" and all); the email is written
for the check — a reply chain, "Sent from my iPhone" and a realtor's
signature around Aunt Carol's white chicken chili.

| pasted text                              | trusted | grounded (verbatim)    | ingredients / steps | headings                         | source / video       | model s     |
| ---------------------------------------- | ------- | ---------------------- | ------------------- | -------------------------------- | -------------------- | ----------- |
| Lagerstrom drunken noodles (cold model)  | yes     | 15/16 (15), 1 put back | 16 / 10             | –                                | –                    | 24.2 (cold) |
| Lagerstrom drunken noodles               | yes     | 15/16 (15), 1 put back | 16 / 10             | –                                | –                    | 17.0        |
| Lagerstrom pasta salad                   | yes     | 27/27 (27), 1 put back | 28 / 8              | Pasta Salad:, Dressing:          | –                    | 16.8        |
| same, `--source` its YouTube URL (stdin) | yes     | 25/26 (25), 2 put back | 27 / 8              | Dressing: (T23)                  | YouTube, `video` set | 16.3        |
| Lagerstrom Neapolitan pizza              | yes     | 14/14 (14)             | 14 / 8              | Dough:, Tomato Sauce:, Toppings: | –                    | 19.5        |
| same, `--source` its YouTube URL (stdin) | yes     | 14/14 (14)             | 14 / 8              | the same                         | YouTube, `video` set | 19.5        |
| Lagerstrom peanut butter cookies         | yes     | 14/14 (14)             | 14 / 10             | –                                | –                    | 14.9        |
| Lagerstrom cast-iron focaccia            | yes     | 7/7 (7)                | 7 / 16              | –                                | –                    | 13.8        |
| Sally's Iced Oatmeal Cookies (card text) | yes     | 16/16 (16)             | 16 / 8              | "Icing" as a line (T30)          | `--source` the page  | 21.0        |
| Emailed white chicken chili              | yes     | 12/12 (12)             | 12 / 1 (T24)        | –                                | –                    | 7.0         |

- **No marketing line survived**: no URL, sponsor read (the noodles' David
  protein plug), "WATCH NEXT", gear list, Amazon disclosure, chapter
  timestamp, "MUSIC: EPIDEMIC SOUND", blog link, email header, quoted
  reply, "Sent from my iPhone" or signature line became an ingredient or a
  step — checked by a noise pattern over every line and by reading them.
- The one ungrounded noodle line is T3's garble ("7,5g (5T) oyster sauce"
  for "75g (5T)"); `fillSkippedLines` swapped in the source line, so the
  draft is right and the warning says "found" rather than "verbatim".
- Sally's: all 15 card ingredients verbatim, yield "28 cookies", times
  85/12/120 as on the card, the 8 steps. The card's sub-heading "Icing"
  (no colon, as copied) came back as written — an ingredient line, not a
  heading — so it is the 16th "ingredient" (T30). The ratings line, "Print
  Recipe" and "Cook Mode" were skipped.
- The email: yield "feeds a crowd, 8 or so", every ingredient verbatim
  ("salt and pepper", "a handful of cilantro" included), name "CAROL'S
  WHITE CHICKEN CHILI"; one step (T24); `prepTime` 60 (T26).
- Names: "Pasta Salad", "Neapolitan pizza", "Cast-Iron Focaccia" read well;
  "DRUNKEN NOODLES RECIPE" and "PEANUT BUTTER COOKIE RECIPE" are the
  description's own headers (T25).

**Gates.** `pnpm --filter recipe-editor typecheck` clean;
`pnpm --filter recipe-website exec tsc --noEmit` clean; `pnpm exec vitest
run` 80 files / 1706 tests passed (new: `test/importRequest.test.ts`, 5 —
the body's url/text/source/llm rules and `importTarget`; `curation` +7 —
a pasted description trusted and created with no source, a source URL
cited and a video URL as the video with no request to either, 3/4 partial
gated by `allowPartial` and 1/4 `import_failed`, `found: false` and
unreachable, unconfigured with no request, the first-line name and
`--name`, empty text; `mcp` +1 — `text` + `source` dry run, creates, the
refusals, unconfigured; `cliJson` +1 — `--text -` from stdin with
`--source`, `--text <file>` creating with the "(local model, pasted text)"
commit, URL + `--text`, `--source` alone, `--llm` with `--text`, empty
stdin, no model). Playwright (build mode, heavy slot): the two `/new-recipe`
baselines regenerated first (T29; `visual.spec -g "new-recipe form"
--update-snapshots`, 2 passed), then `new-recipe.spec` (+1: "Paste text"
disabled with "No local model configured", the URL field still there),
`visual.spec`, `accessibility.spec`, `import-roundup.spec`,
`settings-nav.spec`: **101 passed**.

**Review round** (9 findings, none blocking; fixed in two commits — the
JSON-LD escape on its own):

1. **A cut paste says so** (T31). `capText` reports `kept: {head, tail}`;
   `readPastedText` adds "the text is N characters; the model read the
   first ~3k and the last ~21k — paste just the recipe" to the warnings,
   and to the `import_failed` message when nothing was found.
2. **"Pasted from (URL, optional)"** replaces "Source URL (optional)", which
   a substring `getByLabel("Source URL")` and a screen reader confused with
   the recipe form's own field. No spec or baseline named it.
3. **An editor from before 36c** answers a `--remote` `--text` with
   "predates pasted-text import (36c) — update it, or run with
   --content-dir" (T33).
4. **The first-line name** skips lines holding `http(s)://`, a leading
   `m:ss` timestamp or an `@handle`, and is `undefined` when none
   qualifies; `importedToInput`'s message no longer says "page".
5. **`--text -` on a terminal** prints "Paste the recipe, then press
   Ctrl-D" to stderr.
6. **Form state:** the URL field is controlled, so it survives a switch to
   Paste text and back; switching mode dismisses the last import's
   message; the per-import `key` is a UUID (two imports in one millisecond
   would have shared `Date.now()`).
7. **Tests at the route:** `test/importRoute.test.ts` (6) calls
   `/api/import`'s `POST` with `{text, source}` and `{text}` (200 / 201),
   its refusals (`validation` with the issue path; `import_failed` with no
   model), `reduceTextImport`'s success and failure paths, and the HTTP
   backend's `importText` against the real handler on 127.0.0.1 plus a
   pre-36c editor (T34).
8. **Nits:** the 100k limit counts the text with CRLF normalised (a refine
   — a transform would not survive the MCP SDK's JSON Schema), so the HTTP
   and local paths agree; the cited source is the parsed `href` without its
   hash ("HTTPS://Example.com/x#c" → "https://example.com/x").
9. **Security, pre-existing** (T32): `fix(jsonld): escape < in JSON-LD
script (stored XSS via recipe name)` — `serializeJsonLD`, with
   `test/recipeJsonLD.test.ts` +2 (the escaped text parses back to the
   same object; the rendered element has exactly one `</script>`).

Gates after the review: `pnpm --filter recipe-editor typecheck` and
`pnpm --filter recipe-website exec tsc --noEmit` clean; `pnpm exec vitest
run` **81 files / 1717 tests** passed (curation +3: the cut note, the name
skips and `--name`'s message, the normalised source). Playwright (build
mode, heavy slot) `new-recipe`, `visual`, `accessibility` and `recipe.spec`
(the one spec that parses the page's JSON-LD): **102 passed**; no baseline
moved (the renamed label shows only in the Paste text tab).

### 36d — "Give it the URL"

**Reindex needed: no.** No index, schema or spec version changed; a video
import stores an ordinary recipe (D5).

**Built.**

- `controller/ytdlp.ts` — `fetchYtdlpMetadata(url, {comments})`: with
  `comments` and a YouTube URL it runs `YTDLP_COMMENT_ARGS` (`--write-comments
--extractor-args "youtube:max_comments=10,10,0,0;comment_sort=top"`)
  before the rest, with a 45 s timeout, and retries once without comments
  if that run fails. Every run's argv is `ytdlpArgs`: `[…comments]
--no-playlist -J -- <url>` (review). `pickYtdlpMetadata` keeps
  `comments`: top-level ones **by the uploader** (review: never a viewer's,
  pinned or not), pinned first, at most three, each capped at
  `COMMENT_MAX_CHARS` (6 000). `videoSuggestedTags` → `ytdlpToRecipe`'s
  `suggestedTags` (`suggestTags`, limit 10, tags holding the channel's name
  dropped).
- `controller/llm/importWithLlm.ts` — `videoSource` sends the title, the
  description and `recipeComments` (the creator's pinned comment and their
  longest, both when they differ) as "Creator's pinned comment:" /
  "Creator's comment:" blocks, and labels the source ("the video's
  description and pinned comment", "… and the creator's comment(s)");
  `videoFetchOptions(mode, config)` asks for comments only with a model and
  not `off`. The three video call sites (`importFromUrl`, `inspectUrl`,
  the form's `reduceRecipeImport`) pass it. The label reaches the warnings
  through `extractRecipe`'s `sourceLabel` / `sourceWhere`: a trusted video
  reading says "read from the video's … by local model qwen3:8b — N/M
  ingredient lines found verbatim; check it"; found-nothing and discarded
  readings say "in the video's …".
- `inspect` lifts a video's `suggestedTags` to the top level, as for a page.
- `common/util/videoUrl.ts` — `isVideoUrl`, `videoHostName`, `isYouTubeUrl`
  with no imports; `importRecipeData` re-exports `isVideoUrl` from it, and
  `ytdlp.ts`'s YouTube check uses it.
- **Form** (`new-recipe/form.tsx`): the URL field (still `Import from URL`,
  `name="import"`) is described (`TextInput`'s new `describedBy`) by helper
  text — with a model "A recipe page or a video link. The server fetches it
  — yt-dlp for videos — and qwen3:8b reads the recipe out of it when
  there's no recipe data.", without one the plain version — and, for a
  video URL, a live hint (`aria-live`, `data-testid="import-video-hint"`):
  "YouTube video — yt-dlp fetches the description and pinned comment;
  qwen3:8b reads the recipe." (no model: "… fetches its title, description
  and thumbnail."). The force box reads "Re-read with AI even if the page
  has recipe data" and is not rendered for a video URL. The pending note
  for a video is "Fetching the video with yt-dlp, then qwen3:8b reads it…
  (~20–30 s)". Pasting is a link-styled button under Import, "No link?
  Paste the recipe text instead" (disabled, described by "— No local model
  configured", without a model), and "← Import from a link instead" in
  text mode; focus moves to the field that appears. The text mode posts a
  hidden `importMode=text` (the action is unchanged) and says "qwen3:8b
  reads the recipe out of the text — an email, a note, a cookbook page
  typed up."
- **Mimic and fixtures:** `ytdlp-mimic.mjs` drops a fixture's `comments`
  unless `--write-comments` is passed and logs its argv to
  `YTDLP_MIMIC_LOG`; `responses/pinned-comment.json` (recipe only in a
  pinned comment, plus a viewer's comment, an uploader's reply and
  chapters) and `responses/chapters.json` (ingredients, "watch the video
  for the method", chapters, tags incl. one naming the channel).

**Chapters — measured, left out.** The 36a YouTube corpus plus six videos
found for this phase (Lagerstrom's chili, ciabatta, English muffins and
butter chicken; Sivan's Kitchen's challah and granola, whose recipes are in
pinned comments), fetched once with comments (15 s apart) and read offline
by qwen3:8b, one call at a time, under auto:

| video                                      | description only             | + chapters                                                  | + pinned comment (shipped)             |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Lagerstrom pasta salad `lo2pf0pYB9U`       | 28/28, 8 steps (18.6 s)      | identical (15.6 s)                                          | – (no pinned comment)                  |
| Lagerstrom focaccia `1_dD-EDA95A`          | 7/7, 16 steps (23.0 s, cold) | same lines, steps reworded (12.3 s)                         | –                                      |
| Lagerstrom pizza `7CM2VU0e1ks`             | 14/14, 8 steps (20.5 s)      | identical (17.7 s)                                          | –                                      |
| Lagerstrom peanut butter cookies           | 14/14, 10 steps (15.2 s)     | identical (13.5 s)                                          | –                                      |
| Lagerstrom noodles `UhOk2SkdD6s`           | 12/12 + 4 put back, 10 steps | – (no chapters)                                             | –                                      |
| Lagerstrom chili `8h7YSpu98Uc`             | 35/35, 17 steps (25.9 s)     | 35/35 (34 verbatim), same steps                             | –                                      |
| Lagerstrom ciabatta `jA95tUK2RZU`          | 12/12, 10 steps (19.0 s)     | identical (17.2 s)                                          | –                                      |
| Lagerstrom butter chicken `ESqF6CW91UQ`    | 35/35, 7 steps (25.0 s)      | identical (22.7 s)                                          | identical (23.6 s; a short note)       |
| **Lagerstrom English muffins** (no method) | 10/11, 1 step (T36) (6.2 s)  | **8 "steps": a "Chapters" section of `0:21 …` lines** (T35) | –                                      |
| **Sivan's challah** (empty description)    | found: false (1.1 s)         | **0 ingredients, 9 chapter titles as steps, kept**          | **6/6 verbatim, 10 steps (13.6 s)**    |
| **Sivan's granola** (empty description)    | found: false (1.2 s)         | **0 ingredients, 6 chapter titles as steps, kept**          | **9/10, 10 lines, 4 steps (7.3 s)**    |
| CCD danhonggao (links out; notes pinned)   | found: false (1.3 s)         | found: false                                                | 0/67 invented, discarded (30.5 s; T37) |

- **Chapters: never better, three times worse** — so they are not sent
  (D9, T35). The muffins' chapter outline arrived as timestamped "steps",
  not a method; where the description has a method the model ignored them.
- **Pinned comments: two recipes found that were invisible before** (both
  Sivan's, 6/6 and 9/10 — the granola's one miss is T3's garble, "1 cup
  (130 g) almonds" for "136 g", swapped back by `fillSkippedLines`); a
  short non-recipe note changed nothing; a long one of notes cost 30 s and
  was discarded by the 36b floor (T37).
- **Tags:** the noise is real but harmless — the muffins' ten are all
  "english muffin(s) …" SEO variants. Suggestions only (26d).

**Wall time of the comment fetch** (yt-dlp `-J` on the workstation, one
video at a time, 15 s apart): pasta salad 4.6 s plain vs 5.2 / 5.7 s with
comments; in the live check below 5.2 → 5.2, 2.1 → 3.0, 4.3 → 5.3 s. About
**+0–1 s** against a 5–25 s model reading, so comments are fetched on every
model import, not only after a first reading fails (D9).

**Real model, live** (qwen3:8b, 2026-10-15, one fetch per video and mode,
15 s apart; the scratch clone was deleted after):

| video                                         | without the comment fetch                     | with it (shipped)                                   |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Lagerstrom pasta salad `lo2pf0pYB9U`          | 28/28 verbatim, 8 steps; 5.2 s + 16.3 s model | 28/28 verbatim, 8 steps; 5.2 s + 15.5 s             |
| Lagerstrom English muffins `giyFwrD6oBM`      | 10/11, 1 step (T36); 2.1 s + 6.4 s            | the same; 3.0 s + 4.9 s                             |
| Sivan's challah `5NpWYEQOzDc` (pinned recipe) | found: false — the bare video; 4.3 s + 0.7 s  | **6/6 verbatim, 10 steps, trusted**; 5.3 s + 13.5 s |

- Through the CLI, `recipes import https://www.youtube.com/watch?v=5NpWYEQOzDc
--dry-run --json --content-dir <scratch>` with `RECIPE_LLM_URL` set: 6/6
  verbatim, 10 steps, source YouTube / Sivan's Kitchen, `video` set, the
  warning "read from the video's pinned comment by local model qwen3:8b —
  6/6 ingredient lines found verbatim; check it"; 65 s wall, 53.6 s of it
  the model — the machine was under memory pressure then (1.7 GB free);
  the same reading took 13.5 s minutes earlier.
- `recipes inspect https://www.youtube.com/watch?v=giyFwrD6oBM --llm off`:
  `suggestedTags` (10), `video.chapters` (7).
- No Lagerstrom video in the corpus says "watch the video for the method";
  the English muffins (ingredients, no method) is the nearest, and its
  chapters did not help (T35).

**Gates.** `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; `pnpm exec vitest run` **81 files
/ 1728 tests** passed (+11: `ytdlp` +4 — comments kept / dropped / capped,
tags and the channel filter, comments only on request and only of YouTube,
the retry without; `importWithLlm` +4 — the source text and label, the
uploader's comment, `videoFetchOptions`, grounding against the combined
text incl. a viewer's line not grounded; `curation` +3 — a pinned-comment
recipe through the seat with the comment fetched, no fetch without a model
or under off, tags in the dry run and `inspect`). Playwright: the two
`/new-recipe` baselines regenerated first (`visual.spec -g "new-recipe
form" --update-snapshots`, heavy slot, 2 passed; T40), then
`new-recipe`, `ytdlp-import`, `youtube-video`, `visual` and
`accessibility` in build mode through the heavy slot: **104 passed**
(`new-recipe` +1: the helper text as the field's description, the video
hint and its `aria-describedby`, the force box gone for a video and back
for a page; the two "no model" tests moved to the reworded box and the
paste button).

**Review round** (5 findings, none blocking; one commit):

1. **Only the creator's comments** (MEDIUM, T41): a viewer's comment is
   dropped even when pinned; the creator's pinned and longest comments both
   go when they differ ("Creator's pinned comment:" / "Creator's
   comment:"). Fixture `responses/pinned-viewer.json`.
2. **The live region stays rendered** (T42): `empty:mb-0` instead of
   `empty:hidden`.
3. **The retry test retries for real:** fixture `responses/comments-fail.json`
   fails only with `--write-comments`; the retry answers `success` with no
   comments.
4. **`--no-playlist` and `--`** on every yt-dlp run (`ytdlpArgs`, T43); the
   mimic reads the URL after `--` (T39).
5. Stale "Extract with AI" / "Paste text tab" comments in `actions.tsx`
   and `common.tsx`.

Gates after the review: typecheck and `tsc --noEmit` clean; `pnpm exec
vitest run` **81 files / 1731 tests** (`ytdlp` +1 — the argv; the comment
test now holds a pinned viewer's comment; `importWithLlm` — the creator's
pinned and longest, a pinned viewer's comment never sent; `curation` +1 —
the creator's comment read, not a viewer's pinned one, through the seat).
Playwright (build mode, heavy slot) `new-recipe`, `ytdlp-import`,
`youtube-video`, `accessibility`, `visual`: **104 passed**; no baseline
moved.

**Backlog** (rows in `backlog.md`): follow a recipe link out of a video's
description (Chinese Cooking Demystified's Substack case — the model
answers `found: false`, the page it links is the recipe), and a credit
line read as the only step (T36).

### 36e — Several recipes in one video or paste

**Reindex needed: no.** No index, schema or spec version changed: a batch
stores ordinary recipes, one commit each, and a component link is the
ingredient-line link 25c already indexes (`ingredientRecipeLinks`).

**Built.**

- `controller/llm/splitRecipes.ts` — the gate (`ingredientBlocks`,
  `mayHoldSeveral`), the list (`LLM_LIST_SYSTEM_PROMPT`, `listRecipes`,
  `readListAnswer`), the one-dish question (`isOneDish`), the cut
  (`locateRecipes`: the heading line, else the first ingredient and the
  short line above it; `sliceText`), the components (`findComponents`,
  `linkLine`) and the chapters (`chapterFor`, `placeInChapters`).
  `chapterTime.ts` (`ChapterRef`, `formatStart`) and `mergeReadings.ts` have
  no runtime imports, for the CLI's formatter and the client picker.
- `importWithLlm.ts` — `applyLlm({split})`: the video's and the paste's
  callers pass it, pages do not. The single reading's tail is now
  `settleExtraction`, run per slice too; `readSeveral` returns `recipes:
SplitReading[]` (`n`, `recipe`, `llm`, `warnings`, `trusted`, `heading`,
  `chapter`, `components`) with `recipe` / `llm` the first one's and the
  warnings led by "local model qwen3:8b found 4 recipes in the video's
  description: 1. Potato Puree, … — pick the ones to import". `videoSource`
  carries the chapters (never into the model's text, 36d).
- `curation/importRecipe.ts` — `ImportBatchResult` (`batch`, `found`,
  `recipes`), `finishBatch` (pick / all / the dry run's "all of them" /
  the `usage` refusal naming them; `slug` and `name` only with one pick),
  `importBatchPicks` (plan every pick first: the partial gate, the slug,
  a slug taken or taken twice in the batch; then the links; the picture
  probed and fetched once; one `createRecipe` per pick with the note
  `local model, {n} of {total} from <source>`). `slugIsTaken` is exported
  from `recipes.ts`.
- `inspect` — `recipes: InspectRecipe[]`, each draft linked to the slugs a
  create would use.
- CLI `import … --all | --pick 1,3` (`parseRecipePicks`; `--pick` and
  `--all` together is `usage`), the batch's human format (found, then each
  pick's status), exit 1 when a pick failed, `--out d.json` → `d-1.json` …;
  `--help` has a paragraph. `ImportOptions.pick` / `all`; the HTTP backend
  names a pre-36e editor (`predatesBatch`).
- `ImportRequestFields` gains `pick` (1-based, 1–100 entries) and `all`,
  not both — `/api/import` and MCP `recipe_import` (descriptions say what a
  batch answers); `page_inspect` describes `recipes`. Tool count unchanged.
- Form: `BatchPicker.tsx` over `PickList.tsx` (35r's rows, Select all /
  none and results, now shared — `RoundupImport` renders through it with
  the same ids and test ids); `batchActions.ts` (`importRecipeBatchAction`,
  strict zod, `importBatchPicks` with `allowPartial`); `common.tsx` passes
  `split` and returns `recipes`, a per-import `key` and `batchTitle`;
  `form.tsx` keeps the form empty for a batch until "Edit this one first"
  or "Import as one recipe instead".
- `common/util/videoUrl.ts` — `withVideoStart`, `videoStartSeconds`; the
  recipe view passes `config.youtube.start` to the player.
- Test seam (T50): `setLlmUrlOverride` in `client.ts` (read only under
  `TEST_MODE`), `/settings/test-llm`, `playwright/fixtures/llm/standInModel.ts`
  and the mimic's `responses/holiday-sides.json` (a paraphrased four-recipe
  description with the same shape and chapters).
- Curator SKILL.md: a "Several recipes in one video" paragraph.

**Measured** (qwen3:8b, offline: Roger's video from the cached dump, the
36d video corpus with its comments, 36c's email and Sally's card text, and
a paste of the pizza and peanut butter cookie descriptions; one call at a
time; 2026-10-15 on a loaded machine — T53). Cells are grounded/total ·
steps per recipe found, then the wall time.

| text                                   | read as one (before 36e)                     | (a) one call, `recipes[]`                                     | (b) list, then D7 per slice (shipped, + gate)               |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| **Holiday Sides 3 Ways** `Z8J2HgaaSgQ` | 1 recipe, 44/44 · 19 (63.6 s)                | 4: 5/5·3, 13/13·6, 13/13·4, 9/9·3 (60.4 s); names in capitals | **4: 5/5·3, 13/13·6, 13/13·4, 9/9·3 (60.7 s; list 7.3 s)**  |
| paste: pizza + peanut butter cookies   | 1 recipe, the pizza only, 14/14 · 8 (34.4 s) | 2: 14/14·9, 15/15·11 (54.3 s)                                 | **2: 14/14·8, 14/14·10 (52.8 s)**                           |
| Lagerstrom chili (passes the gate)     | 35/35 · 17 (35.0 s)                          | **2**: + "CLIFFS NOTES CHILI VARIATION" 8/8·0                 | 1: unchanged (+ list 5.2 s)                                 |
| Lagerstrom butter chicken (gate)       | 35/35 · 7 (37.0 s)                           | **4 parts**                                                   | list: **3 parts**; with the one-dish question: 1, unchanged |
| Lagerstrom ciabatta (gate)             | 12/12 · 10 (25.7 s)                          | 12/12 · 10                                                    | 1: unchanged (+ list 3.4 s)                                 |
| Lagerstrom pasta salad                 | 26/27 · 8                                    | 28/28 · 8                                                     | gate: never listed (asked anyway: split in two, T44)        |
| Sally's iced oatmeal (card text)       | 16/16 · 9                                    | **12/12** · 8 — the icing lines gone                          | gate: never listed                                          |
| Sivan's challah / granola              | 6/6 · 10 / 9/10 · 4                          | **5/6** / **5/6**                                             | gate: never listed                                          |
| the other 7 single texts               | –                                            | names changed (e.g. "Pizza", "DRUNKEN NOODLES")               | gate: never listed                                          |

- **The split** is the same in (a) and (b) on both real batches; (b) took
  its names from the list ("Stuffing") and (a) from the headings
  ("STUFFING"). No ingredient line was lost between recipes in either: the
  only amount-led lines outside every recipe were gear links ("6.75qt DUTCH
  OVEN: https://…").
- **Single-recipe texts:** (a) changed the reading of five of the
  fourteen beyond their names, and the names of most (T46). (b) leaves
  every text the gate stops (11 of 16) untouched by construction, and of
  the three single recipes that pass it, the list kept two whole and the
  one-dish question kept the third (T45). The list costs 3–8 s and the
  question 0.3–4 s on the texts that pass the gate, nothing on the rest.
- **Wall time** for the four-recipe video: ~60–64 s whichever way it is
  read (one reading of everything, one call returning four, or the list
  and four slice readings of 9–18 s) — the output's length sets it, as in
  36a, and the four recipes are the same lines either way.
- **The one-dish question** (separate call, `ask`): right on 15 of 16 texts,
  0.3–4 s; the list's own `oneDish` field instead made the ciabatta five
  recipes. Probe log `36e/stage1.log`.

**Real check** (qwen3:8b; `--content-dir` an absolute scratch clone of the
content repo, reindexed, deleted after):

| run                                                                        | result                                                                                                                                                                                                                                                                                                                                                        | wall   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **live** `import Z8J2HgaaSgQ --dry-run` (one yt-dlp fetch, comments asked) | **4 recipes, every line verbatim, all trusted:** Potato Puree 5/5 at **0:32**, Stuffing 13/13 at **5:04**, Green Bean Casserole 13/13 at **10:52**, Fried Shallots 9/9 at **10:52** (the casserole's chapter); the casserole's last line `[Crispy fried shallots (or onions) - see recipe below](/recipe/fried-shallots)`; readings 9.3 / 16.6 / 15.4 / 9.6 s | –      |
| `import Z8J2HgaaSgQ` (no flag)                                             | `usage`: "The local model found 4 recipes in …: 1. Potato Puree, 2. Stuffing, 3. Green Bean Casserole, 4. Fried Shallots. Import them all with --all, or some with --pick 1,3 …"                                                                                                                                                                              | 64.0 s |
| `import Z8J2HgaaSgQ --all`                                                 | potato-puree, stuffing, fried-shallots created, a commit each ("Create recipe: stuffing (local model, 2 of 4 from youtube.com/watch?v=Z8J2HgaaSgQ)"), the thumbnail downloaded once; **the casserole failed alone**, `slug_conflict` — the corpus has a `green-bean-casserole` (T52); exit 1                                                                  | 63.3 s |
| `import Z8J2HgaaSgQ --pick 3 --slug green-bean-casserole-lagerstrom`       | created; its shallot line links to `/recipe/fried-shallots` (the same video's, from `--all`); `source.url` and `video` end `&t=652s`                                                                                                                                                                                                                          | 61.5 s |
| `import --text desc.txt --dry-run` (the description pasted)                | the same 4 recipes and link; no source, so no chapters                                                                                                                                                                                                                                                                                                        | 59.8 s |
| Lagerstrom pasta salad `lo2pf0pYB9U --dry-run`                             | **one recipe**, 28/28 verbatim, 8 steps — the gate never asks the list                                                                                                                                                                                                                                                                                        | 26.0 s |
| Lagerstrom butter chicken `ESqF6CW91UQ --dry-run`                          | **one recipe**, 35/35, 7 steps; the list said CHICKEN + MARINADE, SAUCE, RICE, the one-dish question said one dish (warning: "… read … as parts of one dish — read as one")                                                                                                                                                                                   | 50.5 s |

- Steps 2–4 and 6–7 read the cached yt-dlp dumps through a scratch
  stand-in for the binary (one live fetch for the video, as the brief
  asked); the model calls were real.

**Gates.** `pnpm --filter recipe-editor typecheck` and `pnpm --filter
recipe-website exec tsc --noEmit` clean; `pnpm exec vitest run` **82 files
/ 1758 tests** passed (+27: `test/multiRecipe.test.ts` 23 — the gate, the
cut, the components and their rendering, the chapters and the start, the
four-recipe dry run through the yt-dlp mimic, the refusal, `--all` with
its commits and the one download, `--pick` with and without the link, a
taken slug, an earlier pick of the same video linked and another source's
not, one invented reading left out and the rest renumbered, `inspect`,
the paste with its commits, a partial pick, a sectioned single recipe
read once, the one-dish answer, `mergeReadings`, `parseRecipePicks`, the
schema; `mcp` +1 — `pick`, `all`, the refusal; `cliJson` +1 — the refusal,
`--all --pick`, `--dry-run --out`, `--pick 2`'s commit, `--all`'s exit 1;
`importRoute` +2 — `/api/import` 400 `usage` / 201 batch, a pre-36e
editor named). Playwright (build mode, heavy slot) `multi-recipe`,
`new-recipe` (with `new-recipe-duplicate-slug`), `ytdlp-import`,
`youtube-video`, `import-roundup`, `visual`, `accessibility`: **109 of
110** — the one failure `youtube-video`'s real-YouTube import (T54), twice;
with its wait at 30 s, `youtube-video.spec` **10 passed**. No baseline
moved: the picker only appears after a several-recipe import.

**Review round** (10 findings — M1–M4, L1–L6 — none blocking; fixed in one
commit, `dab4bca5`):

1. **M1 — The look shared the reading's `try`** (T55). A list call that
   timed out or answered bad JSON lost the whole import, and a slice's
   failure lost the slices already read. The look is now its own attempt
   under one 240 s deadline (`SPLIT_DEADLINE_MS`, with the caller's
   signal): a failed list, question or deadline becomes a note and the
   text is read as one, as before 36e; a slice's own failed call leaves
   that recipe out alone, like a discarded one; only the caller's abort
   ends the import.
2. **M2 — A loose heading match cut a recipe short** (T56). The
   decoration-tolerant pass ("STUFFING" in "STUFFING ✨") also matched an
   amount line ("2 cups fried shallots" for "FRIED SHALLOTS") and a
   timestamp line ("5:04 Stuffing" in a chapter list). It now accepts
   only a short line with no amount and no timestamp, and checks that the
   first ingredient follows the heading within a few lines.
3. **M3 — Positions shift between readings** (T57). Every import call
   reads the video again, and the first cut's renumbering after a leftout
   recipe meant `--pick 3` could name a different recipe the second time.
   Positions are the list's own now (gaps allowed, a gap refused with its
   reason), and picks may take a **name** instead — case and dashes aside,
   a name not found this time is refused with what was — which the
   refusal, `--help`, MCP and the skill all recommend.
4. **M4 — No way to force one recipe from the CLI, MCP or API.** `asOne` /
   `--as-one` reads a video or paste as one recipe, never split — the same
   path as the form's "Import as one recipe instead" (`mergeReadings`),
   split off so every surface has it.
5. **L1 — Re-running `--all` after a partial import repeated work and
   could collide.** A pick whose slug already holds the same source's
   recipe comes back `existing` and is skipped, so a second `--all` only
   imports what's missing; the picker unticks everything it tried and, for
   a taken slug, says so in the form's words and offers `<slug>-<channel>`;
   "Edit this one first" keeps the recipe's links.
6. **L2 — A component link could point at nothing.** The recipes a line
   names are created first, so a line links only to a recipe `imported` or
   `existing` in the batch, or to an earlier pick of the same source;
   otherwise it stays plain and says why in the warnings.
7. **L3 — `createIngredient` wrapped numbers inside a link's target**
   (T49; the bug predates 36e — a hand-typed link had it too). Now each
   `](…)` target is held aside while numbers are marked (a digit-free
   placeholder) and put back, so `[2 cups 7-layer dip](/recipe/7-layer-dip)`
   keeps its slug intact.
8. **L4 — A pasted reading could inherit a chapter's start.** No chapter
   (or a start of 0) now removes `t` rather than keeping one left over
   from an earlier, video-sourced reading.
9. **L5 — The HTTP backend could time out under undici first.** It now
   waits 285 s for `/api/import`, inside undici's own 300 s.
10. **L6 — `youtube-video.spec`'s first import could ask real YouTube**
    (T54). The test now sets `ytdlpPath` to a missing binary so it never
    asks YouTube on any machine; the 5 s wait for "yt-dlp not available"
    stands.

Gates after the review: `pnpm --filter recipe-editor typecheck` and `pnpm
--filter recipe-website exec tsc --noEmit` clean; `pnpm exec vitest run`
**82 files / 1771 tests** passed (one `cliJson` inventory test timed out
at 30 s under the machine's load and passed alone in 13.6 s — a flake, not
a regression). Playwright (build mode, heavy slot) `multi-recipe`,
`new-recipe` (with `new-recipe-duplicate-slug`), `ytdlp-import`,
`youtube-video`, `import-roundup`, `visual`, `accessibility`:
**115/115** passed (3.9 min); no baseline moved.

**Real check after the review** (qwen3:8b, `--text desc.txt --source
<the video>`, a fresh empty scratch repo): refused without `--all` /
`--pick`, naming all four and mentioning `--pick` by name or position,
`--dry-run` and `--as-one` (T57, M3, M4); `--pick "Green Bean Casserole"
--dry-run` alone came back with just the casserole, its shallot line
unlinked with "\"Fried Shallots\" is not imported — pick it too" (L2); picking
both names together linked it, same as before. One run (the first, while
another GPU client held VRAM) answered on the CPU at ~3.3 tokens/s and the
single-call reading hit the 180 s timeout outright — see T58; re-run once
`ollama ps` showed `100% GPU`, the picked calls took 7.1–11.3 s each, in
line with the warm-GPU numbers already measured above.

**Backlog** (rows in `backlog.md`): several JSON-LD Recipe nodes on a page;
re-reading after a several-recipe refusal; a start time on other hosts.
"Import as one" outside the form (M4) and the digit in a linked slug (L3,
T49) are both done.

## Close-out

### What landed (2026-10-15)

| PR   | Phase          | Merge      | Notes                                                                                                                        |
| ---- | -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| #230 | 36-plan        | `caf0ce0f` | Plan: D1–D8, Roger's text-mode addition.                                                                                     |
| #231 | 36a            | `1dffe095` | qwen3:8b passes the gate (100% recall, 100% grounded, median 20.2 s); one review round (line-by-line grounding, T11–T14).    |
| #232 | 36b            | `647381b4` | `--llm auto\|force\|off` on every import surface, the form toggle, the Tools card; one review round (T21, T22, the env pin). |
| #233 | 36c + 36-close | –          | Pasted-text import; one review round (9 findings, incl. the pre-existing JSON-LD XSS); this close-out.                       |
| #234 | 36d            | `672d225f` | A video URL's pinned comment and tags; the form says "give it the URL" (added by 39e).                                       |
| #235 | 36e            | `a7a989f0` | Several recipes in one video or paste: the picker, `--all` / `--pick`, linked components (added by 39e).                     |

Every M PR had a review agent before its first push. **No index, schema or
spec version changed: no reindex is needed.** Nothing new is stored in a
recipe (D5); the model's part lives in results, warnings and commit
messages.

### Traps found at close

- **The Pi stays off by design** (D1): with no `RECIPE_LLM_URL` its form
  shows "No local model configured" on both the toggle and the Paste text
  tab, `auto` does nothing, and `force` / `text` are `import_failed`. Not a
  bug to chase after a deploy.
- **A model in `editor/.env` reaches every Playwright run** unless the
  config pins it off (T18) — keep `webServer.env: {RECIPE_LLM_URL: ""}`
  when touching `playwright.config.ts`.
- **One GPU, one call at a time.** A scripted run that overlaps the
  workstation editor's own model call (a form import while a CLI batch
  runs) queues in Ollama; with `keep_alive` 10 m the second model would
  not fit 8 GB beside qwen3:8b (T5). Unload with `ollama stop` before
  switching models.
- **Route tests need only `apiContext` mocked** (T34) — the pattern for any
  later `/api/*` test.

### Backlog (new rows in `backlog.md`)

- Photo / recipe-card import with a vision model (qwen2.5vl), a follow-up
  to D8.
- The model's readings worth a deterministic fix: names in capitals (T25),
  "all in" read as prep time (T26), colon-less pasted sub-headings (T30), a
  `--source` line changing the reading (T23), and an unnumbered method
  left as one step (T24).

### Morning checklist (Roger)

1. Add `RECIPE_LLM_URL=http://localhost:11434` to
   `websites/recipe-website/editor/.env` (`RECIPE_LLM_MODEL` defaults to
   `qwen3:8b`).
2. **`pnpm workstation update`** from the repo root.
3. **No Pi deploy needed** for function — the Pi stays "No local model
   configured" — though deploying keeps the image current.
4. **No reindex.**

Then, on the workstation: Settings → Tools shows "Local model … reachable";
`/new-recipe` with a no-schema URL fills the form; "Paste text" with a
Lagerstrom description fills it with the sections and none of the links.
