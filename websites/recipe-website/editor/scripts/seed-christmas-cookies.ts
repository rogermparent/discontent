/*
 * Seed the `christmas-cookies` fixture and build its recipe indexes.
 *
 * The corpus behind the Christmas-Cookies acceptance story (23f/D29): eight
 * cookie recipes — three of them linzer — and two deliberate distractors that
 * carry no word starting with "cookie" or "linzer" anywhere a search can see
 * (name, description, tags or ingredients, T66). Dates are one day apart and
 * strictly increasing, so "newest first" is a fixed slug order rather than a
 * tie-break.
 *
 *   pnpm tsx scripts/seed-christmas-cookies.ts <target-content-dir>
 *
 * Modelled on scripts/seed-groups.ts. Two differences matter:
 *
 *  - `cascadeDependents: false`. Recipes are `referencedBy` featured recipes,
 *    and LMDB `open()` creates the directory it is pointed at, so the default
 *    cascade would plant a stray `featured-recipes/` environment in a fixture
 *    that is meant to hold recipes only (T67).
 *  - This is a one-shot. `scripts/build-fixture-indexes.ts` rebuilds *every*
 *    fixture and leaves every other one's `.mdb` files byte-different (T41),
 *    so it is not the tool for a single new fixture.
 */
import { outputJSON, remove } from "fs-extra";
import { resolve } from "node:path";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { PAGINATION_CHANGES_FILENAME } from "@discontent/cms/pagination/changes";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type { Recipe } from "recipe-website-common/controller/types";

/** Day `n` of December 2025, so row order is the slug order below, reversed. */
const day = (n: number) => Date.UTC(2025, 11, n);

const COOKIE_TAGS = ["cookies", "dessert", "baked"];
const CHRISTMAS_TAGS = [...COOKIE_TAGS, "christmas"];

const RECIPES: Array<{ slug: string; data: Recipe }> = [
  {
    slug: "weeknight-chili",
    data: {
      name: "Weeknight Chili",
      date: day(1),
      description:
        "A thick pot of beans and tomatoes that comes together on a Tuesday.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="2" /> cans kidney beans' },
        { ingredient: '<Multiplyable baseNumber="1" /> can crushed tomatoes' },
        { ingredient: '<Multiplyable baseNumber="2" /> tbsp chili powder' },
      ],
      instructions: [
        {
          name: "",
          text: "Soften the onion, then bloom the spices in the oil.",
        },
        {
          name: "",
          text: "Add the beans and tomatoes and simmer for 25 minutes.",
        },
      ],
      prepTime: 10,
      cookTime: 25,
      totalTime: 35,
      recipeYield: "",
      tags: ["dinner", "quick"],
    },
  },
  {
    slug: "banana-bread",
    data: {
      name: "Banana Bread",
      date: day(2),
      description:
        "A dark, moist loaf for bananas that went too far on the counter.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="3" /> ripe bananas' },
        { ingredient: '<Multiplyable baseNumber="2" /> cups flour' },
        { ingredient: '<Multiplyable baseNumber="1" /> stick butter' },
      ],
      instructions: [
        { name: "", text: "Mash the bananas into the melted butter." },
        { name: "", text: "Fold in the dry mix and bake for an hour." },
      ],
      prepTime: 15,
      cookTime: 60,
      totalTime: 75,
      recipeYield: "",
      tags: ["breakfast", "baked"],
    },
  },
  {
    slug: "shortbread",
    data: {
      name: "Shortbread",
      date: day(3),
      description: "Buttery Scottish cookies cut into fingers and pricked.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="2" /> cups flour' },
        { ingredient: '<Multiplyable baseNumber="1" /> cup butter' },
        { ingredient: '<Multiplyable baseNumber="0.5" /> cup sugar' },
      ],
      instructions: [
        {
          name: "",
          text: "Cream the butter and sugar, then work in the flour.",
        },
        {
          name: "",
          text: "Press into a pan, prick all over and bake until pale gold.",
        },
      ],
      prepTime: 15,
      cookTime: 35,
      totalTime: 50,
      recipeYield: "",
      tags: COOKIE_TAGS,
    },
  },
  {
    slug: "peanut-butter-blossoms",
    data: {
      name: "Peanut Butter Blossoms",
      date: day(4),
      description:
        "Rolled peanut butter cookies topped with a chocolate kiss the moment they leave the oven.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="1" /> cup peanut butter' },
        { ingredient: '<Multiplyable baseNumber="1.75" /> cups flour' },
        { ingredient: '<Multiplyable baseNumber="48" /> chocolate kisses' },
      ],
      instructions: [
        { name: "", text: "Roll the dough into balls and coat them in sugar." },
        { name: "", text: "Bake, then press a kiss into each one while warm." },
      ],
      prepTime: 25,
      cookTime: 10,
      totalTime: 35,
      recipeYield: "",
      tags: COOKIE_TAGS,
    },
  },
  {
    slug: "snickerdoodles",
    data: {
      name: "Snickerdoodles",
      date: day(5),
      description: "Cinnamon-sugar cookies with a tang of cream of tartar.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="2.75" /> cups flour' },
        { ingredient: '<Multiplyable baseNumber="2" /> tsp cream of tartar' },
        { ingredient: '<Multiplyable baseNumber="2" /> tbsp cinnamon sugar' },
      ],
      instructions: [
        {
          name: "",
          text: "Chill the dough, then roll it in the cinnamon sugar.",
        },
        {
          name: "",
          text: "Bake until the edges set and the middles are still soft.",
        },
      ],
      prepTime: 20,
      cookTime: 11,
      totalTime: 31,
      recipeYield: "",
      tags: COOKIE_TAGS,
    },
  },
  {
    slug: "sugar-cookies",
    data: {
      name: "Sugar Cookies",
      date: day(6),
      description: "Cut-out cookies that hold their shape, ready for icing.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="3" /> cups flour' },
        { ingredient: '<Multiplyable baseNumber="1" /> cup sugar' },
        { ingredient: '<Multiplyable baseNumber="1" /> tsp almond extract' },
      ],
      instructions: [
        { name: "", text: "Roll the chilled dough out and cut your shapes." },
        { name: "", text: "Bake briefly, cool completely, then ice." },
      ],
      prepTime: 40,
      cookTime: 9,
      totalTime: 49,
      recipeYield: "",
      tags: COOKIE_TAGS,
    },
  },
  {
    slug: "gingerbread-cookies",
    data: {
      name: "Gingerbread Cookies",
      date: day(7),
      description: "Dark molasses cookies, spicy enough to stand up to icing.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="3" /> cups flour' },
        { ingredient: '<Multiplyable baseNumber="0.75" /> cup molasses' },
        { ingredient: '<Multiplyable baseNumber="2" /> tsp ground ginger' },
      ],
      instructions: [
        {
          name: "",
          text: "Mix the molasses into the creamed butter and sugar.",
        },
        { name: "", text: "Roll, cut and bake until the edges firm up." },
      ],
      prepTime: 45,
      cookTime: 10,
      totalTime: 55,
      recipeYield: "",
      tags: CHRISTMAS_TAGS,
    },
  },
  {
    slug: "apricot-linzer-cookies",
    data: {
      name: "Apricot Linzer Cookies",
      date: day(8),
      description: "Almond sandwich cookies with a window of apricot jam.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="1.5" /> cups almond flour' },
        { ingredient: '<Multiplyable baseNumber="1" /> cup flour' },
        { ingredient: '<Multiplyable baseNumber="0.5" /> cup apricot jam' },
      ],
      instructions: [
        { name: "", text: "Cut a window from half the rounds before baking." },
        {
          name: "",
          text: "Sandwich the cooled pairs with jam and dust with sugar.",
        },
      ],
      prepTime: 50,
      cookTime: 12,
      totalTime: 62,
      recipeYield: "",
      tags: CHRISTMAS_TAGS,
    },
  },
  {
    slug: "chocolate-hazelnut-linzer-cookies",
    data: {
      name: "Chocolate Hazelnut Linzer Cookies",
      date: day(9),
      description:
        "Toasted hazelnut cookies sandwiched with chocolate spread instead of jam.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="1.5" /> cups hazelnut flour' },
        { ingredient: '<Multiplyable baseNumber="1" /> cup flour' },
        {
          ingredient: '<Multiplyable baseNumber="0.5" /> cup chocolate spread',
        },
      ],
      instructions: [
        {
          name: "",
          text: "Toast and grind the hazelnuts, then make the dough.",
        },
        {
          name: "",
          text: "Bake, cool, and sandwich with the chocolate spread.",
        },
      ],
      prepTime: 55,
      cookTime: 12,
      totalTime: 67,
      recipeYield: "",
      tags: CHRISTMAS_TAGS,
    },
  },
  {
    slug: "linzer-cookies",
    data: {
      name: "Linzer Cookies",
      date: day(10),
      description:
        "The classic: raspberry jam between two almond cookies, one with a cut-out heart.",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="1.5" /> cups almond flour' },
        { ingredient: '<Multiplyable baseNumber="1" /> cup flour' },
        { ingredient: '<Multiplyable baseNumber="0.5" /> cup raspberry jam' },
      ],
      instructions: [
        {
          name: "",
          text: "Chill the dough well, then roll and cut the pairs.",
        },
        {
          name: "",
          text: "Bake, cool, fill with jam and finish with icing sugar.",
        },
      ],
      prepTime: 50,
      cookTime: 12,
      totalTime: 62,
      recipeYield: "",
      tags: CHRISTMAS_TAGS,
    },
  },
];

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: seed-christmas-cookies.ts <target-content-dir>");
    process.exit(1);
  }
  const contentDirectory = resolve(target);

  for (const { slug, data } of RECIPES) {
    const file = resolve(
      contentDirectory,
      recipeContentConfig.dataDirectory,
      slug,
      recipeContentConfig.dataFilename,
    );
    await outputJSON(file, data, { spaces: 2 });
  }

  await rebuildIndex({
    config: recipeContentConfig,
    contentDirectory,
    cascadeDependents: false,
  });
  await closeCachedEnvironments();

  /*
   * `recordPaginationChanges` drops a `.pagination-changes.json` beside the
   * content. It is gitignored, so it would never be committed, but no other
   * fixture carries one on disk either and `resetData` copies the directory
   * whole — so a leftover would ship a "these pages are dirty" note into every
   * test run. Remove it, and the seeded directory is exactly the 18 files the
   * fixture is.
   */
  await remove(resolve(contentDirectory, PAGINATION_CHANGES_FILENAME));

  console.error(`Seeded ${RECIPES.length} recipes into ${contentDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
