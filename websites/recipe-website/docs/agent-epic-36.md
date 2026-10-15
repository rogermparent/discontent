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

**Now:** 36-plan open; 36a (extractor core + measurement gate) next.

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

| Phase    | Branch               | Size | Status | What                                                             |
| -------- | -------------------- | ---- | ------ | ---------------------------------------------------------------- |
| 36-plan  | `agent/36-plan`      | S    | 🟡     | This doc.                                                        |
| 36a      | `agent/36a-llm-core` | M    | 📝     | D1, D2, D4, D6, D7: `pageText`, the client, the extractor, gate. |
| 36b      | `agent/36b-llm-wire` | M    | 📝     | D3, D5: `applyLlm` in seats, form, CLI, API, MCP; Settings line. |
| 36c      | `agent/36c-llm-text` | M    | 📝     | D8: text import mode in the form, CLI, API, MCP.                 |
| 36-close | `agent/36-close`     | S    | 📝     | Results, D12/SKILL.md updates, backlog, memory, Roger's steps.   |

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

(Filled in per phase.)

## Results

(Filled in per phase.)
