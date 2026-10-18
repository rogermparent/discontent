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

| Phase    | Size | Branch                 | Status | PR  | What                                                                                        |
| -------- | ---- | ---------------------- | ------ | --- | ------------------------------------------------------------------------------------------- |
| 41a      | S    | (orchestrator)         | ✅     | —   | D3: the Pi's warm reindex median, per type; go or a recorded no-go.                         |
| 41b      | M    | `agent/41b-ci`         | 🟡     | —   | `resetData` under the write lock, two dev flakes, the CI symlink-chain check, Docker gates. |
| 41c      | M    | `agent/41c-holds`      | 🟡     | —   | D4: zod ≥ 4.4, markdown-to-jsx ≥ 9.7, simple-git ≥ 3.34 — code changes, holds removed.      |
| 41g      | S    | (content repo)         | ✅     | —   | D5: a cranberry drink and 2–4 appetizers or sides from Sally's roundup.                     |
| 41f      | M    | `agent/41f-a11y`       | 📝     | —   | `--input` at ≥ 3:1, tag chips at 24 px with WCAG 2.1/2.2 tags, two best-practice findings.  |
| 41r1     | L    | `agent/41r1-apply`     | ⏸️     | —   | If go: 29b, the engine's `applyContentChanges` and `reprojectDependents`.                   |
| 41r2     | L    | `agent/41r2-changed`   | ⏸️     | —   | If go: 29c, `reindexChanged` behind `RECIPE_INCREMENTAL_REINDEX` (D2).                      |
| 41r3     | S    | `agent/41r3-drill`     | ⏸️     | —   | If go: 29d, revalidation, docs, the Pi drill specified for Roger.                           |
| 41d1     | M    | `agent/41d1-react-tw`  | 📝     | —   | React 19.3 + Tailwind 4.3; moved baselines regenerated in Docker.                           |
| 41d2     | M    | `agent/41d2-pw`        | 📝     | —   | Playwright 1.64: package, CI images, `Dockerfile.playwright`; every baseline regenerated.   |
| 41d3     | S    | `agent/41d3-prettier`  | 📝     | —   | Prettier 3.9 and a repo-wide reformat in its own commit, in `.git-blame-ignore-revs`.       |
| 41h      | L    | `agent/41h-make`       | 🟡     | —   | The Make page redesigned: the question as h1, tape labels, featuring, Count from, specs.    |
| 41i      | S–M  | `agent/41i-make-tools` | 🟡     | —   | Make for the agents: `feature` and the page's scope in MCP / CLI, the saved staples.        |
| 41-close | S    | `agent/41-close`       | 📝     | —   | Close-out, CLAUDE.md bullet, backlog rows, memory, Roger's steps.                           |

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

### 41h — The Make page, redesigned (L)

Roger, 2026-10-18 (live): "Improve the 'What can I make?' menu with more
granular and easy control of ingredients: toggle whether global
editor-saved ingredients are considered over browser ingredients, easier
reset/clear of the browser ingredients list, the ability to save the
current browser list as persistent editor list, and better control like
search over 'buy next', e.g. I'm looking at drinks and have a list of
things, I want to add/set a 'high priority' ingredient for lime so I can
recontextualize the list for drinks I can make that include lime." Then:
"Really consider the design … it really is one of the most joyful ways to
use the site and I want to focus on making the experience even better."

The reference is a working prototype Roger reviewed live (published as an
artifact; the source is in the orchestrator's scratch, `41h/make-src.html`):
its behaviour, copy and look, on the site's real components, tokens and
matcher (`common/util/makeable.ts` — the prototype's matcher was a
stand-in). Roger's decisions:

- **Featuring filters.** A featured ingredient narrows every count, bucket
  and Buy next to recipes that use it, as `ingredient:<name>` in `?q=`;
  several featured → all must appear.
- **Count from defaults to "This browser"** for a browser that never chose
  (U6's rule, unchanged for everyone who doesn't touch it).
- **Scope: the whole prototype, plus a spec-card view** (a per-browser
  toggle between photo cards and compact spec cards).

What it builds: the question as the page's `<h1>` with the kind word as a
menu and each featured ingredient as a button; featuring written to the
query; tape labels for every ingredient (on hand, featured, the second
list, missing) with their pull; Count from (This browser / Saved list /
Both) replacing U6's "Also makeable with…" group on `/make`; Clear and
Copy with Undo; Save to editor with an inline diff; the add field as Buy
next search (a combobox with "+N now · M closer"); Buy next inside the
featured scope with the recipes it unlocks; spec cards; restrained motion
(off under reduced motion); the phone shelf stacked and summarised.

### 41i — Make for the agents (S–M)

41h's `/make` features an ingredient through the matcher (Dh7) and scopes
with the page's own query language; the agents' seats lagged: MCP
`inventory_makeable` and `recipes inventory make` judged the saved list over
a `recipe_search` scope with fixed staples. Roger asks the curator "what
can I make with lime?" — the tools answer it the way the page does.

- `inventory_makeable` / `recipes inventory make` / `/api/inventory/make`
  take `feature` (ingredient names; CLI `--feature`, repeatable) and scope
  with `scopeRecipes` + `featureScope` exactly as `/make` does (CLI
  `--query`); the answer adds `scope`, `features`, `link` (`/make?q=…`)
  and `alwaysHave`, and Buy next is computed inside the narrowed scope. No
  new tools: 57 / 43.
- The server's staples are the editor-saved `settings.makeStaples` (38-Da2)
  when set, else `DEFAULT_STAPLES`.
- The curator skill: the "What drinks can I make with lime?" example, and
  the link to hand Roger. Its frontmatter is unchanged (43).

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
  one that changed. The same rule catches `z.any()`, `z.unknown()` and
  `z.union([…, z.undefined()])` as an object field: in 4.6 a missing key
  fails "nonoptional" for each. None is an object field here today (MCP's
  `data: z.unknown()` is protocol-required, always present); give one an
  explicit `.optional()`.
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
- **Tc3 — markdown-to-jsx ≥ 9.7: a JSX tag that starts a block takes the
  rest of the block as children.** `- <Multiplyable baseNumber="1/2" /> cup
sugar` compiles to `<li><Multiplyable>cup sugar</Multiplyable></li>`, with
  the space after the tag consumed; 9.6.1 gave the tag plus a sibling
  `<p>cup sugar</p>`. The same capture happens for a quote line, an indented
  line and a paragraph that runs over more than one line. Only a single
  unindented line starting with the tag, or a tag mid-line, stays childless.
  Any override for a self-closing tag has to render its children
  (`withCapturedLine`), or the rest of the block disappears from the page as
  well as from the index text. What that cannot restore under 9.10.3:
  - **Spaces between inline elements inside the captured block.** The
    parser keeps the `" "` text node; the compiler drops it before any
    component sees the children, so no fix fits in `withCapturedLine` or
    `flattenNode`. `- <M 1/> recipe [Pie crust](/recipe/pie-crust) *chilled*`
    renders "Pie crustchilled"; `- <M/> cup **sugar** [link](/x)` indexes
    "sugarlink"; `- <M 1/> cup sugar <M 3/> <M 4/>` runs "34" together.
  - **A nested sub-list or hard break** inside a captured item is flattened
    or dropped.
  - **`<VideoTime>…</VideoTime>`** at a list item's start loses the space
    after `</VideoTime>`; a multi-paragraph instruction starting with
    `<VideoTime>…</VideoTime> and stir.` renders "and stir." as a separate
    `<p>`.

  None of these occurs in the real corpus at 41c: the review checked all 799
  recipes read-only, and rendering and index text are identical to 9.6.1.
  Hence the `~9.10.3` pin (Dc4) and the backlog row "markdown-to-jsx ≥ 9.7
  line capture" with its reopen trigger.

### 41d2

- **Tp1 — A passing visual spec doesn't mean a current baseline.** The
  recipe config's `maxDiffPixelRatio: 0.02`, with pixelmatch's default
  0.2 colour threshold, let 41 of 46 recipe baselines and all 11 portfolio
  ones pass against pages that had moved on since they were written.
  `bookmarks-empty` still showed July's "My Bookmarks" page, the old
  masthead and Next's dev badge. A sparse page can be redesigned inside 2 %.
  Plain `--update-snapshots` (`changed`) never rewrites such a baseline,
  because the comparison passes. Only `--update-snapshots=all` does.
- **Tp2 — Read a regenerated diff against a control, not against the old
  baseline.** Diffing the 1.64.1 output against the committed PNGs blamed
  the Chromium jump for 52 moved files. Running the same command on
  `origin/main` in the 1.59.1 image (a `git archive` tree passed to
  `docker-pw.sh`) and diffing the two outputs pixel by pixel showed that
  Chromium moved 6 of them. Do the same at the next image bump. A
  twenty-line PIL/numpy script that counts differing pixels per file is
  enough.
- **Tp3 — Portfolio's palette baseline highlights whichever row cmdk
  selected first.** In the regenerated (and the 1.59.1 control) image it is
  "Work" under Go to; July's had "Content Engine". The spec waits for the
  corpus rows, but not for the selection that settles when they arrive
  after the dialog opens. Both states pass under the tolerance.

### 41h

- **Th1 — `ingredient:` means two things now.** On `/make` a featured
  ingredient is judged by the matcher (Dh7): `withoutFeatures` strips the
  top-level positive `ingredient:` terms before `scopeRecipes`, and
  `featureScope` / `featuredLines` keep the recipes each feature meets. On
  `/search` (and inside an OR on `/make`) `ingredient:` is still the search
  language's word-prefix match, so `ingredient:gin` there still finds
  ginger beer. A test or a link that expects one from the other fails; a
  deep link from `/drinks` into `/make?q=…` reads the `/make` way.
- **Th2 — the e2e expectations were first written without running.** The
  implementing worker had no Playwright slot; the finisher ran them. Read a
  `/make` spec's counts against `make-drinks` itself: the G&T's "Lime
  wedge, for garnish" is optional, so the G&T is not "with lime"; `gin`
  never meets "non-alcoholic gin".
- **Th3 — a setter kept in a closure saves over stale settings.** Before
  the review, `useMakeSettings`'s `save` merged into the render's `stored`,
  so an Undo that ran `setSource` seconds later reverted any setting changed
  in between. `save` now reads `make-settings-v1` from storage when it
  runs; keep it that way for any setter an Undo or a timer holds.
- **Th4 — no opacity on a tape.** "Dimmed" labels (Saved mode) are untaped
  with `--muted-foreground` text, not `opacity`: axe composites opacity, and
  75 % takes the tape text from ~10:1 to under 3:1.
- **Th5 — a full-page shot of a page taller than the window can draw the
  sticky header mid-page.** `make-page-specs` came out with the header at
  ~385 px over Buy next, and stayed so with `scrollTo(0, 0)` and
  `scrollY` polled to 0. Sizing the viewport so the page fits
  (`setViewportSize({ width: 1280, height: 1800 })`) fixed it. The mobile
  shots keep their known look: the fixed tab bar sits at the first
  viewport's bottom, as in `homepage-mobile`.
- **Th6 — under `next dev`, right after sign-in, `/make` can have a hidden
  second copy.** The dev run's first attempt at the signed-in axe test
  failed strict mode: two `make-ticker`s, one outside `<main>` that stayed
  on "Loading recipes…". The retry passed; build mode never showed it.
  That test now looks inside `getByRole("main")`; do the same in a new
  signed-in `/make` spec.

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
| `markdown-to-jsx` | 9.6.1 → 9.10.3  | `~9.10.3` | 1 (40h's count): `flattenMarkdown` "keeps quantities inside prose…"; plus 5 new              |
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
the number, a space, then any children. The space is left out when the line
starts with punctuation (`2% milk`, `3, then`; `util/capturedLine.ts`).
`Multiplyable` (every unit mode) and the form's `DummyMultiplyable` use it.
`flattenMarkdown`'s `Multiplyable` branch appends the flattened children the
same way. New `test/multiplyableListItem.test.tsx` covers the form preview,
the recipe page scaled ×2 through `?scale=2`, a lone number and leading
punctuation; `flattenMarkdown.test.ts` gains the punctuation case. The first
three fail without the fix. What this cannot restore is in Tc3. Sweep: all 317 markdown strings in the Playwright fixtures (descriptions,
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
`test/gitEnv.test.ts` is new (3 tests): editor and pager dropped (`git var GIT_EDITOR` answers "", against a control that names one), an
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
- **Dc4 — Carets restored** for zod and simple-git (their pre-40h form).
  markdown-to-jsx is pinned **`~9.10.3`** instead (review): its parsing
  changed in a minor once (Tc3), so a later minor waits for a deliberate
  bump. sharp keeps its exact pin.

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
- ~~How many real recipes have a list item that starts with a
  `Multiplyable`?~~ Answered by the review: none of 799 recipes renders or
  indexes differently under 9.10.3 (read-only check). No reindex.

### 41d1 — React 19.3 + Tailwind 4.3

Branch `agent/41d1-react-tw`. Two minors and one pinned font. No app code
changed. **Reindex needed: no. Deploy:** Roger's `pnpm workstation update`
and the next `pnpm deploy:pi`; nothing to look at.

| Package                | Old → new        | Range now | Where                                                                                                              |
| ---------------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `react`                | 19.2.9 → 19.3.1  | `19.3.1`  | root, cms demo, menus/pages/projects collections, both portfolio apps, recipe common/editor/export, resume-builder |
| `react-dom`            | 19.2.9 → 19.3.1  | `19.3.1`  | the same, less the three collections and recipe common                                                             |
| `@types/react`         | 19.2.18 → 19.3.0 | `^19.3.0` | root, cms demo, next-static-image, component-library, the five apps, recipe common                                 |
| `@types/react-dom`     | 19.2.7 → 19.3.0  | `^19.3.0` | the same, less component-library                                                                                   |
| `tailwindcss`          | 4.1.18 → 4.3.3   | `^4.3.3`  | recipe editor/export, both portfolio apps, resume-builder                                                          |
| `@tailwindcss/postcss` | 4.1.18 → 4.3.3   | `^4.3.3`  | recipe editor and resume-builder; now also declared in three more (Dd1)                                            |

`next` stays at 16.4.2, the newest 16.4. Its peer range
(`^19.0.0`) takes 19.3.1. `pnpm install` printed no peer warnings.

**Lockfile.** These versions changed and nothing else: `react`/`react-dom`
19.3.1, `scheduler` 0.27 → 0.28, `@types/react`/`@types/react-dom` 19.3.0,
`tailwindcss`, `@tailwindcss/{node,oxide*,postcss}` 4.3.3, `lightningcss*`
1.30.2 → 1.32.0, `enhanced-resolve` 5.18.4 → 5.26.0, `tapable` 2.3.0 →
2.3.3, and one `jiti` 2.6.1 entry dropped. No major. The rest of the
diff, about 1,700 lines, is peer suffixes (`(react@19.3.1)`) rewritten on
Radix, lexical, cmdk, mux, next-auth, next-themes and friends.

**React: the app already ran 19.3.** Next 16.4.2 renders the App Router
with its vendored React, `next/dist/compiled/react` =
`19.3.0-canary-278794d7-20261002`, newer than 19.3.0. Every page, server
action and client component already ran on 19.3-level React in dev,
build, Playwright and CI. The installed `react`/`react-dom` reach only
vitest (the jsdom `.tsx` tests and the two `renderToStaticMarkup` tests),
Next's pages-router fallbacks (we have no `pages/` router) and the types.
The behaviour changes in 19.3.0 and 19.3.1 that could touch us, each
grepped:

- StrictMode now double-invokes effects during hydration. `JobsDashboard`
  (40h's remount-safe `filtersShown` ref) and `bar-tools.spec` already
  allow for it, and it was already live through the vendored canary.
- `defaultValue` on `type="number"` now behaves like other inputs. The
  one case is the kit's `Duration` (value XOR defaultValue), which
  `formControls.test.tsx` covers. It passes.
- Transitions no longer entangle (75 `useActionState`/`useFormStatus`
  uses, all already on the canary). `onReset` on automatic form reset, the
  `submitter` in `FormData`, `useEffectEvent`, `<Activity>`,
  `<ViewTransition>`, conditional `use()`, batched `resize`: none used.
- `@types/react` 19.3 adds types only (`FragmentInstance`,
  `ViewTransition*`, `submitter` on `SubmitEvent`). Every typecheck is
  clean with no code change.

**Tailwind: the compiled CSS, before and after.** Each app's `globals.css`
was compiled with its own `@tailwindcss/postcss` on this main, before and
after the bump (the same `@source` scan Next runs; no build). Both sides
were then flattened with lightningcss 1.32 (4.3 emits flat selectors where
4.1 emitted nesting) and diffed rule by rule. In all five apps:

- **No class gained or lost.** 4.3's `@source` changes (symlinked globs,
  git-ignored dirs, siblings) leave our scan sets alone; every `@source`
  here goes through pnpm workspace links.
- `*-0` and `*-1` spacing now emit `0` and `var(--spacing)` instead of
  `calc(var(--spacing) * 0|1)`, and `translate-y-0` emits `0px`. The
  computed values are the same.
- Preflight's Firefox `:-moz-focusring` now skips iframes; `> *:focus-visible`
  became `> :focus-visible`. Both are equivalent in Chromium.
- **The default `--font-sans` changed** (4.3.3, tailwindlabs/tailwindcss#20318) from
  `ui-sans-serif, system-ui, sans-serif, …` to `-apple-system,
BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans",
Arial, sans-serif, …`, in the theme and as Preflight's `html` fallback.
  The recipe and portfolio apps set `--default-font-family` from the kit's
  `theme.css` (`--ff-body` first), so they don't use either value.
  **resume-builder** used the default. Its `globals.css` `@theme inline`
  now pins 4.1's exact stack, and its compiled `--default-font-family`
  equals 4.1's value. `--font-mono` didn't change.

Prediction from the diff: no screenshot moves. The run below agrees.

**Decisions.**

- **Dd1** — `@tailwindcss/postcss` `^4.3.3` is now a declared
  devDependency of recipe export and both portfolio apps. Their
  `postcss.config.mjs` names it, but they had only resolved it through
  `shamefully-hoist`. Reversible.
- **Dd2** — resume-builder keeps Tailwind 4.1's default sans stack, pinned
  in its `@theme inline` with a comment. Nothing visible changes there.
  Dropping the four lines takes 4.3's new default.

**Gates** (local, every heavy step through the slot):

- `pnpm --filter recipe-editor typecheck`: clean.
  `pnpm --filter recipe-website exec tsc --noEmit`: clean. `tsc --noEmit`
  in the portfolio editor, the portfolio export and resume-builder: clean.
  resume-builder needs its gitignored `next-env.d.ts`, copied from the
  main checkout, or its SVG imports fail TS2307. That is unrelated to the
  bump.
- `pnpm exec vitest run`: 117 files, 2369 tests passed.
- Playwright, build mode in CI's image (`DOCKER=1 heavy-pw.sh`), on the
  `e2e` and `mobile` projects. Specs: `visual`, `mobile`, `accessibility`,
  `recipe`, every `search*`, `shopping`, `jobs`, `git`, `command-palette`,
  `drinks`, `empty-state`, `footer`, `header`, `ingredient-preview`,
  `paste-replace`, `yield`, `menus`, `lexical-smoke` and `theme-editor`.
  That covers every recipe spec with a screenshot baseline. 340 passed in
  11.1 min, none flaky. **No baseline moved**: every screenshot compared
  equal to its stored baseline, and none was regenerated.
- Portfolio `visual` + `accessibility` (Docker), dev mode once, and the
  main-checkout-shaped build: not run locally — the shared heavy slot was
  held for over an hour by the other session's image builds — so the PR's
  CI is that gate: the Portfolio job (dev, with its baselines), the four
  dev-mode Recipe shards, and 41b's "Recipe build (main-checkout shape)"
  job.

**Roger to confirm.**

- Dd2: keep resume-builder on Tailwind 4.1's font stack, or accept 4.3's
  new default (`-apple-system, …, Roboto, …, Arial`)? Accepting it changes
  the resume pages' text face on Linux and Windows.

### 41f — Accessibility follow-through

Branch `agent/41f-a11y`. **Reindex needed: no. Deploy: yes, for the look**
— every text field, select and outline button gets a visible border, and
two reader controls change names (below). No content or index change.

**Df1 — `--input` at ≥ 3.1:1 (WCAG 1.4.11), the smallest change.**
`--input` is the border of every `Input`, `Textarea`, `Select` trigger,
outline button, toggle and the shared `Form` field class. Fitted with
`contrastRatio` (now `contrastOver`, below) against every surface a field
sits on — the page, a card or popover, and the `--muted` and `--secondary`
panels (the editor's timeline event fields sit on a `bg-muted` panel,
`Form/Timeline`) — in all three neutral families. Ratios as page / card
(= popover) / muted / secondary:

| Mode  | Family | Old                                   | New                                       |
| ----- | ------ | ------------------------------------- | ----------------------------------------- |
| light | warm   | L 0.9: 1.27 / 1.35 / 1.18 / 1.13      | **L 0.61**: 3.58 / 3.79 / 3.33 / 3.18     |
| light | cool   | 1.27 / 1.35 / 1.18 / 1.13             | 3.58 / 3.78 / 3.32 / 3.18                 |
| light | gray   | 1.27 / 1.35 / 1.18 / 1.13             | 3.58 / 3.79 / 3.33 / 3.18                 |
| dark  | warm   | 15 % white: 1.54 / 1.59 / 1.62 / 1.62 | **35 % white**: 3.21 / 3.22 / 3.14 / 3.14 |
| dark  | cool   | 1.54 / 1.59 / 1.62 / 1.62             | 3.21 / 3.22 / 3.14 / 3.14                 |
| dark  | gray   | 1.54 / 1.59 / 1.62 / 1.62             | 3.21 / 3.22 / 3.14 / 3.14                 |

The light `--secondary` panel (L 0.94) is the tightest surface: L 0.64
(the first cut, fitted to the page and card only) gave 2.95:1 on muted and
2.82:1 on secondary, and L 0.62 still only 3.05:1 on secondary, so 0.61 is
the first step past 3.1 on all five. (L 0.65, 40g's suggestion, gave
3.05:1 on the page alone.) Dark at 34 % gives exactly 3.10 on the page,
so 35 %, which also clears 3.1 on the muted panels. The chroma and hue
stay the family's, and the accent never reaches `--input`, so no hue
changes it (tested). `styles/theme.css` mirrors the default
(`oklch(0.61 0.008 80)`, `oklch(1 0 0 / 35%)`). 40g's numbers were 1.27:1
light and "~1.8:1" dark; measured composited over the page the old dark
border was 1.54:1.

What these measure is the border against the surface **outside** the
field, the adjacent colour WCAG 1.4.11 asks about for a control's
boundary. In dark mode the field's own fill (`--input-fill` at 30 %, i.e.
4.5 % white) is slightly lighter than the surface, so the border against
the inside of the field is 2.85–2.9:1 on the page and a card (2.75:1 on a
muted panel); that is not the ratio 1.4.11 measures, and the field's
boundary is identifiable from outside.

**Df2 — fills got their own token, `--input-fill`.** shadcn paints the
dark-mode fill of `Input`, `Textarea`, `Select`, `Checkbox`, `InputGroup`
and the active `Tabs` trigger with `dark:bg-input/30` (and the select's
hover with `/50`). Raising `--input` would have lifted those fills from
4.5 % to 10.5 % white. They now read `dark:bg-input-fill/30`, and
`--input-fill` holds the old values (light `--border`'s L 0.9, dark 15 %
white), so every fill paints exactly what it did. Two uses stay on
`--input` on purpose: the dark active tab's _border_ (a state indicator,
better brighter) and `ButtonGroupSeparator`'s 1 px `bg-input` divider
(used nowhere today; it separates buttons whose borders are `--input`).
resume-builder has its own `--input` in its own `globals.css` and does not
import `theme.css`, so its border is unchanged; but it renders the shared
`ui/input`, which now emits `dark:bg-input-fill/30`, so its `globals.css`
gained `--input-fill` (the same values as its `--input`, light and dark)
and the `--color-input-fill` mapping, and its fields paint as before.

**Df3 — `contrastOver`.** `contrast.ts` gains `oklchAlpha` and
`contrastOver(fg, bg)`: a translucent colour composited over an opaque
surface in gamma-encoded sRGB (as browsers paint `oklch(… / A)`), then the
WCAG ratio. `test/theming.test.ts` adds a "form-control border contrast"
block beside 30b's accent sweep: `--input` against `--background`,
`--card`, `--popover`, `--muted` and `--secondary`, three families × two
modes, at ≥ 3:1 and at the ≥ 3.1:1 margin; the accent hue can't move it;
the fills keep the old values (pinned as literals); and the compositing
maths (the old dark border at 1.54:1, both
alpha spellings, 0 % paints nothing).

**Df4 — the bar is WCAG 2.2 AA.** `WCAG_TAGS` (recipe and portfolio
`playwright/support/a11y.ts`) is now `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, `wcag22aa`. The four specs that spelled the tags out
(`command-palette`, `search-live`, `search-query-language`,
`search-tags`) import it, so one bar covers every axe check.

**Df5 — a saved theme's pre-paint copy follows the derivation.** A
visitor's saved theme is stored twice: the knobs (`ce-theme`) and the
derived `{light, dark}` var maps (`ce-theme-vars`) that the blocking
pre-paint script applies. Only `previewTheme()` wrote the maps, so after
this change a saved theme would have painted the old `--input` until
`ThemeVarsProvider` re-derived it after hydration — a border flash, on
every load. The provider now rewrites `ce-theme-vars` on mount whenever
the fresh derivation differs (guarded like the existing storage code), so
the first load after a deploy flashes once and every later one paints the
new values.

**What the new tags found, and the fixes.** 40g's exploratory sweep (34
routes, once) listed only the first row; the full specs reach more
states:

| Rule (tag)                                     | Where                                                         | Element                                                                                                            | Fix                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-size` (wcag22aa)                       | `/tags/<term>`, `/featured-recipe/<slug>`, every plain card   | `RecipeCardTagHint` chips (~22 px, their 24 px circle reaching the card link)                                      | `min-h-6` on the chip link: 24 px tall, so no spacing test applies.                                                                                                                   |
| `target-size` (wcag22aa)                       | `/search`, `/make`, the search specs                          | `CardTags`' "Filter by tag …" buttons (same shape, interactive)                                                    | The button is `inline-flex min-h-6 items-center` around its badge.                                                                                                                    |
| `target-size` (wcag22aa)                       | `/drinks` on a phone                                          | the family chips (40 px) straddling the fold behind the pinned tab bar, 9 px showing                               | Not a page defect: scrolling uncovers them. The phone sweep measures target size with the chrome released (Tf2).                                                                      |
| `label-content-name-mismatch` (wcag21a, 2.5.3) | every page with the masthead (recipe), every page (portfolio) | the palette trigger: visible "Search 9 recipes" + the "Ctrl+K" chip; portfolio's icon + chip, named "Search works" | The chip's glyphs are generated content (`before:content-[attr(data-shortcut)]`), not text: decoration, announced by `aria-keyshortcuts`. Looks the same; specs read `data-shortcut`. |
| `label-content-name-mismatch` (wcag21a)        | recipe page, cook view, theme matrix                          | the scaler's "½× / 1× / 2×" buttons named "Half / Single / Double batch"                                           | Named `½× (Half batch)` etc.: the visible text leads, and `name: "Double batch"` still matches as a substring.                                                                        |
| `label-content-name-mismatch` (wcag21a)        | `/make`                                                       | Buy next's "I have this" buttons named "I have lime juice"                                                         | Named `I have this: lime juice`; `make.spec` follows.                                                                                                                                 |

**Best practice (40g's two):**

- **`heading-order` on `/search`.** The site's h1 is the masthead
  wordmark, page headings are h2 and cards h3, but `/search` had no h2:
  the matched-groups strip's "Groups" label is now an `<h2>` (same
  classes, same look) and an `sr-only` `<h2>Recipes</h2>` heads the result
  grid. Specs find cards inside `listitem`s, so neither heading is in
  their way.
- **`image-redundant-alt` on `/groups`.** Group thumbnails are decorative
  (`alt=""`): every caller puts the name beside the picture, inside the
  same card link or in the heading next to it. `GroupThumbnail` drops its
  `name` prop (four callers: `/groups`, the term page's Plans, the featured
  group card and the featured group's page) and `GroupResults` passes `alt=""` too. An empty
  alt takes the image out of the accessibility tree, so `groups.spec`'s
  eleven `getByRole("img")` under a thumbnail became `locator("img")`
  (Tf3).

**Baselines (Docker only, `--update-snapshots`, which rewrites only the
images that miss the 2 % `maxDiffPixelRatio`):** recipe, build mode, every
screenshot spec (`visual`, `mobile`, `command-palette`, `drinks`,
`empty-state`, `footer`, `header`, `ingredient-preview`, `menus`,
`paste-replace`, `recipe`, `yield`) — **2 images moved**:
`paste-replace.spec` 1 (`paste-replace-imported-ingredients-e2e`: the
ingredient field's border now shows) and `visual.spec` 1
(`make-page-e2e`: 4 px taller from the 24 px card chips, and the field and
outline-button borders). Both opened and checked. Every other baseline —
the darker borders included — stays under 2 %. Portfolio, dev mode
(`next dev`, its CI mode): `visual.spec` **none moved** (11/11, the project
form included).

After the review moved light `--input` from L 0.64 to 0.61 (Df1), the
same recipe screenshot specs ran again with `--update-snapshots` (Docker,
build mode; the `recipe.spec` regex also picked up `new-recipe.spec`):
**184/184, no image moved** — the two baselines above, made at 0.64, stay
under 2 % at 0.61. Portfolio's `visual.spec` (Docker, dev): **11/11, none
moved**.

**Gates.**

- `pnpm --filter recipe-editor typecheck` ✓; `pnpm --filter recipe-website
exec tsc --noEmit` ✓; `pnpm exec vitest run` **114 files, 2347 tests** ✓
  (before the later fixes, which touched no unit-tested module).
- Playwright, recipe, build mode in the Docker image (`DOCKER=1
heavy-pw.sh`), e2e + mobile: `accessibility`, every `search*`,
  `command-palette`, `drinks`, `recipe`, `bar-tools`, `groups`, `make`,
  `visual`, `header`, `mobile`, `tag-pages`: 340 tests, 337 passed — the
  3 failures were `make.spec`'s "I have this" (fixed, above) and the
  `make-page` baseline (regenerated); then `make`, `homepage-browse` and
  every screenshot spec **182/182**. The first round, before the fixes,
  is the findings table.
- Recipe dev mode (`next dev`, CI's mode), `--project=e2e`:
  `accessibility.spec` **57/57** (56 first time, 1 flaky — Tf5).
- Portfolio (dev, Docker): `accessibility`, `visual`, `command-palette`,
  `chrome`, `smoke` **47/47**; before the palette fix, 18 of its axe tests
  failed on the trigger (findings table).
- **Review round** (L 0.61, the muted/secondary sweep, resume-builder's
  `--input-fill`, Df5), after merging `origin/main` (41b): `vitest run
test/theming.test.ts` **27/27**, then the full `vitest run` **115 files,
  2361 tests** ✓; both typechecks ✓; recipe `accessibility.spec`, build
  mode in Docker, e2e + mobile **61/61**; the baseline runs above.
  resume-builder: a CSS-only change, not built (its build is a full
  webpack `next build`).

**Traps.**

- **Tf1 — axe's label-in-name counts `aria-hidden` text.** The rule
  compares the element's _visible_ text (axe's `visibleVirtual`, which
  keeps `aria-hidden` children) with its accessible name, after dropping
  punctuation, symbols and parentheticals. A shortcut chip inside a named
  button fails it even though screen readers never hear the chip; so does
  "½×" against "Half batch" (NFKD makes ½ "1⁄2", so the tokens are 1 and
  2). Generated content (`::before { content: attr(…) }`) isn't a text
  node and isn't counted. The rule is tagged `wcag21a` only, so the old
  2.0 tags never ran it; 40g's exploratory table doesn't list it either.
- **Tf2 — target size and pinned chrome.** axe measures 2.5.8 at the
  current scroll position, so anything straddling the fold behind the
  phone's sticky tab bar reads as "partially obscured" — on `/drinks`,
  chips with 9 px showing. The phone sweep (`accessibility.spec`, "on a
  phone") runs the full tags with `target-size` disabled, then
  `target-size` alone after `data-sticky-chrome="off"` (the reader's own
  setting) releases the bar into the flow. Don't paper over it with
  padding: the bar is designed to cover the fold.
- **Tf3 — an empty alt has no role.** `getByRole("img")` doesn't find
  `<img alt="">` (its role is `presentation`); a decorative image is found
  with `locator("img")`.
- **Tf4 — 2 % hides a border redraw.** Darkening every field border moved
  only 2 of 44 recipe baselines (and none of portfolio's 11), and the
  later step from L 0.64 to 0.61 moved none: a 1 px outline is a small
  share of a full-page shot. Visual review is the opened PNGs and the contrast sweep,
  not the count of moved images.

- **Tf5 — a dev-mode `/make` flake, not this phase's.** In dev mode the
  first `/make` load can sit on "Loading recipes…" past 20 s (the cold
  compile of the corpus route), and for a moment two `make-ticker`
  paragraphs exist (strict-mode violation); the retry passed.
  `accessibility.spec:59` in dev only; build mode never showed it.

**Roger to confirm.**

- The values: light `--input` L 0.61 (covers muted/secondary panels) and
  dark 35 % white (Df1) — the quietest pair at ≥ 3.1:1 on all five
  surfaces. L 0.64 would do for the page, card and popover alone, but the
  editor's timeline fields sit on `bg-muted` (2.95:1 there). Outline
  buttons and toggles follow, since they share the token; the alternative
  is moving them to `border-border` to keep their hairline (their text
  names them, so 1.4.11 doesn't require it).
- The card chips at 24 px (the table above): cards with tags are ~2 px
  taller, `/make`'s page 4 px.
- Names that changed for screen readers: "½× (Half batch)", "I have this:
  lime juice".

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

### 41h — The Make page, redesigned

Branch `agent/41h-make`. **Reindex needed: no. Deploy: yes** (the editor
and the export's `/make`). No content, index or stored-format change beyond
two optional fields in `make-settings-v1` (`source`, `view`); a value
written before 41h reads as This browser and photo cards.

**What shipped** (the prototype, on the real page, components, tokens and
matcher):

- **The question is the `<h1>`** (`MakeQuestion.tsx`): "What **drinks** can
  I make with **lime**?" The kind word is a menu button (`MAKE_KINDS`:
  recipes / dishes / drinks, each with its count). Each featured word is a
  button that un-features it. The menu renders beside the heading, so an
  open menu is never part of the heading's name.
- **Featuring lives in the query** (`kinds.ts`: `featuredOfQuery`,
  `withFeature`, `withoutFeature`, `withoutFeatures`, `toggleFeature`,
  `isFeatured`, `featureName`): top-level `ingredient:` terms in `?q=` and
  `make-last-query`. Typing `ingredient:lime` in Search features lime, and
  URLs share it. Several features must all appear. The featured scope is
  judged by the matcher (Dh7).
- **Tape labels** (`Tape.tsx`, `make.css`): on hand (tape), featured
  (accent), the second list (outlined), missing (dashed), and, in Saved
  mode, this browser's uncounted labels (untaped, muted ink). The torn ends
  are a `clip-path` on `::before`, so focus rings aren't clipped. Tapping
  the body features (`aria-pressed`); × removes (Undo). Each counted label
  shows its **pull** (`pullCounts`). Colours: new derived tokens `--tape` /
  `--tape-foreground` (`derive.ts`, `theme.css`), swept at ≥ 4.5:1 in every
  neutral family, light and dark (`theming.test.ts`); the fonts are the
  theme's role variables.
- **Count from** (This browser / Saved list or House list / Both, with item
  counts) only when the page has a second list: the signed-in editor's
  saved inventory, or the export's (and editor guest's) house snapshot when
  shared. Stored per browser as `source`, default `browser`. Both = the
  union for every count, bucket and Buy next. In Saved or Both the second
  list shows as its own outlined, featurable group with "Copy it to this
  browser" (Undo). This replaces `SecondaryMakeGroup` on `/make` (Dh1).
- **Clear** (Undo), **Save to editor** (signed-in only): an inline confirm
  "+N … / −M …" before one commit through `saveInventoryChanges`; toast
  "Saved list updated."
- **The add field is Buy next as search** (`AddField.tsx`, a combobox with
  `aria-activedescendant`): candidate names in scope matching at a word
  start, each with "+N now · M closer" (`addCandidates`, `whatIf` per
  recipe — Dh12), ranked by that.
- **Buy next** follows the featured scope ("Buy next for lime drinks"),
  names what each item unlocks (three and "and N more"), its item a
  featurable dashed tape, "I have this: <item>".
- **Spec cards** (`CardViewSwitch`, per browser as `view`): name, style
  tags, the lines used (the featured ones marked, from `featuredLines`) and
  "Needs" tapes. Photo cards stay the default and gained the "Needs" tapes.
- **Motion**, off under `prefers-reduced-motion`: the ticker's numbers tick
  (an `aria-hidden` copy; the plain `make-ticker` is the live region), a
  newly makeable card gets a brief accent ring, a newly added label lands.
- **Phone**: the shelf stacks above the results behind a disclosure button
  that says what it holds ("16 on hand · lime featured"); nothing scrolls
  sideways (checked in `mobile.spec`).
- Kept: staples, "Assume I always have", "Count close matches",
  Import / export, tag picks and refine chips, `/drinks`' links into
  `/make?q=…`, one common component for both apps. Removed: `KindSwitch`,
  `SecondaryMakeGroup` (from `/make`), `SavedInventoryEditor`.

**Dh1 — Count from replaces "Also makeable with your saved inventory" on
`/make` only.** The union is a choice now, not a second group under the
results. `/drinks` keeps its secondary group: its panel has no Count from.
U6's rule holds for a browser that never chose (This browser), and the
export still never reads the saved file (`exportInventoryGuard`,
`exportHouseInventory` green; the new render test pins the panel).

**Dh2 — the per-item saved-list editor is gone.** `SavedInventoryEditor`
(add or remove one item in the saved list, one commit each) is replaced by
two whole-list moves: **Save to editor** writes this browser's list as a
diff (`saveDiff`: add what only the browser has, remove what only the
saved list as this page saw it has, so an item an agent added after the
page loaded survives), and **Copy it to this browser** replaces this
browser's list with the saved one (Undo). Editing the saved list item by
item is: copy it here, edit, Save to editor. The CLI and MCP
(`inventory add/remove`) still edit it item by item.

**Dh3 — the combobox never auto-selects.** Enter with nothing picked adds
what was typed, read as a list ("vodka, lime"), so pasting a comma list
still works; the arrow keys pick a suggestion first.

**Dh4 — removing a label doesn't un-feature it.** The feature is a term in
the query, and the query is the person's: `ingredient:lime` stays after
lime leaves the list (the question still says "with lime", and its button
un-features).

**Dh5 — the ticker drops the prototype's quoted query.** The query is in
the Search field beside it; the ticker reads "72 DRINKS · 14 CAN MAKE · …"
only. The ticking numbers are `aria-hidden`; a plain `sr-only` copy is the
live region, so a change is announced once, not per animation frame.

**Dh6 — a plain toast ignores the pointer.** "Added lime." never sits on
top of a control a click meant. A toast with Undo takes the pointer, so
hovering it pauses its timer (Dh9).

**Dh7 — on `/make` a featured ingredient filters through the matcher
(review; the orchestrator's decision).** A recipe is in the featured scope
iff one of its **required** lines is met by the featured item the way
`analyzeMakeable` would meet it with that item as the whole list (no
staples; close matches as "Count close matches" says) —
`featuredLines` / `featureScope` in `makeMath.ts`. So `gin` means gin: not
ginger beer (on the real repo `ingredient:gin tag:drink` matched 63, ~20 of
them ginger-only — Moscow Mules, Dark 'n' Stormy, Penicillin), never
non-alcoholic gin, and "extra dry vermouth" meets every dry-vermouth
Martini, as the inventory would. A garnish doesn't count: the fixture's
G&T ("Lime wedge, for garnish") is not "with lime". The query still carries
`ingredient:<name>`; a label is featured by its name without its
parenthetical ("aperitif (Gnista)" → `ingredient:aperitif`), and typing
`ingredient:x` in Make's Search features x the same way. Spec cards mark
the lines a feature meets from the same judgement. A line met only through
a sub-recipe ("via") doesn't count: featuring lime doesn't include a
Gimlet whose lime cordial is a linked recipe (re-review). Search's own
`ingredient:` is unchanged (Th1). Unit tests: gin vs ginger beer and
non-alcoholic gin, extra dry vs dry vermouth, a parenthetical label,
several features.

**Dh8 — featuring is exact (review).** A label is pressed iff its own name
is featured (`isFeatured`, by `featureKey`); a tap un-features exactly that
name or adds it. Before, `featuredBy` used the search language's prefix
rule: with gin featured, tapping "ginger beer" removed gin, and "orange
bitters" looked pressed under "orange". The question shows each feature as
typed in the query ("St-Germain", not the parser's "st-germain"). A
trailing operator (`tag:drink OR`) is dropped before a feature is appended,
so a tap never lands inside an OR.

**Dh9 — Undo by keyboard (review; WCAG 2.1.1, 2.2.1).** The toast's timer
pauses while the pointer is over it or focus is in it. After Clear (whose
button disables itself) focus goes to Undo; after a label's × to the label
that took its place (or the one before, or the add field). While an Undo
toast is up, **Ctrl+Z / ⌘Z** undoes unless focus is in a text field (that is
the field's own undo); the button says so (`aria-keyshortcuts`). After
Undo, focus that was in the toast goes to the add field.

**Dh10 — Undo applies to the list as it is now (review).** Remove's Undo
puts that one item back where it was; Clear's restores the old list plus
anything added since; Copy's restores the old list, keeping what was added
since but not what the copy brought, and puts Count from back only if it is
still the "This browser" the copy chose. `useMakeSettings`'s setters read
storage when they run (Th3).

**Dh11 — Saved mode says this browser's labels don't count (review).** In
Count from = Saved list, this browser's labels stay on the shelf untaped in
muted ink (`data-counted="false"`, Th4), without pulls, under "Not counted —
switch Count from to This browser or Both to include them", and the list is
named "This browser's list, not counted". The phone's folded summary counts
what is counted (the saved list, the union in Both).

**Dh12 — the what-if is per recipe (review).** `whatIf(item, analysis)`
looks at each one- and two-away recipe: every missing line the item meets
gone → "+1 now"; some → "closer". Per line it overcounted ("lime" meeting
both "lime juice" and "lime wedge" of a two-away recipe said "0 now · 2
closer" though it finishes it). Buy next keeps its per-line tally.

**Dh13 — the heading's controls.** Buttons are phrasing content, so the h1
holds them (axe's `nested-interactive` is about controls in controls; it
passes). A featured word's button is named by the word alone and
described ("Tap to stop featuring it") from a hidden element outside the
heading, so the heading's name is the sentence. The tape buttons are
named by their word, not the prototype's "lime, featured" / "lime,
feature it": `aria-pressed` already says the state, and the name stays the
visible word (WCAG 2.5.3). The "Tap a label…" hint is no longer the add
field's description.

**Coverage — the export / guest house list is a render test, not an
e2e.** `test/makeInventoryPanel.test.tsx` renders `InventoryPanel` with a
house list: Count from with its three counts (This browser first), no Save
to editor, the house labels outlined (`data-kind="saved"`), featurable,
not removable, "Copy it to this browser", Saved mode's uncounted labels and
the folded summary; the editor's inventory reader and save action are
mocked to record an import, and none happens. An e2e would need an export
built with `SITE_HOUSE_INVENTORY` baked in; the export e2e builds once,
without it, and `exportHouseInventory.test.ts` pins the bake itself.

**Gates** (all through the capped wrappers, on the final tree):

- `pnpm --filter recipe-editor typecheck` ✓, `pnpm --filter recipe-website
exec tsc --noEmit` ✓.
- `pnpm exec vitest run`: **119 files, 2398 tests** ✓ (the worker's 118 /
  2389, plus `makeInventoryPanel.test.tsx` and the review's unit tests in
  `makeFeatured.test.ts`).
- Playwright, Docker, build mode: `make`, `accessibility`, `export-page`,
  `drinks`, `homepage-browse`, `mobile`, `visual` — **152 passed** (the
  first run, after the review fixes; `--update-snapshots`); after the last
  component and spec changes `make`, `accessibility`, `mobile`, `visual` —
  **127 passed**, and the specs baseline's own rerun 1 passed.
- Playwright, Docker, dev mode (CI's): `make` + `accessibility` — **99
  passed** (the first dev run: 98 passed, 1 flaky, Th6, fixed).

**Baselines** (Docker only, each opened and compared with the prototype):

- `visual.spec.ts/make-page-e2e.png` **moved**: the redesign itself (the
  question as the h1, the tape shelf, Buy next with names, the Cards
  switch, "Needs" tapes on the photo cards).
- `visual.spec.ts/make-page-specs-e2e.png` **new**: the spec cards, a
  feature in the question (`ingredient:tonic`), "Buy next for tonic
  drinks", the marked lines; shot at 1280 × 1800 (Th5).
- `mobile.spec.ts/make-mobile-mobile.png` **new**: the phone, the folded
  shelf's summary ("4 on hand · gin featured") above the results, a
  featured label.
- No other baseline moved.

**Roger to confirm:**

- **Dh2: the saved list's per-item editing is gone from `/make`.** You
  used to add or remove one saved item at a time there, each its own
  commit. Now it is whole-list: Save to editor (with the +/− diff) or Copy
  to this browser. Item by item stays in the CLI / MCP. Say if the per-item
  editor should come back (e.g. × on the outlined saved labels).
- **Dh7: on Make, featuring gin means gin, not ginger; Search's
  `ingredient:gin` still prefix-matches.** And a garnish-only use doesn't
  put a drink "with" the item.
- **Dh1:** the "Also makeable with your saved inventory" group is gone from
  `/make` (Count from → Both replaces it); `/drinks` keeps its group.
- **Dh4:** removing a featured item from the list leaves it featured.
- **Dh9:** Ctrl+Z / ⌘Z undoes the last shelf change while its toast shows
  (not inside a text field).
- **Dh11:** the dotted, muted look for uncounted labels in Saved mode.

### 41i — Make for the agents

Branch `agent/41i-make-tools`. **Reindex needed: no. Deploy: yes** (the
editor: the MCP-over-HTTP seat and `/api/inventory/make` answer the new
inputs; the stdio MCP and the CLI pick them up from the checkout). No
content, index or stored-format change; the saved staples are read, never
written.

**What shipped:**

- **`feature`** on MCP `inventory_makeable` (an array of ingredient names,
  ≤ 10, ≤ 80 characters each), `recipes inventory make --feature <name>`
  (repeatable) and `/api/inventory/make?feature=…` (repeated; the HTTP
  backend sends a `string[]` query value as the key repeated). Each feature
  is written into the query as `/make` writes it (`withFeature`), and the
  query's top-level `ingredient:` terms are the features
  (`featuredOfQuery`), so `{"feature": ["lime"]}` and
  `{"query": "ingredient:lime"}` answer alike. The features narrow through
  41h's own `featureScope` (Dh7): a recipe is judged only when each one
  meets a required line — gin is gin, never ginger beer; a garnish doesn't
  count; several must all meet.
- **The page's scope** (`inventory.ts` `makeable`): `scopeRecipes` over the
  query `withoutFeatures`, with the term resolver for `tag:` and the group
  memberships for `group:` read only when the query has them, then
  `featureScope`; one index read serves both the scope and the judge, and
  the corpus is prepared once. Buy next is `analyzeMakeable`'s over the
  narrowed scope — "Buy next for lime drinks", with each item's `recipes`.
- **The answer adds** `scope` (the query with the features written in),
  `features`, `link` (`/make?q=<scope>`, the page showing the same) and
  `alwaysHave`; `query` stays the scope as given, and `total` counts the
  recipes judged after the features. The CLI's text output names the scope
  and features and prints `On the site: <link>`.
- **The saved staples** (Di3): `makeable` reads `settings.makeStaples` (38a,
  Da2) through the engine's settings store and assumes it as "Assume I
  always have", else `DEFAULT_STAPLES`; the pantry switch (`staples`) is
  unchanged.
- **CLI:** `--query <q>` beside the positional words (one or the other — a
  usage error for both); `--query -tag:drink` works, since
  `protectDashedPositionals` now hands a dashed value to a string option
  inline (`--query=-tag:drink`), which `parseArgs` would otherwise refuse as
  ambiguous. `inventory make --help` documents the JSON; the global
  `--help`'s "What's on hand" paragraph names the saved staples, `--feature`
  and Count from (it still described the "separate group" 41h removed).
- **The curator skill** (§8): "What can I make with lime?" → `feature`, with
  `inventory_makeable {"query": "tag:drink", "feature": ["lime"]}` and a
  food example; the answer's fields; hand Roger the `link`, noting the page
  counts from his browser's list. The fallback lists
  `inventory make --query … --feature …`. Frontmatter unchanged (43);
  tools 57 / 43.
- The D8 import boundary (`curation.test.ts`) admits `/make`'s pure halves
  (`MakePage/scope`, `kinds`, `makeMath`) and `@discontent/cms/settings`;
  `cliJson.test.ts` proves a plain `tsx` process runs them.
- `agent-mixology.md` D11 carries a "superseded in part" note.
  `agent-mcp.md` has no table of `inventory_makeable`'s inputs, so it is
  unchanged.

**Di1 — the tools scope as `/make`, not as `recipe_search`.** Until now the
scope went through `searchRecipes` (D11): ranked, and any one free-text
word was enough. It is now `scopeRecipes`, the page's narrowing: every
free-text word must appear (`inventory make lavender tonic` is the one
recipe with both, not every recipe with either). `tag:` still reaches a
term's subtree and `group:` a group's members — the page's corpus is
decorated with groups too (`SearchContext`), so the server decorates the
same way (`readGroupsByRecipe`, now exported). `recipe_search` itself is
unchanged.

**Di2 — the features live in the scope.** `feature` is sugar for the
query's `ingredient:` terms, exactly as the page's featuring is; so the
answer's `scope` and `link` are what the page would hold, and a feature
already in the query is not added twice (by `featureKey`). Close matches
count in the featured judgement, as they do in the tools' judgement (there
is no `countClose` input; the page's default is on).

**Di3 — the server reads the per-instance saved staples.** The settings
store resolves `SETTINGS_DIRECTORY`, else `settings/` in the working
directory: the stdio MCP and `pnpm recipes` run in the editor package, so
on the workstation they read the editor's own `editor/settings`; over
`--remote` / MCP over HTTP the editor answers with its own settings (the
Pi's are the Pi's). A missing file, a missing key or a malformed list (a
non-string entry) reads as nothing saved. The tools count from the shared
list only — there is no browser list on the server, so no Count from.

**Di4 — `feature` is an array.** `"feature": "lime"` is a validation error
(the tool schema says `string[]`); one shape keeps the MCP schema plain. A
feature must name an ingredient: one whose `featureKey` has no letter or
digit (`()`, `"`) is refused ("A feature must name an ingredient, e.g.
lime") rather than dropped, which would have answered the whole scope
(review).

**Di5 — `link` is absolute where the caller knows the editor (review).**
The server answers a path (`/make?q=…`); the HTTP backend (`--remote`,
`RECIPE_API_URL`) makes it absolute on the origin that answered, and the
local backend on `--notify`'s URL, else `RECIPE_EDITOR_URL`
(`cli/backend/link.ts`, http(s) bases only). Without either — the editor's
own MCP over HTTP, a CLI with no editor URL — it stays a path, and the
skill presents it as a path on Roger's editor.

**Di6 — an editor older than 41i is named, not trusted (review).** The Pi
is deployed after the workstation, so `--remote` can reach a route that
ignores `feature` and answers the whole scope. The HTTP backend refuses
that answer when a feature was sent and the answer has no `features`:
"The editor at <origin> predates featuring (41i) — update it, or run with
--content-dir" (the 36c/36e/38e pattern); without a feature the old answer
passes, and the text output reads its missing fields as absent.

**CLI flag values (review).** `protectDashedPositionals` takes a string
option's next token inline only when it is a negation (`/^-[^-]/`,
`--query -tag:drink`); a `--`-prefixed token is still left for `parseArgs`
to refuse, so `--feature --json` is an error, never a feature named
"--json".

**Tests:** `inventory.test.ts` (+7: lime featured with the garnish-only G&T
out and Buy next inside the scope, gin vs ginger beer and two features,
`ingredient:` in the query read once, every free-text word, the saved
staples and a malformed list, `feature` repeated on the route, an empty
feature refused); `mcp.test.ts` (featuring through the tool);
`cliJson.test.ts` (`--query -tag:drink`, two `--feature`s, the saved
staples from a settings directory of the test's own, both scopes a usage
error); `curatorSkill.test.ts` (+1: the lime example, `link`,
`alwaysHave`, the fallback line).

**Gates** (all through the capped wrappers):

- `pnpm --filter recipe-editor typecheck` ✓, `pnpm --filter recipe-website
exec tsc --noEmit` ✓.
- Affected files first (`inventory`, `mcp`, `mcpHttp`, `cliJson`,
  `curatorSkill`): **5 files, 105 tests** ✓. The first full run failed one
  test, the D8 import boundary (the new imports, allow-listed above); after
  it, `pnpm exec vitest run`: **119 files, 2406 tests** ✓.
- Playwright, Docker, build mode: `api-write.spec` — **27 passed** ✓ (the
  phase changed `/api/inventory/make`; its new `feature` parameter is
  tested in-process in `inventory.test.ts`, which calls the route's `GET`).
- After the review (Di4–Di6, the flag fix; `inventory.test.ts` +4: an old
  editor's answer with and without a feature and its text output, the
  absolute link, the flag values, `absoluteLink`): both typechecks ✓;
  `inventory`, `mcp`, `mcpHttp`, `cliJson`, `curatorSkill`, `curation` —
  **6 files, 213 tests** ✓.

**Deferred:** the page's add-field what-if ("+N now · M closer",
`addCandidates`) has no seat; Buy next with its `recipes` answers "what
should I buy" for an agent. Reopen if the curator needs "what would X add?"
for an item Buy next doesn't rank.

**Roger to confirm:**

- **Di1:** `recipes inventory make chicken pasta` (and the tool with a
  multi-word query) now needs both words, as `/make` does; before, either
  word was enough.
- **Di1/Di2:** a tool query that already carried `ingredient:x` used to
  narrow by Search's word-prefix match; it is now a feature, judged by the
  matcher — garnish-only uses and look-alikes drop out (`ingredient:gin`
  no longer keeps a Moscow Mule for its ginger beer, nor a G&T that has
  lime only as a garnish under `ingredient:lime`).
- **Di3:** the CLI and MCP now assume your saved "Assume I always have"
  list, not only salt, pepper, water and ice — the answer's `alwaysHave`
  shows which.
