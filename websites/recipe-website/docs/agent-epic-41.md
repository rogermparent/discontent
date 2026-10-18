# Epic 41 — Reindex decided, test and CI robustness, dependency and accessibility follow-through, Thanksgiving extras

> **This is the durable source of truth for epic 41.** Read it before
> touching incremental reindex (`RECIPE_INCREMENTAL_REINDEX`), the
> Playwright `resetData` reset and the test endpoints, the CI symlink-chain
> check, zod / markdown-to-jsx / simple-git usage, React, Tailwind,
> Playwright or Prettier versions, the `--input` token or tag-chip sizing,
> or the axe tags the accessibility specs gate on.
> The orchestrator updates the roadmap **Status** column and the **Now**
> line at every phase boundary; workers add their phase's **Results** and
> **Traps** under their own headings, and decision amendments numbered by
> phase letter (`Db1`, `Dc2`). Earlier epics are cited by number with a
> prefix (`40-Tf5`, `29-D4`). Background: `agent-epic-40.md` (its Backlog
> is this epic's list), `agent-epic-29.md` (the incremental plan, 29b–29d,
> and the 39b re-measure), `agent-epic-39.md` (the index-version stamp and
> reindex jobs).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded
· 📝 proposed.

**Now:** wave 1 — 41a (measuring), 41b and 41c in progress; 41g's research
and dry run in the orchestrator.

## Context

Epic 40 closed 2026-10-17 (#259–#269). The workstation was updated and the
Pi deployed on `c1fe69ff`. On first start the Pi rebuilt its indexes cold in
**8.24 s**, right at the ~8 s cold reopen trigger epic 29 restated in 39b.
Epic 40 also left a backlog: test flakes and a reset race (40-Tf5), three
dependency holds that each need a code change, Playwright 1.64, and two
accessibility decisions (the `--input` border, WCAG 2.2 target size).

Roger, 2026-10-17, picked all four directions — reindex measure-then-decide,
test/CI robustness, dependency follow-through, accessibility follow-through
— chose to **take** React 19.3, Tailwind 4.3 and Prettier 3.9, added
Thanksgiving extras, and asked for an unattended run like epic 40.

Intended outcome: a decided reindex question (built or re-deferred with
numbers), a quieter and more honest CI, every dependency current within its
major, every form control at WCAG non-text contrast, the tag-chip target
size settled, and a few more Thanksgiving recipes.

## Decisions

### D1 — Unattended: nothing waits on Roger

Where a phase meets a choice, it takes the conservative, reversible option,
records it in its Results as **"Roger to confirm"**, and keeps going. The
close-out lists every such item. Deploys, the content repo's pushes and
`pnpm workstation update` stay Roger's.

### D2 — Incremental reindex, if built, ships switched off

If 41a says go, 41r1–41r3 build epic 29's plan as written (29b–29d) behind
`RECIPE_INCREMENTAL_REINDEX`, default **off**; explicit rebuilds stay full
(29-D6). Roger turns it on for the Pi after the drill 41r3 specifies.

### D3 — Reindex: measure, then decide

The rule is 29-D4 as restated in 39b: **go** if the Pi's **warm** full
rebuild — the median of at least five `reindex` jobs its `/jobs` records
after foreign HEAD moves, or of five `POST /api/reindex` at idle — passes
~5 s. Otherwise a recorded no-go with the numbers, the cold 8.24 s
explained, and the trigger restated.

### D4 — Dependencies: current within each major

41c lifts 40h's three holds (zod ≥ 4.4, markdown-to-jsx ≥ 9.7, simple-git
≥ 3.34) by changing the code, with the failing tests as the contract and no
expectation changed. Wave 3 takes React 19.3 + Tailwind 4.3 (41d1),
Playwright 1.64 with every baseline regenerated in its image (41d2) and
Prettier 3.9 as an isolated reformat listed in `.git-blame-ignore-revs`
(41d3), in that order. No major moves. Every dependency or Next change is
built once in the main checkout's shape (D6) before it lands.

### D5 — Thanksgiving extras under 40e's rules

41g imports at most 6 recipes under 40-D2 (a named gap, a reputable page
with structured data and an image, no near-duplicate, grounded without
`--allow-partial`, skill-v4 facets plus `thanksgiving`, one commit each,
nothing deleted, features untouched) with no pre-approval round: a
cranberry drink (40e's gap) and 2–4 appetizers or sides from Sally's
Thanksgiving roundup. Each page is fetched once, ≥ 15 s apart per host.

### D6 — Test and build hygiene carried from epic 40

- Every heavy command runs in the capped slot (`heavy.sh`, `heavy-pw.sh`,
  `heavy-bg.sh`); `exit 137` is reported, not retried.
- Visual baselines are regenerated only in the Playwright Docker image
  (CI's), never on the host.
- A new or changed spec runs once in dev mode too (CI's Recipe shards,
  Portfolio and the demo's dev job run `next dev`).
- A dependency or Next change gets a main-checkout-shaped build — the
  symlink chain `export/public → editor/content → outside the workspace`
  — before it lands (#269); from 41b on, CI checks the same shape.

## Roadmap

| Phase    | Size | Branch                | Status | PR  | What                                                                                        |
| -------- | ---- | --------------------- | ------ | --- | ------------------------------------------------------------------------------------------- |
| 41a      | S    | (orchestrator)        | 🟡     | —   | D3: the Pi's warm reindex median, per type; go or a recorded no-go.                         |
| 41b      | M    | `agent/41b-ci`        | 🟡     | —   | `resetData` under the write lock, two dev flakes, the CI symlink-chain check, Docker gates. |
| 41c      | M    | `agent/41c-holds`     | 🟡     | —   | D4: zod ≥ 4.4, markdown-to-jsx ≥ 9.7, simple-git ≥ 3.34 — code changes, holds removed.      |
| 41g      | S    | (content repo)        | 🟡     | —   | D5: a cranberry drink and 2–4 appetizers or sides from Sally's roundup.                     |
| 41f      | M    | `agent/41f-a11y`      | 📝     | —   | `--input` at ≥ 3:1, tag chips at 24 px with WCAG 2.1/2.2 tags, two best-practice findings.  |
| 41r1     | L    | `agent/41r1-apply`    | 📝     | —   | If go: 29b, the engine's `applyContentChanges` and `reprojectDependents`.                   |
| 41r2     | L    | `agent/41r2-changed`  | 📝     | —   | If go: 29c, `reindexChanged` behind `RECIPE_INCREMENTAL_REINDEX` (D2).                      |
| 41r3     | S    | `agent/41r3-drill`    | 📝     | —   | If go: 29d, revalidation, docs, the Pi drill specified for Roger.                           |
| 41d1     | M    | `agent/41d1-react-tw` | 📝     | —   | React 19.3 + Tailwind 4.3; moved baselines regenerated in Docker.                           |
| 41d2     | M    | `agent/41d2-pw`       | 📝     | —   | Playwright 1.64: package, CI images, `Dockerfile.playwright`; every baseline regenerated.   |
| 41d3     | S    | `agent/41d3-prettier` | 📝     | —   | Prettier 3.9 and a repo-wide reformat in its own commit, in `.git-blame-ignore-revs`.       |
| 41-close | S    | `agent/41-close`      | 📝     | —   | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                           |

Ordering, in waves: **wave 1** 41a (light, the orchestrator) ∥ 41b ∥ 41c,
with 41g's research and dry run in the orchestrator alongside; **wave 2**
41f ∥ 41r1 (if go); **wave 3**, in order, each rebasing its baselines on the
one before: 41d1 → 41d2 → 41d3 (after every other code PR), with 41r2 and
41r3 after 41r1 if go; then 41-close.

## How it runs

- One orchestrating session; code phases go to worktree workers, each its
  own PR off fresh `origin/main`, opened ready after a local review. A
  read-only review agent reviews each M/L PR; a worker past ~300k tokens is
  replaced by a fresh finisher. Merge when every check that ran is green and
  the PR is `CLEAN`; merge commit; delete the branch. The next PR merges
  main before it merges. At most two PRs in CI at once.
- Machine memory: D6. At most two heavy workers at once, one heavy command
  each; the machine and the slot are shared with another session.
- Never deploy, never push the content repo, never `pnpm workstation
update`, never commit `editor/content`.

## Phases

### 41a — Reindex: measure, then decide (S, orchestrator)

- D3. Warm samples come from the Pi's read-only `GET /api/jobs?kind=reindex`
  (each foreign HEAD move, such as 41g's commits synced by the workstation,
  makes the Pi rebuild and record a job): median of at least five, with
  per-type step times. Fallback: five sequential `POST /api/reindex` at idle,
  or Roger's one-liner at close if the session may not.
- Results here and in `agent-epic-29.md`'s 39b section.

### 41r1–41r3 — Incremental reindex (L, only if go)

- Epic 29's plan as written: 41r1 = 29b (`applyContentChanges`,
  `reprojectDependents`, reusing `packages/cms/git/indexStamp.ts`); 41r2 =
  29c (`reindexChanged`, diff-driven, full on any doubt, the stamp-hazard
  fix, `withIndexLock`); 41r3 = 29d (revalidation, docs, a Pi drill with 1,
  10 and 100 edits for Roger's morning). D2's switch. Detail:
  `agent-epic-29.md` §29b–§29d, its risks, D5/D6.

### 41b — Test / CI robustness (M)

- **`resetData` at the root (40-Tf5):** the test reset endpoint takes the
  content write lock (`packages/cms/git/writeLock.ts`) or awaits in-flight
  writes before copying the fixture; the EEXIST/ENOTEMPTY retries go once
  redundant.
- **CMS demo `aggregates.spec:265`** (dev-only): the cause from a CI trace or
  a local `--repeat-each 20` in dev; fixed, or recorded and stopped.
- **`search-query-language.spec:310`** (rail link doesn't navigate):
  `expectHydrated` if it's the hydration class, else diagnosed.
- **CI symlink-chain check (#269):** the recipe production-build job links
  `editor/content` and `export/public/{image,uploads}` the way the main
  checkout does, through a link out of the workspace, and fails on
  Turbopack's "Dynamic filesystem access causes tracing of the whole
  project" warning.
- **Docker for local Playwright gates** (orchestrator tooling): a `DOCKER=1`
  mode for `heavy-pw.sh`, its overhead measured against host build mode;
  the contract's default if under ~1.5×.

### 41c — Dependency holds lifted (M)

- D4. zod ≥ 4.4 (the `z.preprocess` blank-to-`undefined` parsers: termForm,
  group scale, the recipe form's drink — 21 tests); markdown-to-jsx ≥ 9.7
  (`<Multiplyable />` in a list item drops the text after it); simple-git
  ≥ 3.34 (`core.sshCommand` and `EDITOR` need its `unsafe` options or a
  safer route — 31 tests). 40h's tilde holds removed; lockfile regenerated
  in the slot; a main-checkout-shaped build.

### 41d1 — React 19.3 + Tailwind 4.3 (M, wave 3)

- Release notes read first; full gates; moved baselines regenerated in
  Docker and each reviewed; a main-checkout-shaped editor build.

### 41d2 — Playwright 1.64 (M, wave 3)

- `@playwright/test`, every CI image tag in `.github/workflows/playwright.yml`
  and `Dockerfile.playwright`'s `FROM` (`scripts/check-playwright-image.sh`
  agrees); every recipe and portfolio baseline regenerated in the new image,
  a sample reviewed, the counts listed; deprecations fixed.

### 41d3 — Prettier 3.9 (S, last code PR)

- The bump, then a repo-wide `prettier --write` in a commit of its own,
  listed in `.git-blame-ignore-revs`; after every other code PR.

### 41f — Accessibility follow-through (M)

- **`--input` at ≥ 3:1 (WCAG 1.4.11)** in the theme derivation, light and
  dark, every neutral family; a ≥ 3:1 sweep in `test/theming.test.ts` beside
  30b's accent sweep; baselines regenerated in Docker.
- **WCAG 2.2 target size (2.5.8):** the recipe-card tag chips
  (`RecipeCardTagHint`) at 24 px; `wcag21aa` and `wcag22aa` added to
  `WCAG_TAGS` (`playwright/support/a11y.ts`), whatever else they flag fixed.
- **Best practice:** `heading-order` on `/search`, `image-redundant-alt` on
  `/groups`. Portfolio's accessibility and visual specs too (shared tokens).

### 41g — Thanksgiving extras (S, real repo)

- D5. Candidates researched and drafted (`import --dry-run --llm off
--out`), a scratch-clone dry run reviewed, then the real apply with the
  workstation stopped and restarted, then `POST /api/revalidate`. Counts
  before and after; a review list for the close-out; the `feature --term
thanksgiving` command for after Oct 31.

### 41-close (S)

- Close-out led by 41g's review list and the reindex decision; what
  shipped; "Roger to confirm"; Roger's steps (`pnpm workstation update`,
  `pnpm deploy:pi`, the incremental switch if go, the Thanksgiving feature
  after Oct 31, Docker disk); CLAUDE.md bullet; backlog rows; memory.

## Verification

- Every PR: `pnpm --filter recipe-editor typecheck`, `pnpm --filter
recipe-website exec tsc --noEmit`, `pnpm exec vitest run` (with counts),
  the touched specs by name in build mode and new checks once in dev mode —
  all through the capped wrappers — then CI green and `CLEAN`.
- 41a: at least five warm Pi `reindex` jobs (or five POSTs); median and
  per-type times; the decision by D3.
- 41r1–41r3 (if go): incremental equals full, logically (29-D3); the
  fallbacks forced (version mismatch, a too-large diff, a merge in
  progress); switch off = unchanged behaviour; the Pi drill specified.
- 41b: a test for a write in flight during a reset; the formerly flaky specs
  pass `--repeat-each 10` in dev and build; the symlink step shown failing
  once on a branch without one of #269's annotations, then passing; the
  Docker overhead recorded.
- 41c: the tests that failed under each new version pass with no
  expectation changed; a main-checkout-shaped build.
- 41d1–41d3: full suites; moved baselines listed and reviewed (Docker only);
  the lockfile diff checked for unexpected majors; 41d3's reformat isolated.
- 41f: the contrast sweep; axe with the 2.1/2.2 tags green in dev and build;
  baselines regenerated in Docker and reviewed.
- 41g: the rules per candidate; the dry-run diff reviewed; the counts; the
  pages checked on the workstation.

## Traps

## Results
