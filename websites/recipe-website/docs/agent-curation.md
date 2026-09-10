# Recipe Website Agent Curation — "Claude Code as curator"

> **This is the durable source of truth for the multi-phase agent-curation
> work.** It persists in-repo so a fresh session (with cleared context) can
> rebuild the full picture by reading this file. **Read this file first** before
> planning any `22x` phase: the plan file that seeded it is gone. Update the
> roadmap **Status** column, each phase's decision checkboxes, and the **Next
> PR** line at every phase boundary. Each phase is a stacked PR and gets its own
> plan-mode pass seeded from this doc (see _How a phase is run_).

Status vocabulary: ✅ done · 🟡 next / in progress · ⏸️ deferred · ⤴️ superseded.

## Why this exists

The recipe website (`websites/recipe-website`: `common/`, the `editor/` Next.js
CMS, the `export/` static site, all on the `@discontent/cms` engine) can only
be written through browser forms. The goal is to let **Claude Code act as a
curator**: given an ask like _"three vegetarian dinners under 45 minutes for
this week"_, search the web, import recipes **with a citation**, tag them, and
group them into a **meal plan** the user can see in the site now and later.

Writes land in a content directory — locally the `editor/content` symlink →
the separate `recipe-content` git repo (437 recipes at the time of writing) —
and, in a later phase, on a live editor server over HTTP.

Decisions already made with the user (2026-09-03):

- **Local CLI first; remote HTTP API is a later phase** (the work can stop
  before it).
- **Meal plans are ordered item lists with free-text labels**
  (`{recipe, label?: "Mon · Dinner", note?}`), not a day/meal grid.
- **Interface is a CLI plus a committed Claude Code skill**, not an MCP server.

## Execution model

**One phase per session.** Between phases the user re-enters plan mode and
clears context when accepting the next phase's plan. This doc is the only
memory that survives: it holds the full D-list, T-list, every phase's detail,
the handoff procedure, and each closed phase's decisions and gate results.

The roles: **Fable plans and reviews; an Opus subagent implements.** Branches
are stacked: `content-engine-test` → `agent/22a-provenance` →
`agent/22b-groups` → `agent/22c-curator-cli` → `agent/22d-remote-write` →
`agent/22e-curator-skill` → `agent/22f-group-discovery` →
`agent/22g-featured-groups`. Rebase children after a parent merges. Never
push to main; never force-push; never merge.

## How a phase is run

_(Reproduced verbatim from the accepted plan so a fresh session follows the
same procedure.)_

1. **Step 0 (Fable, done once):** enter a worktree; create this doc from the
   plan; add one pointer row (`22`) to ui-overhaul's roadmap table; commit as
   the first commit of `agent/22a-provenance`; save a memory recording the
   workflow.
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
4. Branches are stacked: `content-engine-test` → `agent/22a-provenance` →
   `agent/22b-groups` → `agent/22c-curator-cli` → `agent/22d-remote-write` →
   `agent/22e-curator-skill` → `agent/22f-group-discovery` →
   `agent/22g-featured-groups`. Rebase children after a parent merges.
   Never push to main; never force-push; never merge.

## Decisions log (D-list)

- **D1 Five stacked PRs.** Provenance (`source`) is split from groups: small
  change first, then the new content type, then the CLI, then remote, then the
  skill.
- **D2 Group routes:** list `/groups` + `/groups/[page]`, item `/group/[slug]`,
  `/group/new`, `/group/[slug]/edit`. `createPaginatedIndexRoute`
  (`packages/cms/pagination/next/createPaginatedIndexRoute.ts`) owns `[page]`
  under the list path, so `/groups/[slug]` would collide. Same split as
  `/featured-recipes` + `/featured-recipe/[slug]`.
- **D3 Groups declare no `references`/`referencedBy` in v1.** The engine's
  reference machinery is scalar-only (`packages/cms/content/references.ts:205`,
  `updateDependents.ts:235,320`). Group pages resolve items through the cached
  recipe item read, so retitles show; a recipe rename/delete leaves a dangling
  slug rendered tolerantly ("Recipe not found: slug"). Array references are
  deferred as engine follow-up **F32**. _Amended for 22g (2026-09-06):_ the
  "no `referencedBy`" half was about array references. A featured entry
  pointing at a group is a **scalar** reference (`dataField: "group"`), so
  22g adds `groupContentConfig.referencedBy = [{config: () =>
featuredRecipeContentConfig, indexField: "group"}]` (thunk). Groups still
  declare no array `references` of their own.
- **D4 "Appears in" is an aggregate** `groupsByRecipe`
  (`Record<recipeSlug, {slug, name, kind, label?}[]>`) folded from the groups
  index, shaped like `recipesByTag` in `common/controller/aggregateConfigs.ts`.
- **D5 Group schema:**
  ```ts
  type GroupKind = "meal-plan" | "collection";
  interface GroupItem {
    recipe: string;
    label?: string;
    note?: string;
  }
  interface Group {
    name: string;
    date: number;
    kind: GroupKind;
    description?: string;
    items: GroupItem[];
    [k: string]: unknown;
  }
  type GroupEntryKey = [date: number, slug: string];
  interface GroupEntryValue {
    name: string;
    kind: GroupKind;
    items: Pick<GroupItem, "recipe" | "label">[];
  }
  ```
  Data at `groups/data/<slug>/group.json`. No tags on groups in v1.
- **D6 `source` lives on the recipe data file only**, not on
  `RecipeEntryValue`: no index-shape change, no fixture regen, no
  `SEARCH_DB_NAME` bump, no specVersions churn. `source:` search field
  deferred.
  ```ts
  interface RecipeSource {
    url: string;
    name?: string;
    author?: string;
  }
  // Recipe.source?: RecipeSource
  ```
- **D7 Stop emitting the `*Imported from …*` description line** once `source`
  exists (three emitters: both branches of `common/util/importRecipeData.ts`,
  and `formatYouTubeDescription` in
  `editor/src/app/(recipes)/new-recipe/common.tsx`). Existing recipes
  untouched; migration deferred.
- **D8 CLI in `editor/cli/`; transport-agnostic logic in
  `editor/controller/curation/`.** The editor owns the registry
  (`editor/controller/contentTypes.ts`) and already runs engine code under
  `tsx`; `.npmrc` `shamefully-hoist=true` makes common's deps resolve under
  plain Node. **Import allow-list for `controller/curation/*`** (enforced by
  `test/curation.test.ts`'s import-boundary case): `node:*`, `path`,
  `fs-extra`, `zod`, `simple-git`, `@sindresorhus/slugify`,
  `@discontent/cms/content/*`, `@discontent/cms/aggregates/*`,
  `@discontent/cms/git/commit`,
  `recipe-website-common/controller/{types,recipeContentConfig,groupContentConfig,createSlug,createGroupSlug,normalizeTags,aggregateConfigs,tagSlug,data/read,data/readGroups}`
  (`data/read` **type-only** — its `getAllTags`/`getSearchCorpus` are
  Next-only), `recipe-website-common/components/SearchForm/queryLanguage`
  (pure; only imports `tagSlug`), `recipe-website-common/util/*`, `./*`,
  `../contentTypes`. **Never** `next/*`, `@/*`, `controller/actions/*`, the
  cached reads
  `data/read{RecipeItem,RecipeTags,RecipeTagIndex,GroupPages,GroupsByRecipe,RecipePages,FeaturedRecipePages}`
  (`unstable_cache` throws outside Next, see
  `packages/cms/content/next/cachedItemRead.ts:47`),
  `@discontent/cms/*/next/*`, or the symbols `getAllTags`/`getSearchCorpus`.
  Every curation function takes `ctx: {contentDirectory, author?}` first
  (T16).
- **D9 `genericActions` refactor (22d):** split `handleContentSuccess` in
  `packages/cms/content/genericActions.ts` into an exported
  `revalidateContentWrite(config, contentType, result, slug, currentSlug?)`
  (everything except the final `redirect`) plus the existing wrapper. Success
  configs move out of `"use server"` modules into
  `editor/controller/successConfigs.ts` (Next rejects non-async exports from
  `"use server"` files).
- **D10 API tokens (22d):** stored hashed (SHA-256, secret is 32 random bytes)
  in the user record `<contentDir>/users/<email>` (the path
  `editor/src/auth.ts:17` reads). Format `rcp_<id8>_<secret43>`; lookup scans
  `users/*` for the id, `timingSafeEqual` on the hash; session cookie remains
  a fallback. Fix in passing: `editor/scripts/create-user.ts:67` writes
  `<email>.json` but auth reads `<email>` (the live repo's user file has no
  extension). New `editor/src/users/index.ts` (currently empty) owns the path.
- **D11 Push stays manual.** The skill ends by telling the user to push from
  `/git`. `POST /api/git/push` deferred.
- **D12 `.claude` carve-out (22e).** The root `.gitignore` last stanza is
  exactly `.claude/*` + `!.claude/skills/` + `!.claude/settings.json`
  (was a bare `.claude`), so `settings.local.json` and `worktrees/` stay
  ignored while `.claude/settings.json` and `.claude/skills/**` are tracked;
  plus a minimal root `CLAUDE.md`.

## Traps (T-list; pass to every implementer)

- **T1** `test/specVersions.test.ts` hashes `paginationConfigs.ts` /
  `aggregateConfigs.ts` whole-file → put group configs in **new files**
  (`groupPaginationConfig.ts`, `groupAggregateConfigs.ts`, each declaring at
  least one `version: "1"`) and add two new `it()` blocks with inline
  snapshots to the test.
- **T2** `test/derivedPaths.test.ts:130-139` asserts the registry's ignore
  list exactly → add `/groups/index`, `/groups/pagination`,
  `/groups/aggregates` to the expectation.
- **T3** Fixture ordering: seed data + `rebuildIndex` first, then
  `pnpm tsx scripts/build-fixture-indexes.ts` (it skips a type whose index dir
  is absent). Check `git status` for stray `groups/` envs in fixtures without
  groups (precedent: `editor/.gitignore` last stanza).
- **T4** Configs must never import the registry; `groupContentConfig` imports
  nothing from the recipe config (no thunks needed). 22g adds a
  `referencedBy` thunk to `groupContentConfig` pointing at
  `featuredRecipeContentConfig`, which itself references
  `groupContentConfig` — the thunk breaks that cycle the same way it does
  for recipes.
- **T5** No cached (`unstable_cache`) reads from scripts/CLI (D8).
- **T6** Content repo `.gitignore` (`/home/roger/Projects/recipe-content/.gitignore`)
  is hand-written; record a manual checklist: paste
  `derivedContentPaths(recipeContentTypes)` output (the function lives in
  `packages/cms/content/derivedPaths.ts`; run it via `pnpm tsx -e` from
  `editor/`), delete stale `groups/featured.json` and `schedules/` (nothing
  reads them).
- **T7** `"use server"` modules export only async functions.
- **T8** Route split per D2.
- **T9** `editor/src/app/(editor)/(settings)/export/exportAction.ts` only
  calls `rebuildRecipeIndex()`; groups are not dependents → 22b adds
  `rebuildAllIndexes()` over the registry.
- **T10** Catch-all routes (`export (recipes)/[...slug]`, editor
  `(editor)/(pages)/[...slug]`): explicit `groups`/`group` segments win; a page
  slugged `groups` is shadowed (acceptable, note it).
- **T11** `FormData` cannot carry an empty array
  (`packages/cms/forms/parseFormData.ts:36`) → zod `items` defaults to `[]`.
- **T12** Root vitest only includes `test/**`; `.claude/worktrees/` has stale
  checkouts that pollute naive greps.
- **T13** A fresh worktree is missing two gitignored files and both gates
  misbehave without them: `editor/.env.local` (no `AUTH_SECRET` → ~40 of 46
  e2e tests fail at the base commit, pages render as if signed in) and
  `export/next-env.d.ts` (`tsc --noEmit` fails with `TS18003 No inputs were
found` because `export/tsconfig.json` has no source globs). Copy both from
  the main checkout before running anything. _(Found in 22a.)_
- **T14** Killing a Playwright run mid-flight leaves the editor's LMDB envs
  stale; the next run fails with `MDB_BAD_RSLOT` / phantom ENOENTs. From
  `editor/`: `rm -rf test-content test-settings test-remotes test-clones`.
  _(Found in 22a.)_
- **T15** `test/revalidateDerived.test.ts` (`"adds only the item catch-alls
the recipe route was missing"`) asserts the registry-derived tags exactly, so
  a registry addition moves it: expect it to gain `pagination:groups:by-date`,
  `aggregate:groups:by-recipe`, `item:groups` — verify the emitted order and
  paste it. _(Found planning 22b.)_

- **T16** `packages/cms/fs/getContentDirectory.ts` evaluates a module-scope
  `contentDirectory` const at import time and uses `CONTENT_DIRECTORY`
  verbatim; setting the env late does nothing. Scripts and the CLI must thread
  `contentDirectory` explicitly through every engine call (every engine
  function accepts it). LMDB envs are cached per process
  (`packages/cms/lmdb/environmentCache.ts`); call `closeCachedEnvironments()`
  before a process exits or before spawning a child that opens the same
  content directory. _(Found planning 22c.)_

- **T17** API route files stay thin — parse, authenticate, call
  `controller/curation/*`, revalidate, respond. A route that imports a cached
  read (`readRecipeItem` → `unstable_cache`) cannot be loaded under vitest;
  Playwright covers routes, vitest covers the pure pieces. _(Found planning
  22d.)_
- **T18** `playwright/support/tasks.ts` `resetData` is `remove()` then
  `copy()`, so a request still in flight from the previous page can recreate
  an LMDB directory in the gap (`EEXIST: mkdir …/test-content/groups/pagination`).
  Pre-existing for `recipes/pagination`; 22f's unconditional
  `/search/groups` fetch makes the window reachable from more pages. Seen
  once in ~8 implementer runs, never in the review reruns. Retry the spec;
  fix by removing into a renamed directory if it recurs.

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR  | Branch (← parent)                              | Status  | Scope                                                                                                                                        |
| --- | ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 22a | `agent/22a-provenance` ← `content-engine-test` | ✅ done | This doc; `Recipe.source` provenance; imports fill it; both apps render a citation; the form edits it; drop the "Imported from" line (D7)    |
| 22b | `agent/22b-groups` ← 22a                       | ✅ done | `groups` content type (meal plans + collections), editor CRUD, export pages, "Appears in" aggregate, `rebuildAllIndexes()`                   |
| 22c | `agent/22c-curator-cli` ← 22b                  | ✅ done | `pnpm recipes <command>` CLI over a content directory, `--json` output, transport-agnostic `controller/curation/` layer                      |
| 22d | `agent/22d-remote-write` ← 22c                 | ✅ done | Bearer-token JSON API in the editor that revalidates in-process; CLI HTTP backend + `--notify`; `genericActions` refactor (D9); tokens (D10) |
| 22e | `agent/22e-curator-skill` ← 22d                | ✅ done | Committed `.claude/skills/recipe-curator/SKILL.md`, `.claude/settings.json` allow-list, minimal root `CLAUDE.md` (D12)                       |
| 22f | `agent/22f-group-discovery` ← 22e              | ✅ done | Header "Groups" link, homepage Groups section, `/search` group rail + group results + `group:` term, ⌘K group rows, group page recipe cards  |
| 22g | `agent/22g-featured-groups` ← 22f              | 🟡 next | A featured entry may point at a group (`FeaturedRecipe.group`), featured index v2, group picker in the featured form, mixed homepage strip   |

## Phase detail

### PR 22a — Provenance `agent/22a-provenance` ✅ done

Goal: recipes carry `source`; imports fill it; both apps render a citation;
the form edits it.

Modify:

- `common/controller/types.ts` — `RecipeSource`, `Recipe.source?`.
- `common/util/importRecipeData.ts` — `RecipeLD` gains `author`
  (string | {name} | array) and `publisher {name}`; `extractAuthorName()`; set
  `source: { url, name: publisher?.name ?? hostname-without-www, author }` on
  both return paths; drop the "Imported from" prefix (D7).
- `editor/src/app/(recipes)/new-recipe/common.tsx` — YouTube branch sets
  `source: { url, name: "YouTube", author: channel }`; description keeps
  channel + text without the prefix line.
- `editor/controller/parseFormData.ts` — optional `source` object (`url`
  validated as URL when present; whole object → `undefined` when url blank).
- `editor/controller/actions/index.ts` — `buildRecipeData` passes `source`;
  `formDataFromParsed` carries it.
- `common/controller/formState.ts` — `RecipeFormData.source?`.
- `common/components/Form/index.tsx` — "Source" block (`source.url`,
  `source.name`, `source.author` text inputs, wired like `recipeYield`) in the
  Advanced section; default values include `source`.
- `common/components/View/index.tsx` + new `View/SourceLine.tsx` —
  `Source: <a rel="nofollow noopener">name ?? hostname</a> · author`,
  `data-testid="recipe-source"`, under the description.
- `common/components/View/JsonLD/index.tsx` — `isBasedOn = source.url`.

Tests: new `test/importRecipeSource.test.ts` (node env, stubbed `fetch`;
author string/object/array, publisher present/absent, no "Imported from"
prefix). Playwright: extend `editor/playwright/tests/new-recipe.spec.ts`
import case (add author/publisher to the `importable-uploads` fixture's
`naan.html` JSON-LD) to assert `recipe-source`; one manual-entry +
edit-preserves case in `recipe.spec.ts`.

Verify: `pnpm --filter recipe-editor typecheck`;
`pnpm --filter recipe-website exec tsc --noEmit`; `pnpm exec vitest run` (no
snapshot moves); `pnpm --filter recipe-editor e2e-dev -- new-recipe.spec recipe.spec`.
No fixture regeneration.

Decisions / close-out _(2026-09-04, implemented by an Opus subagent, reviewed
by Fable; commits `35d7eb8c` + the review commit)_:

- [x] **Landed as listed.** `RecipeSource` + `Recipe.source?` in `types.ts`;
      `importRecipeData` gains `AuthorLD` (string | `{name}` | array),
      exported `extractAuthorName()`, `buildSource()`, and sets `source` on
      **both** return paths; the YouTube branch sets
      `{url, name: "YouTube", author: channel}`; `parseFormData` has a
      `sourceSchema` that validates `url` only when non-blank and collapses an
      all-blank block to `undefined`; `buildRecipeData` / `formDataFromParsed`
      carry it; `Form/formContext.tsx` prefills `source` from the recipe
      (this is what makes edit preserve it); three inputs in Advanced;
      `View/SourceLine.tsx` under the description (`data-testid="recipe-source"`,
      `rel="nofollow noopener"`, `target="_blank"`); `isBasedOn` in JSON-LD.
      `RecipeEntryValue`, the search index, `SEARCH_DB_NAME`, and content
      fixtures are untouched (D6).
- [x] **D7 applied to all three emitters.** The video-URL branch of
      `importRecipeData` now returns **no description at all** (the prefix was
      all it had) — just `videoImportUrl` + `source`. `formatYouTubeDescription`
      drops the `url` parameter, joins channel + text with `---`, and returns
      `undefined` when both are empty.
- [x] **Divergence: the middle label is "Source Site", not "Source Name".**
      Playwright's `getByLabel` matches substrings, so a "Source Name" label made
      every `getByLabel("Name")` in the suite ambiguous with the recipe's own
      name field (~10 specs broke). "Source URL" / "Source Author" collide with
      nothing.
- [x] **Divergence: `hostnameLabel` is a shared util.** The implementer wrote
      it twice (importer + view); review moved it to
      `common/util/hostnameLabel.ts`. `source.author` / `publisher.name` are
      decoded with `decodeHTML` only, not the markdown-producing `decodeText`,
      because they render as plain text and markdown escaping would corrupt
      names like `O'Neill`.
- [x] **Specs beyond the brief that D7 forced.** `new-recipe.spec` (four
      description assertions lost the prefix; the katsudon case now asserts the
      hash-stripped `source.url`), `youtube-video.spec` (asserted the prefix;
      now asserts `source.url`), `ytdlp-import.spec` (gained `source`
      assertions). `recipe.spec` gained a `provenance` describe: hand-entered
      source survives an untouched edit; a recipe without a source renders no
      citation.
- [x] **Five visual baselines regenerated, on purpose.** The Advanced section
      is three inputs taller, so `new-recipe-form`, `new-recipe-form-overwrite`,
      `edit-form-populated`, `edit-form-overwrite`, `markdown-source-mode` (all
      `-e2e.png`; the mobile project owns none of them) were regenerated with
      `playwright test visual.spec --project=e2e --update-snapshots --grep "new-recipe form|edit form|markdown editor source mode"`.
      `search-reveal-control` still fails and is the pre-existing sub-pixel
      failure recorded in ui-overhaul's PR 21b close-out — not regenerated.
- [x] **Gates (dev mode, this worktree).**
      `pnpm --filter recipe-editor typecheck` → clean.
      `pnpm --filter recipe-website exec tsc --noEmit` → clean **once
      `export/next-env.d.ts` exists** (see T13).
      `pnpm exec vitest run` → `Test Files 17 passed (17)` /
      `Tests 309 passed (309)` (was 296; +13 from
      `test/importRecipeSource.test.ts`; no snapshot moves).
      `playwright test visual.spec new-recipe.spec recipe.spec youtube-video.spec ytdlp-import.spec --project=e2e --project=mobile`
      → `81 passed / 1 failed (3.5m)`, the one being `search-reveal-control`
      above. The implementer's wider sweep over every form-touching spec
      (`edit`, `edit-duplicate-slug`, `new-recipe-duplicate-slug`,
      `paste-replace`, `paste-review`, `timeline`, `yield`, `lexical-smoke`,
      `ingredient-preview`, `reference-updates`, `homepage`, `git`, `visual`)
      was `108 passed` with only the visual cases above failing before regen.
- **Next PR: PR 22b — Groups.** Seed the next plan-mode session from the
  `### PR 22b` section below, plus the D-list and T-list (T13/T14 included:
  they are worktree hygiene, not 22a-specific).

### PR 22b — Groups `agent/22b-groups` ✅ done (← 22a)

Goal: `groups` content type, editor CRUD, export pages, "Appears in".

_This section was validated against the code by three exploration passes
before implementation; the corrections they produced are folded in below and
into T1/T6/T9 and the new T15. Where this text and the recipe-type templates
disagree, this text wins._

#### Schema and engine config (`common/controller/`)

- **Types** in `types.ts` exactly as D5: `GroupKind`, `GroupItem`, `Group`,
  `GroupEntryKey = [date, slug]`, `GroupEntryValue {name, kind, items:
Pick<GroupItem,"recipe"|"label">[]}`.
- **`groupContentConfig.ts`**: `contentType: "groups"`, `dataDirectory:
"groups/data"`, `indexDirectory: "groups/index"`, **`dataFilename:
"group.json"`** (the `ContentTypeConfig` field is `dataFilename`, not
  `dataFileName`; the uploads field is `uploadsDirectory` and groups have
  none), `buildIndexKey: (slug, d) => [d.date, slug]`, `buildIndexValue` from
  `buildGroupIndexValue.ts` (strip `note`, keep item order), `createDefaultSlug`
  from `createGroupSlug.ts` (slugify `name`; fall back to a date stamp like
  `createFeaturedRecipeSlug`), `paginationIndexes: [groupsByDate]`,
  `aggregates: [groupsByRecipe]`, **no `references`/`referencedBy`** (D3).
  Imports nothing from the recipe config (T4).
- **`groupPaginationConfig.ts`** (new module, T1): `GroupListEntry {slug, date,
name, kind, itemCount}`; `groupsByDate = {name: "by-date", perPage:
GROUPS_PER_PAGE, version: "1", key: ({key: [date], id}) => [date, id],
project: …}`. `GROUPS_PER_PAGE = 12` lives in
  `components/GroupIndexPage/constants.ts`.
- **`groupAggregateConfigs.ts`** (new module, T1): `groupsByRecipe`, `name:
"by-recipe"`, `version: "1"`. Accumulator `Map<recipeSlug, {slug, name,
kind, label?, date}[]>`; `fold` pushes one entry per item, `date` from
  `entry.key[0]`; `finalize` sorts each list newest-first, drops `date`, and
  returns `Record<string, AppearsInEntry[]>` with `AppearsInEntry = {slug,
name, kind, label?}` (D4). Shape it like `recipesByTag` in
  `aggregateConfigs.ts`.
- **Reads** in `data/`: `readGroups.ts` — `getGroupBySlug({slug,
contentDirectory?})` raw via `readContentFile` (the CLI-safe read, T5);
  `readGroupPages.ts` — `groupPages = createCachedPaginationReads(...)` plus
  `readAllGroupIds()` via `readAllIds`; `readGroupsByRecipe.ts` —
  `groupsByRecipeReads = createCachedAggregateRead(...)`. **Build every
  `createCached*` read at module scope** — a call inside a render gets an
  empty `React.cache` table. There is **no `readGroupItem.ts`**: detail pages
  read the group raw with `getGroupBySlug` (ENOENT → `notFound()`), exactly as
  `featured-recipe/[slug]` does; only _recipes_ go through the cached
  `recipeItems.read`.
- **`groupFormState.ts`**: `GroupFormErrors {name, kind, description, date,
slug, items}`, `GroupFormState = ContentFormState<GroupFormErrors>`.

#### Components (`common/components/`)

- **`GroupIndexPage/{constants.ts, routes.tsx, shared.tsx}`** via
  `createPaginatedIndexRoute({reads: groupPages, render})`. `shared.tsx` =
  `PageMain > PageSection > PageHeading "Groups"`, a card grid from
  `List/Group/index.tsx` (name → `/group/<slug>`, `Badge variant="secondary"`
  from `@discontent/component-library/components/ui/badge` with the kind
  rendered "Meal plan" / "Collection", item count, `RecipeCardDate` from
  `List/shared.tsx`), `RecipePagination basePath="/groups"`, and an
  `EmptyState` (title "No groups yet", message "Group recipes into a meal plan
  or a collection to see them here.", action → `/recipes`).
- **`GroupDetailPage/index.tsx`**: props `{group, slug, items: Array<{item:
GroupItem; recipe: Recipe | null}>, actions?}`. Renders name, kind badge,
  `Markdown` description, an ordered list — each row `data-testid="group-item"`:
  label (muted, if any), a link to `/recipe/<slug>` with the recipe's name, or
  muted text `Recipe not found: <slug>` with `data-testid="group-item-missing"`;
  note underneath. Back link to `/groups`.
- **`Form/Group/index.tsx`** (`"use client"`; plus `Form/Group/Create/index.tsx`
  re-export as `Form/FeaturedRecipe/Create` does): `TextInput name="name"`
  (required); `SelectInput name="kind"` from
  `@discontent/component-library/components/Form/inputs/Select` (options
  meal-plan / collection); `LexicalMarkdownInput name="description"
dialect={RECIPE_MARKDOWN}`; **repeatable item rows** held in client state —
  row _i_ renders `RecipeSelectInput name={"items[" + i + "].recipe"}`,
  `TextInput name="items[i].label"`, `TextInput name="items[i].note"`, and a
  remove button; "Add recipe" appends a row; rows keyed by a stable id so
  removing one doesn't remount its siblings. `<details open>` Advanced:
  `TextInput name="slug"` (placeholder = slugified name), `DateTimeInput
name="date"`. `?recipe=` preselects the first row's `defaultValue`. Prefill
  from `group` on edit.
- **`Form/inputs/RecipeSelect/index.tsx`** small touch: when `defaultValue`
  hydration fails (404), render `Selected: <slug> (recipe not found)` instead
  of an empty picker; the hidden input keeps the slug.
- **`View/AppearsIn.tsx`** (async server component): `const map = (await
groupsByRecipeReads.read()) ?? {}`; when `map[slug]` is empty render nothing,
  else `<section data-testid="appears-in">` headed "Appears in" with one link
  per group to `/group/<slug>` (name, kind badge, label). Mounted at the bottom
  of `View/index.tsx` after ingredients/instructions; both apps get it because
  `RecipeView` is shared.
- **`CommandPalette/destinations.ts`**: add `{name: "Groups", href: "/groups",
icon: <lucide Layers>, group: "Browse", keywords: ["meal plan",
"collection"]}` after "Featured recipes". No homepage section (deferred).

#### Editor

- `controller/contentTypes.ts`: append `groupContentConfig` **last** (no
  edges, so order is free).
- `controller/parseGroupFormData.ts`: zod `{name: min(1), kind: enum default
"collection", description?, date?: dateEpochSchema, slug?, items:
array({recipe: min(1), label?, note?}).default([])}` (T11); trim blank
  label/note to `undefined`; drop rows whose `recipe` is blank.
- `controller/actions/groups.ts` (`"use server"`, copy
  `actions/featuredRecipes.ts`): `groupEditorConfig` with `successConfig
{itemBasePath: "/group", listPaths: [], paginationOnly: true}` (the default
  redirect is `/group/<slug>`), `label: "group"`, `authenticate:
authenticateUser`, `buildCreateData` (date defaults to now; slug =
  slugify(parsed.slug || createDefaultGroupSlug(data))), `buildUpdateData`,
  `buildCurrentIndexKey: (date, slug) => [date, slug]`. Exports
  `createGroup / updateGroup / deleteGroup / rebuildGroupIndex` (the last is
  `rebuildIndex` + `revalidateDerivedState([groupContentConfig])`). Only async
  exports (T7).
- `controller/actions/index.ts`: `export async function rebuildAllIndexes()`
  — for each config in `recipeContentTypes`: `rebuildIndex({config,
contentDirectory, cascadeDependents: false})`; then
  `revalidateDerivedState(recipeContentTypes)`. Leave `rebuildRecipeIndex` as
  is (its narrower revalidation is pinned by a test).
- `src/app/(editor)/(settings)/export/exportAction.ts`: `rebuildRecipeIndex()`
  → `rebuildAllIndexes()` (T9).
- Routes under `src/app/(recipes)/`: `groups/page.tsx`
  (`groupIndexRoutes.landing`), `groups/[page]/page.tsx` (`.numbered`),
  `group/new/{page,form}.tsx` (auth → `signIn` preserving `?recipe=`,
  `useActionState(createGroup)`, `<form id="group-form">`),
  `group/[slug]/page.tsx` (`force-dynamic`; `getGroupBySlug` ENOENT →
  `notFound()`; `Promise.all(items.map(i => recipeItems.read(i.recipe)))`;
  actions: `deleteGroup.bind(null, date, slug)` on `<form
id="delete-group-form">` plus `ConfirmDeleteButton formId
itemLabel="group" title="Delete this group?"` — the Playwright helper
  `deleteWithConfirm(page, "group")` expects a confirm button literally named
  "Delete group" — and an Edit link), `group/[slug]/edit/{page,form}.tsx`
  (auth-gated; `updateGroup.bind(null, group.date, slug)`).
- `recipe/[slug]/page.tsx`: "Group" button `href="/group/new?recipe=<slug>"`
  next to "Feature".
- Maintenance page: third form `action={rebuildGroupIndex}` "Reload Groups
  Database".
- `scripts/seed-groups.ts` (template `seed-pages.ts`): `pnpm tsx
scripts/seed-groups.ts <contentDir>`; writes `week-of-may-4` (`kind:
"meal-plan"`, `date: Date.UTC(2026, 4, 4)`, items `first-recipe` "Mon ·
  Dinner" with note "Leftovers for lunch", `second-recipe` "Tue · Dinner",
  `missing-recipe` "Wed · Dinner") and `weeknight-favourites` (`collection`,
  `date: Date.UTC(2026, 4, 1)`, items `first-recipe`, `third-recipe`), then
  `rebuildIndex({config: groupContentConfig, contentDirectory})`.

#### Export (`export/src/app/(recipes)/`)

`groups/page.tsx`, `groups/[page]/page.tsx` (+ `generateStaticParams =
groupIndexRoutes.generateStaticParams`), `group/[slug]/page.tsx` (same body
as the editor's minus actions and `force-dynamic`; `generateStaticParams` from
`readAllGroupIds()` with the `[{slug: "_"}]` never-empty guard copied from
`featured-recipe/[slug]`). **T10:** `/groups` and `/group/*` are concrete
segments and win over both catch-alls; a _page_ slugged `groups` or `group` is
shadowed — recorded here, no code.

#### Tests

- **Vitest** (root `test/`): `specVersions.test.ts` — two new `it()` blocks
  with inline snapshots for `groupPaginationConfig.ts` and
  `groupAggregateConfigs.ts` (each module must declare at least one
  `version: "1"`); `derivedPaths.test.ts` — expectation gains `/groups/index`,
  `/groups/pagination`, `/groups/aggregates` in registry order (after pages);
  `revalidateDerived.test.ts` — the `"adds only the item catch-alls the recipe
route was missing"` block gains the groups tags (T15; paste the exact emitted
  order); `exportStaticParams.test.ts` — `vi.mock` for `readGroupPages`, warm
  import, and the empty/non-empty pair for `/group/[slug]`; **new
  `test/groups.test.ts`** (`@vitest-environment node`, real engine in a
  tmpdir, harness copied from `references.test.ts`, real `groupContentConfig`
  - `recipeContentConfig` with `contentDirectory` passed explicitly): (a)
    create two recipes + one group → `readAggregate(groupsByRecipe)` maps both
    slugs with the right label and order; (b) `deleteContent` of a recipe leaves
    the group data file and the aggregate unchanged (D3); (c) `rebuildIndex({config:
groupContentConfig})` reproduces the aggregate byte-for-byte; (d) the stored
    index value has no `note`; (e) `updateContent` re-ordering items changes the
    pagination page hash and reports the aggregate `changed: true`.
- **Fixture** `editor/playwright/fixtures/test-content/three-recipes-groups`:
  `cp -r three-recipes`, run `seed-groups.ts` against it (this creates
  `groups/index`, so `build-fixture-indexes` will not skip it), then `pnpm tsx
scripts/build-fixture-indexes.ts` (T3). `git status` must show only that
  fixture's new `groups/{data,index,pagination/by-date,aggregates/by-recipe}`
  files. Add to `editor/.gitignore` (precedent: last stanza):
  `/playwright/fixtures/test-content/*/groups/` +
  `!/playwright/fixtures/test-content/three-recipes-groups/groups/`.
  `resetData(fixture)` in `editor/playwright/support/tasks.ts` is a pure copy —
  no index rebuild — so the fixture's LMDB files _are_ the index.
- **Playwright** `editor/playwright/tests/groups.spec.ts` (models:
  `pages.spec.ts` + `featured-recipes.spec.ts`; helpers live in
  `editor/playwright/support/{tasks,test,helpers}.ts`): `/groups` lists both
  seeded groups with kind badges and counts; `/group/week-of-may-4` shows three
  `group-item` rows in order, one `group-item-missing` for `missing-recipe`,
  and a link to `/recipe/first-recipe`; `/recipe/first-recipe` shows "Appears
  in" with both groups and the "Mon · Dinner" label; empty state on
  `resetData("three-recipes")`; create from `/recipe/first-recipe` → "Group" →
  sign in → first row preselected → fill name → Submit → lands on
  `/group/<slug>` and "Appears in" updates; edit label → detail shows it;
  delete via `deleteWithConfirm(page, "group")` → redirect, 404, and "Appears
  in" gone from the recipe. `accessibility.spec.ts`: two new tests, `/groups`
  and `/group/week-of-may-4` on `three-recipes-groups` (no `THEME_PAGES` entry
  — that multiplies by presets).

#### Verify (implementer runs; Fable reruns)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit         # needs export/next-env.d.ts (T13)
pnpm exec vitest run                                     # 2 new inline snapshots in specVersions; edits in derivedPaths/revalidateDerived/exportStaticParams; new groups.test.ts
pnpm --filter recipe-editor exec playwright test groups.spec featured-recipes.spec accessibility.spec pages.spec --project=e2e --project=mobile
CONTENT_DIRECTORY=$PWD/websites/recipe-website/editor/playwright/fixtures/test-content/three-recipes-groups pnpm --filter recipe-website build && ls websites/recipe-website/export/out/groups.html websites/recipe-website/export/out/group/week-of-may-4.html
```

Visual baselines: none are expected to move (no existing baseline captures the
recipe view's bottom or the palette's Browse group at the changed rows). If one
does, report it; don't regenerate.

Decisions / close-out _(2026-09-04, implemented by an Opus subagent, reviewed
by Fable; commits `bd0f2fe0` (doc) + `8ce9d36a` (implementation) + the review
commit)_:

- [x] **Landed as listed.** Types (D5) in `types.ts`; `groupContentConfig`
      with `dataFilename: "group.json"`, `[date, slug]` keys, one pagination
      index and one aggregate, no references (D3); `buildGroupIndexValue`
      strips `note`; `createDefaultGroupSlug` slugifies the name with a
      `group-<stamp>` fallback; `groupPaginationConfig.ts` /
      `groupAggregateConfigs.ts` as new modules (T1); `data/readGroups.ts`
      (raw, CLI-safe), `data/readGroupPages.ts`, `data/readGroupsByRecipe.ts`
      (both cached reads at module scope); no `readGroupItem.ts`. Components,
      editor routes, export routes, `rebuildAllIndexes()`, the export action
      switch (T9), the "Group" button, the maintenance form, the palette
      destination, `scripts/seed-groups.ts` — all as the section lists.
      Registry: `groupContentConfig` appended last.
- [x] **T1/T2/T3/T15 handled.** Two new `specVersions` inline snapshots
      (`groupPaginationConfig` `798bcf7a1f07c6a8`, `groupAggregateConfigs`
      `bc0222918ed67b5f`); `derivedPaths` expectation gained the groups triple
      after pages; `revalidateDerived`'s exact-list block gained, in emitted
      order, `pagination:groups:by-date`, `aggregate:groups:by-recipe`,
      `item:groups` (T15 confirmed). Fixture `three-recipes-groups` committed
      (`groups/{data,index,pagination/by-date,aggregates/by-recipe}` plus the
      recipes' own rebuilt `index`, `pagination`, `aggregates` — the fixture is
      a full copy). No stray `groups/` env in any other fixture.
- [x] **Divergence: vitest case (e) was impossible as written.**
      `GroupListEntry` projects `itemCount`, not the items, so re-ordering
      cannot move a pagination page hash; and `groupsByRecipe` is keyed by
      recipe, so swapping two distinct recipes' rows leaves the fold
      byte-identical. `test/groups.test.ts` pins the true matrix instead:
      re-label → aggregate `changed: true`, page hashes unchanged; re-order
      distinct recipes → neither moves (the detail page reads the data file and
      is covered by `item:groups:<slug>`); re-order one recipe's two rows →
      aggregate moves (labels swap); remove an item → both move; re-title →
      page hash moves. 11 cases in all.
- [x] **Divergence: `deleteSuccessConfig` redirects to `/groups`.** The
      section named only `successConfig`, whose default redirect is
      `/group/<slug>` — a delete would have landed on the 404 of the thing just
      deleted. The field already existed on `EditorContentConfig`.
- [x] **Divergence: `List/Group` is its own `<ul data-testid="group-list">`**,
      three-up, not `RecipeGrid`: the grid stamps `recipe-list`, which
      `checkNamesInOrder` and many specs resolve unscoped. Cards are text (no
      image — borrowing a first recipe's thumbnail is F32).
- [x] **Divergence: the export emits `out/groups.html` and
      `out/group/<slug>.html`**, not `…/index.html` (same convention as
      `out/featured-recipes.html`); the verify block's `ls` paths were wrong.
      Fixed in the section above.
- [x] **Divergence: extra `editor/.gitignore` lines** for
      `three-recipes-groups/{featured-recipes,pages}/`: the export-build check
      points `CONTENT_DIRECTORY` at the fixture itself, so the export opens
      those LMDB envs in place. Three fixture `recipe.json` files are
      prettier-formatted copies (lint-staged runs `prettier --check` from
      `editor/`, which does not see the root `.prettierignore`); parsed content
      is identical to `three-recipes`, verified at review.
- [x] **Also landed:** shared `common/util/groupKindLabel.ts` ("Meal plan" /
      "Collection") instead of four inline ternaries; two extra
      `revalidateDerived` cases pinning `rebuildGroupIndex`'s narrow radius and
      the rebuild-all seat's wide one; form row ids derived from state
      (`react-hooks/refs` rejects reading a ref during render).
- [x] **T10 recorded:** `/groups` and `/group/*` are concrete segments and win
      over both catch-alls; a _page_ slugged `groups` or `group` is shadowed.
      No code.
- [x] **T6 manual checklist (content repo, the user does this — not the
      agent).** In `/home/roger/Projects/recipe-content`. **Step 1:** replace
      `.gitignore` (currently `/transformed-images`, `/featured-recipes/index`,
      `/recipes/index`, `lock.mdb`, `*.mdb`) with the output of
      `derivedContentPaths(recipeContentTypes)` plus the two mdb globs:

      ```
      /transformed-images
      /recipes/index
      /recipes/pagination
      /recipes/aggregates
      /featured-recipes/index
      /featured-recipes/pagination
      /featured-recipes/aggregates
      /pages/index
      /pages/pagination
      /pages/aggregates
      /groups/index
      /groups/pagination
      /groups/aggregates
      /.pagination-changes.json
      lock.mdb
      *.mdb
      ```

      **Step 2:** `git rm -r groups/featured.json schedules/` — nothing reads
      either (`groups/` is now the groups content type's directory; its data
      will live at `groups/data/<slug>/group.json`). **Step 3:** commit in the
      content repo. Then, in the editor, Settings → Maintenance → "Reload
      Groups Database" (or run the export once, which now calls
      `rebuildAllIndexes()`).

- [x] **Gates (dev mode, this worktree; reviewer's rerun).**
      `pnpm --filter recipe-editor typecheck` → clean.
      `pnpm --filter recipe-website exec tsc --noEmit` → clean (with
      `export/next-env.d.ts`, T13).
      `pnpm exec vitest run` → `Test Files 18 passed (18)` /
      `Tests 326 passed (326)` (was 17 / 309 with 5 skipped; +11
      `test/groups.test.ts`, +2 `exportStaticParams`, +2 `specVersions`, +2
      `revalidateDerived`, and the 5 previously-skipped `exportStaticParams`
      cases now run).
      `playwright test groups.spec featured-recipes.spec accessibility.spec pages.spec --project=e2e --project=mobile`
      → `84 passed (5.4m)`, 0 failed, 0 skipped (the mobile project contributes 0: none of these specs is
      tagged `@mobile`).
      `playwright test visual.spec --project=e2e --project=mobile` (implementer)
      → `19 passed / 1 failed`, the failure being the pre-existing
      `search-reveal-control` sub-pixel case; **no baseline moved, none
      regenerated**.
      Export build against `three-recipes-groups` → `✓ Compiled successfully` /
      `Generating static pages (26/26)`; routes `● /group/[slug]`
      (`/group/week-of-may-4`, `/group/weeknight-favourites`), `○ /groups`,
      `● /groups/[page]` (`/groups/1`); emitted `out/groups.html` (34167 B),
      `out/groups/1.html`, `out/group/week-of-may-4.html` (31984 B); the
      latter contains `group-item-missing` and `out/recipe/first-recipe.html`
      contains `data-testid="appears-in"`. Afterwards `git checkout` the
      fixture's three touched `lock.mdb` files (the build opens the envs in
      place).
- **Next PR: PR 22c — Curator CLI.** Seed the next plan-mode session from the
  `### PR 22c` section below, plus the D-list and T-list. 22c reads groups via
  `data/readGroups.ts` (`getGroupBySlug`) and writes them through
  `createContent`/`updateContent` with `groupContentConfig`; the group input
  schema is already sketched there (`GroupInputSchema`).

### PR 22c — Curator CLI `agent/22c-curator-cli` ✅ done (← 22b)

Goal: `pnpm recipes <command>` drives the engine against a content directory
**without Next**, `--json` output, logic in an importable, transport-agnostic
layer `editor/controller/curation/` that 22d reuses behind bearer-token API
routes. The seam for 22d is a `CuratorBackend` interface with a local
implementation; 22d adds an HTTP one and `--notify`.

_This section was validated against the code by three exploration passes plus
a design pass before implementation; the numbered "Validated facts" below
correct the earlier sketch and are binding._

#### Validated facts (corrections to the earlier sketch)

1. **`pnpm recipes` does not work from the repo root** (the script lives in the
   editor package). Add a root passthrough
   `"recipes": "pnpm --filter recipe-editor recipes"` alongside the editor's
   `"recipes": "tsx ./cli/index.ts"`. A relative `--content-dir` resolves
   against `process.env.INIT_CWD ?? process.cwd()` (pnpm runs scripts with
   cwd = package dir).
2. **`create-user.ts`'s `parseArgs` call cannot be copied**: it disallows
   positionals and is strict. Use a two-stage strict `node:util` `parseArgs`
   (globals → command dispatch → per-command options). No new dependencies.
3. **There is no server-side search database.** `SEARCH_DB_NAME` is a browser
   IndexedDB name for FlexSearch. CLI search = `parseQuery` + `matchesFilter` +
   a **mandatory free-text pass** over the full index (`parseQuery` leaves
   positive bare words in `text`, not in the filter — without the second pass
   `search "chocolate"` returns everything). Export the private `fieldMatches`
   from `common/components/SearchForm/queryLanguage.ts` (one-word change) for
   parity with the browser's prefix-at-word-start matching.
4. **`getAllTags()` in `data/read.ts` is Next-only** (throws
   `incrementalCache missing`); `getRecipeBySlug`/`getRecipes` there are
   Node-safe. Tags come from
   `readAggregate({config: recipeContentConfig, aggregateConfig: recipeTags})`.
   D8 (amended) allows `common/components/SearchForm/queryLanguage` (pure; only
   imports `tagSlug`) and
   `common/controller/{aggregateConfigs,tagSlug,createGroupSlug}`; forbids the
   symbols `getAllTags`/`getSearchCorpus`; enforced by the import-boundary
   test below.
5. **`updateContent` has no slug-conflict guard** — a rename onto an occupied
   directory fails with raw `ENOTEMPTY`. The curation layer checks
   `getContentItemDirectory` existence and throws the engine's
   `SlugConflictError` itself.
6. **`deleteContent` requires `indexKey`** → delete reads the record first for
   `[date, slug]`.
7. **`createContent({action: "overwrite"})` leaks the old slug's uploads dir.**
   `--overwrite` = delete-then-create, as the editor's
   `deleteConflictingContent` (`actions/index.ts:290`) does.
8. **Committer identity preflight.** `author` on the write functions sets only
   `--author`; a content repo with no `user.email` fails inside `git commit`
   _after_ the data file and index are written. Before any write: if
   `<contentDir>/.git` exists and neither `git config user.email` nor
   `GIT_COMMITTER_EMAIL` resolves, fail with `no_git_identity` before touching
   disk. Author chain `--author "Name <email>"` > `RECIPE_AUTHOR` > `undefined`
   (repo identity; `commitContentChanges` already falls through to bare
   `git.commit`).
9. **`importRecipeData` returns `imageImportUrl`/`videoImportUrl`** and no
   `tags`/`date`/`slug`. Strip the import URLs before writing (`Recipe` has an
   index signature, so they'd persist into `recipe.json`); `imageImportUrl` →
   `uploads.image.fileImportUrl` + `data.image = basename(pathname)`;
   `videoImportUrl` → `data.video` as a URL string (the editor never downloads
   video).
10. **Fixture path**: `importable-uploads` lives at
    `editor/playwright/fixtures/test-content/importable-uploads/uploads/*.html`.
    Unit tests synthesize JSON-LD inline like `test/importRecipeSource.test.ts`
    does (`vi.stubGlobal("fetch", …)` returning `{text}`), no fixture read.
11. **Vitest has no `testTimeout` override** (5 s default); the spawned-CLI test
    passes `30_000` per case and runs with `cwd` =
    `websites/recipe-website/editor`. `execa ^9.6.1` is already a root
    dependency.
12. `--json` stdout is always exactly one object; every diagnostic (usage,
    warnings, the stale-editor hint) goes to stderr. Exit codes 0 ok / 1 error
    / **2 slug conflict**.
13. `rebuildIndex` takes a config, not a name, returns void and does not
    commit; `reindex [type]` maps the name through `recipeContentTypes` and,
    with no arg, passes `cascadeDependents: false` per type (as
    `rebuildAllIndexes` does).
14. **T16**: `packages/cms/fs/getContentDirectory.ts` evaluates a module-scope
    `contentDirectory` const at import and uses `CONTENT_DIRECTORY` verbatim;
    never rely on setting the env late — thread `contentDirectory` explicitly
    through every call (every engine function accepts it). LMDB envs are
    cached per process; the CLI calls `closeCachedEnvironments()` before exit.

#### `editor/controller/curation/` (decided design)

Every function takes `ctx: CurationContext = {contentDirectory, author?}`
first; no `getContentDirectory()`, no `@/` imports.

- **`context.ts`**: `Author {name,email}`, `CurationContext`,
  `recipePath(ctx,slug)`, `groupPath(ctx,slug)`, `RECIPE_URL_BASE="/recipe"`,
  `GROUP_URL_BASE="/group"`.
- **`errors.ts`**: re-export `SlugConflictError` from
  `@discontent/cms/content/createContent`; `CurationError(code, message,
details?)` with codes
  `not_found | slug_conflict | validation | unknown_recipe | import_failed | no_git_identity | usage | internal`;
  subclasses `NotFoundError`, `ValidationError` (details.issues =
  `z.flattenError`), `UnknownRecipeError` (details.recipes), `ImportError`,
  `NoGitIdentityError`; `toErrorObject(err) →
{error:{code,message,slug?,issues?,recipes?}}` (maps `SlugConflictError`,
  `ZodError`, ENOENT); `exitCodeFor(err) → 1|2`.
- **`schema.ts`** (zod 4): `EpochSchema` (int epoch | ISO string via
  `Date.parse`, retry with `Z` as `forms/schema/dateEpoch.ts` does),
  `RecipeInputSchema` (`name` min 1, `slug?`, `date?`, `description?`, `tags?`,
  times?, `recipeYield?`, `ingredients?: (string|Ingredient)[]`,
  `instructions?: (string|Instruction|InstructionGroup)[]`, `timelines?`
  passthrough, `source?`, `imageImportUrl?`, `videoUrl?`, `videoImportUrl?`;
  `.strict()`), `RecipePatchSchema` = partial with `.nullable()` on optional
  fields (`null` clears), `GroupInputSchema` (`name`, `slug?`, `kind` default
  `collection`, `description?`, `date?`, `items: (string|GroupItem)[]` default
  `[]`). Coercions exported for tests: `toIngredients` (strings →
  `createIngredient`, drop undefined), `toInstructions` (string → `{text}`),
  `toGroupItems` (`"slug:label"` split at first `:`), `parseInput(schema,
raw)` → `ValidationError`.
- **`recipes.ts`**: `RecipeRow` (= `MassagedRecipeEntry`, **type-only** import
  from `data/read`), `toRecipeRow`, `readAllRecipeRows(ctx)`
  (`readContentIndex`, reverse, no limit), `getRecipe(ctx,slug) →
{slug,path,url,recipe}` (`readContentFileOrNull` → `NotFoundError`),
  `listRecipes(ctx,{limit=20,offset,tag?})` (with `tag`: full rows filtered by
  `matchesFilter(row, parseQuery("tag:"+quoteQueryValue(tag)).filter)` — same
  semantics as typing `tag:t`; else paged `readContentIndex`),
  `createRecipe(ctx, raw, {overwrite?})`, `updateRecipe(ctx, currentSlug,
rawPatch)`, `deleteRecipe(ctx, slug)`. Internal `buildRecipeWrite(input,
{date, current?}) → {data, uploads}` mirrors `buildRecipeData`
  (`actions/index.ts:56`): `image = imageImportUrl ? path.parse(new
URL(u).pathname).base : current?.image`; `video = videoUrl ?? videoImportUrl
?? current?.video`; `uploads = {image:{fileImportUrl, existingFile:
current?.image}}` only; `tags = normalizeTags`, empty → undefined; strip
  `slug`/import URLs from `data`. Create: slug = `slugify(input.slug ||
createDefaultSlug({name}))`, empty → `ValidationError`; overwrite →
  `deleteRecipe` first when the dir exists; `createContent({...,
commitMessage: "Create recipe: <slug>"})`. Update: shallow merge over
  current, `null` clears, `image`/`video` carried forward, rename guarded
  (`SlugConflictError`), `currentIndexKey: [current.date, currentSlug]`.
  Delete: `deleteContent({indexKey: [date, slug]})`.
- **`search.ts`**: `matchesFreeText(row, text)` — fold, split on whitespace,
  every word must `fieldMatches` name | description | a tag | an ingredient;
  `searchRecipes(ctx, raw, {limit=20, offset}) →
{query:{raw,text,hasAdvancedSyntax}, total, recipes}` = `parseQuery` →
  filter rows by `matchesFilter && matchesFreeText`, newest first, then
  offset/limit. `listTags(ctx)` via `readAggregate(recipeTags) ?? []` (helper;
  not a v1 command).
- **`importRecipe.ts`**: `importFromUrl(url)` wraps `importRecipeData`,
  `undefined` → `ImportError("No schema.org Recipe found at <url>")`;
  `importedToInput(imported, {tags, slug, name})` (video-host URLs have no
  name → `ValidationError` with a `--name` hint); `importAndCreate(ctx, url,
{tags, slug, name, dryRun, overwrite})` → dry run returns `{dryRun:true, url,
slug, recipe, image?:{importUrl, filename}, video?}` without writing, else
  `createRecipe` result plus `source`.
- **`groups.ts`**: `getGroup(ctx,slug) → {slug,path,url,group,items:
ResolvedGroupItem[]}` (each item resolved via
  `readContentFileOrNull(recipeContentConfig)` → `{...item, name}` or
  `{...item, missing: true}`), `listGroups(ctx,{limit,offset})`
  (`readContentIndex` on `groupContentConfig` mapped to
  `{slug,date,name,kind,itemCount}`), `createGroup(ctx, raw, {force?})` (slug
  = `slugify(input.slug || createDefaultGroupSlug({name,date}))`), `setItems`,
  `addItem` (appends; duplicates allowed — meal plans repeat recipes),
  `removeItem` (removes every item with that slug; none → `NotFoundError`),
  `deleteGroup`. Unknown recipes → `UnknownRecipeError` unless `force`, then
  `warnings: ["Unknown recipe: <slug>"]` (also stderr). Writes go through
  `updateContent({config: groupContentConfig, currentIndexKey: [current.date,
slug], data: {...current, items}})`.
- **`reindex.ts`**: `reindex(ctx, contentType?) → {rebuilt: string[]}` over
  `recipeContentTypes` (`../contentTypes`); unknown name → `NotFoundError`.
- **`author.ts`**: `parseAuthor("Name <email>" | "email")`,
  `resolveAuthor(flag?, env)`, `assertCommitIdentity(contentDirectory)`
  (`directoryIsGitRepo` from `@discontent/cms/git/commit`;
  `simpleGit(...).getConfig("user.email")`; `GIT_COMMITTER_EMAIL`
  short-circuits). Called by the local backend before writes, not by curation
  functions (22d's routes get identity from the session).

#### `editor/cli/`

- **`index.ts`**: `main(argv) → exit code`. Drop a leading `--`. Stage 1
  `splitArgv`: dash tokens (and the operand of `--content-dir`/`--author`) go
  to `head`; first bare token = command, `group` takes the next bare token as
  subcommand; rest = `tail`. Parse `head` with `GLOBAL_OPTIONS` (`json`,
  `content-dir`, `author`, `help`/`-h`; strict, no positionals). Resolve
  command; parse `tail` with `{...GLOBAL_OPTIONS, ...command.options}` strict
  - `allowPositionals`. Content dir: `--content-dir` > `CONTENT_DIRECTORY` >
    `getContentDirectory()`, relative resolved against `INIT_CWD`.
    `createLocalBackend({contentDirectory, author})`; run; `emit`; on error
    `emitError` + `exitCodeFor`. `require.main === module` guard (CJS under
    tsx, as `create-user.ts`); `.finally(closeCachedEnvironments)`; set
    `process.exitCode`, don't `process.exit` mid-flush. parseArgs
    `ERR_PARSE_ARGS_*` → `CurationError("usage")`, usage on stderr.
- **`commands/*.ts`**, `CommandDef {name, usage, options, run({backend,
positionals, options, json}), format(result), write?}`: `import` (`<url>`,
  `--tags a,b`, `--slug`, `--name`, `--dry-run`, `--overwrite`), `create`
  (`--file <path>` | `--stdin`, `--overwrite`), `update` (`<slug>`, `--file` |
  `--stdin`), `show <slug>`, `list` (`--tag`, `--limit` 20, `--offset`),
  `search <query…>` (positionals joined), `delete <slug> --yes` (TTY without
  `--yes` → confirm via the `read` package already in deps; non-TTY without
  `--yes` → usage error), `group` sub-table (`create --name --kind
--description --slug --date --file|--item… --force` with `--item` `multiple:
true`; `add <group> <recipe> --label --note --force`; `remove <group>
<recipe>`; `set-items <group> --file --force`; `show <group>`; `list --limit
--offset`; `delete <group> --yes`), `reindex [contentType]`. `input.ts`:
  `readJsonInput({file?, stdin?})`, both/neither → usage error.
- **`backend/types.ts`**: `CuratorBackend {kind: "local"|"http"; importRecipe;
createRecipe; updateRecipe; getRecipe; listRecipes; searchRecipes;
deleteRecipe; createGroup; addGroupItem; removeGroupItem; setGroupItems;
getGroup; listGroups; deleteGroup; reindex; afterWrite?():
Promise<string|undefined>; close()}` — result types re-exported from
  `controller/curation/*` so 22d's HTTP backend types its responses against
  the same shapes.
- **`backend/local.ts`**: one-line delegates with `ctx`; write methods call
  `assertCommitIdentity` first; `afterWrite` returns the stderr hint
  `A running editor is stale until Settings → Maintenance → Reload.`; `close =
closeCachedEnvironments`.
- **`output.ts`**: `emit` (json → one `JSON.stringify` line on stdout; else
  `command.format`), `emitError` (json → `toErrorObject` on stdout; else
  `error: <message>` + zod issues on stderr), `warn` → stderr. Human formats:
  `list`/`search` fixed-width `slug  name  [tags]  (date)`; `show` pretty
  JSON; `group show` header + one item per line with `(missing)`.
- **Scripts**: editor `"recipes": "tsx ./cli/index.ts"`; root `"recipes":
"pnpm --filter recipe-editor recipes"`. `cli/` is inside the editor tsconfig
  `include` (`**/*.ts`) so `pnpm --filter recipe-editor typecheck` covers it;
  lint-staged runs prettier + eslint on it (no `no-console` rule).

#### Command surface

```
pnpm recipes import <url> [--tags a,b] [--slug s] [--name N] [--dry-run] [--overwrite]
pnpm recipes create (--file recipe.json | --stdin) [--overwrite]
pnpm recipes update <slug> (--file patch.json | --stdin)
pnpm recipes show <slug>
pnpm recipes list [--tag t] [--limit 20] [--offset 0]
pnpm recipes search <query…>
pnpm recipes delete <slug> [--yes]
pnpm recipes group create --name N [--kind meal-plan|collection] [--description D] [--slug s] [--date d] (--file items.json | --item slug[:label] ...) [--force]
pnpm recipes group add <group> <recipe> [--label L] [--note N] [--force]
pnpm recipes group remove <group> <recipe>
pnpm recipes group set-items <group> --file items.json [--force]
pnpm recipes group show <group> | list [--limit] [--offset] | delete <group> [--yes]
pnpm recipes reindex [contentType]
Globals: --json  --content-dir <dir>  --author "Name <email>"  --help
```

Author: `--author` > `RECIPE_AUTHOR` > content repo git identity (preflight per
fact 8). Local writes print a stderr hint that a running editor is stale until
Settings → Maintenance → Reload (or `--notify` after 22d).

#### JSON contracts (stdout, exactly one object)

| Command                             | Object                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `import --dry-run`                  | `{dryRun:true, url, slug, recipe, image?:{importUrl,filename}, video?}`                 |
| `import`                            | `{slug, date, path, url, source?}`                                                      |
| `create` / `update`                 | `{slug, date, path, url}` (`path` absolute to `recipe.json`, `url` `/recipe/<slug>`)    |
| `show`                              | `{slug, path, url, recipe}`                                                             |
| `list`                              | `{total, more, recipes: RecipeRow[]}`                                                   |
| `search`                            | `{query:{raw,text,hasAdvancedSyntax}, total, recipes: RecipeRow[]}`                     |
| `delete` / `group delete`           | `{slug, deleted: true}`                                                                 |
| `group create/add/remove/set-items` | `{slug, date, path, url, warnings?}` (`url` `/group/<slug>`)                            |
| `group show`                        | `{slug, path, url, group, items:[{recipe,label?,note?,name?,missing?:true}]}`           |
| `group list`                        | `{total, more, groups:[{slug,date,name,kind,itemCount}]}`                               |
| `reindex`                           | `{rebuilt: ["recipes","featured-recipes","pages","groups"]}`                            |
| error                               | `{error:{code, message, slug?, issues?, recipes?}}`; exit 2 for `slug_conflict`, else 1 |

#### Tests

- **`test/curation.test.ts`** (`@vitest-environment node`; harness from
  `test/groups.test.ts:60-90`; relative imports into
  `editor/controller/curation/`; real `recipeContentConfig`/`groupContentConfig`;
  `ctx = {contentDirectory}`): (1) string ingredient → `<Multiplyable
baseNumber="2"`, tags normalized/deduped, slug and date default; (2)
  duplicate create → `SlugConflictError` with `.slug`; (3) update-rename onto
  an existing slug → `SlugConflictError`, source untouched; (4) patch merge
  keeps `name`/`image`/`video`/`tags`, `tags: null` clears, date change moves
  the index key with total unchanged; (5) `--overwrite` removes a pre-planted
  `uploads/recipe/<slug>/uploads/old.jpg`, total stays 1; (6) `importAndCreate`
  with stubbed `fetch` over inline JSON-LD (copy `recipeHtml()` from
  `importRecipeSource.test.ts:22-35`, add `image`): dry run writes nothing and
  returns `image.filename`, real run sets `source.url` and `image`, data file
  has no `imageImportUrl`/`videoImportUrl`, honours `tags`/`slug`; no Recipe
  node → `import_failed`; (7) `searchRecipes("tag:x time:<30")`, free-text
  prefix via name and via ingredient, `-word` negation, `listRecipes({tag})` ≡
  `searchRecipes("tag:x")`; (8) groups: string items `"a:Mon · Dinner"` parse,
  unknown recipe → `UnknownRecipeError`, `force` → warning + item present,
  add/remove/set-items round-trip, `getGroup` marks a dangling item `missing`,
  `groupsByRecipe` aggregate reflects the add; (9) `deleteRecipe` decrements
  the index and `getRecipe` → `NotFoundError`; (10) `reindex` names all four
  types, unknown → `NotFoundError`; (11) `parseAuthor`/`resolveAuthor`; (12)
  **D8 import boundary**: read every `controller/curation/*.ts`, regex import
  specifiers against the allow-list (`node:*`, `path`, `fs-extra`, `zod`,
  `simple-git`, `@sindresorhus/slugify`, `@discontent/cms/content/*`,
  `@discontent/cms/aggregates/*`, `@discontent/cms/git/commit`,
  `recipe-website-common/controller/{types,recipeContentConfig,groupContentConfig,createSlug,createGroupSlug,normalizeTags,aggregateConfigs,tagSlug,data/read,data/readGroups}`,
  `recipe-website-common/components/SearchForm/queryLanguage`,
  `recipe-website-common/util/*`, `./*`, `../contentTypes`), hard-fail on
  `^next/`, `^@/`, `controller/actions`,
  `data/read{RecipeItem,RecipeTags,RecipeTagIndex,GroupPages,GroupsByRecipe,RecipePages,FeaturedRecipePages}`,
  `@discontent/cms/*/next/`, and the symbols `getAllTags`/`getSearchCorpus`.
- **`test/cliJson.test.ts`** (`@vitest-environment node`): `beforeAll` seeds a
  tmp content dir with one recipe + one group via `createContent`, then
  `closeCachedEnvironments()`; `run(args) = execa("pnpm",
["exec","tsx","cli/index.ts", ...args, "--content-dir", tmp], {cwd:
editorDir, reject: false, env: {...process.env, CONTENT_DIRECTORY:
undefined}})`; each `it(…, 30_000)`: `list --json` → exit 0, parseable,
  `recipes[0].slug`; `group list --json` → `groups.length === 1`,
  `itemCount`; `show missing --json` → exit 1, `error.code === "not_found"`;
  `create --stdin --json` with the existing slug → exit 2, `error.code ===
"slug_conflict"`. No network-touching case here (fetch cannot be stubbed in a
  child).
- **`test/queryLanguage.test.ts`**: unchanged, but reruns green after the
  `fieldMatches` export.

#### Verify (implementer runs; Fable reruns)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                       # +curation.test.ts, +cliJson.test.ts; no snapshot moves
pnpm recipes --help
pnpm recipes list --json --content-dir websites/recipe-website/editor/playwright/fixtures/test-content/three-recipes-groups
pnpm recipes group show week-of-may-4 --json --content-dir websites/recipe-website/editor/playwright/fixtures/test-content/three-recipes-groups   # missing-recipe → "missing": true
pnpm recipes search "tag:x" --content-dir <same>
pnpm recipes import <a JSON-LD recipe URL> --dry-run --json
cd websites/recipe-website/editor && rm -rf test-content && cp -r playwright/fixtures/test-content/three-recipes-groups test-content && pnpm recipes group create --name "Test week" --kind meal-plan --item "first-recipe:Mon · Dinner" --content-dir test-content   # writes groups/data/test-week/group.json; editor Reload shows it
```

After the fixture reads: `git checkout` the fixture's touched `lock.mdb` files
(reads open envs too, T3). Playwright: no spec changes expected; rerun
`featured-recipes.spec groups.spec` only to prove nothing regressed.
Prerequisites T13/T14 as before.

Deferred from 22c: `list --tags` command; `search` ranking parity with
FlexSearch (CLI results are unranked, newest first); `delete` of a recipe does
not touch groups that list it (D3 — the group shows "Recipe not found").

Decisions / close-out _(2026-09-05, implemented by an Opus subagent, reviewed
by Fable; commits `1f807626` (doc) + `fcefd329` (implementation, including the
review fixes) + the close-out commit)_:

- [x] **Landed as designed.** Nine curation modules, fifteen CLI modules, the
      two scripts, the one-word `fieldMatches` export, two new test files. No
      fixture, snapshot or Playwright change. `controller/curation/*` obeys the
      D8 allow-list, enforced by `test/curation.test.ts` ("D8 import boundary",
      two cases: specifier allow/deny lists with comments stripped, and
      `data/read` imported as `import type` only).
- [x] **Command table + JSON contracts above match the shipped code**, with
      two additions recorded here: `group set-items` also takes `--stdin`, and
      `import` takes `--name` (needed for video-host URLs, which carry no
      recipe name).
- [x] **Piping `--json` needs `pnpm --silent`.** Without it pnpm prints its
      script banner on **stdout** ahead of the object (the object itself does
      reach stdout, last line), so the stream is not one JSON value.
      `pnpm --silent recipes … --json | jq` is clean at both the root and the
      editor level (the loglevel is inherited by the nested `--filter` run).
      `--help` says so. **22e's skill must use `pnpm --silent`** (or call
      `pnpm exec tsx cli/index.ts` from `editor/`, which has no banner).
- [x] **Divergence: `search` accepts a leading `-` directly.** `parseArgs`
      reads `-second` as short flags; the query language reads it as negation.
      `CommandDef.takesDashedPositionals` (only `search` sets it) makes
      `index.ts` move unrecognized dash tokens behind an inserted `--` before
      parsing. `search -- -second` still works; real flags still parse. Cost: a
      typo'd flag on `search` becomes a query word rather than a usage error.
- [x] **Divergence: a rename on `update` is explicit** — it happens only when
      the patch carries `slug`. The browser form recomputes the slug from the
      name on every save, but a JSON patch that only retitles must not move
      the URL out from under every link. Guarded as specified
      (`getContentItemDirectory` exists → `SlugConflictError`, exit 2).
- [x] **Divergence: `buildRecipeWrite` declares only the `image` upload**, not
      `image` + `video`: nothing in the CLI can hand over a `File`. A patch
      with `videoUrl: null` clears the `video` field but does not delete an
      uploaded video file; there is no way to clear `image` from the CLI
      (`imageImportUrl: null` is a no-op). Both deferred.
- [x] **Divergence: `reindex <type>` lets the cascade run** (`cascadeDependents`
      default); only the all-types pass passes `false`, exactly as
      `rebuildAllIndexes` does. `reindex` skips the committer preflight —
      `rebuildIndex` never commits (review fix).
- [x] **Divergence: `UsageError` is a named subclass**; `z.strictObject` /
      `z.looseObject` instead of `.strict()` / `.passthrough()` (zod 4's
      non-deprecated spellings); `test/curation.test.ts` is 25 `it()` blocks,
      the doc's 12 numbered claims split where they assert independent things.
- [x] **Review fixes (Fable, in `fcefd329`):** `--json` is detected anywhere
      in argv _before_ parsing, so a stage-2 usage error
      (`recipes list --bogus --json`) still prints the error object (it fell
      back to prose before); `reindex` no longer calls `assertCommitIdentity`;
      the `--help` note on `pnpm --silent` states the actual mechanism.
- [x] **Identity preflight verified end to end** against a fresh `git init`
      copy of `three-recipes-groups` with `user.email ""`: `group create` →
      exit 1, `{"error":{"code":"no_git_identity",…}}`, nothing written. With
      an identity set and `--author "Cur Ator <cur@example.com>"`: exit 0 and
      `git log` shows author `Cur Ator <cur@example.com>`, committer
      `C <c@example.com>`, subject `Create group: yes`.
- [x] **Gates (this worktree; reviewer's rerun).**
      `pnpm --filter recipe-editor typecheck` → clean.
      `pnpm --filter recipe-website exec tsc --noEmit` → clean.
      `pnpm exec vitest run` → `Test Files 20 passed (20)` /
      `Tests 355 passed (355)` (was 18 / 326; +25 `test/curation.test.ts`,
      +4 `test/cliJson.test.ts`; no snapshot moves).
      `pnpm exec eslint websites/recipe-website/editor/cli websites/recipe-website/editor/controller/curation test/curation.test.ts test/cliJson.test.ts`
      → clean. Prettier → clean (lint-staged on commit).
      CLI against `three-recipes-groups`: `list --json` → `{"total":3,"more":false,…}`;
      `group show week-of-may-4 --json` → third item `"missing":true`;
      `search -second` → `third-recipe`, `first-recipe`, `2 of 2`;
      `search "tag:x" --json` → `"total":0` (the fixture has no tags; tag
      filtering is pinned by `listRecipes({tag}) ≡ searchRecipes("tag:x")` in
      vitest); `list --bogus --json` → exit 1,
      `{"error":{"code":"usage",…}}`. Against a copy in `editor/test-content`:
      `group create --name "Test week" --kind meal-plan --item "first-recipe:Mon · Dinner" --json`
      → exit 0, `groups/data/test-week/group.json` written, stderr
      `A running editor is stale until Settings → Maintenance → Reload.`;
      `create --stdin` with `{"name":"First Recipe"}` → exit **2**,
      `{"error":{"code":"slug_conflict","message":"Content with slug \"first-recipe\" already exists","slug":"first-recipe"}}`;
      create → `delete --yes --json` → `{"slug":"cli-smoke","deleted":true}`;
      `reindex --json` → `{"rebuilt":["recipes","featured-recipes","pages","groups"]}`.
      Implementer's network dry run: BBC Good Food and Budget Bytes import
      (`image.filename` resolved, `source` filled); Serious Eats and NYT
      Cooking return no JSON-LD to a plain `fetch` (bot-blocked) →
      `import_failed`, exit 1. Playwright not run (no UI change). Fixture
      `lock.mdb` restored after the reads (T3).
- **Next PR: PR 22d — Remote write.** Seed the next plan-mode session from the
  `### PR 22d` section below, plus the D-list and T-list. 22d's routes call
  `controller/curation/*` with `ctx = {contentDirectory, author}` taken from
  the session/token and add `revalidateContentWrite` (D9) after each write;
  the CLI gains `cli/backend/http.ts` implementing `CuratorBackend` (result
  types are re-exported from `cli/backend/types.ts`) and `--notify`. Validate
  the 22d section against the code first, as 22b and 22c were.

### PR 22d — Remote write `agent/22d-remote-write` ✅ done (← 22c)

Goal: bearer-token JSON API routes in the editor that call the same
`controller/curation/*` functions the CLI uses and **revalidate in-process**
(no more "Settings → Maintenance → Reload" after a write); an HTTP
`CuratorBackend` so the CLI (and 22e's skill) can drive a live editor; and
`--notify` so a local CLI write tells a running editor to drop its caches.

_This section was validated against the code before implementation; the
numbered "Validated facts" below correct the earlier sketch and are binding._

#### Validated facts (corrections to the earlier sketch)

1. **The editor has no middleware/proxy.** `src/` holds `app/ auth.ts
settings/ users/` only; `auth.config.ts`'s `authorized` callback is
   unreferenced. API routes are not intercepted, so **every write handler
   authenticates itself** via `authenticateRequest`; reads stay public (the
   editor allows guests: `allowGuest = true`).
2. **The curation write functions discard the engine's `ContentWriteResult`.**
   `createContent`/`updateContent`/`deleteContent` all return
   `{pagination, aggregates, dependents}`; `curation/recipes.ts` and
   `curation/groups.ts` return only `{slug, date, path, url}`. Revalidation
   needs the engine result → add an optional **`onWrite` hook to
   `CurationContext`** (design below). The CLI's JSON shapes do not change.
3. **`handleContentSuccess` lives in `packages/cms/content/genericActions.ts`,
   which has no `"use server"` directive**, so exporting a sync
   `revalidateContentWrite` there is legal. The T7 concern is the editor's
   `controller/actions/{index,featuredRecipes,pages,groups}.ts` (all
   `"use server"`), where the success configs are inline consts inside each
   `*EditorConfig` — they move to `editor/controller/successConfigs.ts` along
   with `RECIPE_DEPENDENT_ITEM_BASE_PATHS` (`actions/index.ts:158`). Groups
   and recipes have a `deleteSuccessConfig`; featured recipes and pages have
   their own shapes (pages: `itemBasePath: ""`, `listPaths: [{path: "/pages"}]`).
4. **User records:** the fixture is
   `editor/playwright/fixtures/users/admin@nextmail.com` (no extension;
   `{email, password}`), copied by `resetData` into `test-content/users/`.
   `auth.ts:17` reads `users/<email>`; `scripts/create-user.ts:67` writes
   `<email>.json` (D10 fix confirmed). `src/users/index.ts` exists and is
   **empty**. It must use **relative imports only** (no `@/`, no Next):
   `playwright/support/tasks.ts` imports it outside Next, and so does
   `scripts/create-token.ts`.
5. **Import fixture HTML is served by the editor itself**:
   `src/app/uploads/[filename]/route.ts` serves `test-content/uploads/*.html`
   after `resetData("importable-uploads")` (see `new-recipe.spec.ts:39`,
   `new URL("/uploads/naan.html", baseURL)`). The api-write import case posts
   that URL. `importRecipeData` fetches with `{next: {revalidate: 300}}` — the
   server caches a fetched page for 5 min, so a spec must not expect two
   different bodies from one URL.
6. **`test/stub_cache.js` records `revalidateTag` but not `revalidatePath`** →
   add `revalidatedPaths` + reset so the D9 unit test can assert
   `revalidateContentWrite` fires paths and tags and never calls `redirect`.
7. **Route files that import cached reads cannot be unit-tested under vitest**
   (`recipe/[slug]/route.ts` imports `readRecipeItem` → `unstable_cache`
   throws outside Next). Vitest covers the pure pieces (tokens,
   `authenticateRequest` with the `@/auth` stub, `revalidateContentWrite`,
   error→status mapping, body parsing); **Playwright covers the routes**. New
   trap **T17**: keep API route files thin — parse, authenticate, call
   curation, revalidate, respond.
8. **`POST /api/revalidate` is the auth-gated twin of
   `settings/test-invalidate-cache/route.ts`**: `revalidatePath("/", "layout")`
   - `revalidateDerivedState(recipeContentTypes)`; the TEST_MODE route stays
     untouched (Playwright's `global-setup.ts` fingerprints it).
9. **`auth()` from `@/auth` works in route handlers** (next-auth v5): the
   session fallback is `await auth()`; Bearer is checked first from
   `request.headers.get("authorization")`.
10. **Error contract over HTTP = the CLI's**: body is `toErrorObject(err)`
    (`{error:{code,message,slug?,issues?,recipes?}}`), status from a pure
    `statusFor(code)`: `validation`/`usage` 400, `not_found` 404,
    `slug_conflict` 409, `unknown_recipe` 422, `import_failed` 502,
    `no_git_identity`/`internal` 500, `unauthenticated` 401. The HTTP backend
    rehydrates a non-2xx body into `CurationError(code, message, details)` so
    `exitCodeFor` still yields 2 for a conflict.
11. **`--notify` semantics (decided):** after a successful local write, if
    `--notify` is passed or `RECIPE_EDITOR_URL` is set,
    `POST <url>/api/revalidate` with `Authorization: Bearer $RECIPE_API_TOKEN`;
    success replaces the stale-editor hint with `Notified <url>`; failure is a
    **stderr warning, exit stays 0** (the write succeeded). URL from
    `--editor-url <url>` > `RECIPE_EDITOR_URL`; `--notify` without a URL → usage
    error. Token is env-only (never on argv).
12. **Remote mode:** `--remote <url>` > `RECIPE_API_URL` selects
    `createHttpBackend`; token `RECIPE_API_TOKEN` (required for writes; reads
    work without). `splitArgv`'s `GLOBAL_VALUE_FLAGS` must gain `--remote` and
    `--editor-url`. Reads (`show`, `list`, `search`, `group show/list`) hit the
    API too so the skill sees the server's corpus, not a local copy.
13. **Token format (D10, confirmed):** `rcp_<id8>_<secret43>` — id = 8 hex
    chars (4 random bytes), secret = 32 random bytes base64url (43 chars).
    Stored on the user record as
    `tokens: [{id, hash: sha256(secret) hex, name, createdAt}]`; lookup scans
    `users/*` for a record whose `tokens[].id` matches, then `timingSafeEqual`
    on the hash. Revocation in v1 = delete the object from the user file
    (documented; no script).
14. **HTTPS-only.** A bearer token over plain HTTP is only acceptable on
    localhost / a trusted LAN; put the editor behind TLS before using
    `--remote` across the internet.

#### Design (decided)

**Engine — D9 split in `packages/cms/content/genericActions.ts`.**
`export function revalidateContentWrite(config: ContentSuccessConfig,
contentType: string, result: ContentWriteResult, slug: string,
currentSlug?: string): void` is the body of `handleContentSuccess` minus the
final `redirect`; `handleContentSuccess` becomes `revalidateContentWrite(...)`

- `redirect(target)`. Form-action behaviour unchanged.

**Editor — `controller/successConfigs.ts` (plain module, T7).** Exports
`recipeSuccessConfig`, `recipeDeleteSuccessConfig`,
`featuredRecipeSuccessConfig`, `pageSuccessConfig`, `pageDeleteSuccessConfig`,
`groupSuccessConfig`, `groupDeleteSuccessConfig`,
`RECIPE_DEPENDENT_ITEM_BASE_PATHS`, and
`successConfigFor(contentType, kind: "write" | "delete"): ContentSuccessConfig`
keyed by `contentType` (`recipes`, `featured-recipes`, `pages`, `groups`). The
four action modules import from it (their comment blocks move with the
objects).

**Curation layer — `onWrite` hook.**

- `context.ts`:
  `export interface ContentWriteEvent { contentType: string; kind: "create" | "update" | "delete"; result: ContentWriteResult; slug: string; previousSlug?: string }`;
  `CurationContext.onWrite?: (event: ContentWriteEvent) => void`. Type import
  from `@discontent/cms/content/types` (already on the D8 allow-list).
- `recipes.ts`: `createRecipe`, `updateRecipe` (`previousSlug: currentSlug`
  when renamed), `deleteRecipeIfPresent` (kind `delete`) call
  `ctx.onWrite?.(…)` with the engine's return. Overwrite therefore fires
  `delete` then `create`.
- `groups.ts`: `createGroup`, `writeItems` (update), `deleteGroup` likewise.
- `reindex.ts`: no engine result; routes revalidate derived state themselves.
- Boundary test unchanged (no new specifiers).

**Users and tokens — `editor/src/users/index.ts` (relative imports only).**
`UserRecord {email, password, createdAt?, tokens?: ApiToken[]}`,
`ApiToken {id, hash, name, createdAt}`, `userFilePath(contentDirectory, email)`
(= `users/<email>`, no extension), `readUser`, `writeUser`, `listUserEmails`
(readdir `users/`, skip dotfiles/dirs), `generateToken() → {token, id, hash}`,
`parseToken(token) → {id, secret} | null`, `hashSecret(secret)`,
`findUserByToken(contentDirectory, token) → email | null` (scan,
`timingSafeEqual`). `scripts/create-user.ts` switches to `userFilePath` (and
`readUser` for `userExists`). New `scripts/create-token.ts` +
`"create-token": "tsx ./scripts/create-token.ts"` (`-e <email> -n <name>`;
prompts via `read` when absent; appends to `tokens`; prints the token **once**
with the HTTPS note). `auth.ts`'s `User` interface widens to `UserRecord`
(read path unchanged).

**`editor/controller/apiAuth.ts`.**
`authenticateRequest(request: Request, contentDirectory: string): Promise<string | null>`
— Bearer header → `findUserByToken`; else `authenticateUser()` from
`controller/actions/shared` (session). Lives outside `curation/` because it
imports `@/auth`.

**`editor/controller/curation/http.ts` (pure; on the allow-list).**
`readJsonBody(request: Request): Promise<unknown>` (invalid/empty JSON →
`ValidationError`), `statusFor(code: CurationErrorCode): number` (table in
fact 10), `errorResponse(err)` → `Response.json(toErrorObject(err), {status})`,
`boolParam(url, name)` for `?overwrite=1` / `?force=1`, `intParam`. Uses only
web globals, `zod`, `./errors`. `"unauthenticated"` is **added to
`CurationErrorCode`** so the HTTP backend rehydrates it.

**Routes (`editor/src/app/api/…`; thin per T17).** Each builds
`ctx = {contentDirectory: getContentDirectory(), author: {name: email, email}, onWrite}`
where
`onWrite = (e) => revalidateContentWrite(successConfigFor(e.contentType, e.kind === "delete" ? "delete" : "write"), e.contentType, e.result, e.slug, e.previousSlug)`;
a shared `controller/apiContext.ts` builds it. Route files import
`recipe-editor/controller/...` (self-reference, as
`settings/maintenance/page.tsx` does).

| Route                                  | Methods      | Body / query                                                                   | 2xx                                             |
| -------------------------------------- | ------------ | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| `recipes/route.ts`                     | GET (public) | `?q=` → `searchRecipes`; else `?tag&limit&offset` → `listRecipes`              | 200 `SearchResult` / `RecipeListResult`         |
|                                        | POST         | `RecipeInput`, `?overwrite=1`                                                  | 201 `RecipeWriteResult`                         |
| `recipe/[slug]/route.ts`               | GET (keep)   |                                                                                | 200 record (unchanged shape for `RecipeSelect`) |
|                                        | PUT          | `RecipePatch`                                                                  | 200 `RecipeWriteResult`                         |
|                                        | DELETE       |                                                                                | 200 `{slug, deleted: true}`                     |
| `import/route.ts`                      | POST         | `{url, tags?, slug?, name?, dryRun?, overwrite?}`                              | 200 dry run / 201 `ImportCreateResult`          |
| `groups/route.ts`                      | GET (public) | `?limit&offset`                                                                | 200 `GroupListResult`                           |
|                                        | POST         | `GroupInput`, `?force=1`                                                       | 201 `GroupWriteResult`                          |
| `group/[slug]/route.ts`                | GET (public) |                                                                                | 200 `GroupDetail` (resolved items, `missing`)   |
|                                        | PUT          | `{items: (string\|GroupItem)[]}`, `?force=1` → `setItems`                      | 200                                             |
|                                        | DELETE       |                                                                                | 200 `{slug, deleted: true}`                     |
| `group/[slug]/items/route.ts`          | POST         | `{recipe, label?, note?}`, `?force=1` → `addItem`                              | 200                                             |
| `group/[slug]/items/[recipe]/route.ts` | DELETE       | → `removeItem`                                                                 | 200                                             |
| `reindex/route.ts`                     | POST         | `{contentType?}` → `reindex` then `revalidateDerivedState(recipeContentTypes)` | 200 `ReindexResult`                             |
| `revalidate/route.ts`                  | POST         | —                                                                              | 200 `{revalidated: true}`                       |

Writes: 401 `{error:{code:"unauthenticated",…}}` without a valid
token/session. All errors go through `errorResponse`.

| Error code                    | Status |
| ----------------------------- | ------ |
| `validation`, `usage`         | 400    |
| `unauthenticated`             | 401    |
| `not_found`                   | 404    |
| `slug_conflict`               | 409    |
| `unknown_recipe`              | 422    |
| `import_failed`               | 502    |
| `no_git_identity`, `internal` | 500    |

**CLI — `editor/cli/backend/http.ts` + wiring.**

- `createHttpBackend({baseUrl, token?}): CuratorBackend` — `kind: "http"`; one
  `call(method, path, {body?, query?})` helper: `fetch`,
  `Authorization: Bearer` when token, `content-type: application/json`;
  non-2xx → throw `CurationError` rehydrated from the body (fallback
  `internal` with status text); network failure →
  `CurationError("internal", "Could not reach <url>: …")`. Method map per the
  route table; `importRecipe` → `POST /api/import`; `close()` no-op;
  `afterWrite` → `undefined` (the server revalidated).
- `index.ts`: globals `remote` (string), `editor-url` (string), `notify`
  (boolean); `GLOBAL_VALUE_FLAGS` += `--remote`, `--editor-url`. Backend
  selection: `remote ?? RECIPE_API_URL` → HTTP (`RECIPE_API_TOKEN`), else
  local. Local backend gains `notify?: {url, token?}`; `afterWrite` posts
  `/api/revalidate` and returns `Notified <url>` or warns on failure (fact 11).
  `--help` documents remote mode, env vars, `pnpm --silent`.

| Env var             | Meaning                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `RECIPE_API_URL`    | Base URL of a running editor; selects the HTTP backend (`--remote`) |
| `RECIPE_API_TOKEN`  | `rcp_…` bearer token; required for remote writes and for `--notify` |
| `RECIPE_EDITOR_URL` | Editor to notify after a local write (`--editor-url`)               |
| `RECIPE_AUTHOR`     | `Name <email>` for local commits (`--author`)                       |
| `CONTENT_DIRECTORY` | Local content directory (`--content-dir`)                           |

**Token setup.** From `websites/recipe-website/editor`:
`CONTENT_DIRECTORY=<dir> pnpm create-token -e <email> -n <name>` prints the
token once. Revoke by deleting the matching `{id, …}` object from
`<dir>/users/<email>`'s `tokens` array.

#### Tests

- **`test/apiTokens.test.ts`** (`@vitest-environment node`, tmp content dir):
  `generateToken` → `parseToken` round-trip, format regex
  `^rcp_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$`; `findUserByToken` finds the right
  user among two, rejects a tampered secret, an unknown id, a malformed token;
  `userFilePath` ends in the bare email and equals
  `resolve(dir, "users", email)` (the path `auth.ts` reads).
- **`test/apiAuth.test.ts`**: `authenticateRequest` with
  `Authorization: Bearer <good>` → email; bad → falls to the `@/auth` stub
  (`auth.mockResolvedValue({user:{email}})` → email; `null` → null).
- **`test/revalidateContentWrite.test.ts`**: with the extended
  `stub_cache.js`, `revalidateContentWrite(recipeSuccessConfig, "recipes",
result, "a", "b")` fires `revalidatePath("/recipe/b")`, `("/recipe/a")`, item
  tags for both slugs, pagination/aggregate tags from `result`, and **no** `/`
  path (`paginationOnly`); `pageSuccessConfig` fires `/pages` + `/`; `redirect`
  from `stub_navigation` not called (spy).
  `successConfigFor("groups","delete").redirectTo?.("x") === "/groups"`.
- **`test/curationHttp.test.ts`**: `statusFor` table; `readJsonBody` on
  empty/invalid → `ValidationError`;
  `errorResponse(new SlugConflictError("x")).status === 409` with the CLI's
  body shape.
- **`test/curation.test.ts`** (extend): `onWrite` receives
  `{kind:"create", contentType:"recipes", slug}` with a `result` carrying
  `pagination`; rename passes `previousSlug`; overwrite fires `delete` then
  `create`; group `addItem` fires `update`. D8 boundary test still green.
- **`test/cliJson.test.ts`** (extend, one case):
  `--remote http://127.0.0.1:9 list --json` → exit 1,
  `error.code === "internal"`, message contains `Could not reach` (proves
  selection + rehydration without a server).
- **Playwright `editor/playwright/tests/api-write.spec.ts`** (`tasks.ts` gains
  `createApiToken(email = "admin@nextmail.com", name = "playwright") → token`,
  writing into `test-content/users/<email>` via `src/users`; `test.ts` exposes
  it as a fixture): after `resetData("importable-uploads")` + token:
  1. `POST /api/recipes` without header → 401; with header → 201, `slug`, then
     `page.goto("/recipe/<slug>")` renders the name and `/recipes` lists it
     (no Reload).
  2. duplicate `POST` → 409 `error.code === "slug_conflict"`; `?overwrite=1` → 201.
  3. `POST /api/import`
     `{url: new URL("/uploads/naan.html", baseURL).href, tags:["bread"]}` → 201;
     `GET /api/recipe/<slug>` has `source.url`; `/recipe/<slug>` shows the
     citation.
  4. `PUT /api/recipe/<slug>` `{name: "Renamed"}` → 200; `/recipes` and
     `/recipe/<slug>` show the new name immediately.
  5. `POST /api/groups`
     `{name:"API week", kind:"meal-plan", items:["<slug>:Mon · Dinner"]}` →
     201; `/group/api-week` renders the item; `/groups` lists it;
     `POST …/items` with an unknown recipe → 422, with `?force=1` → 200 +
     `warnings`.
  6. `DELETE /api/recipe/<slug>` → 200; `/recipe/<slug>` → 404 page;
     `/group/api-week` shows the missing-recipe marker.
  7. `POST /api/revalidate` → 401 without token, 200 with.
- Rerun `featured-recipes.spec recipe.spec groups.spec pages.spec` to guard the
  D9 refactor of the form path.

#### Verification (implementer runs; Fable reruns)

```
pnpm --filter recipe-editor typecheck
pnpm --filter recipe-website exec tsc --noEmit
pnpm exec vitest run                                  # +apiTokens, +apiAuth, +revalidateContentWrite, +curationHttp; curation/cliJson extended
pnpm --filter recipe-editor e2e-dev -- api-write.spec featured-recipes.spec recipe.spec groups.spec pages.spec
# manual, from websites/recipe-website/editor with a fixture copy in test-content:
CONTENT_DIRECTORY=test-content pnpm create-token -e admin@nextmail.com -n laptop      # prints rcp_…
CONTENT_DIRECTORY=test-content pnpm dev                                               # editor on :3000
RECIPE_API_URL=http://localhost:3000 RECIPE_API_TOKEN=rcp_… pnpm --silent recipes group create --name "Remote week" --kind meal-plan --item "first-recipe:Mon · Dinner" --json   # /groups shows it, no Reload
pnpm --silent recipes group add remote-week second-recipe --content-dir test-content --notify --editor-url http://localhost:3000   # local write; stderr "Notified …"; page updates
```

T13/T14 prerequisites as before; `git checkout` fixture `lock.mdb` files after
any fixture read.

Decisions / close-out (filled in at review):

- [x] D9 refactor landed: `revalidateContentWrite` exported from
      `packages/cms/content/genericActions.ts`; `handleContentSuccess` is that
      call plus the redirect. All seven success configs and
      `RECIPE_DEPENDENT_ITEM_BASE_PATHS` live in
      `editor/controller/successConfigs.ts` with their comment blocks; the four
      `"use server"` action modules export only async functions (T7).
- [x] D10 landed: `rcp_<id8>_<secret43>`, sha256 hash on the user record,
      `findUserByToken` scans `users/*` and compares with `timingSafeEqual`;
      `scripts/create-user.ts` writes through `writeUser` (bare email, the
      `.json` bug is gone); `scripts/create-token.ts` + `pnpm create-token`.
- [x] Endpoint table, status codes, env table, token setup, revocation note
      and HTTPS-only note are in the section above.
- [x] Gates recorded verbatim (below).
- **Decisions made in review:**
  - **A bad bearer token falls through to the session** rather than refusing
    outright, so a stale `RECIPE_API_TOKEN` in an agent's shell cannot lock out
    a signed-in browser. Pinned by `test/apiAuth.test.ts`.
  - **CSRF on the session fallback** is covered by next-auth's `SameSite=Lax`
    session cookie (not sent on cross-site POST/PUT/DELETE) plus the JSON
    content type forcing a preflight the editor never answers. No CSRF token
    on the API.
  - **`GET /api/recipe/<slug>` keeps its pre-22d record shape** (it feeds
    `RecipeSelect`); the HTTP backend rebuilds the `RecipeDetail` envelope and
    puts the API resource URL in `path`, since a remote caller has no server
    filesystem path.
  - **`rehydrate` also maps by HTTP status** (`codeForStatus`) when a body is
    not the curation error shape, so the kept GET's `{error: "Recipe not
found"}` 404 becomes `not_found`, not `internal`. Proved in Playwright:
    `show nope --remote` exits 1 with `not_found`.
  - **`PUT /api/group/<slug>` accepts a bare array as well as `{items}`** so a
    file written for `group set-items --file` posts unchanged.
  - **`POST /api/import` answers 200 for `dryRun`, 201 otherwise.**
  - **`STALE_EDITOR_HINT` text is unchanged**; the local backend appends "Pass
    --notify --editor-url <url> …" only when `--notify` was not passed, so a
    failed notify is not told to try what it just tried.
  - **`--notify` with only `RECIPE_EDITOR_URL` set is enough** (no flag
    needed); `--notify` with no URL anywhere is a `usage` error; a failed
    notify prints `warning: could not notify <url>: …` plus the stale hint and
    exits 0.
  - **The `reindex` route parses its optional body by hand** (an empty body
    means "all types"); a malformed body is a 400 `validation` error, not a 500. _(Fixed in review — the implementer's version let `JSON.parse`'s
    `SyntaxError` escape as `internal`.)_
- **Divergences from the section:** `parseBody` was not added to `http.ts`
  (routes use the existing `parseInput` from `curation/schema.ts`);
  `UnauthenticatedError` is a named subclass like `UsageError`;
  `src/users` also exports `addTokenToUser`, `usersDirectory`, `TOKEN_PATTERN`;
  `apiAuth.ts` imports `../src/users` relatively (the `@/` alias is not
  configured in root vitest); `apiContext.ts` exposes `curationContextFor`,
  `readContext` and `requireCurationContext` (throws the 401 so a route body
  is one `try`/`errorResponse`); `test/stub_navigation.js` records
  `redirects`; `api-write.spec.ts` has 12 cases, not 7 — it adds public reads,
  malformed-body 400, reindex gating, and two cases that spawn the real CLI
  with `--remote` against the test server (the only end-to-end coverage of
  `createHttpBackend`; the process never opens LMDB, so no T14 contention).
  No README/CLI-doc edit: there is no CLI doc to extend
  (`websites/recipe-website/README.md` still describes a Cypress suite —
  stale, left alone).
- **Gates (review rerun, dev mode):**
  - `pnpm --filter recipe-editor typecheck` → clean.
  - `pnpm --filter recipe-website exec tsc --noEmit` → clean.
  - `pnpm exec vitest run` → **Test Files 24 passed (24), Tests 394 passed
    (394)** (22c closed at 20 files / 355 tests; +9 `apiTokens`, +5
    `apiAuth`, +7 `revalidateContentWrite`, +12 `curationHttp`; `curation`
    25→30, `cliJson` 4→5).
  - `pnpm --filter recipe-editor e2e-dev -- api-write.spec featured-recipes.spec recipe.spec groups.spec pages.spec`
    → **120 passed (4.8m)** (the positional filter also matches
    `new-recipe.spec` and `tag-pages.spec`). `api-write.spec` alone after the
    reindex fix: **12 passed (30.7s)**.
  - Manual, against a copy of the `three-recipes` fixture and `next dev` on
    :3100, all six steps as expected:
    1. `pnpm create-token -e admin@nextmail.com -n laptop` printed one
       `rcp_…` token with the HTTPS note.
    2. Remote `group create` (`--name "Remote week" --kind meal-plan`, one
       `--item`, `--json`) with `RECIPE_API_URL` + `RECIPE_API_TOKEN` set
       answered `{"slug":"remote-week","url":"/group/remote-week",…}`;
       `/groups` listed it and `/group/remote-week` rendered "Mon · Dinner"
       with no Reload.
    3. Local `group add remote-week second-recipe` with `--content-dir`,
       `--notify` and `--editor-url http://localhost:3100` printed
       `Notified http://localhost:3100` on stderr; the page showed
       "Second Recipe" (dev log: `POST /api/revalidate 200`).
    4. Same with `--editor-url http://127.0.0.1:9` → stderr
       `warning: could not notify …: fetch failed` plus the stale hint,
       exit 0.
    5. `--notify` with no URL anywhere → `{"error":{"code":"usage",…}}`,
       exit 1.

  - No fixture `lock.mdb` churn in `git status`.

- **Next PR: PR 22e — Claude Code skill.** Seed the next plan-mode session
  from the `### PR 22e` section below plus the D-list and T-list. The skill
  must call the CLI as `pnpm --silent recipes …` (pnpm's own banner otherwise
  precedes the JSON); remote mode is `RECIPE_API_URL` + `RECIPE_API_TOKEN`
  (the token never on argv); a local write with a running editor should set
  `RECIPE_EDITOR_URL` so `--notify` is implicit. Reads in remote mode hit the
  server's corpus, which is the one the skill should search before importing.
  Validate the 22e section against the code first, as 22b–22d were.

### PR 22e — Claude Code skill `agent/22e-curator-skill` ✅ done (← 22d)

**Goal.** A committed Claude Code skill that turns _"three vegetarian dinners
under 45 minutes for this week"_ into imported, cited recipes plus a
`meal-plan` group, and the repo plumbing that lets a fresh session find and
run it: the `.gitignore` carve-out (D12), a shared `.claude/settings.json`
allow-list, and a minimal root `CLAUDE.md`. No application code changes.

#### Facts validated against the code and the live environment (2026-09-05)

1. **One invocation form, from the repo root:**
   `pnpm --silent recipes <command> … --json`. The root `package.json`
   passthrough is `"recipes": "pnpm --filter recipe-editor recipes"`; without
   `--silent` pnpm's script banner precedes the JSON, with it stdout is exactly
   one object. The 22d seed's allow-list (`Bash(pnpm recipes:*)`,
   `Bash(pnpm --filter recipe-editor recipes:*)`,
   `Bash(pnpm -C websites/recipe-website/editor recipes:*)`) prefix-matches
   none of that — **allow-list `Bash(pnpm --silent recipes:*)` (the skill) and
   `Bash(pnpm recipes:*)` (human, non-JSON runs) only** — plus
   `Skill(recipe-curator)`, found at review: in `claude -p` the Skill tool is a
   permission like any other (`permission_denials: [{tool_name: "Skill"}]`
   with settings alone), and `Skill(recipe-curator)` in `permissions.allow`
   lifts it (verified: "Launching skill: recipe-curator", no denials).
2. **Permission rule syntax:** use the `:*` form Claude Code writes itself
   (the main checkout's `.claude/settings.local.json` holds `Bash(grep:*)`,
   `Bash(pnpm exec:*)`); `WebSearch` is a bare entry. `WebFetch` is not
   needed: `import --dry-run` does the fetch.
3. **Content-directory resolution** (`editor/cli/index.ts`
   `resolveContentDirectory`): `--content-dir` > `CONTENT_DIRECTORY`, both
   resolved against `INIT_CWD` (where the user typed the command, i.e. the
   repo root), else `getContentDirectory()` → `<editor>/content`. In the main
   checkout that is a **symlink to `/home/roger/Projects/recipe-content`, the
   real content repo** — a bare `pnpm --silent recipes import …` writes and
   commits there (identity preflight, 22c fact 8). **In a worktree the symlink
   does not exist and the CLI silently creates an empty `editor/content`**
   (verified: a nonexistent `CONTENT_DIRECTORY` yields
   `{"total":0,"more":false,"recipes":[]}`, exit 0, and the directory
   appears). The skill therefore runs `list --limit 1 --json` first and stops
   to ask when `total` is 0 and the ask did not expect an empty site.
4. **The real corpus is 437 recipes with two tags in total and no groups.**
   `search "tag:vegetarian"` finds nothing there; reuse goes through free-text
   `search "<words>"` (name / description / tags / ingredients, prefix match at
   word start). Tags are something the skill _introduces_ with `--tags`, so
   the skill names a small controlled vocabulary.
5. **Query syntax the skill may use** (`common/components/SearchForm/queryLanguage.ts`):
   `tag:x`, `ingredient:x`, `name:x`, `-tag:x`, `time:<=45` (also `<`, `>`,
   `>=`; bare `time:30` = ≤30), `before:`/`after:` dates, `AND`/`OR`/`NOT`,
   parentheses. `time:` evaluates `totalTime`, else `prepTime + cookTime`; a
   recipe with **no** timing never matches a `time:` query, so "under 45
   minutes" is checked on the row's `totalTime`, never assumed from absence.
6. **JSON shapes** are the 22c table (`#### JSON contracts`). Correction to
   the plan's reading of it: `list`/`search` rows are `MassagedRecipeEntry`
   (`controller/curation/recipes.ts:63`) — `{date, slug, name, description,
ingredients?: string[], image?, tags?, prepTime?, cookTime?, totalTime?}`.
   Verified: a freshly imported recipe's `search` row carried all of them;
   fixture rows show only the first four because the fixture data has no
   more. So **`totalTime` and `tags` are checkable straight from `search`**;
   `show <slug> --json` is for `instructions`/`source`. `import --dry-run` →
   `{dryRun:true, url, slug, recipe, image?:{importUrl,filename}, video?}`
   with `recipe.{ingredients, instructions, prepTime, cookTime, totalTime,
recipeYield, source{url,name?,author?}}` (minutes, parsed from ISO
   durations); `import` → `{slug, date, path, url, source?}`; `group create`
   → `{slug, date, path, url, warnings?}`; errors → `{error:{code, message,
…}}`, exit 2 for `slug_conflict`, else 1.
7. **Candidate rejection** (re-verified today on a fixture copy): Budget Bytes
   `vegetarian-chili` dry-runs to `totalTime` 40, 20 ingredients, 6
   instructions, `source{url,name}`; BBC Good Food `easy-vegetable-lasagne`
   to 95 min with `source.author` filled; Serious Eats →
   `{"error":{"code":"import_failed","message":"No schema.org Recipe found at
…"}}`. **A 404 gives the same `import_failed` message**, so the code does not
   distinguish bot-blocked from a wrong URL — either way the candidate is
   dropped. Reject also a dry run whose `recipe.ingredients` or
   `recipe.instructions` is empty/absent, or whose `totalTime` exceeds the
   limit (or is missing when the ask has one — say so in the report). YouTube
   URLs import via the video path (`videoUrl` + `source`), acceptable only when
   the ask allows videos.
8. **Skill format** (Claude Code 2.1.259): `.claude/skills/recipe-curator/SKILL.md`
   with frontmatter `name`, `description` (what auto-invocation matches on),
   `allowed-tools` (pre-approves the listed tools inside the skill even when
   settings differ); `$ARGUMENTS` carries the ask when invoked as
   `/recipe-curator <ask>`; supporting files are referenced by relative path
   (`examples.md` holds the worked transcripts so `SKILL.md` stays short).
9. **`.claude/` in the main checkout holds `settings.local.json` and
   `worktrees/`.** The carve-out `.claude/*` + `!.claude/skills/` +
   `!.claude/settings.json` keeps both ignored (today every probe hits the
   bare `.claude` line, `.gitignore:57`). The anchored `.claude/*` stops
   ignoring nested `.claude` dirs elsewhere; none exist. Worktrees under
   `.claude/worktrees/<name>/` are full checkouts, so the skill is visible in
   a worktree session too — where fact 3's empty-content trap applies.
10. **`CLAUDE.md`** is read from the repo root in any subdirectory session;
    keep it under ~80 lines. `README.md`'s test section is stale (Cypress; the
    suite is Playwright) — `CLAUDE.md` states the current commands; the README
    rewrite is deferred, not silently done.
11. **The e2e run is headless:** from the worktree root,
    `CONTENT_DIRECTORY=<scratch copy of three-recipes-groups> claude -p "<ask>" --permission-mode acceptEdits --max-turns 40 --output-format stream-json --verbose`
    with **no `--allowedTools`**, so the run exercises the committed
    `.claude/settings.json` (the skill auto-invokes from its description;
    `stream-json` keeps the tool calls for the summary). Nested inside a
    Claude Code session this works as-is. The transcript summary is in the
    close-out below.
12. **Remote mode in the skill:** only when `RECIPE_API_URL` is set (then
    `RECIPE_API_TOKEN` must be too, never on argv); with a local write and
    `RECIPE_EDITOR_URL` set, `--notify` is implicit (22d). The skill never
    passes `--remote`, `--editor-url`, or `--notify` itself.
13. **Writes into a content directory with no `.git` succeed** (fixture copy:
    `group create` exit 0; `import` exit 0, retry → `slug_conflict` exit 2;
    `--item nope:…` → `unknown_recipe` exit 1). The identity preflight only
    applies to a git repo, so the scratch e2e needs no `RECIPE_AUTHOR`. The
    "A running editor is stale until Settings → Maintenance → Reload" stderr
    hint also prints after `--dry-run`, which writes nothing — cosmetic,
    deferred.
14. **WebSearch cannot surface BBC Good Food** (found at review): a query
    whose results include `bbcgoodfood.com` fails with `API Error: 400 The
following domains are not accessible to our user agent` because the site
    blocks Anthropic's crawler. The importer's plain `fetch` of a BBC URL is
    unaffected (fact 7), so the skill says to rephrase or name another site,
    and that a known URL is still fair game. Budget Bytes is searchable.

#### Design (decided)

- **Root `.gitignore`** — replace the bare `.claude` line (last stanza) with:

  ```
  .claude/*
  !.claude/skills/
  !.claude/settings.json
  ```

- **`.claude/settings.json`:**

  ```json
  {
    "permissions": {
      "allow": [
        "Bash(pnpm --silent recipes:*)",
        "Bash(pnpm recipes:*)",
        "WebSearch",
        "Skill(recipe-curator)"
      ]
    }
  }
  ```

- **`.claude/skills/recipe-curator/SKILL.md`** (+ `examples.md`). Frontmatter:
  `name: recipe-curator`;
  `description: Find, import, cite and group recipes for the recipe website — meal plans and collections — via pnpm recipes. Use for asks like "plan dinners for the week", "import this recipe", "make a collection of …".`;
  `allowed-tools: Bash(pnpm --silent recipes:*), WebSearch`. Body under ~150
  lines; every command line copied from `pnpm recipes --help`:
  1. **Where writes go.** `pnpm --silent recipes` from the repo root writes
     the editor's `content` directory (in the main checkout: the real content
     repo, committed) unless `CONTENT_DIRECTORY` or `--content-dir` points
     elsewhere; with `RECIPE_API_URL` set every command goes to that editor
     instead. Run `list --limit 1 --json` first, then `show <that slug>
--json`: its absolute `path` is the resolved content directory (found at
     review: the first headless run spent nine turns reading CLI source to
     learn this because `env` was not an allowed command). State the mode and
     the corpus size in the report's first line; if `total` is 0 and the ask
     did not expect an empty site, stop and ask (fact 3). That is the only
     stop: a `path` outside the editor's own `content` directory means
     `CONTENT_DIRECTORY`/`--content-dir` was set on purpose and **is** the
     target (the second headless run vetted three recipes and then refused
     to write to the "throwaway fixture"). The skill also tells the model to
     read the JSON itself rather than pipe it through `node -e`/`jq`, and not
     to run `env`/`printenv` — only the CLI command is pre-approved.
  2. **Turn the ask into constraints:** cuisine, diet, max total minutes,
     servings, count, days/meals, exclusions; ask once if count or diet is
     missing.
  3. **Reuse first:** `search "<key words>" --json` (free text; the corpus is
     mostly untagged), filter rows on `totalTime`/`ingredients`, `show <slug>
--json` only when instructions matter; prefer an existing recipe over a new
     import.
  4. **Find candidates** with WebSearch; prefer sites known to expose JSON-LD
     (BBC Good Food, Budget Bytes) and skip known bot-blocked ones (Serious
     Eats, NYT Cooking); one search per constraint set, ≤ 8 candidate pages
     without asking.
  5. **Dry-run each:** `import <url> --dry-run --json`; reject per fact 7;
     dedupe against step 3 by slug.
  6. **Import the keepers:** `import <url> --tags <vocab…> --json`; never
     `--overwrite`; on `slug_conflict` (exit 2) use the existing slug;
     `source.url` comes from the importer — never strip it. Tag vocabulary:
     diet (`vegetarian`, `vegan`, `gluten-free`), meal (`breakfast`, `lunch`,
     `dinner`, `dessert`, `snack`), speed (`quick` = ≤ 30 min), cuisine as one
     lowercase word.
  7. **Group:** `group create --name "Week of <YYYY-MM-DD>" --kind meal-plan
--item "<slug>:Mon · Dinner" … --json` (`collection` for non-dated asks);
     on `unknown_recipe` fix the slug, never `--force`.
  8. **Report:** a `Day | Recipe | Time | Source` table with `/recipe/<slug>`
     links and the `/group/<slug>` link; end with "push from `/git` when
     ready". The skill never pushes, never deletes, never runs `reindex`,
     never passes `--author`, `--remote`, `--editor-url`, `--notify`,
     `--overwrite` or `--force`.

  `examples.md`: one worked transcript of the vegetarian-dinners ask
  (commands and abbreviated JSON from fact 7's dry runs) plus a collection
  example.

- **Root `CLAUDE.md`** (≤ 80 lines): repo shape (`packages/*`, `websites/*`,
  editor vs export); the skill and its one command form; the three durable
  docs (`websites/recipe-website/docs/agent-curation.md`,
  `websites/recipe-website/docs/ui-overhaul.md`,
  `packages/cms/docs/incremental-regeneration.md`); verification commands
  (`pnpm --filter recipe-editor typecheck`,
  `pnpm --filter recipe-website exec tsc --noEmit`, `pnpm exec vitest run`,
  `pnpm --filter recipe-editor e2e-dev -- <spec>`); the worktree / T13 / T14
  notes in two lines; "content lives in a separate repo; never commit under
  `editor/content`".

#### Verification

- **Tracking:** `git ls-files .claude` lists `settings.json` and
  `skills/recipe-curator/{SKILL.md,examples.md}`;
  `git check-ignore -v .claude/settings.local.json .claude/worktrees/x` still
  hit; `git status` clean of `.claude/worktrees`.
- **Gates unchanged** (no code): both typechecks, `pnpm exec vitest run`
  (24 files / 395 tests — the 22d close-out recorded 394 before its own
  review commit added the `cliJson` unreachable-remote case), `pnpm exec
prettier --check` on the new
  markdown/JSON (lint-staged runs it on commit).
- **Command-line audit:** every `pnpm --silent recipes` line in `SKILL.md` /
  `examples.md` is grepped and checked against `pnpm recipes --help` (flags
  exist; `--item` shorthand is `slug:label`, split at the first colon).
- **End-to-end (headless, scratch content):** copy
  `editor/playwright/fixtures/test-content/three-recipes-groups` to a scratch
  directory; run the fact-11 command with the ask "three vegetarian dinners
  under 45 minutes for this week"; assert the transcript invoked the skill,
  dry-ran ≤ 8 pages, and `group list --json` against the scratch copy shows a
  `meal-plan` with 3 items whose recipes have `source.url` and
  `totalTime ≤ 45`; then `CONTENT_DIRECTORY=… pnpm --filter recipe-editor dev`
  and check `/groups` renders it. Record the transcript summary here.
- **Decided with the user (2026-09-05):** the e2e run writes only to the
  scratch fixture copy; Fable runs it headless and records the summary before
  opening the PR. An interactive run against the real content repo is
  optional and outside this phase's gates.

Decisions / close-out (review, 2026-09-05):

- [x] `.gitignore` carve-out + skill + settings + `CLAUDE.md` tracked:
      `git ls-files .claude CLAUDE.md` → `.claude/settings.json`,
      `.claude/skills/recipe-curator/SKILL.md`,
      `.claude/skills/recipe-curator/examples.md`, `CLAUDE.md`;
      `git check-ignore -v .claude/settings.local.json .claude/worktrees/x` →
      both `.gitignore:57:.claude/*`; `git status` clean.
- [x] End-to-end transcript summary recorded below.
- **Decisions made at review:**
  - `Skill(recipe-curator)` added to `.claude/settings.json` (fact 1): without
    it a headless run cannot invoke the skill at all and falls back to reading
    `SKILL.md` by hand.
  - Skill step 1 gained `show <slug> --json` → `path` as the "where am I
    writing" check (Design step 1); `examples.md` shows the scratch path.
  - Free-text search words are ANDed and match at a word start
    (`search "lentil chili beans"` → 0 rows; `"lentil"` and `"beans"` → 1
    each), so the skill searches one or two words at a time. Found by the
    implementer building `examples.md`.
  - The third under-45 candidate in `examples.md` is BBC Good Food's
    `spinach-sweet-potato-lentil-dhal` at exactly 45 min, used as the "at the
    limit, say so" case.
- **Divergences from the section:** none beyond the three items above and the
  test count (395, not 394).
- **Gates (worktree, 2026-09-05):** `pnpm --filter recipe-editor typecheck`
  clean; `pnpm --filter recipe-website exec tsc --noEmit` clean;
  `pnpm exec vitest run` → **Test Files 24 passed (24), Tests 395 passed
  (395)**; `pnpm exec prettier --check` on `settings.json`, `SKILL.md`,
  `examples.md`, `CLAUDE.md` and this doc → all formatted (lint-staged
  re-checks on commit). Command-line audit: every `pnpm --silent recipes`
  line in `SKILL.md`/`examples.md` uses only `list`, `search`, `show`,
  `import`, `group create`, `group show` with `--json --limit --dry-run
--tags --name --kind --description --item`, all in `--help`.
- **End-to-end transcript (headless, scratch copy of `three-recipes-groups`,
  settings-only permissions):**

  Ask: `three vegetarian dinners under 45 minutes for this week`, run from
  the worktree root with `CONTENT_DIRECTORY` = a fresh copy of
  `three-recipes-groups`, `--permission-mode acceptEdits --max-turns 40`, no
  `--allowedTools`. Three runs were needed; the first two changed the skill.
  1. **Run 1 (settings without a Skill rule):** the model called
     `Skill recipe-curator` and was denied (`permission_denials:
[{tool_name: "Skill"}]`), read `SKILL.md` by hand instead, then spent nine
     turns reading `cli/index.ts` and `.env` files to find the content
     directory because `env`/`printenv` were not approved. Stopped at turn
     ~15 → `Skill(recipe-curator)` added to settings; step 1 gained
     `show <slug> --json` → `path`.
  2. **Run 2 (28 turns, $1.20, no denials on CLI calls):** skill launched;
     `list`/`show` gave the scratch `path`; WebSearch `vegetarian dinner
recipe 30 minutes` failed with the BBC Good Food crawler error (fact 14)
     and `quick vegetarian weeknight dinner recipe` succeeded; five Budget
     Bytes dry runs (marry-me white bean skillet 25 min, quick curried
     chick peas 30, one-pot veggie pasta 30, black bean quesadillas 15,
     minestrone 45) all importable. Then it **stopped before writing**:
     "this session's content directory is a throwaway fixture, not the
     recipe content repo … tell me where writes should go". Several
     `node -e` / `printenv` pipelines were denied along the way. → step 1
     now says an explicit `CONTENT_DIRECTORY` is the target, and to read
     the JSON directly.
  3. **Run 3 (final, 19 turns, $0.73, `permission_denials: []`):** - `Skill recipe-curator` → "Launching skill". - `list --limit 1 --json` → `total: 3`; `show third-recipe --json` →
     `path` under `…/tmp/e2e-content`; `list --limit 3 --json` → the three
     placeholders, nothing to reuse. - WebSearch ×2: `budgetbytes vegetarian dinner 30 minutes`,
     `budgetbytes vegetarian pasta chickpea curry quick weeknight` → six
     candidate URLs. - `import <url> --dry-run --json` ×6 (in parallel): coconut-curry
     chickpeas 35 min ✔; white beans with mushrooms and marinara 30 ✔;
     creamy white bean and spinach quesadillas 20 ✔; Thai curry vegetable
     soup — under the limit but **rejected for fish sauce in the
     ingredients**; vegan creamy mushroom ramen 15 — importable, held as
     a fallback; spicy sriracha noodles → `import_failed` (no JSON-LD). - `import … --tags vegetarian,vegan,dinner,indian` /
     `vegetarian,dinner,quick,italian` / `vegetarian,dinner,quick,mexican`
     → slugs `chickpea-curry`, `white-beans-with-mushrooms-and-marinara`,
     `creamy-white-bean-and-spinach-quesadillas`, each with `source.url`. - `group create --name "Week of 2026-09-07" --kind meal-plan --item
"chickpea-curry:Mon · Dinner" --item "…:Wed · Dinner" --item "…:Fri ·
Dinner" --json` → `/group/week-of-2026-09-07`. - Report: opened with the mode line ("local content directory at
     …/e2e-content, a scratch copy set via the environment, not the main
     content repo; three placeholder fixtures before this run"), the
     `Day | Recipe | Time | Source` table, the group link, the three
     rejections with reasons, "Push from `/git` when ready". - **Assertions:** `list --json` → `total: 6`; `group list --json` shows
     `week-of-2026-09-07` (`meal-plan`, `itemCount: 3`); `group show` items
     resolve with no `missing`; `show` on each keeper → `totalTime` 35 /
     30 / 20, `source.url` set, 9–10 ingredients, 5–6 instructions.
     `pnpm exec next dev -p 3177` in `editor/` with the scratch
     `CONTENT_DIRECTORY`: `GET /groups 200` lists "Week of 2026-09-07";
     `GET /group/week-of-2026-09-07 200` renders `Mon · Dinner`,
     `Wed · Dinner`, `Fri · Dinner` with all three recipe names. Nothing
     was written outside the scratch copy (`editor/content` still absent
     in the worktree).

- **Next PR: 22f** (reopened 2026-09-06 — the roadmap closed here at 22e;
  group discovery and featured groups were decided with the user
  afterwards).

### PR 22f — Group discovery `agent/22f-group-discovery` ✅ done (← 22e)

**Why:** groups shipped in 22b and 22c–22e made them scriptable, but nothing
_leads_ to them: a group is reachable only from the ⌘K "Go to → Groups" row,
a member recipe's "Appears in" block, or the raw `/groups` URL. The user's
concrete case is a collection of pie-iron batter recipes they want to refer
back to and read quickly. Decided with the user (2026-09-05/06):

- **Entry points:** a header nav link, a homepage groups section, and a
  browse rail on the idle `/search` page.
- **Search:** matching groups appear as results on `/search` and in ⌘K
  (name/description), **plus** a `group:<slug>` query term that narrows
  recipes to a group's members, with a "Search within this group" link on
  the group page.
- **Group page:** items render as recipe cards (image, date, tags — the same
  card as the recipe grids), keeping label/note and the group's order.
- **No index-shape change** in this phase; featured groups (which do change
  the featured index) are PR 22g.

Paths below are relative to `websites/recipe-website/` unless noted.

#### Facts validated against the code (2026-09-06)

1. **Header nav** items are `defaultHeaderItems`
   (`common/components/AppLayout/index.tsx:41`, today only Bookmarks) plus
   the owner's `header` menu; `nav.tsx` `NAV_ICONS` keys icons by href. The
   mobile sheet renders the same list. Adding a default item changes the
   masthead on **every** page, so every `visual.spec.ts` baseline
   (`playwright/support/visual.ts` `snapshotPage`) regenerates —
   intentional, do it with `--update-snapshots` on that spec only.
2. **Homepage** (`Homepage/route.tsx` + `Homepage/index.tsx`) reads the
   recipe and featured pagination _heads_ through
   `createCachedPaginationReads` (tagged `pagination:<type>:by-date:head`).
   `groupPages.readHead()` (`controller/data/readGroupPages.ts`) is the same
   shape, so a groups section is invalidated by the head tag a group write
   already fires — `groupSuccessConfig.paginationOnly`
   (`editor/controller/successConfigs.ts:137`) stays correct; its comment
   ("the homepage reads nothing of groups") must be updated.
3. **Search is client-side.** `SearchContext.tsx` fetches `/search/all`
   (display corpus, `MassagedRecipeEntry[]`, unconditional) and
   `/search/ingredients` (on demand), runs FlexSearch for free text, then
   `matchesFilter(recipe, filter)` (`SearchForm/queryLanguage.ts:471`) over
   `FilterableRecipe` for typed terms. `FILTER_FIELDS` is a `const` list
   (`tag ingredient name description time before after`); an unknown prefix
   is free text. `filterUsesField` gates `/search/ingredients`
   (`filterNeedsIngredients` / `ingredientsSettled`) — the exact pattern to
   copy for a groups document. FlexSearch results are the corpus `doc`s
   (`searchQuery`, `{doc}` map), so decorating the display corpus decorates
   results too.
4. **Group index value** is `{name, kind, items[{recipe,label}]}` (D5) — no
   `description`. The search route reads data files instead of changing the
   index: `readAllGroupIds()` (keys-only walk, `readGroupPages.ts:45`) +
   `getGroupBySlug` (`readGroups.ts`, CLI-safe). Groups are few; the export
   bakes the route at build (`force-static`, like
   `export/.../search/all/route.ts`).
5. **Palette** (`CommandPalette/index.tsx`): static rows are filtered by
   `matchesQuery`; recipe rows come from `displayedRecipes` gated on
   `query`; `hasRecipeHits` hides "Go to"/"Actions".
   `command-palette.spec.ts` asserts "Enter opens the top recipe even when
   the query matches a destination", so a Groups row group must render
   **after** Recipes.
6. **Group page** (`GroupDetailPage/index.tsx`) already receives resolved
   `Recipe` objects per item (route: `recipeItems.read`), so cards need no
   new reads. `groups.spec.ts` asserts `group-item`, `group-item-label`,
   `group-item-missing`, `group-kind`, `group-empty` test ids and item order
   — keep them. Do **not** use `RecipeGrid` (stamps
   `data-testid="recipe-list"`, counted unscoped by many specs; see
   `List/Group/index.tsx`'s note).
7. **Fixture `three-recipes-groups`**: "Week of May 4" (`meal-plan`,
   description "Three dinners, one shop.", items first/second/missing-recipe
   with labels) and "Weeknight Favourites" (`collection`, first + third).
   `three-recipes` has no groups (and predates them, aggregate `null`), so
   every new surface must render _nothing_ there — that is what keeps its
   baselines still.

#### Design (decided)

**Shared reads**

- **`common/controller/data/readGroupSearchCorpus.ts`** (new, CLI-safe:
  `readAllIds` + `readContentFile` only):
  `getGroupSearchCorpus(): Promise<GroupSearchEntry[]>` with
  `GroupSearchEntry = {slug, date, name, kind, description?, recipes: string[]}`
  (item slugs, deduped, order kept). The in-flight collapse `getSearchCorpus`
  has is unnecessary (one route).
- **Routes** `editor/src/app/(recipes)/search/groups/route.ts` (plain `GET`,
  like `search/all`) and `export/src/app/(recipes)/search/groups/route.ts`
  (`export const dynamic = "force-static"`). JSON = the array.

**Query language (`SearchForm/queryLanguage.ts`)**

- `FILTER_FIELDS` gains `"group"`; `FilterableRecipe` gains
  `groups?: string[]` (group _slugs and names_ the recipe belongs to,
  pre-folded by the matcher as usual); `matchesFilter` `case "group"` →
  `(recipe.groups ?? []).some(g => fieldMatches(g, value))`, and `"any"`
  does **not** include groups (a bare word must not match through
  membership). `groupSearchHref(slug)` beside `tagSearchHref`
  (`/search?q=group:<quoted slug>`). `filterUsesField(filter, "group")`
  already generalises.
- `test/queryLanguage.test.ts`: parse `group:weeknight-favourites` as a text
  leaf, `-group:x` negation, `matchesFilter` on `groups`, `filterUsesField`
  true/false, `groupSearchHref` quoting.

**Search context (`SearchForm/SearchContext.tsx`)**

- `groupsQuery` (`queryKey: ["groups"]`, `fetch("/search/groups")`,
  `staleTime: Infinity`; `retry()` refetches it too). Expose
  `allGroups: GroupSearchEntry[]`, `groupsSettled`.
- Build `groupsByRecipe: Map<slug, string[]>` (slug + name per membership)
  and decorate the display corpus **before** it feeds `allRecipes` and the
  FlexSearch populate — one memo, `{...recipe, groups}` — so
  `searchedRecipes` carry `groups` too (fact 3). Populate/probe logic is
  untouched: `groups` is never indexed.
- `filterNeedsGroups = filterUsesField(filter, "group")`; `displayedRecipes`
  stays `undefined` and `isSearching` is true until `groupsSettled` when it
  is set — mirror the ingredients gate exactly.
- `matchedGroups: GroupSearchEntry[]` — when `parsedQuery.text` is
  non-empty, groups whose `name` or `description` `fieldMatches` **every**
  free-text word (same AND-at-word-start semantics as the CLI's free text);
  empty when the query has no free text. Filters never apply to groups.

**Surfaces**

- **Header:** `defaultHeaderItems` += `{ name: "Groups", href: "/groups" }`
  after Bookmarks; `NAV_ICONS["/groups"] = LayersIcon`. `destinations.ts`
  Groups keywords += `"collections", "meal plans"`.
- **Homepage:** `route.tsx` adds `groupPages.readHead()`; `Homepage` gets
  `groups: GroupListEntry[]` (first 3) and renders a "Groups" section
  between Browse chips and Featured: `PageHeading` + `GroupList`
  (`List/Group`) + "More groups" → `/groups` (same `Button` as the other
  strips); renders nothing when empty. Update the `groupSuccessConfig`
  comment (fact 2).
- **`/search` idle rail:** new `SearchForm/GroupRail.tsx` (client;
  `useSearch().allGroups`): "Groups" label + one `Badge` link per group
  (`Layers` icon, name, `itemCount`) to `/group/<slug>`, capped at 12 with
  "More →" `/groups`; rendered in `SearchResultsPage` only when
  `!hasFilter`, above `TagFilterRail`; nothing when there are no groups.
- **`/search` results:** new `SearchForm/GroupResults.tsx`: when
  `matchedGroups.length > 0`, a "Groups" strip above the recipe grid —
  `GroupList` cards (reuse) with the name highlighted via
  `highlightText(name, parsedQuery.text)`; `onClick` → `recordSearch(query)`.
  `SearchTicker` keeps counting recipes only.
- **Palette:** after the Recipes group,
  `{matchedGroups.length > 0 && <CommandGroup heading="Groups" data-testid="palette-groups-group">}`
  with up to 3 rows (`value="group:<slug>"`, `Layers` icon, name, kind badge
  text, `onSelect → recordSearch(query); go("/group/<slug>")`). Shown
  whether or not there are recipe hits; "Go to"/"Actions" hiding rule
  unchanged.
- **Group page cards:** extract the item list from `GroupDetailPage` into
  `GroupDetailPage/GroupItems.tsx` (`items: ResolvedGroupItem[]`): an `<ol>`
  with `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3`, each
  `<li data-testid="group-item">` = optional label line (`group-item-label`)
  - `RecipeListItem` (`List/index.tsx`, fed
    `{slug: item.recipe, date, name, image, tags}` from the `Recipe`) +
    optional note; a dangling item keeps the muted "Recipe not found"
    (`group-item-missing`) inside a card-shaped box. Under the kind badge add
    a "Search within this group" link (`groupSearchHref(slug)`,
    `data-testid="group-search-link"`). 22g reuses `GroupItems`.

#### Tests (Playwright, `three-recipes-groups` unless noted)

- `groups.spec.ts`: header "Groups" link in the banner and in the mobile
  sheet; homepage "Groups" section lists both groups newest first, "More
  groups" → `/groups`; homepage on `three-recipes` shows **no** Groups
  section; group page items are cards in order with labels and the dangling
  third; "Search within this group" on `weeknight-favourites` lands on
  `/search?q=group:weeknight-favourites` showing exactly First and Third
  Recipe with the `group:` chip visible.
- `search-query-language.spec.ts`: `group:week-of-may-4` → First + Second
  (dangling slug contributes nothing); `-group:weeknight-favourites` →
  Second only; `tag:x group:y` compose; an idle `/search` shows the group
  rail with both chips, and it disappears once a query is typed.
- `search.spec.ts`/`search-live.spec.ts`: typing `shop` shows the Groups
  strip with "Week of May 4" (description match) and no recipe cards;
  `weeknight` shows the group above zero recipes; `recipe` shows recipes and
  no group strip.
- `command-palette.spec.ts`: on `three-recipes-groups`, `weeknight` lists
  option "Weeknight Favourites" that navigates to
  `/group/weeknight-favourites`; "Enter opens the top recipe" case still
  passes on `three-recipes`.
- `visual.spec.ts`: regenerate baselines (header link), review the diff is
  header-only.

#### Verification (implementer runs; Fable reruns)

- `pnpm --filter recipe-editor typecheck`;
  `pnpm --filter recipe-website exec tsc --noEmit`;
  `pnpm exec vitest run` (395 tests at 22e + the new query-language cases).
- The specs above via `pnpm --filter recipe-editor e2e-dev -- <spec>`;
  `visual.spec.ts` with `--update-snapshots`, then diff the baselines.
- Export build check: `CONTENT_DIRECTORY=<three-recipes-groups copy> pnpm
--filter recipe-website build` produces `out/search/groups` JSON and
  `/groups`.
- Traps: T12/T13/T14 as before; no fixture index regen needed (no
  index-shape change); `git status` must show no fixture `lock.mdb` churn.

Decisions / close-out (review, 2026-09-06):

- **Decisions made at review:**
  - **Engine hits are re-decorated with `groups` at filter time**, on top of
    decorating the display corpus before the populate. FlexSearch hits come
    out of the IndexedDB document _store_, which is rewritten only when the
    recipe corpus version moves — and a group write does not move it. Without
    the second pass, `chicken group:new-plan` would answer nothing after
    creating a group until an unrelated recipe write. Commented in
    `SearchContext.tsx` `displayedRecipes`.
  - **Baseline regeneration was wider than "visual.spec.ts only" and narrower
    in effect than fact 1 predicted.** No baseline actually failed: the new
    nav link lands inside the config's `maxDiffPixelRatio: 0.02`. All 21
    masthead-bearing shots were regenerated anyway (`visual.spec.ts` ×19,
    `header.spec.ts/masthead-signed-out`, `menus.spec.ts/header-with-about-link`)
    so a stale masthead does not silently eat that tolerance. Reviewed
    `homepage-three-recipes` old vs new: body pixel-identical, masthead now
    `Bookmarks · ⧉ Groups · Search Ctrl+K` (the `Ctrl+K` hint chip was
    captured post-hydration this time; the old shots predated it).
    `search-reveal-control` changed only in antialiasing.
  - `getGroupSearchCorpus` takes an optional `{ contentDirectory }` (T16),
    matching `getGroupBySlug`; no caller passes it yet.
  - `GroupRail` chips are destinations (`/group/<slug>`), not filter writers;
    the narrowing move is the group page's "Search within this group" link.
    The 12-chip cap + "More →" is implemented but no fixture exercises it.
  - `GroupResults` cards print the _deduped_ member count (`recipes.length`)
    where `/groups` prints the raw `items.length`; they differ only for a plan
    listing one recipe twice.
  - `MassagedRecipeEntry.groups?` was added to the type (documented as
    client-side decoration, never served by `/search/all`).
  - The `search.spec.ts` cases from the plan landed in `search-live.spec.ts`
    (a new "Search — matching groups" describe) — same coverage, one file.
- **Divergences from the section:** the six items above; the "tag:x group:y"
  compose case uses `name:second` because the fixture recipes carry no tags.
- **Gates (worktree, 2026-09-06, dev mode):** `pnpm --filter recipe-editor
typecheck` clean; `pnpm --filter recipe-website exec tsc --noEmit` clean;
  `pnpm exec vitest run` → **Test Files 24 passed (24), Tests 405 passed
  (405)** (395 at 22e + 10 `group:` cases); `e2e-dev -- groups.spec.ts
search-query-language.spec.ts search.spec.ts search-live.spec.ts
command-palette.spec.ts` → **92 passed (2.8m)**; `e2e-dev -- visual.spec.ts
header.spec.ts menus.spec.ts homepage.spec.ts mobile.spec.ts navigation.spec.ts
accessibility.spec.ts` → **67 passed (2.5m)**, no `--update-snapshots`, no
  flakes on the review rerun. Export build
  (`CONTENT_DIRECTORY=<three-recipes-groups copy> pnpm --filter recipe-website
build`): route table lists `○ /search/groups` and `● /group/[slug]` ×2;
  `out/search/groups` = `week-of-may-4` (first, second, missing-recipe) then
  `weeknight-favourites` (first, third); `out/groups.html` and
  `out/group/*.html` present. `git status` clean — no fixture `lock.mdb`
  churn.
- **Next PR: 22g** — featured groups, seeded below. Re-validate facts 8–9
  against the code before spawning the implementer; it changes the featured
  index value (`version: "2"`, T1/T3) and the featured form.

### PR 22g — Featured groups `agent/22g-featured-groups` 🟡 next (← 22f)

A featured entry can point at a **group** instead of a recipe, so groups sit
beside recipes in the homepage's featured strip. This phase changes the
featured index value, its spec version, fixtures and the featured form.

#### Facts validated against the code (2026-09-06)

8. **Featured references:** `featuredRecipeContentConfig.references =
[{config: () => recipeContentConfig, dataField: "recipe", fields: ["name","image"]}]`;
   `resolveReferences` (`packages/cms/content/references.ts`) resolves each
   declaration independently and yields `undefined` for a missing/empty
   `dataField`, so a **second declaration**
   `{config: () => groupContentConfig, dataField: "group", fields: ["name","kind"]}`
   works with either field absent. `updateDependents` walks the target's
   `referencedBy` by `indexField`, so `groupContentConfig` needs
   `referencedBy: [{config: () => featuredRecipeContentConfig, indexField: "group"}]`
   (thunk; D3's "no referencedBy" was about _array_ references and is
   amended). `featuredRecipesByDate` (`paginationConfigs.ts:102`,
   `version: "1"`) projects the index value; adding fields bumps it to `"2"`
   and moves `test/specVersions.test.ts`'s whole-file hash (T1) and needs
   fixture index regen (T3: `pnpm tsx scripts/build-fixture-indexes.ts` from
   `editor/`).
9. **Featured surfaces** that assume a recipe: `List/FeaturedRecipe/index.tsx`
   (card → `/recipe/<recipe>`), `FeaturedRecipeDetailPage` (renders
   `RecipeView`), both `featured-recipe/[slug]/page.tsx` routes
   (`recipeItems.read(featuredRecipe.recipe)`, `notFound()` if missing),
   `Homepage/route.tsx` (`filter(entry => entry.recipeName)`, maps to
   recipe cards; hero = `featuredRecipes[0]`), the form
   (`Form/FeaturedRecipe/index.tsx`: `RecipeSelectInput name="recipe"
required`), `parseFeaturedRecipeFormData.ts` (`recipe: min(1)`),
   `actions/featuredRecipes.ts` (`buildCreateData/buildUpdateData` copy
   `parsed.recipe`), `featured-recipe/new/page.tsx` (`?recipe=` prefill),
   the recipe page's "Feature" button
   (`editor/src/app/(recipes)/recipe/[slug]/page.tsx:62`).
   `RecipeSelectInput` hydrates via `/api/recipe/<slug>`; there is no group
   picker yet.

#### Design (seed — re-validate in the 22g plan session)

- **Schema** (`common/controller/types.ts`):
  `FeaturedRecipe.recipe?: string; group?: string` (exactly one set);
  `FeaturedRecipeEntryValue` += `group?`, `groupName?`, `groupKind?`;
  `FeaturedRecipeListEntry` (`paginationConfigs.ts`) += the same;
  `featuredRecipesByDate.project` copies them, `version: "2"` → update the
  `specVersions.test.ts` snapshot; regen fixture indexes (T3) for
  `one-featured-recipe`, `many-featured-recipes`,
  `many-featured-recipes-paged`, `three-recipes-groups` (+ add one featured
  group to `three-recipes-groups` for the tests).
- **References:** second declaration on
  `featuredRecipeContentConfig.references` (fact 8);
  `groupContentConfig.referencedBy` for the scalar edge (D3 amended: groups
  still declare no _array_ references; T4 note updated — the thunk breaks
  the featured↔groups cycle as it does for recipes).
  `buildFeaturedRecipeIndexValue` borrows `name`/`kind` from `refs.group`.
  Engine test in `test/references.test.ts`: retitle a group → the featured
  index value's `groupName` moves; delete the group → value dangles
  (`groupName` undefined) and the card renders "Group not found"; verify
  `revalidateDerived.test.ts` / `derivedPaths.test.ts` expectations
  (T15/T2) — expected unchanged, confirm.
- **Editor:** `parseFeaturedRecipeFormData` → `recipe`/`group` optional with
  a `refine` requiring exactly one; actions copy both; form gets a "Feature
  a: Recipe | Group" segmented toggle (`ToggleGroup` from the component
  library) switching between `RecipeSelectInput` and a new
  `common/components/Form/inputs/GroupSelect` (native `<select>` fed by
  `/search/groups`, hidden input `name="group"`, shows "Selected: <slug>
  (group not found)" when the slug is unknown); `featured-recipe/new`
  accepts `?group=` (and the sign-in redirect keeps it); the group page gets
  a "Feature" button (`/featured-recipe/new?group=<slug>`) beside Edit.
- **Rendering:** `List/FeaturedRecipe` card group variant (name, kind badge,
  `Layers` placeholder in the image slot, link `/group/<slug>`, "View
  Feature" kept); `FeaturedRecipeDetailPage` group variant = note +
  `GroupItems` (from 22f) + "Open group" link, both `featured-recipe/[slug]`
  routes resolve the group (`getGroupBySlug` + `recipeItems.read` items) or
  the recipe, `generateMetadata` uses `groupName`; export
  `generateStaticParams` unchanged. Homepage: `route.tsx` keeps entries with
  `recipeName || groupName`; a new `Homepage/FeaturedStrip.tsx` renders
  mixed cards (recipe → `RecipeListItem`, group → the featured group card)
  inside one grid; the hero is the first featured **recipe** (groups have no
  image/timeline).
- **Tests:** `featured-recipes.spec.ts` — feature a group from the group
  page, see it on the homepage strip (no bookmark button on it), on
  `/featured-recipes`, and on its detail page; a recipe feature still works;
  `visual.spec.ts` `featured-recipes-page1` unchanged unless the fixture
  changed. CLI `pnpm recipes` gets no featured command (Deferred).

## Deferred

- **F32 — array references in the engine** (`path: "items[].recipe"`):
  rename-following and thumbnail borrowing for group cards. The reference
  machinery is scalar-only (D3). When picked up, add an F-row to the §10
  "Rollout" engine-hygiene table in
  `packages/cms/docs/incremental-regeneration.md` (last rows F29/F31) plus the
  matching bold-prose entry in §11.4.
- **`source:` search field** + `SEARCH_DB_NAME` bump + fixture regen (D6):
  kept out of 22a so provenance needs no index-shape change.
- **Migration script for legacy "Imported from" descriptions** (D7): existing
  recipes keep their prefix line until a one-off script moves it into
  `source`.
- **`POST /api/git/push`** (D11): push stays manual from `/git`.
- **API token hygiene** (22d): a `revoke-token` script (v1 is hand-editing
  the `tokens` array in `users/<email>`), per-token scopes (every token is
  a full write token today), and a `lastUsedAt` stamp on the record.
- **Group tags / tag pages; per-item servings for meal plans; featured recipes
  as a group kind.**
- **CLI featured commands** (22g): `pnpm recipes` gets no `feature`
  command; featuring a group is editor-only.
- **Group cards borrowing a first recipe's thumbnail** — needs F32.
- **README test section rewrite** (22e): it still describes Cypress; the
  suite is Playwright. `CLAUDE.md` states the current commands.
- **Tag-vocabulary migration** (22e): the 437 existing recipes carry two tags
  in total; the skill's vocabulary (`vegetarian`, `dinner`, `quick`, …) only
  reaches recipes it imports. A one-off tagging pass would make `tag:` search
  useful for reuse.
- **`search` ranking and OR-by-default free text** (22e): free-text words are
  ANDed with no relevance order, so multi-word asks need several one-word
  searches.
- **Stale-editor hint after `--dry-run`** (22e fact 13): the CLI prints the
  "A running editor is stale until …" stderr hint after a dry run that wrote
  nothing.

## Key files to read first (implementers)

- `websites/recipe-website/common/controller/featuredRecipeContentConfig.ts`
  (+ `buildFeaturedRecipeIndexValue.ts`, `paginationConfigs.ts`,
  `aggregateConfigs.ts`) — template for the groups type.
- `websites/recipe-website/editor/controller/actions/index.ts`
  (`buildRecipeData`, success configs, `rebuildRecipeIndex`).
- `packages/cms/content/genericActions.ts` (`handleContentSuccess`).
- `websites/recipe-website/common/util/importRecipeData.ts`.
- `websites/recipe-website/editor/controller/contentTypes.ts` (registry).
- `packages/cms/content/createContent.ts`, `test/references.test.ts`
  (engine-in-tmpdir test template), `editor/scripts/seed-pages.ts` (script
  template).

## Verification (Playwright-first)

Verify UI changes with Playwright; open a real browser only to diagnose
failures. Run the phase's named specs with
`pnpm --filter recipe-editor e2e-dev -- <spec> <spec>`; run both typechecks
(`pnpm --filter recipe-editor typecheck`,
`pnpm --filter recipe-website exec tsc --noEmit`) and the root
`pnpm exec vitest run` before closing a phase. Record counts verbatim in the
phase's close-out.
