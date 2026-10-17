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

**Now:** started 2026-10-17 (overnight, unattended); 39f applied; 40e
applied (`tag:thanksgiving` 30 → 47); wave 1 — 40a ∥ 40b.

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

| Phase    | Size | Branch             | Status | PR  | What                                                                                       |
| -------- | ---- | ------------------ | ------ | --- | ------------------------------------------------------------------------------------------ |
| 40a      | S–M  | `agent/40a-llm`    | 🟡     |     | Context sized to the input, honest placement wording, `/v1` against Ollama, batch names.   |
| 40b      | S–M  | `agent/40b-ci`     | 🟡     |     | resume-builder's 7 red specs, its path-filtered CI job, portfolio's prod-build heap.       |
| 40c      | S–M  | `agent/40c-quick`  | 📝     |     | `shopping remove --for`, a bounded start-rebuild retry, Select/Checkbox on Radix `ui/*`.   |
| 40d      | S/M  | `agent/40d-clouds` | 📝     |     | D3: measure the term clouds, then go (key per term) or a recorded no-go.                   |
| 40e      | S–M  | (content repo)     | ✅     | —   | D2: Thanksgiving gaps — gravy, greens, mac and cheese, cornbread, leftovers, drinks.       |
| 40f      | S–M  | `agent/40f-flakes` | 📝     |     | Extra queue: flaky specs from the last ~50 CI runs, fixed at the root; README's test part. |
| 40g      | S–M  | `agent/40g-a11y`   | 📝     |     | Extra queue: axe specs for `/shopping`, `/jobs`, `/git`, `/make`, Export, the term form.   |
| 40h      | M    | `agent/40h-deps`   | 📝     |     | Extra queue: D4, patch and minor dependency updates.                                       |
| 40-close | S    | `agent/40-close`   | 📝     |     | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                          |

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

### 40c

### 40d

### 40e

### 40f

### 40g

### 40h

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

### 40c — Quick wins

### 40d — Term clouds

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

## Close-out
