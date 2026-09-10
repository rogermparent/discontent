/*
 * F28 — synthesize a recipe corpus of an arbitrary size, for scale measurement.
 *
 *   SOURCE_CONTENT_DIRECTORY=/path/to/real/corpus \
 *     pnpm exec tsx ./scripts/seed-scale-corpus.ts <target-dir> \
 *       --recipes 5000 --featured 500 --hot-tag 40
 *
 * Sibling of `seed-pages.ts` and portfolio's `seed-projects.ts`, and it feeds
 * `measure-engine-scale.ts` the way `build-corpus-indexes.ts` feeds
 * `measure-search-corpus.ts`.
 *
 * **It cycles the real corpus rather than generating filler.** Every synthetic
 * recipe is a real one with a fresh slug and a fresh date, so descriptions,
 * ingredient counts and tag counts keep their production distribution — which
 * is the only thing that makes the byte columns comparable to §12.11's. Uniform
 * filler would have produced a tidier table about a corpus nobody has.
 *
 * Three knobs, because the three deferrals this measures scale on different
 * axes:
 *
 *  - `--recipes N`  drives pagination's phase-2 walk and the aggregate fold
 *                   (F12).
 *  - `--featured D` drives the dependent scan, which walks the *dependent*
 *                   type's index and so grows with featured recipes rather
 *                   than with recipes (F18).
 *  - `--hot-tag H`  forces one tag onto H recipes. The richest tag in the real
 *                   corpus carries three against a `perPage` of twelve, so
 *                   without this there is no way to observe what F8b defers
 *                   ("when a tag outgrows one page") rather than predict it.
 *
 * **Writes only inside `<target-dir>`, and refuses a target that already
 * exists.** Opening an index creates it (§10), and this script both opens and
 * rebuilds several — pointing it at a real content directory would rewrite
 * that corpus's derived state. `SOURCE_CONTENT_DIRECTORY` is read and never
 * written: the recipes are loaded from its data files directly, so no index of
 * the source is opened at all.
 */
import { outputJSON, pathExists, readFile, readdir } from "fs-extra";
import { resolve } from "node:path";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  FeaturedRecipe,
  Recipe,
} from "recipe-website-common/controller/types";

/** One hour apart, so a 20k corpus still spans a plausible couple of years. */
const DATE_STEP_MS = 60 * 60 * 1000;
const BASE_DATE = Date.UTC(2000, 0, 1);

/** The tag `--hot-tag` piles onto, chosen not to collide with a real one. */
const HOT_TAG = "Scale Hot Tag";

function numericFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} wants a non-negative integer`);
  }
  return value;
}

/** Every recipe in the source corpus, read from its data files. */
async function readSourceRecipes(source: string): Promise<Recipe[]> {
  const dataDirectory = resolve(source, "recipes", "data");
  const slugs = await readdir(dataDirectory);
  const recipes: Recipe[] = [];
  for (const slug of slugs) {
    try {
      const raw = await readFile(
        resolve(dataDirectory, slug, "recipe.json"),
        "utf8",
      );
      recipes.push(JSON.parse(raw) as Recipe);
    } catch {
      // A recipe whose file will not read is one the real index would not
      // carry either, so it is not one this corpus should be built from.
    }
  }
  if (recipes.length === 0) {
    throw new Error(`No readable recipes under ${dataDirectory}`);
  }
  return recipes;
}

async function main() {
  const target = process.argv[2];
  if (!target || target.startsWith("--")) {
    console.error(
      "usage: seed-scale-corpus.ts <target-dir> [--recipes N] [--featured D] [--hot-tag H]",
    );
    process.exit(1);
  }

  const source = process.env.SOURCE_CONTENT_DIRECTORY;
  if (!source) throw new Error("set SOURCE_CONTENT_DIRECTORY");

  /*
   * A fresh directory per run, enforced rather than documented. The F4b spike
   * run twice against one directory compared an already-written corpus with
   * itself and reported that nothing had moved, which reads exactly like a
   * result (§12.10).
   */
  if (await pathExists(target)) {
    throw new Error(
      `${target} already exists — every run wants a fresh directory`,
    );
  }

  const recipeCount = numericFlag("recipes", 1000);
  const featuredCount = numericFlag("featured", 0);
  const hotTagCount = numericFlag("hot-tag", 0);

  const templates = await readSourceRecipes(source);
  console.log(`source templates:  ${templates.length}`);
  console.log(`recipes to write:  ${recipeCount}`);
  console.log(`featured to write: ${featuredCount}`);
  console.log(`hot tag on:        ${hotTagCount}`);

  const slugOf = (index: number) => `scale-${String(index).padStart(6, "0")}`;

  for (let index = 0; index < recipeCount; index += 1) {
    const template = templates[index % templates.length];
    const tags = [...(template.tags ?? [])];
    if (index < hotTagCount) tags.push(HOT_TAG);

    const recipe: Recipe = {
      ...template,
      // Unique per item so a page hash cannot be accidentally stable across
      // two items that came from the same template.
      name: `${template.name} ${index}`,
      date: BASE_DATE + index * DATE_STEP_MS,
      ...(tags.length > 0 ? { tags } : {}),
    };

    await outputJSON(
      resolve(target, "recipes", "data", slugOf(index), "recipe.json"),
      recipe,
    );
  }

  for (let index = 0; index < featuredCount; index += 1) {
    const featured: FeaturedRecipe = {
      // Spread across the recipe corpus rather than clustered at one end, so
      // the dependent scan's cost is not an artefact of where they sit.
      recipe: slugOf(Math.floor((index * recipeCount) / (featuredCount || 1))),
      date: BASE_DATE + index * DATE_STEP_MS,
      note: `Scale feature ${index}`,
    };
    await outputJSON(
      resolve(
        target,
        "featured-recipes",
        "data",
        `featured-${String(index).padStart(6, "0")}`,
        "featured-recipe.json",
      ),
      featured,
    );
  }

  /*
   * One call: `rebuildIndex` cascades to every type that borrows from the one
   * it rebuilt, and featured recipes borrow `name` and `image` from recipes.
   * Recipes first is not optional — the cascade resolves each feature's
   * reference by reading the recipe data file, so those must already be on
   * disk, which they are.
   */
  console.log("rebuilding indexes…");
  await rebuildIndex({
    config: recipeContentConfig,
    contentDirectory: target,
  });

  console.log(`seeded ${recipeCount} recipes into ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
