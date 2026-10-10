import {
  fieldMatches,
  fold,
  matchesFilter,
  parseQuery,
  type FilterableRecipe,
} from "../SearchForm/queryLanguage";
import type { TermResolver } from "../../controller/tagExpansion";

/**
 * Every free-text word must appear somewhere — name, description, a tag or an
 * ingredient. A copy of `curation/search.ts`'s `matchesFreeText`, which lives
 * in the editor and so can't be imported from here; both use the browser's own
 * `fieldMatches`, so `/make?q=choc` narrows exactly as `recipes search choc`
 * does.
 */
function matchesFreeText(recipe: FilterableRecipe, text: string): boolean {
  const words = fold(text).split(/\s+/).filter(Boolean);
  return words.every(
    (word) =>
      fieldMatches(recipe.name, word) ||
      (recipe.description ? fieldMatches(recipe.description, word) : false) ||
      (recipe.tags ?? []).some((tag) => fieldMatches(tag, word)) ||
      (recipe.ingredients ?? []).some((line) => fieldMatches(line, word)),
  );
}

/**
 * The recipes a scope query selects: the filter (`tag:drink -tag:batch`) and
 * every free-text word. No FlexSearch — this is a narrowing, not a ranking.
 *
 * `resolver` makes `tag:` reach a term's subtree (31b), so a parent chip
 * scopes to the recipes its count promises — the count is `subtreeUsage`'s.
 */
export function scopeRecipes<T extends FilterableRecipe>(
  recipes: T[],
  query: string,
  resolver?: TermResolver,
): T[] {
  const { text, filter } = parseQuery(query);
  return recipes.filter(
    (recipe) =>
      matchesFilter(recipe, filter, resolver) && matchesFreeText(recipe, text),
  );
}
