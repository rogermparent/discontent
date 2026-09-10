import { getSearchCorpus } from "recipe-website-common/controller/data/read";

// Statically rendered under `output: "export"`: `force-static` is the required
// opt-in for a parameterless route handler, baking the corpus JSON at build
// (like `(recipes)/recipes/page/[page]/route.ts`, which D3 added). This is what
// lets the client's FlexSearch/react-query pipeline resolve on the reader site.
export const dynamic = "force-static";

/**
 * The display half of the search corpus, matching the editor's route — the
 * reasoning for the split is in that file.
 */
export async function GET() {
  const { recipes } = await getSearchCorpus();
  return Response.json(
    recipes.map(({ ingredients: _ingredients, ...recipe }) => recipe),
  );
}
