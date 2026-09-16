# Worked transcripts

Real tool calls and real (abbreviated — long arrays cut with `…`) JSON,
captured from two headless `/recipe-curator` runs (`claude -p`, 2026-09-15)
against scratch copies of Playwright fixture content directories, each turned
into a git repo first. Timestamps, hashes and absolute paths differ from run to
run; the step headings match [SKILL.md](SKILL.md). Each block is the call as
the agent made it, then the JSON the tool answered.

## A nested, featured collection: "organize the cluster of cookie recipes into one featured group called Christmas Cookies, then combine the linzer cookie recipes into a group that is accessible both at the top level and inside Christmas Cookies"

Corpus: the `christmas-cookies` fixture (ten recipes, eight of them cookies).
Nothing was imported; the whole run is reads, two group writes, one feature and
one item rewrite. 24 turns, 70 s, no permission denials.

### 1. Where do writes go?

```
git_status {}
{"isRepo": true, "branch": "main", "detached": false, "ahead": 0, "behind": 0, "remotes": [], "branches": [{"name": "main", "current": true}], "merge": {"inProgress": false, "conflicted": [], "resolvedCount": 0}, "dirty": false, "dirtyCount": 0, "log": [{"hash": "6cbb31d0…", "message": "Initial commit", "author_name": "Smoke", "date": "2026-09-15T23:47:35-04:00"}], "hasMore": false}
```

```
recipe_list {"limit": 1}
{"total": 10, "more": true, "recipes": [{"slug": "linzer-cookies", "name": "Linzer Cookies", "date": 1765324800000, "tags": ["cookies", "dessert", …4 total], "totalTime": 62}]}
```

```
recipe_get {"slug": "linzer-cookies", "fields": ["name", "tags", "source"]}
{"slug": "linzer-cookies", "path": "…/scratch/recipes/data/linzer-cookies/recipe.json", "url": "/recipe/linzer-cookies", "recipe": {"name": "Linzer Cookies", "tags": ["cookies", "dessert", …4 total]}}
```

A repo on `main` with no remote, so every write becomes a commit that stays
local; `path` names a scratch directory rather than the real content repo —
carry on and say so in the report.

### 3. Reuse first

```
recipe_search {"query": "cookie", "limit": 100}
{"query": {"raw": "cookie", "text": "cookie", "hasAdvancedSyntax": false}, "total": 8, "recipes": [{"slug": "linzer-cookies", "name": "Linzer Cookies", "date": 1765324800000, "tags": ["cookies", "dessert", …4 total], "totalTime": 62}, {"slug": "chocolate-hazelnut-linzer-cookies", "name": "Chocolate Hazelnut Linzer Cookies", "date": 1765238400000, "tags": ["cookies", "dessert", …4 total], "totalTime": 67}, …8 total]}
```

```
recipe_search {"query": "linzer", "limit": 100}
{"query": {"raw": "linzer", "text": "linzer", "hasAdvancedSyntax": false}, "total": 3, "recipes": [{"slug": "linzer-cookies", …}, {"slug": "chocolate-hazelnut-linzer-cookies", …}, {"slug": "apricot-linzer-cookies", "name": "Apricot Linzer Cookies", "date": 1765152000000, "tags": ["cookies", "dessert", …4 total], "totalTime": 62}]}
```

```
group_list {"limit": 100}
{"total": 0, "more": false, "groups": []}
```

```
featured_list {"limit": 100}
{"total": 0, "more": false, "featured": []}
```

```
tag_list {}
{"tags": ["baked", "breakfast", …7 total]}
```

One word per query: "cookie" finds the eight (it prefix-matches "cookies" in
names, descriptions and tags; the chili and the banana bread stay out), "linzer"
the three. No groups and nothing featured yet, so both slugs are free.

### 7. Group them

Parent first, with every cookie; then feature it; then the child; then rewrite
the parent's list so the linzer three appear through the nested group rather
than twice.

```
group_create {"group": {"name": "Christmas Cookies", "kind": "collection", "description": "The holiday cookie tin: gingerbread, sugar cookies, snickerdoodles, peanut butter blossoms, shortbread and the linzer family.", "items": ["gingerbread-cookies", "sugar-cookies", "snickerdoodles", "peanut-butter-blossoms", "shortbread", "linzer-cookies", "chocolate-hazelnut-linzer-cookies", "apricot-linzer-cookies"]}}
{"slug": "christmas-cookies", "date": 1789530504242, "path": "…/scratch/groups/data/christmas-cookies/group.json", "url": "/group/christmas-cookies", "warnings": ["A running editor is stale until Settings → Maintenance → Reload. Set RECIPE_EDITOR_URL (or pass --notify --editor-url <url>) to invalidate it automatically."]}
```

```
feature {"group": "christmas-cookies", "slug": "christmas-cookies-strip"}
{"slug": "christmas-cookies-strip", "date": 1789530508414, "path": "…/scratch/featured-recipes/data/christmas-cookies-strip/featured-recipe.json", "url": "/featured-recipe/christmas-cookies-strip", "group": "christmas-cookies", "warnings": ["A running editor is stale until …"]}
```

```
group_create {"group": {"name": "Linzer Cookies", "kind": "collection", "description": "Every linzer cookie on the site: the classic raspberry, chocolate hazelnut and apricot.", "items": ["linzer-cookies", "chocolate-hazelnut-linzer-cookies", "apricot-linzer-cookies"]}}
{"slug": "linzer-cookies", "date": 1789530505489, "path": "…/scratch/groups/data/linzer-cookies/group.json", "url": "/group/linzer-cookies", "warnings": ["A running editor is stale until …"]}
```

```
group_set_items {"group": "christmas-cookies", "items": ["gingerbread-cookies", "sugar-cookies", "snickerdoodles", "peanut-butter-blossoms", "shortbread", {"group": "linzer-cookies", "note": "The three linzer variations, also a collection of their own."}]}
{"slug": "christmas-cookies", "date": 1789530504242, "path": "…/scratch/groups/data/christmas-cookies/group.json", "url": "/group/christmas-cookies", "warnings": ["A running editor is stale until …"]}
```

Read both back, and the strip and the top level:

```
group_get {"slug": "christmas-cookies"}
{"slug": "christmas-cookies", "path": "…", "url": "/group/christmas-cookies", "group": {"name": "Christmas Cookies", "date": 1789530504242, "kind": "collection", "description": "…", "items": [{"recipe": "gingerbread-cookies"}, …, {"group": "linzer-cookies", "note": "…"}]}, "items": [{"recipe": "gingerbread-cookies", "name": "Gingerbread Cookies"}, {"recipe": "sugar-cookies", "name": "Sugar Cookies"}, {"recipe": "snickerdoodles", "name": "Snickerdoodles"}, {"recipe": "peanut-butter-blossoms", "name": "Peanut Butter Blossoms"}, {"recipe": "shortbread", "name": "Shortbread"}, {"group": "linzer-cookies", "note": "…", "name": "Linzer Cookies", "kind": "collection"}]}
```

```
group_get {"slug": "linzer-cookies"}
{"slug": "linzer-cookies", "path": "…", "url": "/group/linzer-cookies", "group": {…, "items": [{"recipe": "linzer-cookies"}, {"recipe": "chocolate-hazelnut-linzer-cookies"}, {"recipe": "apricot-linzer-cookies"}]}, "items": [{"recipe": "linzer-cookies", "name": "Linzer Cookies"}, {"recipe": "chocolate-hazelnut-linzer-cookies", "name": "Chocolate Hazelnut Linzer Cookies"}, {"recipe": "apricot-linzer-cookies", "name": "Apricot Linzer Cookies"}]}
```

```
featured_list {}
{"total": 1, "more": false, "featured": [{"slug": "christmas-cookies-strip", "date": 1789530508414, "group": "christmas-cookies", "name": "Christmas Cookies"}]}
```

```
group_list {}
{"total": 2, "more": false, "groups": [{"slug": "linzer-cookies", "date": 1789530505489, "name": "Linzer Cookies", "kind": "collection", "itemCount": 3}, {"slug": "christmas-cookies", "date": 1789530504242, "name": "Christmas Cookies", "kind": "collection", "itemCount": 6}]}
```

Every row resolved (no `missing`), the child is a top-level row of its own,
and the strip carries the parent.

### 8. Report

```
git_log {"limit": 10}
{"commits": [{"hash": "f898c59b…", "message": "Set items on group: christmas-cookies", "author_name": "Smoke", "date": "2026-09-15T23:48:32-04:00", "files": ["groups/data/christmas-cookies/group.json"]}, {"hash": "cc8270de…", "message": "Feature group: christmas-cookies", "files": ["featured-recipes/data/christmas-cookies-strip/featured-recipe.json"]}, {"hash": "8172e7d…", "message": "Create group: linzer-cookies", …}, {"hash": "cd19e11…", "message": "Create group: christmas-cookies", …}, {"hash": "6cbb31d0…", "message": "Initial commit", …}], "hasMore": false}
```

The report opened with the scratch directory and the branch, listed both
groups with `/group/<slug>` links and the featured entry, named the one
judgment call (the linzer three appear once, through the nested group — one
`group_set_items` call away if the user wants them directly in the parent
too), listed the four commits, restated the `warnings` line as "a running
editor is stale until Settings → Maintenance → Reload, since
`RECIPE_EDITOR_URL` is not set", and ended with "push from `/git` when ready".

## A meal plan: "three vegetarian dinners under 45 minutes for this week"

Corpus: the `three-recipes-groups` fixture (three placeholder recipes, no
tags). Two web searches, six dry-runs, three imports, one meal plan. 21 turns,
72 s, no permission denials.

### 1. Where do writes go?

```
git_status {}
{"isRepo": true, "branch": "main", …, "remotes": [], "dirty": false, "log": [{"hash": "51c267e9…", "message": "Initial commit", …}], "hasMore": false}
```

```
recipe_list {"limit": 1}
{"total": 3, "more": true, "recipes": [{"slug": "third-recipe", "name": "Third Recipe", "date": 1767734340692}]}
```

```
recipe_get {"slug": "third-recipe"}
{"slug": "third-recipe", "path": "…/scratch/recipes/data/third-recipe/recipe.json", "url": "/recipe/third-recipe", "recipe": {"name": "Third Recipe", "description": "This is the third recipe.", "date": 1767734340692, "prepTime": 0, "cookTime": 0, "totalTime": 0, "recipeYield": ""}}
```

### 2. Constraints

Three dinners · vegetarian · `totalTime` ≤ 45 · one meal plan for the week.
Servings unspecified, so each recipe keeps its own yield — said so in the
report.

### 3. Reuse first

```
tag_list {}
{"tags": []}
```

```
recipe_list {"limit": 10, "fields": ["description", "ingredients", "prepTime", "cookTime"]}
{"total": 3, "more": false, "recipes": [{"slug": "third-recipe", "name": "Third Recipe", "date": 1767734340692, "description": "This is the third recipe."}, {"slug": "second-recipe", …}, {"slug": "first-recipe", …}]}
```

Three placeholders with no ingredients, no timing and no tags: nothing to
reuse, so all three come from the web.

### 4–5. Candidates, dry-run each

```
WebSearch {"query": "quick vegetarian dinner recipes 30 minutes", "allowed_domains": ["budgetbytes.com"]}
Links: [{"title":"Easy Vegetarian Recipes - Budget Bytes","url":"https://www.budgetbytes.com/easy-vegetarian-recipes/"}, {"title":"Quick Budget-Friendly Recipes in Under 30 Minutes - Budget Bytes", …}, …]
```

```
recipe_import {"url": "https://www.budgetbytes.com/vegetarian-chili/", "dryRun": true}
{"dryRun": true, "url": "https://www.budgetbytes.com/vegetarian-chili/", "slug": "vegetarian-chili", "recipe": {"name": "Vegetarian Chili", "date": 1789530498387, "description": "This hearty Vegetarian Chili is cozy, budget-friendly, and full of flavor. …", "prepTime": 10, "cookTime": 30, "totalTime": 40, "source": {"url": "https://www.budgetbytes.com/vegetarian-chili/", "name": "budgetbytes.com"}, "ingredients": [{"ingredient": "<Multiplyable baseNumber=\"2\" /> Tbsp olive oil ($<Multiplyable baseNumber=\"0.38\" />)"}, …20 total], "instructions": [{"text": "Dice the onion and bell pepper. Mince the garlic."}, …6 total], "image": "…"}, "image": {…}, "video": "…"}
```

Keep: 40 min, 20 ingredients, 6 instructions, `source.url` present.

```
recipe_import {"url": "https://www.budgetbytes.com/curried-chickpeas-with-spinach/", "dryRun": true}
ERROR {"error": {"code": "import_failed", "message": "No schema.org Recipe found at https://www.budgetbytes.com/curried-chickpeas-with-spinach/"}}
```

Drop it, and say so in the report.

```
recipe_import {"url": "https://www.budgetbytes.com/hearty-black-bean-quesadillas/", "dryRun": true}
{"dryRun": true, …, "slug": "hearty-black-bean-quesadillas", "recipe": {"name": "Hearty Black Bean Quesadillas", "description": "… an easy vegetarian snack or light meal …", "prepTime": 5, "cookTime": 10, "totalTime": 15, "source": {…}, "ingredients": […8 total], "instructions": […]}}
```

Passes the limit but the page bills it as a snack — set aside, with the
reason in the report. Three more dry-runs (creamy tomato and spinach pasta at
25 min, easy vegetable stir fry at 25 min, tuscan orzo at 30 min) all passed;
the pasta overlapped with the orzo and was left out.

### 6. Import the keepers

```
recipe_import {"url": "https://www.budgetbytes.com/vegetarian-chili/", "tags": ["vegetarian", "dinner"]}
{"slug": "vegetarian-chili", "date": 1789530510758, "path": "…/scratch/recipes/data/vegetarian-chili/recipe.json", "url": "/recipe/vegetarian-chili", "source": {"url": "https://www.budgetbytes.com/vegetarian-chili/", "name": "budgetbytes.com"}, "warnings": ["A running editor is stale until Settings → Maintenance → Reload. Set RECIPE_EDITOR_URL (or pass --notify --editor-url <url>) to invalidate it automatically."]}
```

```
recipe_import {"url": "https://www.budgetbytes.com/easy-vegetable-stir-fry/", "tags": ["vegetarian", "dinner", "quick"]}
{"slug": "easy-vegetable-stir-fry", "date": 1789530511587, "path": "…", "url": "/recipe/easy-vegetable-stir-fry", "source": {…}, "warnings": ["A running editor is stale until …"]}
```

```
recipe_import {"url": "https://www.budgetbytes.com/tuscan-orzo/", "tags": ["vegetarian", "dinner", "quick", "italian"]}
{"slug": "tuscan-orzo", "date": 1789530512326, "path": "…", "url": "/recipe/tuscan-orzo", "source": {…}, "warnings": ["A running editor is stale until …"]}
```

`quick` only where `totalTime` ≤ 30; one lowercase cuisine word. The slugs
came from the dry-runs, so no `slug_conflict`.

### 7. Group them

```
group_create {"group": {"name": "Week of 2026-09-14", "kind": "meal-plan", "description": "Three vegetarian dinners, each under 45 minutes.", "items": ["vegetarian-chili:Tue · Dinner", "easy-vegetable-stir-fry:Thu · Dinner", "tuscan-orzo:Sat · Dinner"]}}
{"slug": "week-of-2026-09-14", "date": 1789530517410, "path": "…/scratch/groups/data/week-of-2026-09-14/group.json", "url": "/group/week-of-2026-09-14", "warnings": ["A running editor is stale until …"]}
```

```
group_get {"slug": "week-of-2026-09-14"}
{"slug": "week-of-2026-09-14", …, "group": {"name": "Week of 2026-09-14", "kind": "meal-plan", "items": [{"recipe": "vegetarian-chili", "label": "Tue · Dinner"}, …3 total]}, "items": [{"recipe": "vegetarian-chili", "label": "Tue · Dinner", "name": "Vegetarian Chili"}, …3 total]}
```

### 8. Report

```
git_log {"limit": 5}
{"commits": [{"hash": "ff24a6f0…", "message": "Create group: week-of-2026-09-14", "files": ["groups/data/week-of-2026-09-14/group.json"]}, {"hash": "9c9d80f9…", "message": "Create recipe: tuscan-orzo", "files": ["recipes/data/tuscan-orzo/recipe.json", "uploads/recipe/tuscan-orzo/uploads/Tuscan-Orzo-Pan.jpg"]}, {"hash": "30af2dda…", "message": "Create recipe: easy-vegetable-stir-fry", …}, {"hash": "2e664246…", "message": "Create recipe: vegetarian-chili", …}, {"hash": "51c267e9…", "message": "Initial commit", …}], "hasMore": false}
```

| Day | Recipe                                                     | Time   | Source                                                               |
| --- | ---------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| Tue | [Vegetarian Chili](/recipe/vegetarian-chili)               | 40 min | [Budget Bytes](https://www.budgetbytes.com/vegetarian-chili/)        |
| Thu | [Easy Vegetable Stir Fry](/recipe/easy-vegetable-stir-fry) | 25 min | [Budget Bytes](https://www.budgetbytes.com/easy-vegetable-stir-fry/) |
| Sat | [Tuscan Orzo](/recipe/tuscan-orzo)                         | 30 min | [Budget Bytes](https://www.budgetbytes.com/tuscan-orzo/)             |

Meal plan: `/group/week-of-2026-09-14`. Set aside: curried chickpeas (no
recipe data on the page), the creamy tomato pasta (overlapped with the orzo),
the quesadillas (billed as a snack). Four commits on `main`, listed newest
first; the `warnings` line restated as "the running editor is stale until
Settings → Maintenance → Reload"; push from `/git` when ready.
