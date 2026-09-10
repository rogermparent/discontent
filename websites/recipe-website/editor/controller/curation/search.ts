/**
 * Search, without FlexSearch.
 *
 * **There is no server-side search database** (fact 3). `SEARCH_DB_NAME` names
 * a *browser* IndexedDB store; the corpus is shipped to the client and indexed
 * there. So the CLI evaluates the query itself, over the same index values the
 * browser would have received.
 *
 * That makes the free-text pass mandatory rather than optional.
 * `parseQuery` leaves positive bare words in `text` and puts only typed terms
 * and negations into `filter` — the browser hands `text` to FlexSearch and uses
 * `matchesFilter` to narrow what comes back. A CLI that ran only
 * `matchesFilter` would answer `search "chocolate"` with the entire corpus.
 *
 * What is deliberately *not* reproduced is ranking. FlexSearch orders by field
 * priority; these results are unranked and newest-first, which is the same
 * order every other list surface uses. Recorded as deferred in the phase doc.
 */
import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import {
  fieldMatches,
  fold,
  matchesFilter,
  parseQuery,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import { recipeTags } from "recipe-website-common/controller/aggregateConfigs";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";
import type { CurationContext } from "./context";
import { readAllRecipeRows, type RecipeRow } from "./recipes";

export interface SearchResult {
  query: { raw: string; text: string; hasAdvancedSyntax: boolean };
  total: number;
  recipes: RecipeRow[];
}

/**
 * Every word must appear somewhere — name, description, a tag or an ingredient.
 *
 * `fieldMatches` is the browser's own prefix-at-word-start matcher, exported
 * from `queryLanguage.ts` for exactly this (fact 3), so `search "choc"` narrows
 * here the way it narrows while it is being typed there.
 */
export function matchesFreeText(row: RecipeRow, text: string): boolean {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  return words.every(
    (word) =>
      fieldMatches(row.name, word) ||
      (row.description ? fieldMatches(row.description, word) : false) ||
      (row.tags ?? []).some((tag) => fieldMatches(tag, word)) ||
      (row.ingredients ?? []).some((line) => fieldMatches(line, word)),
  );
}

export async function searchRecipes(
  ctx: CurationContext,
  raw: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<SearchResult> {
  const query = raw ?? "";
  const { text, filter, hasAdvancedSyntax } = parseQuery(query);
  const rows = await readAllRecipeRows(ctx);
  const matched = rows.filter(
    (row) =>
      (filter ? matchesFilter(row, filter) : true) &&
      matchesFreeText(row, text),
  );
  return {
    query: { raw: query, text, hasAdvancedSyntax },
    total: matched.length,
    recipes: matched.slice(offset, offset + limit),
  };
}

/**
 * Every tag in the corpus.
 *
 * `readAggregate` rather than `getAllTags()`: the latter reads through
 * `unstable_cache` and throws `incrementalCache missing` outside Next (fact 4),
 * and it also cannot take a content directory. `null` means the aggregate has
 * never been folded — an unbuilt content directory reads as no tags.
 */
export async function listTags(ctx: CurationContext): Promise<string[]> {
  return (
    (await readAggregate<
      RecipeEntryValue,
      RecipeEntryKey,
      Set<string>,
      string[]
    >({
      config: recipeContentConfig,
      aggregateConfig: recipeTags,
      contentDirectory: ctx.contentDirectory,
    })) ?? []
  );
}
