import { createPaginatedIndexRoute } from "@discontent/cms/pagination/next/createPaginatedIndexRoute";
import { recipePages } from "../../controller/data/readRecipePages";
import { RecipeIndexPageWrapper } from "./shared";

/**
 * The `/recipes` route handlers, defined once and re-exported by all four
 * route files — `/recipes` and `/recipes/[page]`, in the editor and the
 * export.
 *
 * URL numbers start at 1 and name the *stable* page id plus one, so page 1 is
 * the oldest page and no URL ever changes what it points at. `/recipes/1` is
 * therefore a real page rather than an alias for the landing, which is what it
 * used to be under the offset scheme.
 */
export const recipeIndexRoutes = createPaginatedIndexRoute({
  reads: recipePages,
  render: (page, { isLanding }) => (
    <RecipeIndexPageWrapper page={page} isLanding={isLanding} />
  ),
});

export default recipeIndexRoutes;
