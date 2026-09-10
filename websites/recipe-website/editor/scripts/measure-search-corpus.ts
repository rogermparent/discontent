/*
 * Phase 0 measurement harness, F4's half — emit the search corpus in its
 * current shape and in the split shape and print the byte counts, plus the
 * per-field shares that decided where the split should fall (§12.8).
 *
 * Same projection the route handlers serialize, so `JSON.stringify` here is
 * exactly what `Response.json` writes; §12.7c checked that this methodology
 * reproduces an export build's emitted `search/all` to the byte.
 *
 * Sibling of `build-corpus-indexes.ts`, and it wants that script's output:
 * point `CONTENT_DIRECTORY` at a *scratch copy* of the real content repository
 * whose derived state that script has brought up to date. Never at the live one
 * — opening an index creates it (§10).
 *
 *   CONTENT_DIRECTORY=/path/to/corpus pnpm exec tsx ./scripts/measure-search-corpus.ts
 */
import { getRecipes } from "recipe-website-common/controller/data/read";

async function main() {
  const contentDirectory = process.env.CONTENT_DIRECTORY;

  const { recipes } = await getRecipes({ contentDirectory });

  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

  const displayCorpus = recipes.map(
    ({ ingredients: _ingredients, ...rest }) => rest,
  );
  const ingredientsDoc = Object.fromEntries(
    recipes
      .filter(({ ingredients }) => ingredients && ingredients.length > 0)
      .map(({ slug, ingredients }) => [slug, ingredients]),
  );

  const before = bytes(recipes);
  const display = bytes(displayCorpus);
  const ingredients = bytes(ingredientsDoc);

  const kib = (n: number) => (n / 1024).toFixed(1);
  const pct = (n: number) => ((n / before) * 100).toFixed(1);

  console.log(`recipes:                ${recipes.length}`);
  console.log(`search/all (before):    ${before} B (${kib(before)} KiB)`);
  console.log(
    `search/all (after):     ${display} B (${kib(display)} KiB, ${pct(display)}%)`,
  );
  console.log(
    `search/ingredients:     ${ingredients} B (${kib(ingredients)} KiB, ${pct(ingredients)}%)`,
  );
  console.log(
    `sum:                    ${display + ingredients} B (${kib(display + ingredients)} KiB)`,
  );
  console.log(
    `recipes with ingredients: ${Object.keys(ingredientsDoc).length}`,
  );

  // Per-field shares, by difference: how much of the original document each
  // field costs. This is the measurement that chose the split — the question is
  // not "which rows are big" but "which fields are big *and* unrendered".
  console.log("");
  const withoutField = (field: "ingredients" | "description") =>
    bytes(recipes.map(({ [field]: _dropped, ...rest }) => rest));
  const share = (n: number) => `${((n / before) * 100).toFixed(1)}%`;
  const ingredientsCost = before - withoutField("ingredients");
  const descriptionCost = before - withoutField("description");
  console.log(
    `ingredients field:      ${ingredientsCost} B (${share(ingredientsCost)})`,
  );
  console.log(
    `description field:      ${descriptionCost} B (${share(descriptionCost)})`,
  );
  console.log(
    `everything else:        ${before - ingredientsCost - descriptionCost} B (${share(
      before - ingredientsCost - descriptionCost,
    )})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
