/**
 * The recipe page's "Group" picker (51, Dg1): the groups a recipe may be
 * added to, as the server reads them from the group index, and the rules the
 * picker applies to them. Pure, so a test can pin them.
 */

export interface GroupChoice {
  slug: string;
  name: string;
  /** How many rows it has now. */
  itemCount: number;
  /** True when this recipe is already one of them (Dg2: shown, not pickable). */
  hasRecipe: boolean;
}

/** More groups than this and the picker shows a filter field (Dg1). */
export const GROUP_FILTER_THRESHOLD = 8;

/** The choices whose name or slug has every word of `query`, order kept. */
export function filterGroupChoices(
  choices: readonly GroupChoice[],
  query: string,
): GroupChoice[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...choices];
  return choices.filter((choice) => {
    const hay = `${choice.name} ${choice.slug}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}

/** "3 recipes", "1 recipe", "empty": a group's size, in a row. */
export function groupChoiceCount(itemCount: number): string {
  if (itemCount <= 0) return "empty";
  return `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
}

/** Whether a group's rows already name `recipe` (a sub-group row never does). */
export function groupHasRecipe(
  items: ReadonlyArray<{ recipe?: string }> | undefined,
  recipe: string,
): boolean {
  return (items ?? []).some((item) => item.recipe === recipe);
}
