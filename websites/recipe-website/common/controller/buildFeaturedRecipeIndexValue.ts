import {
  borrowed,
  type ResolvedReferences,
} from "@discontent/cms/content/references";
import {
  FeaturedRecipe,
  FeaturedRecipeEntryValue,
  Group,
  Recipe,
} from "./types";

export default function buildFeaturedRecipeIndexValue(
  featuredRecipe: FeaturedRecipe,
  refs: ResolvedReferences,
): FeaturedRecipeEntryValue {
  const { recipe, group, note } = featuredRecipe;
  const referenced = borrowed<Recipe>(refs, "recipe");
  const referencedGroup = borrowed<Group>(refs, "group");
  return {
    recipe,
    group,
    note,
    /*
     * Pure and synchronous: the engine already read the recipe and handed the
     * declared fields over. Reading anything the `references` declaration does
     * not name would be a value nothing invalidates — a stale card with no
     * write to blame.
     */
    recipeName: referenced?.name,
    recipeImage: referenced?.image,
    /*
     * The group half (22g), and `undefined` on both counts for every entry that
     * features a recipe: the declaration is not resolved when `group` is absent,
     * so this costs a property lookup rather than a read.
     */
    groupName: referencedGroup?.name,
    groupKind: referencedGroup?.kind,
  };
}
