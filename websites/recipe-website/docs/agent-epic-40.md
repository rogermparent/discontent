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

**Now:** closed (2026-10-17). Every phase landed (39f, 40a–40h); see the
Close-out for Roger's steps and the "Roger to confirm" list.

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

| Phase    | Size | Branch             | Status | PR      | What                                                                                       |
| -------- | ---- | ------------------ | ------ | ------- | ------------------------------------------------------------------------------------------ |
| 40a      | S–M  | `agent/40a-llm`    | ✅     | #262    | Context sized to the input, honest placement wording, `/v1` against Ollama, batch names.   |
| 40b      | S–M  | `agent/40b-ci`     | ✅     | #261    | resume-builder's 7 red specs, its path-filtered CI job, portfolio's prod-build heap.       |
| 40c      | S–M  | `agent/40c-quick`  | ✅     | #265    | `shopping remove --for`, a bounded start-rebuild retry, Select/Checkbox on Radix `ui/*`.   |
| 40d      | S/M  | `agent/40d-clouds` | ✅     | #263    | D3: measure the term clouds, then go (key per term) or a recorded no-go.                   |
| 40e      | S–M  | (content repo)     | ✅     | —       | D2: Thanksgiving gaps — gravy, greens, mac and cheese, cornbread, leftovers, drinks.       |
| 40f      | S–M  | `agent/40f-flakes` | ✅     | #266    | Extra queue: flaky specs from the last ~50 CI runs, fixed at the root; README's test part. |
| 40g      | S–M  | `agent/40g-a11y`   | ✅     | #267    | Extra queue: axe specs for `/shopping`, `/jobs`, `/git`, `/make`, Export, the term form.   |
| 40h      | M    | `agent/40h-deps`   | ✅     | #264    | Extra queue: D4, patch and minor dependency updates.                                       |
| 40-close | S    | `agent/40-close`   | ✅     | this PR | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                          |

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

- **Tc1 — Radix Checkbox's form reset is not the native one.** Inside a
  form it listens for `reset` and restores the value the box _mounted_
  with, and for a controlled box it calls `onCheckedChange` with that value.
  React 19 resets every `action` form after the action, so a plain
  `ui/checkbox` would untick a saved "Share my saved inventory" box, and
  untick a refused recipe save's "Active Time?" boxes through TanStack's
  `handleChange`. Its hidden checkbox is reset by the browser behind the box,
  so the next submission could disagree with what the box shows. Use
  `FormCheckbox` (Dc4), never `ui/checkbox` with a `name`, in a form.
- **Tc2 — Radix Select items cannot have `value=""`.** `""` means "nothing
  selected" to the Root. `SelectInput` maps it to an internal sentinel and
  submits `""` from its own hidden input (Dc3).
- **Tc3 — `FieldWrapper` widens its direct children** (`[&>*]:w-full`,
  later in the stylesheet than `size-4`): a Radix box placed straight in it
  stretches into a 1rem-tall bar. `CheckboxInput` wraps the box in a `div`.
- **Tc4 — No `export type { … }` re-export in a `"use server"` file.**
  Next's transform registered `scriptAction.ts`'s
  `export type { StreamActionResult }` as an action. The action bundle then
  evaluated `registerServerReference(StreamActionResult, …)`, and every
  server action posted from `/export` failed with "StreamActionResult is
  not defined". Fixed in 40c (Dc7). Declaring types (`export type X = …`)
  is fine. Re-exporting isn't.
- **Tc5 — Playwright drives a Radix select by clicks, not `selectOption`.**
  `getByLabel` finds the trigger (a `button role="combobox"`). The helpers
  `chooseOption`, `expectOptions` and `selectValue` (the hidden input's
  value) are in both editors' `playwright/support/helpers.ts`. A Radix
  checkbox's `name` sits on a hidden input, so find the box by role or
  label, never `[name=…]`.
- **Tc6 — `heavy-pw.sh` (`pw.sh`) does not clear `test-jobs`.** A second
  build-mode run in the same worktree reuses the photo's kept reading (38c's
  30-minute reading cache, keyed by the photo), so `photo-import`'s import
  finishes in 0.1 s with one step and "the live steps" fails at
  `vision.transcribe` "running". `rm -rf test-jobs` in the editor before
  rerunning it.

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

- **Tf1 — a server-rendered control is clickable before it is live.**
  Playwright's actionability checks pass on a hydrating page. Then a click
  on a client-only button does nothing, a `selectOption` on a controlled
  `<select>` is reset, and a submit on a server-action form posts natively
  and reloads the page (closing every `<details>`). Right after a full page
  load, wait for the page's own ready marker if it has one, otherwise
  `expectHydrated(locator)`, and then interact.
- **Tf2 — `test-jobs` outlives the run.** The job store keeps readings
  (`readings/`) and photo transcriptions (`photos/`) for reuse, so a rerun,
  retry or `--repeat-each` of an import spec gets the cached reading and
  skips the steps it watches. `resetData` clears both. A new kept-state
  directory in the job store needs adding there too.
- **Tf3 — a non-exact `getByRole` name is a case-insensitive substring
  match.** `getByRole("heading", { name: "A" })` matches any heading
  containing an "a", Next's 404 page included ("This page could not be
  found."). Use `exact: true` for short names, and check the URL after a
  create that redirects.
- **Tf4 — port 3011 is another local app's.** Run the CMS demo's
  Playwright with `PLAYWRIGHT_PORT` set to something else (3021 here);
  `reuseExistingServer` would otherwise adopt the other app in dev mode.
- **Tf5 — `resetData`'s retries absorb the `test-content` race, they don't
  remove it.** A server still writing derived files from the previous test
  can land after the fresh copy, leaking stale aggregates into the next
  test undetected. The root fix (the invalidate endpoint awaiting in-flight
  writes, or taking the content write lock, before a reset) is a follow-up.
- **Review round (orchestrator):** `aria-activedescendant` is gated on the
  mounted list too (it named a removed option after a blur).

### 40g

- **Tg1 — The WCAG tags don't see landmarks.** `WCAG_TAGS`
  (`wcag2a`, `wcag2aa`) leaves out axe's best-practice rules, so two nested
  `<main>`s on every settings page passed every sweep. Landmark rules are
  named explicitly (`expectOneMain` in `accessibility.spec.ts`), not by
  adding `best-practice` to the shared tags — that would sweep portfolio's
  pages too, and flag the minor rules below.
- **Tg2 — `page.locator("form")` is never one element when signed in:**
  the masthead's Sign Out is a `<form>`. Name the form by its id
  (`#featured-recipe-form`, `#page-form`, `#menu-form`).
- **Tg3 — The mirror sync runner outlives `resetData`.** A run queued by
  the test before (its HEAD moves, its `origin` mirror) can land in the
  next test's fresh repository and record an outcome there (CI: "The
  branch changed from main to HEAD during the sync"). Don't assert a
  mirror's first state; assert what Sync now leaves. And
  `toContainText("synced")` passes on "Not synced yet." — match
  `/^Last sync .*: (nothing|synced)/`.
- **Tg4 — A green build-mode run is not CI's run.** `aria-prohibited-attr`
  on the theme page's sliders failed 3/3 under `next dev` in CI and passed
  locally in build mode on the same axe 4.14; the cause wasn't pinned.
  Run a new axe sweep once in dev mode too.

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
- **Under Next 16.4's `next dev`, hydration lands well after `load`.** A
  heading rendered on the server is visible while React does not yet own
  the page, so a key, a `selectOption` or a `visibilitychange` sent then
  is lost or read late. Wait for a hydration marker (`data-ready`, the
  palette hint chip) before you interact. A "skip the first run" ref in an
  effect is not StrictMode-safe either: the second mount pass runs the
  effect for real.
- **Next 16.4's dev overlay is in the DOM**, and its "Expand client/server
  diff" button matches a loose `getByLabel("Client")`. A hydration
  mismatch shows up as a strict-mode violation in an unrelated spec.
- **`next dev` writes `AGENTS.md`** into the app when it detects a coding
  agent, and restores it if deleted, unless the config sets `agentRules: false`.

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

**Reindex needed: no.** No index, spec version or stored shape changed. Tool
counts stay **57 / 43**. `.claude/settings.json` and the skill's frontmatter
are untouched.

What changed:

- **`shopping remove --for <slug>`** (39-Dc3). The CLI's
  `shopping remove` takes `--for <slug>` beside `--recipe` and `--group`
  (exactly one of them, or item ids). The existing MCP `shopping_remove`
  takes a `for` field (exactly one of `ids`, `recipe`, `group`, `for`).
  Both send `patchShopping`'s `removeSource: {for}`, which is what
  `/shopping`'s "Remove these" does. The tool description, the CLI usage
  and `--help`, and the curator skill's §8b (an "I have simple syrup
  already" line, and the CLI fallback) say so.
- **A bounded retry for a failed instance rebuild** (39b-L5).
  `controller/instance/rebuildRetry.ts` (`createRetryingRebuild`) wraps
  the instance's coalesced reindex task. `start.ts` uses it for D12's
  `reindexIfForeign`, `close()` disposes it, and the ref watcher calls
  `headMoved()` before it asks.
- **Select and Checkbox on the Radix `ui/*` primitives** (ui-overhaul
  follow-up). `SelectInput` is now `ui/select` and takes `options`
  (`{value, label, depth?}`) instead of `<option>` children, and
  `onValueChange(value)`. `CheckboxInput` is now `ui/checkbox` through a new
  `FormCheckbox`, with `onCheckedChange(checked)` (a boolean). Callers
  moved: the drink method, a term's Parent, a group's Kind, a project's
  Status and Featured, Timeline's "Active Time?". The page-local form
  controls moved to them too (inventory below).
- **Found on the way: every server action posted from `/export` failed**
  (Tc4, Dc7). That covers Save on "Share my saved inventory" in a
  production build. Build and Deploy load the same action entry, so they
  should have failed too, but nothing here ran them. The new spec case
  found it.

Decisions:

- **Dc1 — `for` is a field of the existing tool, not a new tool.** A new
  tool would change the counts, the pre-approved list and the frontmatter
  for one more key of a patch the server already took. The CLI flag has
  the same name as the HTTP key.
- **Dc2 — The retry schedule: 1, 5 and 15 minutes after each failure in a
  row, then stop.** The n-th retry waits the n-th delay after the failure
  before it, so the last attempt comes about 21 minutes after the first
  failure plus the rebuilds' own time. It stops on success (a rebuild, or
  a check that found nothing to do), on a newer HEAD move, and on
  shutdown. A HEAD move drops the pending retry and resets the count,
  because that move asks by itself and a failure of its ask starts again
  at 1 minute. Each attempt takes a HEAD-move generation when it starts,
  and a failure of an attempt that began before the last move isn't
  counted (review round): the move's ask, coalesced behind a rebuild
  already running, is the one that counts. `busy` (the line or the write lock held past the rebuild's
  wait) is a failure like any other: it waits for the next scheduled
  attempt, never a tight loop. Every attempt goes through the coalesced
  task, so it never runs beside another rebuild and waits out a sync like
  a HEAD move's ask would. The timer is `unref`'d and started outside any
  queue hold (as `retryAfterBusy`'s is). The fourth failure logs "no more
  retries" with what to do. Each failure is logged once, by the retry
  (`busy` on `info` with its message, anything else on `error` with the
  error). _Scope:_ any failed instance rebuild, not only
  the start-time one. The foreign-HEAD rebuild had the same gap and runs
  the same task.
- **Dc3 — `SelectInput` submits from a hidden input of its own,** not
  Radix's hidden native select. Radix items can't carry `""` (Tc2), and
  four of the converted selects submit `""` for "none". The "—" / "None"
  option is an internal sentinel in the control and `""` in FormData. A
  value no option names still submits instead of being dropped.
  Uncontrolled, it starts on the first option without a `defaultValue`,
  as a native select does. On a form `reset` it goes back to the current
  `defaultValue`, read from the DOM (`data-default-value`) because React
  resets an action's form before effects see the new default. The trigger
  carries `id`, so labels and `getByLabel` find it, and the server render
  shows the chosen label (`SelectValue` children). A term's Parent tree is
  indented by padding (`depth`), not by NBSPs in the label, and a nested
  option is named by its path for screen readers (`aria-label`
  "Dessert › Cookies", which is also its accessible name in specs). With
  no `defaultValue`, options that arrive or change after mount and no
  longer hold the value move it to the first option, as natively (MirrorsCard's
  Add list after a mirror is added).
- **Dc4 — `FormCheckbox` keeps native submit and reset semantics** (Tc1).
  A ticked, enabled box sends `name=value` (`"on"` by default) from a
  hidden input it renders only while ticked. On a form `reset`, an
  uncontrolled box goes back to the current `defaultChecked`
  (`data-default-checked`, as Dc3), and a controlled box is left alone:
  Radix's reset-driven `onCheckedChange` is ignored, flagged by a
  capture-phase listener on the document and settled by the bubbling one,
  or by a microtask the capture listener queues if something stops the
  event first. Enter on a focused box no longer submits the form (Radix
  prevents Enter on its `button`; Space toggles). Accepted. FormData values are unchanged
  from the native controls: `clearImage=on`, `again=on`,
  `timelines[n].events[m].activeTime=on`, `featured=on`,
  `shareInventoryOnExport=on`, `unassign=on`, `llm=force`.
- **Dc5 — The line between converted and left native.** Every editor
  control that **submits by `name` in a form** is converted (the
  backlog's subject: "the native `name`-submitting controls"), plus the
  import form's "Use the first photo" box, which sits beside one.
  `GroupSelectInput` stays native: it relies on the native `required`
  check, which a hidden input does not give, and on async options with a
  dangling-slug option. State-only controls outside forms stay native as
  a follow-up: list rows with their own semantics, the phone-first
  `/shopping`, `/make`'s per-browser switches (one is `role="switch"`, and
  `ui/` has no Switch), and the `/jobs` filters and Retry box. See the
  inventory below.
- **Dc6 — Specs drive the Radix select by clicks.** `chooseOption` opens
  the trigger and clicks the option. `expectOptions` reads the open list.
  `selectValue` reads what the field submits (Tc5). Assertions that read
  `<option>` elements became the same assertions on the open list.
- **Dc7 — `scriptAction.ts` no longer re-exports `StreamActionResult`.**
  `exporter.tsx` imports the type from `runCommand.ts` (Tc4).

**Inventory** (native `<select>` / `type="checkbox"` before 40c):

| Where                                                                                                             | Control                                            | Now       | Why                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `component-library` `Form/inputs/Select` (`SelectInput`)                                                          | select                                             | **Radix** | The duplicate the backlog names; callers below                                            |
| ↳ recipe form `drink.method`, term `parent`, group `kind`, project `status`                                       | select (`name`)                                    | **Radix** | Submit by name; `""` options via Dc3                                                      |
| `component-library` `Form/inputs/Checkbox` (`CheckboxInput`)                                                      | checkbox                                           | **Radix** | The duplicate the backlog names; callers below                                            |
| ↳ Image / Video "Remove Image/Video", recipe Image, Timeline "Active Time?", featured "again", project "Featured" | checkbox (`name`)                                  | **Radix** | Submit by name (Dc4)                                                                      |
| `new-recipe/form.tsx` "Re-read with AI" (`llm=force`)                                                             | checkbox (`name`, `value`, disabled)               | **Radix** | Submits by name                                                                           |
| `new-recipe/form.tsx` "Use the first photo as the recipe's image"                                                 | checkbox (state)                                   | **Radix** | Beside the one above, in the same form                                                    |
| `tags/[tag]/edit/tools.tsx` "Also remove the tag" (`unassign`)                                                    | checkbox (`name`, echoed default)                  | **Radix** | Submits by name                                                                           |
| `export/ShareInventoryForm.tsx` (`shareInventoryOnExport`)                                                        | checkbox (`name`, default from settings)           | **Radix** | Submits by name; new spec case                                                            |
| `git/MirrorsCard.tsx` "Add a remote as a mirror" (`remote`)                                                       | select (`name`)                                    | **Radix** | Submits by name (`SelectInput`)                                                           |
| `Form/inputs/GroupSelect` (featured form, group items)                                                            | select (`name`, `required`)                        | native    | Native `required` blocks an empty submit; async options + dangling-slug option (Dc5)      |
| `new-recipe/PickList.tsx`                                                                                         | checkbox per row (state, locked rows)              | native    | List rows with their own semantics (the brief's example)                                  |
| `ShoppingPage/ShoppingRowView.tsx`                                                                                | row tick, store and aisle pickers (state)          | native    | Phone-first in-store page; the tick has 38d/39c held-tick semantics; OS pickers on phones |
| `ShoppingPage/SettingsSheet.tsx`                                                                                  | feature boxes, default/aisle store selects (state) | native    | Same phone-first page as the rows; one follow-up for `/shopping` as a whole               |
| `MakePage/index.tsx` "Count close matches"                                                                        | checkbox (state)                                   | native    | Per-browser setting, not a form; also on the export                                       |
| `MakePage/InventoryPanel.tsx` "Assume pantry staples"                                                             | `role="switch"` checkbox (state)                   | native    | Per-browser switch; `ui/` has no Switch primitive                                         |
| `jobs/JobsDashboard.tsx` Status / Kind                                                                            | filter selects (state)                             | native    | Not a form; follow-up                                                                     |
| `jobs/[id]/JobDetail.tsx` "Read it again"                                                                         | checkbox (state)                                   | native    | Not a form; beside Retry; follow-up                                                       |
| portfolio / resume-builder                                                                                        | (only through `SelectInput` / `CheckboxInput`)     | **Radix** | Portfolio's project form; resume-builder uses neither directly                            |

Tests: `cliJson.test.ts` +1 (create Simple Syrup and Lemonade, add
Lemonade, `--for` with `--recipe` → `usage`, `remove --for simple-syrup`
→ "Removed 2 items", the lemon juice left, then cleaned up). `mcp.test.ts`
+1 (`for` removes the syrup's two items and keeps the recipe's own line, a
second call is `changed: false`, `for` with `recipe` is refused by the
schema, the input schema lists `for`, still 57 tools). `rebuildRetry.test.ts`
(new, 7, frozen clock): the 1/5/15 schedule and give-up, stop on success
and restart at 1 minute, a HEAD move drops the pending retry, `busy` waits
for the scheduled minute, shutdown clears and schedules nothing, a retry
while a sync blocks runs on `kick`, the timer is unref'd.
`instance.test.ts` +1: a start-time rebuild that is `busy` (the
repository's line held) schedules a retry, and `close()` clears it.
`formControls.test.tsx` (new, 8, jsdom): FormData and reset for both
inputs (`on` / nothing, a custom value, disabled sends nothing, reset to
the current default, a controlled box reports no change on reset, the
empty option submits `""`, the first option by default). The curator-skill
test passes unchanged (57 / 43). Playwright: `term-edit`, `groups`,
`recipe`, `timeline` and portfolio `projects` drive the Radix select
(Dc6). `export-page` +1 (tick, Save, still ticked, reload, untick).

**Gates.** Both typechecks clean (and portfolio's editor, which uses the
shared inputs). vitest **113 files / 2313 tests**: 2312 passed on the full
run, and one timeout under load in a file 40c didn't touch (`shopping.test.ts`
"refuses an add that would take the list past its cap", 60 s). It passes
alone in 2.7 s (35/35), so it's a candidate for 40f. Playwright (build mode,
`heavy-pw.sh`, e2e + mobile): `term-edit`, `groups`, `recipe`,
`new-recipe`, `timeline`, `export-page`, `photo-import`, `edit`,
`featured-recipes`, `reference-updates`, `mirrors-card`, `git`, `visual`,
`accessibility`. The final run had **274 passed** and one `photo-import`
failure, which was stale `test-jobs` from an earlier run (Tc6). With
`test-jobs` cleared, `photo-import` passed **3/3**. Portfolio `projects.spec`
**7/7** (e2e, `next dev`; the portfolio production build is 40b's).
**Baselines: none moved.** `visual.spec` and the a11y specs pass on the
old baselines. The forms they capture show none of the converted
controls (no image to remove, no timeline event, no drink block open), or
any difference stays inside the threshold. The converted controls were
checked by eye on throwaway screenshots (the term form's Parent list,
"Active Time?", the Export card).

**Review round** (no blockers; all as new commits):

- `rebuildRetry.ts`: the HEAD-move generation (Dc2), so a move during a
  running rebuild fails into the 1-minute step, not the 5-minute one; one
  log line per failure instead of two. `rebuildRetry.test.ts` +1 (that
  scenario on a frozen clock), and the give-up case counts the lines.
- `FormCheckbox`: the microtask settle (Dc4). `formControls.test.tsx` +1 (a
  reset stopped on the form: the box goes back to its default and still
  toggles after).
- `SelectInput`: tree options named by their path, and the first-option
  move (Dc3). `formControls.test.tsx` +1. `term-edit.spec` picks
  "Dessert › Cookies".
- `shopping remove --recipe/--group/--for ""` is a `usage` error naming the
  flag. `cliJson.test.ts`'s `--for` case checks it.
- `MirrorsCard`: no change of its own; the Select move covers a stale
  remote name.

Review-round gates: both typechecks clean; vitest on the touched files
(`rebuildRetry`, `formControls`, `instance`, `cliJson`, `mcp`) **5 files /
108 tests** passed (CI runs the full suite); Playwright build mode
`term-edit.spec` + `mirrors-card.spec` **11/11**. Baselines: none moved.

**Roger to confirm:**

- The schedule (Dc2) and that it covers foreign-HEAD rebuilds, not only
  the start-time one.
- The native/Radix line (Dc5): `/shopping`, `/make` and `/jobs` keep native
  controls for now. The phone-first shopping page keeps the OS pickers.
- `/export`'s server actions failed on `main` (Tc4), seen for Save in a
  production build. Build and Deploy are inferred to fail too (same action
  entry; not run here). A workstation update brings the fix.

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

**Reindex needed: no. Deploy: none needed** (one component change ships
with the next deploy: the search field's ARIA; the rest is tests).

**Mining.** 60 runs of `playwright.yml` (239 suite jobs, 44 runs that ran
suites): every flake is Playwright's own retry-then-pass (CI retries 2), no
test failed consistently on main. Counts below are job instances (a PR run
and its merge run count twice). The table source is the session scratch
`tmp/40/40f/flakes.md`.

**Offenders, root causes and fixes.**

| #   | Spec (CI retries in 60 runs)                                                                                                       | Root cause                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Fix                                                                                                                                                                                                                                                                                                                              | `--repeat-each 5`, build mode                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `menus.spec` — portfolio :57 (21), recipe :38 (10), :85 (7)                                                                        | Pre-hydration click. The /menus heading link is followed natively before hydration; the edit page arrives server-rendered, and an Append click before it hydrates does nothing, so `getByLabel("Name")` times out (Tf1).                                                                                                                                                                                                                                       | `openMenu()` in both suites: follow the heading, then `expectHydrated()` on the top-level Append (the last one) before clicking it.                                                                                                                                                                                              | recipe: in run A ✅; portfolio: **15/15**                                               |
| 2   | `jobs.spec:241` /jobs filters (20)                                                                                                 | Pre-hydration `selectOption` on a controlled `<select>`: React resets the choice when it adopts the element, and the filtered-out row stays.                                                                                                                                                                                                                                                                                                                   | Wait for hydration before the Kind filter. After the merge with 40h this is 40h's `dashboardReady` (the dashboard's `data-ready`), which covers the same wait; the 40f `expectHydrated` call there was dropped.                                                                                                                  | run A ✅ (with `expectHydrated`); after the merge, 1× ✅                                |
| 3   | `aggregates.spec:265` CMS demo, dev only (13)                                                                                      | **Not found; open.** The previous worker blamed a cached "not found" left by an earlier test that used the same slug. That's refuted: a dev run with a separate slug per test still failed once, on a slug no test had used before (404 on `/notes/retagged`, no Edit link). `createNote`'s check also matched the 404 page: `getByRole("heading", { name: "A" })` is a case-insensitive substring match, and "This page could not be found." contains an "a". | `createNote` checks the URL and the exact title, so a create that lands on a 404 fails at the create, where a trace can see it. The per-slug change was reverted. The demo's config, `:test` scripts and `support/tasks.ts` now honour `PLAYWRIGHT_PORT` (3011 is another local app's). No timeout raised and no pre-warm (Df3). | build 35/35 (×2); dev: 34/35 with per-test slugs, then 35/35 (×2) with the strict check |
| 4   | `search-autocomplete.spec:308` (7)                                                                                                 | **A real a11y bug.** The combobox's `aria-expanded`/`aria-controls` followed `open`, but the popover's portaled listbox isn't in the DOM in every commit where `open` is true, so axe (`aria-valid-attr-value`) sometimes caught `aria-controls` naming a missing id.                                                                                                                                                                                          | `QueryAutocomplete` puts a callback ref on the listbox (`listMounted`); `SearchInput` sets `aria-expanded = open && listMounted` and `aria-controls` only while the list is mounted.                                                                                                                                             | run A ✅                                                                                |
| 5   | `git.spec` empty-name family :174, :190, :216, :242 (8)                                                                            | Pre-hydration submit. The `<details>` opens natively, but a submit before hydration posts the server action as a plain form and reloads the page with every section closed. The validation message is then in the DOM but hidden.                                                                                                                                                                                                                              | `openBranchesSection` / `openRemotesSection` wait for `expectHydrated()` on the section's Create / Add button (`includeHidden`), then open it.                                                                                                                                                                                   | run B ✅                                                                                |
| 6   | `youtube-video.spec:157` (3; failed all 3 attempts once, #256)                                                                     | youtube-video-element: when the URL changes before the old player is ready, the new `loadComplete` resolves from the old player's `onReady` and calls `unMute()` on a player with no methods yet. That throws a client exception and the edit form never submits.                                                                                                                                                                                              | `StickyVideoPlayer` keyed by `previewSrc` in the component library's `VideoInput`, so a new URL gets a new element. **A workaround around a third-party race** (Df1).                                                                                                                                                            | run A ✅                                                                                |
| 7   | `ENOTEMPTY` / `EEXIST` on `test-content` (empty-state, featured-recipes, tag-pages, sticky-chrome, groups; demo update.spec) (≈10) | The server can still be writing derived files (aggregates, indexes) under `test-content` from the previous test when `resetData` removes it, or recreate it before the fixture copy.                                                                                                                                                                                                                                                                           | `resetData` (recipe and demo) removes with `fs.rm`'s `maxRetries` (it retries `ENOTEMPTY`/`EBUSY`) and retries the fixture copy on `EEXIST` after removing again.                                                                                                                                                                | covered by every run above                                                              |
| 8   | `read ECONNRESET` / `socket hang up` in API-context tests (4)                                                                      | Keep-alive reuse: every API request context in a worker shares one keep-alive agent, and a request can go out on a socket just as the server's 5 s keep-alive timeout closes it.                                                                                                                                                                                                                                                                               | The recipe suite's `request` fixture is a fresh context with `Connection: close`.                                                                                                                                                                                                                                                | covered by runs A and B                                                                 |

Two more found on the way:

- **`photo-import.spec` failed 4 of 5 under `--repeat-each`** (run A):
  `test-jobs` outlives a test and a run, and the server's kept readings
  (`readings/`, 38c) and photo transcriptions (`photos/`, 38-De5) made every
  read after the first one reuse the first transcription, so the vision step
  the spec watches never appeared (Tf2). `resetData` now removes both
  directories. Run B: ✅ 5/5.
- **The shopping cap vitest** wrote 4 999 item files and read them back on
  each add, which took 60 s under load. A `shoppingTestHooks.maxItems` seam
  (cap 20 in the test) runs the same check in about 0.5 s.

**Open.** The demo's `aggregates.spec:265` under `next dev` (above, Df3).
`search-query-language.spec:310` ("the idle browse rail lists the
groups", 3 retries, `toHaveURL` after clicking a group chip) wasn't
diagnosed and stays open for a later round. Other one-off retries (git.spec
:607 `data-*` attribute, demo aggregates :154, empty-state :17 visual) had
one or two instances each and no fix here.

**`expectHydrated()`** (`playwright/support/hydration.ts`, recipe and
portfolio): waits for the element to be attached, then polls for React's
`__reactProps$…` key on that DOM node. React sets that key in the same
hydration pass that makes the node's handlers live, so it's a fact about
this element. A page-wide marker would say nothing about a Suspense boundary
that hydrates later. It relies on a React internal that every React DOM
since 17 has kept, and it's test-only (Df2). CLAUDE.md's Verification
section names it. Where a page already has its own ready signal (40h's
`data-ready` on `/jobs`), prefer that.

**README.** No README in the repo mentions Cypress any more (26d and 40b
fixed them), so CLAUDE.md's stale "README's test section is stale"
sentence is replaced.

**Decisions.**

- **Df1** — The YouTube fix keys the preview player by its URL rather than
  patching youtube-video-element. A source change remounts the player,
  which is what a new URL means anyway. **Roger to confirm** (the
  alternative is an upstream fix or a pinned patch).
- **Df2** — The hydration signal is React's own per-node props key, read
  only by tests, not an app-wide `data-hydrated` attribute added to the
  pages. React sets it in the render phase (`hydrateInstance`), so under
  concurrent hydration it can appear a few ms before the handlers are live;
  React's blocked-event replay covers clicks, so the residue is small.
- **Df3** — The demo's dev-only flake is left open, not hidden: no pre-warm
  or dev-project timeout, because the failure is a 404, not a compile wait.
  One failure in 35 dev runs, then 0 in 70, is too rare to trace in this
  round. The stricter `createNote` check makes the next CI occurrence fail
  where it starts (CI keeps a trace on the first retry).

**Gates.**

- `pnpm --filter recipe-editor typecheck` ✅;
  `pnpm --filter recipe-website exec tsc --noEmit` ✅;
  `pnpm exec vitest run`: **2321/2321** (112 files) before the merge with
  main, **2342/2342** (114 files) after it. Both typechecks were run again
  after the merge. Everything ran in the heavy slot.
- After the merge, recipe Playwright (build mode) `jobs.spec`, `git.spec`,
  `menus.spec`: **44/44**.
- Recipe Playwright, build mode, `--repeat-each 5`: run A (menus, jobs,
  search-autocomplete, youtube-video, photo-import) **211 passed, 4 failed**
  (photo-import, Tf2, fixed after); run B (photo-import, git) **165/165**.
- Portfolio `menus.spec`, build mode, port 3029, `--repeat-each 5`:
  **15/15**.
- CMS demo `aggregates.spec`, `PLAYWRIGHT_PORT=3021`, `--repeat-each 5`:
  build **35/35** twice; dev **34/35** (per-test slugs, since reverted),
  then **35/35** twice (the strict `createNote`, with and without the
  slugs).

### 40g — Accessibility coverage

**Reindex needed: no. Deploy: optional** (one markup change in the settings
area, and a darker unchecked-checkbox border on recipe pages and forms).

**Coverage.** `accessibility.spec.ts` gains 27 tests (WCAG 2 A/AA, the
spec's existing tags, signed in):

- a table-driven sweep of 22 pages the spec never reached — `/recipes`,
  `/about` (a site page), `/settings/theme`, `/settings/tools`,
  `/settings/maintenance`, `/export`, `/pages`, `/menus`, the edit forms
  (`/recipe/<slug>/edit` and `/copy`, `/group/new`, `/group/<slug>/edit`,
  `/featured-recipe/<slug>` and its `/edit`, `/featured-recipe/new`,
  `/pages/new`, `/pages/edit/<slug>`, `/menus/edit/header`) and the term
  pages (`/tags/cookies` with a breadcrumb and pinned recipes,
  `/tags/dessert` with narrower terms, `/tags/new`, `/tags/cookies/edit`);
  each also runs the landmark rules (Tg1);
- `/shopping` with a plan and a sub-recipe expansion on it, in both modes:
  the list, the settings sheet open, then stores and "Probably on hand"
  switched on with the Sub-recipes fold and a row's sources open;
- `/git` with a remote and a mirror (before and after Sync now), both
  modes, and a mirror's `/git` (the "Synced by" card).

Already covered and left as they were: `/jobs` and a job page (37c, both
modes), `/git` without a remote, `/make` (here and in `make.spec`),
`/settings`, `/new-recipe`, the reader pages and the theme matrix. The
route tree has no page left without an axe check except the paged
listings (`/recipes/<n>`, `/groups/<n>`, `/featured-recipes/<n>`), which
render the same components as their first pages.

**What axe found.** Under the WCAG 2 A/AA tags: **nothing** on any of the
new pages — every new test passed on its first run once its locators were
right. A one-off exploratory sweep of 34 routes with the WCAG 2.1/2.2 and
best-practice tags (a temporary spec, not committed) found:

| Rule (tags)                                                                        | Where                                                                                                 | Element                                                                           | Fix                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique` (bp) | every settings-area page (`/settings*`, `/export`, `/git`, `/jobs`, `/pages`, `/menus`)               | `SidebarLayout`'s `<main>` around the page's own `<main>`                         | **Fixed:** the layout's content column is a `<div>`; each page keeps its own `<main>` (recipe's `PageMain`, portfolio's pages). Locked by `expectOneMain`.     |
| `non-text-contrast` (WCAG 1.4.11, measured — axe doesn't test it)                  | every Radix checkbox: recipe ingredient/step ticks, the import form, Export, portfolio's project form | the unchecked box's `border-input` border: 1.27:1 light (on the page), 1.8:1 dark | **Fixed:** `ui/checkbox.tsx` borders with `border-muted-foreground` — 5.6:1 light, 7.0:1 dark, in every neutral family (`derive.ts` keeps its L at 0.5 / 0.7). |
| `target-size` (WCAG 2.2 AA, 2.5.8)                                                 | `/tags/<term>` cards, `/featured-recipe/<slug>`                                                       | the card's tag chips (`RecipeCardTagHint` badges, ~20 px tall, 4 px apart)        | **Not fixed** — Roger to confirm (below).                                                                                                                      |
| `heading-order` (bp)                                                               | `/search`                                                                                             | a result card's `<h3>` with no `<h2>` before it                                   | Not fixed: best-practice, moderate; the search page is 40f's ground tonight.                                                                                   |
| `image-redundant-alt` (bp)                                                         | `/groups`                                                                                             | a group card's thumbnail alt repeating its name                                   | Not fixed: minor.                                                                                                                                              |

**Baselines:** none moved. `<main>` → `<div>` carries the same classes,
and the checkbox's darker border stays under the 2 % `maxDiffPixelRatio`:
every checkbox-bearing screenshot spec passed unchanged inside the
Playwright Docker image (CI's fonts) — recipe `visual`, `mobile`,
`recipe`, `yield`, `ingredient-preview`, `paste-replace` (105/105, build
mode) and portfolio `visual` (11/11, with the project form).

**Gates.** Before the `SidebarLayout` fix: both typechecks ✓, `pnpm exec
vitest run` 112 files, 2321 tests ✓, `accessibility.spec` 61/61. After
it, with origin/main merged in (40c's Radix Select/Checkbox, 40h's
`@axe-core/playwright` 4.14, React 19.2.9, Next 16.4.2) and the checkbox
border: `pnpm --filter recipe-editor typecheck` ✓; `pnpm --filter
recipe-website exec tsc --noEmit` ✓; `test/formControls.test.tsx` 10/10
(the full suite is CI's); Playwright build mode through the heavy slot,
`accessibility.spec`, `settings-nav.spec`, `sticky-chrome.spec`,
`visual.spec` (e2e + mobile) **104/104** — axe 4.14 found nothing new on
40c's Radix controls; portfolio (`next dev`, like CI) `accessibility.spec`
and `visual.spec` **33/33**; the Docker screenshot runs above.

**CI round (after the 40f merge).** Recipe shard 1/4 (`next dev`):

- **`/settings/theme`, 3/3: `aria-prohibited-attr`** (serious, WCAG
  4.1.2). The "Accent hue" and "Corner radius" sliders put their
  `aria-label` on Radix's role-less root `<span>` as well as the thumb
  (`role="slider"`): `ui/slider.tsx` copied the label to the thumb and
  still spread it onto the root. **Fixed:** the label and `aria-labelledby`
  are taken out of the root's props and moved to the thumb only (Tg4).
- **`/git` with a mirror, dark mode, flaky:** the first state was
  another test's sync (Tg3). The test now checks the card in whatever
  first state it shows, waits for hydration, and requires Sync now to
  leave `nothing` or `synced`.
- **`export-page.spec` share box, flaky:** the Radix checkbox was
  clicked before hydration; now `expectHydrated` (40f) runs before
  `check()` and `uncheck()`.

Gates: `pnpm --filter recipe-editor typecheck` ✓; `accessibility.spec` +
`export-page.spec` in build mode (e2e + mobile) **63/63** and in dev mode
(`--project=e2e`, CI's mode) **59/59**.

**Roger to confirm.**

- **WCAG 2.2 target size for tag chips.** The project's bar is WCAG 2 AA
  (`wcag2a`, `wcag2aa`); 2.5.8 is 2.2. Meeting it means taller chips (or
  more space between them) on every recipe card that shows tags — a
  visible change with many baselines. Left as is; say if the bar should
  move to 2.2 AA, and a later phase grows the chips and adds `wcag21aa`
  and `wcag22aa` to `WCAG_TAGS`.
- **Text-field borders (WCAG 1.4.11).** `--input` (L 0.9 on the 0.98
  page) is the border of every `Input`, `Textarea`, `Select` trigger and
  outline button: 1.27:1 light, ~1.8:1 dark. A labelled field with a
  placeholder or value is identifiable without it, which is why only the
  checkbox (an empty box when unchecked) was fixed here. Raising
  `--input` itself (to about L 0.65 light, 3.05:1, and 30 % white dark)
  would redraw every form and move most baselines; say if you want it.

### 40h — Dependency updates

Branch `agent/40h-deps`. Only `package.json` files, `pnpm-lock.yaml` and
this doc change, with no source or config edits, until the CI round below
(a `/jobs` fix, two portfolio layouts, `agentRules: false` in the Next
configs, test waits). **Reindex needed: no.**
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

**CI round** (#264's first run: Recipe shard 2/4 and Portfolio red, both
under `next dev`). Nothing was reverted for it.

- **`/jobs` read while the tab was hidden** (`jobs.spec` 38b, 3/3). The
  dashboard skipped its filter effect's first run with a `first` ref.
  StrictMode (on under `next dev`) runs a mount's effects twice and keeps
  refs, so the flag was spent on the first pass and the second pass read
  `/api/jobs` at mount, without checking `hidden`. That was a latent dev-only
  bug. Next 16.4's dev server hydrates later after `load`, so the read now
  landed after the spec had hidden the tab (the CI trace: the request came
  ~75 ms after the `visibilitychange`, with React still hydrating). Fix: the
  effect compares the filters against those the list was read with
  (`filtersShown` ref), so a remount reads nothing. A read aborted after
  its body arrived is dropped too, before it can overwrite a newer
  filter's list. The dashboard carries `data-ready` once mounted; the two
  `/jobs` specs that filter or hide the tab wait for it (`dashboardReady`).
  The "step timeline" flake (a Kind filter picked before hydration was
  lost) is the same timing.
- **Portfolio `getByLabel("Client")` matched two elements** (3/3). The
  second was Next's dev overlay button "Expand client/server diff". The
  overlay reported a hydration mismatch on `<html>`: next-themes sets the
  mode class and `color-scheme` before React hydrates, and portfolio's root
  layouts (editor and export) lacked the `suppressHydrationWarning` that
  next-themes documents and that recipe's AppLayout already has. Added to
  both. Next 16.4's overlay now puts that diff in the DOM.
- **Portfolio ⌘K flakes** (6 command-palette specs, a11y "when open",
  visual "the command palette"). The shortcut was pressed before hydration,
  with no listener, so it was lost. `paletteShortcutReady` waits for the
  hint chip's post-hydration re-read ("⌘K" → "Ctrl+K" on a non-Apple
  runner) before pressing. No baseline moved.
- **`AGENTS.md` appeared in `websites/portfolio/editor`.** Since 16.4,
  `next dev` writes one into the app when it detects a coding agent, and
  restores it if deleted. **Dh3:** `agentRules: false` in all six Next
  configs (recipe editor/export, portfolio editor/export, resume-builder,
  the CMS demo). This repo's agent notes are the root `CLAUDE.md`. The
  generated file was not committed.
- **eslint-plugin-react-hooks 7.1** (via eslint-config-next 16.4.2) now
  flags a concise-arrow `useEffect(() => setNow(…), [])` as
  `set-state-in-effect`. Lint-staged refused the dashboard's commit. The
  mount clock is now set from a `setTimeout` callback.

CI-round gates (after merging `origin/main` with 40c, local, all through
the heavy slot): `recipe-editor` typecheck clean; `recipe-website tsc
--noEmit` clean; `portfolio-website-editor` typecheck clean; vitest
`formControls`, `rebuildRetry`, `cliJson`, `instance`, `mcp`,
`jobSurfaces` and `specVersions`, 7 files and 162 tests passed;
`jobs.spec`, build mode (`heavy-pw.sh`): 10 passed; portfolio
`projects.spec command-palette.spec accessibility.spec` in `next dev`
(`heavy-bg.sh`, `--project=e2e`): 36 passed, with no `AGENTS.md`
written. The dev-mode recipe run is left to CI.

## Close-out

Closed 2026-10-17. Every phase landed: 39f (content, docs #259), 40e (content,
docs #260), 40a #262, 40b #261, 40d #263, 40c #265, 40h #264, 40f #266, 40g
#267, and this close. Nothing is deployed. No phase changes an index layout
or a spec version (40d is a no-go), so **no reindex is needed**.

### For Roger's morning — 40e's review list

Eight Thanksgiving imports and nine existing recipes tagged `thanksgiving`
(`tag:thanksgiving` 30 → 47; content `47bc83e8`..`5ff24c2b`, synced to the Pi
by the workstation): Turkey Gravy and Creamy Make-Ahead Mashed Potatoes (Once
Upon a Chef), Cornbread Stuffing (Sally's), Roasted Green Beans and Carrots
(Crowded Kitchen), Roasted Brussels Sprouts (Ina Garten, Food Network), and
Apple Cider Sangria, Apple Cider Cocktail and Apple Cider Mimosa (A Couple
Cooks). The tagged nine are baked mac and cheese, sourdough cornbread, the
warm Brussels sprouts salad, four leftover-turkey dishes and two ciders.
40e's Results has the commit per recipe, the "for Roger" list (not imported:
a cranberry mule with a dead image, near-duplicates) and the undo commands.

### What shipped, phase by phase

- **39f, content calls (#259).** C2, C6, C7 applied (red-wine spritzer cites
  the Wayback snapshot; three generic salads lost `american`; shumai gained
  `main`); the rest closed.
- **40a, import polish (#262).** The local model's `num_ctx` follows the
  input (4096 / 8192 / 12288, one step per import); the GPU check ran 100%
  on the GPU at 8192 (6.2 GB) and 4096 (5.6 GB), against 89% at 12288 in
  39a. Placement warnings say why: "loaded while VRAM was held" (`ollama
stop` helps), the desktop's baseline (it doesn't), or another program.
  `RECIPE_LLM_API=openai` against Ollama's `/v1` warns in Settings, `/jobs`
  and each import. Non-ASCII text counts a token per character; a full
  context is flagged.
- **40b, test and CI hygiene (#261).** resume-builder's suite 35/35 (was
  28/35: a company line on the view page, a Cancel link, two stale git
  specs) and a path-filtered "Resume builder" CI job. Portfolio's
  production build moved to Turbopack (1.19 GB peak, was out of heap at
  ~4 GB with webpack).
- **40c, quick wins (#265).** `shopping remove --for <slug>` on the CLI and
  MCP (57/43 unchanged); a failed instance rebuild retries at 1, 5 and 15
  minutes; the shared Select and Checkbox inputs on Radix (FormData
  unchanged); **`/export`'s server actions, broken on `main` in production
  builds, fixed** (a type re-export from a "use server" file).
- **40d, term clouds (#263).** Measured: the worst cloud read is 36 ms cold
  on the workstation (~0.2 s on the Pi). **No-go**; reopen when
  `readTagBoard` passes ~100 ms cold (~2,200 recipes);
  `scripts/measure-term-clouds.ts` kept.
- **40e, Thanksgiving.** Above.
- **40f, flakes (#266).** The top CI flakes fixed at the root: hydration
  waits (`expectHydrated`) for menus, git and jobs; a real `aria-controls` /
  `aria-activedescendant` bug in search autocomplete; YouTube preview keyed
  by URL (a third-party race); `test-content`/`test-jobs` isolation; a
  keep-alive socket race; the 60 s shopping cap test now 0.5 s. Open: the
  CMS demo's dev-only `aggregates.spec:265` (1 in 35), and
  `search-query-language.spec:310`.
- **40g, accessibility (#267).** 27 new axe checks (22 signed-in pages,
  `/shopping`, `/git` with a mirror); one `<main>` per page (the sidebar
  layout's own `<main>` wrapped every settings page's); the checkbox border
  from 1.27:1 to 5.6:1 (WCAG 1.4.11); the theme sliders' `aria-label` no
  longer duplicated onto a role-less element (found by CI's dev-mode run).
- **40h, dependencies (#264).** Patch and minor updates (Next 16.4.2 with
  its security fixes, React 19.2.9, lmdb, vitest, MCP SDK, …). Held: zod,
  markdown-to-jsx, simple-git ≥ 3.34 (each breaks a gate). The CI round
  fixed a StrictMode double-mount read on `/jobs` and a missing
  `suppressHydrationWarning` on portfolio's `<html>`; `agentRules: false`
  stops `next dev` writing `AGENTS.md`.

### The overnight OOM (2026-10-17, 03:59)

One heavy job (the orchestrator's own host-side portfolio Playwright run, to
regenerate a baseline) grew ~20 GB in 7 minutes across many processes. The
heavy slot admits by free memory but never bounded a job, and every job ran
in Roger's graphical session's cgroup; earlyoom (per process) killed
parakeet twice, then systemd-oomd killed the whole `session-2.scope` — the
desktop, every Claude session and the other overnight session. Since then
(orchestrator helpers, not the repo):

- `orchestrator/capped.sh` runs every heavy job in its own `systemd-run
--user --scope` (MemoryMax 8G, MemorySwapMax 2G), outside the session;
  `heavy.sh`, `pw.sh`/`heavy-pw.sh` and the new `heavy-bg.sh` use it. A
  runaway exits 137 alone. No MemoryHigh (it throttles a runaway into a
  crawl that holds the shared slot).
- Workers never call the queue-lock directly (40f's own wrapper had skipped
  the old one); `exit 137` is reported, not retried.
- Visual baselines are regenerated only in Docker: `orchestrator/docker-pw.sh`
  builds the repo's `Dockerfile.playwright` (CI's image and fonts) and runs
  it with `--memory 8g --memory-swap 10g` — `docker-compose.test.yml`
  already said baselines must never be made on the host. 40c's portfolio
  baseline was the first, and CI passed it.
- The other overnight session adopted the same per-job cap.

### Roger to confirm

- **40a:** warn-only for `/v1` (Da5); the 1.2 GB desktop baseline (Da2).
- **40b:** the resume view's on-screen company line (Db1) and the edit form's
  Cancel link (Db2); portfolio's export still builds with webpack (Db5).
- **40c:** the retry schedule and that it covers foreign-HEAD rebuilds (Dc2);
  `/shopping`, `/make` and `/jobs` keep native controls (Dc5); Enter on a
  Radix checkbox no longer submits a form (Dc4).
- **40d:** D3's fan-out clause counted as cache entries, not URLs (Dd1).
- **40e:** the nine recipes tagged `thanksgiving`; no cuisine on the generic
  sides; the Brussels sprouts description rewritten.
- **40f:** the YouTube preview keyed by URL works around a library race
  (Df1).
- **40g:** whether the bar moves to WCAG 2.2 AA (tag-chip target size); the
  `--input` border (1.27:1) on every text field — raising it redraws every
  form.
- **40h:** React 19.3 / Tailwind 4.3 / Prettier 3.9 in a follow-up (Dh1); the
  code changes that would lift the zod, markdown-to-jsx and simple-git
  holds; Playwright 1.64 with new baselines; sharp 0.35.

### Roger's steps

1. `pnpm workstation update` (main checkout). It brings 40a's context sizing
   and wording, 40c's `/export` fix and retry, 40g's checkbox, and 40h's
   dependencies (including Next 16.4.2's security fixes). **No reindex.**
2. The 38g lines in `~/.config/recipe-deploy/uraninite.env`, if not yet done.
3. `pnpm deploy:pi` (carries 39's and 40's code; note the reindex time it
   prints against the warm ~5 s trigger).
4. **After Oct 31:** `pnpm --silent recipes feature --term thanksgiving --slug thanksgiving-2026 --note "Thanksgiving: turkey, sides, pies and drinks"`
   (and unfeature Halloween if wanted).
5. Docker disk: 240 GB of images (180 GB reclaimable) and 186 GB of build
   cache, 85 GB free on `/`. Pruning is Roger's call — some images may be
   the other session's.

### Backlog

Open items each phase named; rows in `backlog.md`.

- 40f: the CMS demo's dev-only `aggregates.spec:265` flake; the
  `search-query-language.spec:310` rail-link click; `resetData`'s retries
  absorb rather than remove the `test-content` race (Tf5).
- 40g: WCAG 2.2 target size for tag chips; the `--input` border contrast;
  `heading-order` on `/search`, `image-redundant-alt` on `/groups`.
- 40h: the three held packages (code changes named above); Playwright 1.64;
  React/Tailwind/Prettier minors; sharp 0.35.
- 40d: term clouds stay a no-go with the reopen trigger above.
- 40e: a cranberry Thanksgiving drink (the Food Network mule had no image).
