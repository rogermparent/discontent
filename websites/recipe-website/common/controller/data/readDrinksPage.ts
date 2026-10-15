import { recipeTagReads } from "./readRecipeTagIndex";
import { tagTermReads } from "./readTagTerms";
import {
  drinksPageData,
  drinksPageKeys,
  type DrinksPageData,
} from "../drinksPage";

/**
 * `/drinks`' reads (U3): the tree, then one cached by-term row per key of
 * the `drink`, `spirit` and `holidays` subtrees and the styles — the term
 * page's pattern (34a), so a write that moves one term's rows expires this
 * page with that term's pages and nothing reads a whole by-term map.
 *
 * Recipes only, and nothing about anyone's inventory: the make panel is
 * computed in the browser from the browser's own list (U6).
 */
export async function readDrinksPage(): Promise<DrinksPageData> {
  const tree = await tagTermReads.tree.read();
  const keys = drinksPageKeys(tree);
  const rows = await Promise.all(
    keys.map((key) => recipeTagReads.byTerm.readKey(key)),
  );
  const byKey = new Map(keys.map((key, i) => [key, rows[i]]));
  return drinksPageData({ tree, recipeRows: (key) => byKey.get(key) });
}
