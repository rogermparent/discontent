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
`agent/22e-curator-skill`. Rebase children after a parent merges. Never push
to main; never force-push; never merge.

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
   `agent/22e-curator-skill`. Rebase children after a parent merges. Never
   push to main; never force-push; never merge.

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
  deferred as engine follow-up **F32**.
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
  plain Node. Rule for `controller/curation/*`: import only
  `@discontent/cms/content/*`, `@discontent/cms/aggregates/*`,
  `recipe-website-common/controller/{types,*ContentConfig,createSlug,normalizeTags,data/read,data/readGroups}`,
  `recipe-website-common/util/*`. **Never** `data/readRecipeItem` or the cached
  group reads `data/readGroupPages` / `data/readGroupsByRecipe`
  (`unstable_cache` throws outside Next, see
  `packages/cms/content/next/cachedItemRead.ts:47`), never `@/auth`, `next/*`,
  or `controller/actions/*`.
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
- **D12 `.claude` is a bare gitignore entry** (root `.gitignore` last line).
  22e changes it to `.claude/*` + `!.claude/skills/` + `!.claude/settings.json`,
  and adds a minimal root `CLAUDE.md`.

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
  nothing from the recipe config (no thunks needed).
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

## Stacked-PR roadmap

Each branch is off the previous. Rebase children after a parent merges.

| PR  | Branch (← parent)                              | Status  | Scope                                                                                                                                        |
| --- | ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 22a | `agent/22a-provenance` ← `content-engine-test` | ✅ done | This doc; `Recipe.source` provenance; imports fill it; both apps render a citation; the form edits it; drop the "Imported from" line (D7)    |
| 22b | `agent/22b-groups` ← 22a                       | ✅ done | `groups` content type (meal plans + collections), editor CRUD, export pages, "Appears in" aggregate, `rebuildAllIndexes()`                   |
| 22c | `agent/22c-curator-cli` ← 22b                  | 🟡 next | `pnpm recipes <command>` CLI over a content directory, `--json` output, transport-agnostic `controller/curation/` layer                      |
| 22d | `agent/22d-remote-write` ← 22c                 | ⏸️      | Bearer-token JSON API in the editor that revalidates in-process; CLI HTTP backend + `--notify`; `genericActions` refactor (D9); tokens (D10) |
| 22e | `agent/22e-curator-skill` ← 22d                | ⏸️      | Committed `.claude/skills/recipe-curator/SKILL.md`, `.claude/settings.json` allow-list, minimal root `CLAUDE.md` (D12)                       |

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

### PR 22c — Curator CLI `agent/22c-curator-cli` 🟡 next (← 22b)

Goal: `pnpm recipes <command>` drives the engine against a content directory,
`--json` output, logic in an importable layer.

`editor/controller/curation/`: `schema.ts` (zod `RecipeInputSchema`: name,
slug?, date? ISO|epoch, description?, tags? normalized, prep/cook/totalTime?,
recipeYield?, ingredients? as `string | Ingredient` (strings via
`createIngredient` from `common/util/parseIngredients.ts`), instructions? as
`string | Instruction | InstructionGroup`, timelines?, source?,
imageImportUrl?, videoUrl?, videoImportUrl?; `GroupInputSchema`: name, slug?,
kind default `collection`, description?, date?, items as `string | GroupItem`),
`recipes.ts` (`createRecipe` → `createContent` with
`uploads.image.fileImportUrl`, filename from URL pathname as `buildRecipeData`
does; `updateRecipe` merge + `updateContent` with `currentIndexKey`;
`deleteRecipe`; `getRecipe`; `listRecipes`), `search.ts` (`parseQuery` +
`matchesFilter` from `common/components/SearchForm/queryLanguage.ts` over index
entries; free text via `fold()` substring), `importRecipe.ts` (`importFromUrl`
wrapping `importRecipeData`; `importAndCreate` with tags/slug/dryRun/overwrite),
`groups.ts` (create/update/setItems/addItem/removeItem/delete/get/list;
`addItem` warns on unknown recipe unless `--force`), `reindex.ts`.

`editor/cli/`: `index.ts` (`node:util` `parseArgs` as `create-user.ts` does;
globals `--json`, `--content-dir`, `--author`; exit 0/1/2 for
ok/error/slug-conflict; `--json` prints one object), `backend/types.ts`
(`CuratorBackend` interface, one method per command), `backend/local.ts`
(passes `contentDirectory` explicitly),
`commands/{import,create,update,show,list,search,delete,group,reindex}.ts`.
`editor/package.json`: `"recipes": "tsx ./cli/index.ts"`.

Command surface:

```
pnpm recipes import <url> [--tags a,b] [--slug s] [--dry-run] [--overwrite] [--json]
pnpm recipes create --file recipe.json | --stdin
pnpm recipes update <slug> --file patch.json
pnpm recipes show <slug> | list [--tag t] [--limit n] [--offset n] | search "<query>" | delete <slug> [--yes]
pnpm recipes group create --name N [--kind meal-plan|collection] [--description D] [--file items.json | --item slug[:label] ...]
pnpm recipes group add <group> <recipe> [--label L] [--note N] | remove <group> <recipe> | set-items <group> --file items.json
pnpm recipes group show|list|delete
pnpm recipes reindex [contentType]
```

Author: `--author` > `RECIPE_AUTHOR` > content repo git identity. Local writes
print a hint that a running editor is stale until `/settings/maintenance`
Reload (or `--notify` after 22d).

Tests: `test/curation.test.ts` (tmpdir; string ingredients get
`<Multiplyable>`; `SlugConflictError`; `importFromUrl` with stubbed fetch over
the `importable-uploads` fixture HTML; `searchRecipes("tag:x time:<30")` and
free text; group add/remove round-trip; group from string items).
`test/cliJson.test.ts` spawns
`pnpm exec tsx cli/index.ts list --json --content-dir <tmp>` via `execa` and
parses stdout (proves it runs outside Next).

Verify: typecheck; vitest; manual
`pnpm recipes import <JSON-LD url> --dry-run --json`;
`pnpm recipes group create --name "Test week" --kind meal-plan --item first-recipe:"Mon · Dinner" --content-dir test-content`
writes `groups/data/test-week/group.json` and the editor shows it after Reload.
Doc: command table + JSON contracts.

Decisions / close-out (fill in at review):

- [ ] `controller/curation/*` obeys the D8 import rule (no `next/*`, no cached
      reads, no `@/auth`, no `controller/actions/*`).
- [ ] Command table + JSON contracts written here.
- [ ] Gates recorded verbatim.
- **Next PR: PR 22d — Remote write.**

### PR 22d — Remote write `agent/22d-remote-write` ⏸️ (← 22c)

Goal: bearer-token JSON API in the editor that revalidates in-process; CLI
gains an HTTP backend and `--notify`.

- `packages/cms/content/genericActions.ts` — D9 refactor;
  `editor/controller/successConfigs.ts` (T7).
- `editor/src/users/index.ts` — `UserRecord`, `ApiToken`, `userFilePath`,
  `readUser`, `writeUser`, `listUserEmails`, `hashToken`, `generateToken`,
  `parseToken`. `scripts/create-user.ts` uses `userFilePath` (D10 fix). New
  `scripts/create-token.ts` + `"create-token"` script (`-e email -n name`,
  prints once).
- `editor/controller/apiAuth.ts` — `authenticateRequest(request)`: Bearer →
  token → email, else session.
- `editor/controller/curation/http.ts` — `readJsonBody(request, schema)`,
  error mapping (zod → 400, `SlugConflictError` → 409, ENOENT → 404, else 500).
- Routes under `editor/src/app/api/`: `recipes/route.ts` (GET list/search
  public; POST create, `?overwrite=1`, 201 `{slug, url}`, then
  `revalidateContentWrite`), `recipe/[slug]/route.ts` (keep GET; add PUT
  partial merge, DELETE), `import/route.ts` (POST
  `{url, dryRun?, tags?, slug?, overwrite?}`), `groups/route.ts`,
  `group/[slug]/route.ts`, `revalidate/route.ts` (POST →
  `revalidateDerivedState(recipeContentTypes)` + `revalidatePath("/", "layout")`,
  the non-TEST_MODE twin of `settings/test-invalidate-cache`).
- `editor/cli/backend/http.ts` — `CuratorBackend` over fetch with Bearer;
  selected by `--remote <url>` / `RECIPE_API_URL`; token `RECIPE_API_TOKEN`;
  remote `import` posts to `/api/import`. `backend/local.ts` gains
  `--notify [url]` / `RECIPE_EDITOR_URL` → `POST /api/revalidate` after each
  write.

Tests: `test/apiTokens.test.ts` (round-trip, tampered fails, path has no
`.json`). Playwright `editor/playwright/tests/api-write.spec.ts` (`tasks.ts`
gains `createApiToken()`): POST recipe → 201 and detail page renders without
Reload; 401 without header; 409 duplicate; POST import from
`importable-uploads` naan.html → `source` set; PUT retitle visible on
`/recipes`; DELETE → 404; POST group → `/group/<slug>` renders; POST
revalidate → 200.

Verify: typecheck; vitest;
`e2e-dev -- api-write.spec featured-recipes.spec recipe.spec` (last two guard
the refactor); manual remote run shows the group in the browser with no
Reload. Doc: endpoint table, status codes, token setup, HTTPS-only note.

Decisions / close-out (fill in at review):

- [ ] D9 refactor landed; `"use server"` modules export only async functions
      (T7).
- [ ] D10 token format + `create-user.ts` path fix landed.
- [ ] Endpoint table, status codes, token setup, HTTPS-only note written here.
- [ ] Gates recorded verbatim.
- **Next PR: PR 22e — Claude Code skill.**

### PR 22e — Claude Code skill `agent/22e-curator-skill` ⏸️ (← 22d)

- Root `.gitignore`: `.claude/*`, `!.claude/skills/`, `!.claude/settings.json`
  (D12).
- `.claude/skills/recipe-curator/SKILL.md` — frontmatter
  `name: recipe-curator`, description "Find, import, cite and group recipes for
  the recipe website (meal plans, collections) via pnpm recipes". Body: (1)
  turn the ask into constraints (cuisine, diet, max total time, servings,
  count, days/meals); (2)
  `pnpm --filter recipe-editor recipes search "..." --json` first to reuse
  existing recipes; (3) WebSearch for candidates, prefer JSON-LD sites; (4)
  `import <url> --dry-run --json` each, reject null/no ingredients; (5) import
  chosen with `--tags`, `source` carries the citation; (6)
  `group create --kind meal-plan --name "Week of <date>" --item slug:"Mon · Dinner" ...`;
  (7) report a table with `/recipe/<slug>` and `/group/<slug>` links.
  Guardrails: never delete without an explicit ask; never push (point to
  `/git`); never overwrite an existing slug; always keep `source.url`; ask
  before importing more than ~8 pages; remote mode only when `RECIPE_API_URL`
  is set. Worked example.
- `.claude/settings.json` — `permissions.allow`: `Bash(pnpm recipes:*)`,
  `Bash(pnpm --filter recipe-editor recipes:*)`,
  `Bash(pnpm -C websites/recipe-website/editor recipes:*)`, `WebSearch`.
- Root `CLAUDE.md` (minimal): repo shape, the skill, pointers to the three
  durable docs, verification commands.

Verify: `git status` shows skill + settings tracked; a fresh Claude Code
session asked for "three vegetarian dinners under 45 minutes for this week"
invokes the skill and ends with a group visible at `/groups`; record the
transcript summary in the doc.

Decisions / close-out (fill in at review):

- [ ] `.gitignore` carve-out + skill + settings + `CLAUDE.md` tracked.
- [ ] End-to-end transcript summary recorded here.
- **Next PR: none — the roadmap closes here.** Remaining work is in Deferred.

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
- **Group tags / tag pages; per-item servings for meal plans; featured recipes
  as a group kind.**
- **Homepage "Groups" section** (22b shipped the palette destination only; the
  homepage reads nothing of groups, which is also why `paginationOnly` drops
  `revalidatePath("/")` safely).
- **Group cards borrowing a first recipe's thumbnail** — needs F32.

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
