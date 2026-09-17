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
import { readTaxonomyTerms } from "@discontent/cms/taxonomies/read";
import {
  fieldMatches,
  fold,
  matchesFilter,
  parseQuery,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
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
 * Every tag in the corpus, as labels.
 *
 * `readTaxonomyTerms` rather than `getAllTags()`: the latter reads through
 * `unstable_cache` and throws `incrementalCache missing` outside Next (fact 4),
 * and it also cannot take a content directory. It is the Node-safe half of the
 * same folded value the site's cached read wraps. `null` means the aggregate
 * has never been folded — an unbuilt content directory reads as no tags.
 *
 * Mapped to `label` so `/api/tags`, `recipes tags` and the MCP `tag_list` go on
 * answering with the strings a curator types, unchanged in shape by 24b. The
 * slugs and counts the fold also carries are `/tags`' business.
 */
export async function listTags(ctx: CurationContext): Promise<string[]> {
  const terms = await readTaxonomyTerms({
    config: recipeContentConfig,
    taxonomy: recipeTagTaxonomy,
    contentDirectory: ctx.contentDirectory,
  });
  return (terms ?? []).map((term) => term.label);
}
