import { recipeIndexJsonRoutes } from "recipe-website-common/components/RecipeIndexPage/jsonRoutes";

/**
 * One numbered page as JSON. `/recipes/page/1` is the *oldest* page, the same
 * stable id `/recipes/1` renders.
 *
 * Two segments deep, so it does not collide with the one-segment `[page]` HTML
 * route above it.
 */
export const GET = recipeIndexJsonRoutes.numbered;
