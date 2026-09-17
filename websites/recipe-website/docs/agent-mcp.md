# Recipe Website Agent MCP — "an AI-manageable recipe database"

> **This is the durable source of truth for the epic-23 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the full
> picture by reading this file. **Read this file first** before planning any
> `23x` phase: the plan file that seeded it is gone. Update the roadmap
> **Status** column, each phase's decision checkboxes, and the **Next PR** line
> at every phase boundary. Each phase is a stacked PR and gets its own
> plan-mode pass seeded from this doc (see _How a phase is run_). **All six
> phases are closed out (2026-09-15) and landed on `main` (2026-09-16); the
> roadmap's "Epic complete" note carries the merge commits. The real
> Christmas-Cookies run is superseded by epic 24 (`agent-taxonomy.md`,
> 24f).** The previous
> epic's doc, `agent-curation.md`, is the reference for everything the
> curation layer already does; its D-list and T-list are cited here by number
> with a `22-` prefix (`22-D3`, `22-T1`).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

## Why this exists

The 22 stack made Claude a curator through a CLI (`pnpm recipes …`) and a
Bash-allowlisted skill. The user's next step (2026-09-12) is a **stateless MCP
server** so any MCP client can _completely manage and search_ the recipe
database with first-class tools instead of shell JSON, and can **walk and
revert content history** through the content repo's git. The driving user
story:

> "Organize the cluster of cookie recipes into one featured group called
> _Christmas Cookies_, then combine the linzer cookie recipes into a group that
> is accessible both at the top level and inside _Christmas Cookies_."

Today that story cannot be completed by an agent at all: featuring is
form-only, a group cannot contain a group, a group cannot be renamed or
re-described after creation, and history is a page. This epic adds the missing
seats to the curation layer, wraps the whole surface as MCP tools (stdio
first, then an HTTP endpoint in the editor), adds git tools, and rewrites the
skill around the tools.

It reverses one 22-era decision — _"interface is a CLI plus a skill, not an
MCP server"_ — for the reason the user gave: token-efficient, typed,
parse-free access. The CLI stays as the documented fallback.

Decided with the user (2026-09-12):

- **Both transports, stdio first.** The stdio server is what `.mcp.json`
  registers for Claude Code; the HTTP endpoint lives in the editor for remote
  clients.
- **Nested groups any depth, cycles rejected.**
- **Git tools cover history + diffs, revert + restore, and push.**
- **Stacked-PR workflow**: Fable plans/reviews per phase, Opus implements,
  this doc is the handoff; the user merges or grants.
- **Base branch is `main`** (level with `content-engine-test` since the
  2026-09-10 promotion); `playwright.yml` runs on PRs to `main`, so every
  phase gets e2e signal in CI.

## Execution model

**One phase per session.** Between phases the user re-enters plan mode and
clears context when accepting the next phase's plan. This doc is the only
memory that survives: it holds the full D-list, T-list, every phase's detail,
the handoff procedure, and each closed phase's decisions and gate results.

The roles: **Fable plans and reviews; an Opus subagent implements.** Branches
are stacked: `main` → `agent/23a-curation-seats` → `agent/23b-mcp-stdio` →
`agent/23c-nested-groups` → `agent/23d-git-seats` → `agent/23e-mcp-http` →
`agent/23f-curator-skill-v2`. Rebase children after a parent merges. Never
push to main; never force-push; never merge.

## How a phase is run

_(Reproduced verbatim from the accepted plan so a fresh session follows the
same procedure.)_

1. **Step 0 (Fable, done once):** worktree on `agent/23a-curation-seats` from
   `origin/main`; create this doc from the plan; add a pointer row to
   `docs/backlog.md` and strike the rows 23a covers; commit as the first
   commit of `agent/23a-curation-seats`; update the memory
   `agent-curation-workflow` → epic 23 started, doc path.
2. **Implement (Opus subagent):** Fable spawns one general-purpose subagent
   with `model: "opus"`, working in the same worktree on the phase branch. The
   prompt = the doc's phase section + D-list + T-list + the "key files to read
   first" list + the phase's verification commands. The subagent implements,
   runs the verification, and reports back: files changed, what was verified
   with outputs, divergences from the section and why, anything it could not
   finish.
3. **Review (Fable):** read the full diff; rerun typecheck, vitest, and the
   phase's Playwright specs; correctness review (reference bugs,
   cache-invalidation gaps, import-cycle/`"use server"` violations, missing
   tests); fix small things directly, send larger issues back to the same
   subagent via SendMessage. Then close out the doc: roadmap row → ✅, record
   decisions made and divergences, gate results verbatim (counts, dev vs
   production mode), new follow-ups; set the next row to 🟡 with its "Next PR"
   line. Commit, push the branch, open a draft PR against the parent branch.
   Report to the user with the PR link and the doc path, and stop: the next
   phase starts in a fresh plan-mode session from the doc.
4. Branches are stacked: `main` → `agent/23a-curation-seats` →
   `agent/23b-mcp-stdio` → `agent/23c-nested-groups` → `agent/23d-git-seats`
   → `agent/23e-mcp-http` → `agent/23f-curator-skill-v2`. Rebase children
   after a parent merges. Never push to main; never force-push; never merge.
   When landing, follow 22-T20: merge the parent, **retarget the child, then**
   delete the parent's branch.

## Facts validated before the epic (2026-09-12, read-only)

Paths under `websites/recipe-website/` unless noted.

1. **Backend seam.** `editor/cli/backend/types.ts` `CuratorBackend` — recipes
   (import/create/update/get/list/search/delete), groups
   (create/addItem/removeItem/setItems/get/list/delete), `reindex`,
   `afterWrite`, `close`; `local.ts` wraps `controller/curation/*` with a
   commit-identity guard (`assertCommitIdentity`) before every write;
   `http.ts` mirrors it over `/api/*` with a bearer token and rehydrates
   `{error: {code, message, …}}` bodies into `CurationError`. Every tool in
   this epic sits on this seam, so stdio and HTTP share one registry.
2. **Every write already commits** through the engine
   (`packages/cms/git/commit.ts` `commitContentChanges`, called from
   `createContent.ts:177` / `updateContent.ts:222` / `deleteContent.ts:117`
   with the touched paths, `--author` from `ctx.author`; a no-op when the
   content directory is not a git repository, which is what lets the vitest
   suites run in a tmpdir). One commit per operation with a message per seat
   (`Create group: <slug>`, `Update recipe: <slug>`, …). So "walk history" is
   `git log` over the content repo.
3. **Featuring is form-only.** `controller/actions/featuredRecipes.ts`
   (`createGenericActions`, `FormData`, session auth) +
   `parseFeaturedRecipeFormData.ts` (XOR `recipe`/`group`, 22g).
   `buildFeaturedRecipeData` writes only the key that is set (no
   `"group": null` residue). Nothing in `controller/curation/` touches
   featured; `successConfigFor("featured-recipes", …)` already exists, so a
   curation write can revalidate through the same `onWrite` hook the routes
   use. `FeaturedRecipe = {recipe?, group?, date, note?}`;
   `FeaturedRecipeEntryValue` adds the borrowed `recipeName`, `recipeImage`,
   `groupName`, `groupKind`. Default slug is
   `createDefaultFeaturedRecipeSlug({date})` = local `YYYY-MM-DD-HH-MM-SS`
   (second resolution).
4. **Group update does not exist.** `curation/groups.ts` has
   `createGroup/setItems/addItem/removeItem/deleteGroup/getGroup/listGroups`;
   `PUT /api/group/[slug]` is `setItems`. Name/description/kind/image edits
   are editor-form only. `updateRecipe` (`curation/recipes.ts`) is the
   template for a patch seat: explicit rename with a `SlugConflictError`
   pre-check (`updateContent` has no conflict guard of its own), `null`
   clears / `undefined` leaves alone, `previousSlug` on the `onWrite` event
   only for a real rename. The engine rewrites a scalar dependent's data
   field on rename (`updateDependents.ts:234`), so renaming a group moves the
   featured entry that points at it.
5. **Nested groups are impossible today.** `GroupItem = {recipe, label?,
note?}` (`common/controller/types.ts`), `GroupItemObjectSchema` is strict
   (`curation/schema.ts`), `checkRecipes` validates recipe slugs only,
   `getGroup` resolves recipes only, the `by-recipe` aggregate
   (`groupAggregateConfigs.ts`, version `"1"`) folds `item.recipe`.
   `groupsByDate.version` is `"2"` (`groupPaginationConfig.ts`);
   `GroupEntryValue.items` carries `{recipe, label}` (22-D14). Groups declare
   no `references` (22-D3, scalar-only engine; F32 deferred); `referencedBy`
   featured (thunk, 22-T4).
6. **Git lives in server actions** (`controller/actions/sync.ts`,
   `"use server"`, session-gated): `readSyncStatus`, fetch/pull/push/sync,
   conflict resolution, `commitWorkingChanges`, `getCommitDiff(hash)`
   (regex-validated hash, 50k-char cap), `getCommitLogPage(offset)` (30 per
   page); `actions/index.ts` has branches/remotes. **No revert or restore
   path exists.** `simple-git ^3.30` in both the editor and `packages/cms`.
7. **HTTP API** (`editor/src/app/api/`): `recipes`, `recipe/[slug]`,
   `groups`, `group/[slug]`, `group/[slug]/items[/[recipe]]`, `import`,
   `reindex`, `revalidate`; auth = `controller/apiAuth.ts`
   `authenticateRequest` (bearer `rcp_…` or session); `apiContext.ts`
   `requireCurationContext(request)` (write, throws `UnauthenticatedError`)
   and `readContext()`; errors via `curation/http.ts` `errorResponse` +
   `statusFor` (exhaustive over `CurationErrorCode`: adding a code without a
   status is a type error). Codes today: `not_found` 404, `validation` and
   `usage` 400, `unauthenticated` 401, `slug_conflict` 409, `unknown_recipe`
   422, `import_failed` 502, `no_git_identity` and `internal` 500.
8. **Search** is unranked, newest-first, free-text words ANDed; query
   language in `common/components/SearchForm/queryLanguage.ts` (fields
   `tag`, `ingredient`, `name`, `description`, `group`, `time`, `before`,
   `after`). `listTags` in `curation/search.ts`.
9. **MCP SDK.** npm latest is the **v2 split**: `@modelcontextprotocol/server`
   2.0.0 (exports `.` and `./stdio`; root exports `McpServer` with
   `registerTool`, `WebStandardStreamableHTTPServerTransport`,
   `PerRequestHTTPServerTransport`, `createMcpHandler(factory, options) →
McpHttpHandler` (fetch-style; per-request = stateless; does no token
   verification of its own), `InMemoryTransport`; `./stdio` exports
   `StdioServerTransport`) and `@modelcontextprotocol/client` 2.0.0 (for
   tests). Peer `zod ^3.25 || ^4`; the editor has `zod ^4.3.6`, Node 22. No
   MCP dependency and no `.mcp.json` in the repo today; the user's Claude
   Code has no MCP servers configured. _Amended 23b (2026-09-13, from the
   published tarballs):_ there are **no peer dependencies** — both packages
   depend on `zod ^4.2.0` directly (one physical copy once deduped);
   `StdioServerTransport` and `serveStdio` live under the
   `@modelcontextprotocol/server/stdio` subpath; `inputSchema` takes a full
   schema object (the raw-shape form is deprecated and non-strict); see the
   23b Facts for the full export list.
10. **Tests:** vitest at the repo root, `test/*.test.ts` (434 passing at
    the base commit, 454 after 23a; precedents `curation.test.ts` (curation layer in a
    tmpdir), `curationHttp.test.ts`, `groups.test.ts` (engine in a tmpdir),
    `specVersions.test.ts` (22-T1), `derivedPaths.test.ts` (22-T2));
    Playwright `editor/playwright/tests/{api-write,groups,featured-recipes}.spec.ts`;
    fixtures `editor/playwright/fixtures/test-content/*`
    (`three-recipes-groups` has groups `week-of-may-4` and
    `weeknight-favourites`; `one-featured-recipe` has one recipe feature).
11. **Skill** `.claude/skills/recipe-curator/SKILL.md` allowlists
    `Bash(pnpm --silent recipes:*)` + `WebSearch`; `examples.md` holds real
    transcripts. Its "Never" list forbids push, delete, reindex, `--force`,
    `--overwrite`, and every routing flag. _Stale after 23f_: the skill now
    pre-approves 21 `mcp__recipes__<tool>` names (D27), `settings.json`
    mirrors them (D28), and the CLI is the fallback section.
12. **CLI dispatch** (`editor/cli/index.ts`): `splitArgv` recognises a
    subcommand only after `group`; commands are `CommandDef` objects
    (`options`, `usage`, `write`, `run`, `format`) in `cli/commands/*.ts`;
    `--json` prints exactly one object on stdout; `warnings` on a result are
    echoed to stderr.

## Decisions log (D-list)

- **D1 One tool registry, two transports.** `editor/mcp/registry.ts` defines
  every tool once over `CuratorBackend` (plus the seats this epic adds);
  `editor/mcp/server.ts` (stdio, `pnpm --filter recipe-editor mcp`) and
  `editor/src/app/api/mcp/route.ts` (HTTP, 23e) both instantiate it.
  Stateless: no session id, no per-client state; each call resolves its own
  context. stdio logs go to **stderr only** (T21).
- **D2 Tool surface** (snake_case, noun-first; inputs are zod v4 schemas
  derived from `curation/schema.ts`; outputs are the backend result types):
  `recipe_search`, `recipe_list`, `recipe_get`, `recipe_import` (dry-run
  flag), `recipe_create`, `recipe_update`, `recipe_delete`, `tag_list`;
  `group_list`, `group_get`, `group_create`, `group_update` (seat from 23a),
  `group_set_items`, `group_add_item`, `group_remove_item`, `group_delete`;
  `featured_list`, `feature`, `unfeature` (seats from 23a); `git_status`,
  `git_log`, `git_show`, `git_file_at`, `git_diff`, `git_revert`,
  `git_restore`, `git_push` (23d); `reindex`. Errors map to
  `{isError: true, content: [{type: "text", text: JSON.stringify({error})}]}`
  using the same `{code, message, …}` objects the CLI and API emit
  (`toErrorObject`).
- **D3 Compact by default.** `recipe_search` / `recipe_list` rows return
  `{slug, name, date, tags, totalTime, image?}`; a `fields` array opts into
  `description`, `ingredients`, `source`. `recipe_get` returns the full
  recipe unless `fields` is given. Group results are unchanged (already
  small).
- **D4 Group update seat (23a).** `updateGroup(ctx, slug, patch)` with a
  strict `GroupPatchSchema` — `name`, `slug`, `kind`, `date`,
  `description | null`, `imageImportUrl | null` (`null` clears the picture)
  — through the engine's `updateContent`, modelled on `updateRecipe`: rename
  is explicit (`patch.slug`), pre-checked for conflicts, and reported as
  `previousSlug` on the `onWrite` event; the scalar featured→group
  reference follows the rename through `updateDependents`. **No `items`
  key**: item edits stay on `setItems`/`addItem`/`removeItem`, so a patch
  cannot silently wipe a plan. `PATCH /api/group/[slug]`; CLI
  `group update <slug> [--name N] [--description D] [--kind K] [--date d]
[--slug s] [--image-url U | --clear-image] | (--file patch.json | --stdin)`;
  `--description ""` clears. Commit `Update group: <slug>`.
- **D5 Featured seat (23a).** `curation/featured.ts`: `listFeatured`,
  `feature(raw: {recipe? | group?, note?, date?, slug?})` (XOR; the target
  must exist — `unknown_recipe` / `unknown_group`, no `--force`),
  `unfeature(slug)`. Same `createContent` / `deleteContent` pattern as
  groups; commit messages `Feature recipe: <target>` / `Feature group:
<target>` / `Unfeature: <slug>`. Featuring an already-featured target is
  allowed (the form allows it; the strip shows the six newest). Routes
  `GET /api/featured`, `POST /api/featured`, `DELETE /api/featured/[slug]`;
  CLI `feature (--recipe s | --group s) [--note N] [--date d] [--slug s]`,
  `unfeature <slug> [--yes]`, `featured list [--limit] [--offset]`. Backend
  interface gains `listFeatured` / `feature` / `unfeature` / `updateGroup`
  (local + http). New error code **`unknown_group`** (422, `details.groups`)
  — 23c reuses it for a group item naming a missing group.
- **D6 Nested groups (23c).** `GroupItem = ({recipe} | {group}) & {label?,
note?}`; `GroupEntryValue.items` gains `group?`; `groupsByDate.version` →
  `"3"`, `by-recipe` → version `"2"`, plus a new `by-group` aggregate
  (parents of a group) in the same file (22-T1 snapshots). Write-time
  validation rejects self-reference and any cycle (DFS over `groups/data`,
  depth cap 32) with a new error code `group_cycle`; unknown group slug →
  `unknown_group`. The group page renders sub-groups as group cards
  (`GroupThumbnail` / `GroupImage` precedence; the member-thumbnail fallback
  recurses depth-first with a cap); "Appears in" shows parent groups for
  groups too. `group:<slug>` search matches **transitive** members
  (validate at 23c). CLI: `--item` keeps `slug[:label]` for recipes;
  `--group-item slug[:label]` and the JSON `{group}` object form for groups.
  Every group still lists at `/groups`, so "top-level and inside" is
  automatic. **Amended at 23c planning (2026-09-13):** `by-recipe` stays
  v"1" (its fold skips `{group}` items, so its output is byte-identical);
  Appears-in lists **direct** parents only, on both recipe and group
  pages; the MCP field is `subgroup` and the CLI flag is `--group <sub>`
  on `group add|remove` (D15); the DELETE route takes `?kind=group`; the
  browser form preserves sub-group rows read-only and gets no picker
  (D18). Detail in D15–D18.
- **D7 Git seats (23d).** Extract the pure helpers out of `actions/sync.ts`
  into `controller/curation/git.ts` (the server actions call them; the
  `/git` page is unchanged): `status`, `log({type?, slug?, limit, offset})`
  (path filter = `<dataDir>/<slug>` + `uploads/<type>/<slug>`), `show(hash,
maxChars)`, `fileAt({type, slug, rev})`, `diff({from, to, path?})`; writes:
  `revert(hash)` (`git revert --no-edit`, author from ctx), `restore({type,
slug, rev})` (`git checkout <rev> -- <paths>` + commit `Restore <type>
<slug> to <rev>`), `push()` (reuses the sync push path; closes 22-D11).
  Writes refuse when a merge is in progress or the tree is dirty
  (`dirty_tree`), validate revisions (`bad_revision`), and finish with
  `rebuildAllIndexes` + full revalidation (new `ctx.onBulkChange?`).
  `/api/git/*` routes mirror them. **Amended at 23d (D19–D23):** the
  function names are `gitStatus`/`gitLog`/`gitShow`/`gitFileAt`/`gitDiff`/
  `gitRevert`/`gitRestore`/`gitPush`; `type` ∈ `{recipe, group, featured}`;
  `push` takes `{remote?, setUpstream?}` and is **not** clean-tree-guarded
  (T47); the codes are four — `not_a_repo`, `dirty_tree`, `git_conflict`
  (409) and `bad_revision` (422); revert/restore do **not** go through
  `commitChanges` (T46) and finish with `reindex(ctx)` inside the module
  plus `ctx.onBulkChange?.()` (Next-only revalidation stays outside the
  curation layer, D8 boundary); reverting a merge commit is `bad_revision`.
- **D8 HTTP transport (23e).** `app/api/mcp/route.ts` → `createMcpHandler`
  from `@modelcontextprotocol/server`, `runtime = "nodejs"`; auth via
  `requireCurationContext` before the handler (401 without a token/session).
  **Amended at 23e (D24–D26):** the whole endpoint is authenticated —
  `tools/list` and every call alike, as `/api/git/*` is; the original "reads
  use `readContext()`" clause is dropped (one MCP endpoint cannot know a call
  is a read before dispatch, and the stdio server has no anonymous mode
  either). "JSON responses" means one complete answer per POST, no sessions:
  on the SDK's legacy leg every 2025-era client (the v2 `Client` default,
  Claude Code) receives a one-frame `text/event-stream` that closes
  immediately (T55); on the modern leg a single `application/json` body.
  GET → 405 (Next's default for an unexported method, T58). `.mcp.json`
  stays stdio-only.
- **D9 Skill v2 (23f).** `recipe-curator` rewritten around the tools
  (`allowed-tools` uses the `mcp__recipes__*` names — verify the exact
  syntax at 23f), CLI kept as the documented fallback; `examples.md`
  regenerated from real tool transcripts; the Christmas-Cookies story
  becomes both an automated acceptance test (vitest, in-memory client,
  fixture content dir) and the user's first real run. **Amended at 23f
  (2026-09-14):** `allowed-tools` enumerates the 21 non-destructive tools
  by name, not the server; the CLI is a fallback section, not a parallel
  path; the acceptance test is a deterministic replay over the in-memory
  client on a committed fixture (no model in the loop) and two headless runs
  are the transcripts; the HTTP transport gets one paragraph — register the
  editor's `/api/mcp` under the same server name `recipes` so the tool
  names and the allow-list apply unchanged. See D27–D30.
- **D10 `.mcp.json`** at the repo root registers `recipes` →
  `pnpm --silent --filter recipe-editor mcp`, passing through
  `CONTENT_DIRECTORY`, `RECIPE_API_URL`, `RECIPE_API_TOKEN`,
  `RECIPE_AUTHOR`, `RECIPE_EDITOR_URL`. Local mode by default (same
  resolution as the CLI).

- **D11 Backend resolution is one exported function (23b).**
  `cli/backend/resolve.ts`: `resolveBackendConfig(overrides?, env)` →
  `BackendConfig` (`{kind: "http", baseUrl, token?}` |
  `{kind: "local", contentDirectory, author?, notify?}`), `createBackend`,
  `resolveBackend`; `resolveContentDirectory` / `resolveNotify` move there
  from `cli/index.ts`. Env reads treat empty strings as unset. The CLI and
  the MCP server call the same function, so mode resolution cannot drift.
- **D12 `listTags` joins the seam (23b).** `CuratorBackend.listTags()`,
  `GET /api/tags` → `{tags}`, CLI `tags`. The MCP `tag_list` tool sits on
  the seam like every other tool (D1), not on the curation layer directly.
- **D13 Registry conventions (23b).** Every `inputSchema` is a
  `z.strictObject` (an empty one for `tag_list`); create/update tools nest
  the payload (`{recipe, overwrite?}`, `{slug, patch}`) so option flags and
  a rename `slug` never collide; success returns the backend result as
  `structuredContent` plus its JSON in `content[0].text`; failures return
  `toErrorObject(error)` the same way with `isError: true`; write tools
  fold `afterWrite()`'s hint into `warnings: string[]`. Annotations:
  `readOnlyHint` on reads, `destructiveHint` on deletes, `idempotentHint`
  on update/set/remove/reindex. No `outputSchema` until a consumer needs
  one.
- **D14 stdio server lifecycle (23b).** `editor/mcp/server.ts` resolves the
  backend once (D11), prints one mode banner to stderr, hands
  `serveStdio` a factory, and shuts down (close handle → `backend.close()`
  → `process.exit`) on `SIGINT`, `SIGTERM`, and stdin `end`/`close`, with a
  double-shutdown guard. Never `process.exit` before `close()` resolves
  (T5).
- **D15 Group item refs (23c).** `GroupItemRef = {recipe: string; group?:
never} | {group: string; recipe?: never}`; `GroupItem = GroupItemRef &
{label?, note?}`; `GroupEntryItem {recipe?, group?, label?}` replaces the
  `Pick` on `GroupEntryValue.items`; `buildGroupIndexValue` copies `group`
  only when set (`label` stays an unconditional key so stored values do not
  move, T40). Schema: `GroupItemObjectSchema` is exported, strict `{recipe?,
group?, label?, note?}` with an XOR refine at path `["recipe"]`; the string
  form of `toGroupItems` stays recipe-only and the filter is `recipe ||
group`. Naming per surface: JSON, API bodies and `--file` use `{group}`;
  CLI `group create --group-item slug[:label]` (appended after the
  `--item`s) and `group add|remove <group> --group <sub>` instead of the
  recipe positional (both or neither → `UsageError`); MCP `group_add_item
{group, recipe?, subgroup?, label?, note?, force?}` and `group_remove_item
{group, recipe?, subgroup?}` with XOR refines; seam `addGroupItem(group,
ref: GroupItemRef, opts)` / `removeGroupItem(group, ref)`; HTTP `POST
/api/group/[slug]/items` body = `GroupItemObjectSchema` (the route's
  private schema deleted), `DELETE /api/group/[slug]/items/[slug]?kind=group`
  for a sub-group (directory name `[recipe]` kept). `removeItem` drops every
  row matching the ref, as today.
- **D16 Derived state (23c).** `groupsByDate` → v"3" with
  `GroupListEntry.groupCount` (count of `{group}` items; `itemCount` stays
  the total). The `by-recipe` fold skips `{group}` items, so its output is
  unchanged and it **stays v"1"** (divergence from D6 as first written). A
  new `groupsByGroup` "by-group" v"1" (parents of a group, same entry shape,
  keyed on `item.group`) lives in the same file; both come from one
  `appearsInAggregate(name, version, keyOf)` factory; `aggregates:
[groupsByRecipe, groupsByGroup]` (order pinned by `revalidateDerived`,
  T36). Reader `data/readGroupsByGroup.ts` mirrors `readGroupsByRecipe.ts`.
  Appears-in is **direct parents only** on both the recipe and the group
  page (a sub-group's own page shows its parents); the group page gains a
  `GroupAppearsIn` sharing `AppearsIn`'s markup and testids (`appears-in`,
  `appears-in-item`) through a sync `AppearsInList`.
- **D17 Validation (23c).** `checkItems(ctx, slug, items, force)` replaces
  `checkRecipes`: (1) `item.group === slug` → `GroupCycleError([slug, slug])`
  before anything else (T30); (2) unknown recipes → `UnknownRecipeError`, or
  `"Unknown recipe: x"` warnings under force; (3) unknown groups →
  `UnknownGroupError(groups, {forceHint: true})` — the message gains the
  `--force` sentence only when asked, so the featured call site is unchanged
  — or `"Unknown group: y"` warnings under force; (4) a cycle DFS from each
  distinct existing sub-group over `groups/data` (`readContentFileOrNull` on
  `groupContentConfig`, follow `items[].group`, visited set,
  `MAX_GROUP_DEPTH = 32`): reaching `slug` → `GroupCycleError([slug, ...path,
slug])`, exceeding the cap → the same code ("nesting deeper than 32"). New
  code **`group_cycle`**, HTTP 422, never forceable, `details.groups`
  carries the path (no new details field; the T25 chain is the `errors.ts`
  union + class, `http.ts` `statusFor`, the `curationHttp` table, the
  registry instructions; `rehydrate` already copies `groups`). `getGroup`
  resolves `{group}` items to `{...item, name, kind}` or `missing: true`
  (`ResolvedGroupItem` becomes a `type` intersection with `kind?:
GroupKind`). Renames and deletes of a sub-group leave parents dangling
  (T31/T32, the D3 rule); no cycle re-check on rename (it can only remove an
  edge).
- **D18 Rendering, search, form (23c).** `resolveGroupItems` → `{item,
recipe: Recipe | null, group: Group | null}` (`groupItems.read` for group
  items). `GroupItems`: a `{group}` item renders the `GroupCard` silhouette
  (`GroupThumbnail` + name + kind badge, link `/group/<slug>`,
  `data-testid="group-item-group"`, `image`/`items` forwarded so the card
  skips the group read; `testId` prop defaulting to `featured-group-card`);
  missing → "Group not found: slug" in the existing `group-item-missing`
  box. Count text through one helper `groupCountLabel(recipeCount,
groupCount)` ("n recipes" + ", m groups" when m > 0) used by
  `GroupDetailPage`, `FeaturedRecipeDetailPage` and the list chip
  (`groupCount ?? 0`, T34); empty text "This group has nothing in it yet."
  `GroupThumbnail`'s member walk becomes a depth-first candidate collector
  (recipe items deduped; a sub-group with its own image is a candidate,
  otherwise recurse; `GROUPS_DEEP = 4`, visited set seeded with the root
  slug, still bounded by `MEMBERS_WALKED`); a group candidate renders
  `GroupImage` and `data-group-image` stays "member".
  `readGroupSearchCorpus`: two passes (read every group, then expand each
  group's `recipes` transitively with a visited set and depth cap 32) so
  `group:<parent>` matches nested recipes with no other search change;
  `GroupResults.tsx` supplies `groupCount: 0`. Form: `parseGroupFormData`'s
  `GroupItemSchema` → `{recipe?, group?, label, note}`, both trimmed, rows
  with neither dropped, output `GroupItem[]`; `Form/Group` `ItemRow =
GroupItem & {id}`; a `{group}` row renders read-only ("Group N: <slug>",
  hidden `items[i].group`, Label/Note inputs kept, `aria-label="Remove group
N"`, `data-testid="group-item-group-row"`); legend and buttons unchanged; no
  picker (Deferred: wire the existing `GroupSelectInput` as an "Add group"
  row, at which point the server action needs the cycle check — T38).

- **D19 Module `controller/curation/git.ts` (23d).** Node-safe (simple-git,
  `@discontent/cms/git/commit`, `../contentTypes`, `./reindex`; no Next). The
  page DTOs move here (`CommitSummary {hash, message, author_name, date}`,
  `SyncStatus`, `RemoteSummary`, `BranchInfo`, `ConflictFile`, `MergeState`)
  and `src/app/(editor)/(settings)/git/types.ts` re-exports them. Result
  types: `GitLogResult {commits: CommitEntry[], hasMore}` with `CommitEntry =
CommitSummary & {files: string[]}` (`--name-only`, paths relative to the
  content dir), `ShowResult {hash, diff, truncated}`, `DiffResult {from, to,
path?, diff, truncated}`, `FileAtResult {type, slug, rev, path, content}`
  (the data file at `rev`, JSON-parsed), `GitWriteResult {commit: string |
null, message, rebuilt: string[]}`, `PushResult {remote, branch}`. Reads:
  `gitStatus(ctx)` (`EMPTY_STATUS` with `isRepo: false` when not a repo),
  `gitLog(ctx, {type?, slug?, limit = 30, offset = 0})` — path filter =
  `<dataDirectory>[/<slug>]` + `<uploadsDirectory>[/<slug>]` from the content
  config (`type` ∈ registry names; unknown → `not_found` listing the known
  types, as `reindex` does), `gitShow(ctx, hash, {maxChars = 50_000})`,
  `gitFileAt(ctx, {type, slug, rev})` (`git show <rev>:<path>`; absent →
  `not_found`), `gitDiff(ctx, {from, to = "HEAD", path?})`. `gitStatus` never
  throws (`isRepo: false` is what the page renders as "not tracked with
  Git"); an unborn branch makes `gitLog` return no commits (as
  `sync.ts:110-116` does). `gitLog` uses simple-git's **array form** —
  `git.log(["--max-count=<n+1>", "--skip=<offset>", "--name-only", "--",
...paths])` — because the object form appends options after `--` and `file`
  adds `--follow` (T44); files come from `entry.diff.files[].file`. A `type`
  ∈ `{recipe, group, featured}` maps to its config through one `GIT_TYPES`
  table; per-slug pathspecs = `<dataDirectory>/<slug>` +
  `relative(getUploadsBaseDirectory(config, slug, dir))`
  (`packages/cms/content/filesystem.ts:71-82`, so featured gets the engine
  default). Wire input is validated before it reaches git: `hash` matches
  `/^[0-9a-f]{7,40}$/i`, `rev` and `path` must not start with `-`, `slug` is
  one path segment (not `.`/`..`) → `validation` (T45). Writes:
  `gitRevert(ctx, hash)` — `rev-parse --verify <hash>^{commit}` (else
  `bad_revision`), `rev-list --parents -n 1` with more than two hashes (a
  merge) → `bad_revision`, then one shot `git.env({GIT_AUTHOR_NAME,
GIT_AUTHOR_EMAIL} when ctx.author).raw(["revert", "--no-edit", hash])`
  (git's own `Revert "<subject>"` message); on failure `revert --abort`
  (fallback `reset --hard HEAD`, safe because the tree was clean) and
  `git_conflict`. **Not `commitChanges`**: its `git add <paths>` fails on a
  path the reverted commit added (gone from index and tree) — T46.
  `gitRestore(ctx, {type, slug, rev})` — `ls-tree -r --name-only <rev> --
<pathspecs>` empty → `not_found` ("<type> <slug> does not exist at <rev>");
  `rm -r --ignore-unmatch -q -- <pathspecs>`; `checkout <rev> -- <only the
files ls-tree listed>`; `diff --cached --name-only` empty → `reset --hard
HEAD`, `{commit: null}` and no reindex; else `git.commit(["Restore <type>
<slug> to <short rev>", "From <full rev>."], author ? {"--author": …} : {})`.
  `gitPush(ctx, {remote?, setUpstream?})` — the whole `doPush` contract
  (tracking and not `setUpstream` → `push`; else `push -u <remote ??
"origin"> <status.current>`; no current branch → `bad_revision` "Cannot
  determine the current branch to push."); the `/rejected|non-fast-forward|
fetch first/i` case → `git_conflict` with the existing "Push rejected — the
  remote has commits you don't have. Pull first to merge, then push."
  sentence. **Push is not clean-tree-guarded** (the page pushes a dirty tree
  today, T47). Preflights: every write `requireRepo` → `not_a_repo`;
  revert/restore `requireCleanTree` (`status.isClean()` false, or
  `MERGE_HEAD` / `REVERT_HEAD` / `CHERRY_PICK_HEAD` present) → `dirty_tree`
  ("commit or discard working changes in /git first" / "a merge is in
  progress"). After a revert/restore that made a commit: `await reindex(ctx)`
  (its `rebuilt` — four names incl. `pages` — rides the result; `commit` is
  `git.revparse(["HEAD"])`) then `ctx.onBulkChange?.()`. `mergeInProgress`,
  `labelForPath`, `toSummary`, `EMPTY_STATUS` are exported for `sync.ts`.
  Never `getContentDirectory()` inside (T16; the D8 allow-list has no
  `@discontent/cms/fs/*`).
- **D20 `ctx.onBulkChange` (23d).** `CurationContext.onBulkChange?: () =>
void`, synchronous and fire-and-forget exactly like `onWrite`.
  `curationContextFor` sets it to `revalidatePath("/", "layout")` +
  `revalidateDerivedState(recipeContentTypes)` (what `/api/revalidate`
  does). `readContext` and the local backend leave it unset — the CLI's
  `afterWrite` hint / `--notify` already cover a stale editor.
- **D21 Git error codes (23d).** `not_a_repo` 409, `dirty_tree` 409,
  `git_conflict` 409 (revert conflict, non-fast-forward push),
  `bad_revision` 422. Classes `NotARepoError`, `DirtyTreeError`,
  `GitConflictError`, `BadRevisionError`; no new `CurationErrorDetails`
  field (messages carry the hash/branch), so `rehydrate` is unchanged;
  `codeForStatus` unchanged (bodies always present, T39). T25 chain: union,
  `statusFor`, `curationHttp` table, registry instructions.
- **D22 `sync.ts` delegates, the page is unchanged (23d).** `getSyncStatus`
  → `gitStatus(readCtx)`, `getCommitDiff` → `gitShow` (errors still returned
  as the diff string, truncation marker identical), `getCommitLogPage` →
  `gitLog` (page keeps `LOG_PAGE_SIZE = 30`, `hasMore`), `doPush` →
  `gitPush` (a `CurationError` becomes the action's string).
  Fetch/pull/sync/merge/conflict, branches, remotes, `initializeContentGit`,
  `rebuildRecipeIndex`, `rebuildAllIndexes` stay where they are.
  `labelForPath`'s stale `recipes/data/<slug>/(.+)` branch becomes
  `uploads/(recipe|group)/<slug>/…` → "Recipe: <slug>" / "Group: <slug>".
  `git.spec.ts` stays green **unchanged** (the gate for this refactor).
- **D23 Seam, routes, CLI, MCP (23d).** `CuratorBackend`: `gitStatus()`,
  `gitLog(opts)`, `gitShow(hash, opts?)`, `gitFileAt(ref)`, `gitDiff(opts)`,
  `gitRevert(hash)`, `gitRestore(ref)`, `gitPush(opts?)`. Local: `guard()`
  on `gitRevert`/`gitRestore` (they commit); `gitPush` unguarded. HTTP (all
  `requireCurationContext` — history is not public; all `export const
runtime = "nodejs"`, T23, the first such declarations in the tree): `GET
/api/git/status`, `GET /api/git/log?type&slug&limit&offset`, `GET
/api/git/show/[hash]?maxChars`, `GET /api/git/file?type&slug&rev`, `GET
/api/git/diff?from&to&path`, `POST /api/git/revert {hash}`, `POST
/api/git/restore {type, slug, rev}`, `POST /api/git/push {remote?}`; bodies
  via strict zod schemas in `curation/schema.ts` (`GitRevertSchema`,
  `GitRestoreSchema`, `GitPushSchema`, `GitLogQuerySchema`). CLI: `git` joins
  `SUBCOMMAND_TABLES`: `git status`, `git log [--type t] [--slug s] [--limit
n] [--offset n]`, `git show <hash> [--max-chars n]`, `git file <type> <slug>
<rev>`, `git diff <from> [<to>] [--path p]`, `git revert <hash> [--yes]`,
  `git restore <type> <slug> <rev> [--yes]`, `git push [--remote r]
[--set-upstream]`; `write: true` on revert/restore only (`git push` changes
  nothing locally, so the stale-editor hint would be wrong); `--yes` reuses
  the delete confirmation generalised to `confirm(label, yes)` (its prompt
  currently says "Delete"). Text formats: `log` via `formatRows`,
  `show`/`diff` print the raw diff, `file` prints JSON. MCP `/* --- git ---
*/` block after maintenance: `git_status`, `git_log {type?, slug?, limit?,
offset?}`, `git_show {hash, maxChars?}`, `git_file_at {type, slug, rev}`,
  `git_diff {from, to?, path?}` (READ_ONLY, via `read`); `git_revert {hash}`,
  `git_restore {type, slug, rev}` (DESTRUCTIVE_WRITE, via `write` so the hint
  rides `warnings`); `git_push {remote?, setUpstream?}` (WRITES, via `read` —
  no local change); `TOOL_NAMES` gains the eight in D2 order (`mcpStdio` pins
  the same list); instructions gain the four codes and "git_revert /
  git_restore make a new commit and rebuild every index; git_push sends the
  branch to its remote; neither is undoable from here". The skill's "never
  push" rule is untouched (23f decides what the skill exposes).
- **D24 Route `src/app/api/mcp/route.ts` (23e).** `export const runtime =
"nodejs"` (T23; the ninth such declaration) and **`POST` only** — no
  `GET`/`DELETE`/`HEAD` export, so Next answers 405 with an empty body, which
  is exactly what the client's post-initialize GET tolerates (T58). Shape:
  one `try { ctx = await requireCurationContext(request) } catch (e) { return
errorResponse(e) }`, then `return handleMcpRequest(request, ctx)`. Two
  returns on purpose: anonymous → the usual 401 `{error: {code:
"unauthenticated"}}` (not a JSON-RPC error), while the handler never throws
  (it converts failures to JSON-RPC 500s) and must not be re-shaped by
  `errorResponse`. Imports via the `recipe-editor/...` self-alias
  (`recipe-editor/mcp/http` resolves like `recipe-editor/controller/...`). No
  Host/Origin validation: the route is same-origin with the app and behind
  the same auth as every other write route (recorded, not inherited). The
  route authenticates from headers only and never reads the body (T54).
- **D25 `LocalBackendOptions.inProcess?: boolean` (23e).** On
  `createLocalBackend` (`cli/backend/local.ts`). When true: `guard` is a
  no-op (the request already authenticated an author; routes never demand a
  committer identity, `author.ts:14-17`), `afterWrite` is **absent**
  (`...(inProcess ? {} : {afterWrite})` — the seam's `afterWrite?` is
  optional and `registry.ts` does `backend.afterWrite?.()`, so no
  `warnings`, T53), and `close` is `async () => {}` (the LMDB cache belongs
  to the server, T52); `notify` is ignored. The 28-method object literal is
  untouched; `resolve.ts` never sets `inProcess`, so the CLI and the stdio
  server are unchanged.
- **D26 Module `editor/mcp/http.ts` (23e, Next-free).**
  `handleMcpRequest(request, ctx): Promise<Response>` builds
  `createLocalBackend({...ctx, inProcess: true})`, then `createMcpHandler(()
=> createRecipeServer(backend), {keepAliveMs: 0, onerror: console.error
…})` and returns `handler.fetch(request)`. Per-request handler, never
  `close()`d (T59); no `responseMode` (T55); `console.error` only (the stdout
  grep stays unchanged). The header comment records the legacy-leg
  SSE-per-POST shape and the fallback if `next dev` ever misbehaves on
  streamed bodies: `isLegacyRequest(request)` → own
  `WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined,
enableJsonResponse: true})` + `createMcpHandler(factory, {legacy:
"reject"})` for the modern leg (~25 lines replicating the SDK's
  `createLegacyStatelessFallback`) — not built unless Playwright forces it.
- **D27 Skill v2 `SKILL.md` (23f).** ≤ ~170 lines. Frontmatter `name`,
  `description` (MCP-first: "… through the `recipes` MCP tools …" plus the
  ask examples, adding nested collections and the homepage strip), and one
  comma-separated `allowed-tools:` line — the 21 `mcp__recipes__<tool>`
  names, `WebSearch`, `Bash(pnpm --silent recipes:*)` (the form the current
  file uses and 22e's Run 3 proved accepted; one line so the pin test's
  regex stays a one-liner and prettier leaves it alone). 21 = `TOOL_NAMES`
  minus the seven **held back**: `recipe_delete`, `group_delete`,
  `unfeature`, `reindex`, `git_revert`, `git_restore`, `git_push` — every
  `DESTRUCTIVE_WRITE` tool plus the two that change the world without being
  one; the set cannot be derived from annotations (`reindex` is
  `IDEMPOTENT_WRITE`, `git_push` is `WRITES`), so it is spelled out in the
  test. Body: the same eight steps, tool-first, each with one JSON example
  and the result shape: (1) **where writes go** — `git_status` (is the
  content a repo, which branch — whether writes commit) and `recipe_list
{limit: 1}` → `recipe_get {slug}` (its `path` is the resolved content
  directory; `total` 0 on a non-empty site → stop and ask, the only stop);
  remote: if the `recipes` server is the editor's `/api/mcp`, `path` is the
  server's; never read env or shell out to find this. (2) **constraints**
  unchanged. (3) **reuse first** — `recipe_search {query}` rows are compact
  (`slug, name, date, tags?, totalTime?, image?`); `fields: ["description",
"ingredients", "prepTime", "cookTime"]` adds those; `recipe_get` for
  `instructions`/`source`; one or two words per query (ANDed, word-start
  prefix, unranked); `tag_list` before inventing a tag; typed terms `tag:`,
  `-tag:`, `ingredient:`, `name:`, `description:`, `time:<=45`,
  `before:`/`after:`, `AND`/`OR`/`NOT`, parentheses; **`group:` works only
  in the browser search — use `group_get` for membership**; prefer an
  existing recipe over an import. (4) **web candidates** unchanged. (5)
  **dry-run** `recipe_import {url, dryRun: true}` → `{dryRun, url, slug,
recipe, image?, video?}`, no `warnings`; rejection rules unchanged. (6)
  **import** `recipe_import {url, tags}` → `{slug, date, path, url,
source?, warnings?}`; `slug_conflict` → reuse the slug, never `overwrite`;
  `source.url` is the citation; tag vocabulary unchanged; `recipe_update
{slug, patch: {tags}}` only to fix tags on a recipe this run imported. (7)
  **group** `group_create {group: {name, kind, description?, items:
["slug:label", …]}}` (`kind` `meal-plan` with dated labels, `collection`
  otherwise; `imageImportUrl` for a cover); nesting = `{group: "<slug>"}`
  items or `group_add_item {group, subgroup}`; `group_cycle` is final;
  `group_set_items` replaces, `group_add_item` appends;
  `unknown_recipe`/`unknown_group` → fix the slug, never `force`; `feature
{group, slug: "<explicit>"}` **only when the ask says so**, `slug` explicit
  when featuring more than one thing; `group_update` for
  name/description/kind (never touches items); the Christmas-Cookies shape
  spelled out: parent collection → feature → child collection →
  `group_add_item {subgroup}` (or `group_set_items` with a `{group}` item) →
  `group_get` both. (8) **report** — table, `/group/<slug>` links,
  rejections, `warnings` restated in plain words ("the running editor needs
  Settings → Maintenance → Reload" / "set `RECIPE_EDITOR_URL`"), and — when
  `git_status.isRepo` — the commits from `git_log {type: "group", slug}`;
  end "push from `/git` when ready". **Held back** section (replaces
  "Never"): the seven tools are not pre-approved and not part of this
  skill; a wrong write is reported with its commit hash from `git_log` for
  the user to `git_revert`/`git_restore` themselves; never `overwrite`,
  never `force`, never `RECIPE_API_TOKEN` on argv; `warnings` are
  information (the stale-editor line means the running editor needs
  Settings → Maintenance → Reload, or `RECIPE_EDITOR_URL` with
  `RECIPE_API_TOKEN` in the server's environment makes it automatic).
  **Fallback (CLI)** section: `pnpm --silent recipes <command> … --json`
  from the repo root when the `recipes` server is not connected; flags
  mirror the tool inputs (`pnpm --silent recipes --help`); the old
  flag-level Nevers (`--author --remote --editor-url --notify --overwrite
--force`) live here **plus `--content-dir`** (the environment chooses the
  target; a flag would let a fallback run write somewhere the tools would
  not). HTTP transport gets one paragraph: register the editor's `/api/mcp`
  under the same server name `recipes` and nothing else changes.
- **D28 Permissions and the drift pin (23f).** `.claude/settings.json`
  `permissions.allow` gains the same 21 `mcp__recipes__<tool>` entries (the
  four existing entries and `enabledMcpjsonServers` stay). New
  `test/curatorSkill.test.ts` (node env) reads `SKILL.md` (regex on the
  `allowed-tools:` line) and `settings.json`, spells out `HELD_BACK` (the
  seven names) and asserts: (a) `HELD_BACK ⊇` every tool whose
  `annotations.destructiveHint` is true on a live `listTools()`; (b)
  frontmatter MCP names == settings MCP names == `TOOL_NAMES − HELD_BACK`
  (as sets, and every name is a real tool); (c) every backticked token in
  `SKILL.md`/`examples.md` shaped like a tool name
  (`/^(recipe|group|git|tag|featured)_[a-z_]+$|^(feature|unfeature|reindex)$/`)
  is in `TOOL_NAMES`, and none of `HELD_BACK` appears outside the "Held
  back" section — the MCP analogue of 22e's command-line audit; (d) no
  `pnpm --silent recipes` line outside the Fallback section.
- **D29 Fixture `christmas-cookies` (23f)**
  (`editor/playwright/fixtures/test-content/christmas-cookies/`): ten
  recipes, `recipe.json` shaped as `search-corpus/…/ginger-cookies`, dates
  strictly increasing so newest-first is deterministic, no images, no
  `groups/`, no `featured-recipes/`, no `users/` (vitest and the stdio smoke
  need none; Playwright's `resetData` layers users anyway). Rows (# = day of
  `Date.UTC(2025, 11, n)`, so newest-first is `linzer-cookies` …
  `weeknight-chili` with no ties): 1 `weeknight-chili` (dinner, quick; no
  "cookie" anywhere), 2 `banana-bread` (breakfast, baked; description avoids
  the word), 3 `shortbread` (description "Buttery Scottish cookies …"), 4
  `peanut-butter-blossoms` (description "… cookies topped with a chocolate
  kiss"), 5 `snickerdoodles` (description "Cinnamon-sugar cookies …"), 6
  `sugar-cookies`, 7 `gingerbread-cookies`, 8 `apricot-linzer-cookies`, 9
  `chocolate-hazelnut-linzer-cookies`, 10 `linzer-cookies`; rows 3–10 carry
  `cookies, dessert, baked`, rows 7–10 add `christmas`. Every cookie carries
  the `cookies` tag (so `tag_list` is non-trivial and `tag:cookies` works);
  no word starting with "cookie" or "linzer" may appear in the two
  distractors' name, description, tags **or ingredients** (T66).
  Three-ingredient lists in the `{ingredient: "<Multiplyable
baseNumber=\"2\" /> cups flour"}` shape of the template, short
  `instructions`, `prepTime`/`cookTime`/`totalTime` set, `recipeYield` "".
  Built by a new one-shot `editor/scripts/seed-christmas-cookies.ts` (the
  `seed-groups.ts` pattern): `outputJSON` the ten files, then
  `rebuildIndex({config: recipeContentConfig, contentDirectory,
cascadeDependents: false})`, then `closeCachedEnvironments()`; run once
  against the fixture path. `git status` must then show only
  `christmas-cookies/recipes/{data/*/recipe.json, index,
pagination/by-date, aggregates/tags, aggregates/by-tag}` — ten JSON files
  and eight `.mdb` files, nothing under `featured-recipes/`, `groups/` or
  `pages/`. The fixture is the vitest corpus (copied to a tmpdir), the
  headless smoke's scratch corpus, and a rehearsal corpus for the user's
  real run.
- **D30 Acceptance test `test/christmasCookies.test.ts` (23f).** Node env,
  one `describe`, per-case timeout 30 s. `beforeAll`:
  `closeCachedEnvironments()`, `mkdtemp`, `copy(fixture, tmpdir)`,
  `CONTENT_DIRECTORY`, harness as `mcp.test.ts:44-117`; `afterAll`: close
  client/server/backend, restore env, `rm`. One sequential story case plus
  small follow-ups: (1) `tag_list` **first** → includes `cookies` and
  `christmas` (proves the committed aggregate was read, not rebuilt);
  `recipe_search {query: "cookie"}` → `total` 8, slugs = rows 10…3 in that
  order, neither distractor; `recipe_search {query: "linzer"}` → 3;
  `recipe_search {query: "tag:cookies"}` → 8. (2) `group_create {group:
{name: "Christmas Cookies", kind: "collection", description, items: <8
slugs>}}` → `slug: "christmas-cookies"`, `warnings` contains
  `STALE_EDITOR_HINT` (`toMatchObject`, T53's inverse: the local backend is
  not in-process). (3) `feature {group: "christmas-cookies", slug:
"christmas-cookies-strip"}` → `{slug: "christmas-cookies-strip", group:
"christmas-cookies"}`. (4) `group_create {group: {name: "Linzer Cookies",
kind: "collection", items: <3 linzer>}}` → `linzer-cookies`. (5)
  `group_set_items {group: "christmas-cookies", items: [<5 non-linzer>,
{group: "linzer-cookies", label: "Linzer"}]}` (exercises a `{group}` item
  through set_items); then `group_add_item {group: "linzer-cookies",
subgroup: "christmas-cookies"}` → `group_cycle` with `groups:
["linzer-cookies", "christmas-cookies", "linzer-cookies"]` (shape as
  `mcp.test.ts:393-401`). (6) Reads: `group_get christmas-cookies` → five
  `{recipe, name}` rows and one `{group: "linzer-cookies", label: "Linzer",
name: "Linzer Cookies", kind: "collection"}`, no `missing`; `group_get
linzer-cookies` → three rows; `group_list` → `total` 2, `itemCount` 6 and 3
  (top-level accessibility); `featured_list` → one row `{slug:
"christmas-cookies-strip", group: "christmas-cookies", name: "Christmas
Cookies"}`; `recipe_search {query: "chili"}` → 1 (distractor untouched);
  the fixture directory itself is unchanged (`git status` clean under
  `playwright/fixtures` — asserted by the gate, not the test).

## Traps (T-list; pass to every implementer)

Carried over from 22 (numbers kept so the two docs agree; full text in
`agent-curation.md`):

- **T1** `test/specVersions.test.ts` hashes `paginationConfigs.ts` /
  `aggregateConfigs.ts` whole-file and snapshots `groupPaginationConfig.ts` /
  `groupAggregateConfigs.ts` by `it()` block. A version bump (23c) means
  updating the inline snapshots, never the hash of a file you did not touch.
- **T2** `test/derivedPaths.test.ts` asserts the registry's ignore list
  exactly; a new index or aggregate directory has to be added there.
- **T3** Fixture ordering: seed data + `rebuildIndex` first, then
  `pnpm tsx scripts/build-fixture-indexes.ts` (it skips a type whose index
  dir is absent). Check `git status` for stray envs in fixtures.
- **T4** Configs must never import the registry; cross-config edges are
  thunks on **both** sides of a cycle (`recipeContentConfig` ↔
  `featuredRecipeContentConfig`, `groupContentConfig.referencedBy` ↔
  `featuredRecipeContentConfig.references`).
- **T5** No cached (`unstable_cache`) reads from scripts, the CLI, or the
  MCP stdio server — thread `contentDirectory` explicitly through every
  engine call (T16), and `closeCachedEnvironments()` before exit.
- **T7** `"use server"` modules export only async functions.
- **T11** `FormData` cannot carry an empty array; JSON can, and the curation
  schemas default `items` to `[]`.
- **T12** Root vitest only includes `test/**`; `.claude/worktrees/` has stale
  checkouts that pollute naive greps.
- **T13** A fresh worktree is missing `editor/.env.local` and
  `export/next-env.d.ts`; copy both from the main checkout before running
  either gate. _Amended 23a:_ it also has **no `node_modules`**, and without
  them the package-name imports (`recipe-editor/*`,
  `recipe-website-common/*`) resolve up the directory tree into the main
  checkout — so the editor typecheck silently reads _that_ copy of the code.
  Run `pnpm install --frozen-lockfile` in the worktree first.
- **T14** A killed Playwright run leaves stale LMDB envs; from `editor/`:
  `rm -rf test-content test-settings test-remotes test-clones`. _Amended
  23a:_ `pkill -f "playwright test"` does not reap the `next-server` the
  run started; an orphan squatting the port (3019 for `e2e-dev`) is reused
  by `reuseExistingServer` and answers with a dead `test-settings`, which
  reads as spurious 401s and a `global-setup` timeout. Check `ss -ltnp` for
  the port and kill the holder by PID before re-running.
- **T16** `getContentDirectory()` evaluates `CONTENT_DIRECTORY` at import
  time; set it before the first import or pass the directory explicitly.
- **T17** API route files stay thin — parse, authenticate, call
  `controller/curation/*`, respond through `errorResponse`. A route that
  imports a cached read cannot be loaded under vitest; Playwright covers
  routes, vitest covers the pure pieces.
- **T19** A Playwright test that writes then navigates gates on
  `page.waitForURL(...)`, never on a heading substring.
- **T20** Landing a stack: merge the parent, **retarget the child, then**
  delete the parent's branch (#124).

New for this epic:

- **T21 stdio stdout purity.** An MCP stdio server owns stdout for JSON-RPC
  frames. Any `console.log`, pnpm banner, or engine chatter on stdout breaks
  the client's parser. Register the script so `pnpm --silent` is in the
  command (D10), route every diagnostic through `console.error`, and grep
  the curation layer and engine for stray `console.log` before 23b closes.
- **T22 `"use server"` files cannot export plain helpers** (T7 restated for
  git): the pure `simple-git` calls in `actions/sync.ts` must move to
  `controller/curation/git.ts` before the MCP registry or an API route can
  call them — importing a `"use server"` module from a route handler or a
  plain Node script does not work.
- **T23 Route handlers using `simple-git` (or LMDB) need `export const
runtime = "nodejs"`** so Next does not attempt the edge runtime.
- **T24 SDK v2 wants zod v4 imports.** `@modelcontextprotocol/server` 2.x
  peers on `zod ^3.25 || ^4` and expects `z` from `"zod"` (v4 API, which the
  editor already uses: `z.strictObject`, `z.flattenError`). Do not import
  from `"zod/v3"` or `"zod/v4"` sub-paths — one `z` instance across the
  registry and `curation/schema.ts`, or `instanceof ZodError` checks fail.
  _Amended 23b:_ the SDK itself imports `zod/v4`; in zod 4 that sub-path
  re-exports the root classes, so the real invariant is **one physical zod
  copy** in the lockfile (`pnpm why zod`; `pnpm dedupe` if a second 4.x
  appears). App code keeps `import { z } from "zod"`.
- **T25 `statusFor` is exhaustive.** Adding a `CurationErrorCode` without a
  case in `curation/http.ts` `statusFor` is a type error; the HTTP backend's
  `rehydrate` and `codeForStatus` also need the new code and status, or a
  remote failure prints as `internal`.
- **T26 Default featured slugs collide within a second.**
  `createDefaultFeaturedRecipeSlug` is `YYYY-MM-DD-HH-MM-SS` in local time,
  so two `feature` calls in one second conflict (409). Tests pass explicit
  `slug`s; agents that feature several targets in a burst should too.

- **T27 `${VAR}` without `:-` in `.mcp.json` is passed through literally
  when unset.** Claude Code keeps an unexpanded `${VAR}` as the literal
  string (with a warning), so `CONTENT_DIRECTORY` would become the path
  `${CONTENT_DIRECTORY}`. Always write `${VAR:-}` and make the consumer
  treat empty as unset (D11's `envValue`).
- **T28 Two error shapes.** Input the tool schema rejects (unknown key,
  wrong type) is answered by the SDK's pre-dispatch validation in the
  SDK's own shape, not by `toErrorObject`; curation codes (`validation`,
  `not_found`, …) appear only after the schema passes. Tests that want the
  `{error: {code}}` shape must trigger a curation-layer failure (unknown
  group, duplicate slug, a patch the curation schema rejects).
- **T29 `StdioClientTransport` passes a minimal env by default.** The
  client's spawn does not inherit the parent's environment; pass
  `CONTENT_DIRECTORY`, `PATH`, and `HOME` explicitly or pnpm cannot be
  found and the server opens the real content directory.
- **T30 Self-reference precedes the existence check.** At create the group
  does not exist yet, so a `{group: <own slug>}` item checked after the
  unknown-group pass surfaces as a forceable `unknown_group` instead of
  `group_cycle`. `checkItems` tests `item.group === slug` first.
- **T31/T32 Sub-group rename/delete dangles.** Parents keep their `{group}`
  items and the `by-group` aggregate stays keyed on the old slug until a
  parent is re-saved — the D3 rule for recipes, extended. Pages show "Group
  not found: slug"; `getGroup` reports `missing: true`; tool descriptions
  say so. Rewriting parents needs F32 (Deferred).
- **T33 Regenerate fixtures after the config code lands.**
  `scripts/build-fixture-indexes.ts` silently skips a fixture that lacks
  `groups/index/`, so a copied fixture must carry that directory before the
  script runs; run it once, after steps 1–5, and check `git status` shows
  only the group fixtures' `groups/*` moving.
- **T34 `groupCount` may be `undefined`** on a v2-projected page in a dev
  content directory that has not been reindexed; the chip helper reads
  `groupCount ?? 0`.
- **T35 Thumbnail recursion is render-time.** `GROUPS_DEEP × MEMBERS_WALKED`
  bounds the reads, the visited set stops hand-edited on-disk cycles; the
  export build on `nested-groups` proves the nested image variants are
  generated.
- **T36 `revalidateDerived` tag lists are order-sensitive** with the
  `aggregates` array; `by-group` goes after `by-recipe` in both.
- **T37 XOR refines on tool inputs fail in the SDK shape** (T28); the
  curation-level XOR fails as `validation` with `issues[].path` `["recipe"]`.
  Tests that want `{error: {code}}` go through the curation layer.
- **T38 The browser form cannot add sub-groups**, so `actions/groups.ts`
  skips the cycle check; wiring `GroupSelectInput` later must add it.
- **T39 `codeForStatus(422)` without a body → `unknown_recipe`.** Every
  curation route sends a body; record only.
- **T40 `label` stays an unconditional key in the index value** so existing
  stored values (and sealed page hashes) do not move; only `group` is
  conditional.
- **T41 `build-fixture-indexes.ts` rebuilds every fixture.** Even an
  untouched type's LMDB files come back byte-different (page churn, no
  content change): at 23c that was ~84 stray `.mdb` modifications.
  `git checkout --` everything outside the fixtures the change concerns.
  A file that does **not** move (`three-recipes-groups/…/by-recipe/data.mdb`
  at 23c) is the evidence an aggregate's output really is unchanged.
- **T42 `lint-staged --diff` stages the files it checks and re-applies that
  snapshot afterwards**, so a `prettier --write` run between two lint-staged
  invocations is thrown away. Format, `git add -A`, then lint-staged.
- **T43 `specVersions`' regex sees prose.** `declaredVersions` matches
  `version: "…"` anywhere in the file, comments included — a doc comment
  quoting the literal adds a phantom version, and a factory that takes the
  version positionally declares none (amends T1: a shared aggregate factory
  must take `version` as a named argument). Amends T33: the
  `three-recipes-groups` meal plan already dangles `missing-recipe`, so a
  new missing-target assertion on `/group/week-of-may-4` needs `.last()`.

- **T44 simple-git `log` object-form options land after `--`.** `log({file,
maxCount})` emits `--follow` and appends the options behind the pathspec
  separator, so `--name-only` + several paths is only expressible with the
  array form `git.log(["--max-count=<n+1>", "--skip=<offset>",
"--name-only", "--", ...paths])`; the touched files come from
  `entry.diff.files[].file`.
- **T45 Wire `rev`/`hash`/`path`/`slug` reach git argv.** Refuse a leading
  `-` on `rev` and `path`, keep `hash` to `/^[0-9a-f]{7,40}$/i` and slugs to
  one path segment (not `.`/`..`) with a `validation` error before any git
  call; `schema.ts` slugs are bare strings, so the module validates them
  itself.
- **T46 `commitChanges(paths)` cannot commit a staged revert.** Its `git add
<paths>` fails on a path the reverted commit added (gone from index and
  tree). Revert commits in one shot with `GIT_AUTHOR_*` in `git.env(...)`;
  restore stages with `rm`/`checkout` and commits with `git.commit([...],
{"--author"})`.
- **T47 Push is not clean-tree-guarded.** The `/git` page pushes a dirty
  tree today and `git.spec.ts` relies on it; only revert/restore preflight
  `dirty_tree`.
- **T48 `test-content/users/` is inside the repo Playwright inits.**
  `createApiToken` writes there, so it must run **before**
  `initializeContentGit` — the other order leaves the tree dirty and every
  revert/restore fails `dirty_tree`.
- **T49 The vitest repo helper's ordering.** `git init`, a local
  `user.email`/`user.name`, `commit.gpgsign=false`, and the `.gitignore` from
  `derivedContentPaths(recipeContentTypes)` all before the first LMDB open;
  otherwise the index files land in the initial commit or a signing key is
  demanded.
- **T50 `git_push` and CLI `git push` bypass `afterWrite`.** Nothing local
  changed, so the stale-editor hint would be wrong there; revert/restore go
  through it (CLI `write: true`, MCP `write(...)`) so the hint fires.

- **T51 `editor/.gitignore` swallows every fixture's `groups/`** except the
  ones carved back out by name (`three-recipes-groups`, and since `8a6618ea`
  `nested-groups`). A new fixture with groups needs its own negation line or
  it ships without them: 23c's `nested-groups` passed every local gate from
  ignored files and would have failed `groups.spec.ts` on a fresh checkout.
  `git ls-tree -r <commit> -- <fixture>` is the check.

- **T52 The in-process backend must never close the LMDB cache.**
  `closeCachedEnvironments` is process-global; inside the editor it tears
  down the server's own environments. `inProcess` makes `close()` a no-op;
  `resolve.ts` never sets it.
- **T53 The stale-editor hint is false in-process.** `afterWrite` is absent
  on an `inProcess` backend; a `warnings` entry over HTTP means the wrong
  backend was built.
- **T54 Never read the body before `handler.fetch`.** It clones then
  `text()`s the request; a consumed body makes the clone throw. Authenticate
  from headers only (`authenticateRequest` does).
- **T55 `responseMode` never reaches the legacy leg.** 2025-era clients get
  `text/event-stream` per POST regardless (the legacy transport defaults
  `enableJsonResponse = false`); `responseMode: "json"` also `console.warn`s
  per `createMcpHandler` call — never combine it with a per-request handler.
- **T56 On the modern leg `"auto"` upgrades to SSE only when a notification
  precedes the result.** Adding progress/logging to a tool changes the wire
  shape.
- **T57 Raw POSTs need `Accept: application/json, text/event-stream`** or
  the legacy leg answers 406 before any parse error.
- **T58 The client's post-initialize GET must get exactly a 405** (Next's
  default for an unexported method; a 405 is swallowed silently by the
  client); a `GET` export returning anything else turns every connect into
  an `onerror` + reconnect loop.
- **T59 `handler.close()` is never needed per request.** The legacy leg
  tears down transport + server when the response body drains and the
  modern leg closes after the terminal response; calling `close()` before
  the SSE body drains aborts the exchange.
- **T60 A 401 reaches the client as `SdkHttpError`** (`status 401`, body in
  `data.text`), not `UnauthorizedError` — that class needs an `authProvider`.
- **T61 Identity-guard tests need a scrubbed git environment**
  (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, no
  `GIT_COMMITTER_EMAIL`) and a real repo (`assertCommitIdentity` returns
  early on a non-repo); "no identity commits fine" is not a state git
  allows, so the in-process case asserts only that the guard did not fire.
- **T62 Playwright's `request.post` re-encodes a malformed string body.**
  With a JSON content type, `data: "{"` goes through `isJsonParsable(data) ?
data : JSON.stringify(data)` (`playwright-core/lib/client/fetch.js`), so the
  server receives the JSON _string_ `"{"` — valid JSON, `-32600`, never the
  `-32700` parse error. A deliberately malformed body must be a
  `Buffer.from("{")`. Found by 23e's first `mcp-http.spec.ts` run.
- **T63 A fixture copied by vitest must be copied, never pointed at:** the
  story writes groups, and a write into `playwright/fixtures/…` dirties the
  tree and, for `groups/`, is swallowed by `.gitignore` (T51).
- **T64 Three allow-lists can drift** (skill frontmatter, `settings.json`,
  `TOOL_NAMES`); `test/curatorSkill.test.ts` is the only guard, and a new
  `DESTRUCTIVE_WRITE` tool must be added to its `HELD_BACK` or the test
  fails.
- **T65 A headless skill run with `.mcp.json` writes to the real content
  repo** unless `CONTENT_DIRECTORY` is exported as an **absolute** path
  (`${VAR:-}` expands empty → `editor/content`; a relative path resolves
  against `INIT_CWD`); `RECIPE_API_URL` in the shell redirects to an editor;
  `--strict-mcp-config` changes neither. `CLAUDECODE` must be unset from
  inside a session. `--permission-mode acceptEdits` does not allow MCP
  tools: a denial in `-p` mode means the settings list is wrong.
- **T66 `recipe_search` free text is prefix-at-word-start with the query
  word as the prefix,** so "cookie" finds "cookies" but not the reverse; a
  fixture recipe is in the cluster iff such a word appears in its name,
  description, tags or **ingredients** ("cookie sheet" in a distractor
  makes it nine).
- **T67 `rebuildIndex` cascades to dependents by default and LMDB `open()`
  creates directories:** seeding a recipes-only fixture without
  `cascadeDependents: false` commits a stray `featured-recipes/`
  environment. `build-fixture-indexes.ts` rebuilds every fixture (T41) —
  never for one. And T26 restated: explicit `slug` on `feature` in any test
  or run that features more than once.

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR  | Branch (← parent)                   | Status  | Scope                                                                                                                                                                                                                            |
| --- | ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23a | `agent/23a-curation-seats` ← `main` | ✅ done | This doc; featured seat (D5) + group update seat (D4) in the curation layer, API routes, CLI commands, backend interface (local + http), vitest + Playwright; strike two backlog rows                                            |
| 23b | `agent/23b-mcp-stdio` ← `main`      | ✅ done | `@modelcontextprotocol/server` + `/client` deps; `editor/mcp/{registry,server}.ts`; every D2 tool that exists by then; compact outputs (D3); `.mcp.json` (D10); vitest via `InMemoryTransport`; smoke from Claude Code           |
| 23c | `agent/23c-nested-groups` ← 23b     | ✅ done | D6/D15–D18: `{group}` items, `group_cycle`, `groupsByDate` v3 + `by-group` aggregate, group cards + Appears-in on group pages, transitive `group:` search, CLI `--group-item`/`--group`, MCP `subgroup`, `nested-groups` fixture |
| 23d | `agent/23d-git-seats` ← 23c         | ✅ done | D7: `curation/git.ts`, `/api/git/*`, CLI `git …`, MCP git tools; tests on a temp repo; `/git` page keeps its behaviour                                                                                                           |
| 23e | `agent/23e-mcp-http` ← 23d          | ✅ done | D8/D24–D26: `POST /api/mcp` route on `createMcpHandler`, `inProcess` local backend, `mcp/http.ts`; `test/mcpHttp.test.ts` (client via handler) + `mcp-http.spec.ts` against `next dev`                                           |
| 23f | `agent/23f-curator-skill-v2` ← 23e  | ✅ done | D9: skill rewrite, examples, acceptance test of the user story, docs close-out, backlog update, memory                                                                                                                           |

**Epic complete (2026-09-15).** Every phase is designed, implemented,
reviewed and closed out in this doc. Landing order, each a draft PR against
its parent: #138 (23b) → #139 (23c) → #140 (23d) → #141 (23e) → #142 (23f).
For each: merge the parent, **retarget the child to `main`, then** delete the
parent's branch (T20); the recipe Playwright shards run on a PR only once its
base is `main`. Anything still open is in Deferred and `docs/backlog.md`.

**Landed 2026-09-16.** All five merged into `main` as merge commits, in
order, on the user's say-so: #138 `e1ffd5b8` → #139 `78a5de92` → #140
`c2219e02` → #141 `a6582344` → #142 `bd02f6f9`. Each child was retargeted to
`main` first, brought up to date through GitHub's `update-branch` API (`main`
protection is strict on `lint`), and merged only after all 12 checks —
including the four recipe Playwright shards — passed; `main`'s own Playwright
run at the tip (35060176674) is green. The five head branches and the
`agent-23b…23f` worktrees were left for housekeeping, done from epic 24's
first PR (`agent-taxonomy.md`, "Why this exists"). **The real run of the
story did not happen on groups**: before it, the user redirected to a
universal taxonomy in the engine, so the story is now epic 24's acceptance
case (Verification, below).

## Phase detail

### PR 23a — Curation seats `agent/23a-curation-seats` ✅ done (← `main`)

Two seats the curator is missing, both purely additive to the 22c/22d
layers, and both prerequisites for the MCP registry (23b) to expose
`feature` / `unfeature` / `featured_list` / `group_update` as tools.

#### Facts (validated 2026-09-12; see the epic-level list above for the rest)

- `curation/groups.ts` `writeItems` is the one update path and always
  writes the same slug back; `updateGroup` is a second update path that
  may rename, so it follows `updateRecipe`'s shape (conflict pre-check via
  `getContentItemDirectory` + `exists`, `previousSlug` on the event) rather
  than `writeItems`.
- The group form's `buildGroupData` (`actions/groups.ts`) shows the upload
  contract for an update: `uploads.image = {file?, clearFile?, existingFile:
current?.image}` and `data.image` states the same decision. The curation
  twin uses `fileImportUrl` instead of `file` (as `createGroup` and
  `buildRecipeWrite` do); `imageImportUrl: null` → `clearFile: true` and no
  `data.image`; `undefined` → `existingFile` carries the picture forward.
- `readContentIndex` (`@discontent/cms/content/readContentIndex`) with a
  `map` is how `listGroups` lists; `listFeatured` uses it the same way over
  `featuredRecipeContentConfig`. The entry value already carries the
  borrowed `recipeName` / `groupName`.
- `readContentFileOrNull` against `recipeContentConfig` /
  `groupContentConfig` is the existence check `checkRecipes` uses;
  `feature` does the same for its one target.
- The homepage strip (`common/components/Homepage/FeaturedStrip.tsx`)
  renders a featured group as a group card with the group's name; the
  existing Playwright locator is the `h2` "Featured Recipes" and its parent.
- `curation/errors.ts` `toErrorObject` copies `slug`, `issues`, `recipes`
  from `details`; a new `groups` detail needs adding there, in
  `ErrorObject`, and in `http.ts` `rehydrate`. `exitCodeFor` needs nothing:
  it answers 2 for `slug_conflict` and 1 for everything else.

#### Design (decided)

**Schema (`curation/schema.ts`).**

```ts
export const FeaturedInputSchema = z
  .strictObject({
    recipe: z.string().min(1).optional(),
    group: z.string().min(1).optional(),
    note: z.string().optional(),
    date: EpochSchema.optional(),
    slug: z.string().optional(),
  })
  .refine((d) => Boolean(d.recipe) !== Boolean(d.group), {
    message: "Name exactly one of `recipe` or `group`",
    path: ["recipe"],
  });

export const GroupPatchSchema = z.strictObject({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  kind: z.enum(["meal-plan", "collection"]).optional(),
  date: EpochSchema.optional(),
  description: z.string().nullable().optional(),
  imageImportUrl: z.string().nullable().optional(),
});
```

**Errors (`curation/errors.ts`).** `CurationErrorCode` gains
`"unknown_group"`; `CurationErrorDetails` and `ErrorObject.error` gain
`groups?: string[]`; `UnknownGroupError(groups: string[])` mirrors
`UnknownRecipeError` (message without the `--force` hint — featuring has no
force). `toErrorObject` copies `groups`. `http.ts` `statusFor` → 422 (T25);
`cli/backend/http.ts` `rehydrate` copies `groups`; `codeForStatus` keeps 422
→ `unknown_recipe` (the body carries the real code).

**Featured seat (`curation/featured.ts`, new).**

```ts
export interface FeaturedRow {
  slug: string;
  date: number;
  recipe?: string;
  group?: string;
  note?: string;
  /** The target's current name, borrowed through the index. */
  name?: string;
}
export interface FeaturedListResult {
  total: number;
  more: boolean;
  featured: FeaturedRow[];
}
export interface FeaturedWriteResult {
  slug: string;
  date: number;
  path: string;
  url: string; // `/featured-recipe/<slug>`
  recipe?: string;
  group?: string;
}
export async function listFeatured(ctx, { limit = 20, offset = 0 } = {});
export async function feature(ctx, raw: unknown): Promise<FeaturedWriteResult>;
export async function unfeature(ctx, slug): Promise<{ slug; deleted: true }>;
```

`feature`: `parseInput(FeaturedInputSchema)`; existence check on the one
target (`UnknownRecipeError([slug])` / `UnknownGroupError([slug])`); `date =
input.date ?? Date.now()`; `slug = slugify(input.slug ||
createDefaultFeaturedRecipeSlug({date}))`; data `{recipe | group, date,
...(note ? {note} : {})}` (only the key that is set, as the form does);
`createContent` with `featuredRecipeContentConfig`, `author: ctx.author`,
`commitMessage: Feature recipe: <target>` / `Feature group: <target>`;
`ctx.onWrite({contentType: "featured-recipes", kind: "create", …})`.
`unfeature`: read-or-404, `deleteContent` with `indexKey: [date, slug]`,
`commitMessage: Unfeature: <slug>`, `onWrite` kind `"delete"`.
`context.ts` gains `FEATURED_URL_BASE = "/featured-recipe"`, `featuredPath`,
`featuredUrl`.

**Group update seat (`curation/groups.ts`).** `updateGroup(ctx, currentSlug,
rawPatch)`: `parseInput(GroupPatchSchema)`; `requireGroup`; rename handling
copied from `updateRecipe` (slugify, empty → `ValidationError`, conflict →
`SlugConflictError`); `date = patch.date ?? current.date`; data = `{
...current }` with `name`/`kind` overwritten when given, `description`
set/cleared/kept, `image` from the import URL's basename / cleared / kept;
`uploads.image = {fileImportUrl, clearFile: patch.imageImportUrl === null,
existingFile: current.image}`; `updateContent` with `currentSlug`,
`currentIndexKey: [current.date, currentSlug]`, `commitMessage: Update
group: <slug>`; `onWrite` with `previousSlug` on a rename; returns
`GroupWriteResult`.

**Backend (`cli/backend/types.ts`, `local.ts`, `http.ts`).**
`updateGroup(slug, raw)`, `listFeatured(options?)`, `feature(raw)`,
`unfeature(slug)`. Local: guard on every write. HTTP: `PATCH
/api/group/<slug>`, `GET /api/featured`, `POST /api/featured`, `DELETE
/api/featured/<slug>`. Re-export `FeaturedListResult`,
`FeaturedWriteResult`.

**Routes.** `app/api/group/[slug]/route.ts` gains `PATCH` (body = patch,
`requireCurationContext`). New `app/api/featured/route.ts` (`GET` list with
`limit`/`offset` via `readContext`; `POST` → 201) and
`app/api/featured/[slug]/route.ts` (`DELETE`). Thin, per T17.

**CLI.** `cli/index.ts`: `splitArgv` takes a subcommand after `group` **and**
`featured` (generalise the `command === "group"` test to a set);
`COMMANDS` gains `feature`, `unfeature`; a `featuredCommands` table (`list`)
dispatches like `groupCommands`; USAGE gains the four lines. New
`cli/commands/featured.ts` (`feature`, `unfeature`, `featured list`);
`cli/commands/group.ts` gains `group update`. Formats: `Featured <target>`

- url + path; the list as `formatRows` with `tags: [recipe|group,
<target>]`.

**Skill (`.claude/skills/recipe-curator/SKILL.md`).** §7 gains one
paragraph: after the group is created, `pnpm --silent recipes feature
--group <slug> --json` puts it on the homepage **only when the ask says so**
("feature it", "put it on the homepage"); `group update` for a rename or
description fix. The "Never" list is unchanged (`unfeature` is a delete in
spirit — add it to the never-delete sentence).

#### Tests

- `test/featured.test.ts` (vitest, node env, tmpdir like `curation.test.ts`):
  `feature({recipe})` writes `featured-recipes/data/<slug>/featured-recipe.json`
  with only `recipe`, `date`, `note`; the index entry carries `recipeName`;
  `feature({group})` likewise with `groupName`; both set → `validation`;
  neither → `validation`; unknown recipe → `unknown_recipe`; unknown group
  → `unknown_group`; explicit `slug` + `date` are honoured; a second feature
  with the same slug → `SlugConflictError`; `listFeatured` newest-first with
  `total`/`more`; `unfeature` removes the file and the index row; unknown
  slug → `not_found`; `onWrite` receives `contentType: "featured-recipes"`
  with the right `kind`.
- `test/curation.test.ts` gains a `describe("updateGroup")`: name +
  description patch keeps items and image; `description: null` clears;
  `kind` changes the index value; rename moves the directory, updates the
  index key, reports `previousSlug`, and rewrites a featured entry that
  pointed at the old slug (engine rename propagation); rename onto an
  existing slug → `slug_conflict`; `items` in a patch → `validation`;
  `imageImportUrl: null` clears `image` (seed a group with an `image` on
  disk); unknown group → `not_found`.
- `test/curationHttp.test.ts`: `statusFor("unknown_group") === 422`;
  `toErrorObject` carries `groups`.
- Playwright `api-write.spec.ts` (fixture as the existing group case):
  "features a group via the API and the homepage shows it" — create recipe +
  group, `POST /api/featured {group, slug}` → 201, `/` shows the group's
  name inside the "Featured Recipes" section, `GET /api/featured` lists it
  with `name`, `DELETE /api/featured/<slug>` → 200 and the card is gone;
  "a PATCH renames and re-describes a group" — `PATCH /api/group/api-week
{name, description}` → 200 and `/group/api-week` shows both, then `PATCH
{slug: "api-fortnight"}` → `/group/api-fortnight` renders and
  `/group/api-week` 404s; unauthenticated `PATCH`/`POST /api/featured` → 401.
- The CLI-over-`--remote` block in the same spec gains one `feature
--group … --json` and one `group update … --name … --json` call.

#### Gates

```
cp ../../../editor/.env.local websites/recipe-website/editor/  # from the main checkout (T13)
cp ../../../export/next-env.d.ts websites/recipe-website/export/
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                      # 434 at base + the new cases
pnpm --filter recipe-editor e2e-dev -- api-write.spec.ts groups.spec.ts featured-recipes.spec.ts
```

Run Playwright detached (`setsid nohup … > log 2>&1 &`) and strip ANSI from
the log; from `editor/`, `rm -rf test-content test-settings test-remotes
test-clones` after a killed run (T14). Then CI on the draft PR (lint, unit,
typecheck, Playwright).

#### Decisions and close-out (2026-09-12)

- [x] `unknown_group` added with 422 (T25 chain complete: `statusFor`,
      `rehydrate`, `ErrorObject`; pinned by `curationHttp.test.ts`).
- [x] `featured list` subcommand dispatch generalised in `splitArgv`
      (as a `SUBCOMMAND_TABLES` map read by both the split and the
      dispatch; see the implementer notes).
- [x] Skill §7 amended; "Never" list gains `unfeature`.
- [x] Backlog rows struck (done at Step 0).
- [x] `group update` refuses an empty patch and mixed `--file`/flag input as
      usage errors; `--description ""` clears; `--clear-image` clears.
- [x] `feature` result carries the target (`recipe` or `group`) beside the
      feature's own `slug`/`url`, so a caller can tell the two slugs apart.
- [x] `PATCH /api/group/[slug]` sits beside `PUT` (items only) — neither
      method can do the other's damage.

**Review (Fable).** Read the full diff; no correctness changes needed. The
curation seats mirror `updateRecipe` / `createGroup` exactly (conflict
pre-check, `previousSlug`, only-the-set-key data, `onWrite` with the right
`contentType`), and the engine's scalar rename propagation is pinned by the
`updateGroup` rename test rather than re-implemented. Follow-ups recorded
under Deferred: none new beyond the T13/T14 amendments above.

**Gate results (verbatim, reviewer rerun in the worktree):**

| Gate                                                           | Result                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter recipe-editor typecheck`                        | clean                                                                                                                  |
| `pnpm --filter recipe-website exec tsc --noEmit`               | clean                                                                                                                  |
| `pnpm exec vitest run`                                         | `Test Files 25 passed (25)` · `Tests 454 passed (454)` (434 at base, +20)                                              |
| `pnpm e2e-dev -- api-write groups featured-recipes` (dev mode) | implementer: `82 passed (3.4m)`; reviewer rerun: `82 passed (4.0m)`, 0 failed, 0 flaky                                 |
| CI on the draft PR                                             | green on `ac80a887`: lint, both typechecks, unit, CMS demo (dev, prod), Portfolio, recipe shards 1–4 (run 34678595744) |

**Implementer notes (divergences from the design above, and why).**

- **`splitArgv` takes a `SUBCOMMAND_TABLES` map, not a bare `Set`.** The split
  and the dispatch have to agree about exactly which commands take a
  subcommand; one map keyed by command name, read by both, is the version where
  they cannot drift. `index.ts` looks the table up once and falls back to
  `COMMANDS`.
- **`SlugConflictError` carries no `code`.** It is the _engine's_ error, which
  `toErrorObject` maps to `slug_conflict`; `test/featured.test.ts`'s duplicate
  case asserts `toBeInstanceOf` plus `toErrorObject(...).error.code` rather than
  `rejects.toMatchObject({code})`, which would silently match nothing.
- **`test/curation.test.ts`'s D8 allow-list grew two entries** —
  `featuredRecipeContentConfig` and `createFeaturedRecipeSlug`. Both are a
  content config and a pure string builder with no Next reachability, and the
  boundary test is an explicit list, so the seat could not import them without
  saying so.
- **`group update` validates before it calls.** `--image-url` with
  `--clear-image`, a patch file _and_ flags, and a patch with nothing in it are
  all usage errors in the command rather than validation errors from the
  schema, so the message names the flags a person typed. The schema still
  guards the API and (at 23b) the tool.
- **The worktree had no `node_modules`.** Package-name imports
  (`recipe-editor/*`, `recipe-website-common/*`) were resolving up to the main
  checkout, so the editor typecheck was reading _that_ copy of the curation
  layer. `pnpm install --frozen-lockfile` in the worktree fixed it; worth
  adding to T13, which today mentions only `.env.local` and `next-env.d.ts`.

### PR 23b — MCP stdio `agent/23b-mcp-stdio` ✅ done (← `main`)

A **stateless MCP stdio server** that exposes the curation layer as typed
tools, so any MCP client (Claude Code first, via `.mcp.json`) can manage and
search the recipe database without shell JSON. Everything the tools wrap
already exists behind `CuratorBackend` (recipes, groups, featured, tags,
reindex); this phase adds **no new content seats**. 23a merged into `main`
on 2026-09-12 (`2ad89683`), so this branch is off `main`.

#### Facts (validated 2026-09-13 against `main` at `2ad89683`)

Paths under `websites/recipe-website/editor/` unless noted.

- **Backend seam** `cli/backend/types.ts` `CuratorBackend`: `kind`,
  `importRecipe(url, {tags, slug, name, dryRun, overwrite})`,
  `createRecipe(raw, {overwrite})`, `updateRecipe(slug, raw)`, `getRecipe`,
  `listRecipes({limit, offset, tag})`, `searchRecipes(query, {limit,
offset})`, `deleteRecipe`, `createGroup(raw, {force})`, `updateGroup(slug,
raw)`, `addGroupItem(group, recipe, {label, note, force})`,
  `removeGroupItem`, `setGroupItems(group, items, {force})`, `getGroup`,
  `listGroups`, `deleteGroup`, `listFeatured`, `feature(raw)`, `unfeature`,
  `reindex(contentType?)`, `afterWrite?()`, `close()`. **`listTags` is not
  on the seam** (`controller/curation/search.ts` `listTags(ctx):
Promise<string[]>` reads the `recipeTags` aggregate) and has no API route
  or CLI command — D12 adds all three.
- **Backend factories.** `createLocalBackend({contentDirectory, author?,
onWrite?, notify?})` (`cli/backend/local.ts`), `createHttpBackend({baseUrl,
token?})` (`http.ts`). Local guards every write with `assertCommitIdentity`
  (skipped for `dryRun` imports and `reindex`); `afterWrite()` returns the
  stale-editor hint or `Notified <origin>`; `close` is
  `closeCachedEnvironments`. HTTP `afterWrite` → `undefined`, `close` no-op.
- **Mode resolution is inline in `cli/index.ts` `main()`**: `--remote ??
RECIPE_API_URL` → HTTP with `RECIPE_API_TOKEN`; else local with
  `resolveContentDirectory(flag)` (not exported; `--content-dir` >
  `CONTENT_DIRECTORY` > `getContentDirectory()`, relative to `INIT_CWD ??
cwd()`), `resolveAuthor(flag)` (`controller/curation/author.ts`, exported:
  flag > `RECIPE_AUTHOR`), `resolveNotify(notify, editorUrl, token)`
  (exported; `--editor-url` > `RECIPE_EDITOR_URL`, env alone suffices). D11
  extracts this into one exported function both entry points call.
- **Row shapes.** `RecipeRow = MassagedRecipeEntry`
  (`common/controller/data/read.ts`): `{date, slug, name, description?,
ingredients?, image?, tags?, prepTime?, cookTime?, totalTime?}` (`groups`
  is client-only). `RecipeListResult {total, more, recipes}`, `SearchResult
{query: {raw, text, hasAdvancedSyntax}, total, recipes}`, `RecipeDetail
{slug, path, url, recipe}`. **No projection option exists anywhere**; D3's
  `fields` is an MCP-layer projection over these rows. Group/featured
  results are already small (`GroupRow`, `GroupDetail` with
  `ResolvedGroupItem`, `FeaturedRow`).
- **Schemas** (`controller/curation/schema.ts`, `import { z } from "zod"`,
  zod `4.3.6`): `RecipeInputSchema`, `RecipePatchSchema`, `GroupInputSchema`,
  `GroupPatchSchema`, `FeaturedInputSchema` (with the XOR refine),
  `GroupItemInputSchema`, `EpochSchema`; `parseInput(schema, raw)` throws
  `ValidationError`. All strict objects.
- **Errors** (`controller/curation/errors.ts`): `CurationErrorCode` =
  `not_found | slug_conflict | validation | unknown_recipe | unknown_group |
import_failed | no_git_identity | unauthenticated | usage | internal`;
  `toErrorObject(error): ErrorObject` (`{error: {code, message, slug?,
issues?, recipes?, groups?}}`). No new codes in 23b, so T25 does not fire.
- **stdout purity (T21)**: no `console.log` in `controller/`,
  `common/controller/`, `cli/`, or `packages/cms/` except
  `rebuildFixtureIndexes.ts`'s default `log` parameter (script-only). The
  engine's `console.warn` calls (`rebuildIndex.ts`, `updateDependents.ts`,
  `references.ts`) go to stderr and are fine. Only `cli/output.ts` and the
  `--help` paths write stdout; the MCP server must not import
  `cli/output.ts`.
- **Process lifecycle**: the CLI awaits `backend.close()` in a `finally` and
  sets `process.exitCode` (never `process.exit`) so stdout flushes. No
  signal handlers exist anywhere in the repo. The editor package is CJS (no
  `"type": "module"`), scripts run via `tsx ^4.21.0` (`"recipes": "tsx
./cli/index.ts"`); root `package.json` has `"recipes": "pnpm --filter
recipe-editor recipes"`. Node `22.23.2`, pnpm `10.24.0`.
- **Tests**: single `vitest.config.js` at the root (jsdom default, `include:
test/**`, excludes `.claude/**`, aliases stub `next/cache`,
  `next/navigation`, `@/auth`, `discontent/fs/getContentDirectory`).
  `test/curation.test.ts` is the tmpdir precedent (`// @vitest-environment
node`, `mkdtemp` per test, `process.env.CONTENT_DIRECTORY` set,
  `closeCachedEnvironments()` + `rm` in `afterEach`; the tmpdir is not a git
  repo so commits no-op). `test/cliJson.test.ts` is the spawn precedent
  (`execa("pnpm", ["exec", "tsx", "cli/index.ts", …])` from the editor dir,
  30 s timeouts; pnpm is on PATH in CI's `unit` job). 454 tests at base.
- **No `.mcp.json`; `.claude/settings.json`** allows only `Bash(pnpm
--silent recipes:*)`, `Bash(pnpm recipes:*)`, `WebSearch`,
  `Skill(recipe-curator)` (no MCP keys). Skill frontmatter `allowed-tools:
Bash(pnpm --silent recipes:*), WebSearch`.
- **Git identity**: `resolveAuthor` is the `--author`; `assertCommitIdentity`
  (`author.ts`) is the committer check (`GIT_COMMITTER_EMAIL` or the content
  repo's `user.email`), throwing `no_git_identity`.
- **MCP SDK v2** (inspected from the published tarballs 2026-09-13):
  `@modelcontextprotocol/server@2.0.0` and `/client@2.0.0` (only `latest`;
  the v1 monolith `@modelcontextprotocol/sdk` is `1.30.0`). Both are
  `"type": "module"` but dual-published (`require` branches exist), Node
  `>=20`. **No `peerDependencies`**: each depends on `zod ^4.2.0` and
  `@modelcontextprotocol/core 2.0.0` directly; the editor's `zod ^4.3.6`
  satisfies it, so pnpm dedupes to one copy (verify with `pnpm why zod`).
  SDK types import `* as z from "zod/v4"`; in zod 4 the root and `/v4`
  export the same classes, so app code keeps `import { z } from "zod"`
  (T24). Root exports: `McpServer` (`new McpServer({name, version},
{capabilities?, instructions?})`, `.connect(transport)`, `.close()`),
  `InMemoryTransport.createLinkedPair()` (exported from **both** package
  roots; import the pair from one package), `createMcpHandler` and the HTTP
  transports (23e). `registerTool(name, {title?, description?,
inputSchema?, outputSchema?, annotations?, icons?, _meta?}, cb)`:
  `inputSchema` is a **full schema object** (`z.object` / `z.strictObject`);
  the raw-shape `{field: z.string()}` form is `@deprecated` and auto-wraps
  with a non-strict `z.object`. Callback arity is conditional: `(args, ctx)`
  with an `inputSchema`, `(ctx)` without. Return `{content: [{type: "text",
text}], structuredContent?: unknown, isError?: boolean}`;
  `structuredContent` is `unknown` (SEP-2106), not typed from
  `outputSchema`. Unknown keys against a strict input fail the SDK's
  pre-dispatch validation (T28). `@modelcontextprotocol/server/stdio`
  (**subpath, not root**) exports `StdioServerTransport(stdin?, stdout?,
{maxBufferSize?})` and `serveStdio(factory, {legacy?: "serve" | "reject",
transport?, onerror?}) → {close()}` (synchronous; owns the protocol-era
  decision; factory = `(ctx) => McpServer`). `@modelcontextprotocol/client`:
  `new Client({name, version})`, `.connect(transport)`, `.listTools()`
  (auto-paginates), `.callTool({name, arguments})` → `CallToolResult`
  (`isError` for tool-level failures; protocol failures throw);
  `/client/stdio` exports `StdioClientTransport({command, args?, env?,
cwd?, stderr?})` — the way to spawn the real server in a test and prove
  T21 (T29). README caveat: TypeScript ≥ 6 needs `"types": ["node"]`; the
  workspace is on `5.9.3`, so it does not apply.
- **Build/lint/test plumbing.** Editor `tsconfig.json` includes `**/*.ts`
  with `moduleResolution: "bundler"`, so `editor/mcp/*.ts` is typechecked
  with no config change. `.npmrc` has `shamefully-hoist=true`, which is why
  root `test/*.test.ts` already import `zod`/`lmdb` undeclared; an editor
  devDependency on `@modelcontextprotocol/client` resolves from `test/` the
  same way. **`next lint` no longer exists in Next 16.1.6**; CI's lint job
  runs `pnpm exec lint-staged --diff origin/main` at the root (prettier +
  the root flat `eslint.config.mjs`), so new files under `editor/mcp/`,
  `editor/cli/`, `test/` and `.mcp.json` are all linted. No
  `pnpm.overrides`; the lockfile has exactly `zod@3.25.76` and `zod@4.3.6`.
- **zod 4.3.6 semantics.** `z.strictObject(...).extend(shape)` keeps
  strictness and existing checks; `.refine()` returns the same `ZodObject`,
  so `FeaturedInputSchema` can be passed to `registerTool` as-is; spreading
  `.shape` into a new object **drops** refinements. `EpochSchema`'s string
  branch is `z.string().transform(...)`; `z.toJSONSchema` throws
  `"Transforms cannot be represented in JSON Schema"` in the default `io:
"output"` mode and emits the input side under `io: "input"`. Whether
  `tools/list` survives depends on which mode the SDK's converter uses —
  **check after install** (grep `toJSONSchema(` in
  `node_modules/@modelcontextprotocol/core/dist`); the mitigation is under
  Risks.
- **Claude Code `.mcp.json`** (docs fetched 2026-09-13): stdio servers
  inherit the launching process environment (plus `CLAUDE_PROJECT_DIR`);
  `${VAR}` / `${VAR:-default}` expand in `command`, `args`, `env`, `url`,
  `headers`; an unset `${VAR}` with no default is kept as literal text with
  a warning (T27). A project server prompts for approval on first use
  unless listed in `enabledMcpjsonServers` in `.claude/settings.json`.
  Permission patterns: `mcp__recipes` (all tools), `mcp__recipes__recipe_search`
  (one tool). `claude mcp list` / `/mcp` show status.

#### Design (decided)

**D11 Backend resolution (`cli/backend/resolve.ts`, new).**

```ts
export interface BackendOverrides {
  remote?: string;
  contentDir?: string;
  author?: string;
  notify?: boolean;
  editorUrl?: string;
}
export type BackendConfig =
  | { kind: "http"; baseUrl: string; token?: string }
  | {
      kind: "local";
      contentDirectory: string;
      author?: Author;
      notify?: NotifyTarget;
    };
export function resolveContentDirectory(
  flag?: string,
  env = process.env,
): string; // moved from index.ts verbatim (keeps the INIT_CWD comment)
export function resolveNotify(
  notify: boolean,
  editorUrl?: string,
  token?: string,
  env = process.env,
): NotifyTarget | undefined; // moved from index.ts
export function resolveBackendConfig(
  overrides?: BackendOverrides,
  env = process.env,
): BackendConfig;
export function createBackend(config: BackendConfig): CuratorBackend;
export function resolveBackend(
  overrides?: BackendOverrides,
  env = process.env,
): CuratorBackend;
```

Every env read goes through an `envValue(env, name)` that treats **empty
strings as unset** (needed for `${VAR:-}` in `.mcp.json`, T27). `cli/index.ts`
`main()` replaces its inline block with one `resolveBackend({remote:
global("remote"), contentDir: global("content-dir"), author:
global("author"), notify: values.notify === true || headParse.values.notify
=== true, editorUrl: global("editor-url")})` call and drops the two moved
functions and their imports (`resolveNotify` has no other importer). The
config/create split exists so `server.ts` can print its mode banner.

**D12 `listTags` joins the seam.** `CuratorBackend.listTags():
Promise<string[]>`; local → `listTags(ctx)`; http → `GET /api/tags` (new
thin route `src/app/api/tags/route.ts`, `readContext`, answers `{tags}`);
CLI parity command `tags` (`cli/commands/tags.ts`, in `COMMANDS` + USAGE;
`--json` → `{tags}`).

**D13 Registry (`editor/mcp/registry.ts`).** `createRecipeServer(backend,
info?): McpServer` (`name: "recipes"`, editor package version, an
`instructions` paragraph: compact rows, `fields`, error shape, `warnings`).
Exports `TOOL_NAMES`, `compactRow`, `pickRecipe`, `ROW_FIELDS`. Every
`inputSchema` is a `z.strictObject` (an empty one for `tag_list`, so every
callback is `(args)`), one `z` from `"zod"`. Success → `{content: [{type:
"text", text: JSON.stringify(result)}], structuredContent: result}`;
failure → the same over `toErrorObject(error)` with `isError: true`. Write
tools call `backend.afterWrite?.()` and append the returned string to
`warnings: string[]` on the result (merged with `GroupWriteResult.warnings`);
`recipe_import` with `dryRun` skips it. Tool names snake_case, **input keys
camelCase** as in the curation schemas; create/update tools nest the
payload so option flags and the rename `slug` never collide. No
`outputSchema` in 23b.

| Tool                | inputSchema (`z.strictObject`)                     | Backend call → result                              | Annotations        |
| ------------------- | -------------------------------------------------- | -------------------------------------------------- | ------------------ |
| `recipe_search`     | `{query: string.min(1), limit?, offset?, fields?}` | `searchRecipes` → rows `compactRow(fields)`        | readOnly           |
| `recipe_list`       | `{tag?, limit?, offset?, fields?}`                 | `listRecipes` → rows compacted                     | readOnly           |
| `recipe_get`        | `{slug, fields?: string[]}`                        | `getRecipe` → `recipe: pickRecipe(recipe, fields)` | readOnly           |
| `recipe_import`     | `{url, tags?, slug?, name?, dryRun?, overwrite?}`  | `importRecipe(url, opts)`                          | write              |
| `recipe_create`     | `{recipe: RecipeInputSchema, overwrite?}`          | `createRecipe(recipe, {overwrite})`                | write              |
| `recipe_update`     | `{slug, patch: RecipePatchSchema}`                 | `updateRecipe`                                     | write, idempotent  |
| `recipe_delete`     | `{slug}`                                           | `deleteRecipe`                                     | write, destructive |
| `tag_list`          | `{}`                                               | `listTags()` → `{tags}`                            | readOnly           |
| `group_list`        | `{limit?, offset?}`                                | `listGroups`                                       | readOnly           |
| `group_get`         | `{slug}`                                           | `getGroup`                                         | readOnly           |
| `group_create`      | `{group: GroupInputSchema, force?}`                | `createGroup(group, {force})`                      | write              |
| `group_update`      | `{slug, patch: GroupPatchSchema}`                  | `updateGroup`                                      | write, idempotent  |
| `group_set_items`   | `{group, items: GroupItemInputSchema[], force?}`   | `setGroupItems`                                    | write, idempotent  |
| `group_add_item`    | `{group, recipe, label?, note?, force?}`           | `addGroupItem`                                     | write              |
| `group_remove_item` | `{group, recipe}`                                  | `removeGroupItem`                                  | write, idempotent  |
| `group_delete`      | `{slug}`                                           | `deleteGroup`                                      | write, destructive |
| `featured_list`     | `{limit?, offset?}`                                | `listFeatured`                                     | readOnly           |
| `feature`           | `FeaturedInputSchema` as-is (strict + XOR refine)  | `feature(args)`                                    | write              |
| `unfeature`         | `{slug}`                                           | `unfeature`                                        | write, destructive |
| `reindex`           | `{contentType?}`                                   | `reindex`                                          | write, idempotent  |

**D3 as built.** Compact row = `{slug, name, date, tags, totalTime,
image?}`; `fields` on rows ⊆ `description | ingredients | prepTime |
cookTime` (rows carry no `source`; `recipe_get {fields: ["source"]}` covers
it — the D3 divergence). `recipe_get` without `fields` returns the full
`RecipeDetail`.

**D14 Server (`editor/mcp/server.ts`).** CJS under tsx, no top-level await,
never writes stdout: `resolveBackendConfig({}, process.env)` →
`createBackend`; one stderr banner (`recipes MCP: local <dir>` / `remote
<url>`); `serveStdio(() => createRecipeServer(backend), {onerror →
console.error})`; `SIGINT` / `SIGTERM` / stdin `end` + `close` → guarded
`shutdown`: close the handle, `await backend.close()`, `process.exit`.
Scripts: editor `"mcp": "tsx ./mcp/server.ts"`, root `"mcp": "pnpm --filter
recipe-editor mcp"`.

**D10 as built** — `.mcp.json` at the repo root (tracked; `.gitignore` only
covers `.claude/*`):

```json
{
  "mcpServers": {
    "recipes": {
      "command": "pnpm",
      "args": ["--silent", "--filter", "recipe-editor", "mcp"],
      "env": {
        "CONTENT_DIRECTORY": "${CONTENT_DIRECTORY:-}",
        "RECIPE_API_URL": "${RECIPE_API_URL:-}",
        "RECIPE_API_TOKEN": "${RECIPE_API_TOKEN:-}",
        "RECIPE_AUTHOR": "${RECIPE_AUTHOR:-}",
        "RECIPE_EDITOR_URL": "${RECIPE_EDITOR_URL:-}"
      }
    }
  }
}
```

`${VAR:-}` plus D11's empty-means-unset works whether or not the launcher
inherits the shell environment; a bare `${VAR}` would pass the literal
placeholder through when unset (T27). **Default = local mode on
`editor/content`, the real content repo through the symlink** — every smoke
run and test must export a scratch `CONTENT_DIRECTORY`. Also add
`"enabledMcpjsonServers": ["recipes"]` to `.claude/settings.json` beside the
existing skill allows (pre-approves the project server; the 23f skill
depends on it). Skill frontmatter is untouched until 23f.

#### Tests

**`test/mcp.test.ts`** (`// @vitest-environment node`; per-test `mkdtemp`,
`CONTENT_DIRECTORY` set/restored, `afterEach`: `client.close()`,
`server.close()`, `backend.close()`, `rm`). Setup: `createLocalBackend({
contentDirectory})` → `createRecipeServer(backend)` →
`InMemoryTransport.createLinkedPair()` (import the pair and `Client` from
`@modelcontextprotocol/client`) → `client.connect`. Cases:

1. `listTools` names equal `TOOL_NAMES`; `recipe_create`'s schema has
   `additionalProperties: false` and `recipe.properties.name`;
   `recipe_search` `readOnlyHint`, `recipe_delete` `destructiveHint`.
2. `recipe_create` (name, tags `["Dessert"]`, description, ingredients,
   totalTime) → slug; `warnings` carries the stale-editor hint;
   `recipe_search {query}` rows are compact (no `description`); `fields:
["description", "ingredients"]` adds both.
3. `recipe_list` compact; `fields: ["prepTime"]`; `tag: "dessert"` filters.
4. `recipe_get` full detail; `fields: ["name", "tags"]` → exactly those keys.
5. Errors: unknown slug → `isError`, `error.code === "not_found"`, `slug`;
   duplicate create → `slug_conflict`; `feature {group: "ghost"}` →
   `unknown_group` (a curation-only failure, guaranteed `toErrorObject`
   shape); unknown key `{recipe: {name: "x", bogus: 1}}` → pin whatever the
   SDK answers (T28).
6. Christmas-Cookies shape end-to-end: `group_create` → `group_add_item`
   (label) → `feature {group, slug: "xmas"}` (explicit slug, T26) →
   `featured_list` row has `group` + `name` → `group_get` items resolved
   with `name`; `group_add_item` unknown recipe → `unknown_recipe`; with
   `force` → `warnings` has both the unknown-recipe line and the hint.
7. `tag_list` → `{tags: ["dessert"]}`; empty dir → `{tags: []}`.
8. `group_update {slug, patch: {slug: "xmas-cookies", description}}` → new
   slug, old → `not_found`; `patch: {items: []}` → `validation` / T28 shape.
9. `recipe_delete` → `{slug, deleted: true}`; `unfeature` → deleted,
   `featured_list.total === 0`.
10. `reindex {}` → `rebuilt` non-empty; `reindex {contentType: "bogus"}` →
    `not_found`.
11. `resolveBackendConfig` unit cases: empty env → local at
    `getContentDirectory()`; `RECIPE_API_URL: ""` → local; set → http with
    token; override beats env; relative `CONTENT_DIRECTORY` resolves against
    `INIT_CWD`.

**`test/mcpStdio.test.ts`** (node env, one seeded tmpdir in `beforeAll` via
`createContent` + `closeCachedEnvironments()`, 60 s timeouts): `new
StdioClientTransport({command: "pnpm", args: ["--silent", "--filter",
"recipe-editor", "mcp"], cwd: <repo root>, env: {PATH, HOME,
CONTENT_DIRECTORY}, stderr: "pipe"})` (T29); `listTools` equals
`TOOL_NAMES`; `recipe_list {}` → `total 1`, compact row; `afterAll` closes
the client (stdin end → server exits) and removes the tmpdir. This is the
T21 proof: a stray stdout byte anywhere in the import graph breaks the
handshake. Include captured stderr in the failure message.

Also: `test/cliJson.test.ts` gains `tags --json` → `{tags: []}`;
`api-write.spec.ts`'s public-reads case gains `GET /api/tags` → `{tags:
["bread"]}`.

#### Gates

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                      # 454 at base + new cases
pnpm exec lint-staged --diff main         # what CI's lint job runs
pnpm --filter recipe-editor e2e-dev -- api-write.spec.ts     # detached: setsid nohup … > log 2>&1 &; strip ANSI; T14 cleanup
grep -rn "console.log\|process.stdout" websites/recipe-website/editor/{controller,cli,mcp} websites/recipe-website/common/controller packages/cms --include='*.ts' | grep -v node_modules
# expected: only cli/output.ts and the two --help writes in cli/index.ts
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"x","version":"0"}}}' \
  | CONTENT_DIRECTORY=<scratch dir> pnpm --silent --filter recipe-editor mcp 2>/dev/null | head -c 400
# expected: exactly one JSON-RPC frame, nothing else on stdout
```

Then CI on the draft PR (lint, both typechecks, unit, Playwright shards).
Headless smoke if the `claude` CLI is usable: `CONTENT_DIRECTORY=<scratch
copy of playwright/fixtures/test-content/three-recipes-groups> claude -p
--mcp-config .mcp.json --strict-mcp-config --allowedTools "mcp__recipes"
"search recipes for 'week' and list the groups"`; otherwise the interactive
smoke is the user's and the close-out says so.

#### Risks → mitigations

- **`EpochSchema` transform vs `tools/list`**: if the SDK converts with
  `io: "output"`, define a registry-local `WireEpoch = z.union([z.int(),
z.string()])` and `extend({date: WireEpoch.optional()})` on the four
  unrefined schemas (strictness survives `extend`); rebuild
  `FeaturedInputSchema` with the same XOR refine. The backend re-parses with
  the real `EpochSchema`, so semantics are unchanged. Detector: test case 1.
- **Two error shapes** (T28): SDK-level input rejection is not
  `toErrorObject`; the `validation`-shaped tests use curation-only failures.
- **pnpm spawn under vitest / tsx startup**: `cliJson.test.ts` already
  spawns pnpm in CI; only the two-case stdio suite spawns.
- **CJS/ESM**: tsx runs the editor as CJS and takes the SDK's `require`
  branch; vitest is ESM throughout. Never add `"type": "module"` or `.mts`.
- **zod duplication**: lockfile check after install; even with two copies
  `toErrorObject`'s `instanceof ZodError` sees the curation layer's own zod.
- **Real content dir by default**: every smoke/test sets `CONTENT_DIRECTORY`
  to a tmpdir or scratch copy.
- **Shutdown**: stdin `end`/`close` listeners drive `backend.close()` even
  if `serveStdio`'s handle semantics differ; double-shutdown guard.

#### Not in 23b

Nested groups (23c), git tools (23d), the HTTP transport (23e), the skill
rewrite and the acceptance test (23f), `outputSchema`s, base64 image upload
(Deferred), the parked pie-iron content task.

#### Decisions and close-out (2026-09-13)

- [x] D11: `cli/backend/resolve.ts` is the one mode resolver; `cli/index.ts`
      `main()` is a single `resolveBackend({…})` call. Empty env strings are
      unset (T27). `resolveNotify` treats `--editor-url ""` the same way.
- [x] D12: `listTags` on the seam (local + http), `GET /api/tags` → `{tags}`,
      CLI `recipes tags` (`--json` → `{tags}`).
- [x] D13: `mcp/registry.ts` registers the twenty tools in the table, every
      input a `z.strictObject`, results and errors in the shapes above.
- [x] D14: `mcp/server.ts` + scripts `mcp` (editor and root); `.mcp.json`
      verbatim from D10 as built; `"enabledMcpjsonServers": ["recipes"]` in
      `.claude/settings.json`.
- [x] SDK converter uses `io: "input"` (both `tools/list` sites in
      `@modelcontextprotocol/server` call `standardSchemaToJsonSchema(schema,
"input")`), so `EpochSchema`'s transform is fine and the `WireEpoch`
      mitigation was **not** needed; `date` publishes as `anyOf [integer,
string]`.
- [x] T28 pinned: the SDK answers schema rejections as `{content: [{type:
"text", text: "Input validation error: Invalid arguments for tool
recipe_create: recipe: Unrecognized key: \"bogus\""}], isError: true}`
      — no `structuredContent`, no `error.code`. `group_update {patch:
{items: []}}` lands in the same shape.
- [x] zod: lockfile still has exactly `zod@3.25.76` and `zod@4.3.6`; every
      MCP snapshot resolves `zod 4.3.6`; no `pnpm dedupe` needed.
- [x] Headless smoke run recorded below; the interactive Claude Code run is
      the user's.

**Review (Fable).** Read the full diff; no correctness changes needed. The
registry is a faithful wrapper: payload schemas are imported unchanged from
`curation/schema.ts`, so a tool cannot accept what the API refuses; `write()`
runs `afterWrite` only after a write that happened (and never for a `dryRun`
import); `server.ts` never touches stdout and closes LMDB before exit with a
double-shutdown guard. `pnpm add` alphabetised the editor's `dependencies`
block — cosmetic, left as is. Reviewer reran every gate (below) plus the
headless smoke.

**Gate results (verbatim, reviewer rerun in the worktree):**

| Gate                                                  | Result                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter recipe-editor typecheck`               | clean                                                                                                                                                                         |
| `pnpm --filter recipe-website exec tsc --noEmit`      | clean                                                                                                                                                                         |
| `pnpm exec vitest run`                                | `Test Files 27 passed (27)` · `Tests 474 passed (474)` (454 at base, +20: 17 `mcp`, 2 `mcpStdio`, 1 `cliJson`)                                                                |
| `pnpm exec lint-staged --diff main`                   | clean (prettier + eslint)                                                                                                                                                     |
| stdout grep                                           | only `cli/output.ts` and the two `--help` writes (plus a comment in `mcp/server.ts` and the script-only `log` default)                                                        |
| `initialize` frame over `pnpm --silent … mcp`         | exactly one JSON-RPC frame on stdout; stderr `recipes MCP: local <scratch>`; scratch dir untouched                                                                            |
| `pnpm e2e-dev -- api-write.spec.ts` (dev mode)        | reviewer rerun: `14 passed (51.2s)`, 0 failed, 0 flaky (implementer: `14 passed (52.8s)`)                                                                                     |
| Headless smoke (`claude -p --mcp-config .mcp.json …`) | `subtype: success`, 4 turns, 7.3 s: `recipe_search {query: "week"}` → 0 rows; `group_list` → `week-of-may-4`, `weeknight-favourites` (scratch copy of `three-recipes-groups`) |
| CI on the draft PR                                    | green on `832f4d9b`: lint, both typechecks, unit, CMS demo (dev, prod), Portfolio, recipe shards 1–4, merged reports (run 34762488216)                                        |

**Implementer notes (divergences from the design above, and why).**

- **`ROW_FIELDS` is a closed `z.enum`** (`description | ingredients |
prepTime | cookTime`), so the published JSON Schema documents the choice
  and a typo is a schema error. `recipe_get`'s `fields` stays free strings
  because `Recipe` has an index signature (`source`, `videoUrl`, …).
- **`compactRow` omits undefined keys** rather than emitting `tags:
undefined`; identical after JSON serialisation and cheaper.
- **`reindex` folds the `afterWrite` hint** like every other write tool
  (the CLI's `reindexCommand` is `write: true`); only a `dryRun` import
  skips it.
- **`resolveBackendConfig` always sets `token` / `author` / `notify` keys**
  (possibly `undefined`) rather than conditionally spreading;
  `exactOptionalPropertyTypes` is off and the unit tests `toEqual` the
  explicit shape.
- **`test/mcp.test.ts` has 17 `it()`s for the doc's 11 cases**: case 5 split
  into curation errors vs. the T28 shape, case 6 into the happy path vs. the
  `force` path, case 11 into five `resolveBackendConfig` cases in their own
  `describe` (outside the `CONTENT_DIRECTORY`-mutating harness). The stdio
  suite also asserts the stderr banner.
- **The tool callback must return the SDK's `CallToolResult` type**, not a
  structurally equal local interface: `registerTool`'s callback returns
  `CallToolResult | InputRequiredResult`, and a hand-rolled shape resolves
  against the latter and fails on a missing `resultType`.
- **The vitest alias `discontent/fs/getContentDirectory` in
  `vitest.config.js` is dead**: the real specifier is
  `@discontent/cms/fs/getContentDirectory`, which the prefix alias never
  matches, and the real module loads fine under vitest. Worth a separate
  cleanup; untouched here.

### PR 23c — Nested groups `agent/23c-nested-groups` ✅ done (← 23b)

Stacked off `agent/23b-mcp-stdio` at `1318fcf5`; rebase onto `main` after
#138 merges (T20: retarget the child before deleting the parent branch).
Decided with the user 2026-09-13: the browser group form preserves
sub-group rows read-only (no picker in 23c); sub-group renames/deletes
leave parents dangling (the D3 rule; F32 stays deferred).

#### Facts (validated 2026-09-13 on `agent/23b-mcp-stdio`; paths under `websites/recipe-website/`)

- **Types** `common/controller/types.ts:172-178` `GroupItem {recipe: string;
label?; note?}`; `:223` `GroupEntryValue.items: Pick<GroupItem, "recipe" |
"label">[]` (`note` excluded, pinned by `test/groups.test.ts:380`).
  `buildGroupIndexValue.ts:28` maps `({recipe, label}) => ({recipe, label})`.
- **Derived state**: `groupPaginationConfig.ts:39-70` `groupsByDate` v"2"
  projects `{slug, date, name, kind, image, itemCount}` only (no items).
  `groupAggregateConfigs.ts:40-96` `groupsByRecipe` "by-recipe" v"1": fold
  keyed on `item.recipe` (skips falsy), one entry per item; reader
  `data/readGroupsByRecipe.ts`; consumer `View/AppearsIn.tsx` (recipe page
  only). The group page has no Appears-in. `groupContentConfig.ts:61`
  `aggregates: [groupsByRecipe]`.
- **Render**: `data/resolveGroupItems.ts:29-38` → `{item, recipe: Recipe |
null}` via `recipeItems.read`, shared by both apps' `group/[slug]` and
  `featured-recipe/[slug]` pages. `GroupDetailPage/index.tsx:65-67` "n
  recipes", `:118` empty text; `GroupItems.tsx` renders `RecipeListItem`
  (mounts a BookmarkButton — wrong for a group) or `group-item-missing`.
  `List/FeaturedRecipe/GroupCard.tsx` is the bookmark-free group card.
  `GroupThumbnail/index.tsx:84-92` member walk skips items without
  `.recipe`, `MEMBERS_WALKED = 6`, `data-group-image` ∈ {own, member}.
  `List/Group/index.tsx:95` chip "n recipes".
  `FeaturedRecipeDetailPage/index.tsx:79-99` duplicates the count/empty text
  and passes `items={group.items}` to `GroupThumbnail`.
- **Search**: `data/readGroupSearchCorpus.ts:55-114` builds
  `GroupSearchEntry.recipes` from `items[].recipe` (data files, deduped);
  `SearchContext.tsx:382-395` decorates recipes; `queryLanguage.ts:531`
  evaluates `group:`. `GroupResults.tsx:44` builds a `GroupListEntry` by
  hand. CLI `search group:` is a pre-existing no-op
  (`curation/search.ts:60-78` filters rows that never carry `groups`) —
  out of scope, recorded under Deferred.
- **Curation** `editor/controller/curation/groups.ts`: `getGroup :115-143`
  (recipe-only resolve; `ResolvedGroupItem extends GroupItem {name?,
missing?}` `:58-63`), private `checkRecipes :177-198`, `createGroup :216`,
  `setItems :425`, `addItem(ctx, slug, recipe, {label, note, force})
:442-467` (append, duplicates allowed), `removeItem(ctx, slug, recipe)
:470-491` (drops every matching row, `not_found` if none).
  `schema.ts:153-163` private strict `GroupItemObjectSchema`,
  `GroupItemInputSchema = union(string, object)`, `toGroupItems :256-276`
  filters on `item.recipe`. `errors.ts`: `UnknownGroupError :86-95` has no
  `--force` sentence and `test/curationHttp.test.ts:105` asserts that for
  the featured case; `CurationErrorDetails {slug?, issues?, recipes?,
groups?}`; `http.ts:31-52` `statusFor` exhaustive (T25);
  `cli/backend/http.ts:93-124` `rehydrate` copies `groups`;
  `test/curationHttp.test.ts:36-47` exhaustive `Record<CurationErrorCode,
number>`.
- **Seam/API/CLI/MCP**: `cli/backend/types.ts:84-93` `addGroupItem(group,
recipe, opts)`, `removeGroupItem(group, recipe)`, `setGroupItems(group,
items: unknown, opts)`; http `:263` builds `/api/group/<g>/items/<recipe>`,
  `call` drops undefined `query` values. `api/group/[slug]/items/route.ts:18-22`
  has its own strict `{recipe, label?, note?}` schema;
  `items/[recipe]/route.ts` DELETE keyed on the segment.
  `cli/commands/group.ts`: `create --item slug[:label] | --file`, `add
<group> <recipe>`, `remove <group> <recipe>`, `show :262-269`;
  `cli/index.ts` USAGE `:116-125`. `mcp/registry.ts`: `group_set_items`
  imports `GroupItemInputSchema` (free upgrade), `group_add_item :483-500`
  (`recipe: Slug` required), `group_remove_item :503-512`, `group_get`
  description `:422`, instructions list the codes `:226`.
- **Form**: `editor/controller/parseGroupFormData.ts:14-18,53,56` requires
  `recipe` and would drop or crash on a `{group}` row; the form submits the
  full array and `actions/groups.ts:38-78` spreads it, so an unwidened
  parser silently deletes sub-groups on re-save. `Form/Group/index.tsx` rows
  `group-item-row`, legend "Recipes", "Add recipe", aria "Remove recipe N"
  (matched by `groups.spec.ts:618`). `Form/inputs/GroupSelect/` exists
  (featured form) — not wired here in 23c.
- **Tests**: `test/specVersions.test.ts:109,124` inline snapshots (hash +
  versions) for both group config modules;
  `test/revalidateDerived.test.ts:112,224` `toEqual` tag lists containing
  `aggregate:groups:by-recipe` (`:252` `toContain`);
  `test/exportStaticParams.test.ts:70` mocks `readGroupsByRecipe`;
  `test/derivedPaths.test.ts` is directory-level (no change for a new
  aggregate). Playwright `groups.spec.ts` uses
  `resetData("three-recipes-groups")` (hand-authored fixture, `.mdb`
  committed; regen `pnpm tsx scripts/build-fixture-indexes.ts` from
  `editor/`, which **skips a fixture lacking `groups/index/`**). Only that
  fixture has groups; many specs count its two groups.

#### Design (decided)

D15 (item refs and naming per surface), D16 (derived state: `groupsByDate`
v3 with `groupCount`, `by-recipe` unchanged at v1, new `by-group` v1 from a
shared factory, direct-parents Appears-in on both pages), D17 (validation:
`checkItems`, `group_cycle`, `getGroup` resolving sub-groups, dangling on
rename/delete) and D18 (rendering, thumbnail collector, transitive search
corpus, read-only form rows) in the decisions log are the design; the
amended D6 records the divergences from the seed.

#### Steps (Opus implementer, in order)

1. Types + `buildGroupIndexValue` + `groupPaginationConfig` v3 +
   `groupAggregateConfigs` factory / `groupsByGroup` + `groupContentConfig`
   aggregates + `readGroupsByGroup.ts`. Convert the two `interface … extends
GroupItem` (`curation/groups.ts:58`, `Form/Group/index.tsx:30`) to `type`.
2. Errors (`group_cycle`, `UnknownGroupError` force hint) + `statusFor` +
   `curationHttp` table. Schema (`GroupItemObjectSchema` export, XOR,
   `toGroupItems`).
3. Curation (`checkItems`, `assertNoCycle`, `getGroup`, `addItem`,
   `removeItem` by ref; commit messages name `group <slug>`).
4. Seam + local/http backends + the two API routes + CLI (`--group-item`,
   `--group`, `show` lines, USAGE) + MCP (`subgroup`, descriptions,
   instructions).
5. Render (`resolveGroupItems`, `GroupItems`, `GroupCard` props,
   `groupCountLabel`, `GroupDetailPage` + `FeaturedRecipeDetailPage` counts
   and `GroupAppearsIn`, `AppearsInList` split, `GroupThumbnail` collector,
   list chip, `GroupResults`). Search corpus. Form parser + row.
6. Fixture `editor/playwright/fixtures/test-content/nested-groups` = copy of
   `three-recipes-groups` + `groups/data/spring-menus/group.json` (`{name:
"Spring Menus", date: 1778112000000, kind: "collection", description: "Two
weeks of menus.", items: [{group: "week-of-may-4", label: "Week 1"},
{recipe: "third-recipe"}]}`), then **after steps 1–5** regen with the
   script (T33); `git status` must show only the two group fixtures'
   `groups/*` moving. `three-recipes-groups` data files untouched.
7. Tests, then gates; report divergences and the T28-shaped outputs.

#### Tests

Updates forced by the change: `specVersions` snapshots (`-u` for the two
group blocks only: pagination `["3"]`, aggregates `["1", "1"]`);
`revalidateDerived.test.ts:112,224` gain `aggregate:groups:by-group` after
`by-recipe`; `exportStaticParams.test.ts` adds a `vi.mock` for
`readGroupsByGroup`; `curationHttp` table gains `group_cycle: 422`.
`groups.spec.ts` existing cases stay green (fixture unchanged).

New vitest: `test/groups.test.ts` (index value stores `{group, label}` and
no `recipe`; `groupsByGroup` maps child → parents newest-first, `{group}`
items contribute nothing to `groupsByRecipe`, `rebuildIndex` reproduces it;
`groupCount` projected). `test/curation.test.ts` `describe("groups")`
(create with `{group}` → `getGroup` item `{group, label, name, kind}`;
missing sub-group → `missing`; unknown sub-group → `unknown_group` with
`--force` in the message, forced → `"Unknown group: ghost"`; self-reference
at create (explicit slug) and via `addItem` → `group_cycle` `groups: [slug,
slug]`, force does not bypass; a→b then `addItem(b, {group: "a"})` → path
`["b", "a", "b"]`; three-level via `setItems`; `removeItem` by `{group}`
leaves recipe rows and vice versa, `not_found` when absent). `curationHttp`:
`GroupCycleError` → 422 body `{code, groups}`; featured `unknown_group`
still has no `--force`. `test/mcp.test.ts`: `group_add_item {subgroup}` →
`group_get` shows `{group, name, kind}`; `group_remove_item {subgroup}`;
cycle → `group_cycle`; XOR miss → SDK shape (T28/T37); `group_set_items`
with a `{group}` object. `cliJson`: optional `group add <g> --group <sub>
--json`.

Playwright `groups.spec.ts` new `describe("nesting")` on
`resetData("nested-groups")`: (1) `/group/spring-menus` has 2 `group-item`s,
the first is `group-item-group` "Week of May 4" with label "Week 1" linking
to `/group/week-of-may-4`, count "1 recipe, 1 group", click-through shows 3
items; (2) `/group/week-of-may-4` `appears-in` lists "Spring Menus" + "Week
1", `/group/weeknight-favourites` has none, `/recipe/first-recipe`
Appears-in does **not** list Spring Menus; (3) `/groups` shows 3 cards
newest-first, the Spring Menus chip reads "1 recipe, 1 group" and its
`group-thumbnail` is `data-group-image="member"` with the `week-of-may-4`
own-image src; (4) `group:spring-menus` search returns First/Second/Third
Recipe; (5) edit-form re-save keeps the sub-group row ("Group 1:
week-of-may-4", "Remove group 1"; change Label → the detail page shows it);
(6) removing the row through the form drops the item and the child's
Appears-in. `api-write.spec.ts` on `nested-groups`: POST
`/api/group/week-of-may-4/items {group: "spring-menus"}` → 422 `group_cycle`
with the path; `{group: "week-of-may-4"}` → 422; `{group: "ghost"}` → 422
`unknown_group`, `?force=1` → 200 + warning and the page shows "Group not
found: ghost"; `DELETE …/items/week-of-may-4?kind=group` → 200; without
`?kind=group` → 404.

#### Gates (in `.claude/worktrees/agent-23c`)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                      # 474 at base + new cases
pnpm exec lint-staged --diff agent/23b-mcp-stdio
pnpm --filter recipe-editor e2e-dev -- groups.spec.ts api-write.spec.ts   # detached: setsid nohup … > log 2>&1 &; strip ANSI; T14 cleanup
CONTENT_DIRECTORY=<scratch copy of nested-groups> pnpm --filter recipe-website build   # export renders nested thumbnails (T35)
```

Then CI on the draft PR. Smoke (Fable): `CONTENT_DIRECTORY=<scratch
nested-groups> claude -p --mcp-config .mcp.json --strict-mcp-config
--allowedTools "mcp__recipes" "add the collection 'Holiday' containing
spring-menus, then try to add holiday inside week-of-may-4 and report the
error"` → expects a `group_cycle` refusal.

#### Risks → mitigations

T30–T40 in the trap list: self-reference ordering (T30), dangling parents
on rename/delete (T31/T32), fixture regen ordering (T33), `groupCount ?? 0`
(T34), bounded thumbnail recursion proven by the export build (T35),
order-sensitive revalidate tags (T36), XOR failures in the SDK shape (T37),
the form's missing cycle check (T38), `codeForStatus(422)` (T39), the
unconditional `label` key (T40).

#### Not in 23c

Git tools (23d), HTTP transport (23e), skill rewrite incl. `--group-item`
docs (23f), a group picker in the form, transitive Appears-in, rewriting
parents on rename (needs F32), CLI `search group:` (pre-existing no-op →
Deferred), the parked pie-iron task.

#### Verification

A group containing a group renders both levels (`/group/spring-menus` shows
the meal-plan card and its own recipe); adding a cycle through the API or
`group_add_item` returns `group_cycle`; `group:spring-menus` search includes
the nested meal plan's recipes; fixture index versions bumped and
`specVersions` snapshots updated.

#### Decisions and close-out (2026-09-13)

Commits on `agent/23c-nested-groups`: `9a8bf253` (this design),
`27b6e07c` (implementation, 67 files, +1977 −326), the close-out. Draft PR
#139 against `agent/23b-mcp-stdio`; retarget to `main` after #138 merges
(T20).

- [x] D15: `GroupItemRef` / `GroupItem` union, `GroupEntryItem`,
      `GroupItemObjectSchema` exported with the XOR refine, `toGroupItems`
      filter on `recipe || group`; seam `addGroupItem(group, ref, opts)` /
      `removeGroupItem(group, ref)`; `POST …/items` parses the shared schema
      (route copy deleted); `DELETE …/items/<slug>?kind=group`; CLI
      `--group-item`, `group add|remove <g> (<recipe> | --group <sub>)`; MCP
      `subgroup` on `group_add_item` / `group_remove_item`, `group_set_items`
      takes `{group}` through the shared schema.
- [x] D16: `groupsByDate` v"3" with `groupCount`; `appearsInAggregate`
      factory, `by-recipe` still v"1" (and its fixture `data.mdb` did not
      move — T41), `by-group` v"1"; `readGroupsByGroup.ts`; `GroupAppearsIn`
      over a sync `AppearsInList`; direct parents only.
- [x] D17: `checkItems` in the four-pass order, `assertNoCycle` DFS over
      `groups/data` with `MAX_GROUP_DEPTH = 32`, `GroupCycleError` →
      `group_cycle` (422, `details.groups` = path), `UnknownGroupError`
      `{forceHint}`; `getGroup` resolves `{group}` items to `{name, kind}` or
      `missing`.
- [x] D18: `resolveGroupItems` `{item, recipe, group}`; `GroupItems` renders
      the `GroupCard` silhouette with `testId="group-item-group"`;
      `groupCountLabel`; "This group has nothing in it yet."; `GroupThumbnail`
      depth-first collector (`GROUPS_DEEP = 4`); transitive search corpus;
      `parseGroupFormData` widened, read-only `group-item-group-row`.
- [x] Fixture `nested-groups` (T33 order respected; only the two group
      fixtures' `groups/*` moved), `specVersions` snapshots: pagination
      `"2" → "3"`, aggregates `["1"] → ["1", "1"]`.
- [x] T28/T37 pinned: an XOR miss on `group_add_item` (both, or neither)
      answers in the SDK shape with no `structuredContent`; the text is
      "Input validation error: Invalid arguments for tool group_add_item:
      recipe: Name exactly one of `recipe` or `subgroup`". A cycle answers
      with code `group_cycle`, the path in `groups` (`["week-one",
"spring-menus", "week-one"]`) and the message "That would put a group
      inside itself: week-one → spring-menus → week-one."

**Review (Fable).** Read the full diff; no correctness changes needed. The
cycle check runs before any write and never under `--force`; the index value
keeps `label` unconditional and spreads `recipe`/`group` so pre-23c values
re-index to their stored bytes (the `by-recipe` fixture file not moving is
the proof); the two API routes and the http backend send byte-identical
requests for recipe rows; the form's hidden `items[i].group` input is what
keeps a re-save from deleting sub-groups. Reviewer reran every gate (below)
plus the headless smoke.

**Gate results (verbatim, reviewer rerun in the worktree):**

| Gate                                                     | Result                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter recipe-editor typecheck`                  | clean                                                                                                                                                                                                                                                                                       |
| `pnpm --filter recipe-website exec tsc --noEmit`         | clean                                                                                                                                                                                                                                                                                       |
| `pnpm exec vitest run`                                   | `Test Files 27 passed (27)` · `Tests 488 passed (488)` (474 at base, +14)                                                                                                                                                                                                                   |
| `pnpm exec lint-staged --diff agent/23b-mcp-stdio`       | clean (prettier + eslint)                                                                                                                                                                                                                                                                   |
| stdout grep                                              | unchanged from 23b: `cli/output.ts`, the two `--help` writes, a comment in `mcp/server.ts`, the script-only `log` default                                                                                                                                                                   |
| `pnpm e2e-dev -- groups.spec.ts api-write.spec.ts` (dev) | reviewer rerun: `41 passed (2.6m)`, 0 failed, 0 flaky (implementer: `41 passed (2.3m)` after fixing two of its own new assertions)                                                                                                                                                          |
| Export build on a scratch `nested-groups` (T35)          | `Compiled successfully`, `/group/spring-menus` prerendered with one `group-item-group` card and "1 recipe, 1 group"; `groups.html` Spring Menus thumbnail `data-group-image="member"` with the `week-of-may-4` own image; variants under `transformed-images/uploads/group/week-of-may-4/…` |
| Headless smoke (`claude -p --mcp-config .mcp.json …`)    | `subtype: success`, 6 turns, 19.7 s: `group_create` Holiday `{group: "spring-menus"}` written to the scratch dir; `group_add_item {group: "week-of-may-4", subgroup: "holiday"}` refused with `group_cycle`, path `week-of-may-4 → holiday → spring-menus → week-of-may-4`                  |
| CI on the draft PR                                       | green on `2c02938e`: lint, both typechecks, unit (run 34795009282). The recipe Playwright shards, CMS demo and Portfolio jobs run only on PRs to `main`, so they run after #139 is retargeted (T20)                                                                                         |

**Implementer notes (divergences from the design above, and why).**

- **`appearsInAggregate` takes a named-argument object**, not
  `(name, version, keyOf)`: `specVersions` greps the source for
  `version: "…"`, so a positional `"1"` would declare zero versions (T43).
- **`GroupItem` is a distributed intersection** (`WithItemText<GroupItemRef>`),
  not the literal `GroupItemRef & {label?, note?}`: `(A | B) & C` does not
  narrow, and four sites failed on `item.recipe` being `string | undefined`.
  Values are identical.
- **Narrowing is `item.group !== undefined`**, not truthiness, where the
  type matters: `{group: string}` includes `""`. Truthiness stays where only
  behaviour matters (`buildGroupIndexValue`, the folds, the collector).
- **`GroupListEntry.groupCount` is optional** (`groupCount?: number`): T34's
  `?? 0` is only meaningful if the field can be absent on a v2-projected row.
  `project` always writes it.
- **`MissingCard`** is one local component in `GroupItems.tsx` rather than
  two copies of the dashed box; markup and testid are byte-identical.
- **`describeRef`** names the target in commit messages and the `not_found`
  message (`Add group x to group: y`, `…has no item for group x`), so a slug
  in both namespaces reads right.
- **The `cliJson` case is the cycle** (`group add week-one --group week-one
--json` → exit 1 + `group_cycle`), not a happy-path add: the file's other
  cases assert exactly one group exists, so a writing case would couple to
  test order.
- **`group-card-link` is `List/Group`'s testid**, not the nested card's: the
  nested card is `List/FeaturedRecipe/GroupCard`'s silhouette over
  `RecipeCardLink`, which stamps none; the spec clicks it by role.
- **Fixture regen churn** (T41) reverted by hand; **`lint-staged --diff`
  reverts an interleaved `prettier --write`** (T42).

**Post-close-out fix (2026-09-14).** `8a6618ea` on `agent/23c-nested-groups`
tracks `nested-groups/groups/` (data, index, pagination, aggregates) and adds
its `.gitignore` negation — the fixture had been committed without its
groups (T51); found by 23d's `api-write.spec.ts` run. Cherry-picked onto 23d
as `87c96e17`.

**Verification (epic line for 23c):** met — `/group/spring-menus` renders
the meal-plan card and its own recipe; the API, the CLI and `group_add_item`
all return `group_cycle` for a cycle; `group:spring-menus` search returns
First, Second and Third Recipe; index versions bumped and `specVersions`
snapshots updated.

### PR 23d — Git seats `agent/23d-git-seats` ✅ done (← 23c)

Branch `agent/23d-git-seats` off `agent/23c-nested-groups` at `d57e598d`
(the stack is #138 → #139 → 23d; the merge/retarget/rebase of each parent
stays the user's housekeeping, T20). Workflow unchanged: Fable plans and
reviews, an Opus subagent implements in `.claude/worktrees/agent-23d`, this
section is the handoff, the user merges. Never push `main`, never
force-push, never merge.

#### Facts (validated 2026-09-13 on `agent/23c-nested-groups` at `d57e598d`; paths under `websites/recipe-website/editor/` unless noted)

- **Git actions live in two `"use server"` files.** `controller/actions/sync.ts`
  (507 lines): private, already-pure helpers `getGit :24`, `normalizeError
:28`, `mergeInProgress :49` (`.git/MERGE_HEAD`), `labelForPath :53-64`,
  `toSummary :66` (`{hash, message, author_name, date}`), `readSyncStatus
:89-149` (`git.status()`, `getRemotes(true)`, `branchLocal()`, `log({maxCount:
31})`), `doFetch :156`, `doPull :162-205` (`pull --no-rebase --no-edit`),
  `doPush :207-235` (tracking → `push`; else `push -u <remote> <branch>`;
  rejection regex `/rejected|non-fast-forward|fetch first/i` → "Push rejected —
  …"), `doSync :237`. Exported actions: `getSyncStatus :152`,
  `remoteCommandAction :277`, `resolveConflict :336`, `commitMerge :371`,
  `abortMerge :405`, `commitWorkingChanges :430`, `getCommitDiff(hash) :459`
  (validates `/^[0-9a-f]{7,40}$/i`, `git.show([hash])`, truncates at
  `MAX_DIFF_CHARS = 50_000` with "… diff truncated …", returns errors as the
  diff string), `getCommitLogPage(offset) :484` (`log({maxCount: 31,
"--skip": offset})`, `LOG_PAGE_SIZE = 30`). Every one calls
  `getContentDirectory()` directly (T16) and `auth()`; DTOs are imported
  **from the page directory** `src/app/(editor)/(settings)/git/types.ts`
  (`CommitSummary`, `RemoteSummary`, `BranchInfo`, `ConflictFile`, `MergeState`,
  `SyncStatus`, `CommitLogPage`). `controller/actions/index.ts`: `createRemote
:323`, `createBranch :370`, `branchCommandAction :429`, `initializeContentGit
:477` (`.gitignore` from `derivedContentPaths(recipeContentTypes)`),
  `rebuildRecipeIndex :258` (recipes + featured only), **`rebuildAllIndexes
:314-321`** (loops `recipeContentTypes` with `cascadeDependents: false`, then
  `revalidateDerivedState(recipeContentTypes)`) — D7's `onBulkChange` target.
- **`labelForPath` has a stale branch**: `recipes/data/<slug>/(.+)` for uploads,
  but uploads live at `uploads/recipe/<slug>/uploads/<file>`; only the
  `recipe.json` and `uploads/(.+)` branches fire. Fix in passing (23d owns the
  path rule).
- **Author**: session email as both name and email (`sync.ts:394,447`,
  `apiContext.ts:38`). `curation/author.ts`: `parseAuthor :31`,
  `resolveAuthor :45`, `assertCommitIdentity :52-67` (reads `user.email` via
  `getConfig`, or `GIT_COMMITTER_EMAIL`; throws `NoGitIdentityError`, code
  `no_git_identity` → 500); only `cli/backend/local.ts:81` calls it (routes
  deliberately do not, `author.ts:14-17`).
- **`packages/cms/git/commit.ts`**: `directoryIsGitRepo :6`, `commitChanges
:15` (`git.add(paths ?? "./*")` + `commit(message, {"--author": "Name
<email>"})`), `commitContentChanges :43` — **silent no-op when not a repo**;
  callers pass engine-relative `touchedPaths`. `simple-git ^3.30.0` in both
  `packages/cms` and the editor. The curation boundary test
  (`test/curation.test.ts:1112-1129`) already allows `simple-git` and
  `@discontent/cms/git/commit`.
- **Push is manual today** (22-D11, `docs/agent-curation.md:186`, backlog
  row, skill "Never push"); no credential handling, ambient helper/agent.
- **Content paths** (`common/controller/*ContentConfig.ts`): recipes
  `recipes/data/<slug>/recipe.json` + `uploads/recipe/<slug>/uploads/*`; groups
  `groups/data/<slug>/group.json` + `uploads/group/<slug>/uploads/*`; featured
  `featured-recipes/data/<slug>/featured-recipe.json` (no uploads declared;
  engine default would be `uploads/featured-recipes/<slug>/uploads`).
  Per-slug helpers already exist: `curation/context.ts:75-100` `recipePath`,
  `groupPath`, `featuredPath`; `common/controller/filesystemDirectories.ts`
  `getRecipeUploadsBasePath :28`, `getGroupUploadsBasePath :53`. Derived
  (gitignored) paths: `packages/cms/content/derivedPaths.ts:73-86`
  (`/transformed-images`, `<type>/{index,pagination,aggregates}`,
  `/.pagination-changes.json`).
- **`/git` page** `src/app/(editor)/(settings)/git/` (11 files): `ui.tsx`
  "Content Sync" → `SyncPanel` (`useActionState(remoteCommandAction)`),
  `ConflictResolver`, `CommitLog` (lazy `getCommitDiff`, "Load more" via
  `getCommitLogPage`), branch/remote forms. **No testids**; `git.spec.ts` (838
  lines) drives it by role/text: "when empty", "with some git history"
  (`loadGitFixture("test-git.bundle")`, 5 commits), "syncing with a remote"
  (bare remote in `test-remotes/`, clone in `test-clones/`, non-fast-forward →
  `/Push rejected/`), "conflict resolution" (label `"Recipe: shared"`).
  `accessibility.spec.ts:140-156` axe on `/git`. Playwright support
  `playwright/support/tasks.ts`: `initializeContentGit :115` (no identity
  set), `loadGitFixture :139`, `createBareRemote :146`, `addRemoteAndPush
:155`, `cloneFromRemote :166` (sets `user.email`/`user.name` via
  `addConfig`), `addRecipeInClone :193`, `editRecipeInClone :204`, `pushClone
:217`, `getRemoteLog :222`, `getContentGitLog :110`.
- **No vitest creates a git repo** (`test/curation.test.ts:6-10`: tmpdir is
  not a repo so commits no-op). A git suite needs `// @vitest-environment
node` and per-repo identity via `addConfig("user.email"/"user.name")` (the
  keys `assertCommitIdentity` reads) — no precedent to copy.
- **No `/api/git/*` route exists; no route exports `runtime`** (T23 applies
  to every new git route). Template: `api/reindex/route.ts`
  (`requireCurationContext` → `readJsonBody` → `parseInput` → curation call →
  `revalidateDerivedState(recipeContentTypes)` → `Response.json`, one
  `try/catch errorResponse`).
- **Seam/CLI/MCP anchors**: `cli/backend/types.ts:59-136` `CuratorBackend`;
  `cli/index.ts` `COMMANDS :70-82`, `GLOBAL_OPTIONS :50-60`, subcommand tables
  `:84+` (`group`, `featured` — the pattern for `git …`); `mcp/registry.ts`
  `TOOL_NAMES :68-91`, `createRecipeServer :269`, instructions codes `:260`.
  New codes (`dirty_tree`, `bad_revision`) follow the T25 chain:
  `errors.ts:16-41` union, `http.ts:31-64` `statusFor`, `cli/backend/http.ts
:72-91` `codeForStatus` + `:93-124` `rehydrate`, `test/curationHttp.test.ts`
  table, registry instructions.
- **Context**: `curation/context.ts:48-62` `CurationContext {contentDirectory,
author?, onWrite?}`; `onWrite` is **synchronous fire-and-forget** (comment
  `:52-60` — the precedent for `onBulkChange`'s doc). `apiContext.ts`:
  `curationContextFor(email) :32-52` (author `{name: email, email}`, `onWrite`
  → `revalidateContentWrite`), `readContext :55`, `requireCurationContext
:68-79`. `cli/backend/local.ts:43-52` `LocalBackendOptions extends
CurationContext` and spreads `...ctx`, so a new context field flows through
  `createBackend` (`resolve.ts:135-143`) untouched.
- **Rebuild + revalidate**: `curation/reindex.ts:23-51` `reindex(ctx,
contentType?)` → `{rebuilt: string[]}` (full registry loop with
  `cascadeDependents: false` when no type) is the Node-safe half of
  `rebuildAllIndexes`; `revalidateDerivedState(recipeContentTypes)`
  (`packages/cms/content/next/revalidateDerived.ts:96`) is the Next-only half
  and is **forbidden inside `controller/curation/`** by the D8 boundary test
  (`test/curation.test.ts:1131-1137` bans `@discontent/cms/*/next/*`). So the
  pair after a revert/restore is `await reindex(ctx)` inside `git.ts` plus a
  `ctx.onBulkChange?.()` callback that `apiContext.ts` supplies. Registry:
  `controller/contentTypes.ts:30-46` `recipeContentTypes` (allowed import).
- **After-write per mode**: routes → `ctx.onWrite`; CLI local →
  `backend.afterWrite()` stale-editor hint (`local.ts:149-158`) or `--notify`
  POST `/api/revalidate`; http → nothing; MCP `write(backend, run)`
  (`registry.ts:193-208`) folds the hint into `warnings`.
- **Seam shapes**: `CuratorBackend` (`types.ts:59-136`) re-exports curation
  result types; `local.ts:76-167` — writes `await guard()` then call, reads are
  arrows, `reindex` is deliberately unguarded (`:146`, never commits);
  `http.ts` `call :132-180` (drops undefined query, bearer, `rehydrate` on
  non-ok), `listTags :312` unwraps an envelope (precedent); `CommandDef`
  (`cli/commands/types.ts:22-35` `{name, usage, options, write?, run, format}`),
  `featured.ts:44-48` exactly-one-of `UsageError`, `delete.ts` `confirmDeletion`;
  `cli/index.ts` `SUBCOMMAND_TABLES :92-95`, `USAGE` list `:108-130`, `main`
  `:269-374` (`write` → `afterWrite` hint on stderr). MCP: `read(run) :174`,
  `write :193`, annotations `:246-252` (`DESTRUCTIVE_WRITE` exists), section
  banners (`/* --- maintenance --- */ :615`), `INSTRUCTIONS :254-260` (codes
  paragraph; "Writes commit … Deletes … are not undoable from here").
- **Routes**: 13 files under `src/app/api/`; `group/[slug]/route.ts:31-96` is
  the four-method template (`params` is a `Promise`); `reindex/route.ts:30-48`
  = auth → optional body → `parseInput` → `reindex` →
  `revalidateDerivedState(recipeContentTypes)` → `Response.json`. Routes
  import via the `recipe-editor/controller/...` alias.
- **Tests**: `test/curation.test.ts` — `// @vitest-environment node`, `ctx =
{contentDirectory}`, teardown `closeCachedEnvironments()`, `recordingCtx()`
  `:981-990` for `onWrite`, D8 boundary suite `:1154-1212`. `test/mcp.test.ts`
  `:46-78` setup/teardown, `call`/`callError :81-100`, first case pins
  `TOOL_NAMES`. `test/cliJson.test.ts` `run(args) :77-91` (execa tsx,
  `--content-dir`, `closeCachedEnvironments()` before spawning). Playwright
  `api-write.spec.ts:35-46` (`resetData` then `createApiToken`, `auth()`
  header). Fixtures: 14 content dirs (none a git repo) + the one bundle
  `playwright/fixtures/git-test-content/test-git.bundle` (5 commits).
- **`reindex` today** is on every surface (curation, seam, local, http `POST
/api/reindex`, CLI `reindex`, MCP `reindex`); `/api/revalidate` is the
  no-rebuild half.

#### Design (decided)

D19 (the `curation/git.ts` module: types, reads, writes, preflights), D20
(`ctx.onBulkChange`), D21 (the four error codes), D22 (`sync.ts` delegates,
the page is unchanged) and D23 (seam, routes, CLI, MCP) in the decisions log
are the design; D7 is amended there to match. Summary of the surface:

| Surface  | Reads                                                                      | Writes                                                                                |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| curation | `gitStatus`, `gitLog`, `gitShow`, `gitFileAt`, `gitDiff`                   | `gitRevert`, `gitRestore`, `gitPush`                                                  |
| seam     | same names on `CuratorBackend`                                             | local `guard()` on revert/restore only; push unguarded                                |
| HTTP     | `GET /api/git/{status,log,file,diff}`, `GET /api/git/show/[hash]`          | `POST /api/git/{revert,restore,push}`                                                 |
| CLI      | `git status`, `git log`, `git show`, `git file`, `git diff`                | `git revert --yes`, `git restore --yes` (`write: true`), `git push`                   |
| MCP      | `git_status`, `git_log`, `git_show`, `git_file_at`, `git_diff` (READ_ONLY) | `git_revert`, `git_restore` (DESTRUCTIVE_WRITE), `git_push` (WRITES, no local change) |

Every HTTP route is `requireCurationContext` (history is not public) and
`export const runtime = "nodejs"` (T23) — the first such declarations in
the tree. `type` ∈ `{recipe, group, featured}` everywhere.

#### Steps (Opus implementer, in order)

1. Errors + `statusFor` + `curationHttp` table + registry instructions
   (`not_a_repo`, `dirty_tree`, `git_conflict` → 409; `bad_revision` → 422).
   `CurationContext.onBulkChange`.
2. `controller/curation/git.ts` (types moved from the page's `types.ts`,
   which becomes type-only re-exports; `GIT_TYPES`; helpers; reads; writes)
   - `curation/schema.ts` git schemas (`GitTypeSchema = z.enum(["recipe",
"group", "featured"])`, `GitLogQuerySchema`, `GitRevertSchema`,
     `GitRestoreSchema`, `GitPushSchema`, `GitDiffQuerySchema`,
     `GitFileQuerySchema`).
3. `sync.ts` delegation (D22) — then run `git.spec.ts` **before anything
   else** and keep it green unchanged.
4. `apiContext.ts` `onBulkChange`; seam (`types.ts`, `local.ts` with
   `guard()` on revert/restore, `http.ts` eight calls); the eight routes
   under `src/app/api/git/` (`status`, `log`, `file`, `diff`, `push`,
   `revert`, `restore`, `show/[hash]`), each `export const runtime =
"nodejs"`, `requireCurationContext`, `errorResponse`.
5. CLI `cli/commands/git.ts` + `SUBCOMMAND_TABLES` + `USAGE`; MCP block.
6. Tests (below), then gates; report divergences and the T28-shaped output
   for a `git_revert` with a bad hash.

#### Tests

- **New `test/curationGit.test.ts`** (`// @vitest-environment node`): helper
  `initTestRepo(dir)` = `git init`, `addConfig("user.email"/"user.name")`
  (local scope), `addConfig("commit.gpgsign", "false")`, write `.gitignore`
  from `derivedContentPaths(recipeContentTypes)` **before the first LMDB
  read**, initial commit; seed through curation `createRecipe`/`createGroup`
  (they now commit, `createContent.ts:177`); do not assert the branch name.
  Cases: `gitStatus` on a non-repo → `isRepo: false`; on the repo → `isRepo`,
  clean; `gitLog` all / `{type: "recipe", slug}` only that recipe's commits
  with `files` = its data path / unknown type → `not_found`; `gitShow` diff
  contains the slug, `maxChars` truncates with the marker; `gitFileAt` at the
  create commit returns the old `name`, absent → `not_found`; `gitDiff`
  between two commits; `gitRevert` of a group creation → new commit, group
  file gone, `rebuilt` has four names, `onBulkChange` called once
  (`recordingCtx` shape); revert of an unknown hash → `bad_revision`, of a
  merge commit → `bad_revision` (build one with a branch + `merge --no-ff`);
  a revert that conflicts (edit the same file after the commit, revert the
  earlier edit) → `git_conflict` and the tree is clean afterwards;
  `gitRestore` a recipe to its create rev → old content on disk, commit
  message `Restore recipe <slug> to <short>`, uploads dir restored (seed one
  upload), restoring to the current state → `{commit: null}` and no
  `onBulkChange`; restore of a slug absent at rev → `not_found`; dirty tree
  (write a file) → `dirty_tree` for revert/restore, and `gitPush` still runs;
  `gitPush` to a bare remote (`init --bare` in a second tmpdir, `push -u`
  first via `setUpstream`) → `{remote, branch}`, then a diverged remote →
  `git_conflict` with "Push rejected"; `rev`/`slug` starting with `-` or
  containing `/` → `validation`. D8 boundary suite picks `git.ts` up
  automatically.
- `test/curationHttp.test.ts` table + one `errorResponse` case per new code.
- `test/mcp.test.ts` `describe("git")` with its own `initTestRepo` setup:
  `git_log` after `recipe_create` shows the commit with `files`; `git_revert`
  of a `group_create` → `group_list` empty and `warnings` carries the
  stale-editor hint; `git_revert {hash: "zzz"}` → SDK-shape (schema regex,
  T28); `git_push` without a remote → `isError` with a curation code.
- `test/cliJson.test.ts`: make the `beforeAll` dir a repo (identity before
  the `createContent` seeds), one `git log --json` case → `{commits, hasMore}`.
- Playwright `api-write.spec.ts` `describe("git")`: **`resetData` →
  `createApiToken` → `initializeContentGit`** (the token file lives under
  `test-content/users/`, so the other order leaves the tree dirty — T48);
  cases: `GET /api/git/status` anonymous → 401; with token → `isRepo: true`;
  `POST /api/group` then `GET /api/git/log?type=group&slug=<slug>` → 1
  commit; `POST /api/git/revert {hash}` → 200 `{commit, rebuilt}` and
  `/group/<slug>` → 404, `/groups` shows no card (in-process
  `onBulkChange`); `POST /api/git/restore` back to the create rev → the page
  renders again; a bogus hash → 422 `bad_revision`; `git.spec.ts` untouched.

#### Gates (in `.claude/worktrees/agent-23d`)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                      # 488 at base + new cases
pnpm exec lint-staged --diff agent/23c-nested-groups
pnpm --filter recipe-editor e2e-dev -- git.spec.ts api-write.spec.ts   # detached (setsid nohup … > log 2>&1 &), strip ANSI, T14 cleanup; git.spec.ts is the refactor gate
grep -rn "console.log\|process.stdout" websites/recipe-website/editor/{controller,cli,mcp} websites/recipe-website/common/controller packages/cms --include='*.ts' | grep -v node_modules   # unchanged from 23b
```

Then CI on the draft PR (only lint/typecheck/unit run while the base is not
`main`). Smoke (Fable, script under `$CLAUDE_JOB_DIR/tmp`, scratch copy of
`three-recipes-groups` turned into a repo with an identity):
`claude -p --mcp-config .mcp.json … "create a collection 'Scratch' with
first-recipe, then look at the git log for that group and revert the commit
that created it; confirm the group is gone"` → expects `git_log` then
`git_revert` then `group_list` without it.

#### Risks → mitigations

T44 (simple-git `log` array form), T45 (wire strings reach git argv), T46
(`commitChanges` cannot commit a staged revert), T47 (push is not
clean-tree-guarded), T48 (`test-content/users/` is inside the Playwright
repo), T49 (the vitest repo helper's ordering), T50 (`git_push` bypasses
`afterWrite`) in the T-list, plus T23 restated: the `/api/git/*` files are
the first routes in the tree with `export const runtime = "nodejs"`.

#### Not in 23d

HTTP MCP transport (23e), skill rewrite incl. `git_*` in the skill's
allow/never lists (23f), fetch/pull/sync/merge/conflict/branch/remote
seats (stay page-only), push credentials, reverting a merge commit
(`bad_revision`), a `push_rejected` code (folded into `git_conflict`), the
parked pie-iron task, the #138 → #139 landing housekeeping (user).

#### Verification

`git_log {type: "recipe", slug}` lists that recipe's commits; `git_restore`
to an earlier revision produces a new commit and the page shows the old
content; `git_revert` of a group creation removes the group (page 404,
`/groups` empty) without a manual reindex; `git.spec.ts` passes unchanged.

#### Decisions and close-out (2026-09-14)

Commits on `agent/23d-git-seats`: `d9655d4c` (this design), `886c601b`
(implementation, 28 files, +3048 −216), `87c96e17` (cherry-pick of the 23c
fixture fix `8a6618ea`, see T51), `89448dbc` (review fixes), the close-out.
Draft PR #140 against `agent/23c-nested-groups`; retarget to `main` after
#139 merges (T20).

- [x] D19: `controller/curation/git.ts` — page DTOs moved, `types.ts` is
      re-exports (+ page-only `CommitLogPage`); `GIT_TYPES`/`GIT_TYPE_NAMES`;
      `assertHash`/`assertArgument`/`assertSlug`; `pathspecsFor` through the
      engine's `getUploadsBaseDirectory`; `requireRepo`/`requireCleanTree`;
      five reads, three writes; `mergeInProgress`/`labelForPath`/`toSummary`/
      `EMPTY_STATUS` exported for `sync.ts`.
- [x] D20: `CurationContext.onBulkChange`; `curationContextFor` supplies
      `revalidatePath("/", "layout")` + `revalidateDerivedState`.
- [x] D21: `not_a_repo`/`dirty_tree`/`git_conflict` → 409, `bad_revision` →
      422; four classes; `rehydrate` and `codeForStatus` untouched.
- [x] D22: `sync.ts` 507 → 391 lines, delegates the four; `labelForPath`'s
      upload branch reads `uploads/(recipe|group)/<slug>/…`; `git.spec.ts`
      unchanged and green.
- [x] D23: eight seam methods (local `guard()` on revert/restore), eight
      routes under `src/app/api/git/` (all `runtime = "nodejs"`,
      `requireCurationContext`), CLI `git` sub-table (`confirm(action, yes)`
      generalised from `confirmDeletion`, prompts byte-identical), eight MCP
      tools (`git_push` via `read`), `TOOL_NAMES` +8, instructions.
- [x] Tests: `test/curationGit.test.ts` (28 cases, the first vitest suite on
      a real repo, T49), `curationHttp` table, `mcp.test.ts` `describe("git")`
      ×4, `cliJson` repo + `git log --json`, Playwright `api-write.spec.ts`
      `describe("git")` ×3 + one `--remote` history case.
- [x] T28 pinned: `git_revert {hash: "zzz"}` answers in the SDK shape, no
      `structuredContent`, text "Input validation error: Invalid arguments
      for tool git_revert: hash: Expected 7 to 40 hexadecimal characters".

**Review (Fable).** Read the full diff. Three fixes in `89448dbc`: `gitPush`
passed `remote` to `push -u <remote> <branch>` unchecked (a remote spelled
`--force` would have been an option, T45) and ignored an explicit `remote`
when an upstream was tracked, silently pushing elsewhere and reporting the
caller's name — now `assertArgument` and a `push -u` whenever the remote
differs from the tracked one; `gitRestore` left a half-restored tree if
`checkout` failed after `rm` — now `reset --hard HEAD` and `bad_revision`;
`gitLog` normalised `limit` for argv but sliced with the raw value. The
revert path's one-shot `revert --no-edit` with `GIT_AUTHOR_*` over
`process.env` is right (simple-git's `.env()` replaces the child
environment). Reviewer reran every gate (below) plus the headless smoke.

**Gate results (verbatim, reviewer rerun in the worktree):**

| Gate                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter recipe-editor typecheck`                | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter recipe-website exec tsc --noEmit`       | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm exec vitest run`                                 | `Test Files 28 passed (28)` · `Tests 522 passed (522)` (488 at base, +34: 28 `curationGit`, 4 `mcp`, 1 `curationHttp`, 1 `cliJson`)                                                                                                                                                                                                                                                                                                                            |
| `pnpm exec lint-staged --diff agent/23c-nested-groups` | clean (prettier + eslint, 24 files)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| stdout grep                                            | unchanged from 23b: `cli/output.ts` ×3, the two `--help` writes, a comment in `mcp/server.ts`, the script-only `log` default                                                                                                                                                                                                                                                                                                                                   |
| `pnpm e2e-dev -- git.spec.ts api-write.spec.ts` (dev)  | reviewer rerun after the fixture fix and the review fixes: `45 passed (2.8m)`, 0 failed, 0 flaky (implementer: `44 passed · 1 failed` — the 23c cycle case, T51; `git.spec.ts` alone `26 passed (1.8m)`)                                                                                                                                                                                                                                                       |
| Headless smoke (`claude -p --mcp-config .mcp.json …`)  | `subtype: success`, 12 turns, 66.7 s: `group_create` Scratch with first-recipe → `git_log {type: "group", slug: "scratch"}` (one commit, `Create group: scratch`, files = the group JSON) → `git_revert` (new commit `Revert "Create group: scratch"`, rebuilt recipes/featured/pages/groups) → `group_get` `not_found`, `group_list` shows only the two fixture groups; scratch repo: three commits, clean tree; both writes carried the stale-editor warning |
| CI on the draft PR                                     | green on `674ce2b3`: lint, both typechecks, unit (run 34805928860). The recipe Playwright shards, CMS demo and Portfolio jobs run only on PRs to `main`, so they first run after the retarget (T20) — `git.spec.ts` and `api-write.spec.ts` are covered by the reviewer rerun above                                                                                                                                                                            |

**Implementer notes (divergences from the design above, and why).**

- **`GitHashSchema` carries the hex regex** (D21 said bare strings). The
  Tests list wants `git_revert {hash: "zzz"}` in the SDK shape, which only
  happens when the tool schema rejects it; `git.ts` re-checks the pattern for
  direct callers. So `POST /api/git/revert {hash: "zzz"}` is 400
  `validation` and a well-formed hash naming nothing is 422 `bad_revision`
  (both pinned in Playwright).
- **Reads preflight `requireRepo` too** (D19 named it for writes): without it
  `gitLog`/`gitShow`/`gitFileAt`/`gitDiff` leak a raw git error as `internal`
  on a non-repo. `gitStatus` still never throws.
- **`git.env({...process.env, ...authorEnv})`**, not the bare pair:
  simple-git's `.env(object)` replaces the child environment.
- **`CommitLogPage` stays in the page's `types.ts`**; `getCommitLogPage` maps
  entries down to `CommitSummary` so the RSC payload is unchanged.
- **`labelForPath` also labels `groups/data/<slug>/group.json`** as
  `Group: <slug>`.
- **`gitLog` refuses `slug` without `type`** (`validation`) rather than
  guessing across three directories.
- **`git restore` / `git_restore` still fire the stale-editor hint on the
  `{commit: null}` no-op** — `write: true` and MCP `write()` are static per
  command. Cosmetic.
- **`gitPush` with no remote configured answers `internal`** with git's own
  `'origin' does not appear to be a git repository`; D19's contract names only
  the rejection and no-branch cases. Deferred (a fifth code, or `not_found`).
- **Playwright's `initializeContentGit` sets no identity**, so the API writes
  in the git describes commit with the ambient config, as `git.spec.ts:282`
  already does.
- **One extra Playwright case** (`reads and rewinds the history over
--remote`) is the only coverage `createHttpBackend`'s eight git calls get.

**Verification (epic line for 23d):** met — `git_log {type: "recipe", slug}`
lists that recipe's commits with `files`; `git_restore` to the create
revision makes a `Restore recipe <slug> to <short>` commit and the page shows
the old content; `git_revert` of a group creation removes the group (page
404, `/groups` empty) with no manual reindex; `git.spec.ts` passes unchanged.

### PR 23e — MCP over HTTP `agent/23e-mcp-http` ✅ done (← 23d)

Branch `agent/23e-mcp-http` off `agent/23d-git-seats` at `469c4e34` (the
stack is #138 → #139 → #140 → 23e; the merge/retarget/rebase of each parent
stays the user's housekeeping, T20). Workflow unchanged: Fable plans and
reviews, an Opus subagent implements in `.claude/worktrees/agent-23e`, this
section is the handoff, the user merges. Never push `main`, never
force-push, never merge.

Goal (D8): a `POST /api/mcp` route handler in the editor that serves the
same 28-tool registry the stdio server serves, gated by the editor's own
API-token/session auth, so a remote MCP client (a Claude Code on another
machine, a claude.ai connector) can curate the live editor without the repo
checked out.

#### Facts (validated 2026-09-14 on `agent/23d-git-seats` at `469c4e34`; paths under `websites/recipe-website/editor/` unless noted)

- **SDK is the v2 split**, all `2.0.0`: `@modelcontextprotocol/server`
  (dependency, `package.json:39`), `@modelcontextprotocol/client`
  (devDependency, `:74`), `@modelcontextprotocol/core` (transitive). Exports
  are on the package **roots** plus `./stdio`; there is no `./streamableHttp`
  subpath, no `StreamableHTTPServerTransport`, no `SSEServerTransport`, no
  `createMcpExpressApp`, and `@modelcontextprotocol/node` (`toNodeHandler`)
  is not installed and not needed (route handlers are web-standard). Server
  root: `createMcpHandler(factory, options?) → McpHttpHandler` with
  `McpServerFactory = (ctx: McpRequestContext) => McpServer | Server |
Promise<…>` (`McpRequestContext {era: "legacy" | "modern", authInfo?,
requestInfo?: Request}` — zero-arg factories stay assignable),
  `CreateMcpHandlerOptions {legacy?: "stateless" | "reject" (default
"stateless": GET and DELETE → 405 "Method not allowed."), onerror?,
responseMode?: "auto" | "sse" | "json" (default "auto"), bus?,
maxSubscriptions? (1024), keepAliveMs? (15000; 0 disables)}`,
  `McpHttpHandler {fetch(request, {authInfo?, parsedBody?}) (arrow-bound),
close(), notify, bus}`. The handler "performs no token verification"
  (`authInfo` is pass-through) and is "deliberately validation-free" (no
  Host/Origin checks; the transport's DNS-rebinding options are
  `@deprecated`). Also exported: `WebStandardStreamableHTTPServerTransport`
  (long-lived, `handleRequest(req, opts?): Promise<Response>`),
  `PerRequestHTTPServerTransport`, `legacyStatelessFallback`,
  `requireBearerAuth`, `hostHeaderValidationResponse`,
  `originValidationResponse`, `InMemoryTransport`. Client root: `Client`,
  `InMemoryTransport`, `StreamableHTTPClientTransport(url: URL, opts?:
{requestInit?: RequestInit, fetch?: FetchLike, sessionId?, protocolVersion?,
authProvider?, reconnectionOptions?})`, `SSEClientTransport`;
  `StdioClientTransport` under `/stdio`. (SDK `.d.mts`: `server/dist/index.d.mts:459-536,
538-549, 653, 738`; `createMcpHandler-*.d.mts:3996-4040`;
  `client/dist/index.d.mts:3020-3075, 3114, 3145`.)
- **Our registry is transport-agnostic.** `mcp/registry.ts:286`
  `createRecipeServer(backend: CuratorBackend, info: RecipeServerInfo = {}):
McpServer` (`new McpServer({name: "recipes", version: packageJson.version},
{capabilities: {tools: {}}, instructions})`), `TOOL_NAMES :75` (28 names,
  ending `…reindex, git_status … git_push`); no `process.env`, no module
  state. `read(run) :189`, `write(backend, run, {notify = true}) :208` —
  `write` awaits `backend.afterWrite?.()` and folds the string into
  `warnings`. `mcp/server.ts:54` already hands `serveStdio` the factory
  `() => createRecipeServer(backend)`; the same expression is a valid
  `McpServerFactory` for `createMcpHandler`. Everything process-global (env,
  `process.exit`, signals, stdin, stderr banner) is in `server.ts` only.
- **Backend seam.** `cli/backend/local.ts:44` `LocalBackendOptions extends
CurationContext {notify?: NotifyTarget}`; `createLocalBackend({notify,
...ctx}) :77`; `guard()` `:81-83` = `assertCommitIdentity(ctx.contentDirectory)`
  before every committing write (throws `NoGitIdentityError` → 500;
  unconfigurable; `author.ts:13-16` says routes must not demand it);
  `afterWrite() :171-180` returns `STALE_EDITOR_HINT + NOTIFY_SUGGESTION`
  when `notify` is unset; `close: closeCachedEnvironments :188` (the
  **process-wide** LMDB environment cache — closing it inside the editor
  tears down the server's own environments). `cli/backend/resolve.ts:135`
  `createBackend(config)` drops `onWrite`/`onBulkChange` (`BackendConfig` has
  no seat for them) and `resolveBackendConfig` reads `process.env`
  (`RECIPE_API_URL` would make the editor proxy to itself) — unusable for
  the route. `CuratorBackend` (`cli/backend/types.ts:85-183`): 28 methods +
  `afterWrite?()` + `close()`; the HTTP backend's `afterWrite` returns
  `undefined` and `close` is a no-op (`http.ts:371,376`) — the precedent
  for "no hint, nothing to close".
- **Auth/context.** `controller/apiAuth.ts:32` `authenticateRequest(request,
contentDirectory): Promise<string | null>` — `/^Bearer\s+(.+)$/i` →
  `findUserByToken` (constant-time, `src/users/index.ts:140-176`, tokens
  `rcp_<8hex>_<43>` hashed in `<content>/users/<email>`, no scopes/expiry),
  then falls through to the session cookie via `actions/shared.ts`
  `authenticateUser` (`@/auth`), even when a bearer token was present but
  wrong; **reads headers only**. `controller/apiContext.ts:37`
  `curationContextFor(email, contentDirectory = getContentDirectory())` →
  `{contentDirectory, author: {name: email, email}, onWrite →
revalidateContentWrite(successConfigFor…), onBulkChange → revalidatePath("/",
"layout") + revalidateDerivedState(recipeContentTypes)}`; `readContext :73`;
  `requireCurationContext(request) :85` throws `UnauthenticatedError`
  ("Authentication required: send an API token as `Authorization: Bearer
rcp_…`, or sign in.") → `errorResponse` → 401 `{error: {code:
"unauthenticated", message}}` (asserted `api-write.spec.ts:828-831`).
  `curation/http.ts`: `statusFor`, `errorResponse`, `readJsonBody`
  (**consumes the body** via `request.text()`), `boolParam`, `intParam`.
- **Routes.** 21 route files under `src/app/api/`; no `api/mcp/`. Template
  `api/git/status/route.ts` (26 lines): `export const runtime = "nodejs"`
  (T23; the eight `/api/git/*` files are the only such declarations), one
  `try { ctx = await requireCurationContext(request); … } catch (e) { return
errorResponse(e) }`, imports via the `recipe-editor/controller/...`
  self-alias (`node_modules/recipe-editor` → the editor package). No
  `middleware.ts`/`proxy.ts` anywhere (so `auth.config.ts`'s `authorized`
  is dead code; `/api/*` is never redirected). `next.config.mjs`:
  `serverExternalPackages: ["lmdb"]`, `serverActions.bodySizeLimit: "10mb"`
  (Server Actions only), no rewrites/headers. Next.js 16.1.6, React 19.2.4,
  next-auth 5.0.0-beta.30, zod ^4.3.6. No route returns a streaming
  `Response`; `Response.json` everywhere.
- **Content directory.** `packages/cms/fs/getContentDirectory.ts`:
  `CONTENT_DIRECTORY` → `TEST_MODE` ? `<cwd>/test-content` : `<cwd>/content`,
  evaluated at import (T16). Playwright's `webServer` is `pnpm dev:test`
  (`TEST_MODE=true next dev --port ${PLAYWRIGHT_PORT:-3019}`), so the server
  reads `editor/test-content`, the same absolute path `playwright/support/
tasks.ts:19` seeds and `createApiToken :55-60` (`addTokenToUser(testContentDir,
"admin@nextmail.com", "playwright")`) writes into. Fixture order: `resetData`
  first (it recreates `test-content/users/`), then `createApiToken`
  (`support/test.ts:63-65`).
- **Tests.** Root `test/` under vitest (`vitest.config.js` includes
  `test/**/*.{test,spec}.*`, excludes `.claude/**`; aliases `next/cache`,
  `next/navigation`, `@/auth` to stubs; jsdom default → `//
@vitest-environment node`). `test/mcp.test.ts:49-100`: tmpdir +
  `process.env.CONTENT_DIRECTORY`, `createLocalBackend({contentDirectory})`,
  `InMemoryTransport.createLinkedPair()`, `call`/`callError` helpers, T28
  shape pinned. `test/mcpStdio.test.ts:46-104`: `closeCachedEnvironments()`
  before spawning (T16), `StdioClientTransport` with explicit `PATH`/`HOME`/
  `CONTENT_DIRECTORY` (T29), `tools/list` equals `[...TOOL_NAMES]`. T17: a
  route file that imports a cached read cannot load under vitest — test an
  extracted handler, not `route.ts`. Playwright: no spec imports the MCP
  client yet; `api-write.spec.ts:635-649` spawns the CLI with `--remote
<baseURL>` and `CONTENT_DIRECTORY: "/nonexistent"`; `playwright.config.ts`:
  `use.baseURL = http://localhost:3019`, `webServer.timeout` 120 s,
  `reuseExistingServer: !CI && !BUILD`, `workers: 1`.
- **CI.** `lint.yml` runs lint/unit/typecheck on every push; `playwright.yml`
  runs on pushes to `main`/`playwright` and PRs to `main` only — a stacked
  draft PR gets no e2e signal until the T20 retarget, so the reviewer's
  local rerun is the gate (23d gate table records the same).
- **`.mcp.json`** is stdio-only (D10 as built, `${VAR:-}` expansion, T27).
  Claude Code's `.mcp.json` accepts `{"type": "http", "url", "headers"}`
  entries; an entry whose URL expands to empty fails every startup.
- **Protocol facts read from the SDK source** (`S` = `server/dist/index.mjs`,
  `CORE` = `server/dist/src-CX2iR2pK.mjs`, `MCPX` = `server/dist/mcp-DXXb3Vv3.mjs`,
  `C` = `client/dist/index.mjs`, under `node_modules/.pnpm/@modelcontextprotocol+*@2.0.0/`):
  - The v2 `Client` negotiates in **legacy** mode by default (`C:2436`):
    `initialize` (no `_meta` envelope) → `notifications/initialized` → calls,
    each an independent POST. `createMcpHandler` classifies a claim-less
    `initialize`/`tools/*` as legacy (`CORE:5106-5139`) and serves it on
    `createLegacyStatelessFallback` (`S:966-1032`): per POST, `factory({era:
"legacy", requestInfo})`, a fresh `WebStandardStreamableHTTPServerTransport({
sessionIdGenerator: undefined})`, `connect`, `handleRequest`; never a
    `mcp-session-id` header (`S:715, 846`); non-POST → 405 JSON-RPC (`S:968`).
    `legacy: "reject"` would 400 every such client — keep the default.
  - **`responseMode` reaches only the modern leg** (`S:1206, 1225,
1270-1276`); the legacy transport defaults `enableJsonResponse = false`
    (`S:326`), so a legacy request POST is answered `200 text/event-stream`
    with one `event: message` frame and the stream closed (`S:700-736,
891-931`); a notification-only POST is `202` empty (`S:668-674`).
    `responseMode: "json"` also `console.warn`s on every `createMcpHandler`
    call (`S:1224`). `keepAliveMs: 0` disables the per-stream 15 s interval
    (`MCPX:62-70`). No registry tool emits notifications, so on the modern
    leg `"auto"` already yields a single `application/json` body (`S:125-137`).
  - Client `fetch?: FetchLike = (url, init?) => Promise<Response>` is used
    for every request (`C:5331, 5090-5095, 5424`). After the 202 to
    `notifications/initialized` the client fires a standalone GET
    (`C:5381-5385`); a **405** is swallowed silently (`C:5138-5141`); any
    other non-ok status goes to `onerror` and a reconnect loop (`C:5142-5180`).
  - A 401 without an `authProvider` throws `SdkHttpError` (`name ===
"SdkHttpError"`, `status === 401`, `data.text` = our JSON body; `C:5375-5379`)
    out of `client.connect()`.
  - `createMcpHandler` allocates only an in-memory bus, a listen router and an
    `inflight` set (`S:1210`, `MCPX:82-111, 219-260`); the legacy leg tears
    down transport + server when the response body drains (`S:989-1027`),
    the modern leg closes via microtask after the terminal response
    (`S:114-130`). Skipping `handler.close()` per request retains nothing;
    calling it before the body drains would abort the exchange (`S:1320-1331`).
  - Next 16.1.6 answers an unimplemented route method with `405`, empty body,
    no `Allow` header (`next/dist/server/route-modules/app-route/helpers/
auto-implement-methods.js:16-29`); `OPTIONS` is auto-implemented as `204
Allow: OPTIONS, POST` (`:52-70`).
  - `handler.fetch` clones then `text()`s the request (`S:1066-1073`) — a
    body consumed by the route makes the clone throw. Non-JSON content type →
    415 `-32000`; a JSON body without `Accept: application/json,
text/event-stream` → 406 (`S:627-631`); invalid JSON → 400 `-32700`; valid
    JSON that is not JSON-RPC → 400 `-32600` (`CORE:5210`, `S:1302-1305`).

#### Design (decided)

D8 as amended, D24 (the route), D25 (`inProcess` on the local backend) and
D26 (`mcp/http.ts`) in the decisions log are the design. Summary:

| Piece   | Where                          | Shape                                                                                                                                                         |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| route   | `src/app/api/mcp/route.ts`     | `runtime = "nodejs"`, `POST` only; `requireCurationContext` → `errorResponse` on failure, else `handleMcpRequest(request, ctx)`                               |
| handler | `editor/mcp/http.ts`           | `createLocalBackend({...ctx, inProcess: true})` → `createMcpHandler(() => createRecipeServer(backend), {keepAliveMs: 0, onerror})` → `handler.fetch(request)` |
| backend | `cli/backend/local.ts`         | `inProcess?: boolean`: `guard` no-op, `afterWrite` absent, `close` no-op, `notify` ignored                                                                    |
| client  | remote `.mcp.json` (docs only) | `{"type": "http", "url": "<editor>/api/mcp", "headers": {"Authorization": "Bearer rcp_…"}}`                                                                   |

Route body:

```ts
export const runtime = "nodejs";

export async function POST(request: Request) {
  let ctx: CurationContext;
  try {
    ctx = await requireCurationContext(request);
  } catch (error) {
    return errorResponse(error);
  }
  return handleMcpRequest(request, ctx);
}
```

Handler body:

```ts
export async function handleMcpRequest(
  request: Request,
  ctx: CurationContext,
): Promise<Response> {
  const backend = createLocalBackend({ ...ctx, inProcess: true });
  const handler = createMcpHandler(() => createRecipeServer(backend), {
    keepAliveMs: 0,
    onerror: (error) =>
      console.error(`recipes MCP (http): ${error.stack ?? error.message}`),
  });
  return handler.fetch(request);
}
```

Remote client snippet (for a Claude Code on another machine; the editor
must be reached over HTTPS — a bearer token on plain HTTP is a credential
in the clear, `agent-curation.md` fact 14):

```json
{
  "mcpServers": {
    "recipes": {
      "type": "http",
      "url": "https://<editor>/api/mcp",
      "headers": { "Authorization": "Bearer rcp_…" }
    }
  }
}
```

#### Steps (Opus implementer, in order)

1. `cli/backend/local.ts` `inProcess` (D25); `test/mcp.test.ts` stays green.
2. `mcp/http.ts` (D26) + `src/app/api/mcp/route.ts` (D24).
3. `test/mcpHttp.test.ts` (below).
4. `playwright/tests/mcp-http.spec.ts` (below); run with `api-write.spec.ts`.
5. Doc edits are Fable's (this section is already the design); the
   implementer reports divergences only.
6. Gates; report divergences, plus the raw SSE frame of one `tools/call` on
   the legacy leg for the record.

#### Tests

- **New `test/mcpHttp.test.ts`** (`// @vitest-environment node`). Harness
  mirrors `test/mcp.test.ts:46-100`: per-test `mkdtemp`; `events:
ContentWriteEvent[]`, `bulk = 0`; `ctx = {contentDirectory, author: {name:
"mcp@test", email: "mcp@test"}, onWrite: e => events.push(e), onBulkChange:
() => bulk++}`; the client's `fetch` option routes to the handler with Next's
  behaviour for other methods:
  ```ts
  const viaHandler: FetchLike = async (url, init) => {
    const request = new Request(url, init);
    if (request.method !== "POST") return new Response(null, { status: 405 });
    return handleMcpRequest(request, ctx);
  };
  transport = new StreamableHTTPClientTransport(
    new URL("http://editor.test/api/mcp"),
    { fetch: viaHandler },
  );
  client = new Client({ name: "mcp-http-test", version: "0" });
  await client.connect(transport);
  ```
  Teardown: `client.close()`, `closeCachedEnvironments()` (the test process
  owns the cache), `rm` tmpdir. Cases: (1) `listTools()` names deep-equal
  `TOOL_NAMES` and `transport.sessionId` is `undefined`; (2) `recipe_create`
  → not `isError`, `events` has exactly one `{kind: "create"}`,
  `structuredContent.warnings` is `undefined`; (3) `recipe_list` then
  `group_list` afterwards answer (consecutive requests share a live cache;
  also assert `createLocalBackend({contentDirectory, inProcess:
true}).afterWrite === undefined` and that its `close()` resolves without
  evicting — a following `listRecipes` on a default backend still works);
  (4) `group_get {slug: "nope"}` → `isError`, `error.code === "not_found"`
  (T28: curation-layer failure); (5) raw legacy-leg wire shape via
  `handleMcpRequest` with `Accept: application/json, text/event-stream`:
  `initialize` → 200, `content-type` starts `text/event-stream`, no
  `mcp-session-id`; `notifications/initialized` → 202 empty; (6) malformed
  bodies (raw): `text/plain` → 415 `-32000`; JSON content type with body `{`
  → 400 `-32700`; body `{}` → 400 `-32600`; a JSON body without `Accept` →
  406 (pins T57); (7) modern leg: `new Client({…}, {versionNegotiation:
{mode: "auto"}})` connects, `listTools` equals `TOOL_NAMES`, and a
  `tools/call` response captured in the stub is `application/json`; (8)
  identity guard skipped in-process: `initTestRepo` as in
  `test/curationGit.test.ts` (T49) **without** `user.email`, with
  `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_COMMITTER_EMAIL`
  deleted (restored in `afterEach`): a default backend's `createRecipe` →
  `no_git_identity` and no data file; the `inProcess` backend's create is
  refused by git itself (any code but `no_git_identity`) or, with a
  `GIT_COMMITTER_*` pair set only for that call, succeeds — either way the
  guard did not fire (T61).
- **New Playwright `playwright/tests/mcp-http.spec.ts`**: `beforeEach`
  `resetData("three-recipes-groups")` then `createApiToken()`; no
  `initializeContentGit` (so `git_status` → `isRepo: false`). Helper
  `connect()` = `new StreamableHTTPClientTransport(new URL("/api/mcp",
baseURL), {requestInit: {headers: {authorization: \`Bearer ${token}\`}}})`+
 `Client`; `afterEach`closes it. Cases: (1) anonymous`request.post`of a
 `tools/list`body → 401`error.code === "unauthenticated"`; wrong token
  `Bearer rcp_deadbeef_nope`→ 401; (2)`request.get("/api/mcp")`→ 405 empty
  body;`OPTIONS`→ 204`Allow: OPTIONS, POST`; (3) client without a token:
  `connect()`rejects with`name === "SdkHttpError"`, `status === 401`; (4)
  with token: `listTools()`names equal`[...TOOL_NAMES]`; (5) `group_create
  {group: {name: "MCP Week", kind: "meal-plan"}}`→ no`warnings`, then
  `page.goto("/group/mcp-week")`renders and`/groups` lists it without a
  reload (`api-write.spec.ts:195-216`precedent); (6)`git_status`→
 `isRepo: false`; (7) `recipe_get {slug: "nope"}`→`isError`, `not_found`;
  (8) malformed body over real HTTP (`content-type: application/json`,
  `accept: application/json, text/event-stream`, body `{`) → 400 `-32700`.
  `@modelcontextprotocol/client` is already a devDependency of the editor,
  so the spec resolves it.
- `test/mcp.test.ts`, `test/mcpStdio.test.ts`, `api-write.spec.ts`,
  `git.spec.ts` unchanged.

#### Gates (in `.claude/worktrees/agent-23e`)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                                  # 522 at base + mcpHttp cases
pnpm exec lint-staged --diff agent/23d-git-seats      # prettier --write, git add -A, then run (T42)
pnpm --filter recipe-editor e2e-dev -- mcp-http.spec.ts api-write.spec.ts   # detached (setsid nohup … > log 2>&1 &), strip ANSI, T14 cleanup
grep -rn "console.log\|process.stdout" websites/recipe-website/editor/{controller,cli,mcp} websites/recipe-website/common/controller packages/cms --include='*.ts' | grep -v node_modules   # unchanged from 23b/23d
```

Then CI on the draft PR (lint/typecheck/unit only while the base is not
`main`; the local `e2e-dev` rerun is the Playwright gate). Smoke (Fable,
scripts under `$CLAUDE_JOB_DIR/tmp`): copy `three-recipes-groups` over
`editor/test-content` (it carries `users/admin@nextmail.com`); start `pnpm
--filter recipe-editor dev:test` detached on 3019; mint a token with
`CONTENT_DIRECTORY=<editor>/test-content pnpm --filter recipe-editor
create-token -e admin@nextmail.com -n smoke`; write `mcp-http.json` =
`{"mcpServers": {"recipes-http": {"type": "http", "url":
"http://localhost:3019/api/mcp", "headers": {"Authorization": "Bearer
rcp_…"}}}}`; `claude -p --mcp-config <that file> --strict-mcp-config
--allowedTools "mcp__recipes-http" --output-format json "list the groups"` →
expects `group_list` returning `week-of-may-4` and `weeknight-favourites`;
watch the Next log for `Rejected inbound request` (none expected — this also
records which era Claude Code's own client speaks). Stop the dev server and
restore `test-content` afterwards (T14 cleanup).

#### Risks → mitigations

T52 (the in-process backend must never close the LMDB cache), T53 (the
stale-editor hint is false in-process), T54 (never read the body before
`handler.fetch`), T55 (`responseMode` never reaches the legacy leg), T56
(`"auto"` upgrades to SSE on the first notification), T57 (raw POSTs need
the dual `Accept`), T58 (the post-initialize GET must get exactly a 405),
T59 (`handler.close()` is never needed per request), T60 (a 401 is
`SdkHttpError`), T61 (identity-guard tests need a scrubbed git environment)
in the T-list, plus T23 restated: `api/mcp/route.ts` is the ninth `runtime =
"nodejs"` declaration.

#### Not in 23e

OAuth metadata / `requireBearerAuth` / `WWW-Authenticate` challenges;
sessions, resumability, the standalone GET SSE stream, `subscriptions/listen`;
Host/Origin validation; an HTTP entry in `.mcp.json`; token scopes or a
read-only token (backlog "API token hygiene"); anonymous reads over MCP; the
hand-wired JSON-only legacy leg (recorded as the fallback in D26); the skill
rewrite and `mcp__recipes__*` allow-lists (23f); the #138 → #139 → #140
landing housekeeping (user); the parked pie-iron task.

#### Verification

An MCP client over HTTP with a bearer token lists the same 28 tools as
stdio and performs one write that the page reflects without a reload;
without a token → 401 `unauthenticated`; `GET /api/mcp` → 405; Claude Code's
own client completes the smoke against `next dev`.

#### Decisions and close-out (2026-09-14)

Commits on `agent/23e-mcp-http`: `8a429c96` (this design; also lists this
doc under `CLAUDE.md`'s durable docs), `83762d1f` (implementation, 5 files,
+913 −14), the close-out. Draft PR #141 against `agent/23d-git-seats`;
retarget to `main` after #140 merges (T20).

- [x] D8 (amended) / D24: `src/app/api/mcp/route.ts` — `runtime =
"nodejs"`, `POST` only, `requireCurationContext` → `errorResponse`, else
      `handleMcpRequest`; the ninth `runtime` declaration.
- [x] D25: `LocalBackendOptions.inProcess` — `guard` no-op, `afterWrite`
      spread in only when not in-process (the notify body became a local
      `const afterWrite`), `close` no-op; `resolve.ts` untouched.
- [x] D26: `editor/mcp/http.ts` `handleMcpRequest` — per-request
      `createMcpHandler`, `keepAliveMs: 0`, `onerror` → `console.error`, no
      `responseMode`, never `close()`d; header comment carries the legacy-leg
      shape and the not-built JSON-only fallback.
- [x] Tests: `test/mcpHttp.test.ts` (8 cases: registry + no session, write
      through `ctx.onWrite` with no `warnings`, cache alive across requests + the seam's absent `afterWrite`/inert `close`, `not_found` shape,
      legacy wire shape, four refusals, modern JSON leg, identity guard
      skipped on a scrubbed repo); `playwright/tests/mcp-http.spec.ts` (8
      cases: 401 anonymous + wrong token, 405/204 for GET/OPTIONS,
      `SdkHttpError` 401 from `connect()`, 28 tools, `group_create` →
      `/group/mcp-week` + `/groups` without a reload, `git_status` `isRepo:
false`, `not_found`, raw `-32700`).
- [x] `.mcp.json`, `test/mcp.test.ts`, `test/mcpStdio.test.ts`,
      `api-write.spec.ts`, `git.spec.ts` unchanged.

**Review (Fable).** Read the full diff; no fixes needed. The three
implementer divergences below are accepted as written: the
`const afterWrite` restructure is the only way to make the property truly
absent without touching the 28-method literal; the `Buffer` in the
Playwright malformed-body case is a Playwright fact, now T62; the
identity-guard case's positive assertion (the data file exists on disk after
the in-process write, while the guarded backend never wrote it) is stronger
than the design's "any code but `no_git_identity`". Reviewer reran every
gate (below) plus the smoke.

**Gate results (verbatim, reviewer rerun in the worktree):**

| Gate                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter recipe-editor typecheck`                             | clean (exit 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm --filter recipe-website exec tsc --noEmit`                    | clean (exit 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm exec vitest run`                                              | `Test Files 29 passed (29)` · `Tests 530 passed (530)` (522 at base, +8 `mcpHttp`)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm exec lint-staged --diff agent/23d-git-seats`                  | clean (prettier + eslint, 7 files), tree clean afterwards                                                                                                                                                                                                                                                                                                                                                                                                                            |
| stdout grep                                                         | unchanged from 23b/23d: eight hits (`cli/output.ts` ×3, the two `--help` writes, the `mcp/server.ts` comment, the script-only `log` default ×2); a comment in `mcp/http.ts` was reworded so it would not add a ninth                                                                                                                                                                                                                                                                 |
| `pnpm e2e-dev -- mcp-http.spec.ts api-write.spec.ts` (dev)          | reviewer rerun `27 passed (1.1m)`, 0 failed, 0 flaky (19 api-write + 8 mcp-http; implementer's first run `26 passed · 1 failed` on the malformed-body case → T62, then `27 passed`)                                                                                                                                                                                                                                                                                                  |
| Raw `tools/call` on the legacy leg, through `next dev`              | `HTTP/1.1 200 OK` · `content-type: text/event-stream` · `cache-control: no-cache, no-transform` · `x-accel-buffering: no` · `Transfer-Encoding: chunked` · no `mcp-session-id`; body exactly `event: message\ndata: {"result":{"content":[{"type":"text","text":"{\"total\":2,…}"}],"structuredContent":{…}},"jsonrpc":"2.0","id":7}\n\n`, stream closed (the vitest capture of the same frame without Next is identical minus `vary`/`Transfer-Encoding`)                           |
| Smoke: `curl` without a token / `GET`                               | `GET /api/mcp` → 405 empty; anonymous `POST tools/list` → 401 `{"error":{"code":"unauthenticated","message":"Authentication required: …"}}`                                                                                                                                                                                                                                                                                                                                          |
| Smoke: `claude -p --mcp-config mcp-http.json --strict-mcp-config …` | `is_error: false`, 3 turns, 5.3 s, result "week-of-may-4 / weeknight-favourites" via `group_list` over `{"type": "http", "url": "http://localhost:3019/api/mcp", "headers": {"Authorization": "Bearer rcp_…"}}` against `next dev` on `three-recipes-groups`. Next's log: four `POST /api/mcp 200` from Claude Code's client, no `GET`, no `202`, no 4xx, no `Rejected inbound request`; one of the four responses was held open for the run's whole 5.5 s — recorded, not explained |
| CI on the draft PR                                                  | green on `165b4746`: lint, both typechecks, unit (run 34859414499). The recipe Playwright shards, CMS demo and Portfolio jobs run only on PRs to `main`, so they first run after the retarget (T20) — `mcp-http.spec.ts` and `api-write.spec.ts` are covered by the reviewer rerun above                                                                                                                                                                                             |

**Implementer notes (divergences from the design above, and why).**

- **`createLocalBackend` restructure.** The notify body moved from an inline
  method to a local `const afterWrite`, spread in as `...(inProcess ? {} :
{ afterWrite })`; the 28-method literal is otherwise untouched.
- **Playwright case (8) needs `Buffer.from("{")`**, not the string — T62.
- **Vitest case (8) asserts on disk**, not on a `GIT_COMMITTER_*` pair:
  "errored with anything but `no_git_identity`" plus "the recipe file
  exists" is the positive proof the guard did not fire (the guarded backend
  stops before `createContent` writes). Empirically git refuses the commit.
  `initTestRepo` could not be reused: the repo must carry no `user.email`,
  so its initial commit takes its identity from `simpleGit(...).env({…})`
  scoped to those child processes only.
- **No SDK behaviour contradicted the Facts.** Legacy-by-default client,
  SSE-per-POST without `mcp-session-id`, `202` for
  `notifications/initialized`, the swallowed 405 on the standalone GET,
  `415/-32000`, `400/-32700`, `400/-32600`, `406` without the dual `Accept`,
  `SdkHttpError` 401 out of `connect()`, one `application/json` body under
  `versionNegotiation: {mode: "auto"}`, Next's empty 405 and `204 Allow:
OPTIONS, POST` — all as written. One extra observation: on the legacy
  stateless leg a `tools/call` POST is answered without a preceding
  `initialize`; each POST gets its own server instance, so there is no
  per-connection initialization state to violate.

**Verification (epic line for 23e):** met — an MCP client over HTTP with a
bearer token lists the same 28 tools as stdio (`mcp-http.spec.ts` and the
vitest harness both pin `[...TOOL_NAMES]`) and `group_create` is reflected
by `/group/mcp-week` and `/groups` without a reload; without a token → 401
`unauthenticated`; `GET /api/mcp` → 405; Claude Code's own client listed the
groups through the endpoint against `next dev`.

### PR 23f — Curator skill v2 `agent/23f-curator-skill-v2` ✅ done (← 23e)

Branch `agent/23f-curator-skill-v2` off `agent/23e-mcp-http` at `b0ef22eb`
(the stack is #138 → #139 → #140 → #141 → this PR; the merge/retarget/rebase
of each parent stays the user's housekeeping, T20). Workflow unchanged: Fable
plans and reviews, an Opus subagent implements in
`.claude/worktrees/agent-23f`, this section is the handoff, the user merges.
Never push `main`, never force-push, never merge.

Goal (D9, amended): rewrite `.claude/skills/recipe-curator/SKILL.md` around
the 28 `mcp__recipes__*` tools with the CLI kept as the documented fallback,
regenerate `examples.md` from real tool transcripts, turn the driving user
story into an automated acceptance test on a committed cookie fixture,
update `docs/backlog.md`, close this doc out, update memory. The story:

> "Organize the cluster of cookie recipes into one featured group called
> _Christmas Cookies_, then combine the linzer cookie recipes into a group
> that is accessible both at the top level and inside _Christmas Cookies_."

Decided with the user (2026-09-14, plan mode): the skill pre-approves the
**21 non-destructive tools** (in its frontmatter and in
`.claude/settings.json`, pinned by a test); `examples.md` comes from **two
headless runs** (the story, and the meal-plan ask regenerated); the cookie
corpus is a **new committed fixture**; the two truth gaps (`recipe_search`
advertising `group:`, the stale-editor hint's CLI-only advice) are **fixed in
code, one line each**.

#### Facts (validated 2026-09-14 on `agent/23e-mcp-http` at `b0ef22eb`; paths under `websites/recipe-website/editor/` unless noted)

- **The skill today.** `.claude/skills/recipe-curator/SKILL.md` (156 lines)
  and `examples.md` (173 lines), untouched since 22h. Frontmatter: `name`,
  `description` ("… via pnpm recipes …"), `allowed-tools: Bash(pnpm --silent
recipes:*), WebSearch`. Body: `$ARGUMENTS` (`:9`), eight numbered steps
  (where writes go → constraints → reuse → web candidates → dry-run → import
  → group → report) and a "Never" block (`:148-156`: never push/delete/
  `unfeature`/`reindex`, never `--author --remote --editor-url --notify
--overwrite --force`). Every command line is `pnpm --silent recipes … --json`
  from the repo root. `examples.md`: two hand-abbreviated real transcripts
  (meal plan "three vegetarian dinners under 45 minutes"; collection
  "meatless bean dinners"); no `feature`, no `group update`, no
  `--image-url` example. Nothing automated exercises the skill; it is the
  only `SKILL.md` in the repo, so there is no second frontmatter convention
  to copy.
- **Permissions today.** `.claude/settings.json`: `enabledMcpjsonServers:
["recipes"]` (23b) and `permissions.allow` = `Bash(pnpm --silent recipes:*)`,
  `Bash(pnpm recipes:*)`, `WebSearch`, `Skill(recipe-curator)` — **no
  `mcp__recipes*` entry**. `.mcp.json` registers `recipes` (stdio, `${VAR:-}`
  passthrough of `CONTENT_DIRECTORY`, `RECIPE_API_URL`, `RECIPE_API_TOKEN`,
  `RECIPE_AUTHOR`, `RECIPE_EDITOR_URL`); default target is the **real
  content repo** through the `editor/content` symlink — every smoke must
  export a scratch `CONTENT_DIRECTORY`.
- **Claude Code contract (official docs, fetched 2026-09-14;
  code.claude.com/docs/en/{skills,mcp,permissions,headless}.md).** SKILL.md
  frontmatter fields: `name`, `description`, `allowed-tools` (space-separated
  string, or a YAML list), `disable-model-invocation`, `user-invocable`,
  `context: fork`, `agent`, `arguments`, `paths`, `background`.
  `allowed-tools` **pre-approves** the listed tools for the skill's turn
  ("Permission expires when you send your next message"). MCP names:
  `mcp__<server>__<tool>` per tool, `mcp__<server>` or `mcp__<server>__*` for
  the whole server; the same three forms are the `permissions.allow` rule
  syntax. `claude -p "/recipe-curator <ask>"` expands the skill in headless
  mode; `--allowedTools`, `--permission-mode`, `--max-turns`,
  `--output-format stream-json`, `--verbose` as before; a skill cannot
  declare MCP servers (only plugins can). Two `.mcp.json` entries for the
  same server under two names yield two tool prefixes (`mcp__recipes__*` vs
  `mcp__recipes-http__*`), so an HTTP registration meant for this skill must
  reuse the name `recipes`.
- **The tool surface** (`mcp/registry.ts`): `TOOL_NAMES` (`:75-104`, 28).
  Annotations `:261-267`: `READ_ONLY` (recipe_search, recipe_list,
  recipe_get, tag_list, group_list, group_get, featured_list, git_status,
  git_log, git_show, git_file_at, git_diff), `WRITES` (recipe_import,
  recipe_create, group_create, group_add_item, feature, git_push),
  `IDEMPOTENT_WRITE` (recipe_update, group_update, group_set_items,
  group_remove_item, reindex), `DESTRUCTIVE_WRITE` (recipe_delete,
  group_delete, unfeature, git_revert, git_restore). `git_push` is only
  `WRITES`, so annotations alone do not carry the skill's "never push".
  `group_add_item`/`group_remove_item` take `subgroup` (not `group`) for the
  nested target (`:230-246`); `group_create.items` / `group_set_items.items`
  take `"slug"`, `"slug:label"`, `{recipe, label?, note?}` or `{group,
label?, note?}`; `group_create.group.kind` defaults to `collection`;
  `feature` takes `{recipe | group, note?, date?, slug?}` and the default
  entry slug has one-second resolution (T26 — pass `slug` when featuring
  more than once); `group_get` resolves items to `{recipe, label?, note?,
name}` or `{group, label?, note?, name, kind}` or `{…, missing: true}`;
  `featured_list` rows are `{slug, date, recipe? | group?, note?, name?}`;
  `group_list` rows `{slug, date, name, kind, itemCount}`. Server
  `instructions` (`:269-277`) already name the 15 error codes and the
  `warnings` semantics.
- **`warnings`.** `write()` (`registry.ts:196-223`) folds
  `backend.afterWrite?.()` into `warnings`; the local backend returns
  `STALE_EDITOR_HINT + NOTIFY_SUGGESTION` = "A running editor is stale until
  Settings → Maintenance → Reload." + " Pass --notify --editor-url <url> to
  invalidate it automatically." (`cli/backend/local.ts:36-41`) — CLI-flag
  advice that reaches MCP callers verbatim. `recipe_import` passes `notify:
dryRun !== true`, so the MCP path already omits the hint on a dry run (the
  CLI still prints it — backlog row stays, narrowed to the CLI). Curation
  warnings are `Unknown recipe: <slug>` / `Unknown group: <slug>`
  (`curation/groups.ts:251,270`), only under `force`.
- **Search truth.** `controller/curation/search.ts:47-77`: every free-text
  word must prefix-match at a word start in `name`, `description`, a tag or
  an ingredient; unranked, newest first. **`group:` matches nothing
  server-side** — `matchesFilter`'s `case "group"` reads `recipe.groups`,
  which `toRecipeRow` never sets (`common/controller/data/read.ts:16-28`:
  "never written on the server"); only the browser decorates rows. The
  `recipe_search` description (`registry.ts:302-333`) lists `group:` anyway.
  `tag_list` reads the `recipeTags` aggregate.
- **Fixtures.** `playwright/fixtures/test-content/<name>/`; LMDB index files
  are **committed** (e.g. `search-corpus/recipes/index/{data,lock}.mdb`), so
  a copied fixture answers `recipe_search` with no rebuild; nothing
  self-heals on read (an unindexed directory answers `{total: 0}`). The only
  cookie today is `search-corpus/…/ginger-cookies` (the recipe.json
  template). `resetData` (`playwright/support/tasks.ts:33-42`) is `fs-extra`
  `copy` + layering `playwright/fixtures/users`. `editor/.gitignore`
  wildcard-ignores every fixture's `groups/` (negations for
  `three-recipes-groups`, `nested-groups`; T51) — a fixture **without**
  `groups/` needs no line; `featured-recipes/` is not wildcard-ignored.
  **Index build:** `scripts/build-fixture-indexes.ts` (no args, run from the
  editor dir) rebuilds **every** fixture and leaves every other fixture's
  `.mdb` byte-different (T41) — not the tool for one new fixture. The
  `scripts/seed-groups.ts` pattern (`:75-79`: `outputJSON` the data files,
  then `rebuildIndex({config, contentDirectory})`) builds one directory;
  `rebuildIndex` defaults `cascadeDependents: true` and recipes are
  `referencedBy` featured (`recipeContentConfig.ts:28-33`), so the call must
  pass `cascadeDependents: false` or it plants a stray `featured-recipes/`
  environment (LMDB `open()` creates directories,
  `environmentCache.ts:114-116`). A recipes-only fixture commits exactly
  four environments — `recipes/index`, `recipes/pagination/by-date`,
  `recipes/aggregates/tags`, `recipes/aggregates/by-tag` (`data.mdb` +
  `lock.mdb` each; `search-corpus` and `three-recipes` show the same eight
  files). `date` is the index key (`recipeContentConfig.ts:23-26`); rows
  read `reverse: true` keyed `[date, slug]`. No test enumerates fixtures;
  `specVersions.test.ts` hashes config source only. `fs-extra` `copy` is a
  root dependency and copies `lock.mdb` exactly as `resetData` does (no lock
  hazard; reader slots are PID-keyed). Free-text match direction
  (`queryLanguage.ts:447-455`): the **query word must be a prefix of a field
  word** — `cookie` matches "cookies", not the reverse — over name,
  description, tags and the flattened ingredient strings from the index
  value.
- **No test pins the two strings being changed.** `registry.ts:306` holds
  `group:` in the description; no test asserts it. `NOTIFY_SUGGESTION` is
  module-private (`local.ts:40-41`); `test/mcp.test.ts:155,331,620` assert
  `stringContaining(STALE_EDITOR_HINT)` only. `resolveNotify`
  (`cli/backend/resolve.ts:94-97`) turns notify on from `RECIPE_EDITOR_URL`
  alone, with `RECIPE_API_TOKEN` as the token.
- **Vitest.** Root `test/` only; jsdom default (`// @vitest-environment
node` on line 1); files run in parallel forks, cases in a file
  sequentially; no global timeout (5 s default — pass a per-case timeout).
  No test copies a fixture yet; `test/mcp.test.ts:44-117` is the harness
  (tmpdir, `CONTENT_DIRECTORY`, `createLocalBackend`, `InMemoryTransport`,
  `call`/`callError`); `test/mcp.test.ts:520-565` already has the _shape_ of
  the story (one cake, one group, one feature — no nesting, no cookies).
  `closeCachedEnvironments()` before touching files a process has opened
  (T16). Import can be stubbed with `vi.stubGlobal("fetch", …)`
  (`test/curation.test.ts:266-289`) — not needed here, the story imports
  nothing.
- **Headless precedent.** 22e Run 3 (`agent-curation.md:1792-1900`):
  `CONTENT_DIRECTORY=<scratch> claude -p "<ask>" --permission-mode
acceptEdits --max-turns 40 --output-format stream-json --verbose` with **no
  `--allowedTools`** so the committed settings gate the run; 23b/23c/23e
  smokes used `--mcp-config .mcp.json --strict-mcp-config`. From inside a
  Claude Code session `CLAUDECODE` must be unset (memory).
- **Docs to close.** This doc: roadmap row 23f, the "Next PR" paragraph,
  fact 11 (stale after this PR), Deferred, epic Verification, the header
  obligation. `docs/backlog.md` rows: "Stale-editor hint after `--dry-run`"
  (narrow to CLI), "Tag-vocabulary pass", "Search ranking", "API token
  hygiene", "`--image <local file>`". Root `CLAUDE.md` "Curating recipes"
  ("exactly one command form") — 84 lines against a soft 80-line budget.
  Numbering before this phase: highest D is D26, highest T is T62.

#### Design (decided)

D9 amended, D27–D30 in the D-list; T63–T67 in the T-list. In short:

- **D9 amended.** `allowed-tools` enumerates tools, not the server; the CLI
  is a fallback section, not a parallel path; the acceptance test is a
  deterministic replay of the story over the in-memory client on a
  committed fixture (no model in the loop), and the two headless runs are
  the transcripts. HTTP transport: one paragraph — register the editor's
  `/api/mcp` under the **same server name `recipes`** so the tool names and
  this skill's allow-list apply unchanged; then "where writes go" is the
  server's content directory.
- **D27 Skill v2** — `SKILL.md` (≤ ~170 lines): frontmatter with the 21
  pre-approved `mcp__recipes__<tool>` names + `WebSearch` + `Bash(pnpm
--silent recipes:*)` on one comma-separated `allowed-tools:` line; body =
  the same eight steps, tool-first, one JSON example and the result shape
  per step; "Held back" replaces "Never"; "Fallback (CLI)" carries the old
  flag-level Nevers plus `--content-dir`.
- **D28 Permissions and the drift pin** — `.claude/settings.json` gains the
  same 21 entries; `test/curatorSkill.test.ts` pins frontmatter ==
  settings == `TOOL_NAMES − HELD_BACK`, `HELD_BACK ⊇` every
  `destructiveHint` tool, every tool-shaped token in the skill files is a
  real tool, no held-back name outside "Held back", no CLI line outside
  "Fallback".
- **D29 Fixture `christmas-cookies`** — ten recipes (eight cookies, three of
  them linzer, two distractors), committed with its four index
  environments, built by a one-shot `scripts/seed-christmas-cookies.ts`
  with `cascadeDependents: false`.
- **D30 Acceptance test `test/christmasCookies.test.ts`** — the story
  replayed over `InMemoryTransport` on a tmpdir copy of the fixture:
  `tag_list` → `recipe_search` (cookie, linzer, `tag:cookies`) →
  `group_create` Christmas Cookies → `feature` (explicit slug) →
  `group_create` Linzer Cookies → `group_set_items` with a `{group}` item →
  `group_add_item` the other way → `group_cycle` → `group_get` ×2,
  `group_list`, `featured_list`, distractor untouched.
- **Code fixes.** `registry.ts:306` `recipe_search` description: drop
  `group:` from the operator list (the string only; no test pins it).
  `local.ts:40-41` `NOTIFY_SUGGESTION` → `" Set RECIPE_EDITOR_URL (or pass
--notify --editor-url <url>) to invalidate it automatically."` — true for
  the CLI (both documented in USAGE) and for MCP (`.mcp.json` passes
  `RECIPE_EDITOR_URL`; `resolveNotify` needs nothing else); adjust the
  comment above it. No test pins the full string.
- **Transcripts (Fable, after review).** Two headless runs, scripts under
  the job's tmp dir, `CLAUDECODE` unset, **no `--allowedTools`** (the
  committed settings gate the run), `--mcp-config .mcp.json
--strict-mcp-config --permission-mode acceptEdits --max-turns 40
--output-format stream-json --verbose`, `CONTENT_DIRECTORY` = an
  **absolute** path to a scratch copy turned into a repo with a local
  identity and the `derivedContentPaths` `.gitignore` (23d smoke shape);
  `RECIPE_API_URL` unset. `--permission-mode acceptEdits` does not cover MCP
  tools, and in `-p` mode a non-allowed tool is denied without a prompt —
  so `permission_denials: []` is the proof that the committed
  `settings.json` list is right, and a denial means the list is wrong, not
  the model. (In the worktree `editor/content` is absent, so a misfire
  creates an empty directory rather than touching the real repo — a net,
  not the plan.)
  - **Run A — the story** on `christmas-cookies`: `claude -p
"/recipe-curator Organize the cluster of cookie recipes into one featured
group called Christmas Cookies, then combine the linzer cookie recipes into
a group that is accessible both at the top level and inside Christmas
Cookies"`. Expected tool sequence: `git_status`, `recipe_list`/`recipe_get`,
    `recipe_search` (cookie, linzer), `group_create` ×2, `feature`,
    `group_add_item {subgroup}` or `group_set_items`, `group_get`; zero
    `permission_denials`, no held-back tool called. Post-assert with the CLI
    (`group show christmas-cookies`, `featured list`) and `git log` in the
    scratch repo.
  - **Run B — meal plan** on `three-recipes-groups`: `claude -p
"/recipe-curator three vegetarian dinners under 45 minutes for this week"`
    (WebSearch + real imports, as 22e). Expected: `recipe_import {dryRun}`
    ×n, `recipe_import` ×3, `group_create` meal-plan with dated labels.
  - `examples.md` is rebuilt from the two `stream-json` logs (tool_use +
    tool_result pairs, long arrays cut with `…`, paths elided), keyed to the
    SKILL.md step numbers as today; the run summaries (turns, cost,
    denials) go in this section's gate table as 22e did. The user's "once
    for real" run is the same Run A prompt against the real content repo,
    after the stack lands — recorded as the user's step, outside the PR
    gates.
- **Docs.** This doc: D9 amendment, D27–D30, T63–T67, fact 11 amended, this
  section then close-out; roadmap all ✅; the "Next PR" paragraph becomes an
  **epic-complete** note with the landing order #138 → #139 → #140 → #141 →
  23f's PR; Deferred consolidated (adds server-side `group:` search, the
  CLI dry-run hint, `already_featured`, base64 image tool, read-only token /
  HTTP `.mcp.json` entry). `docs/backlog.md`: narrow the dry-run row to the
  CLI, add "Server-side `group:` in `recipe_search`" and "Skill v2
  follow-ups" rows as needed, strike none by hand that 23a already struck.
  Root `CLAUDE.md` "Curating recipes": MCP-first (the skill, the `recipes`
  server, `CONTENT_DIRECTORY` decides the target, the held-back seven), CLI
  as fallback in two lines; keep the file near its 80-line budget. Memory:
  `agent-curation-workflow.md` + `MEMORY.md` line — epic complete, PR
  number, landing order.

#### Steps (Opus implementer, in order)

1. Fixture `christmas-cookies` (D29) via the new
   `scripts/seed-christmas-cookies.ts` (`cascadeDependents: false`); `git
status` must show only the ten JSON + eight `.mdb` files; verify with
   `CONTENT_DIRECTORY=<copy> pnpm --silent recipes search cookie --json` →
   8 and the tag aggregate via `pnpm --silent recipes tags --json` (or the
   MCP test itself). Never run `build-fixture-indexes.ts` (T41).
2. Code fixes: `registry.ts:306` description; `local.ts:40-41`
   `NOTIFY_SUGGESTION` (no pins to update).
3. `test/christmasCookies.test.ts` (D30).
4. `SKILL.md` v2 (D27) — leave `examples.md` for the reviewer's runs but
   update its header and step keys; `.claude/settings.json` (D28);
   `test/curatorSkill.test.ts` (D28).
5. Root `CLAUDE.md` "Curating recipes"; `docs/backlog.md` rows.
6. Gates; report divergences and the fixture's `git ls-files` listing.

Then Fable: review, the two headless runs, `examples.md` rebuild, gate
rerun, close-out.

#### Tests

- `test/christmasCookies.test.ts` (D30), `test/curatorSkill.test.ts` (D28).
- Existing pins updated for `NOTIFY_SUGGESTION` (none expected; the Plan
  report lists any).
- `test/mcp.test.ts`, `mcpStdio`, `mcpHttp`, Playwright specs otherwise
  unchanged; no new Playwright spec (nested rendering is covered by
  `groups.spec.ts` on `nested-groups`).

#### Gates (in `.claude/worktrees/agent-23f`)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                                  # 530 at base + christmasCookies + curatorSkill
pnpm exec lint-staged --diff agent/23e-mcp-http       # script file (T42)
pnpm --filter recipe-editor e2e-dev -- api-write.spec.ts groups.spec.ts   # detached; the touched CLI string + a sanity pass over nested groups
grep -rn "console.log\|process.stdout" websites/recipe-website/editor/{controller,cli,mcp} websites/recipe-website/common/controller packages/cms --include='*.ts' | grep -v node_modules   # unchanged
git ls-files websites/recipe-website/editor/playwright/fixtures/test-content/christmas-cookies   # data + index files tracked (T51 check)
```

Then CI on the draft PR (lint/typecheck/unit while the base is not `main`),
the two headless runs (above), and the `examples.md` rebuild.

#### Risks → mitigations

- Three allow-lists drift (frontmatter, `settings.json`, `TOOL_NAMES`) →
  `curatorSkill.test.ts` (T64).
- A headless run writes to the real content repo → absolute scratch
  `CONTENT_DIRECTORY`, `RECIPE_API_URL` unset, `editor/content` absent in
  the worktree (T65).
- A distractor lands in the cookie cluster through an ingredient →
  the test asserts `total` 8 and the exact slug order (T66).
- Seeding plants a stray `featured-recipes/` environment →
  `cascadeDependents: false`; the fixture's `git ls-files` listing is a
  gate (T67).
- The story written into the fixture itself → the test copies to a tmpdir
  (T63).
- `feature` slug collision across the test and the runs → explicit `slug`
  (T26).

#### Not in 23f

Server-side `group:` search; `already_featured`; base64 image upload; token
scopes / read-only tokens; an HTTP entry in `.mcp.json`; a Playwright spec
on the new fixture; `context: fork`/subagent skills; plugin packaging; the
user's real run (theirs, after landing); the #138 → … → #141 landing
housekeeping (user); the parked pie-iron task.

#### Verification

`test/christmasCookies.test.ts` replays the story green on the committed
fixture; `test/curatorSkill.test.ts` pins the 21-tool allow-list in both
places; Run A completes the story headlessly from `/recipe-curator` with
zero permission denials and no held-back tool; `examples.md` shows both
runs; the user's real run is the epic's last checkbox.

#### Decisions and close-out (2026-09-15)

Commits on `agent/23f-curator-skill-v2`: `46876f5d` (this design),
`3d8819be` (implementation, 28 files, +1399 −272), the close-out (this
commit; `examples.md` from the two runs). Draft PR #142 against
`agent/23e-mcp-http`; retarget to `main` after #141 merges (T20).

- [x] D9 (amended) / D27: `SKILL.md` v2, 179 lines — 21 tools on one
      `allowed-tools:` line, eight tool-first steps with a JSON example and
      the result shape each, "Held back" (the seven) replaces "Never",
      "Fallback (CLI)" carries the flag Nevers plus `--content-dir`, the
      HTTP paragraph sits at the end of step 1 (same server name `recipes`).
- [x] D28: `.claude/settings.json` +21 `mcp__recipes__<tool>` entries;
      `test/curatorSkill.test.ts` (4 cases: destructive ⊆ held back,
      frontmatter == settings == `TOOL_NAMES − HELD_BACK`, prose audit, CLI
      lines only in Fallback).
- [x] D29: fixture `christmas-cookies`, 18 tracked files (ten `recipe.json`,
      eight `.mdb` in exactly the four recipe environments), built by
      `scripts/seed-christmas-cookies.ts`; `search cookie` → 8 in the
      designed order, `linzer` → 3, `chili` → 1, seven tags (baked,
      breakfast, christmas, cookies, dessert, dinner, quick).
- [x] D30: `test/christmasCookies.test.ts` — one 30 s case, the story end to
      end on a tmpdir copy (T63), `group_cycle` the other way, `group_get`
      ×2, `group_list`, `featured_list`, distractor untouched.
- [x] Code fixes: `recipe_search` description no longer lists `group:`;
      `NOTIFY_SUGGESTION` = " Set RECIPE_EDITOR_URL (or pass --notify
      --editor-url <url>) to invalidate it automatically." No pin needed
      updating (none existed; `api-write.spec.ts:674` asserts on
      "Maintenance", which is `STALE_EDITOR_HINT`).
- [x] `examples.md` rebuilt from Run A and Run B (below); root `CLAUDE.md`
      "Curating recipes" MCP-first (83 lines); `docs/backlog.md` dry-run row
      narrowed to the CLI, new "Server-side `group:` in `recipe_search`"
      row.

**Review (Fable).** Read the full diff; nothing sent back. The skill body
reads as the eight steps with the tools' real result shapes; the pin test's
`section()` helper and the body-only scope of check (d) are right (the
frontmatter's `Bash(pnpm --silent recipes:*)` is the permission, not a
command line). `group_cycle` and the other error codes are written as
`code: "group_cycle"` so the tool-shaped audit skips them — deliberate, and
the reason no error code can be mistaken for a tool. The seeder's removal of
`.pagination-changes.json` is correct (gitignored, but `resetData` copies
whole directories). Reviewer reran every gate (below) and ran both
transcripts.

**Gate results (verbatim, reviewer rerun in the worktree):**

| Gate                                                     | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter recipe-editor typecheck`                  | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm --filter recipe-website exec tsc --noEmit`         | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm exec vitest run`                                   | `Test Files 31 passed (31)` · `Tests 535 passed (535)` (530 at base, +1 `christmasCookies`, +4 `curatorSkill`); `curatorSkill` rerun green after the `examples.md` rebuild                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm exec lint-staged --diff agent/23e-mcp-http`        | clean (prettier + eslint; 5 ts/mjs files, 16 json/md files)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| stdout grep                                              | unchanged from 23e: `cli/output.ts` ×3, the two `--help` writes, a comment in `mcp/server.ts`, the script-only `log` default; the seeder uses `console.error`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `git ls-files …/christmas-cookies`                       | 18 files: ten `recipes/data/*/recipe.json`, `data.mdb` + `lock.mdb` under `recipes/{index,pagination/by-date,aggregates/tags,aggregates/by-tag}`; nothing under `featured-recipes/`, `groups/`, `pages/`; `git check-ignore` exit 1 on both a data file and an `.mdb`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm e2e-dev -- api-write.spec.ts groups.spec.ts` (dev) | reviewer rerun (detached, `setsid nohup`): `45 passed (2.5m)`, 0 failed, 0 flaky (implementer: the same `45 passed (2.5m)`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Run A — the story (`claude -p "/recipe-curator …"`)      | `subtype: success`, 24 turns, 66.5 s, $0.90, **`permission_denials`: one `Bash` grep (the model tried to peek at the pinned test through the placeholder `examples.md`; not in the allow-list, denied without a prompt — the settings working, and moot now the transcripts are real), no MCP denial, no held-back tool.** Calls: `git_status`, `recipe_list {limit: 1}`, `recipe_search` cookie (8) / linzer (3), `group_list`, `featured_list`, `tag_list`, `recipe_get`, `group_create` ×2, `feature {slug: "christmas-cookies-strip"}`, `group_set_items` with a `{group: "linzer-cookies", note}` item, `group_get` ×2, `featured_list`, `group_list` (`itemCount` 6 and 3), `git_log`. Post-assert with the CLI: `group show` both groups match, `featured list` one row, scratch repo four commits on `main` |
| Run B — meal plan on `three-recipes-groups`              | `subtype: success`, 21 turns, 69.1 s, $1.08, `permission_denials: []`. Two `WebSearch` (budgetbytes.com), six `recipe_import {dryRun}` (one `import_failed`), three `recipe_import` with tags, `group_create` meal-plan `week-of-2026-09-14` with `Tue · Dinner` / `Thu · Dinner` / `Sat · Dinner` labels, `group_get`, `git_log`; scratch repo four commits                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CI on the draft PR                                       | green on `3d8819be` (implementation, run 35053133105) and on `1a83e1f4` (close-out, run 35053643575): lint, Typecheck (recipe editor), Typecheck (portfolio editor), Unit tests. The recipe Playwright shards, CMS demo and Portfolio jobs run only on PRs to `main`, so they first run after the retarget (T20) — `api-write.spec.ts` and `groups.spec.ts` are covered by the reviewer rerun above                                                                                                                                                                                                                                                                                                                                                                                                                 |

Both runs: `CONTENT_DIRECTORY` absolute scratch copy with a local identity
and the `derivedContentPaths` `.gitignore`, `CLAUDECODE` unset, no
`--allowedTools`, `--mcp-config .mcp.json --strict-mcp-config
--permission-mode acceptEdits --max-turns 40`. `editor/content` stayed absent
in the worktree.

**Implementer notes (divergences from the design above, and why).**

- **`SKILL.md` is 179 lines, not ≤ ~170**: four condensation passes; the
  next cut would drop the typed-term list, the rejection rules or the tag
  vocabulary. The HTTP paragraph lives at the end of step 1 rather than
  under its own heading, where it is load-bearing.
- **Error codes are never bare backticked tokens** (`code: "group_cycle"`,
  not `` `group_cycle` ``) so the tool-shaped audit ignores them.
- **Check (d) scopes to the body** after the frontmatter.
- **The seeder removes `.pagination-changes.json`** after the rebuild — it
  is gitignored, but no other fixture carries one and `resetData` copies
  whole directories.
- **No "Skill v2 follow-ups" backlog row** — nothing genuine that Not in 23f
  / Deferred does not already carry.
- **`group_get` recipe rows assert `name: expect.any(String)`**; the slug
  order and the absence of `missing` are exact.

**Observed in Run A, recorded.** The model passed `slug` inside
`group_create.group` (accepted — the schema takes it) and created the parent
with all eight cookies, then `group_set_items` to replace the linzer three
with the nested group so nothing appears twice; it named that as the one
judgment call in its report. `group_add_item {subgroup}` was not used;
either path is documented.

**Verification (epic line for 23f):** met on the automated half —
`christmasCookies.test.ts` replays the story green on the committed fixture;
`curatorSkill.test.ts` pins the 21-tool allow-list in both places; Run A
completed the story headlessly from `/recipe-curator` with zero MCP
permission denials and no held-back tool; `examples.md` shows both runs.
**The user's real run** — the same Run A prompt against the real content
repo, after the stack lands — is the epic's last checkbox and stays theirs.

## Verification (epic-level)

- 23a: `pnpm --silent recipes feature --group <slug> --json` returns a
  featured slug and `/` renders the card; `group update` changes name and
  description and the group page reflects it; the API equivalents return the
  same objects.
- 23b: from Claude Code with `.mcp.json`, `recipe_search {query: "cookie"}`
  returns compact rows; `group_create` + `feature` complete a collection
  end-to-end against a scratch `CONTENT_DIRECTORY`.
- 23c: a group containing a group renders both levels; adding a cycle
  returns `group_cycle`; `group:<parent>` search includes nested members;
  fixtures' index versions bumped and `specVersions` snapshots updated.
- 23d: `git_log {type: "recipe", slug}` lists that recipe's commits;
  `git_restore` to an earlier revision produces a new commit and the page
  shows the old content; `git_revert` of a group creation removes the group.
- 23e: an MCP client over HTTP with a bearer token lists the same tools as
  stdio and performs one write; without a token → 401.
- 23f: the Christmas-Cookies story runs green as a vitest transcript on a
  cookies fixture (`test/christmasCookies.test.ts`, ✅) and headlessly from
  `/recipe-curator` with no permission denial (Run A, ✅). The run **once for
  real by the user** is ⤴️ **superseded → epic 24 (24f)**: on 2026-09-16,
  with #142 landed, the user chose to fulfil the use case with a "flexible,
  universal tagging / taxonomy system integrated into the CMS engine" first,
  because "it may affect how the MCP should see and operate on groups
  fundamentally" (`agent-taxonomy.md`, Why this exists and D5). The story
  becomes that epic's acceptance case: fixture replay at 24e, for real at
  24f.

## Deferred

- **`--image <local file>` on the CLI** (from the 22h row): a local file
  upload has no JSON transport; an MCP tool could carry base64 (a
  `recipe_set_image {slug, base64}` seat), decided against for this epic —
  the skill imports by URL and `imageImportUrl` covers group covers.
- **Featured dedupe**: `feature` does not refuse an already-featured target
  (D5). If agents double-feature in practice, add an `already_featured`
  code or return the existing slug.
- **F32 array references** stay deferred; nested groups (23c) resolve
  sub-groups at read time exactly as recipes are resolved today, and a
  sub-group rename or delete leaves its parents' `{group}` items dangling
  (T31/T32).
- **Server-side `group:` search** (pre-existing, found at 23c planning):
  `curation/search.ts` filters rows that never carry `groups`, so the term
  matches nothing from the CLI/MCP while the browser search honours it. 23f
  stopped the `recipe_search` description advertising it and the skill
  points at `group_get`; making it work server-side means decorating rows
  with the `by-group` aggregate at query time. Backlog row.
- **Stale-editor hint after a CLI `--dry-run`**: the MCP path omits it
  (`recipe_import` passes `notify: dryRun !== true`); the CLI still prints
  it. Backlog row, narrowed at 23f.
- **Read-only tokens / an HTTP `.mcp.json` entry**: every API token is
  full-write (backlog "API token hygiene"), so a remote `recipes` entry in
  `.mcp.json` would hand the skill a write token in a file that is committed;
  the HTTP transport stays a per-user registration under the same server
  name (D27) until scopes exist.
- **`gitPush` with no remote** answers `internal` with git's own message
  (23d); a fifth code or `not_found` if it matters in practice.
- **Group picker in the browser form**: 23c keeps sub-group rows read-only;
  wiring `GroupSelectInput` as an "Add group" row also needs the cycle check
  in `actions/groups.ts` (T38).
- Everything still open in `agent-curation.md` → Deferred and
  `docs/backlog.md` that this epic does not name.

## Parked: the pie-iron collection (content task, not this epic)

Facts gathered 2026-09-12 stay valid: pull `recipe-content` (local ahead 2,
behind 10, disjoint; plain `git pull` merges), members in order
`the-greatest-pancake-recipe-of-all-time-lagerstrom`, import
`https://fountainavenuekitchen.com/homemade-jiffy-corn-muffin-mix/`,
`super-fast-thin-crust-pizza-dough`, `instant-potato-pancakes`, import
`https://www.foodnetwork.com/recipes/food-network-kitchen/pie-iron-chocolate-and-banana-stuffed-pancakes-14007292`;
name "Pie-Iron Batters and Doughs", `--kind collection`, no image; feature
via the editor form (or the 23a seat once it lands), then export/deploy/push.

## Key files to read first (implementers)

- `editor/controller/curation/{groups,recipes,schema,errors,context,http}.ts`
  — the layer every seat extends; `updateRecipe` is the patch template,
  `createGroup`/`deleteGroup` the create/delete template.
- `editor/controller/actions/featuredRecipes.ts` +
  `editor/controller/parseFeaturedRecipeFormData.ts` — the form-side featured
  write (`buildFeaturedRecipeData`), to mirror not to call.
- `common/controller/featuredRecipeContentConfig.ts`,
  `buildFeaturedRecipeIndexValue.ts`, `createFeaturedRecipeSlug.ts`,
  `types.ts` (`FeaturedRecipe*`, `Group*`).
- `editor/controller/actions/groups.ts` `buildGroupData` — the upload
  contract on an update.
- `editor/cli/backend/{types,local,http}.ts`, `editor/cli/index.ts`,
  `editor/cli/commands/{group,delete,types}.ts`.
- `editor/src/app/api/group/[slug]/route.ts`, `editor/src/app/api/groups/route.ts`,
  `editor/controller/apiContext.ts`.
- `test/curation.test.ts`, `test/groups.test.ts`, `test/curationHttp.test.ts`;
  `editor/playwright/tests/api-write.spec.ts`,
  `editor/playwright/tests/featured-recipes.spec.ts`.
- `.claude/skills/recipe-curator/SKILL.md`.
- For 23b+: `packages/cms/git/commit.ts`, `editor/controller/actions/sync.ts`,
  `common/components/SearchForm/queryLanguage.ts`, `docs/agent-curation.md`
  (D-list, T-list, 22c/22d phase sections).
