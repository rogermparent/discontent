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

### 41f — Accessibility follow-through

Branch `agent/41f-a11y`. **Reindex needed: no. Deploy: yes, for the look**
— every text field, select and outline button gets a visible border, and
two reader controls change names (below). No content or index change.

**Df1 — `--input` at ≥ 3.1:1 (WCAG 1.4.11), the smallest change.**
`--input` is the border of every `Input`, `Textarea`, `Select` trigger,
outline button, toggle and the shared `Form` field class. Fitted with
`contrastRatio` (now `contrastOver`, below) against the page and a card,
in all three neutral families; the old values first:

| Mode  | Old → new                                 | warm page / card | cool page / card | gray page / card |
| ----- | ----------------------------------------- | ---------------- | ---------------- | ---------------- |
| light | L 0.9 (1.27 / 1.35) → **L 0.64**          | 3.18 / 3.36      | 3.17 / 3.36      | 3.18 / 3.36      |
| dark  | 15 % white (1.54 / 1.59) → **35 % white** | 3.21 / 3.22      | 3.21 / 3.22      | 3.21 / 3.22      |

L 0.65 (40g's suggestion) gives 3.05:1, too close to 3:1 for renderer
rounding; 0.64 is the first step past 3.1. Dark at 34 % gives exactly
3.10, so 35 %. The chroma and hue stay the family's, and the accent never
reaches `--input`, so no hue changes it (tested). `styles/theme.css`
mirrors the default (`oklch(0.64 0.008 80)`, `oklch(1 0 0 / 35%)`).
40g's numbers were 1.27:1 light and "~1.8:1" dark; measured composited
over the page the old dark border was 1.54:1.

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
import `theme.css`: untouched.

**Df3 — `contrastOver`.** `contrast.ts` gains `oklchAlpha` and
`contrastOver(fg, bg)`: a translucent colour composited over an opaque
surface in gamma-encoded sRGB (as browsers paint `oklch(… / A)`), then the
WCAG ratio. `test/theming.test.ts` adds a "form-control border contrast"
block beside 30b's accent sweep: `--input` against `--background`,
`--card` and `--popover`, three families × two modes, at ≥ 3:1 and at the
≥ 3.1:1 margin; the accent hue can't move it; the fills keep the old
values; and the compositing maths (the old dark border at 1.54:1, both
alpha spellings, 0 % paints nothing).

**Df4 — the bar is WCAG 2.2 AA.** `WCAG_TAGS` (recipe and portfolio
`playwright/support/a11y.ts`) is now `wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`, `wcag22aa`. The four specs that spelled the tags out
(`command-palette`, `search-live`, `search-query-language`,
`search-tags`) import it, so one bar covers every axe check.

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
  only 2 of 44 recipe baselines (and none of portfolio's 11): a 1 px outline is a small share of a
  full-page shot. Visual review is the opened PNGs and the contrast sweep,
  not the count of moved images.

- **Tf5 — a dev-mode `/make` flake, not this phase's.** In dev mode the
  first `/make` load can sit on "Loading recipes…" past 20 s (the cold
  compile of the corpus route), and for a moment two `make-ticker`
  paragraphs exist (strict-mode violation); the retry passed.
  `accessibility.spec:59` in dev only; build mode never showed it.

**Roger to confirm.**

- The values: light `--input` L 0.64 and dark 35 % white (Df1) — the
  quietest pair at ≥ 3.1:1. Outline buttons and toggles follow, since they
  share the token; the alternative is moving them to `border-border` to
  keep their hairline (their text names them, so 1.4.11 doesn't require
  it).
- On the light `--muted` (0.955) and `--secondary` (0.94) surfaces the new
  border is 2.95:1 and 2.82:1. The sweep covers the page, card and
  popover, where forms sit; a field on a muted panel would need L 0.62.
- The card chips at 24 px (the table above): cards with tags are ~2 px
  taller, `/make`'s page 4 px.
- Names that changed for screen readers: "½× (Half batch)", "I have this:
  lime juice".
