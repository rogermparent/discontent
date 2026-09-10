import { featuredRecipeIndexRoutes } from "recipe-website-common/components/FeaturedRecipeIndexPage/routes";

/**
 * A numbered page. `/featured-recipes/1` is the *oldest* page, not an alias for
 * the landing — numbers name stable page ids counted from the oldest feature,
 * so featuring a recipe moves nothing and no sealed URL ever changes what it
 * points at.
 */
export default featuredRecipeIndexRoutes.numbered;
