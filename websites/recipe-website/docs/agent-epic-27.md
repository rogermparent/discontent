# Epic 27 — CI hygiene, Pi content sync, bar tools, search quality

> **This is the durable source of truth for the epic-27 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching CI, the sync and
> index-rebuild paths, API tokens, the bar view or unit toggle, or search
> ranking. Update the roadmap **Status** column and the **Now** line at every
> phase boundary. Earlier epics are cited by number with a prefix (`26-D5`,
> `25-T9`, `24-D5`).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

**Now:** 27a and 27b committed on stacked local branches (pushes fail, T2);
27c in progress on `agent/27c-bar-tools`.

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

### D2 — Every tree-moving path rebuilds every index (27b)

Pull, sync, `commitMerge`, `abortMerge`, `commitWorkingChanges`, branch
checkout and the stale-index banner all call `rebuildAllIndexes()`, which is
`reindex`'s all-types pass plus `revalidateDerivedState(recipeContentTypes)`.
They called `rebuildRecipeIndex()`, which rebuilds recipes and the featured
recipes its cascade reaches, so a pull that brought in a group or a term record
left those indexes describing the old tree. The old argument for the narrow seat
("widening it would drop the whole cache on every checkout") is wrong in the
direction that matters: a checkout swaps groups and terms too, and a cache that
survives it is the wrong one. `rebuildRecipeIndex` stays, pinned narrow by
`test/revalidateDerived.test.ts` and still behind Maintenance's "Reload Recipe
Database" button; nothing on a git path calls it. Branch _delete_ no longer
rebuilds at all, since it moves nothing on disk. Checkout used to rebuild twice.

### D3 — The index stamp lives in `.git/`, and engine commits carry it forward

`packages/cms/git/indexStamp.ts`. A full rebuild (`reindex` with no type)
writes the HEAD it read _before_ the loop to
`$(git rev-parse --git-path discontent-indexed-head)`. `readIndexFreshness`
compares it with HEAD now; `stale` is true when they differ or no stamp exists.

- **Inside `.git/`, not a gitignored `<content>/.indexed-head`.** Git never
  tracks anything there, so the real content repo needs no `.gitignore` commit,
  and a fresh clone (no indexes yet) correctly reads as stale.
- **`commitChanges` advances it**: if the stamp named the HEAD the commit lands
  on, it moves to the new HEAD. Every engine write is a commit and keeps the
  indexes current incrementally, so without this the banner would show after
  every edit. A stamp that was already behind stays behind.
- **Initialize stamps** (the app's action and the Playwright harness's
  `initializeContentGit`): the indexes described those files before there was a
  repository. A one-type rebuild never stamps.
- **First deploy:** an existing repo (the Pi, the main checkout) has no stamp
  yet, so the banner shows once with "No index rebuild has been recorded"; one
  rebuild clears it.

`gitStatus` gains `indexStale` and `indexedHead`, plus `diverged`
(`ahead > 0 && behind > 0`) and `fetchedAt` (`FETCH_HEAD`'s mtime). The banner
(`IndexStaleBanner.tsx`) renders on `/git` and Settings → Maintenance, which
also gains a primary "Rebuild all indexes" button.

### D4 — Agent fetch and pull: merge only, and never leave a conflict behind

`curation/git.ts`:

- `gitFetch(ctx, {remote?})` runs `fetch --prune` against the named remote, or
  the upstream's, or `--all` when there's no upstream. Answers
  `{remote, upstream, ahead, behind, diverged, fetchedAt}`.
- `gitPull(ctx, {remote?})` requires a clean tree, fetches, counts
  `HEAD..from`, and returns `merged: false` early when that count is 0.
  Otherwise it runs `merge --no-edit <upstream>` (never rebase, and `merge`
  rather than `pull` so `pull.rebase` can't change the outcome). Success is
  judged by the repository afterwards, not by the call (T3). On any failure it
  runs `merge --abort` (then `reset --hard HEAD` if the tree still isn't clean)
  and throws `git_conflict` naming the paths. On success it calls
  `rebuildAfterRewind` (full reindex + stamp + `onBulkChange`) and returns
  `{from, merged, fastForward, newCommits, head, rebuilt}`.
- `gitStatus(ctx, {fetch})` fetches first. A failed fetch throws rather than
  answering stale refs.

**Deviation from the plan:** the plan said both seats refuse a dirty tree.
Only `gitPull` does. A fetch touches nothing that uncommitted work could
collide with, and refusing it would break `git status --fetch` exactly when
someone wants to see where they stand.

Surfaces: the CLI's `git fetch [<remote>]`, `git pull [<remote>]` and
`git status --fetch`; the API's `POST /api/git/fetch` and `/api/git/pull`, and
`GET /api/git/status?fetch=1`; and the MCP tools `git_fetch` (pre-approved),
`git_pull` (held back like `git_push`) and `git_status {fetch}`. A rejected push
now says "Run git pull (or Pull on the editor's Git page)".

### D5 — The CLI's git remote is a positional (27b)

`recipes git push --remote uraninite` never worked. The command's `--remote`
was also the CLI's global `--remote <editor URL>`, and `parseArgs` merged the
two, so the CLI tried to reach an editor at the URL "uraninite". `push`,
`fetch` and `pull` now take the remote as a positional, as git does:
`recipes git pull uraninite`.

### D6 — Token scopes: `read` | `write`, missing = write; no `lastUsedAt`

- `ApiToken.scope?`: a row without one is `write`, so every pre-27b token keeps
  working. `create-token --read-only` mints `read`, and
  `scripts/revoke-token.ts -e <email> (--id <id> | --name <name>)` removes rows.
- `findUserByToken` and `authenticateRequest` return `{email, scope}`. A session
  is always `write`.
- `requireCurationContext(request, {need})` defaults to `write`, so a route that
  says nothing stays strict. The authenticated GETs (`git/status|log|show|file|diff`,
  `inventory`, `inventory/make`), `inspect`, `git/fetch` and the MCP endpoint
  ask for `read`. A read token on a write route gets 403 with the new
  `forbidden` code.
- **MCP:** a read-scoped HTTP session registers only the tools annotated
  `readOnlyHint: true`. The filter is the annotation, not which wrapper a
  handler uses, because `git_push` answers through `read()` and is still a
  write. `git_fetch` counts as read-only (it moves remote refs only).
- **No `lastUsedAt`:** the user record lives in the content directory, so
  stamping it on every request would rewrite (and for a tracked `users/`,
  commit) a file per API call.

## Traps (T-list)

### T1 — The sandbox refuses git in compound or scripted commands

A worktree-isolated session runs git only as plain, single commands from the
worktree. A `cd` into the main checkout, a loop variable, `$VAR` in an
argument position, or a heredoc that mentions git is refused. Edit files with
the Edit tool rather than with a script that names git anywhere. Pushing to a
URL other than `origin`'s (the renamed repository's own URL) is refused as a
"remote repoint".

### T2 — `origin` was renamed: pushes answer 500

On 2026-10-07 every push to `rogermparent/content-engine` answered
`remote rejected … (Internal Server Error)`, and the push output said the
repository had moved to `rogermparent/discontent`. Pushing to the new URL
answered 500 too. Fetches still work through the redirect. Roger's fix:
`git remote set-url origin git@github.com:rogermparent/discontent.git` in the
main checkout. Until pushes work again, the 27x branches stay local and
stacked (`27b` on `27a`, and so on), and are merged in order once they can
be pushed.

### T3 — `simple-git`'s `raw` resolves when git exits 1 without stderr

`merge-base --is-ancestor` answers only through its exit code, and a
conflicted `merge` prints its CONFLICT lines on stdout and exits 1. `raw`
resolved both. So `gitPull`'s first draft called every pull a fast-forward and
answered `merged: true` with the tree left mid-merge. Judge by the repository
afterwards (`MERGE_HEAD`, `status().conflicted`, `rev-list --count`), never by
whether the call rejected. The `/git` page's `doPull` had the same latent bug
(a conflicted pull fell through to a rebuild over conflict markers) and now
checks `MERGE_HEAD` too.

### T4 — A token is an uncommitted change in a tracked `users/`

Tokens live in `<content>/users/<email>`, and the real content repo's
`.gitignore` does not ignore `users/`. So `create-token` and `revoke-token`
leave the tree dirty, and `git pull` / `git_pull` answer `dirty_tree` until
the change is committed ("Commit working changes" on `/git`). The first draft
of 27b's API-pull Playwright test hit exactly this, because it minted its token
after the initial commit.

## Roadmap

| Phase | Scope                               | Branch                 | Status                  |
| ----- | ----------------------------------- | ---------------------- | ----------------------- |
| 27a   | CI and repo hygiene                 | `agent/27a-ci-hygiene` | ✅ local, unpushed (T2) |
| 27b   | Pi content sync and token hygiene   | `agent/27b-pi-sync`    | ✅ local, unpushed (T2) |
| 27c   | Bar tools                           | `agent/27c-bar-tools`  | 🟡                      |
| 27d   | Search quality and legacy migration | `agent/27d-search`     |                         |

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

### 27b — Pi content sync and token hygiene `agent/27b-pi-sync` ✅ local (stacked on 27a, T2)

D2–D6. Gates, 2026-10-07:

- Both typechecks clean.
- `vitest`: 43 files, 840 tests. New cases cover fetch, pull (fast-forward,
  diverged merge, aborted conflict, nothing to pull, dirty tree, no upstream),
  the stamp (unstamped, carried forward by engine writes, stale after a shell
  commit, a one-type rebuild leaving it alone, an `updateInstead` push), scopes
  and revocation, and the read-only MCP tool list.
- Playwright `git.spec` + `api-write.spec`, e2e: 50/50 after one test-order fix
  (T4).
- `/git`'s visual baseline is untouched: Initialize stamps HEAD, so no banner
  shows there.

## Syncing with uraninite

`uraninite` is the Raspberry Pi editor: a non-bare clone of the content repo
with `receive.denyCurrentBranch updateInstead`, so a push updates its working
tree directly. Both sides add recipes.

**Order, from the laptop:**

```
recipes git status --fetch        # where do we stand? diverged?
recipes git pull uraninite        # merge the Pi's recipes in (aborts on conflict)
recipes git push uraninite        # then send ours
```

The same steps through MCP are `git_fetch` and then `git_status`; `git_pull`
and `git_push` are held back, so a person runs them. Through the editor, use
`/git` → Sync. A conflicting pull is aborted and leaves the tree as it was;
pull from `/git`, whose resolver handles it.

**On the Pi after a push:** the working tree has moved, but the Pi editor's
indexes have not. Its `/git` page and Settings → Maintenance show "Content
changed outside the editor — Rebuild indexes" until someone clicks the button.
This is the stamp from D3.

**Optional: rebuild automatically.** Add a `post-receive` hook in the Pi's
content repository (`.git/hooks/post-receive`, executable) that asks the
running editor to reindex, using a write token minted on the Pi
(`pnpm create-token -e you@… -n post-receive`):

```sh
#!/bin/sh
curl -fsS -X POST http://localhost:3000/api/reindex \
  -H "Authorization: Bearer $(cat /home/pi/.recipe-reindex-token)" \
  -H "Content-Type: application/json" -d '{}' >/dev/null \
  || echo "reindex request failed; use Rebuild indexes in the editor" >&2
```

A full reindex also stamps HEAD, so the banner clears. Keep the token file
readable only by the user the hook runs as, since `/api/reindex` needs a write
token.

## Deferred

- **Server-side `group:` in `recipe_search`.** Backlog says it was picked up by
  24d (D6), but `curation/search.ts` rows still carry no group membership, and
  `group:<slug>` matches nothing from the CLI or MCP. Found while writing 27b's
  pull test, which checks the groups index through `listGroups` instead. Fold
  it into 27d's search work if it fits; otherwise it stays here.

## Key files

- `.github/workflows/lint.yml`, `.github/workflows/playwright.yml`,
  `scripts/check-playwright-image.sh` (27a).
- `packages/cms/git/indexStamp.ts`, `packages/cms/git/commit.ts`;
  `editor/controller/curation/{git,reindex,errors,http,schema,context}.ts`;
  `editor/controller/{apiAuth,apiContext}.ts`;
  `editor/controller/actions/{sync,index}.ts`;
  `editor/src/app/(editor)/(settings)/IndexStaleBanner.tsx`;
  `editor/src/app/api/git/{fetch,pull}/route.ts`; `editor/src/users/index.ts`;
  `editor/scripts/{create,revoke}-token.ts`; `editor/mcp/{registry,http}.ts`;
  `editor/cli/commands/git.ts` (27b).
