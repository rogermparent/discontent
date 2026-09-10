---
name: recipe-curator
description: Find, import, cite and group recipes for the recipe website — meal plans and collections — via pnpm recipes. Use for asks like "plan dinners for the week", "import this recipe", "make a collection of …".
allowed-tools: Bash(pnpm --silent recipes:*), WebSearch
---

# Recipe curator

The ask is `$ARGUMENTS` (or the user's message when invoked by description).

Every command is `pnpm --silent recipes <command> … --json`, run **from the
repo root**. `--silent` matters: without it pnpm prints a script banner ahead
of the object and the stream is not a single JSON value. Worked transcripts
with real output: [examples.md](examples.md).

## 1. Check where writes go, first

```
pnpm --silent recipes list --limit 1 --json
pnpm --silent recipes show <slug from that row> --json
```

`list` returns `{total, more, recipes}`; `show` returns
`{slug, path, url, recipe}`, and its absolute `path` is the resolved content
directory — that answers "where" without reading the environment or the CLI
source. Resolution is `--content-dir` > `CONTENT_DIRECTORY` > the editor's
`content` directory, which in a normal checkout is a symlink to the **real
recipe content repo, and every write is committed there**. With
`RECIPE_API_URL` set, every command instead goes to that running editor over
HTTP (then `path` is the server's).

State the mode (local content dir / remote editor), the directory from
`path`, and the corpus size in the first line of your report. **If `total` is
0 and the ask did not expect an empty site, stop and ask** — a worktree or a
mistyped `CONTENT_DIRECTORY` silently creates an empty content directory
rather than failing. That is the only reason to stop here: when `path` is
outside the editor's own `content` directory, someone set `CONTENT_DIRECTORY`
or `--content-dir` on purpose (a scratch copy, a test fixture, a second
site), and that directory **is** the intended target — write there without
asking, and say in the report that it is not the main content repo.

Read the CLI's JSON yourself; do not pipe it through `node -e`, `jq`, or
`grep`, and do not run `env`/`printenv` — in a restricted session only the
`pnpm --silent recipes` command itself is pre-approved, and everything the
skill needs is in the command output.

## 2. Turn the ask into constraints

Cuisine, diet, max total minutes, servings, how many recipes, which
days/meals, exclusions. Ask **once** if the count or the diet is missing;
otherwise proceed on reasonable defaults and say what you assumed.

## 3. Reuse what is already there

```
pnpm --silent recipes search "lentil" --json
pnpm --silent recipes show <slug> --json
```

`search` rows are full recipe rows —
`{date, slug, name, description, ingredients?, image?, tags?, prepTime?, cookTime?, totalTime?}` —
so time and tags are checkable straight from the search result; `show` is only
needed for `instructions` and `source`. Free-text words are ANDed and match at
a word start, so search **one or two words at a time**, not a sentence. The
corpus is mostly untagged, so prefer free text over `tag:` when looking for
existing recipes. Typed terms exist too: `tag:x`, `-tag:x`, `ingredient:x`,
`name:x`, `time:<=45` (bare `time:30` means ≤ 30), `before:`/`after:`,
`AND`/`OR`/`NOT`, parentheses. A recipe with no timing never matches a `time:`
query. **Prefer an existing recipe over a new import.**

## 4. Find candidates on the web

Use WebSearch, one search per constraint set, and collect **at most 8
candidate pages** before checking back with the user. Prefer sites that expose
schema.org JSON-LD — BBC Good Food and Budget Bytes both import — and skip
ones known to block the importer, such as Serious Eats and NYT Cooking. A
WebSearch that errors with "domains are not accessible to our user agent"
means a result hit a site that blocks Anthropic's crawler (BBC Good Food
today); rephrase or name another site — the importer's own fetch of such a
site is unaffected, so a URL you already know is still fair game.

## 5. Dry-run every candidate

```
pnpm --silent recipes import <url> --dry-run --json
```

Writes nothing; returns
`{dryRun:true, url, slug, recipe, image?:{importUrl,filename}, video?}` with
`recipe.{ingredients, instructions, prepTime, cookTime, totalTime, recipeYield, source{url,name?,author?}}`
(times in minutes). **Reject a candidate when:**

- the command errors with `{"error":{"code":"import_failed",…}}` (no JSON-LD
  recipe on the page — a wrong URL or a 404 looks identical, so just drop it);
- `recipe.ingredients` or `recipe.instructions` is empty or absent;
- `recipe.totalTime` exceeds the ask's limit — or is missing while the ask has
  one, in which case drop it and **say so in the report**.

A YouTube URL imports through the video path (`videoUrl` + `source`); use one
only when the ask allows videos. Dedupe against step 3 by `slug`.

## 6. Import the keepers

```
pnpm --silent recipes import <url> --tags vegetarian,dinner --json
```

Returns `{slug, date, path, url, source?}`. Never pass `--overwrite`. On
`{"error":{"code":"slug_conflict",…}}` (exit 2) the recipe already exists —
use the existing slug and move on. `source.url` is filled by the importer and
is the citation: never strip or edit it.

Tag vocabulary (lowercase, keep it small):

- diet — `vegetarian`, `vegan`, `gluten-free`
- meal — `breakfast`, `lunch`, `dinner`, `dessert`, `snack`
- speed — `quick` (≤ 30 minutes total)
- cuisine — one lowercase word (`thai`, `italian`, …)

## 7. Group them

```
pnpm --silent recipes group create --name "Week of 2026-09-07" --kind meal-plan \
  --item "mushroom-stroganoff:Mon · Dinner" \
  --item "vegetarian-chili:Wed · Dinner" --json
```

`--item` is `slug[:label]`, split at the **first** colon, so a label may
contain one. Use `--kind collection` (with `--description`) for asks with no
dates. Returns `{slug, date, path, url, warnings?}`. On
`{"error":{"code":"unknown_recipe",…}}` fix the slug — never pass `--force`.

## 8. Report

A `Day | Recipe | Time | Source` table (`Recipe` linking `/recipe/<slug>`),
then the `/group/<slug>` link, then anything rejected and why. End with:
push from `/git` when ready.

## Never

Never push, never delete, never `reindex`, and never pass `--author`,
`--remote`, `--editor-url`, `--notify`, `--overwrite` or `--force`. Remote
mode is selected by `RECIPE_API_URL` alone (with `RECIPE_API_TOKEN` in the
environment — never on argv); `--notify` is implicit for a local write when
`RECIPE_EDITOR_URL` is set. The stderr line "A running editor is stale until
Settings → Maintenance → Reload" is a hint, not an error, and also prints
after `--dry-run`, which writes nothing.
