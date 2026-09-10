import { createPaginatedIndexRoute } from "@discontent/cms/pagination/next/createPaginatedIndexRoute";
import { featuredRecipePages } from "../../controller/data/readFeaturedRecipePages";
import { FeaturedRecipeIndexPageWrapper } from "./shared";

/**
 * The `/featured-recipes` route handlers, defined once and re-exported by all
 * four route files — `/featured-recipes` and `/featured-recipes/[page]`, in the
 * editor and the export.
 *
 * URL numbers start at 1 and name the *stable* page id plus one, so page 1 is
 * the oldest page and no URL ever changes what it points at. `/featured-recipes/1`
 * is therefore a real page rather than an alias for the landing, which is what
 * it used to be under the offset scheme.
 */
export const featuredRecipeIndexRoutes = createPaginatedIndexRoute({
  reads: featuredRecipePages,
  render: (page, { isLanding }) => (
    <FeaturedRecipeIndexPageWrapper page={page} isLanding={isLanding} />
  ),
});

export default featuredRecipeIndexRoutes;
