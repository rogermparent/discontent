/*
 * What a pantry can make across a real corpus — the `/make` buckets, counted.
 *
 *   CONTENT_DIRECTORY=/path/to/content \
 *     pnpm exec tsx ./scripts/measure-makeable.ts [--kind food|drinks|all] \
 *       [--strict] [--list] onion garlic "chicken thighs" rice …
 *
 * **Read-only, and it opens no index**, like `measure-ingredient-names.ts`:
 * it reads `recipes/data/<slug>/recipe.json` straight off disk. `--kind`
 * scopes the way `/make`'s kind switch does (food = no `drink` tag), with
 * the default staples assumed. `--strict` counts close matches as missing
 * (the page's toggle off); `--list` prints each makeable recipe, with any
 * close match beside it.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";
import type { Recipe } from "recipe-website-common/controller/types";
import { requirementLabel } from "recipe-website-common/util/ingredientNames";
import {
  analyzeMakeable,
  prepareCorpus,
  suggestNames,
  type MakeRecipe,
  type RecipeMatch,
} from "recipe-website-common/util/makeable";

async function main() {
  const contentDirectory = process.env.CONTENT_DIRECTORY;
  if (!contentDirectory) throw new Error("Set CONTENT_DIRECTORY");
  const args = process.argv.slice(2);
  const kindAt = args.indexOf("--kind");
  const kind = kindAt >= 0 ? args[kindAt + 1] : "food";
  const strict = args.includes("--strict");
  const list = args.includes("--list");
  const benchArg = args.indexOf("--bench") + 1;
  const pantry = args.filter(
    (arg, i) =>
      !arg.startsWith("--") &&
      !(kindAt >= 0 && i === kindAt + 1) &&
      !(benchArg > 0 && i === benchArg),
  );

  const dataDirectory = resolve(contentDirectory, "recipes", "data");
  const corpus: (MakeRecipe & { tags?: string[] })[] = [];
  for (const slug of await readdir(dataDirectory)) {
    let recipe: Recipe;
    try {
      recipe = JSON.parse(
        await readFile(resolve(dataDirectory, slug, "recipe.json"), "utf8"),
      ) as Recipe;
    } catch {
      continue;
    }
    const ingredients = recipe.ingredients ?? [];
    corpus.push({
      slug,
      name: recipe.name,
      tags: recipe.tags,
      ingredients: ingredients.map(({ ingredient }) =>
        flattenMarkdown(ingredient),
      ),
      ingredientHeadings: ingredients.flatMap(({ type }, i) =>
        type === "heading" ? [i] : [],
      ),
    });
  }

  const isDrink = (recipe: { tags?: string[] }) =>
    (recipe.tags ?? []).includes("drink");
  const scoped = corpus.filter((recipe) =>
    kind === "all"
      ? true
      : kind === "drinks"
        ? isDrink(recipe)
        : !isDrink(recipe),
  );
  const prepared = prepareCorpus(corpus);
  const benchAt = args.indexOf("--bench");
  if (benchAt >= 0) {
    /* `--bench N`: time `analyzeMakeable` over every recipe with the N most
     * used names as the inventory — what the page reruns per keystroke. */
    const size = Number(args[benchAt + 1]) || 40;
    const items = suggestNames(prepared).slice(0, size);
    /* Cold: a new inventory each run (an unmatched extra item), so no answer
     * is reused. Warm: the same inventory again, as when the scope changes. */
    const median = (run: (i: number) => unknown) => {
      for (let i = 0; i < 3; i++) run(-i - 1);
      const times: number[] = [];
      for (let i = 0; i < 11; i++) {
        const start = performance.now();
        run(i);
        times.push(performance.now() - start);
      }
      return times.sort((a, b) => a - b)[5].toFixed(1);
    };
    const cold = median((i) =>
      analyzeMakeable(corpus, prepared, [...items, `zzz-${i}`]),
    );
    const warm = median(() => analyzeMakeable(corpus, prepared, items));
    console.log(
      `bench ${size} items over ${corpus.length} recipes: cold ${cold} ms, warm ${warm} ms`,
    );
    return;
  }
  const analysis = analyzeMakeable(scoped, prepared, pantry, {
    countClose: !strict,
  });
  /* `close` is 32j's: an older matcher has none, so count it defensively. */
  const closeOf = (match: RecipeMatch) =>
    (match as { close?: unknown[] }).close?.length ?? 0;
  const withClose = (matches: RecipeMatch[]) =>
    matches.filter((match) => closeOf(match) > 0).length;

  console.log(
    `${scoped.length} ${kind} recipes (${analysis.unjudged} unjudged), pantry: ${pantry.join(", ")}`,
  );
  console.log(
    `  can make ${analysis.canMake.length} (${withClose(analysis.canMake)} through a close match)`,
  );
  console.log(
    `  one away ${analysis.oneAway.length} (${withClose(analysis.oneAway)} with a close match)`,
  );
  console.log(`  two away ${analysis.twoAway.length}`);
  console.log(`  further  ${analysis.further.length}`);
  console.log(
    `  buy next ${analysis.buyNext.map((entry) => `${entry.label} (${entry.unlocks})`).join(", ")}`,
  );
  if (!list) return;
  for (const [title, matches] of [
    ["Can make", analysis.canMake],
    ["One away", analysis.oneAway],
    ["Two away", analysis.twoAway],
  ] as const) {
    console.log(`\n## ${title}`);
    for (const match of matches) {
      const close = (
        (match as { close?: { requirement: { text: string }; item: string }[] })
          .close ?? []
      )
        .map(({ requirement, item }) => `≈ ${item} for "${requirement.text}"`)
        .join("; ");
      const missing = match.missing.map(requirementLabel).join(", ");
      console.log(
        `  ${match.recipe.name}${missing ? ` — missing ${missing}` : ""}${close ? ` — ${close}` : ""}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
