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

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR  | Branch (← parent)                   | Status   | Scope                                                                                                                                                                                                                            |
| --- | ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23a | `agent/23a-curation-seats` ← `main` | ✅ done  | This doc; featured seat (D5) + group update seat (D4) in the curation layer, API routes, CLI commands, backend interface (local + http), vitest + Playwright; strike two backlog rows                                            |
| 23b | `agent/23b-mcp-stdio` ← `main`      | ✅ done  | `@modelcontextprotocol/server` + `/client` deps; `editor/mcp/{registry,server}.ts`; every D2 tool that exists by then; compact outputs (D3); `.mcp.json` (D10); vitest via `InMemoryTransport`; smoke from Claude Code           |
| 23c | `agent/23c-nested-groups` ← 23b     | ✅ done  | D6/D15–D18: `{group}` items, `group_cycle`, `groupsByDate` v3 + `by-group` aggregate, group cards + Appears-in on group pages, transitive `group:` search, CLI `--group-item`/`--group`, MCP `subgroup`, `nested-groups` fixture |
| 23d | `agent/23d-git-seats` ← 23c         | 🟡 next  | D7: `curation/git.ts`, `/api/git/*`, CLI `git …`, MCP git tools; tests on a temp repo; `/git` page keeps its behaviour                                                                                                           |
| 23e | `agent/23e-mcp-http` ← 23d          | ⏸️ later | D8: `/api/mcp` route; client-transport test against `next dev` (api-write precedent) + handler-level vitest                                                                                                                      |
| 23f | `agent/23f-curator-skill-v2` ← 23e  | ⏸️ later | D9: skill rewrite, examples, acceptance test of the user story, docs close-out, backlog update, memory                                                                                                                           |

**Next PR:** 23d — `agent/23d-git-seats` off `agent/23c-nested-groups`
(the stack is #138 → #139; rebase 23d onto `main` as each parent merges,
T20). Start from D7 and the 23d seed section below in a fresh plan-mode
session; validate `actions/sync.ts`'s helpers, the `/git` page's server
actions and `simple-git` usage (T23) against the code before designing.

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
| CI on the draft PR                                       | pending at close-out; see the PR                                                                                                                                                                                                                                                            |

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

**Verification (epic line for 23c):** met — `/group/spring-menus` renders
the meal-plan card and its own recipe; the API, the CLI and `group_add_item`
all return `group_cycle` for a cycle; `group:spring-menus` search returns
First, Second and Third Recipe; index versions bumped and `specVersions`
snapshots updated.

### PR 23d — Git seats `agent/23d-git-seats` 🟡 next (← 23c)

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
  sub-groups at read time exactly as recipes are resolved today, and a
  sub-group rename or delete leaves its parents' `{group}` items dangling
  (T31/T32).
- **CLI `search group:` is a no-op** (pre-existing, found at 23c planning):
  `curation/search.ts` filters rows that never carry `groups`, so the term
  matches nothing from the CLI/MCP while the browser search honours it.
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
