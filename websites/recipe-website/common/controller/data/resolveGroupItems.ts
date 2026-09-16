import { groupItems } from "./readGroupItem";
import { recipeItems } from "./readRecipeItem";
import type { Group, GroupItem, Recipe } from "../types";

/**
 * One row's item, paired with what it names — or `null` if it dangles.
 *
 * Both halves are nullable and at most one is ever set, because an item names
 * one thing: a `{recipe}` row leaves `group` null and a `{group}` row leaves
 * `recipe` null. Rendering reads the item's own key to know which to look at,
 * so a dangling row is the case where the key is set and the value is null.
 */
export interface ResolvedGroupItem {
  item: GroupItem;
  recipe: Recipe | null;
  group: Group | null;
}

/**
 * A group's items, each paired with the recipe it names (22g).
 *
 * Lifted out of the two `group/[slug]/page.tsx` routes when the two
 * `featured-recipe/[slug]` routes needed the same four lines: reading a group's
 * members is the one thing every surface that renders a group's contents does,
 * and four copies of it would be four places to get the order or the dangling
 * case wrong.
 *
 * Both properties it has to keep are subtle enough to be worth naming here. The
 * reads are concurrent but the array keeps the **group's** order, because
 * `Promise.all` resolves positionally — for a meal plan the order is the plan.
 * And `recipeItems.read` answers `null` rather than throwing for a missing
 * slug, so a dangling item renders as "Recipe not found" instead of 404ing a
 * group that is otherwise entirely fine (D3).
 *
 * The cached item read is also what makes a retitle show on a group page
 * without groups declaring a reference to their recipes.
 */
export async function resolveGroupItems(
  group: Group,
): Promise<ResolvedGroupItem[]> {
  return Promise.all(
    (group.items ?? []).map(async (item) => {
      /*
       * A sub-group goes through `groupItems.read` — the same cached by-slug
       * read the cards use — so a nested group's card is fresh when the child
       * is retitled, for the same reason and by the same tag a recipe's is.
       */
      if (item.group !== undefined) {
        return { item, recipe: null, group: await groupItems.read(item.group) };
      }
      return { item, recipe: await recipeItems.read(item.recipe), group: null };
    }),
  );
}

export default resolveGroupItems;
