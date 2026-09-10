import { featuredRecipeIndexRoutes } from "recipe-website-common/components/FeaturedRecipeIndexPage/routes";

/**
 * A numbered page. `/featured-recipes/1` is the *oldest* page, not an alias for
 * the landing — numbers name stable page ids counted from the oldest feature,
 * so featuring a recipe moves nothing and no sealed URL ever changes what it
 * points at.
 */
export default featuredRecipeIndexRoutes.numbered;

/**
 * Derived from the meta record in O(1). The hand-written form loaded the
 * entire corpus into an array purely to count it, and needed its own
 * `max(1, ceil(…))` to keep `output: export` from rejecting an empty param
 * list; the factory emits `firstPageNumber` for that case instead.
 */
export const generateStaticParams =
  featuredRecipeIndexRoutes.generateStaticParams;
