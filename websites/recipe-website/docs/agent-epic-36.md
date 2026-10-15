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

**Now:** 36c in review (PR open); 36-close next.

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

## Roadmap

| Phase    | Branch               | Size | Status  | What                                                             |
| -------- | -------------------- | ---- | ------- | ---------------------------------------------------------------- |
| 36-plan  | `agent/36-plan`      | S    | ✅ #230 | This doc.                                                        |
| 36a      | `agent/36a-llm-core` | M    | ✅ #231 | D1, D2, D4, D6, D7: `pageText`, the client, the extractor, gate. |
| 36b      | `agent/36b-llm-wire` | M    | ✅ #232 | D3, D5: `applyLlm` in seats, form, CLI, API, MCP; Settings line. |
| 36c      | `agent/36c-llm-text` | M    | 🟡      | D8: text import mode in the form, CLI, API, MCP.                 |
| 36-close | `agent/36-close`     | S    | 📝      | Results, D12/SKILL.md updates, backlog, memory, Roger's steps.   |

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
