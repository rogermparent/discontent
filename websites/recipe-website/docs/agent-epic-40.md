# Epic 40 — Import polish, test and CI hygiene, quick wins, term clouds measured, Thanksgiving

> **This is the durable source of truth for epic 40.** Read it before
> touching the local model's context size (`num_ctx`), the placement
> wording, `RECIPE_LLM_API=openai`, resume-builder's or portfolio's
> Playwright setup and CI jobs, `shopping remove`, the start-time rebuild,
> the editor's Select and Checkbox controls, the term clouds (`/tags`, the
> tag autocomplete, ⌘K, `/make`), flaky specs, the accessibility specs, or
> dependency versions.
> The orchestrator updates the roadmap **Status** column and the **Now**
> line at every phase boundary; workers add their phase's **Results** and
> **Traps** under their own headings, and decision amendments numbered by
> phase letter (`Da1`, `Dc2`). Earlier epics are cited by number with a
> prefix (`39-Ta6`, `32-D3`). Background: `agent-epic-39.md` (import
> reliability, the index-version stamp, unattended Pi sync),
> `agent-epic-36.md` (the local model), `agent-epic-32.md` (32e, by-term
> keyed per term), `agent-epic-29.md` (Pi/workstation reindex ratio).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** 39f, 40a (#262), 40b (#261), 40d (no-go) and 40e (`tag:thanksgiving`
30 → 47) done; 40c and 40h in progress; 40f and 40g queued.

## Context

Roger, 2026-10-17, after epic 39's code closed: "All your recommendations
sound good. Implement and let's plan next steps after that." He picked four
directions — import/LLM polish, test/CI hygiene, the quick-wins bundle, and
Thanksgiving content — and chose to measure the term clouds before deciding
on them. F32 borrowing stays parked. Then: "Consider you'll be working on
this overnight — prioritize autonomy and add extra work if you expect to
finish the current queue quickly." So the epic runs unattended and carries
an extra queue (40f–40h) for the rest of the night.

## Decisions

### D1 — Nothing waits on Roger overnight

Where a phase meets a choice, it takes the conservative, reversible option,
records it in its Results as **"Roger to confirm"**, and keeps going. The
close-out lists every such item. GPU checks wait at most ~15 min for the
other GPU user to pause; otherwise they are recorded "pending GPU".

### D2 — 40e imports without a pre-approval round, under strict rules

A Thanksgiving candidate is imported only if it fills a named gap, comes
from a reputable recipe site with structured data (Sally's first), has no
near-duplicate in the repo, reads grounded in the dry run (no
`--allow-partial`), has an image, and gets the skill-v4 facets plus
`thanksgiving`. At most 12. Anything borderline goes on a "for Roger" list
here and is not imported. Every import is one commit (so `git revert`
undoes it), nothing is deleted, and homepage features stay as they are
(Halloween is current); the close-out carries a ready command to feature
`thanksgiving` after Oct 31.

### D3 — Term clouds: measure, then decide

40d measures the clouds' read and render cost and the fan-out of one tag
write in production mode against a scratch copy of the real repo. **Go**
if a cloud read costs more than ~100 ms on the workstation (≈ 0.4 s on the
Pi) or one tag write expires more than ~10 cloud-rendering pages: key the
clouds per term as 32e keyed by-term (a spec version bump; 39b's stamp
rebuilds the indexes by itself). Otherwise a recorded no-go with the
numbers and a reopen trigger.

### D4 — Dependency updates are patch and minor only

40h moves no major version (no Next major, no Tailwind or React line
change). One PR; a package whose update fails a gate is skipped and
recorded. Picking the change up on the workstation stays Roger's
(`pnpm workstation update`).

## Roadmap

| Phase    | Size | Branch             | Status | PR   | What                                                                                       |
| -------- | ---- | ------------------ | ------ | ---- | ------------------------------------------------------------------------------------------ |
| 40a      | S–M  | `agent/40a-llm`    | ✅     | #262 | Context sized to the input, honest placement wording, `/v1` against Ollama, batch names.   |
| 40b      | S–M  | `agent/40b-ci`     | ✅     | #261 | resume-builder's 7 red specs, its path-filtered CI job, portfolio's prod-build heap.       |
| 40c      | S–M  | `agent/40c-quick`  | 🟡     |      | `shopping remove --for`, a bounded start-rebuild retry, Select/Checkbox on Radix `ui/*`.   |
| 40d      | S/M  | `agent/40d-clouds` | ✅     | #263 | D3: measure the term clouds, then go (key per term) or a recorded no-go.                   |
| 40e      | S–M  | (content repo)     | ✅     | —    | D2: Thanksgiving gaps — gravy, greens, mac and cheese, cornbread, leftovers, drinks.       |
| 40f      | S–M  | `agent/40f-flakes` | 📝     |      | Extra queue: flaky specs from the last ~50 CI runs, fixed at the root; README's test part. |
| 40g      | S–M  | `agent/40g-a11y`   | 📝     |      | Extra queue: axe specs for `/shopping`, `/jobs`, `/git`, `/make`, Export, the term form.   |
| 40h      | M    | `agent/40h-deps`   | 🟡     |      | Extra queue: D4, patch and minor dependency updates.                                       |
| 40-close | S    | `agent/40-close`   | 📝     |      | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                          |

Ordering, in waves: 40a ∥ 40b (editor llm vs resume-builder/portfolio/CI,
disjoint), with 40e's research and dry run in the orchestrator alongside;
then 40c ∥ 40d; 40e's real apply once its dry run's diff is reviewed; then
the extra queue 40f → 40g → 40h, two at a time while the night lasts (each
independent; anything not started stays in the backlog); then 40-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its own
  PR off fresh `origin/main`, opened ready after a local review. A read-only
  review agent reviews each M/L PR. Merge when every check that ran is green
  and the PR is `CLEAN`; merge commit; delete the branch. The next PR merges
  main before it merges. At most two PRs in CI at once.
- Machine memory: typecheck, vitest and builds go through
  `orchestrator/heavy.sh`, Playwright through `heavy-pw.sh` (the same
  machine-wide slot the other overnight session uses), at most two heavy
  workers at once. GPU real checks go through the orchestrator, which
  pauses the other GPU user first. No real model or API call in tests or CI.
- Never deploy, never push the content repo, never `pnpm workstation
update`, never commit `editor/content`.

## Phases

### 40a — Import / LLM polish (S–M)

- A smaller `num_ctx` for short inputs (39-Ta6): extraction picks a context
  from the input's estimated tokens plus the output budget, clamped to
  4096…`LLM_NUM_CTX`, in steps so Ollama doesn't reload for every page
  size. The reading cache key and the context: kept apart, or why not.
- Placement wording: a partial GPU share with nothing else holding VRAM
  beyond the idle baseline says the model doesn't fit beside the desktop's
  ~N GB at this context, not "another program holds VRAM".
- `RECIPE_LLM_API=openai` against Ollama's `/v1`: detect it and use the
  native unload and placement, or keep it a documented trap (36/38 Te7).
- `form-url` batch rows on `/jobs/<id>` show dish names (37 backlog, 38b).
- GPU real check through the orchestrator: one typical page import, the
  context chosen and the GPU share.

### 40b — Test / CI hygiene (S–M)

- resume-builder's 7 red specs (39-Te2): per spec, regression (fix the
  app) or stale spec (fix the spec), each verdict recorded.
- A path-filtered CI job for resume-builder's Playwright suite
  (`websites/resume-builder/**`, `packages/**`, the lockfile).
- Portfolio's production build passing ~4 GB of heap: a fix, or a scoped
  `NODE_OPTIONS` in its e2e script.

### 40c — Quick wins (S–M)

- `shopping remove --for <slug>` on the CLI and as a field of MCP
  `shopping_remove` (39-Dc3); tool counts stay 57/43.
- A bounded retry for a failed start-time rebuild (39b-L5): a few attempts
  over ~20 min, stopping on success or a newer HEAD move, never a tight
  `busy` loop.
- The editor's native Select and Checkbox controls onto the Radix `ui/*`
  primitives, keeping form submission by `name`.

### 40d — Term clouds: measure, then decide (S, M if go)

- D3. `/tags`, the tag autocomplete route, the ⌘K data and `/make`: read
  and render cost; one tag write's invalidation fan-out; scaled to the Pi
  by epic 29's ratio.

### 40e — Thanksgiving content round (S–M, real repo)

- D2. Gaps in `tag:thanksgiving` (30 recipes): gravy; Brussels sprouts or
  green sides beyond the casserole; mac and cheese; cornbread or cornbread
  dressing; make-ahead mashed potatoes; leftover-turkey dishes beyond the
  pot pie; 2–3 Thanksgiving drinks (cider or cranberry). 8–12 candidates,
  Sally's first, polite scraping (30-D5), scratch-clone dry run reviewed
  before the real apply.

### 40f — Flake hunt (S–M, extra queue)

- Tests that failed and then passed on retry in the last ~50 CI runs, fixed
  at the root (waits, explicit slugs, isolation), never by raising
  timeouts; each fix passes `--repeat-each 5` in build mode. README's test
  section checked against Playwright.

### 40g — Accessibility coverage (S–M, extra queue)

- The axe specs extended to `/shopping`, `/jobs` and a job page, `/git`,
  `/make`, the Export settings page and the term edit form; real
  violations fixed.

### 40h — Patch / minor dependency updates (M, extra queue)

- D4. One PR, the lockfile regenerated through the heavy slot, full CI as
  the gate, the lockfile diff reviewed for unexpected majors.

### 40-close (S)

- Close-out (with the "Roger to confirm" list and 40e's review list on
  top), the CLAUDE.md "Durable docs" bullet, backlog rows, memory, Roger's
  steps.

## Verification

- Every PR: `pnpm --filter recipe-editor typecheck`, `pnpm --filter
recipe-website exec tsc --noEmit`, `pnpm exec vitest run` (with counts),
  the touched Playwright specs by exact name in build mode — all through
  the heavy slot — then CI green and `CLEAN`.
- 40a: unit tests for the context choice (short → 4096, long → full, steps
  stable), the placement wording (baseline vs another holder), the `/v1`
  path (fetch stubbed); a real import on the GPU through the orchestrator.
- 40b: resume-builder's suite green locally and in its new CI job (shown
  running on the PR); portfolio's production build completes in the slot.
- 40c: CLI and MCP `--for` tests (tool count unchanged, the curator-skill
  test); retry tests on a frozen clock; form-submission and accessibility
  specs green, moved baselines reviewed.
- 40d: measurements and the go/no-go here; if go, unit tests per keyed
  read and a spec version bump.
- 40e: the import rules checked per candidate, rejects with reasons; the
  dry run reviewed before the real apply; `tag:thanksgiving` before and
  after; pages checked on the workstation.
- 40f: each fixed spec passes `--repeat-each 5` in build mode.
- 40g: the new axe checks green.
- 40h: the full suite green locally and on CI (all 14 checks).

## Traps

### 40a

- **Ta1 — Ollama reloads the model whenever `num_ctx` changes.** Two
  imports in a row at different steps (a short paste at 4 096, then a
  long page at 8 192) pay a load (5–9 s) for the second. Da1 keeps the
  steps few, and one import's calls (list, one-dish question, slices, the
  single reading) all ask the same context; `scripts/measure-llm-import.ts`
  still warms up at `LLM_NUM_CTX`, so its first page's time includes a
  reload when that page lands on a smaller step. A batch can reload
  between its items too: each item's `applyLlm` (a roundup's items, a
  form's picks read again) picks its own step from its own text.
- **Ta2 — a job log line is capped (37-D2), the result's warning is not.**
  The `/v1` warning is too long for a log line: the log gets a short form
  ("Ollama 0.40.5 behind /v1: no num_ctx, …"), the result the whole
  sentence. A test that matches the log's `msg` against the surfaced text
  fails on the "…".
- **Ta3 — the placement check reads the real GPU for a loopback URL.**
  Tests use `http://localhost:11434` and `127.0.0.1` stand-ins, so
  `test/setupTests.js` points `RECIPE_DRM_DIR` at a directory that does not
  exist ("no counters", the old wording); a test that wants a reading
  writes its own `card0/device/mem_info_vram_*` files. The Playwright
  stand-in model answers no `/api/ps`, so the editor under test never gets
  that far.

### 40b

- **Tb1 — resume-builder's `e2e-start` never built.** Its
  `playwright.config.ts` ran `pnpm start:test` alone in `PLAYWRIGHT_BUILD`
  mode, the defect the recipe, portfolio and demo configs fixed together
  long ago ("leaving two of three is how it comes back" — the fourth was
  missed). It served whatever `.next` was on disk, or failed on a clean
  checkout. Now `pnpm build && pnpm start:test`, no server reuse in build
  mode.
- **Tb2 — a git-log assertion straight after a Submit click races the
  server action.** git.spec's "accumulate" test read the log ~0.7 s in and
  found no update commit at all. Wait for the redirect URL (the commit lands
  before `redirect()`), then read the log.
- **Tb3 — pinning the workspace root silences Next's lockfile warning, and
  nothing else.** From a worktree Next infers the main checkout as the root;
  `outputFileTracingRoot` / `turbopack.root` fix that, but portfolio's
  webpack build still ran out of heap at the same ~4 GB. The heap is
  webpack's own (its module graph lives in V8); Turbopack's Rust compiler
  keeps it out of V8, as 0424026c found for the recipe editor.

### 40c

### 40d

- **Td1 — An editor build pointed at a fresh clone times out on the term
  pages.** `CONTENT_DIRECTORY=<clone> pnpm build` prerenders every
  `/tags/[tag]` that `generateTagStaticParams` lists (287). On a fresh clone
  every page passed Next's 60 s limit three times and the build exited
  ("Export encountered an error on /(recipes)/tags/[tag]/page"), small terms
  like `bellini` included. The likely cause is that a clone has no
  `transformed-images/`, so every card's image is resized during the build,
  but that is not confirmed. To measure, build against an empty content
  directory instead: every route then builds as `ƒ` and term pages render on
  demand. Serve the clone with `CONTENT_DIRECTORY`, and request each page
  once before timing it, so the image resizes are done first.
- **Td2 — `NEXT_PRIVATE_DEBUG_CACHE=1` on `next start` logs every
  `revalidateTag`.** `revalidatePath` shows up in the same log as
  `_N_T_<path>`. This lets you count a write's fan-out without editing code.
  The log entry spans several lines, so use `grep -A`.

### 40e

### 40f

### 40g

### 40h

- **`pnpm outdated`'s "wanted" column is useless here**: it showed
  wanted = current for every package (vitest 4.0.18 "wanted" while 4.1.12
  was in range). Compute same-major / same-minor targets from the
  registry instead (`tmp/40/40h/latest.js`).
- **`pnpm update -r` sorts each `package.json`'s dependency keys** and
  does not touch `peerDependencies`: the `next` peer pins in
  `component-library` and `next-static-image` had to move by hand.
- **Locked auto-installed peers survive an update.** dashjs 5.1.1 → 5.2.1
  (via react-player) wants `@svta/cml-utils@1.5.0`, but the lockfile's
  1.0.1 peer stayed — unmet-peer warnings that neither `pnpm update
react-player` nor `--depth Infinity '@svta/*'` cleared. Fix: delete the
  DASH subtree's lockfile entries and the importer's `react-player` entry,
  then `pnpm install` (`tmp/40/40h/drop-svta.cjs`).
- **simple-git ≥ 3.34 refuses our git calls**: 3.34 blocks
  `core.sshCommand` without `allowUnsafeSshCommand` (39b's keepalives),
  3.36 blocks the `EDITOR` env without `allowUnsafeEditor` (revert, pull,
  sync — 31 tests). 3.33.0 is the newest that passes.
- **zod ≥ 4.4.2 changes `z.preprocess` optionality** ("defer optionality
  to the inner schema", zod#5929): the term, group-scale and drink form
  parsers fail with "expected nonoptional, received undefined".
- **markdown-to-jsx 9.10** drops the text after a `<Multiplyable />` in a
  list item ("1/2 cup sugar" → "1/2"): `flattenMarkdown`, so the search
  index text, would lose words.

## Results

### 40a — Import / LLM polish

Branch `agent/40a-llm`. **Reindex needed: no** (nothing in the content
repository changes). **Deploy:** the workstation's next `pnpm workstation
update` picks it up; the Pi (Claude API) gets nothing new but the code.

**Built.**

- **A context sized to the input** (`llm/client.ts`, `extractRecipe.ts`,
  `importWithLlm.ts`, `splitRecipes.ts`). `extractionContext(text)` counts
  the extractor's system prompt and the user prompt around the capped text
  at 3 characters a token, adds room for the answer, and rounds up to a
  step of `LLM_CONTEXT_STEPS` = 4 096 / 8 192 / 12 288 (Da1). `applyLlm`
  picks it once from the whole text and hands it to every call of that
  reading — the several-recipe list, the one-dish question, each slice
  and the single reading — so one import never reloads the model; a
  direct `extractRecipeWithLlm` call without one picks its own. The
  extraction step records `numCtx` beside its token counts (Ollama only).
  The 36a corpus (34 saved pages, `pageText` as an import reads them)
  lands 21 at 4 096 and 13 at 8 192, none at 12 288: the longest page
  text is 8.6 k characters, since `pageText` keeps the recipe card. Only
  a long paste or a page past ~12.7 k characters asks for 12 288.
- **Honest placement wording** (`checkPlacement`). For a model on this
  machine (a loopback `RECIPE_LLM_URL`) that is not wholly on the GPU, the
  amdgpu counters (`/sys/class/drm/card*/device/mem_info_vram_used` /
  `_total`, the card with the most VRAM; `readVram`) give the VRAM others
  hold — used less the model's `size_vram`. More than 1.2 GB is
  "another program holds ~3.0 GB of VRAM … run "ollama stop qwen3:8b" once
  it frees". Up to that, the card decides whether a reload would help:
  if it holds the whole model beside the others with 1 GB to spare
  (`RELOAD_HEADROOM_BYTES`), the model was loaded while VRAM was held —
  "it was loaded while VRAM was held, and ~8.1 GB is free now; "ollama
  stop qwen3:8b" reloads it on the GPU"; if not, "it likely does not fit
  beside the desktop's ~0.8 GB of VRAM at num_ctx 12288 … "ollama stop" is
  unlikely to help". The old wording, word for word, for no counters
  (another vendor, a container), a card that cannot be the model's (less
  VRAM used, or in all, than the model's `size_vram` — an AMD iGPU beside
  an NVIDIA card), or a model on another host: the counters are read only
  for a loopback `RECIPE_LLM_URL`, so a LAN address or hostname, even this
  machine's, gets the old wording. The step's warning carries `numCtx`,
  `vramUsed`, `vramTotal`, `others` and `cause` (Da2).
- **A context nearly full is a warning** (review). A call whose
  `prompt_eval_count + eval_count` reaches 95% of its `num_ctx` logs an
  `llm.context` warning and surfaces "local model qwen3:8b used 4000 of
  its 4096-token context — the start of the text or the end of the answer
  may have been cut; check the reading" (Ollama only).
- **`RECIPE_LLM_API=openai` against Ollama's `/v1`** stays a trap, now
  said (Da5): `ollamaBehindOpenAi` asks `GET <server>/api/version` (the
  URL less a trailing `/v1`) once per server per process — a server that
  answers (2xx, or a 4xx: not Ollama) is remembered; no answer (a
  timeout, a refused connection, a 5xx) is remembered for 5 min
  (`OLLAMA_PROBE_RETRY_MS`), so a hung server costs one 2 s wait per five
  minutes; a probe the job's own abort cut short is not remembered. When Ollama
  answers, Settings → Tools and `/jobs` show a **Warning** row, and every
  import's job logs one `llm.api` warning and surfaces it in its result:
  through `/v1` no `num_ctx` is sent (Ollama's own default context applies,
  and may cut a long page), and the unload, reload and placement check do
  not run; "set RECIPE_LLM_API=ollama". Nothing else changes for an
  OpenAI-style server.
- **`form-url` batch rows on `/jobs/<id>` — verified, no change.**
  `resultRows` (`jobs/timeline.ts`) reads `name`, else `recipe.name`, else
  "Recipe n", so a `form-url` batch's `SplitReading` rows show their dish
  names; `jobSurfaces.test`'s `resultRows` case covers both shapes and
  `jobs.spec`'s picker test reads the four names off the page (as 38b
  found).

**Decisions.**

- **Da1 — the ladder and the estimate.** Steps 4 096 / 8 192 / 12 288
  (`LLM_NUM_CTX`, unchanged): `ollama ps` lists qwen3:8b at 5.6 / 6.2 /
  7.2 GB — the two smaller steps run 100% on the RX 6600 beside the idle
  desktop (the GPU check below), the largest spilled 10% (39-Ta6). Tokens are
  ASCII characters / 3 (conservative: qwen counts English at ~4), and,
  since the review, every other code point as a token of its own (Chinese
  runs ~1–1.5 characters a token: a 2 500-character Chinese paste asks
  8 192, not 4 096; past ~6 k such characters the 24 k character cap no
  longer keeps it inside 12 288, which the full-context warning names);
  the answer's
  room is 512 + 1.5 × the text's tokens, at most 3 072 (the longest
  reading measured is ~1 700 output tokens, 36a's sticky buns). So up to
  ~3.2 k characters of text asks 4 096, up to ~12.7 k asks 8 192, and the
  24 k cap's worst case (~8 000 + ~900 prompt + 3 072) still fits 12 288.
  Few steps rather than an exact size, because Ollama reloads on every
  `num_ctx` change (Ta1). The Claude API and an OpenAI-style server take
  no `num_ctx`; `claudeApi.test` is unchanged and green.
- **Da2 — the desktop baseline.** VRAM held by others ≤ 1.2 GB
  (`DESKTOP_VRAM_BYTES`; Sway idles at ~0.8 GB) is "the desktop"; read
  only for a loopback model URL, since a remote model's GPU is not this
  machine's; `RECIPE_DRM_DIR` overrides the sysfs root (the tests).
  _Amended in review:_ whether a reload would help is `total − others −
size ≥ 1 GB`. The review suggested free VRAM ≥ 2 × the part on the
  CPU; that fails D6's own case (a model loaded at 2% while a
  transcription held the card: ~7 GB on the CPU, ~8 GB free). Free VRAM
  less the CPU part equals `total − others − size` whatever the share,
  so the question is only whether the model fits beside the others now,
  and 1 GB is above 39-Ta6's 0.57 GB that did not fit.
- **Da3 — D6's reload is unchanged.** Skipping a reload "that cannot
  help" (free VRAM smaller than the part on the CPU) looked cheap, but
  Ollama's size estimate and the driver's counters disagree: in 39-Ta6's
  numbers the driver shows ~1.3 GB free while 0.7 GB would not fit, so
  the test would allow the reload in exactly the desktop case, and any
  margin large enough to stop it would also stop D6's real case (the
  hook paused Archilyzer: the model at 2%, ~7 GB to move, ~7.6 GB free).
  The retry's reading is still the one surfaced. (The wording's `stale`
  test, Da2, is a different question with its own margin; it does not
  gate the reload.)
- **Da4 — the reading cache and the context.** `numCtx` is not in the
  reading key: it is a function of the text, which is (with the prompts,
  the model and the mode), and a reading made at a larger context is no
  worse. No `READING_CODE_VERSION` bump — nothing that turns answers into
  a reading changed. The vision transcript key already holds
  `VISION_NUM_CTX` (a fixed 4 096, unchanged), so it is unchanged too.
- **Da5 — `/v1`: warn, don't take over.** Running the native unload,
  reload and placement through `/api/*` when Ollama answers behind `/v1`
  would act on a server configured as OpenAI-style (possibly behind a
  proxy that forwards only `/v1`); naming the setting to change is the
  reversible half. _Roger to confirm_ (or ask for the native path).

**Gates** (all through the heavy slot). `pnpm --filter recipe-editor
typecheck` and `pnpm --filter recipe-website exec tsc --noEmit` clean;
`pnpm exec vitest run` **112 files, 2313 tests passed** (new
`test/llmContext.test.ts`, 18 tests then, 26 after the review: the ladder, short → 4 096 / long →
12 288 / steady across nearby sizes, the num_ctx sent and recorded, none
to an OpenAI-style server; `readVram`, the cause and the three wordings,
in an import with fake counters; the `/v1` probe, its cache and the
job warning. `multiRecipe.test`'s T23 case now checks all six calls ask
one context; `importWithLlm.test`'s OpenAI case expects the probe).
Playwright, build mode, `jobs.spec` + `settings-nav.spec`: **19 passed**.
Review round (as new commits): recipe-editor typecheck clean; the
affected files (`llmContext`, `importWithLlm`, `multiRecipe`,
`llmExtract`, `claudeApi`, `queue`, `jobs`, `photoImport`,
`importRoute`) **9 files, 312 tests passed**; CI runs the full suite.

**GPU real check** (2026-10-17 ~05:19 UTC, orchestrator-cleared: parakeet
paused, Ollama idle, 0.4 GB VRAM in use before). `real_check.sh`: two
JSON-LD-less Wikibooks pages saved in 36a, served from scratch on
127.0.0.1, `recipes import <url> --dry-run --llm force --fresh` into an
empty scratch repo, one after the other; `ollama stop qwen3:8b` after.

| Page                           | text chars | `numCtx` | `ollama ps`          | VRAM used (card) | llm.extract                                                         | grounded        | wall   |
| ------------------------------ | ---------- | -------- | -------------------- | ---------------- | ------------------------------------------------------------------- | --------------- | ------ |
| Chocolate_Chip_Cookies_I       | 5 117      | 8 192    | 6.2 GB, **100% GPU** | 6.49 GB / 8.57   | 24.1 s (load 4.0 s), 1 956 prompt tok @ 263/s, 483 out @ 38.3 tok/s | 11/11, verbatim | 25.9 s |
| Hummus_I                       | 2 115      | 4 096    | 5.6 GB, **100% GPU** | 6.01 GB / 8.57   | 15.9 s (load 5.7 s), 1 272 prompt tok @ 709/s, 333 out @ 40.5 tok/s | 9/9, verbatim   | 19.6 s |
| _39a, for comparison (12 288)_ | –          | 12 288   | 7.2 GB, 89% GPU      | –                | 20.4 s (load 9.5 s)                                                 | 8/8             | –      |

- Both steps land wholly on the GPU; no placement warning. The prompt
  counts confirm the estimate is conservative: 5 117 characters of text
  plus the prompt measured 1 956 tokens against the estimate's ~2 600.
- The second run reloaded the model (load 5.7 s with the model already
  warm at 8 192): Ta1, measured.
- Tonight the desktop held ~0.4 GB, not 39-Ta6's ~0.8 GB, so 12 288 was
  not re-measured; the desktop wording is covered by the unit tests only.
- The cookies page's dry run fetched its one picture from
  thumb.wikimedia.org (one request); nothing else left the machine.

**Roger to confirm.** Da5 (warn only, not the native path); the 1.2 GB
desktop baseline (Da2).

### 40b — Test / CI hygiene

**Reindex needed: no. Deploy: none** (resume-builder and portfolio aren't
deployed from here; the recipe apps are untouched).

**resume-builder's 7 red specs.** History first: the specs came in with
#114 (a750c96b, Cypress, alongside a rewrite of the app) and were ported to
Playwright in 835cb81a. `git log -S` finds no version of the view page that
rendered the resume's own `company` (only each experience entry's), no
Cancel link ever in `src/`, and the update action has written
`Update resume: <finalSlug>` since #114, with the form pre-filling the
current slug. So none of the 7 is a regression in the strict sense — they
asserted things the app never did. Verdict per spec:

| Spec (test)                                        | Fails on                                         | Verdict                                                                                          | Fix                                                                                             |
| -------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| view — "should display job title and company"      | `Acme Corp` not on the view page                 | App gap: the list and the edit page name the company, the view page didn't (Db1)                 | View page: a screen-only "Resume for **Acme Corp**" line                                        |
| create — "required fields only"                    | `Acme Corp` after create                         | Same as above                                                                                    | Same                                                                                            |
| create — "create then immediate edit"              | `Quick Edit Co` after the edit                   | Same as above                                                                                    | Same                                                                                            |
| update — "should update company field"             | `New Company` after the edit                     | Same as above                                                                                    | Same                                                                                            |
| update — "cancel edit and return to view page"     | no Cancel link on the edit page                  | App gap (Db2)                                                                                    | Edit form: a Cancel link back to `/resume/<slug>`; the spec's URL check anchored (`…engineer$`) |
| git — "commit when updating a resume"              | `Updated Corp` (as above), then `updated-corp-…` | Visible text: app gap above. Commit slug: **stale spec** — an edit keeps its slug (Db3)          | Expect `Update resume: update-corp-engineer`                                                    |
| git — "accumulate commits for multiple operations" | no update commit in the log                      | **Stale spec**: it read the log before the server action finished (Tb2), and expected a new slug | Wait for each redirect; expect `Update resume: first-corp-developer`                            |

Also: the edit route's `form.tsx`, an unused duplicate of
`EditResumeForm.tsx` since 4d249359, deleted.

**The CI job.** `Resume builder` in `playwright.yml`: a `resume` output on
the `Changes` filter (`*shared` — `packages/**`, the lockfile, the
workspace files and CI plumbing — plus `websites/resume-builder/**`; docs and
READMEs excluded as for the others), the same Playwright container and
image check as portfolio's job, the git identity git.spec needs, production
mode (`PLAYWRIGHT_BUILD=1`, Db4), a 20-minute timeout, and the HTML report
plus `test-results` (traces on the first retry) uploaded on failure. No
`AUTH_SECRET` of its own: the app has no sign-in. README's stale Cypress
section rewritten for Playwright.

**Portfolio's production build.** Measured inside the heavy slot with
`/usr/bin/time -v` (largest process's peak RSS) and a 2 s sampler of the
summed `next` processes, from a worktree, `.next` cleared each time:

| Build                                   | Result                                  | Wall | Peak RSS (largest / summed) |
| --------------------------------------- | --------------------------------------- | ---- | --------------------------- |
| `next build --webpack` (main as it was) | FATAL heap OOM at ~4,030 MB, in compile | 4:23 | 5,110 MB / 5,051 MB         |
| `--webpack`, workspace root pinned      | FATAL heap OOM, same place              | 2:17 | 5,141 MB / 5,229 MB         |
| `next build` (Turbopack), root pinned   | ✅ compiled in 6.8 s, 17 routes         | 0:17 | 1,191 MB / 1,452 MB         |
| for scale: resume-builder `--webpack`   | ✅ compiled in 37.8 s                   | 1:00 | 1,845 MB                    |

The fix is the cause's fix, not a `NODE_OPTIONS` raise (Db5): portfolio's
`build` is now `next build` (Turbopack, Next 16's default, what `next dev` —
and so portfolio's CI job — already runs), the same move 0424026c made for
the recipe editor and export. `getContentDirectory`'s Turbopack guard from
that commit already covers portfolio. Both sites' `next.config.mjs` also pin
`outputFileTracingRoot` / `turbopack.root` to the workspace root, which
silences the worktree warning (Tb3) but isn't what fixed the heap. Which
module makes webpack's graph that large wasn't isolated: four-minute,
5 GB experiments on a shared machine for a bundler the site no longer uses.

**Decisions.**

- **Db1** — The view page names the company on screen only
  (`print:hidden`): the printed resume goes _to_ that company and stays as
  it was. **Roger to confirm** (the alternative is dropping the company
  assertions from the four specs).
- **Db2** — The edit form gets a Cancel link (a plain link to the view
  page; nothing is saved). Recipe and portfolio forms have none; this is
  the resume app's own. **Roger to confirm.**
- **Db3** — An edit keeps the resume's slug unless the Slug field is
  changed (the form pre-fills it; update.spec's "slug pre-populated" and
  "update slug and redirect" assert exactly that), so the git specs were
  wrong, not the app.
- **Db4** — The CI job runs production mode only, one cell: the suite is
  35 tests, runner concurrency is the budget, and production mode is the
  build that would ship (and has no per-route compile waits). Dev mode
  stays a local `e2e-dev`.
- **Db5** — Portfolio builds with Turbopack rather than a bigger V8 heap.
  `websites/portfolio/export` still says `--webpack`; it wasn't measured
  (out of the backlog row's scope) and is left alone.

**Gates.**

- resume-builder Playwright, production mode (`next build` + `next start`
  on 3010), heavy slot: **28 passed / 7 failed** before (the same 7 as
  39e; the `e2e` project has 35 tests), **35/35** after.
- Portfolio: production build ✅ (above); Playwright `e2e` + `mobile`
  against that Turbopack production build, heavy slot: **90/90** (visual
  baselines unchanged).
- `pnpm --filter recipe-editor typecheck` ✅;
  `pnpm --filter recipe-website exec tsc --noEmit` ✅;
  `pnpm exec vitest run`: **2295/2295** (111 files), all in the heavy slot.
- CI: the new `Resume builder` job runs on this PR (it touches
  `websites/resume-builder/**`).

### 40c — Quick wins

### 40d — Term clouds

**Decision: no-go** (D3). No cloud read comes near 100 ms on the workstation.
The worst is 36 ms, and only on the first request after a start. One tag
write does expire more than 10 pages that render a cloud, but keying the
clouds per term would not reduce that number (Dd1). The PR is docs plus the
measuring script. Nothing in the engine changed, no spec was bumped, and no
reindex is needed.

**Method.** Measured 2026-10-17 on a scratch clone of `recipe-content` at
`5ff24c2b`: 795 recipes, 1 group, 135 term records, 219 terms in the
vocabulary. The clone was reindexed with this branch's CLI (1.2 s) and
deleted afterwards. The real repo was never written.

- **Read cost.** `editor/scripts/measure-term-clouds.ts` (new) runs with
  `NODE_ENV=production` and `RUNS=9`, twice, at load averages 3–10. For each
  cloud it runs the same aggregate reads and the same pure join that
  `readTermPage.ts` does, without `unstable_cache`, so it measures a cache
  miss:
  - **cold**: a fresh process per run, so the time includes opening the
    LMDB environments (the first request after a start);
  - **warm**: environments already open (a running server's miss after a
    write).
- **Render cost.** A production `next build` (built against an empty
  content directory, Td1), then `next start` on :3029 serving the clone with
  `INSTANCE_EVENTS=off` and a scratch settings and jobs directory. Each
  page was requested once to do the image resizes, then the server was
  restarted with `.next/cache/fetch-cache` emptied. Each route was then
  timed with `curl -w %{time_total}`: one first request and 7 warm, both
  before and after the write.
- **Fan-out.** The write went through that server's API
  (`RECIPE_API_URL=http://localhost:3029 recipes term assign american --add
turkey-gravy`), so its revalidation ran inside the server. Every
  `revalidateTag` it fired was logged (Td2). So the tags were **counted from
  an instrumented run**. Which pages read those tags was **taken from the
  code**.

**The clouds.** All of them are read through `createCachedAggregateRead`,
which is `unstable_cache` plus `React.cache`. Nothing uses `"use cache"`.
Every editor route built as `ƒ` (100 of 100 in this build's route table),
because the root layout calls `auth()`, so a page has no Full Route Cache
entry. What expires is the shared
data entries.

| Cloud (function)                       | Reads (cache tags)                                                                                               | Rendered on                                                                                                                                   | Bytes (JSON) |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -----------: |
| `readTagVocabulary`                    | `aggregate:recipes:tags`, `aggregate:groups:tags`, `aggregate:tag-terms:tree`                                    | `/tags` (list), `/new-recipe`; also the homepage's chips, but only on a site with no facets (not the real one)                                |       12,256 |
| `readTagBoard`                         | `aggregate:recipes:by-tag:whole`, `aggregate:groups:by-tag:whole`, the tree (all also tagged with the catch-all) | `/tags` (board), `/` (facets, intent tiles, Coming up: the same maps through `React.cache`)                                                   |       11,929 |
| `readTagOptions`                       | the two `tags` clouds and the tree                                                                               | `/make` (editor and export)                                                                                                                   |       14,219 |
| `readSearchTerms`                      | the two `tags` clouds and the tree                                                                               | `/search/terms`. The browser builds autocomplete, ⌘K, the tag rail, `BrowseChips` and the `tag:` expansion from it, on every page with search |       16,536 |
| `readTagLabels`                        | the two `tags` clouds and the tree (through `readTagVocabulary`)                                                 | `/new-recipe`, `/group/new`, `/recipe/<slug>/edit` and `/copy` (795 each), `/group/<slug>/edit` (1)                                           |        3,050 |
| `readTermPageSlugs`                    | the two `tags` clouds and the tree                                                                               | `generateStaticParams` for `/tags/[tag]` only: build time, not a render                                                                       |            — |
| _not clouds_ (checked, for the record) | the tree alone, or `by-tag:key:<k>`                                                                              | term pages (34a), the term edit and new forms (parent picker = the tree), `/drinks`                                                           |            — |

The parts behind them: `recipes:tags` is 11,815 B, `groups:tags` 52 B, the
tree 10,344 B, and the whole `recipes:by-tag` map **603 KB** (219 records,
assembled; `drink` alone is 40,761 B).

**Read cost** (ms, min / median of 9; two runs, the range shown when they
differ):

| Read                     |            cold min / med |        warm min / med |
| ------------------------ | ------------------------: | --------------------: |
| `recipes:tags`           |         3.9–4.1 / 4.2–4.5 | 0.15–0.20 / 0.24–0.30 |
| `tag-terms:tree`         |         4.1–4.2 / 4.3–4.6 | 0.22–0.26 / 0.23–0.33 |
| `recipes:by-tag` (whole) |     13.4–14.0 / 14.1–15.2 |     3.3–3.6 / 5.6–5.8 |
| `recipes:by-tag[drink]`  |         4.3–4.6 / 4.6–4.9 | 0.17–0.18 / 0.20–0.27 |
| `readTagVocabulary`      |        6.4–6.8 / 7.6–11.3 |     1.2–1.6 / 1.2–2.0 |
| **`readTagBoard`**       | **32.9–36.0 / 36.6–42.0** | **5.2–5.6 / 7.7–8.2** |
| `readTagLabels`          |             6.5–6.7 / 7.0 |     0.4–0.6 / 0.5–0.7 |
| `readTagOptions`         |        6.9–7.0 / 7.3–14.3 |     1.0–1.2 / 1.3–1.4 |
| `readSearchTerms`        |       7.0–13.0 / 7.4–15.1 |     0.5–1.2 / 0.6–3.1 |

**Render cost** (ms, production `next start`, `curl` total, warm = median
of 7 (min)):

| Route                   | Cloud read               | first after start | warm before write | first after write |  warm after |   Bytes |
| ----------------------- | ------------------------ | ----------------: | ----------------: | ----------------: | ----------: | ------: |
| `/`                     | board                    |      414 (note a) |       52.6 (40.7) |              60.2 | 42.0 (39.1) | 199,778 |
| `/tags`                 | vocabulary + board       |              62.0 |       37.1 (36.0) |              39.3 | 39.5 (36.6) | 271,713 |
| `/make`                 | options                  |             100.3 |       19.6 (16.8) |              17.8 | 17.9 (16.0) |  80,272 |
| `/search/terms`         | search terms             |              13.4 |         4.1 (3.6) |               4.8 |   3.4 (3.2) |  16,536 |
| `/tags/drink` (control) | none (34a: per-key rows) |             146.3 |       91.1 (78.7) |              76.8 | 76.5 (70.8) | 613,657 |
| `/recipes` (control)    | none                     |              37.5 |       29.8 (27.2) |              39.3 | 29.0 (27.4) | 193,478 |

(a) `/` was the first request after the restart, so its number includes the
server's first-request costs (the layout, auth, modules). Every first
request includes loading its own route module.

On a warm server the cloud is a small share of every render. `/tags` reads
two clouds and renders in about the time `/recipes` takes with none. The
first request after the write paid about 18 ms on `/` for the expired
entries. Those entries are re-read once and then shared, so `/tags` right
after it paid nothing visible.

**Fan-out of one tag write.** `term assign american --add turkey-gravy` (a
recipe that already had `sauce`, `easy` and `thanksgiving`) fired **10
tags**:

- `_N_T_/recipe/turkey-gravy` and `item:recipes:turkey-gravy`;
- `pagination:recipes:by-date:head` and `…:meta`, because the recipe is
  recent and its list entry carries its tags;
- **`aggregate:recipes:tags`**, the cloud, because a count moved;
- **`aggregate:recipes:by-tag:whole`**;
- `aggregate:recipes:by-tag:key:` `american`, `easy`, `sauce` and
  `thanksgiving`. The recipe's row moved in **every** term it carries, not
  only in the term it gained, because the row holds its tags.

That expires two cloud entries: `recipes:tags` and `recipes:by-tag:whole`.
The groups' cloud and the tree did not move. The pages that render a cloud
and read one of the two:

- **6 vocabulary-wide routes**: `/`, `/tags`, `/make`, `/search/terms`,
  `/new-recipe`, `/group/new`;
- **1,591 form pages** that read `readTagLabels`: 795 recipe edit pages,
  795 recipe copy pages and 1 group edit page.

That is **1,597 pages**, over D3's ~10. The four by-tag keys expire the
pages of those four terms and of their ancestors: at most 8, since 34a
caps a chain at 2. Since 34a, term pages read no cloud.

**Pi scaling.** The ratio is **5×**. It comes from epic 29, the one time
the same code ran on both hosts in the same window: Pi warm reindex 2.5 s
against the workstation's 0.46–0.64 s, which is 3.9–5.4×. 39b's estimate
(~3.1 s on the Pi against 0.87 s here, about 3.6×) and D3's own 4× are
lower, so 5× is the conservative choice. A cold read on the Pi may be worse
than 5×, because the first read after a start comes off the SD card.

| On the Pi (×5)                                               | Cold (first request after a start) | Warm miss (after a write) |
| ------------------------------------------------------------ | ---------------------------------: | ------------------------: |
| `readTagBoard` (`/`, `/tags`)                                |                       ~0.16–0.21 s |                 ~26–41 ms |
| the `tags`-cloud reads (`/make`, `/search/terms`, the forms) |                          ≤ ~0.07 s |                  ≤ ~15 ms |
| D3's bar                                                     |                             ~0.4 s |                    ~0.4 s |

**Decisions.**

- **Dd1 — The fan-out clause is met on paper, but its remedy cannot
  shrink it.** All 1,597 pages read the **whole** vocabulary: a count for
  every term (`/tags`, `/make`, autocomplete, ⌘K), every label (the forms),
  or every term's carriers (`/tags`' board, the homepage). If `terms` were
  keyed the way 32e keyed by-term, those readers would still use the whole
  read, which carries `:whole`. A write fires `:whole` whenever any key
  moves, and a tag added or removed always moves a count. So the same pages
  would expire, and the write path would do more work. Since 34a, the only
  per-term reader of counts, the term page, reads no cloud. Also, an expiry
  is not paid per page. Every editor route is `ƒ`, and the 1,597 pages share
  2 cache entries, which are re-read once per write: about 6 ms on the
  workstation (5.6 ms for the whole by-tag map plus 0.2 ms for the cloud),
  about 30 ms on the Pi. The first `/` after the write took 60 ms against
  42 ms warm.
- **Dd2 — The Pi ratio is 5×** (above). It is conservative against 39b's
  3.6× and D3's 4×.
- **Dd3 — The heaviest "cloud" is the board, not `terms`.** `readTagBoard`
  reads the whole 603 KB by-term map so it can count distinct carriers per
  subtree. It is the only read that grows with carriers × tags rather than
  with the vocabulary, and the homepage and `/tags` expire on **any** carrier
  change, a name edit included (the homepage's own comment accepts this). If
  the trigger below trips, the fix to design is a folded **board aggregate**
  (subtree totals and distinct counts computed at write time, so `/` and
  `/tags` read a few KB), not a keyed `terms` cloud.
- **Dd4 — The script stays** (`editor/scripts/measure-term-clouds.ts`,
  about 200 lines, read-only, refuses `editor/content`). Re-running it is
  the trigger check below.

**Reopen trigger.** Reopen when **`readTagBoard`'s cold minimum passes
~100 ms on the workstation** (≈ 0.5 s on the Pi), or its **warm minimum
passes ~20 ms** (≈ 0.1 s per write on the Pi). The read grows with the
by-tag bytes: 603 KB now, about 760 B per recipe. A linear extrapolation
puts the cold bar near **~1.7 MB, about 2,200 recipes**, and the warm bar
near ~2,800 recipes. The `tags`-cloud reads grow with the vocabulary
(219 terms) and are about 15× under either bar. **Re-run the script when
the corpus passes ~1,500 recipes**, or when a phase adds a reader of the
whole by-term map.

**Gates.** Docs and a script only, so: `pnpm --filter recipe-editor
typecheck` and `pnpm --filter recipe-website exec tsc --noEmit` both clean
(through the heavy slot; the editor's covers the new script), and the
script's own run (twice, above). No vitest or Playwright: no module under
test changed.

**Roger to confirm:** that D3's fan-out clause counts cache entries rather
than URLs on an all-`ƒ` editor (Dd1). Counted as URLs, the clause was met
(1,597 pages), but the go remedy would not reduce that number, so this
phase did not build it. If you want the 1,591 form pages off the cloud
anyway, the cheap change is to fetch the suggestions in the browser from
`/search/terms`. That moves the read, not the expiry, so it is not
proposed.

### 40e — Thanksgiving

**Applied 2026-10-17** (real repo `245b208d` → `5ff24c2b`, nine commits; the
session pushed nothing — the workstation's sync carries them to the Pi).
`tag:thanksgiving` **30 → 47**; `tag:drink` 220 and `tag:side` 42 after (three drinks and four sides new).
By D2's rules and the epic-33 method: each page fetched **once** into a
draft (`import --dry-run --llm off --out`, sequential, ≥ 15 s between
requests; every page had JSON-LD, so no model read), drafts edited (v4
facets + `thanksgiving`; drinks by the skill's drink rules), `create
--file` into a scratch clone (its `git log -p` reviewed: 8 creates + 1
assign, only those files, images 800–2560 px), then the same files into the
real repo with the workstation stopped, restart, `POST /api/revalidate`.

**Imported (review list for Roger):**

| Gap                | Recipe (slug)                                                               | Source                                        | Commit     |
| ------------------ | --------------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| Gravy              | Turkey Gravy (`turkey-gravy`) — make-ahead base, drippings at the end       | Once Upon a Chef                              | `47bc83e8` |
| Drinks             | Apple Cider Sangria (A Couple Cooks) (`apple-cider-sangria-acouplecooks`)   | A Couple Cooks — wine, batch, sangria         | `99348cb1` |
| Cornbread dressing | Cornbread Stuffing (`cornbread-stuffing`) — make-ahead, sausage             | Sally's Baking (Sally's first; 34f roundup)   | `11c3083e` |
| Green sides        | Roasted Green Beans and Carrots (`roasted-green-beans-and-carrots`)         | Crowded Kitchen                               | `c93436cf` |
| Drinks             | Apple Cider Cocktail (A Couple Cooks) (`apple-cider-cocktail-acouplecooks`) | A Couple Cooks — bourbon, vermouth, stirred   | `7e96302c` |
| Green sides        | Roasted Brussels Sprouts (`roasted-brussels-sprouts`)                       | Food Network (Ina Garten)                     | `c0ba6af2` |
| Make-ahead mash    | Creamy Make-Ahead Mashed Potatoes (`creamy-make-ahead-mashed-potatoes`)     | Once Upon a Chef                              | `b0153cf9` |
| Drinks             | Apple Cider Mimosa (A Couple Cooks) (`apple-cider-mimosa-acouplecooks`)     | A Couple Cooks — wine, built, low-abv, mimosa | `65449137` |

**Tagged `thanksgiving` (already in the repo, one commit `5ff24c2b`):**
`baked-mac-and-cheese` (the mac-and-cheese gap), `sourdough-cornbread`,
`warm-brussels-sprouts-salad-with-bacon-and-apple`, the leftover-turkey
dishes `leftover-turkey-soup-with-black-beans-and-corn`,
`turkey-dinner-pie`, `turkey-pot-pie`, `turkey-sweet-potato-chili`, and the
ciders `homemade-apple-cider`, `mulled-cider-acouplecooks`. The search
showed the plan's "missing" mac and cheese, cornbread and leftover-turkey
gaps were already filled by these, only untagged — so they got the tag
instead of near-duplicate imports.

**For Roger (not imported):**

- Cranberry Mule (Food Network Kitchen) — its image answers 404 and the page
  has no ingredient list (one sentence of method): fails D2. A cranberry
  drink is still a gap; A Couple Cooks has no cranberry roundup (404).
- Sally's Creamy Green Bean Casserole (from scratch) — near-duplicate of
  `green-bean-casserole`.
- Sally's Company-Worthy and Easy Baked mac and cheese — near-duplicates of
  `baked-mac-and-cheese` (tagged instead).
- Sally's My Favorite Cornbread / Honey Skillet Cornbread / Cornbread
  Muffins — cornbread is covered (`sourdough-cornbread`,
  `masa-harina-cornbread`, and the stuffing bakes its own).
- Sally's Candied Sweet Potatoes, Brown Butter Sage or Sweet Potato Dinner
  Rolls, Cranberry Brie tarts — not a named gap; 31 more in the roundup
  (`inspect-list https://sallysbakingaddiction.com/thanksgiving-side-dishes/`).
- Turkey tetrazzini — leftovers already carry four recipes; no import.

**Roger to confirm:**

- The nine existing recipes tagged `thanksgiving` (above), incl. the four
  leftover-turkey dishes. Undo: `recipes term assign thanksgiving --remove …`
  or `git revert 5ff24c2b`.
- No cuisine on the generic gravy, mash, sprouts and green beans (epic 33's
  rule, as C6 applied); `american` on the cornbread stuffing.
- Roasted Brussels Sprouts' description replaced: the page's was SEO
  boilerplate ("…Get the full recipe now."); the new one describes the
  recipe in one sentence.
- Homepage features unchanged (Halloween is current). **After Oct 31:**
  `pnpm --silent recipes feature --term thanksgiving --slug thanksgiving-2026 --note "Thanksgiving: turkey, sides, pies and drinks"`
  (then `unfeature` the Halloween entry if wanted — Roger's; deletes are
  held back from the session).
- Trap: `term assign` takes one carrier per flag (`--add a --add b`).

### 40f — Flake hunt

### 40g — Accessibility coverage

### 40h — Dependency updates

Branch `agent/40h-deps`. Only `package.json` files, `pnpm-lock.yaml` and
this doc change, with no source or config edits. **Reindex needed: no.**
**Deploy:** Roger's `pnpm workstation update` picks it up on the
workstation, and the next `pnpm deploy:pi` on the Pi.

**Method.** `pnpm update -r` within the existing ranges, with the held
packages excluded (`'!react' '!@radix-ui/*' …`). The exact pins then
moved explicitly: `next`, `eslint-config-next`, `tldts`, `react` /
`react-dom` and the two `next` peer pins. Each failing package was
reverted alone, and the full gates re-run.

**Updated** (old → new; the workspaces are every package that lists it):

| Package                                                                  | Old → new                                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `next`, `eslint-config-next`, `@next/eslint-plugin-next`                 | 16.1.6 → 16.4.2 (16.4.1 carries two critical advisories' fixes: `use cache` typed arrays, image optimisation of SVG) |
| `react`, `react-dom`                                                     | 19.2.4 → 19.2.9 (patch; see Dh1)                                                                                     |
| `@types/react` / `@types/react-dom`                                      | 19.2.10 → 19.2.18 / 19.2.3 → 19.2.7                                                                                  |
| `lmdb`                                                                   | 3.5.1 → 3.5.7 (bug fixes in `mdb.c` page-boundary checks and read-snapshot release; no format change)                |
| `simple-git`                                                             | 3.30.0 → 3.33.0, range `~3.33.0` (Dh2)                                                                               |
| `tldts`                                                                  | 7.0.21 → 7.4.18                                                                                                      |
| `prettier`                                                               | 3.8.1 → 3.8.5 (patch; Dh1)                                                                                           |
| `vitest`, `@vitest/browser`                                              | 4.0.18 → 4.1.12                                                                                                      |
| `vite` / `@vitejs/plugin-react` / `vite-tsconfig-paths`                  | 7.3.1 → 7.3.7 / 5.1.2 → 5.2.0 / 6.0.5 → 6.1.1                                                                        |
| `eslint` / `typescript-eslint`                                           | 9.39.2 → 9.39.5 / 8.54.0 → 8.71.2                                                                                    |
| `eslint-plugin-react-hooks` / `-playwright` / `-mocha`, `@eslint/compat` | 7.0.1 → 7.1.1 / 2.10.2 → 2.12.1 / 11.2.0 → 11.3.0, 2.0.2 → 2.1.1                                                     |
| `@modelcontextprotocol/server`, `/client`                                | 2.0.0 → 2.3.1                                                                                                        |
| `@tanstack/react-query` / `react-form` (+ `-nextjs`)                     | 5.90.20 → 5.104.3 / 1.32.0 → 1.33.5                                                                                  |
| `fs-extra` / `lodash` / `format-quantity`                                | 11.3.3 → 11.4.1 / 4.17.23 → 4.18.1 / 3.0.0 → 3.2.0                                                                   |
| `tailwind-merge` / `github-markdown-css` / `date-fns`                    | 3.4.0 → 3.7.0 / 5.8.1 → 5.9.0 / 4.1.0 → 4.4.0                                                                        |
| `mdast-util-to-markdown` / `parse5` / `cbor-x` / `@sindresorhus/slugify` | 2.1.2 → 2.2.0 / 8.0.0 → 8.0.1 / 1.6.0 → 1.6.6 / 3.0.0 → 3.0.1                                                        |
| `netlify-cli` / `serve`                                                  | 23.14.0 → 23.15.1 / 14.2.5 → 14.2.6                                                                                  |
| `postcss` / `autoprefixer` / `tsx`                                       | 8.5.6 → 8.5.30 / 10.4.24 → 10.6.1 / 4.21.0 → 4.23.15                                                                 |
| `@axe-core/playwright`                                                   | 4.11.3 → 4.14.0                                                                                                      |
| `jest`, `jest-environment-jsdom` / `ts-jest`                             | 30.2.0 → 30.5.2 / 29.4.6 → 29.4.15                                                                                   |
| `@testing-library/dom` / `react` / `user-event`                          | 10.4.1 → 10.4.2 / 16.3.2 → 16.3.3 / 14.6.1 → 14.6.8                                                                  |
| `lint-staged` / `@types/node` / `@types/lodash`                          | 16.2.7 → 16.4.0 / 25.2.0 → 25.9.9 / 4.17.23 → 4.17.26                                                                |

**Skipped or held** (still on the old version):

- `zod` 4.3.6 (4.6.7 tried): vitest failed, 15 tests in `termForm`, 4 in
  `groups` (scale) and 2 in `parseRecipeForm` (drink), "expected
  nonoptional, received undefined". The cause is zod 4.4.2's
  `z.preprocess` change, see Traps. Range `~4.3.6`.
- `markdown-to-jsx` 9.6.1 (9.10.3 tried): `flattenMarkdown` "keeps
  quantities inside prose" failed. Range `~9.6.1`. Rendering may change
  too; that was not checked.
- `simple-git` 3.34–3.36: refused by its unsafe-operations plugin (see
  Traps). 3.36.0 failed 31 vitest tests across `curationGit`,
  `siteWrites`, `instance`, `piSync`, `annex`, `mcp` and `mcpHttp`; 3.35.2
  failed one (`instance`, ssh keepalives).
- `@playwright/test` 1.59.1, kept on purpose (latest 1.64.1). A bump also
  moves the CI image pin (`playwright.yml`, `Dockerfile.playwright`) and
  the bundled Chromium under every `visual.spec` screenshot baseline. It
  belongs in its own PR with regenerated baselines.
- `@radix-ui/*` kept on purpose: 40c is converting Select and Checkbox to
  Radix in `component-library` tonight. Take these bumps after 40c merges.
- React 19.3, Tailwind 4.3 and Prettier 3.9 held to patches (Dh1).
- `next-auth` 5.0.0-beta.30 kept (a beta pin). `sharp` 0.34.5 is the
  newest 0.34. TypeScript 5.9.3, `jsdom` 27.4.0, `lexical` 0.44.0 and
  `lucide-react` 0.563.0 are the newest in their line.
- `@testing-library/jest-dom` stays 6.9.1: 6.10.0 is deprecated ("an
  incorrect minor release with breaking changes"), and pnpm skipped it.
- Majors not considered (D4): execa 10, vite 8, vitest 5, eslint 10,
  TypeScript 7, `@types/node` 26, `@tanstack/react-table` 9, netlify-cli
  27, sharp 0.35, lexical 0.52, lucide-react 1.x, among others.

**Notable transitive changes** (the lockfile changed 648 package names;
`tmp/40/40h/lockdiff.cjs` lists the new major lines):

- **Next 16.4.2 brings its own `sharp` ^0.35.5** (an optional
  dependency), next to our direct 0.34.5 pin, so two sharp/libvips builds
  ship in the editor image. Next's copy loads only for `/_next/image`, and
  every `<Image>` here is `unoptimized` or uses a custom loader. The cost
  is image size, not behaviour.
- `@types/node` 26.6.5 shows up as an auto-installed peer of `vite`,
  `vitest` and Next's `sharp`, beside our 25.9.9. Both typechecks pass.
- netlify-cli 23.15 moves its own internals across majors (fastify
  4 → 5, express 4 → 5, OpenTelemetry 1 → 2, pino 9 → 10). That is
  upstream's tree, and only `deploy` uses it.
- dashjs 5.1.1 → 5.2.1 under react-player, with its `@svta/*` peers
  re-resolved (see Traps).

**Decisions.**

- **Dh1 — "No React or Tailwind line change" read as the minor line.**
  The brief says "line" for React and Tailwind but "major" for Next and
  TypeScript. React 19.3.1 and Tailwind 4.3.3 were held to their newest
  patch (19.2.9; Tailwind 4.1.18 has none newer). Prettier 3.9 was also
  held at 3.8.5, because a Prettier minor reformats code and
  `lint-staged` checks every file a later PR touches.
- **Dh2 — Tilde ranges for the three versions held because of a
  failure** (`simple-git ~3.33.0`, `zod ~4.3.6`, `markdown-to-jsx
~9.6.1`). A later in-range `pnpm update` would otherwise pull the
  breaking minor back in.

**Gates** (local, all through the heavy slot):

- `pnpm --filter recipe-editor typecheck`: clean.
- `pnpm --filter recipe-website exec tsc --noEmit`: clean.
- `pnpm exec vitest run`: 112 files, 2321 tests passed. The first run,
  before the reverts, had 53 failures.
- Export build: `next build` of `recipe-website` on Next 16.4.2
  (Turbopack), against a scratch copy of the `christmas-cookies` and
  `many-recipes` fixtures (reindexed with the CLI). 87 static pages,
  no warnings.
- Playwright, build mode (`heavy-pw.sh`): `accessibility`, `new-recipe`,
  `edit`, `search`, `git`, `shopping`, `visual` and `lexical-smoke`
  specs. 173 passed in 6.5 min, with every screenshot baseline unchanged
  on Next 16.4.2. The full suite is left to CI's 14 checks.

**Roger to confirm.**

- Dh1: take React 19.3 / Tailwind 4.3 / Prettier 3.9 in a follow-up, or
  keep them pinned to patches.
- Code follow-ups that would lift the holds: simple-git ≥ 3.34 (pass
  `unsafe: { allowUnsafeSshCommand, allowUnsafeEditor }` where the sync
  sets `core.sshCommand` and the revert/merge path runs with `EDITOR`, or
  stop setting them), zod ≥ 4.4 (form parsers that `preprocess` blanks
  to `undefined`), markdown-to-jsx ≥ 9.7 (`<Multiplyable />` in list
  items).
- `@playwright/test` 1.64 with the CI image and screenshot baselines,
  and the Radix bumps after 40c, each as its own small PR.
- Whether to move the direct `sharp` pin to 0.35 so it shares Next's copy
  (a 0.x minor, so outside D4).

## Close-out
