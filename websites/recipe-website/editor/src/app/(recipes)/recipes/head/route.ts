import { recipeIndexJsonRoutes } from "recipe-website-common/components/RecipeIndexPage/jsonRoutes";

/**
 * The landing fold as JSON — the seed an infinite list starts from.
 *
 * A static segment, so it wins over the sibling `[page]` route. Nothing is
 * shadowed: `/recipes/head` was never a numbered page, since that route takes
 * digits only.
 *
 * No `dynamic` directive, matching the HTML routes: `recipePages` wraps its
 * reads in `unstable_cache` with the index's tags, so invalidation is by tag
 * rather than by opting out of caching.
 */
export const GET = recipeIndexJsonRoutes.head;
