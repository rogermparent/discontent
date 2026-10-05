/*
 * What `ingredientNames` makes of a real corpus — for tuning its word lists.
 *
 *   CONTENT_DIRECTORY=/path/to/content \
 *     pnpm exec tsx ./scripts/measure-ingredient-names.ts [--tag drink] [--all]
 *
 * **Read-only, and it opens no index**: it reads `recipes/data/<slug>/recipe.json`
 * straight off disk and flattens each line the way `buildRecipeIndexValue`
 * does, so pointing it at the live content repository is safe (unlike the
 * other `measure-*` scripts, which open LMDB and so want a scratch copy).
 *
 * Prints, per recipe in scope, each line beside what it requires; then the
 * name frequencies across the whole corpus, which is where a missing unit or
 * descriptive word shows up first; then aliases that mean more than one thing.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";
import type { Recipe } from "recipe-website-common/controller/types";
import {
  requirementLabel,
  type Requirement,
} from "recipe-website-common/util/ingredientNames";
import {
  prepareCorpus,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";

function flag(requirement: Requirement): string {
  return [
    requirement.optional && "optional",
    requirement.staple && "staple",
    requirement.loose && "loose",
    requirement.aliases.length > 0 && `aka ${requirement.aliases.join("; ")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

async function main() {
  const contentDirectory = process.env.CONTENT_DIRECTORY;
  if (!contentDirectory) throw new Error("Set CONTENT_DIRECTORY");
  const args = process.argv.slice(2);
  const tag = args.includes("--tag")
    ? args[args.indexOf("--tag") + 1]
    : "drink";
  const all = args.includes("--all");

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

  const prepared = prepareCorpus(corpus);
  for (const recipe of corpus) {
    if (!all && !(recipe.tags ?? []).includes(tag)) continue;
    console.log(`\n## ${recipe.name} (${recipe.slug})`);
    const requirements = prepared.recipes.get(recipe.slug)!.requirements;
    (recipe.ingredients ?? []).forEach((line, index) => {
      const found = requirements.filter((r) => r.line === index);
      const read =
        found.length === 0
          ? "—"
          : found
              .map((r) => {
                const extra = flag(r);
                return `${requirementLabel(r)}${extra ? ` [${extra}]` : ""}`;
              })
              .join(" + ");
      console.log(`  ${line.padEnd(56).slice(0, 56)} → ${read}`);
    });
  }

  const counts = new Map<string, number>();
  for (const { requirements } of prepared.recipes.values()) {
    for (const requirement of requirements) {
      const label = requirementLabel(requirement);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  console.log(`\n## Names across ${corpus.length} recipes (top 80)`);
  for (const [name, count] of [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)) {
    console.log(`  ${String(count).padStart(4)}  ${name}`);
  }

  console.log("\n## Ambiguous aliases");
  for (const [alias, meanings] of prepared.aliases) {
    if (meanings.size > 1)
      console.log(`  ${alias}: ${[...meanings].join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
