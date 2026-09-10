import { featuredRecipeIndexRoutes } from "recipe-website-common/components/FeaturedRecipeIndexPage/routes";

/**
 * The landing page: the head page folded together with the one below it, so it
 * always holds between `perPage + 1` and `2 * perPage` features rather than the
 * 1-to-`perPage` a partial head would give on its own.
 */
export default featuredRecipeIndexRoutes.landing;
