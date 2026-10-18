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

**Now:** 41a decided (**no-go**, warm Pi median 3.72 s) and 41g applied
(`tag:thanksgiving` 47 → 51); 41b and 41c in progress; 41r1–41r3 deferred.

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
| 41a      | S    | (orchestrator)        | ✅     | —   | D3: the Pi's warm reindex median, per type; go or a recorded no-go.                         |
| 41b      | M    | `agent/41b-ci`        | 🟡     | —   | `resetData` under the write lock, two dev flakes, the CI symlink-chain check, Docker gates. |
| 41c      | M    | `agent/41c-holds`     | 🟡     | —   | D4: zod ≥ 4.4, markdown-to-jsx ≥ 9.7, simple-git ≥ 3.34 — code changes, holds removed.      |
| 41g      | S    | (content repo)        | ✅     | —   | D5: a cranberry drink and 2–4 appetizers or sides from Sally's roundup.                     |
| 41f      | M    | `agent/41f-a11y`      | 📝     | —   | `--input` at ≥ 3:1, tag chips at 24 px with WCAG 2.1/2.2 tags, two best-practice findings.  |
| 41r1     | L    | `agent/41r1-apply`    | ⏸️     | —   | If go: 29b, the engine's `applyContentChanges` and `reprojectDependents`.                   |
| 41r2     | L    | `agent/41r2-changed`  | ⏸️     | —   | If go: 29c, `reindexChanged` behind `RECIPE_INCREMENTAL_REINDEX` (D2).                      |
| 41r3     | S    | `agent/41r3-drill`    | ⏸️     | —   | If go: 29d, revalidation, docs, the Pi drill specified for Roger.                           |
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

### 41b

- **Tb1 — a new `ENOTEMPTY` or `EEXIST` in `resetData` names a writer that
  bypasses the write gate.** The retries that hid it are gone from
  `test-content`. Route the writer through `trackContentWrite` (or
  `withWriteLock`, which does); don't add the retry back. The job store's
  kept readings still retry: import jobs outlive their test and aren't
  content.
- **Tb2 — a client-side navigation moves the URL only when the destination
  arrives.** Under `next dev` a route's first visit compiles it first, so
  `expect(page).toHaveURL` (5 s) after a `Link` click can lose to the
  compile early in a shard. Wait with `page.waitForURL`, which is bounded
  by the test like `goto`.
- **Tb3 — the editor's `next build` can fail in CI's new "Recipe build
  (main-checkout shape)" job without a warning line.** With the links in
  place, Next 16.4 hard-errors ("the symlink target leaves the filesystem
  root") before it prints the tracing warning; the grep is the guard for a
  Next that only warns. Either way the fix is the same:
  `/*turbopackIgnore: true*/` on the new runtime fs call.
- **Tb4 — the write gate is keyed by the directory as spelled.** Every
  server caller spells it from `getContentDirectory()`. A write that passes
  another spelling (a realpath, a trailing slash) is a different gate: not
  held by a reset, and — when the write it is nested in used the other
  spelling — not recognised as nested, so a hold refuses it part-way
  through that write (`ContentWritesHeldError`).
- **Tb5 — `ContentWritesHeldError` in a server log during a run is the gate
  working.** It names a write the previous test left behind that arrived
  while the next test's fixture went in (a page render's image transform
  degrades to the placeholder). In a test's _own_ write it means that test's
  reset never released its hold: `withWritesHeld` fails the reset when the
  release doesn't answer `released: true`, so look for an earlier failure.

### 41c

- **Tc1 — zod ≥ 4.4 breaks `z.coerce.boolean()` on an absent key, not
  `z.preprocess`.** 40h named the preprocess parsers, but the failing path
  in all 21 tests is an unticked checkbox (`clearImage`, `clearVideo`, a
  timeline event's `activeTime`): the key is missing from the parsed
  FormData, and `z.coerce.boolean()` alone used to read that as `false`.
  Since 4.4 it fails with "expected nonoptional, received undefined". The
  error names optionality, which points at the wrong construct. A repro of
  every pattern in the workspace under 4.3.6 and 4.6.7 shows this is the only
  one that changed.
- **Tc2 — simple-git ≥ 3.34 checks every env handed to `.env()`, inherited
  variables included.** A plain `simpleGit()` inherits `process.env`
  unchecked, but `.env({ ...process.env, X })` is inspected whole. The
  shell's `EDITOR` (in most shells), a test's `GIT_CONFIG_GLOBAL=/dev/null`
  and a desktop's `SSH_ASKPASS` are all refused. `.env()` also sets the env
  on the instance, so every later call on it fails too (`revert --abort`,
  `reset --hard`, `status`), which is why the failures looked so varied. The
  "safer routes" don't exist in 3.36: `-c core.sshCommand=…` and
  `-c core.editor=…` are refused under the same flags as the env variables.
  Use `gitWithEnv` (`controller/curation/gitEnv.ts`).
- **Tc3 — markdown-to-jsx ≥ 9.7: a self-closing component that starts a
  list item or a blockquote line takes the rest of the line as children.**
  `- <Multiplyable baseNumber="1/2" /> cup sugar` compiles to
  `<li><Multiplyable>cup sugar</Multiplyable></li>`, with the space after the
  tag consumed. 9.6.1 gave the tag plus a sibling `<p>cup sugar</p>`. At top
  level or mid-line the tag is still childless. Any override for a
  self-closing tag has to render its children (`withCapturedLine`), or the
  rest of the line disappears from the page as well as from the index text.

## Results

### 41a — Reindex: measured, no-go

**Decision: no-go.** The Pi's warm full rebuild has a median of **3.72 s**
over five jobs, under D3's ~5 s. 41r1–41r3 stay ⏸️ deferred, and epic 29's
plan stays as written.

**Method.** The samples are read-only, from the Pi's `GET
/api/jobs?kind=reindex` and `GET /api/jobs/<id>`. Each `reindex` job
records a `reindex.<type>` step, so no drill was needed. The five warm
samples are 41g's four commits and one rebuild started from the editor (19:58). 41g's commits were spaced 4 minutes apart (Dg1),
so the workstation synced each one by itself and the Pi rebuilt once per
foreign HEAD move, about 18 s after each commit. The fallback (five `POST
/api/reindex`) was not needed. Corpus: 797 recipes, 24 featured, 135 term
records, Pi on `c1fe69ff`.

| Job (2026-10-17, EDT)          | Trigger          | Job ms | Index ms | recipes | featured | pages | groups | tag-terms |
| ------------------------------ | ---------------- | ------ | -------- | ------- | -------- | ----- | ------ | --------- |
| 19:03 start-time (cold)        | no index version | 8242   | 6876     | 5850    | 431      | 95    | 215    | 202       |
| 19:03 deploy's `POST` (waited) | API              | 8423   | —        | —       | —        | —     | —      | —         |
| 19:58                          | editor           | 4733   | 4366     | 3357    | 371      | 85    | 212    | 176       |
| 23:11                          | HEAD moved       | 4253   | 4046     | 3139    | 312      | 103   | 171    | 161       |
| 23:15                          | HEAD moved       | 3928   | 3722     | 2731    | 354      | 99    | 200    | 168       |
| 23:19                          | HEAD moved       | 3843   | 3638     | 2613    | 389      | 88    | 225    | 159       |
| 23:23                          | HEAD moved       | 3816   | 3604     | 2655    | 295      | 113   | 211    | 167       |
| **warm median (5)**            |                  | 3928   | **3722** | 2731    | 354      | 99    | 211    | 167       |

**The cold 8.24 s was one rebuild, not two.** It was the deploy's first
start with 39b's index-version stamp ("no index version recorded yet"),
running while the container booted. About 1.3 s passed before its first
step (module loading and the lock), then 6.88 s of index time. Recipes took
5.85 s cold against 2.7 s warm: a cold SD-card page cache and an un-JITted
process. `deploy-pi.sh`'s `POST /api/reindex` arrived 0.1 s later. It
waited 8.1 s in the repository's queue line (39b's per-repo line, as
designed), then skipped as "already fresh: built from 5ff24c2". The 8.24 s
the deploy printed was that wait, and the instance's own job was 8.18 s.
Nothing raced. Cold is about 1.85× warm on the Pi.

**Da1 — the triggers, restated.**

- **Reopen 29b–29d** when the Pi's **warm** median, read the same way from
  `/jobs`, passes ~5 s. At ~4.7 ms a recipe (3.72 s / 797), that is about
  **1,050 recipes**, sooner than 39b's estimate of ~1,300, because 39b
  under-guessed the Pi's warm cost (3.1 s predicted for 787 recipes).
- **Drop the cold ~8 s clause.** Cold runs about 1.85× warm, so a cold
  8 s fires near a warm 4.3 s, before the warm trigger means anything. A
  cold deploy rebuild only happens on a deploy that moves the index
  version, or on a container's first start.
- **If cold start time is the concern,** the cheaper fix is shipping
  indexes built on the workstation, stamped with the matching index
  version (the old deploy path), so the start-time rebuild finds them fresh
  and skips. Incremental reindex would not help there: a version move
  always means a full rebuild (29-D5).
- Heap during a rebuild stays a separate trigger. Nothing on the Pi has
  shown pressure.

**The workstation** was not re-measured. 39b's production number (~0.7 s
for 787 recipes) is inside D4's half of the rule.

### 41b — Test / CI robustness

**Reindex needed: no. Deploy: none needed** (the engine change is a
per-process counter on the write path; nothing pauses writes outside the
test routes).

**1. `resetData` at the root (40-Tf5).** The race was wider than the write
lock could close. Outside a git repository `withWriteLock` takes no lock at
all, and most fixtures aren't repositories. Image transforms also write into
the content directory (`transformed-images`) from a page render, with no
lock. So the fix is a per-process **write gate** in the engine,
`packages/cms/fs/writeGate.ts`:

- `trackContentWrite(dir, op, fn)` counts a write in flight until it
  settles, and **refuses** a write that arrives while the gate is closed:
  `ContentWritesHeldError` ("Content writes into … are held for a test
  reset: "<op>" was refused, not queued."), Db7. Every `withWriteLock` goes
  through it (repository or not), and so does
  `getTransformedUploadImageProps` (every recipe, group and term image).
- Re-entrant through `AsyncLocalStorage`: a write nested in a running one
  is counted but never refused, so a closed gate neither fails a write
  half-way nor deadlocks a pause. Like `writeLock.ts`'s `hold.active`, the
  scope is `{active}` and drops when the outer write settles, so a
  fire-and-forget task it left running meets the gate like any other write.
  `outsideWriteLock` leaves the gate's scope too, so background work (the
  index flush retry) is refused by a closed gate — and retried on its own
  schedule.
- `pauseContentWrites` closes the gate and waits for the in-flight count to
  reach zero. After 20 s it gives up with `WritesStillRunningError`, which
  names each running write's `op`, and reopens the gate.
- `holdContentWrites` / `releaseContentWrites` split a pause across two
  requests. The hold answers an id; only a release naming it ends the hold,
  so a stale or repeated release (an earlier hold's, or one after a newer
  hold replaced it) changes nothing. A hold that is never released ends by
  itself after 30 s and logs a warning naming its id.
- The state lives on `globalThis` (`Symbol.for`), because Next may bundle the
  module once per server layer, and a route handler has to pause the gate
  that server actions use.

The harnesses use it like this:

- **Recipe editor.** `GET /settings/test-hold-writes` (TEST_MODE only,
  `force-dynamic`) holds the server's writes and answers `{held, hold: id}`,
  or 503 with the stuck ops if they don't drain. The `resetData` and
  `loadGitFixture` fixtures, and `.auth.setup.ts`'s first reset, go through
  `withWritesHeld` (`support/test.ts`): hold, reset from the test process,
  then `test-invalidate-cache?hold=<id>`, which releases that hold and
  answers `released`. The release always runs; when the reset threw, the
  reset's error is the one raised (a failing release doesn't mask it);
  otherwise a release that fails or answers `released: false` (the hold had
  timed out) fails the reset. Without `?hold` the invalidation releases
  nothing, so the other fixtures that invalidate can't end a hold.
- **CMS demo.** The same pair is `POST /test/hold-writes` and
  `/test/reset-cache?hold=<id>`, with the same checks. The one-shot
  tolerance on the first reset now covers both calls. The hold route is
  ungated, like `reset-cache` (Db8).
- **The retries.** The `ENOTEMPTY` `maxRetries` and the `EEXIST` copy loop
  are gone from `test-content` in both suites; the remove and the copy are
  plain. The job store's `readings/` and `photos/` keep `fs.rm`'s retries.
  Import jobs outlive their test and write there without the gate, because
  they aren't content (Db2, Tb1).

**Test** (`test/writeGate.test.ts`, 14 cases). A control shows that a reset
which doesn't hold writes lets the previous test's late aggregate into the
next corpus. Then, with a write in flight, the real `test-hold-writes` route
handler doesn't answer until the write finishes, the remove-and-copy lands
the fixture intact (no `ENOTEMPTY`, no `EEXIST`, no stray file), and the
real `test-invalidate-cache` route, naming the hold, releases it. The other
cases:

- a write that arrives during a reset is refused, and only the fixture is
  in the directory after the release (the 40-Tf5 leak, closed);
- a nested write is neither refused nor deadlocks a pause;
- work `outsideWriteLock` schedules from inside a write is refused by a
  closed gate, while a nested write in the same write runs;
- a fire-and-forget task a finished write left running is refused once
  that write has settled (the `active` scope);
- a write that throws (tracked, or nested in a locked one) leaves nothing
  counted in flight;
- a git repository's writes are covered the same way;
- the timeout names the stuck write and reopens the gate;
- an unreleased hold ends by itself, warns with its id, and its id then
  releases nothing;
- a new hold replaces the one in force, and the old id releases nothing;
- the invalidation route releases nothing without `?hold` and answers
  `released: false` for a stale id;
- the hold route answers 404 without TEST_MODE and holds nothing;
- an image transform refused by a hold returns no props (the placeholder)
  with a warning, and writes no `transformed-images`.

**2. CMS demo `aggregates.spec` retagging (formerly :265, now :271).
Unexplained; recorded and stopped (Db4).** The CI record is in 80
`playwright.yml` runs (scratch `tmp/41/41b/ci/`):

- **16 dev-cell failures, every one the job's test #7.** That is the first
  run of the retagging test in the suite, about a minute into the dev
  server's life. Each was a 30 s timeout waiting for the Edit link on
  `/notes/a`, and each retry passed.
- **Two more were one-offs:** `aggregates.spec:154`, also test #3, also
  early.
- **None in the 7 runs since 40f.** Its strict `createNote` would now fail
  at the create.
- **No trace exists for any of them.** `trace: on-first-retry` records only
  the passing retry, and the demo job uploaded nothing.

Locally, with the write gate in place, neither repro failed: dev
`--repeat-each 20` passed 140/140, and the full demo suite in dev on a cold
`.next` (no Turbopack cache, like CI) passed 109/109. That was two runs, the
budget. The test before #7 deletes the same slug (`a`), so the reset race is
a candidate cause, but that is unproven. If it was the cause, the gate fixes
it.

To make the next occurrence diagnosable, the demo's config keeps every
failed attempt's trace on CI (`retain-on-failure`), and the demo job uploads
`test-results` (`demo-test-results-<mode>`, 14 days) when there is any. No
timeout was raised.

**3. `search-query-language.spec:310`: not the hydration class (Db3).** All
three CI failures (2026-10-16, shard 4) had the same shape:

- **The click ran 33–38 s into the shard.** The chip was clicked and
  focused, and the URL stayed `/search` for 5 s.
- **The retry's trace shows the payload was the wait.** The
  `/group/week-of-may-4` payload came back in 65 ms on the retry, once the
  route was compiled.

Early in shard 4, the click is the dev server's first visit to
`/group/[slug]`, and the URL moves only when the payload arrives. Hydration
was already proven, since the field had just taken typed queries. The spec
now waits with `page.waitForURL(…)`, a navigation wait bounded by the test,
rather than `toHaveURL`'s 5 s.

**4. CI symlink-chain check (#269).** No CI job built the recipe editor in
production: the Recipe shards run `next dev` and resume/demo build their own
apps. So the check is a new, small job in `playwright.yml`, **"Recipe build
(main-checkout shape)"**, behind the existing `recipe` path filter (Db5):

- **Links.** It points `editor/content` at `$RUNNER_TEMP/content`, outside
  the workspace, with empty `transformed-images/` and `uploads/`. It makes
  `export/public/{image,uploads}` absolute links through
  `…/editor/content/…`, which mirrors the main checkout's targets.
- **Build.** It runs `pnpm build` in the editor with the output teed to a
  log, and fails on "Dynamic filesystem access causes tracing of the whole
  project".
- **No fixtures.** The build reads no content.

**Local proof** (the worktree, scratch links outside the workspace, the
editor build through `heavy.sh`):

- With #269's annotations, the build is clean: no warning, exit 0.
- Without the annotation on `writeLock.ts`'s `stat(full)`, the build fails
  with exit 1 and `TurbopackInternalError … the symlink target leaves the
filesystem root`.
- With the same change and no links, the build passes but the grep catches
  "Dynamic filesystem access causes tracing of the whole project" at
  `writeLock.ts:277`, and the step exits 1.

The links were removed afterwards and never committed. **CI proof (PR
#272):** a throwaway commit without `writeLock.ts`'s annotation
(`beb44c8d`) failed the new job in 37 s with #269's exact error — "Symlink
websites/recipe-website/export/public/image could not be resolved: the
symlink target leaves the filesystem root" on `packages/cms/git/writeLock.ts
[instrumentation]` (run 39097332792, job 117586403735). Its revert
(`6f8255e1`) is the PR's next run, which passes.

**It builds the editor only, as the workstation does.** `pnpm workstation
update` (`scripts/workstation-editor.sh`'s `build`) runs `pnpm --filter
recipe-editor build` and nothing else, and `deploy:pi` builds the editor
image. **Known gap:** the export app (`websites/recipe-website/export`) is
not built in that shape. It is built on demand, from the editor's `/export`
page (`buildExport` in `exportAction.ts`, which makes the
`public/{image,uploads}` links through the content directory itself and
runs the export's `next build`). Those are the links that left the
workspace in #269, so a runtime fs call in code the export traces could
fail that Build the same way, and CI wouldn't see it. Not added here: the
export's build reads the content's indexes to render its pages, so an empty
content directory would test a different build, and a fixture-backed one
is more than a cheap step. Reopen if a `/export` Build fails on tracing,
or if the export build joins a deploy.

**Decisions.**

- **Db1** — The reset waits on a **gate** in the engine, not on the write
  lock. The lock is per git repository and absent outside one, while the
  gate covers every write path in the process (and image transforms). The
  harness doesn't take the lock from the test process either: the lock file
  lives in `test-content/.git`, which the reset deletes.
- **Db2** — The retries stay for the job store's kept readings only. Those
  directories are written by import jobs that legitimately outlive their
  test (accessibility.spec says so), and they aren't content.
- **Db3** — `waitForURL` for a click-driven navigation, not a raised
  `toHaveURL` timeout. It waits for the event that matters, bounded like
  `goto`.
- **Db4** — The demo flake stays open with better instruments (failed-attempt
  traces uploaded) rather than a speculative fix. The write gate may well be
  that fix. **Roger to confirm**: close it if a few weeks of CI show no
  instance.
- **Db5** — The symlink check is its own job (about 4 minutes, beside the
  shards), not a step in a Recipe shard. It keeps a failure's meaning
  obvious and puts no build on a shard's critical path. A full recipe run is
  now about 12 jobs.
- **Db6** — Docker is the worker contract's default for local Playwright
  gate runs (`heavy-pw.sh` with `DOCKER=1`); host build mode is the
  fallback. See "Orchestrator: Docker gate runs" below.
- **Db7** — A closed gate **refuses** a write; it doesn't queue it. The
  first cut made a late write wait at the gate and run after the release —
  against the next test's fixture, which is exactly the 40-Tf5 leak. With
  `workers: 1` no legitimate write arrives during a reset: anything that
  does belongs to a test that has finished. The image transform is refused
  too rather than deferred and dropped or run without writing its file:
  `getTransformedUploadImageProps` already turns a failure into a warning
  and `undefined`, so the render — the previous test's page, which no one is
  looking at — shows the placeholder instead of 500ing, and no variant lands
  in the new fixture. Skipping just the file write would have rendered
  `<img>` URLs with nothing behind them.
- **Db8** — The demo's `POST /test/hold-writes` is ungated, matching
  `/test/reset-cache`. The demo has no test mode: its `:test` scripts only
  point `CONTENT_DIRECTORY` at `test-content`, and the app isn't deployed.
  A hold on a non-test demo server would refuse writes for at most 30 s.

**Gates.** All of these ran through the capped wrappers. Playwright ran in
Docker (CI's image) unless marked host.

- `pnpm --filter recipe-editor typecheck` ✅;
  `pnpm --filter recipe-website exec tsc --noEmit` ✅; the demo's
  `tsc --noEmit` ✅.
- `pnpm exec vitest run`: **2349/2349** (115 files), before the review
  fixes; after them, `test/writeGate.test.ts` **14/14** (the full suite is
  CI's lint job's).
- Recipe, build mode:
  - `search-query-language.spec --repeat-each 10`: **190/190**, none flaky.
  - The reset-heavy set once (empty-state, featured-recipes, tag-pages,
    sticky-chrome, groups, git, photo-import): **158/158**.
- Recipe, dev mode: `search-query-language.spec --repeat-each 10`:
  **190/190**.
- CMS demo, `PLAYWRIGHT_PORT=3021`:
  - `aggregates.spec --repeat-each 10`, build: **70/70**.
  - `--repeat-each 20`, dev (host): **140/140**.
  - Full suite, dev, cold `.next` (host): **109/109**.
- The editor build in the main checkout's shape: clean with #269's
  annotations; caught twice without one (above).

**Orchestrator: Docker gate runs.** The orchestrator added a `DOCKER=1`
mode to `heavy-pw.sh` (orchestrator tooling, not in the repo), built on
`docker-pw.sh`: the same specs in CI's Playwright image (fonts, Chromium),
production mode, the same log contract and heavy slot. Bench (2026-10-17,
origin/main d35a85ff, `git.spec` + `shopping.spec`, e2e + mobile, one slot
hold, load about 4–5 with Archilyzer active):

| Run                                           | Time  | Passed | vs host |
| --------------------------------------------- | ----- | ------ | ------- |
| Host build mode (`pw.sh`, `PLAYWRIGHT_BUILD`) | 145 s | 41     | 1.00×   |
| Docker, image cached                          | 151 s | 41     | 1.04×   |
| Docker after a source change (17 s rebuild)   | 168 s | 41     | 1.16×   |
| Docker, a worktree's first run (115 s build)  | 266 s | 41     | 1.83×   |

The image build (115 s) happens once per worktree or lockfile change; a
source change re-runs only `COPY . .`. Under the ~1.5× bar for every run
but a worktree's first, so Docker became the contract's default (Db6).

### 41c — Dependency holds lifted

Branch `agent/41c-holds`. 40h's three holds are lifted by code changes, and
sharp moves to 0.35. Every test that failed under a new version passes with
no expectation changed. **Reindex needed: no.** The indexed description text
can only gain words, and only for a list item that starts with a quantity.
**Deploy:** Roger's `pnpm workstation update`, and the next `pnpm deploy:pi`.

| Package           | Old → new       | Range now | Red → green                                                                                  |
| ----------------- | --------------- | --------- | -------------------------------------------------------------------------------------------- |
| `zod`             | 4.3.6 → 4.6.7   | `^4.6.7`  | 21: `termForm` 15, `groups` (scale) 4, `parseRecipeForm` (drink) 2                           |
| `markdown-to-jsx` | 9.6.1 → 9.10.3  | `^9.10.3` | 1 (40h's count): `flattenMarkdown` "keeps quantities inside prose…"; plus 3 new              |
| `simple-git`      | 3.33.0 → 3.36.0 | `^3.36.0` | 31: `curationGit`, `siteWrites`, `instance`, `piSync`, `annex`, `mcp`, `mcpHttp`; plus 3 new |
| `sharp`           | 0.34.5 → 0.35.5 | `0.35.5`  | none failed; no code change                                                                  |

**zod.** The cause is Tc1. `@discontent/cms/forms/schema/checkbox` is
`z.coerce.boolean().default(false)`: absent → `false`, `""` → `false`,
`"on"` → `true`, the same results 4.3.6 gave. It replaces the five bare
`z.coerce.boolean()` fields: the recipe form's `clearImage`, `clearVideo`
and timeline `activeTime`, the group form's `clearImage` and the term form's
`clearImage`. The two `z.preprocess` fields in `projects-collection`
(`status`, `links`) preprocess into an optional inner schema, which behaves
the same in both versions. Its `z.coerce.boolean().optional()` fields are
unaffected. `termForm`, `groups` and `parseRecipeForm`: 69 tests pass.

**markdown-to-jsx.** The cause is Tc3. Under 9.10.3 the page lost the text
as well as the index: `Multiplyable` rendered only its number, so the recipe
page and the form preview showed "1/2" for that list item.
`withCapturedLine` (`View/Multiplier/Multiplyable/capturedLine.tsx`) renders
the number, a space, then any children. `Multiplyable` (every unit mode) and
the form's `DummyMultiplyable` use it. `flattenMarkdown`'s `Multiplyable`
branch appends the flattened children the same way. New
`test/multiplyableListItem.test.tsx` covers the form preview, the recipe page
scaled ×2 through `?scale=2`, and a lone number. All three fail without the
fix. Sweep: all 317 markdown strings in the Playwright fixtures (descriptions,
ingredients, instructions, notes) compile to the same tree under 9.6.1 and
9.10.3, ignoring empty `props` objects. None starts a list item with a
`Multiplyable`, so the change shows only in the new tests.

**simple-git.** The cause is Tc2. `gitWithEnv(options, added, unsafe)` is a
fresh `simpleGit` running with `process.env` plus `added`:

- It drops `EDITOR`, `GIT_EDITOR`, `GIT_SEQUENCE_EDITOR`, `PAGER` and
  `GIT_PAGER`. Every command that runs with an env is non-interactive
  (`revert --no-edit`, `merge --no-edit`, `reset`, `status`, `fetch`,
  `push`) and has no tty, so nothing needs `allowUnsafeEditor` or
  `allowUnsafePager`.
- It keeps any other refused variable the process inherited and allows that
  category for this git only. That is the same environment every plain call
  already gives git.
- Whatever the caller adds is allowed only by name at the call site. Sync's
  keepalive `GIT_SSH_COMMAND` (39b) passes `allowUnsafeSshCommand`, with a
  comment.

It replaces the four `.env({ ...process.env, … })` sites: `gitRevert`'s and
`gitPull`'s author, `statusAsIfFlushed`'s scratch index and sync's
`networkGit`. Each now gets its own instance, so the author env no longer
leaks onto the abort, reset and status calls that follow on the shared one.
Two tests' setup changed, with no expectation touched (Dc2).
`test/gitEnv.test.ts` is new (3 tests): editor and pager dropped, an
inherited `GIT_CONFIG_GLOBAL` kept, and an added `GIT_SSH_COMMAND` refused
unless named. The seven files: 205 tests pass.

**sharp.** 40h held it as a 0.x minor outside D4, not because it failed.
0.35.5 (libvips 8.18.7) installs with no code change. The direct pins in nine
`package.json`s now match the sharp Next 16.4.2 already brings, so the
editor image ships one sharp for our code and for Next's. 0.34.5 stays in
the lockfile only for netlify-cli's `ipx`.

**Lockfile.** The `packages:` diff is these five version moves plus simple-git's
two new parsers, `@simple-git/args-pathspec` 1.0.4 and
`@simple-git/argv-parser` 1.1.1. There is no new major line. simple-git
4.0.2 is out but is a major, so not considered (D4).

**Decisions.**

- **Dc1 — Absent checkbox = `.default(false)`, in one shared schema.** This
  states the absent case outright instead of relying on coercion, which
  4.4 removed. It lives in `@discontent/cms/forms/schema` beside
  `dateEpoch`.
- **Dc2 — `gitWithEnv`: drop what the commands can't use, keep what the
  process inherited, name what we add.** The rejected options were a minimal
  hand-built env (it would lose `PATH`, `HOME` and the person's ssh setup)
  and allowing every category at every site (too broad). Test setup changes,
  not expectations: `instance.test`'s "ssh keepalives" writes the person's
  `core.sshCommand` through a git with `allowUnsafeSshCommand`, and
  `mcpHttp.test`'s no-identity repository is set up through `gitWithEnv`.
  Its scrubbed `GIT_CONFIG_GLOBAL=/dev/null` is exactly an inherited refused
  variable.
- **Dc3 — A `Multiplyable` that starts a list item renders its line
  inline.** The result is "1/2 cup sugar" on one line. 9.6.1 showed the
  number, then "cup sugar" as a paragraph on the next line inside the same
  item. Reproducing that would mean rebuilding the parser's old tree in a
  `renderRule`, against AST internals.
- **Dc4 — Carets restored** for zod, markdown-to-jsx and simple-git (their
  pre-40h form). sharp keeps its exact pin.

**Gates** (local, every heavy step through the slot):

- `pnpm --filter recipe-editor typecheck`: clean.
  `pnpm --filter recipe-website exec tsc --noEmit`: clean. Portfolio editor
  `pnpm typecheck`: clean.
- `pnpm exec vitest run`: 116 files, 2348 tests passed.
- Main-checkout-shaped build (D6): the worktree's `editor/content` linked to
  a scratch directory outside the workspace, and `export/public/{image,uploads}`
  as absolute links through it. The editor's `next build` passed. Neither
  "Dynamic filesystem access" nor "leaves the filesystem root" appears in
  the log. The links and the scratch directory were removed afterwards.
- Playwright, build mode in CI's image (`DOCKER=1 heavy-pw.sh`), on the
  `e2e` and `mobile` projects. Specs: `recipe`, `yield`,
  `ingredient-preview`, `git`, `groups`, `term-edit`, `new-recipe`, `edit`,
  `timeline`, `photo-import`, `visual` and `lexical-smoke`. 194 passed in
  6.6 min. That includes `visual`'s 22, with every screenshot baseline
  unchanged on sharp 0.35.
- Playwright, dev mode once (`docker-pw.sh` without `PLAYWRIGHT_BUILD`),
  for the specs over the changed form, markdown and git paths: `recipe`,
  `yield`, `ingredient-preview`, `git`, `term-edit` and `timeline`. 77
  passed in 6.1 min.

**Roger to confirm.**

- Dc3: inline "1/2 cup sugar" in a list item that starts with a quantity,
  instead of 9.6.1's line break.
- How many real recipes have a list item that starts with a `Multiplyable`?
  Fixtures have none, and the real repo is off-limits to this phase. A
  read-only grep of the content repo for `^\s*[-*+>] <Multiplyable` (or
  `\n- <Multiplyable` inside the JSON strings) would answer it. Each such
  item regains its text on the page and in search.

### 41g — Thanksgiving extras

**Applied 2026-10-17** to the real repo, `5ff24c2b` → `34e72323`, four
commits. The session pushed nothing: the workstation's sync carried each
commit to the Pi. `tag:thanksgiving` went **47 → 51**, `tag:drink` 220 →
222, `tag:snack` 39 → 41. D5 and 40-D2 applied as in 40e:

- Each page was fetched **once** into a draft (`import --dry-run --llm off
--out`), sequentially, ≥ 20 s apart. Every page had JSON-LD, so there was
  no model read.
- Drafts were edited: skill-v4 facets plus `thanksgiving`, drinks by the
  skill's drink rules, generic-first ingredient names.
- The drafts were created into a scratch clone, and its `git log` was
  reviewed: four creates, each touching only its `recipe.json` and one
  image of 700–1500 px.
- The same files were then applied to the real repo, followed by `POST
/api/revalidate`. Each page answers 200 on the workstation and appears
  on `/tags/thanksgiving`.

**Imported (review list for Roger):**

| Gap               | Recipe (slug)                                                                         | Source                                                     | Commit     |
| ----------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------- |
| A cranberry drink | Cranberry Moscow Mule (Spend With Pennies) (`cranberry-moscow-mule-spendwithpennies`) | Spend With Pennies — vodka, highball, `moscow-mule` family | `eb08a382` |
| Appetizers        | Cranberry Brie Puff Pastry Tarts (`cranberry-brie-puff-pastry-tarts`)                 | Sally's Baking (the 40-item sides roundup)                 | `103954b6` |
| Appetizers        | Cranberry Pecan Cheese Ball (`cranberry-pecan-cheese-ball`)                           | Sally's Baking (the same roundup)                          | `50193b51` |
| A cranberry drink | Cranberry Thyme Spritzer (Rachel Cooks) (`cranberry-thyme-spritzer-rachelcooks`)      | Rachel Cooks — zero-proof, highball                        | `34e72323` |

**Dg1 — applied with the workstation running, commits 4 minutes apart.**
Epic 34's write lock and private-index commits (34c/34d) are in the
workstation's build (`c1fe69ff`). So the stop-the-workstation rule for
scripted real-repo runs is retired, as the orchestrator's notes said it
would be once 34d was running. The spacing gave 41a one Pi sample per
commit. No `busy` and no lock errors.

**Dg2 — two drinks, no new family.** The mule joins the existing
`moscow-mule` family (3 → 4). The spritzer is zero-proof with no family:
no other cranberry or thyme spritzer exists, and a one-drink family adds
nothing. A `cranberry` family was not made because the two drinks are
different styles.

**For Roger (not imported):**

- Sally's **Mushroom Puff Pastry Tarts** — close to the existing
  `butternut-squash-and-mushroom-puff-pastry-tart` (the same pastry, the
  same mushrooms). It is a separate appetizer, but borderline under D2.
- Sally's Candied Sweet Potatoes — next to `sweet-potato-casserole-recipe-with-pecan-topping`.
- The roundup's breads (biscuits, rolls, pull-apart and skillet breads) —
  rolls are covered (`soft-dinner-rolls-recipe`) and none fills a named
  gap.

**Roger to confirm:**

- The spritzer's `video` (a JW Player `.mp4` from the page's JSON-LD) was
  left out. The two Sally's recipes keep their YouTube videos.
- No `easy` on the brie tarts (40 minutes with a homemade sauce).
  `american` is on both appetizers, as on the existing Sally's snacks.
- Descriptions rewritten for the mule (the page's read "they give any
  gathering a festive touch!"), the cheese ball (SEO copy) and the
  spritzer. The tarts keep Sally's.
- **After Oct 31:** `pnpm --silent recipes feature --term thanksgiving --slug thanksgiving-2026 --note "Thanksgiving: turkey, sides, pies and drinks"`.
  Undo any import with `git revert <commit>`.
