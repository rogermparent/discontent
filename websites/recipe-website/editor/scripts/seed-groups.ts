/*
 * Seed groups and build their LMDB index.
 *
 * Used to generate the `three-recipes-groups` Playwright fixture. Writing the
 * JSON is not enough on its own — every group surface reads derived state (the
 * pagination keyspace for `/groups`, the `groupsByRecipe` aggregate for
 * "Appears in"), and `resetData` is a plain directory copy, so a fixture
 * without a built index looks exactly like a site with no groups.
 *
 *   pnpm tsx scripts/seed-groups.ts <target-content-dir>
 *
 * Modelled on scripts/seed-pages.ts. Run it *before*
 * `scripts/build-fixture-indexes.ts`, which skips a type whose index directory
 * is absent (T3).
 */
import { outputJSON } from "fs-extra";
import { resolve } from "node:path";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import type { Group } from "recipe-website-common/controller/types";

/**
 * Fixed epochs: a date derived from "now" would make every card's rendered date
 * — and so every visual baseline that ever captures one — expire daily.
 *
 * `missing-recipe` is deliberate and load-bearing. Nothing rewrites a group
 * when a recipe moves (D3), so a dangling item is an ordinary state, and the
 * fixture carries one so the "Recipe not found" path is covered by default
 * rather than by a test that has to manufacture it.
 */
const GROUPS: Array<{ slug: string; data: Group }> = [
  {
    slug: "week-of-may-4",
    data: {
      name: "Week of May 4",
      date: Date.UTC(2026, 4, 4),
      kind: "meal-plan",
      description: "Three dinners, one shop.",
      items: [
        {
          recipe: "first-recipe",
          label: "Mon · Dinner",
          note: "Leftovers for lunch",
        },
        { recipe: "second-recipe", label: "Tue · Dinner" },
        { recipe: "missing-recipe", label: "Wed · Dinner" },
      ],
    },
  },
  {
    slug: "weeknight-favourites",
    data: {
      name: "Weeknight Favourites",
      date: Date.UTC(2026, 4, 1),
      kind: "collection",
      items: [{ recipe: "first-recipe" }, { recipe: "third-recipe" }],
    },
  },
];

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: seed-groups.ts <target-content-dir>");
    process.exit(1);
  }
  const contentDirectory = resolve(target);

  for (const { slug, data } of GROUPS) {
    const file = resolve(
      contentDirectory,
      groupContentConfig.dataDirectory,
      slug,
      groupContentConfig.dataFilename,
    );
    await outputJSON(file, data, { spaces: 2 });
  }

  await rebuildIndex({ config: groupContentConfig, contentDirectory });

  console.log(`Seeded ${GROUPS.length} groups into ${contentDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
