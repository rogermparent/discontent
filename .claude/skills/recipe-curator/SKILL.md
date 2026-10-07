---
name: recipe-curator
description: Find, import, cite and group recipes for the recipe website — meal plans, collections, nested collections, the homepage strip and the shared list of what's on hand — through the `recipes` MCP tools. Use for asks like "plan dinners for the week", "import this recipe", "make a collection of …", "put it on the homepage", "I bought Gnista", "what can I make?".
allowed-tools: mcp__recipes__recipe_search, mcp__recipes__recipe_list, mcp__recipes__recipe_get, mcp__recipes__page_inspect, mcp__recipes__recipe_import, mcp__recipes__recipe_create, mcp__recipes__recipe_update, mcp__recipes__recipe_set_image, mcp__recipes__tag_list, mcp__recipes__group_list, mcp__recipes__group_get, mcp__recipes__group_create, mcp__recipes__group_update, mcp__recipes__group_set_items, mcp__recipes__group_add_item, mcp__recipes__group_remove_item, mcp__recipes__featured_list, mcp__recipes__feature, mcp__recipes__inventory_get, mcp__recipes__inventory_add, mcp__recipes__inventory_remove, mcp__recipes__inventory_makeable, mcp__recipes__git_status, mcp__recipes__git_log, mcp__recipes__git_show, mcp__recipes__git_file_at, mcp__recipes__git_diff, WebSearch, WebFetch, Bash(pnpm --silent recipes:*)
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

## 5. Inspect every candidate

```json
page_inspect {"url": "https://www.budgetbytes.com/vegetarian-chili/"}
```

Reads the page and writes nothing. Returns `{url, finalUrl, status, partial,
recipe, draft, suggestedTags?, jsonLd, meta, images, video?}`:

- `draft` — the recipe as a **create-ready** `recipe_create` payload: plain
  ingredient lines (no markup, ASCII fractions as the page gave them),
  instructions, `recipeYield`, times in minutes, `source{url, name?,
author?}` and `imageImportUrl` set to the best image. `tags`, `slug` and
  `drink` are yours to add.
- `suggestedTags` — the page's own `recipeCategory`, `recipeCuisine`,
  `cookingMethod` and `keywords`, normalized, at most ten. Hints, never
  applied: the draft carries no `tags`.
- `images` — up to ten `{url, width?, height?, from}` candidates, best first:
  full-size originals rank above their WordPress crops, and the page's
  metadata images above its body images.
- `jsonLd` and `meta` — the raw Recipe node and the page's title,
  description, OpenGraph and author, for anything the draft left out.
- `video` — for a YouTube (or other video) URL: yt-dlp's title, channel, full
  description, chapters and thumbnails.

**Reject a candidate when:**

- the call fails with `code: "import_failed"` (the page could not be fetched
  at all), or `status` is not 2xx, or there is no `draft`;
- `draft.ingredients` or `draft.instructions` is empty or absent and you are
  not going to fill them in (see partial pages below);
- `draft.totalTime` exceeds the ask's limit — or is missing while the ask has
  one, in which case drop it and **say so in the report**.

Dedupe against step 3 by name and source URL. `recipe_import {"url": …,
"dryRun": true}` is the same read with the stored form beside the draft; use
`page_inspect` unless you want that.

## 6. Inspect, draft, create

Take the candidate's `draft`, edit it, check it, write it:

```json
recipe_create {"recipe": {"name": "Vegetarian Chili", "tags": ["vegetarian", "dinner"], "ingredients": ["1 Tbsp olive oil", "2 cloves garlic"], "instructions": ["Sauté the garlic."], "source": {"url": "https://www.budgetbytes.com/vegetarian-chili/", "name": "Budget Bytes"}, "imageImportUrl": "https://www.budgetbytes.com/wp-content/uploads/2022/01/Vegetarian-Chili.jpg"}, "dryRun": true}
```

The dry run returns `{dryRun: true, slug, conflict, recipe, image?}` and
writes nothing: `recipe` is the record that would be stored, `image.filename`
the name the picture would get (with `image.error` if it would be refused).
On `conflict: true` the recipe already exists — use that slug, never
`overwrite`. Then the same call without `dryRun` writes it, one commit, and
returns `{slug, date, path, url, warnings?}`.

The checklist, applied to the draft before the dry run:

1. **Keep `source` exactly as the draft has it** — it is the citation. Never
   strip or edit `source.url`.
2. **Tags** from the vocabulary below; read `tag_list` first. Pick from
   `suggestedTags` only what matches a term already in `tag_list` (or the
   vocabulary below) — a site's "Main Course" or "easy dinner" is not a tag
   here.
3. **Image**: keep `imageImportUrl` (`images[0]`) unless it is a logo, a
   step photo or a tiny crop — then pick another from `images`. A picture can
   also be fixed later (below).
4. **Lines**: drop "freshly squeezed" and similar padding; keep the page's
   quantities and units otherwise.
5. **Drinks**: the rules in "Drinks" below — garnish, method, glass and ice
   into `drink`, units to `oz`, the "Drink (Site)" name.

`recipe_update {"slug": …, "patch": {"tags": […]}}` fixes a recipe **this
run** created (`dryRun` works there too); `recipe_create` also takes a
dictated recipe.

**Video recipes.** A YouTube URL's `page_inspect` carries `video.description`
(often the full ingredient list and method) and `video.chapters`. Build
`ingredients` and `instructions` from those, keep the draft's `name`,
channel `source` and thumbnail image, and keep `videoImportUrl` — the page
embeds the video. Use one only when the ask allows videos.

**Partial pages.** `partial: true` means the page has no Recipe JSON-LD: the
draft is only its title, description, best image and source. Either read the
page yourself (WebFetch) and fill in `ingredients` and `instructions` before
creating — the citation stays the draft's `source` — or skip it and say so in
the report. Never create a recipe with no ingredients.

**Fixing an image later:**

```json
recipe_set_image {"slug": "vegetarian-chili", "url": "https://…/better.jpg"}
recipe_set_image {"slug": "vegetarian-chili", "clear": true}
```

Exactly one of `url`, `path` (a local image file) or `clear`; one commit,
`Update recipe image: <slug>`, returns `{slug, image, previous?}`. The image
must be a real image under 15 MB — an HTML page at an image URL is refused.

Tag vocabulary (lowercase, keep it small):

- diet — `vegetarian`, `vegan`, `gluten-free`
- meal — `breakfast`, `lunch`, `dinner`, `dessert`, `snack`
- speed — `quick` (≤ 30 minutes total)
- cuisine — one lowercase word (`thai`, `italian`, …)

**Drinks.** A cocktail or mocktail carries a `drink` spec, which the recipe
page renders as a Method · Glass · Ice · Garnish card:

```json
recipe_create {"recipe": {"name": "Daiquiri", "tags": ["drink", "rum", "sour"], "drink": {"method": "shake", "glass": "coupe", "ice": "up", "garnish": "lime wheel"}, "ingredients": ["2 oz white rum", "3/4 oz lime juice", "3/4 oz simple syrup"], "instructions": ["Shake hard with ice; double-strain."]}}
```

Every part is optional; `method` is one of `shake`, `stir`, `build`,
`blend`. The **garnish goes in `drink.garnish`, never in `ingredients`**, and
glass and method go in the spec rather than restated as the first
instruction. Name each ingredient **generic first, brand in parens** —
`"2 oz gin (Hendrick's)"` — so what is in the bottle stays searchable. Tag
`drink`, the base spirit, and one style (`sour`, `collins`, `stirred`,
`built`, `highball`, `batch`); `low-abv` or `zero-proof` where it applies. In
a `recipe_update` patch, `drink` **replaces** the whole spec rather than
merging into it, and `null` (or an empty object) removes it.

**Importing a drink from a site** is the same inspect → draft → create, with
these edits to the draft:

- **Name** `"Margarita (Liquor.com)"`, **slug** `margarita-liquor-com`. Two
  sites' versions of one drink are two recipes; both carry a shared drink tag
  (`margarita`) so `/tags/margarita` lists them side by side.
- **Tags:** `drink`, the base spirit, one style, `low-abv`/`zero-proof` where
  it applies, and the shared drink tag.
- **Units:** ounce(s) and fl oz → `oz`; ml → oz at 30 ml = 1 oz, rounded to
  the nearest ¼; ASCII fractions (`1 1/2`, never `1½`).
- **Lines:** generic name first, brand in parens; drop "freshly squeezed";
  garnish lines out of `ingredients` and into `drink.garnish`; method, glass
  and ice into `drink`.
- **House syrups** link their recipe — `"1/2 oz [lavender syrup](/recipe/lavender-syrup)"`
  — so "what can I make" can offer to make it first.
- **Description:** one or two sentences in the site's voice; the full
  citation stays in `source`, never in the description.

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

## 8. What's on hand

The site keeps one shared list of what is on hand (bottles, mixers, fruit,
pantry items) and judges recipes against it — the same rules as its "What can
I make?" page.

```json
inventory_get {}
inventory_add {"items": ["Gnista", "orange bitters"]}
inventory_remove {"items": ["vodka"]}
inventory_makeable {"query": "tag:drink", "limit": 20}
```

`inventory_get` → `{items, path}`. `inventory_add` and `inventory_remove` →
`{items, path, added, removed, changed}`, one commit each, and `changed:
false` when the list already said so. Write items the way recipe lines are
written: **generic name** (`lime`, `simple syrup`, `non-alcoholic gin`), or a
brand alone when it means one thing (`Gnista`). `inventory_makeable` →
`{query, inventory, total, canMake, oneAway, twoAway, further, buyNext}`:
each row is `{slug, name, missing?, makeFirst?}` (`makeFirst` names a recipe,
such as a house syrup, that meets a line once made), and `buyNext` ranks
`{item, label, unlocks, helps}` by how many recipes one more item would make
possible. Change the list **only when the ask says so** ("I bought Gnista",
"I'm out of vodka").

## 9. Report

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
`git_restore`, `git_push` and `inventory_set` (which replaces the whole
inventory) are not pre-approved and are not part of this skill — do not call them, and do not ask for them to be approved. If a write
goes wrong, find its commit with `git_log` and report the hash and the path:
undoing it with `git_revert` or `git_restore`, and pushing, are the user's
calls. Never pass `overwrite` or `force`, and never put `RECIPE_API_TOKEN` on
a command line.

## Fallback (CLI)

When the `recipes` server is not connected, the same operations exist as
`pnpm --silent recipes <command> … --json`, run **from the repo root**
(`--silent` keeps pnpm's banner out of the JSON). `pnpm --silent recipes --help`
lists the commands; the flags mirror the tool inputs:

- `page_inspect` → `pnpm --silent recipes inspect <url> --json` (`--out d.json`
  writes just the draft);
- `recipe_import {dryRun}` → `pnpm --silent recipes import <url> --dry-run --out d.json --json`
  (`--image <url>` picks another image);
- `recipe_create {recipe, dryRun}` → `pnpm --silent recipes create --file d.json --dry-run --json`,
  then the same without `--dry-run`;
- `recipe_update {slug, patch}` → `pnpm --silent recipes update <slug> --file patch.json --json`;
- `recipe_set_image` → `pnpm --silent recipes image <slug> --url <image-url> --json`
  (or `--file <path>`, or `--clear`).

The draft file is the loop: inspect or dry-run into `d.json`, edit it, check
it with `create --dry-run`, then create. Never pass `--author`,
`--remote`, `--editor-url`, `--notify`, `--overwrite`, `--force` or
`--content-dir` — the environment chooses the target, and a flag would let a
fallback run write somewhere the tools would not.
