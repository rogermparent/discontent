import { recipeIndexRoutes } from "recipe-website-common/components/RecipeIndexPage/routes";

/**
 * A numbered page. `/recipes/1` is the *oldest* page, not an alias for the
 * landing — numbers name stable page ids counted from the oldest recipe, so a
 * create moves nothing and no sealed URL ever changes what it points at.
 */
export default recipeIndexRoutes.numbered;

/**
 * Derived from the meta record in O(1). The hand-written form loaded the
 * entire corpus into an array purely to count it — and its `<=` bound emitted
 * one page too many whenever the count divided evenly.
 */
export const generateStaticParams = recipeIndexRoutes.generateStaticParams;
