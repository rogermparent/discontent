/*
 * What `aisles` makes of a real corpus — for tuning `DEFAULT_AISLE_WORDS`
 * (epic 35, 35b).
 *
 *   CONTENT_DIRECTORY=/path/to/content \
 *     pnpm exec tsx ./scripts/measure-aisles.ts [--drinks] [--top 60] [--aisle other]
 *
 * **Read-only, and it opens no index**: like `measure-ingredient-names.ts`
 * it reads `recipes/data/<slug>/recipe.json` straight off disk, so pointing it
 * at the live content repository (the `editor/content` symlink) is safe.
 *
 * Scope is food — every recipe not tagged `drink` — or, with `--drinks`, the
 * drinks alone. Each ingredient line becomes its requirements the way the
 * shopping list reads them (`parseIngredientList`); staples (water, ice) are
 * left out, and a line with alternatives counts as its first. Prints the share
 * of lines and of distinct names per aisle, then the top names in one aisle
 * (`other` unless `--aisle` names another).
 * The 35b target is at most 10% of food lines in `other`.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";
import type { Recipe } from "recipe-website-common/controller/types";
import {
  nameKey,
  parseIngredientList,
} from "recipe-website-common/util/ingredientNames";
import {
  AISLES,
  aisleFor,
  type Aisle,
} from "recipe-website-common/util/aisles";

function percent(part: number, whole: number): string {
  return `${((100 * part) / Math.max(whole, 1)).toFixed(1)}%`.padStart(6);
}

async function main() {
  const contentDirectory = process.env.CONTENT_DIRECTORY;
  if (!contentDirectory) throw new Error("Set CONTENT_DIRECTORY");
  const args = process.argv.slice(2);
  const drinks = args.includes("--drinks");
  const top = args.includes("--top")
    ? Number(args[args.indexOf("--top") + 1])
    : 60;
  const listed = (
    args.includes("--aisle") ? args[args.indexOf("--aisle") + 1] : "other"
  ) as Aisle;

  const dataDirectory = resolve(contentDirectory, "recipes", "data");
  let recipes = 0;
  const lineCounts = new Map<Aisle, number>();
  const names = new Map<string, { aisle: Aisle; count: number }>();
  let lines = 0;
  for (const slug of await readdir(dataDirectory)) {
    let recipe: Recipe;
    try {
      recipe = JSON.parse(
        await readFile(resolve(dataDirectory, slug, "recipe.json"), "utf8"),
      ) as Recipe;
    } catch {
      continue;
    }
    if ((recipe.tags ?? []).includes("drink") !== drinks) continue;
    recipes += 1;
    const ingredients = recipe.ingredients ?? [];
    const requirements = parseIngredientList(
      ingredients.map(({ ingredient }) => flattenMarkdown(ingredient)),
      ingredients.flatMap(({ type }, i) => (type === "heading" ? [i] : [])),
    );
    for (const requirement of requirements) {
      if (requirement.staple) continue;
      const key = nameKey(requirement.alternatives[0]);
      const aisle = aisleFor(key);
      lines += 1;
      lineCounts.set(aisle, (lineCounts.get(aisle) ?? 0) + 1);
      const seen = names.get(key) ?? { aisle, count: 0 };
      seen.count += 1;
      names.set(key, seen);
    }
  }

  const nameCounts = new Map<Aisle, number>();
  for (const { aisle } of names.values()) {
    nameCounts.set(aisle, (nameCounts.get(aisle) ?? 0) + 1);
  }
  console.log(
    `## ${drinks ? "Drink" : "Food"} recipes: ${recipes}, lines: ${lines}, distinct names: ${names.size}`,
  );
  console.log(`  ${"aisle".padEnd(11)}  ${"lines".padStart(14)}  names`);
  for (const aisle of AISLES) {
    const l = lineCounts.get(aisle) ?? 0;
    const n = nameCounts.get(aisle) ?? 0;
    console.log(
      `  ${aisle.padEnd(11)}  ${String(l).padStart(6)} ${percent(l, lines)}  ${String(n).padStart(5)} ${percent(n, names.size)}`,
    );
  }

  console.log(`\n## Top ${top} names in ${listed}`);
  for (const [name, { count }] of [...names]
    .filter(([, { aisle }]) => aisle === listed)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, top)) {
    console.log(`  ${String(count).padStart(4)}  ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
