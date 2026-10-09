# Epic 27 — CI hygiene, Pi content sync, bar tools, search quality

> **This is the durable source of truth for the epic-27 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the picture by
> reading this file. **Read this file first** before touching CI, the sync and
> index-rebuild paths, API tokens, the bar view or unit toggle, or search
> ranking. Update the roadmap **Status** column and the **Now** line at every
> phase boundary. Earlier epics are cited by number with a prefix (`26-D5`,
> `25-T9`, `24-D5`).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

**Now:** the epic is closed. 27a (#159), 27b (#161), 27c (#162) and 27d
(#163) are merged (main `a7b9d1bc`). Roger pushed the content repo's 78
epic commits to the Pi on 2026-10-07 (`uraninite` at `b078b49`, 0/0). The Pi
then moved to the container deploy in `deploy-pi.md`.

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

### D7 — Parser fixes, each with its 25f finding as the test (27c)

`common/util/ingredientNames.ts`; the cases are in `test/ingredientNames.test.ts`
"25f's parser findings, fixed":

- **`inheritTails` doesn't lend to a whole name.** It skips a compound left side
  ("simple syrup or maple syrup") and a `STANDALONE` word (honey, agave, sugar,
  molasses, salt, milk, cream, butter, egg, coffee, espresso, ice, water). The
  borrowed tail also drops the left word itself, so "vodka or citron vodka"
  stays `vodka` and "sweet or semi-sweet red vermouth" reads
  `sweet red vermouth`. "lemon or lime juice" still distributes.
- **`toName` pairs compounds before dropping descriptive words**, and `hot
sauce` is a compound. A second pairing pass keeps the old behaviour for
  pairs a descriptive word sat between ("egg, large white").
- **`stripAmount` handles chains and alternatives.** It follows a `plus|and
<qty> <unit>` chain, but only when both a quantity and a unit follow, so
  "salt and 2 eggs" keeps its second item. It also takes `unit or unit`
  ("bottle or can").
- **`UNITS` gains `recipe` and `batch`.**
- **The soda synonym leaves flavoured sodas alone** (grapefruit, lemon, lime,
  cherry, ginger, …).

Real repo, read-only, 2026-10-07:

- `measure-ingredient-names.ts --tag drink`: every recorded finding comes out
  right, "heavy cream or half and half" is no longer mangled, and the corpus
  name set is unchanged. Only counts moved, because "plus" chains now resolve.
- `inventory make tag:drink`, before and after: canMake 5 → 5, oneAway 31 → 31.
  Two oneAway drinks name what they lack more cleanly:
  - lavender lemonade: `recipe lavender syrup` → `lavender syrup`
  - vodka gimlet: `simple syrup syrup or …` → `simple syrup or maple syrup`

### D8 — oz · ml · parts: the unit moves into the tag at render time (27c)

`common/util/barUnits.ts` (pure, `test/barUnits.test.ts`), and
`View/Units` (`UnitProvider`, `UnitToggle`) beside `MultiplierProvider`.

- **How it works.** Before rendering, `markOunces` rewrites
  `<Multiplyable baseNumber="x" /> oz` (also `ounce`, `ounces`) to
  `<Multiplyable baseNumber="x" unit="oz" />`, and `Multiplyable` reads the
  mode from context. Stored data never changes.
- **Only oz lines change.** Dashes, tsp, an egg white and a `(1:1)` ratio
  render the same in every mode.
- **oz** is exactly today's output.
- **ml** is ×30 including the multiplier, rounded to the nearest 5 and never
  below 5.
- **parts** is `amount ÷ smallest oz amount` as a simple fraction ("2 2/3
  parts", "1 part"). The multiplier is ignored, and the scaler greys out with
  "parts don't scale".
- **When the toggle shows.** It appears only when the recipe has an oz line,
  and parts needs two. The choice is kept in `localStorage`
  (`recipe-unit-mode`, try/catch), read after mount so the server HTML always
  says oz.
- **Batching note.** When the multiplier is above 1 and `drink.method` is shake
  or stir, the ingredients card says "Batching? Stir in about N … water". N is
  the scaled oz total × 25% (shake) or 20% (stir), to the quarter ounce, shown
  in ml in ml mode.

### D9 — Focus view: an overlay inside the recipe view's providers (27c)

`View/FocusView`. "Bar view" shows on a recipe with a `drink` spec or the
`drink` tag, and "Cook view" on everything else; the button sits beside the
bookmark. It is a full-screen `role="dialog"` rendered inside the recipe view,
so it shares the multiplier and unit mode (and carries the scaler and toggle
itself). Common code, so the export has it too.

- **Content:** the drink spec bar, ingredients in large type, and numbered
  steps that tap off (`aria-pressed`, struck through).
- **Wake lock:** `navigator.wakeLock.request("screen")`, feature-detected. It is
  re-acquired on `visibilitychange` (browsers drop it when the tab hides) and
  released on close. "· screen stays on" shows while the lock is held.
- **Exit:** Esc or Close. The page doesn't scroll behind the overlay, and the
  overlay is hidden in print.

### D10 — `shaken` on the real repo, and Imbibe's bare yields (27c)

- **The term record** `taxonomies/tag/data/shaken/term.json` (parent `drink`)
  is written by a script through the engine's `commitContentChanges`, because
  no CLI writes term records yet. Its description says it names a method and
  gives `tag:shaken -tag:sour`.
- **Retagging (D1):** all 76 `method: shake` drinks gain `shaken`, one
  `recipes update` commit each after a dry run on two of them. The four
  citrus-free ones swap their wrong style (`sour` on the espresso martinis
  and French martini, `built` on the brandy alexander) for it. A full reindex
  followed, so tag-terms is rebuilt and HEAD stamped. `list --tag shaken` → 76,
  and `search "tag:shaken -tag:sour"` → 20.
- **Imbibe's yields.** `SITE_QUIRKS` in `siteNames.ts` names Imbibe's
  bare-number `recipeYield` (a CMS default, "10" on one-drink cocktails), and
  `mapRecipePage` drops it; "2 drinks" survives. The skill's import checklist
  gains "check `recipeYield` against the volumes".

### D11 — `source:` is two stored fields, filtered like `group:` (27d)

- **The fields.** `buildRecipeIndexValue` adds `sourceName` (`source.name`, else
  `siteLabel(url)`) and `sourceHost` (`hostnameLabel(url)`) to
  `RecipeEntryValue`, each only when a recipe has a source, so a recipe without
  one re-indexes to the same bytes. That is also why no fixture index moved:
  no fixture recipe has a source.
- **Where they flow.** `getRecipes` maps them onto the `/search/all` corpus and
  `toRecipeRow` onto the curation rows (spread, so source-less rows gain no
  keys in `--json`). They are stored, never tokenized: `source:` is a typed
  filter (`matchesFilter`, label or host at a word start), and like `group:`
  it is absent from the bare-negation `"any"` field.
- **`SEARCH_DB_NAME` is `recipe-search-v3`**, with the spec's copy moved too.
  No `map:` store changed, but no browser should go on filtering `source:`
  over documents stored before the fields existed.

### D12 — The server search ORs and ranks (27d)

`curation/search.ts` `scoreFreeText`:

- **Score:** for each word, the weight of the best field it matches (name 4,
  tags 3, ingredients 2, description 1) with the browser's prefix-at-word-start
  `fieldMatches`, summed. A row needs a score above 0.
- **Order:** score descending, then date descending.
- **Unchanged:** typed terms narrow exactly as before, and an empty free text
  keeps every row the filter keeps, newest first.
- **Docs:** the `recipe_search` description and the skill's search paragraph
  now say "any word, ranked" instead of "one or two words at a time".
- **`/make`** keeps its own AND copy (`MakePage/scope.ts`), which is right for
  narrowing a make list.

On the real repo, `search "lime gin"` returns 182 rows with the gin-and-lime
drinks first. Lime Rickey and Shirley Temple rank high too, because `gin` is
a prefix of "ginger" (ginger ale or beer). The browser matches the same way.

### D13 — The legacy "Imported from" migration, one commit (27d)

`editor/scripts/migrate-imported-from.ts <content-dir> [--dry-run]`
(`test/migrateImportedFrom.test.ts` runs it on a scratch repo built from the
`make-drinks` fixture, one recipe per real-world shape).

- **Scope:** only recipes with no `source`. A recipe whose first line parses
  gets `source {url, name: siteLabel(url)}`.
- **Stripping:** the line goes, then the blank lines after it, then a `---`
  rule if the old importer wrote one, then the blanks after that. If nothing
  remains, the description is dropped.
- **Shapes read:** the standard line (`\r` or not), the YouTube importer's
  `*Imported from* [*url*](url)`, an unemphasised `Imported from [label](url)`,
  and a bare URL.
- **Left alone and reported:** two links, a link plus a second URL, and a
  malformed link.
- **One commit** through `commitContentChanges`, then a full reindex (which
  stamps HEAD).

Real run, 2026-10-07: the dry run found **278 candidates** (the plan's count
was 273). It migrated **275**, all of them without a `source`, and skipped 3:

- `blueberry-cheesecake-baked-oatmeal`: a page and a video;
- `key-lime-pie`: a video and a site link;
- `salted-caramel-apple-pie-bars`: a link with no `](`.

That is content commit `b078b490`, "Move legacy 'Imported from' lines into
source (275 recipes)". Afterwards only those three descriptions start with
"Imported from", `source:imbibe` lists 31 recipes, and the repo is clean and
stamped.

## Traps (T-list)

### T1 — The sandbox refuses git in compound or scripted commands

A worktree-isolated session runs git only as plain, single commands from the
worktree. A `cd` into the main checkout, a loop variable, `$VAR` in an
argument position, or a heredoc that mentions git is refused. Edit files with
the Edit tool rather than with a script that names git anywhere. Pushing to a
URL other than `origin`'s (the renamed repository's own URL) is refused as a
"remote repoint".

### T2 — `origin` was renamed, and pushes 500'd for a while

For about half an hour on 2026-10-07, every push to
`rogermparent/content-engine` answered
`remote rejected … (Internal Server Error)`, and the push output said the
repository had moved to `rogermparent/discontent`. Pushes to the new URL
failed the same way. The outage was transient: the same `origin` push went
through later that hour, and the redirect has carried every push since. While
pushes were down, 27b was committed stacked on 27a and both were pushed once
they could be. The old remote URL still works through GitHub's redirect.
Roger can update it at leisure:
`git remote set-url origin git@github.com:rogermparent/discontent.git`.

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

| Phase | Scope                               | Branch                 | Status               |
| ----- | ----------------------------------- | ---------------------- | -------------------- |
| 27a   | CI and repo hygiene                 | `agent/27a-ci-hygiene` | ✅ #159 → `7446c599` |
| 27b   | Pi content sync and token hygiene   | `agent/27b-pi-sync`    | ✅ #161 → `950b6bc2` |
| 27c   | Bar tools                           | `agent/27c-bar-tools`  | ✅ #162 → `474aa61c` |
| 27d   | Search quality and legacy migration | `agent/27d-search`     | ✅ #163              |

## Phase detail

### 27a — CI and repo hygiene `agent/27a-ci-hygiene` ✅ (← `main` `5e454114`; #159 → `7446c599`)

Gates: #159 was green on every job, and its lint job reported "6 files", which
is the branch's own six. The throwaway draft #160 pinned
`Dockerfile.playwright` to v1.58.0, and every container job failed at "Check
the image matches @playwright/test" with
`::error::Playwright image tag v1.58.0 does not match @playwright/test v1.59.1`
(run 37646324540). #160 was then closed and its branch deleted.

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

### 27c — Bar tools `agent/27c-bar-tools` ✅ #162

D7–D10. Gates, 2026-10-07:

- Both typechecks clean. `TextInput` gained a pass-through `disabled` for the
  greyed scaler.
- vitest: 44 files, 866 tests, adding `barUnits` and the parser and Imbibe-yield
  cases.
- Playwright `recipe`, `make`, `yield`, `visual` and `mobile` passed with no
  baseline past the 2% threshold, so none was regenerated.
- New `bar-tools.spec.ts`:
  - ml: 60/25/25, and 120/45/45 at 2×; the mode survives a reload.
  - parts: 2 2/3 / 1 / 1 at 2×, with the scaler disabled.
  - The batching note at 4×: about 3 1/2 oz.
  - The bar view: spec, big type, a stubbed wake lock held while open and
    released on Esc, and steps that tap off.
  - "Cook view" on food, with no unit toggle.

### 27d — Search quality `agent/27d-search` (stacked on 27c)

D11–D13. Gates, 2026-10-07:

- Both typechecks clean.
- vitest: 45 files, 877 tests, adding OR-ranking, score ties, `source:` in
  `curation` and `queryLanguage`, and the migration on a scratch repo.
- Playwright `search*`: 74/74, including the new "Search — source:" spec (a
  cited recipe created over the API, found by label and host, and negated).
- Real repo: the migration (D13), `source:imbibe` → 31 and `lime gin` → ranked
  (D12).

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

**Rebuilt automatically, and synced automatically (epic 28).** Each editor
watches its content repository's refs and reindexes whenever HEAD moves
without it — a received push included — so the banner clears on its own
(about 15 s on the Pi). The workstation editor syncs its mirrors at startup
and after every change on either side; this manual order is the fallback. See
`agent-epic-28.md`. (The `post-receive` hook that did the reindex between the
Pi deploy and epic 28 is gone; `pnpm deploy:pi --setup` removes it.)

## Hand-off (end of epic, 2026-10-07)

Done: Roger pushed the 315 commits to the Pi and rebuilt there on
2026-10-07 (`uraninite` at `b078b49`, 0/0). Later pushes reindex through the
hook above. Still a person's call: the three recipes the migration skipped
(D13), each with two candidate source links —
`blueberry-cheesecake-baked-oatmeal`, `key-lime-pie` and
`salted-caramel-apple-pie-bars`.

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
- `common/util/{ingredientNames,barUnits,siteNames,importRecipeData}.ts`;
  `common/components/View/{Units,FocusView,Ingredients,Multiplier}/`;
  `editor/playwright/tests/bar-tools.spec.ts`; `test/barUnits.test.ts` (27c).
