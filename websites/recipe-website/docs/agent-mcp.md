# Recipe Website Agent MCP — "an AI-manageable recipe database"

> **This is the durable source of truth for the epic-23 work.** It persists
> in-repo so a fresh session (with cleared context) can rebuild the full
> picture by reading this file. **Read this file first** before planning any
> `23x` phase: the plan file that seeded it is gone. Update the roadmap
> **Status** column, each phase's decision checkboxes, and the **Next PR** line
> at every phase boundary. Each phase is a stacked PR and gets its own
> plan-mode pass seeded from this doc (see _How a phase is run_). The previous
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
   Code has no MCP servers configured.
10. **Tests:** vitest at the repo root, `test/*.test.ts` (434 passing at
    the base commit; precedents `curation.test.ts` (curation layer in a
    tmpdir), `curationHttp.test.ts`, `groups.test.ts` (engine in a tmpdir),
    `specVersions.test.ts` (22-T1), `derivedPaths.test.ts` (22-T2));
    Playwright `editor/playwright/tests/{api-write,groups,featured-recipes}.spec.ts`;
    fixtures `editor/playwright/fixtures/test-content/*`
    (`three-recipes-groups` has groups `week-of-may-4` and
    `weeknight-favourites`; `one-featured-recipe` has one recipe feature).
11. **Skill** `.claude/skills/recipe-curator/SKILL.md` allowlists
    `Bash(pnpm --silent recipes:*)` + `WebSearch`; `examples.md` holds real
    transcripts. Its "Never" list forbids push, delete, reindex, `--force`,
    `--overwrite`, and every routing flag.
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
  automatic.
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
  `/api/git/*` routes mirror them.
- **D8 HTTP transport (23e).** `app/api/mcp/route.ts` → `createMcpHandler`
  from `@modelcontextprotocol/server`, `runtime = "nodejs"`; auth via
  `authenticateRequest` before the handler (401 without a token/session);
  reads use `readContext()`, writes `curationContextFor(email)`; JSON
  responses, no sessions, GET → 405.
- **D9 Skill v2 (23f).** `recipe-curator` rewritten around the tools
  (`allowed-tools` uses the `mcp__recipes__*` names — verify the exact
  syntax at 23f), CLI kept as the documented fallback; `examples.md`
  regenerated from real tool transcripts; the Christmas-Cookies story
  becomes both an automated acceptance test (vitest, in-memory client,
  fixture content dir) and the user's first real run.
- **D10 `.mcp.json`** at the repo root registers `recipes` →
  `pnpm --silent --filter recipe-editor mcp`, passing through
  `CONTENT_DIRECTORY`, `RECIPE_API_URL`, `RECIPE_API_TOKEN`,
  `RECIPE_AUTHOR`, `RECIPE_EDITOR_URL`. Local mode by default (same
  resolution as the CLI).

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
- **T25 `statusFor` is exhaustive.** Adding a `CurationErrorCode` without a
  case in `curation/http.ts` `statusFor` is a type error; the HTTP backend's
  `rehydrate` and `codeForStatus` also need the new code and status, or a
  remote failure prints as `internal`.
- **T26 Default featured slugs collide within a second.**
  `createDefaultFeaturedRecipeSlug` is `YYYY-MM-DD-HH-MM-SS` in local time,
  so two `feature` calls in one second conflict (409). Tests pass explicit
  `slug`s; agents that feature several targets in a burst should too.

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR  | Branch (← parent)                   | Status   | Scope                                                                                                                                                                                                                  |
| --- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23a | `agent/23a-curation-seats` ← `main` | ✅ done  | This doc; featured seat (D5) + group update seat (D4) in the curation layer, API routes, CLI commands, backend interface (local + http), vitest + Playwright; strike two backlog rows                                  |
| 23b | `agent/23b-mcp-stdio` ← 23a         | 🟡 next  | `@modelcontextprotocol/server` + `/client` deps; `editor/mcp/{registry,server}.ts`; every D2 tool that exists by then; compact outputs (D3); `.mcp.json` (D10); vitest via `InMemoryTransport`; smoke from Claude Code |
| 23c | `agent/23c-nested-groups` ← 23b     | ⏸️ later | D6: schema, validation, index/aggregate versions, fixture regen (T3), group page + cards, search term, CLI/API/tools; Playwright `groups.spec.ts` cases; `group_add_item` accepts `{group}`                            |
| 23d | `agent/23d-git-seats` ← 23c         | ⏸️ later | D7: `curation/git.ts`, `/api/git/*`, CLI `git …`, MCP git tools; tests on a temp repo; `/git` page keeps its behaviour                                                                                                 |
| 23e | `agent/23e-mcp-http` ← 23d          | ⏸️ later | D8: `/api/mcp` route; client-transport test against `next dev` (api-write precedent) + handler-level vitest                                                                                                            |
| 23f | `agent/23f-curator-skill-v2` ← 23e  | ⏸️ later | D9: skill rewrite, examples, acceptance test of the user story, docs close-out, backlog update, memory                                                                                                                 |

**Next PR:** 23b — `agent/23b-mcp-stdio` off `agent/23a-curation-seats`
(rebase onto `main` once 23a merges). Start from the 23b seed section
below in a fresh plan-mode session; validate fact 9 (SDK v2 exports)
against the installed package before designing the registry.

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

| Gate                                                           | Result                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm --filter recipe-editor typecheck`                        | clean                                                                                  |
| `pnpm --filter recipe-website exec tsc --noEmit`               | clean                                                                                  |
| `pnpm exec vitest run`                                         | `Test Files 25 passed (25)` · `Tests 454 passed (454)` (434 at base, +20)              |
| `pnpm e2e-dev -- api-write groups featured-recipes` (dev mode) | implementer: `82 passed (3.4m)`; reviewer rerun: `82 passed (4.0m)`, 0 failed, 0 flaky |
| CI on the draft PR                                             | CI_RESULT                                                                              |

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

### PR 23b — MCP stdio `agent/23b-mcp-stdio` 🟡 next (← 23a)

Seed for the phase's plan-mode session: add `@modelcontextprotocol/server`
and `@modelcontextprotocol/client` (2.x) to the editor; `editor/mcp/registry.ts`
registers every D2 tool that exists (recipes, tags, groups incl.
`group_update`, featured, `reindex`) over a `CuratorBackend` — local or HTTP
by the same env resolution as the CLI; `editor/mcp/server.ts` wires
`StdioServerTransport`, closes LMDB envs on exit (T5/T16), logs to stderr
(T21); package script `mcp`; `.mcp.json` (D10); vitest through
`InMemoryTransport` + the client package against a tmpdir content directory;
compact rows (D3); a smoke run from Claude Code against a fixture directory
recorded in the close-out. Verification: `recipe_search {query: "cookie"}`
returns compact rows; `group_create` + `feature` complete a collection
end-to-end against a scratch `CONTENT_DIRECTORY`.

### PR 23c — Nested groups `agent/23c-nested-groups` ⏸️ later (← 23b)

Seed: D6 in full — types, `GroupItemObjectSchema` union, `checkItems`
(recipes + groups + cycle DFS, `group_cycle` / `unknown_group`), `getGroup`
resolves sub-groups, `groupsByDate` v3 and `by-recipe` v2 + `by-group` (T1
snapshots, T2 ignore list, T3 fixture regen), group page cards and "Appears
in" for groups, `group:` search transitive, CLI `--group-item`, API/tool
inputs, Playwright `groups.spec.ts` cases. Verification: a group containing
a group renders both levels; adding a cycle returns `group_cycle`;
`group:<parent>` search includes nested members; fixtures' index versions
bumped and `specVersions` snapshots updated.

### PR 23d — Git seats `agent/23d-git-seats` ⏸️ later (← 23c)

Seed: D7 — extract `controller/curation/git.ts` from `actions/sync.ts`
(T22), reads + writes with `dirty_tree` / `bad_revision` codes (T25),
`ctx.onBulkChange` → `rebuildAllIndexes` + `revalidateDerivedState` over the
registry, `/api/git/*` routes (T23), CLI `git log|show|diff|revert|restore|push`,
MCP git tools, vitest on a temp git repo with a real identity. Verification:
`git_log {type: "recipe", slug}` lists that recipe's commits; `git_restore`
to an earlier revision produces a new commit and the page shows the old
content; `git_revert` of a group creation removes the group.

### PR 23e — MCP over HTTP `agent/23e-mcp-http` ⏸️ later (← 23d)

Seed: D8 — `app/api/mcp/route.ts` with `createMcpHandler`, `runtime =
"nodejs"` (T23), `authenticateRequest` gate, per-request context; a
Playwright/API test that connects an MCP client over HTTP with a bearer
token, lists the same tools stdio lists, performs one write, and gets 401
without a token; handler-level vitest.

### PR 23f — Curator skill v2 `agent/23f-curator-skill-v2` ⏸️ later (← 23e)

Seed: D9 — rewrite `SKILL.md` around the tools (verify the `allowed-tools`
syntax for MCP tool names), keep the CLI as fallback, regenerate
`examples.md` from real transcripts, add the Christmas-Cookies acceptance
test (vitest, in-memory client, a cookies fixture), update `docs/backlog.md`
and the memory, close this doc out.

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
  cookies fixture and once for real by the user.

## Deferred

- **`--image <local file>` on the CLI** (from the 22h row): a local file
  upload has no JSON transport; an MCP tool could carry base64, which is a
  23b-or-later decision.
- **Featured dedupe**: `feature` does not refuse an already-featured target
  (D5). If agents double-feature in practice, add an `already_featured`
  code or return the existing slug.
- **F32 array references** stay deferred; nested groups (23c) resolve
  sub-groups at read time exactly as recipes are resolved today.
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
