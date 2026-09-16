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
    /*
     * `label` is an unconditional key and `group` a spread one, deliberately
     * (T40): every item written before 23c carried `{recipe, label}` with
     * `label` possibly `undefined`, so keeping that shape means a re-index of
     * untouched content produces the bytes that are already stored — while a
     * `group` key that appeared as `undefined` on every recipe item would move
     * all of them. `recipe` is spread for the mirror-image reason: a sub-group
     * row has no recipe, and writing one as `undefined` would put a key on the
     * value that nothing reads.
     */
    items: (items ?? []).map(({ recipe, group, label }) => ({
      ...(recipe ? { recipe } : {}),
      label,
      ...(group ? { group } : {}),
    })),
  };
}
