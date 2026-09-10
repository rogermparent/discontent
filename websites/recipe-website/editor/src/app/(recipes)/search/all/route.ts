import { getSearchCorpus } from "recipe-website-common/controller/data/read";

/**
 * The display half of the search corpus — everything the client renders from
 * the fetched array, and nothing else. `ingredients` is stripped and served
 * separately by `search/ingredients` (F4a).
 *
 * Why the line falls here: this document is fetched on **every** page load, and
 * `ingredients` was ~80% of it (199 of 247 KiB across the 436-recipe corpus)
 * while never being rendered from this array — it exists only to populate
 * FlexSearch, which is version-gated and persisted in IndexedDB, and to back
 * `ingredient:` filters. `description` and the times stay: the ⌘K palette
 * renders descriptions, and `time:`/sort read the times.
 *
 * `getSearchCorpus`, not `getRecipes`: the client fetches this route and its
 * sibling at the same moment, and two concurrent full-index reads race the
 * environment cache. See that function.
 */
export async function GET() {
  const { recipes } = await getSearchCorpus();
  return Response.json(
    recipes.map(({ ingredients: _ingredients, ...recipe }) => recipe),
  );
}
