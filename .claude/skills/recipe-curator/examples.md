# Worked transcripts

Real tool calls and real (abbreviated — long arrays cut with `…`) JSON,
captured from headless `/recipe-curator` runs (`claude -p`, 2026-09-15, and the import at the end on 2026-10-06; the first, taxonomy-edition transcript is a tool replay, as it says)
against scratch copies of Playwright fixture content directories, each turned
into a git repo first. Timestamps, hashes and absolute paths differ from run to
run; the step headings match [SKILL.md](SKILL.md). Each block is the call as
the agent made it, then the JSON the tool answered.

## A nested, featured collection — taxonomy edition: "organize the cluster of cookie recipes into one featured group called Christmas Cookies, then combine the linzer cookie recipes into a group that is accessible both at the top level and inside Christmas Cookies"

Corpus: the `christmas-cookies` fixture (ten recipes, eight of them cookies).
Since epic 31 (31c) a collection is a **term**, so the ask lands as two
terms — `christmas-cookies`, and `linzer` beneath it — not as groups. This
transcript is not a model run: it is the acceptance sequence
(`test/christmasCookies.test.ts`) replayed over the in-memory MCP client on
2026-10-10, against a scratch copy that is not a git repository (so nothing
commits). Step 1 is as in the meal-plan run below.

### 3. Reuse first

```
term_list {}
{"total": 8, "more": false, "terms": [{"slug": "baked", "label": "baked", "count": 9, "record": false}, {"slug": "breakfast", …}, {"slug": "christmas", "label": "christmas", "count": 4, "record": false}, {"slug": "cookies", "label": "Cookies", "count": 8, "parent": "dessert", "record": true}, {"slug": "dessert", "label": "Dessert", "count": 8, "record": true}, {"slug": "dinner", …}, {"slug": "holiday", "label": "Holiday", "count": 0, "record": true}, {"slug": "quick", …}]}
```

```
recipe_search {"query": "cookie", "limit": 100}
{"query": {"raw": "cookie", "text": "cookie", "hasAdvancedSyntax": false}, "total": 8, "recipes": [{"slug": "linzer-cookies", "name": "Linzer Cookies", "date": 1765324800000, "tags": ["cookies", "dessert", "baked", "christmas"], "totalTime": 62}, {"slug": "chocolate-hazelnut-linzer-cookies", …}, {"slug": "apricot-linzer-cookies", …}, {"slug": "gingerbread-cookies", …}, …8 total]}
```

No `christmas-cookies` term yet, and `cookies` is a different, broader term
(every cookie, under `dessert`), so a new one is right. "cookie" finds the
eight; the chili and the banana bread stay out.

### 7. Organize them

Parent term first, assigned to the five that are not linzers; then the child
term with `parent`, assigned to the three linzers — they reach the parent
through the hierarchy, so they are not tagged twice; then feature the parent.

```
term_create {"term": {"label": "Christmas Cookies", "description": "The holiday cookie tin: gingerbread, sugar cookies, snickerdoodles, peanut butter blossoms, shortbread and the linzer family."}}
{"slug": "christmas-cookies", "date": 1791607687292, "path": "…/scratch/taxonomies/tag/data/christmas-cookies/term.json", "url": "/tags/christmas-cookies", "tag": "christmas cookies", "warnings": ["A running editor is stale until Settings → Maintenance → Reload. Set RECIPE_EDITOR_URL (or pass --notify --editor-url <url>) to invalidate it automatically."]}
```

```
term_assign {"slug": "christmas-cookies", "add": ["gingerbread-cookies", "sugar-cookies", "snickerdoodles", "peanut-butter-blossoms", "shortbread"]}
{"slug": "christmas-cookies", "type": "recipe", "tag": "christmas cookies", "updated": ["gingerbread-cookies", "sugar-cookies", "snickerdoodles", "peanut-butter-blossoms", "shortbread"], "unchanged": [], "missing": [], "warnings": ["A running editor is stale until …"]}
```

```
term_create {"term": {"label": "Linzer", "parent": "christmas-cookies", "description": "Every linzer cookie on the site: the classic raspberry, chocolate hazelnut and apricot."}}
{"slug": "linzer", "date": 1791607687372, "path": "…/scratch/taxonomies/tag/data/linzer/term.json", "url": "/tags/linzer", "tag": "linzer", "warnings": ["A running editor is stale until …"]}
```

```
term_assign {"slug": "linzer", "add": ["linzer-cookies", "chocolate-hazelnut-linzer-cookies", "apricot-linzer-cookies"]}
{"slug": "linzer", "type": "recipe", "tag": "linzer", "updated": ["linzer-cookies", "chocolate-hazelnut-linzer-cookies", "apricot-linzer-cookies"], "unchanged": [], "missing": [], "warnings": ["A running editor is stale until …"]}
```

```
feature {"term": "christmas-cookies", "slug": "christmas-cookies-strip"}
{"slug": "christmas-cookies-strip", "date": 1791607687413, "path": "…/scratch/featured-recipes/data/christmas-cookies-strip/featured-recipe.json", "url": "/featured-recipe/christmas-cookies-strip", "term": "christmas-cookies", "warnings": ["A running editor is stale until …"]}
```

Read back — the parent's search, both terms, and the strip:

```
recipe_search {"query": "tag:christmas-cookies", "limit": 100}
{"query": {"raw": "tag:christmas-cookies", "text": "", "hasAdvancedSyntax": true}, "total": 8, "recipes": [{"slug": "linzer-cookies", "name": "Linzer Cookies", "date": 1765324800000, "tags": ["cookies", "dessert", "baked", "christmas", "linzer"], "totalTime": 62}, …8 total]}
```

```
term_get {"slug": "christmas-cookies"}
{"slug": "christmas-cookies", "label": "Christmas Cookies", "url": "/tags/christmas-cookies", "path": "…", "record": {"label": "Christmas Cookies", "date": 1791607687292, "description": "…"}, "breadcrumb": [{"slug": "christmas-cookies", "label": "Christmas Cookies", "count": 5}], "children": [{"slug": "linzer", "label": "Linzer", "count": 3}], "counts": {"own": 5, "withDescendants": 8}, "recipes": ["gingerbread-cookies", "sugar-cookies", …5 total], "groups": []}
```

```
term_get {"slug": "linzer"}
{"slug": "linzer", "label": "Linzer", "url": "/tags/linzer", "path": "…", "record": {"label": "Linzer", "date": 1791607687372, "description": "…", "parent": "christmas-cookies"}, "parent": "christmas-cookies", "breadcrumb": [{"slug": "christmas-cookies", "label": "Christmas Cookies", "count": 5}, {"slug": "linzer", "label": "Linzer", "count": 3}], "children": [], "counts": {"own": 3, "withDescendants": 3}, "recipes": ["linzer-cookies", "chocolate-hazelnut-linzer-cookies", "apricot-linzer-cookies"], "groups": []}
```

```
featured_list {}
{"total": 1, "more": false, "featured": [{"slug": "christmas-cookies-strip", "date": 1791607687413, "term": "christmas-cookies", "name": "Christmas Cookies"}]}
```

`tag:christmas-cookies` finds all eight though only five carry the tag:
`linzer` is its child. Linzer is a term of its own (`/tags/linzer`, the top
level) and inside Christmas Cookies (its breadcrumb and the parent's
`children`), and the strip carries the parent.

### 9. Report

The report names the scratch directory, links `/tags/christmas-cookies` and
`/tags/linzer` and the featured entry, names the one judgment call (the
linzers carry only `linzer`, reaching the parent through the hierarchy — one
`term_assign` away if the user wants them tagged directly too), restates the
`warnings` line as "a running editor is stale until Settings → Maintenance →
Reload, since `RECIPE_EDITOR_URL` is not set", and — in a git repository —
lists the commits from `git_log` (one per term record, one per recipe
assigned, one for the feature) and ends with "push from `/git` when ready".

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

## An import: "import this recipe https://www.acouplecooks.com/paper-plane-cocktail/"

Corpus: a scratch git copy of the `three-recipes` fixture (`CONTENT_DIRECTORY`
absolute, no `--allowedTools`), captured 2026-10-06 after 26b. The whole run
is inspect → draft → dry run → create: 11 turns, 35 s, no permission denials.

### 1. Where do writes go?

```
git_status {}
{"isRepo": true, "branch": "main", "ahead": 0, "behind": 0, "remotes": [], "dirty": false, "log": [{"hash": "f8f21c56…", "message": "Initial commit", …}], …}
recipe_list {"limit": 1}
{"total": 3, "more": true, "recipes": [{"slug": "third-recipe", "name": "Third Recipe", "date": 1767734340692}]}
recipe_get {"slug": "third-recipe", "fields": ["name"]}
{"slug": "third-recipe", "path": "/…/scratch-skill/recipes/data/third-recipe/recipe.json", "url": "/recipe/third-recipe", "recipe": {"name": "Third Recipe"}}
```

### 3. Reuse first

```
recipe_search {"query": "paper plane"}
{"query": {"raw": "paper plane", …}, "total": 0, "recipes": []}
tag_list {}
{"tags": []}
```

### 5. Inspect the candidate

```
page_inspect {"url": "https://www.acouplecooks.com/paper-plane-cocktail/"}
{"url": "https://www.acouplecooks.com/paper-plane-cocktail/", "finalUrl": "…", "status": 200, "partial": false, "recipe": {…}, "draft": {"name": "Paper Plane Cocktail", "description": "The Paper Plane cocktail is a modern classic that's a must try! …", "recipeYield": "1 drink", "prepTime": 5, "totalTime": 5, "ingredients": ["1 ounce (2 tablespoons) bourbon whiskey", "1 ounce (2 tablespoons) Aperol", "1 ounce (2 tablespoons) Italian amaro (like Nonino Quintessentia or other brand)", "1 ounce (2 tablespoons) fresh lemon juice", "For the garnish: Lemon peel"], "instructions": ["Add the bourbon, Aperol, amaro, and lemon juice to a cocktail shaker. Fill it with ice and shake it until cold.", "Strain into a cocktail glass. If desired, garnish with a lemon peel."], "source": {"url": "https://www.acouplecooks.com/paper-plane-cocktail/", "name": "acouplecooks.com", "author": "Sonja Overhiser"}, "imageImportUrl": "https://www.acouplecooks.com/wp-content/uploads/2020/06/Paper-Plane-Cocktail-003.jpg"}, "jsonLd": {…}, "meta": {…}, "images": [{"url": "…/Paper-Plane-Cocktail-003.jpg", "width": 800, "height": 1000, "from": "jsonld"}, …10 total]}
```

`images[0]` is the full-size original, not the 225×225 crop the page lists
first.

### 6. Inspect, draft, create

The draft with the checklist applied — the "Drink (Site)" name and slug,
tags, the `drink` spec with the garnish moved out of `ingredients`, `oz`, and
`source` and `imageImportUrl` kept as the draft had them — checked first:

```
recipe_create {"recipe": {"name": "Paper Plane (A Couple Cooks)", "slug": "paper-plane-a-couple-cooks", "description": "The Paper Plane cocktail is a modern classic that's a must try! …", "recipeYield": "1 drink", "prepTime": 5, "totalTime": 5, "tags": ["drink", "bourbon", "sour", "paper-plane"], "drink": {"method": "shake", "glass": "cocktail glass", "ice": "up", "garnish": "lemon peel"}, "ingredients": ["1 oz bourbon", "1 oz Aperol", "1 oz amaro (Amaro Nonino Quintessentia)", "1 oz lemon juice"], "instructions": ["Add the bourbon, Aperol, amaro and lemon juice to a cocktail shaker. Fill it with ice and shake until cold.", "Strain into the glass and garnish with the lemon peel, if desired."], "source": {"url": "https://www.acouplecooks.com/paper-plane-cocktail/", "name": "acouplecooks.com", "author": "Sonja Overhiser"}, "imageImportUrl": "https://www.acouplecooks.com/wp-content/uploads/2020/06/Paper-Plane-Cocktail-003.jpg"}, "dryRun": true}
{"dryRun": true, "slug": "paper-plane-a-couple-cooks", "conflict": false, "recipe": {"name": "Paper Plane (A Couple Cooks)", …, "image": "Paper-Plane-Cocktail-003.jpg"}, "image": {"importUrl": "…", "filename": "Paper-Plane-Cocktail-003.jpg", "status": 200, "contentType": "image/jpeg"}}
recipe_create {"recipe": {…the same…}}
{"slug": "paper-plane-a-couple-cooks", "date": 1791324430733, "path": "/…/scratch-skill/recipes/data/paper-plane-a-couple-cooks/recipe.json", "url": "/recipe/paper-plane-a-couple-cooks", "warnings": ["A running editor is stale until Settings → Maintenance → Reload. …"]}
```

### 9. Report

```
git_log {"type": "recipe", "slug": "paper-plane-a-couple-cooks"}
{"commits": [{"hash": "3b468375…", "message": "Create recipe: paper-plane-a-couple-cooks", "files": ["recipes/data/paper-plane-a-couple-cooks/recipe.json", "uploads/recipe/paper-plane-a-couple-cooks/uploads/Paper-Plane-Cocktail-003.jpg"]}], "hasMore": false}
```

The report: the scratch directory and branch, a `Recipe | Time | Source` row,
the edits made to the page's version (name, units, garnish into the card,
tags, image), the stale-editor warning in plain words, the commit, and "no
remote, nothing to push".
