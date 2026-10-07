# Epic 27 — CI hygiene, Pi content sync, bar tools, search quality

> **This is the durable source of truth for the epic-27 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching CI, the sync and
> index-rebuild paths, API tokens, the bar view or unit toggle, or search
> ranking. Update the roadmap **Status** column and the **Now** line at every
> phase boundary. Earlier epics are cited by number with a prefix (`26-D5`,
> `25-T9`, `24-D5`).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

**Now:** 27a in progress.

## Context

Epics 25 (mixology) and 26 (import tooling) are merged (main `5e454114`), and
the content repo holds 194 drinks. On 2026-10-07 Roger picked all four
candidate directions from `backlog.md` and these choices:

- **Cadence:** phases run back to back, like epic 26. Each phase is its own
  PR, merged on green CI under the standing grant, and the next phase starts
  immediately.
- **Focus view:** every recipe gets one ("Bar view" on drinks, "Cook view"
  otherwise).
- **Imported-from migration:** one bulk commit.
- **New style term:** `shaken`. Changed mid-epic, see D1.

What exploration found (2026-10-07):

- **Sync gap.** Every pull path in `editor/controller/actions/sync.ts` (pull,
  sync, `commitMerge`, `abortMerge`, `commitWorkingChanges`), branch checkout
  and Settings → Maintenance called `rebuildRecipeIndex()`, which rebuilds
  only recipes and featured, so the groups, tag-terms and pages indexes went
  stale. Agents had no fetch or pull seat (23-D22). `gitStatus` ahead/behind
  is only as fresh as the last fetch. Nothing noticed a push landing on the
  Pi, because the index metadata carried no commit.
- **Tokens.** `ApiToken{id,hash,name,createdAt}`: every token is full-write,
  there is no revoke script, and `requireCurationContext` returns no scope.
- **Search.** The browser ranks (name > tags > ingredients > description) and
  soft-ORs. The CLI/MCP path was strict AND and unranked. `source` was not
  indexed.
- **Legacy descriptions.** 273 real recipes start with
  `*Imported from [x](url)*` (258 with `\r`) and none has a `source`.
- **Bar.** No servings, unit-conversion or wake-lock code. Scaling is
  `Multiplier/Provider.tsx` plus `Multiplyable` (`baseNumber` only, no unit).
  Ingredient-name bugs traced to `common/util/ingredientNames.ts`.
- **CI.** All actions were `@v4` (Node 20 runtime). `lint.yml` linted
  `--diff origin/main`, which is main's tip, not the merge base. Nothing
  checked the Playwright image against `@playwright/test`.

## Execution model

One worktree, `.claude/worktrees/agent-27`, off `origin/main` (`5e454114`).
Branch `agent/27x-…` per phase, each off main after the previous phase has
merged. Playwright on port 3019 (25-T5) via `setsid nohup`. Tests use scratch
content only. Real-content steps (reindex, the migration, retagging) run
through the CLI with `--content-dir /home/roger/Projects/recipe-content` after a
dry run, and stay unpushed; pushing to uraninite is Roger's.

## Decisions log (D-list)

### D1 — `shaken` is a method tag, and sours carry it too

The plan read `shaken` as "shaken, no citrus", mutually exclusive with
`sour`. Roger (2026-10-07): "sours should probably also have shaken but
search should be able to search for 'shaken but not sour'". So the two tags
now describe different axes:

| Tag      | Axis        | Means                             |
| -------- | ----------- | --------------------------------- |
| `shaken` | method      | shaken with ice (`method: shake`) |
| `sour`   | composition | spirit + citrus + sweetener       |

Every drink whose spec says `method: shake` carries `shaken`, sours
included. "Shaken but not sour" is `tag:shaken -tag:sour`: negation already
exists in the query language, and `tag:` matches a recipe's literal tags with
no hierarchy expansion, so explicit tagging is what makes the query work.
The citrus-free four (espresso martini ×2, French martini, brandy alexander)
lose their wrong `sour`/`built` tag.

## Traps (T-list)

### T1 — The sandbox refuses git in compound or scripted commands

A worktree-isolated session runs git only as plain, single commands from the
worktree. A `cd` into the main checkout, a loop variable, `$VAR` in an
argument position, or a heredoc that mentions git is refused. Edit files with
the Edit tool rather than with a script that names git anywhere.

## Roadmap

| Phase | Scope                               | Branch                 | Status |
| ----- | ----------------------------------- | ---------------------- | ------ |
| 27a   | CI and repo hygiene                 | `agent/27a-ci-hygiene` | 🟡     |
| 27b   | Pi content sync and token hygiene   | `agent/27b-pi-sync`    |        |
| 27c   | Bar tools                           | `agent/27c-bar-tools`  |        |
| 27d   | Search quality and legacy migration | `agent/27d-search`     |        |

## Phase detail

### 27a — CI and repo hygiene `agent/27a-ci-hygiene` 🟡 (← `main` `5e454114`)

- **Actions on Node 24.** Each action was checked at its `releases/latest`
  and its `action.yml` `runs.using` on 2026-10-07: `checkout@v7`,
  `setup-node@v7`, `cache@v6`, `upload-artifact@v7`, `download-artifact@v8`,
  `pnpm/action-setup@v6`, all `node24`. The release notes between v4 and
  these majors touch nothing this repo uses (`pnpm/action-setup` v6 adds pnpm
  11 support; `packageManager` still pins pnpm 10.24.0). `lint.yml`'s three
  setup-node steps now pin `node-version: 22`; it was unset.
- **Lint the branch, not the gap.** `fetch-depth: 0` and
  `lint-staged --diff "$(git merge-base origin/main HEAD)"`.
- **Image check.** `scripts/check-playwright-image.sh` runs as the first step
  after install in each container job (recipe shards, portfolio, CMS demo),
  from that job's package. It compares every
  `mcr.microsoft.com/playwright:v…` tag in `playwright.yml` and
  `Dockerfile.playwright` with `pnpm exec playwright --version`, and fails
  with an `::error::` naming both versions.
- **Old worktrees, for Roger.** The session cannot remove them (T1), and
  every branch below is merged into `origin/main` (`git branch --merged`,
  2026-10-07). From the main checkout:

  ```
  git worktree remove .claude/worktrees/agent-24c
  git worktree remove .claude/worktrees/agent-25a
  git worktree remove .claude/worktrees/agent-25c
  git worktree remove .claude/worktrees/agent-25d
  git worktree remove .claude/worktrees/agent-26
  git worktree remove .claude/worktrees/agent-26d
  git worktree remove .claude/worktrees/agent-import-ua
  git branch -d agent/24c-term-records agent/fix-cache-key-version \
    agent/25a-drink-spec agent/25b-mixology-docs agent/25c-make \
    agent/25d-shared-inventory agent/25e-docs agent/25f-drinks-batch2 \
    agent/26c-skill-ui agent/26d-import-tail agent/importer-browser-ua \
    agent/importer-ua-fallback
  ```

  The pre-epic worktrees (`fix-search-populated-version`, `pagination-43`,
  `portfolio-rebuild`, `settings-polish`, `sticky-chrome`) are merged as well,
  and about a hundred older local `pagination/*`, `portfolio/*` and `ui/*`
  branches too. They are Roger's to keep or drop.

## Deferred

## Key files

- `.github/workflows/lint.yml`, `.github/workflows/playwright.yml`,
  `scripts/check-playwright-image.sh` (27a).
