import { Group, GroupEntryValue } from "./types";

/**
 * The index value for one group: its name, its kind, and its items stripped
 * down to what the derived surfaces read.
 *
 * Item **order is preserved**. For a meal plan the order *is* the plan, so a
 * reorder has to read as a change — which it does, because the projection and
 * the `groupsByRecipe` fold both walk this array in order and both are hashed.
 *
 * `note` is dropped here rather than merely unread: see `GroupEntryValue`.
 *
 * Pure and synchronous, and it takes no `refs` — groups borrow nothing (D3),
 * so there is no second parameter to declare.
 */
export default function buildGroupIndexValue(group: Group): GroupEntryValue {
  const { name, kind, image, items } = group;
  return {
    name,
    kind,
    /*
     * Spread rather than assigned, so a group with no picture stores no `image`
     * key at all (22h/D14). An explicit `image: undefined` would serialize the
     * same but compare differently to every value written before this field
     * existed, which is the kind of difference a stored hash notices.
     */
    ...(image ? { image } : {}),
    items: (items ?? []).map(({ recipe, label }) => ({ recipe, label })),
  };
}
