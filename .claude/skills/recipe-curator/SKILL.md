---
name: recipe-curator
description: Find, import, cite and organize recipes for the recipe website — meal plans, collections and nested collections (as tag terms), the homepage strip and the shared list of what's on hand — through the `recipes` MCP tools. Use for asks like "plan dinners for the week", "import this recipe", "make a collection of …", "put it on the homepage", "I bought Gnista", "what can I make?".
allowed-tools: mcp__recipes__recipe_search, mcp__recipes__recipe_list, mcp__recipes__recipe_get, mcp__recipes__page_inspect, mcp__recipes__recipe_import, mcp__recipes__recipe_create, mcp__recipes__recipe_update, mcp__recipes__recipe_set_image, mcp__recipes__tag_list, mcp__recipes__term_list, mcp__recipes__term_get, mcp__recipes__term_create, mcp__recipes__term_update, mcp__recipes__term_assign, mcp__recipes__term_rename, mcp__recipes__group_list, mcp__recipes__group_get, mcp__recipes__group_create, mcp__recipes__group_update, mcp__recipes__group_set_items, mcp__recipes__group_add_item, mcp__recipes__group_remove_item, mcp__recipes__featured_list, mcp__recipes__feature, mcp__recipes__inventory_get, mcp__recipes__inventory_add, mcp__recipes__inventory_remove, mcp__recipes__inventory_makeable, mcp__recipes__git_status, mcp__recipes__git_log, mcp__recipes__git_show, mcp__recipes__git_file_at, mcp__recipes__git_diff, mcp__recipes__git_fetch, WebSearch, WebFetch, Bash(pnpm --silent recipes:*)
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

`git_status` → `{isRepo, branch, upstream, ahead, behind, diverged,
fetchedAt, dirty, indexStale, remotes, log}`: `isRepo: true` means every write
becomes a commit on that branch. `ahead`/`behind` are only as fresh as
`fetchedAt`; `git_fetch {}` (or `git_status {"fetch": true}`) refreshes them
and touches nothing else. If `behind` > 0 the remote has recipes this copy
lacks — mention it, since pulling is the user's call.
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
and `source`. Free-text words match at a **word start with your word as the
prefix** ("cookie" finds "cookies", not the other way round). A row needs
**any** of the words, and results are **ranked**: a word in the name counts
most, then tags, ingredients and description, and ties go newest first. So
`lime gin` puts the gin-and-lime drinks first and the rest after. Use a few
key words, not a sentence, and narrow with typed terms. Read `tag_list`
before inventing a tag. Typed terms: `tag:x`, `-tag:x`, `ingredient:x`,
`name:x`, `description:x`, `source:x` (a site's name or host, e.g.
`source:imbibe`), `group:x` (a group's slug or name, sub-groups included),
`time:<=45` (bare `time:30` means ≤ 30), `before:`/`after:`,
`AND`/`OR`/`NOT`, parentheses. A recipe with no timing never matches a
`time:` query. **Prefer an existing recipe over a new import.**

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
6. **Yield**: check `recipeYield` against the volumes. A cocktail of about
   3 oz makes 1, not "10"; drop or fix a yield the ingredients don't support.

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
recipe_create {"recipe": {"name": "Daiquiri", "tags": ["drink", "rum", "sour", "shaken"], "drink": {"method": "shake", "glass": "coupe", "ice": "up", "garnish": "lime wheel"}, "ingredients": ["2 oz white rum", "3/4 oz lime juice", "3/4 oz simple syrup"], "instructions": ["Shake hard with ice; double-strain."]}}
```

Every part is optional; `method` is one of `shake`, `stir`, `build`,
`blend`. The **garnish goes in `drink.garnish`, never in `ingredients`**, and
glass and method go in the spec rather than restated as the first
instruction. Name each ingredient **generic first, brand in parens** —
`"2 oz gin (Hendrick's)"` — so what is in the bottle stays searchable. Tag
`drink`, the base spirit, and one style (`sour`, `collins`, `stirred`,
`built`, `highball`, `batch`); `low-abv` or `zero-proof` where it applies.
Every drink whose `method` is `shake` **also** gets `shaken`. It names the
method, not a style, so a sour carries both `sour` and `shaken`, and a shaken
drink with no citrus (espresso martini, French martini, alexanders) carries
`shaken` and no `sour`. "Shaken but not sour" is `tag:shaken -tag:sour`. In
a `recipe_update` patch, `drink` **replaces** the whole spec rather than
merging into it, and `null` (or an empty object) removes it.

**Importing a drink from a site** is the same inspect → draft → create, with
these edits to the draft:

- **Name** `"Margarita (Liquor.com)"`, **slug** `margarita-liquor-com`. Two
  sites' versions of one drink are two recipes; both carry a shared drink tag
  (`margarita`) so `/tags/margarita` lists them side by side.
- **Tags:** `drink`, the base spirit, one style, `shaken` if the method is
  shake, `low-abv`/`zero-proof` where it applies, and the shared drink tag.
- **Units:** ounce(s) and fl oz → `oz`; ml → oz at 30 ml = 1 oz, rounded to
  the nearest ¼; ASCII fractions (`1 1/2`, never `1½`).
- **Lines:** generic name first, brand in parens; drop "freshly squeezed";
  garnish lines out of `ingredients` and into `drink.garnish`; method, glass
  and ice into `drink`.
- **House syrups** link their recipe — `"1/2 oz [lavender syrup](/recipe/lavender-syrup)"`
  — so "what can I make" can offer to make it first.
- **Description:** one or two sentences in the site's voice; the full
  citation stays in `source`, never in the description.

## 7. Organize them: a term or a meal plan

Two shapes, and the ask decides which:

- **A cluster by kind, or a curated collection** ("make a collection of …",
  "group the cookie recipes") → a **term**: a tag with a record that gives it
  a label, a description, a picture, a parent and a pinned front. Its page is
  `/tags/<slug>`, and `tag:<slug>` also finds everything under it.
- **An ordered, dated list with a label per item** ("plan dinners for the
  week") → a **meal-plan group**.

**Terms.** Read `term_list {}` first (`{total, more, terms: [{slug, label,
count, parent?, record}]}`) and reuse a term that is already there. Then:

```json
term_create {"term": {"label": "Christmas Cookies", "description": "Everything that comes out of the oven in December."}}
term_assign {"slug": "christmas-cookies", "add": ["gingerbread-cookies", "sugar-cookies", "snickerdoodles"]}
```

`term_create` returns `{slug, date, path, url, tag, warnings?}` — the slug
defaults to the label's — and `tag` is the string `term_assign` writes onto
each recipe. `term_assign` writes one commit per recipe and returns `{slug,
type, tag, updated, unchanged, missing}`; `type: "group"` tags groups
instead. Fix any `missing` slug, never invent one.

**Nesting.** A term with a `parent` sits under it: create the child with
`{"parent": "<parent slug>"}` (or `term_update {"slug": …, "patch":
{"parent": …}}` later) and assign it to its own recipes; it is a term of its
own _and_ part of the parent, since `tag:<parent>` finds the child's recipes
too. The Christmas-Cookies shape, in order: parent term → assign it → child
term with `parent` → assign the child → `feature` the parent if asked →
`term_get` both to check (`counts.own`, `counts.withDescendants`,
`children`, `breadcrumb`). A parent that would put a term under itself fails
with `code: "term_cycle"`, which is final.

`pinned` (on create or update) is an ordered list of recipe slugs that lead
the term's page; each must already carry the term. `term_rename {"slug": …,
"to": "<new slug or label>"}` moves a term and rewrites every recipe carrying
it, one commit each — renaming onto an existing term is `slug_conflict`.

**Meal plans.**

```json
group_create {"group": {"name": "Week of 2026-09-07", "kind": "meal-plan", "items": ["mushroom-stroganoff:Mon · Dinner", "vegetarian-chili:Wed · Dinner"]}}
```

Returns `{slug, date, path, url, warnings?}`. An item is `"slug"`,
`"slug:label"` (split at the first colon), `{recipe, label?, note?}` or
`{group, label?, note?}`. `kind` is always `meal-plan` — a new
`collection` is refused, because a collection is a term now; older
collection groups still read and update. `imageImportUrl` gives a group a
cover picture, fetched at write time. On `code: "unknown_recipe"` or
`code: "unknown_group"` fix the slug — never `force`. A `{group: "<slug>"}`
item nests one plan inside another (`group_add_item {"group": "<parent>",
"subgroup": "<child>"}`); the other direction is `code: "group_cycle"`.

```json
feature {"term": "christmas-cookies", "slug": "christmas-cookies-strip"}
```

Puts a term (one with a record), a `group` or a `recipe` on the homepage
strip — **only when the ask says so** ("feature it", "put it on the
homepage"). Returns `{slug, date, path, url, term}`, where `slug` is the
_entry's_ own, not the target's: pass an explicit one whenever you feature
more than one thing, since the default has one-second resolution.
`featured_list` shows the strip. `group_update` fixes a plan's name or
description and never touches the items, so a plan cannot be lost to a
rename; `group_remove_item` drops one row.

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
then the `/group/<slug>` or `/tags/<slug>` links, then anything rejected and
why. Restate any
`warnings` in plain words — the stale-editor line means the running editor
needs Settings → Maintenance → Reload, or that `RECIPE_EDITOR_URL` is unset.
When `git_status` said `isRepo`, list what you committed from
`git_log {"type": "group", "slug": "<slug>"}` (or `"type": "term"`) →
`{commits: [{hash, message, date, files}], hasMore}` (`git_show`, `git_diff`
and `git_file_at` read one back). End with: push from `/git` when ready.

## Held back

`recipe_delete`, `group_delete`, `term_delete`, `term_merge`, `unfeature`,
`reindex`, `git_revert`, `git_restore`, `git_push`, `git_pull`, `git_sync` and
`inventory_set` (which replaces the whole inventory) are not pre-approved and are not part of this skill — do not call them, and do not ask for them to be approved. If a write
goes wrong, find its commit with `git_log` and report the hash and the path:
undoing it with `git_revert` or `git_restore`, and pulling or pushing, are the
user's calls. If `git_status` reports `indexStale: true`, say so in the report
and suggest a reindex; do not run one. Never pass `overwrite` or `force`, and never put `RECIPE_API_TOKEN` on
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
