---
name: recipe-curator
description: Find, import, cite and group recipes for the recipe website — meal plans, collections, nested collections and the homepage strip — through the `recipes` MCP tools. Use for asks like "plan dinners for the week", "import this recipe", "make a collection of …", "put it on the homepage".
allowed-tools: mcp__recipes__recipe_search, mcp__recipes__recipe_list, mcp__recipes__recipe_get, mcp__recipes__recipe_import, mcp__recipes__recipe_create, mcp__recipes__recipe_update, mcp__recipes__tag_list, mcp__recipes__group_list, mcp__recipes__group_get, mcp__recipes__group_create, mcp__recipes__group_update, mcp__recipes__group_set_items, mcp__recipes__group_add_item, mcp__recipes__group_remove_item, mcp__recipes__featured_list, mcp__recipes__feature, mcp__recipes__git_status, mcp__recipes__git_log, mcp__recipes__git_show, mcp__recipes__git_file_at, mcp__recipes__git_diff, WebSearch, Bash(pnpm --silent recipes:*)
---

# Recipe curator

The ask is `$ARGUMENTS` (or the user's message when invoked by description).

Work through the `recipes` MCP server. Every tool returns JSON; a failure
carries `isError` and `{error: {code, message, …}}`. A write may also answer
with a `warnings` array — information, never failure. Worked transcripts:
[examples.md](examples.md).

## 1. Check where writes go, first

```json
git_status {}
recipe_list {"limit": 1}
recipe_get {"slug": "<the slug from that row>"}
```

`git_status` → `{isRepo, branch, upstream, ahead, behind, dirty, remotes,
log}`: `isRepo: true` means every write becomes a commit on that branch.
`recipe_list` → `{total, more, recipes}`; `recipe_get` →
`{slug, path, url, recipe}`, whose absolute `path` names the resolved content
directory — that answers "where" without reading the environment or shelling
out. Never do either; the tools know.

Open the report with that directory, the branch and the corpus size. **If
`total` is 0 and the ask did not expect an empty site, stop and ask** — the
only reason to stop here. A `path` outside the editor's own `content`
directory means someone pointed `CONTENT_DIRECTORY` at a scratch copy or a
fixture deliberately: write there, and say so in the report.

The `recipes` server may be the local stdio one or a running editor's
`/api/mcp` over HTTP, registered under the same name — the tool names and this
skill are identical either way; over HTTP, `path` is the server's directory
rather than this machine's.

## 2. Turn the ask into constraints

Cuisine, diet, max total minutes, servings, how many recipes, which
days/meals, exclusions. Ask **once** if the count or the diet is missing;
otherwise proceed on reasonable defaults and say what you assumed.

## 3. Reuse what is already there

```json
recipe_search {"query": "lentil", "fields": ["description", "ingredients", "prepTime", "cookTime"]}
tag_list {}
```

Rows are compact by default — `{slug, name, date, tags?, totalTime?, image?}`
— and `fields` opens up the four above; `recipe_get` is for `instructions`
and `source`. Free-text words are ANDed and match at a **word start with your
word as the prefix** ("cookie" finds "cookies", not the other way round), so
search **one or two words at a time**, not a sentence. Results are unranked,
newest first. Read `tag_list` before inventing a tag. Typed terms: `tag:x`,
`-tag:x`, `ingredient:x`, `name:x`, `description:x`, `time:<=45` (bare
`time:30` means ≤ 30), `before:`/`after:`, `AND`/`OR`/`NOT`, parentheses. A
recipe with no timing never matches a `time:` query. **`group:` works only in
the browser's search box** — for membership use `group_get`. **Prefer an
existing recipe over a new import.**

## 4. Find candidates on the web

Use WebSearch, one search per constraint set, and collect **at most 8
candidate pages** before checking back with the user. Prefer sites that expose
schema.org JSON-LD — BBC Good Food and Budget Bytes both import — and skip
ones known to block the importer, such as Serious Eats and NYT Cooking. A
WebSearch error about "domains are not accessible to our user agent" means a
result hit a site that blocks Anthropic's crawler (BBC Good Food today):
rephrase, or name another site. The importer's own fetch is unaffected, so a
URL you already have is still fair game.

## 5. Dry-run every candidate

```json
recipe_import {"url": "https://www.budgetbytes.com/vegetarian-chili/", "dryRun": true}
```

Writes nothing; returns `{dryRun: true, url, slug, recipe, image?, video?}`
with `recipe.{ingredients, instructions, prepTime, cookTime, totalTime,
recipeYield, source{url, name?, author?}}` (minutes) and no `warnings`.
**Reject a candidate when:**

- the call fails with `code: "import_failed"` (no JSON-LD recipe on the page
  — a wrong URL and a 404 look identical, so just drop it);
- `recipe.ingredients` or `recipe.instructions` is empty or absent;
- `recipe.totalTime` exceeds the ask's limit — or is missing while the ask has
  one, in which case drop it and **say so in the report**.

A YouTube URL imports through the video path (`videoUrl` + `source`); use one
only when the ask allows videos. Dedupe against step 3 by `slug`.

## 6. Import the keepers

```json
recipe_import {"url": "https://www.budgetbytes.com/vegetarian-chili/", "tags": ["vegetarian", "dinner"]}
```

Returns `{slug, date, path, url, source?, warnings?}`. On
`code: "slug_conflict"` the recipe already exists — use that slug, never
`overwrite`. `source.url` is the citation the importer filled in: never strip
or edit it. `recipe_update {"slug": …, "patch": {"tags": […]}}` fixes tags on
a recipe **this run** imported; `recipe_create` takes a dictated recipe.

Tag vocabulary (lowercase, keep it small):

- diet — `vegetarian`, `vegan`, `gluten-free`
- meal — `breakfast`, `lunch`, `dinner`, `dessert`, `snack`
- speed — `quick` (≤ 30 minutes total)
- cuisine — one lowercase word (`thai`, `italian`, …)

## 7. Group them

```json
group_create {"group": {"name": "Week of 2026-09-07", "kind": "meal-plan", "items": ["mushroom-stroganoff:Mon · Dinner", "vegetarian-chili:Wed · Dinner"]}}
```

Returns `{slug, date, path, url, warnings?}`. An item is `"slug"`,
`"slug:label"` (split at the first colon), `{recipe, label?, note?}` or
`{group, label?, note?}`. `kind` is `meal-plan` with dated labels and
`collection` otherwise (give a collection a `description`); `imageImportUrl`
gives it a cover picture, fetched at write time. On `code: "unknown_recipe"`
or `code: "unknown_group"` fix the slug — never `force`.

**Nesting.** A `{group: "<slug>"}` item puts one group inside another, and it
stays a top-level group too. The Christmas-Cookies shape, in order: parent
collection → `feature` it → child collection → nest the child with
`group_add_item {"group": "<parent>", "subgroup": "<child>"}` (or
`group_set_items`, which replaces the whole list in one call and takes the
same `{group}` item) → `group_get` both to check. The other direction fails
with `code: "group_cycle"`, which is final, not forceable.

```json
feature {"group": "christmas-cookies", "slug": "christmas-cookies-strip"}
```

Puts a group (or a `recipe`) on the homepage strip — **only when the ask says
so** ("feature it", "put it on the homepage"). Returns
`{slug, date, path, url, group}`, where `slug` is the _entry's_ own, not the
target's: pass an explicit one whenever you feature more than one thing, since
the default has one-second resolution. `featured_list` shows the strip.
`group_update` fixes a name, description or kind and never touches the items,
so a plan cannot be lost to a rename; `group_remove_item` drops one row.

## 8. Report

A `Day | Recipe | Time | Source` table (`Recipe` linking `/recipe/<slug>`),
then the `/group/<slug>` links, then anything rejected and why. Restate any
`warnings` in plain words — the stale-editor line means the running editor
needs Settings → Maintenance → Reload, or that `RECIPE_EDITOR_URL` is unset.
When `git_status` said `isRepo`, list what you committed from
`git_log {"type": "group", "slug": "<slug>"}` →
`{commits: [{hash, message, date, files}], hasMore}` (`git_show`, `git_diff`
and `git_file_at` read one back). End with: push from `/git` when ready.

## Held back

`recipe_delete`, `group_delete`, `unfeature`, `reindex`, `git_revert`,
`git_restore` and `git_push` are not pre-approved and are not part of this
skill — do not call them, and do not ask for them to be approved. If a write
goes wrong, find its commit with `git_log` and report the hash and the path:
undoing it with `git_revert` or `git_restore`, and pushing, are the user's
calls. Never pass `overwrite` or `force`, and never put `RECIPE_API_TOKEN` on
a command line.

## Fallback (CLI)

When the `recipes` server is not connected, the same operations exist as
`pnpm --silent recipes <command> … --json`, run **from the repo root**
(`--silent` keeps pnpm's banner out of the JSON). `pnpm --silent recipes --help`
lists the commands; the flags mirror the tool inputs. Never pass `--author`,
`--remote`, `--editor-url`, `--notify`, `--overwrite`, `--force` or
`--content-dir` — the environment chooses the target, and a flag would let a
fallback run write somewhere the tools would not.
