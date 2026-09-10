# Worked transcripts

Real command lines and real (abbreviated — long arrays cut with `…`) JSON,
captured against a scratch copy of the Playwright fixture content directory.
Timestamps and absolute paths will differ.

## A meal plan: "three vegetarian dinners under 45 minutes for this week"

### 1. Where do writes go?

```
$ pnpm --silent recipes list --limit 1 --json
{"total":3,"more":true,"recipes":[{"date":1767734340692,"slug":"third-recipe","name":"Third Recipe","description":"This is the third recipe."}]}
```

```
$ pnpm --silent recipes show third-recipe --json
{"slug":"third-recipe","path":"/home/roger/.claude/jobs/…/e2e-content/recipes/data/third-recipe/recipe.json","url":"/recipe/third-recipe","recipe":{"name":"Third Recipe","description":"This is the third recipe.","date":1767734340692,"prepTime":0,"cookTime":0,"totalTime":0,"recipeYield":""}}
```

Non-zero `total`, and `path` names a scratch directory rather than the real
content repo — carry on and say so. (`total: 0` on an ask that expects an
existing site means the content directory is wrong: stop and ask.)

### 2. Constraints

Three dinners · vegetarian · `totalTime` ≤ 45 · one meal plan for the week.

### 3. Reuse first

```
$ pnpm --silent recipes search "vegetarian" --json
{"query":{"raw":"vegetarian","text":"vegetarian","hasAdvancedSyntax":false},"total":0,"recipes":[]}
```

Nothing to reuse, so all three come from the web.

### 4–5. Candidates, dry-run each

```
$ pnpm --silent recipes import "https://www.budgetbytes.com/vegetarian-chili/" --dry-run --json
{"dryRun":true,"url":"https://www.budgetbytes.com/vegetarian-chili/","slug":"vegetarian-chili","recipe":{"name":"Vegetarian Chili","date":1788628877523,"description":"This hearty Vegetarian Chili is cozy, budget-friendly, and full of flavor. …","prepTime":10,"cookTime":30,"totalTime":40,"source":{"url":"https://www.budgetbytes.com/vegetarian-chili/","name":"budgetbytes.com"},"ingredients":[{"ingredient":"<Multiplyable baseNumber=\"2\" /> Tbsp olive oil ($<Multiplyable baseNumber=\"0.38\" />)"}, …20 total],"instructions":[{"text":"Dice the onion and bell pepper. Mince the garlic."}, …6 total],"image":"Overhead-in-Bowl-With-Spoon-Vegetarian-Chili.jpg","video":"https://www.youtube.com/watch?v=zohpAq84c0E"},"image":{"importUrl":"https://www.budgetbytes.com/wp-content/uploads/2025/10/Overhead-in-Bowl-With-Spoon-Vegetarian-Chili.jpg","filename":"Overhead-in-Bowl-With-Spoon-Vegetarian-Chili.jpg"},"video":…}
```

Keep: 40 min, 20 ingredients, 6 instructions, `source.url` present.

```
$ pnpm --silent recipes import "https://www.bbcgoodfood.com/recipes/mushroom-stroganoff" --dry-run --json
{"dryRun":true,…,"slug":"mushroom-stroganoff","recipe":{"name":"Mushroom stroganoff","prepTime":10,"cookTime":20,"totalTime":30,"source":{"url":"https://www.bbcgoodfood.com/recipes/mushroom-stroganoff","name":"Good Food","author":"Lucy Netherton"},"ingredients":[…10],"instructions":[…4],…}}
```

Keep: 30 min.

```
$ pnpm --silent recipes import "https://www.bbcgoodfood.com/recipes/spinach-sweet-potato-lentil-dhal" --dry-run --json
{"dryRun":true,…,"slug":"spinach-sweet-potato-and-lentil-dhal","recipe":{"name":"Spinach, sweet potato & lentil dhal","prepTime":10,"cookTime":35,"totalTime":45,"source":{"url":"https://www.bbcgoodfood.com/recipes/spinach-sweet-potato-lentil-dhal","name":"Good Food","author":"Sophie Godwin – Cookery writer"},"ingredients":[…13],"instructions":[…8],…}}
```

Keep: exactly 45 min — at the limit, not over it. Say so in the report.

Two rejections, for the two different reasons:

```
$ pnpm --silent recipes import "https://www.bbcgoodfood.com/recipes/easy-vegetable-lasagne" --dry-run --json
{"dryRun":true,…,"slug":"vegetarian-lasagne","recipe":{"name":"Vegetarian lasagne","prepTime":25,"cookTime":70,"totalTime":95,"source":{"url":"https://www.bbcgoodfood.com/recipes/easy-vegetable-lasagne","name":"Good Food","author":"Good Food team"},…}}
```

Rejected: 95 min, over the 45-minute limit.

```
$ pnpm --silent recipes import "https://www.seriouseats.com/vegetarian-chili-recipe" --dry-run --json
{"error":{"code":"import_failed","message":"No schema.org Recipe found at https://www.seriouseats.com/vegetarian-chili-recipe"}}
```

Exit 1. Rejected: no JSON-LD recipe (bot-blocked, or the URL is wrong — the
message is the same either way). Drop it, do not retry.

### 6. Import the keepers

```
$ pnpm --silent recipes import "https://www.budgetbytes.com/vegetarian-chili/" --tags vegetarian,dinner --json
{"slug":"vegetarian-chili","date":1788628952169,"path":"/…/recipes/data/vegetarian-chili/recipe.json","url":"/recipe/vegetarian-chili","source":{"url":"https://www.budgetbytes.com/vegetarian-chili/","name":"budgetbytes.com"}}

$ pnpm --silent recipes import "https://www.bbcgoodfood.com/recipes/mushroom-stroganoff" --tags vegetarian,dinner,quick --json
{"slug":"mushroom-stroganoff","date":1788628954206,"path":"/…/recipes/data/mushroom-stroganoff/recipe.json","url":"/recipe/mushroom-stroganoff","source":{"url":"https://www.bbcgoodfood.com/recipes/mushroom-stroganoff","name":"Good Food","author":"Lucy Netherton"}}

$ pnpm --silent recipes import "https://www.bbcgoodfood.com/recipes/spinach-sweet-potato-lentil-dhal" --tags vegetarian,vegan,dinner --json
{"slug":"spinach-sweet-potato-and-lentil-dhal","date":1788628956816,"path":"/…/recipes/data/spinach-sweet-potato-and-lentil-dhal/recipe.json","url":"/recipe/spinach-sweet-potato-and-lentil-dhal","source":{"url":"https://www.bbcgoodfood.com/recipes/spinach-sweet-potato-lentil-dhal","name":"Good Food","author":"Sophie Godwin – Cookery writer"}}
```

Each also prints on **stderr**: `A running editor is stale until Settings →
Maintenance → Reload.` That is a hint, not a failure.

Re-importing the same URL is a conflict, not a duplicate:

```
$ pnpm --silent recipes import "https://www.budgetbytes.com/vegetarian-chili/" --tags vegetarian,dinner --json
{"error":{"code":"slug_conflict","message":"Content with slug \"vegetarian-chili\" already exists","slug":"vegetarian-chili"}}
```

Exit 2 — reuse the existing slug, never `--overwrite`.

### 7. Group them

```
$ pnpm --silent recipes group create --name "Week of 2026-09-07" --kind meal-plan --item "mushroom-stroganoff:Mon · Dinner" --item "vegetarian-chili:Wed · Dinner" --item "spinach-sweet-potato-and-lentil-dhal:Fri · Dinner" --json
{"slug":"week-of-2026-09-07","date":1788628970227,"path":"/…/groups/data/week-of-2026-09-07/group.json","url":"/group/week-of-2026-09-07"}
```

A bad slug fails loudly instead of writing a dangling item:

```
$ pnpm --silent recipes group create --name "Broken" --kind collection --item "nope:Whoops" --json
{"error":{"code":"unknown_recipe","message":"No recipe at slug: nope. Pass --force to add it anyway.","recipes":["nope"]}}
```

Exit 1. Fix the slug; do not pass `--force`.

Verify what landed:

```
$ pnpm --silent recipes group show week-of-2026-09-07 --json
{"slug":"week-of-2026-09-07","path":"/…/groups/data/week-of-2026-09-07/group.json","url":"/group/week-of-2026-09-07","group":{"name":"Week of 2026-09-07","date":1788628970227,"kind":"meal-plan","items":[{"recipe":"mushroom-stroganoff","label":"Mon · Dinner"},{"recipe":"vegetarian-chili","label":"Wed · Dinner"},{"recipe":"spinach-sweet-potato-and-lentil-dhal","label":"Fri · Dinner"}]},"items":[{"recipe":"mushroom-stroganoff","label":"Mon · Dinner","name":"Mushroom stroganoff"},{"recipe":"vegetarian-chili","label":"Wed · Dinner","name":"Vegetarian Chili"},{"recipe":"spinach-sweet-potato-and-lentil-dhal","label":"Fri · Dinner","name":"Spinach, sweet potato & lentil dhal"}]}
```

### 8. Report

> Local content directory, 3 recipes before this run.
>
> | Day | Recipe                                                                              | Time   | Source        |
> | --- | ----------------------------------------------------------------------------------- | ------ | ------------- |
> | Mon | [Mushroom stroganoff](/recipe/mushroom-stroganoff)                                  | 30 min | BBC Good Food |
> | Wed | [Vegetarian Chili](/recipe/vegetarian-chili)                                        | 40 min | Budget Bytes  |
> | Fri | [Spinach, sweet potato & lentil dhal](/recipe/spinach-sweet-potato-and-lentil-dhal) | 45 min | BBC Good Food |
>
> Meal plan: [/group/week-of-2026-09-07](/group/week-of-2026-09-07)
>
> Rejected: BBC Good Food's easy vegetable lasagne (95 min, over the limit);
> a Serious Eats chili (`import_failed` — no JSON-LD on the page). The dhal is
> exactly 45 minutes.
>
> Push from `/git` when ready.

## A collection: "make a collection of my meatless bean dinners"

No dates, so `--kind collection` with a `--description` and no labels. Reuse
comes first here — the recipes already exist:

```
$ pnpm --silent recipes search "lentil" --json
{"query":{"raw":"lentil","text":"lentil","hasAdvancedSyntax":false},"total":1,"recipes":[{"date":1788628956816,"slug":"spinach-sweet-potato-and-lentil-dhal","name":"Spinach, sweet potato & lentil dhal","description":"A comforting vegan one-pot recipe …","ingredients":["1 tbsp sesame oil", …13],"image":"spinach-sweet-potato-and-lentil-dhal-be8fae5.jpg","tags":["vegetarian","vegan","dinner"],"prepTime":10,"cookTime":35,"totalTime":45}]}

$ pnpm --silent recipes search "beans" --json
{"query":{"raw":"beans","text":"beans","hasAdvancedSyntax":false},"total":1,"recipes":[{"date":1788628952169,"slug":"vegetarian-chili","name":"Vegetarian Chili",…,"tags":["vegetarian","dinner"],"prepTime":10,"cookTime":30,"totalTime":40}]}
```

Two separate one-word searches, because free-text words are ANDed:
`search "lentil chili beans"` returns `{"total":0,"recipes":[]}`.

Once tags exist, the typed form finds them together:

```
$ pnpm --silent recipes search "tag:vegetarian time:<=45" --json
{"query":{"raw":"tag:vegetarian time:<=45","text":"","hasAdvancedSyntax":true},"total":3,"recipes":[{…"slug":"spinach-sweet-potato-and-lentil-dhal","totalTime":45},{…"slug":"mushroom-stroganoff","totalTime":30},{…"slug":"vegetarian-chili","totalTime":40}]}
```

```
$ pnpm --silent recipes group create --name "Weeknight Bean Bowls" --kind collection --description "Meatless one-pot dinners built on beans and lentils." --item "vegetarian-chili" --item "spinach-sweet-potato-and-lentil-dhal" --json
{"slug":"weeknight-bean-bowls","date":1788628990881,"path":"/…/groups/data/weeknight-bean-bowls/group.json","url":"/group/weeknight-bean-bowls"}
```

Report the two recipes and the `/group/weeknight-bean-bowls` link, then: push
from `/git` when ready.
