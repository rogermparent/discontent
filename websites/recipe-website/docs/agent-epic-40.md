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

### 40b

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

### 40e

### 40f

### 40g

### 40h

## Results

### 40a — Import / LLM polish

### 40b — Test / CI hygiene

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

**Roger to confirm:**

- The schedule (Dc2) and that it covers foreign-HEAD rebuilds, not only
  the start-time one.
- The native/Radix line (Dc5): `/shopping`, `/make` and `/jobs` keep native
  controls for now. The phone-first shopping page keeps the OS pickers.
- `/export`'s server actions failed on `main` (Tc4), seen for Save in a
  production build. Build and Deploy are inferred to fail too (same action
  entry; not run here). A workstation update brings the fix.

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
