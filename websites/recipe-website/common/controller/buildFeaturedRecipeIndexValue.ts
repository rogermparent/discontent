import {
  borrowed,
  type ResolvedReferences,
} from "@discontent/cms/content/references";
import {
  FeaturedRecipe,
  FeaturedRecipeEntryValue,
  Group,
  Recipe,
  TagTerm,
} from "./types";

export default function buildFeaturedRecipeIndexValue(
  featuredRecipe: FeaturedRecipe,
  refs: ResolvedReferences,
): FeaturedRecipeEntryValue {
  const { recipe, group, term, note } = featuredRecipe;
  const referenced = borrowed<Recipe>(refs, "recipe");
  const referencedGroup = borrowed<Group>(refs, "group");
  const referencedTerm = borrowed<TagTerm>(refs, "term");
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
    /*
     * The term half (24c), and the three keys are **spread rather than
     * assigned** — the one place this function deliberately differs from the
     * seven above it.
     *
     * The seven were assigned before these existed and every stored value on
     * disk was written that way, so changing them now would rewrite the whole
     * corpus's featured index to say the same thing. The new three have no such
     * history, and assigning them `undefined` would put a key on every entry
     * that features a recipe or a group — a shape change to every stored value,
     * for a field only a featured *term* reads (T16).
     */
    ...(term ? { term } : {}),
    ...(referencedTerm?.label ? { termLabel: referencedTerm.label } : {}),
    ...(referencedTerm?.image ? { termImage: referencedTerm.image } : {}),
  };
}
