import { getSearchCorpus } from "recipe-website-common/controller/data/read";

// Statically rendered under `output: "export"`, for the same reason as the
// sibling `search/all` route: `force-static` is the required opt-in for a
// parameterless route handler, and `force-dynamic` is illegal here.
export const dynamic = "force-static";

/**
 * The heavy half of the search corpus, matching the editor's route — the
 * reasoning for the split, and for the map shape, is in that file.
 */
export async function GET() {
  const { recipes } = await getSearchCorpus();
  return Response.json(
    Object.fromEntries(
      recipes
        .filter(({ ingredients }) => ingredients && ingredients.length > 0)
        .map(({ slug, ingredients }) => [slug, ingredients]),
    ),
  );
}
