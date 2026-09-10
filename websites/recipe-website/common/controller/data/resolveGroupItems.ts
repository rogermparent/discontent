import { recipeItems } from "./readRecipeItem";
import type { Group, GroupItem, Recipe } from "../types";

/** One row's item, paired with the recipe it names — or `null` if it dangles. */
export interface ResolvedGroupItem {
  item: GroupItem;
  recipe: Recipe | null;
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
    (group.items ?? []).map(async (item) => ({
      item,
      recipe: await recipeItems.read(item.recipe),
    })),
  );
}

export default resolveGroupItems;
