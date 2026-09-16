/**
 * What a group's chip says it holds: `"3 recipes"`, `"1 recipe, 1 group"`,
 * `"2 groups"`.
 *
 * One function rather than the three copies of `n + (n === 1 ? " recipe" : "
 * recipes")` that 23c would otherwise have made — the detail page, the featured
 * detail page and the list card all print this, and a group that says "1
 * recipe" on one surface and "1 recipe, 1 group" on another reads as a bug in
 * whichever one the reader saw second.
 *
 * The groups clause is dropped entirely at zero rather than printed as ", 0
 * groups": nesting is rare, and every existing group would otherwise gain a
 * clause about something it does not have. `groupCount` therefore defaults,
 * which is also what a stored v2 index row hands in (T34).
 */
export function groupCountLabel(recipeCount: number, groupCount = 0): string {
  const recipes = `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"}`;
  if (groupCount <= 0) return recipes;
  return `${recipes}, ${groupCount} ${groupCount === 1 ? "group" : "groups"}`;
}

export default groupCountLabel;
