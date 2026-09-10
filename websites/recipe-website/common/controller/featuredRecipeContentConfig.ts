import type { ContentTypeConfig } from "@discontent/cms/content/types";
import buildFeaturedRecipeIndexValue from "./buildFeaturedRecipeIndexValue";
import createDefaultFeaturedRecipeSlug from "./createFeaturedRecipeSlug";
import { groupContentConfig } from "./groupContentConfig";
import { featuredRecipesByDate } from "./paginationConfigs";
import { recipeContentConfig } from "./recipeContentConfig";
import {
  FeaturedRecipe,
  FeaturedRecipeEntryKey,
  FeaturedRecipeEntryValue,
} from "./types";

/**
 * Content type configuration for featured recipes
 */
export const featuredRecipeContentConfig: ContentTypeConfig<
  FeaturedRecipe,
  FeaturedRecipeEntryValue,
  FeaturedRecipeEntryKey
> = {
  contentType: "featured-recipes",
  dataDirectory: "featured-recipes/data",
  indexDirectory: "featured-recipes/index",
  dataFilename: "featured-recipe.json",
  buildIndexValue: buildFeaturedRecipeIndexValue,
  buildIndexKey: (
    slug: string,
    data: FeaturedRecipe,
  ): FeaturedRecipeEntryKey => [data.date, slug],
  createDefaultSlug: createDefaultFeaturedRecipeSlug,
  paginationIndexes: [featuredRecipesByDate],
  /*
   * The inbound half of the edges `recipeContentConfig.referencedBy` and
   * `groupContentConfig.referencedBy` declare outbound. Each of those modules
   * names this one, so both imports are circular — which is exactly what the
   * thunks are for: without them, whichever module the bundler reached second
   * would evaluate the first's object literal while its `const` was still in
   * the temporal dead zone, and fail at import with a `ReferenceError` (T4).
   *
   * **Two declarations, one of them set per record.** `resolveReferences` loops
   * them independently and an absent or empty `dataField` resolves to
   * `undefined` without touching the resolver, so a feature that names a recipe
   * costs no group read and vice versa.
   *
   * Each `fields` list is both the payload and the trigger, so a field
   * `buildIndexValue` reads but a declaration does not name would be a card
   * nothing invalidates. Recipes lend `name` and `image`; groups lend `name`
   * and `kind` and no image, because they have none of their own until 22h and
   * the member-thumbnail fallback is a render-time read (D13).
   */
  references: [
    {
      config: () => recipeContentConfig,
      dataField: "recipe",
      fields: ["name", "image"],
    },
    {
      config: () => groupContentConfig,
      dataField: "group",
      fields: ["name", "kind"],
    },
  ],
};

export default featuredRecipeContentConfig;
