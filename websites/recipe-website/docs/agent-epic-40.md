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

**Now:** started 2026-10-17 (overnight, unattended); 39f applied; wave 1 —
40a ∥ 40b, 40e research alongside.

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
| 40e      | S–M  | (content repo)     | 🟡     | —   | D2: Thanksgiving gaps — gravy, greens, mac and cheese, cornbread, leftovers, drinks.       |
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

### 40e

### 40f

### 40g

### 40h

## Results

### 40a — Import / LLM polish

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

### 40e — Thanksgiving

### 40f — Flake hunt

### 40g — Accessibility coverage

### 40h — Dependency updates

## Close-out
