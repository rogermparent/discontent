import { getSearchCorpus } from "recipe-website-common/controller/data/read";

/**
 * The heavy half of the search corpus, split out of `search/all` by F4a.
 *
 * Fetched only when it is actually needed — when the FlexSearch index needs
 * (re)populating, or when the active filter mentions ingredients — so the
 * common page load, which finds a current index already in IndexedDB, never
 * pays for it. That is 199 of the corpus's 247 KiB moved behind the version
 * gate that already existed.
 *
 * `Record<slug, string[]>`, not an array: the client merges by slug, and a map
 * keeps the shape self-describing without a second field to keep in step.
 * Recipes with no ingredients are omitted rather than carried as `[]`.
 *
 * `getSearchCorpus`, not `getRecipes`: this route and `search/all` are fetched
 * together, and two concurrent full-index reads race the environment cache.
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
