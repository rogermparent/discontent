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
 * **Ranked, and OR, since 27d (D12).** Until then every word had to match and
 * rows came back newest-first, so "lime gin" missed every drink that said
 * only one of them, and the curator skill searched one word at a time. Now a
 * row needs at least one word, and rows sort by a score — the browser's field
 * priority made explicit: name 4, tags 3, ingredients 2, description 1, the
 * best field per word, summed over the words — then newest first. Typed terms
 * (`tag:`, `source:`, negations) still narrow exactly as before.
 *
 * **`group:` since 30a.** Membership lives in the groups, not on the recipe
 * rows, so rows are decorated with it before filtering — the browser's rule,
 * from the same corpus `/search/groups` serves — and only when the query has
 * a `group:` term, so every other search reads no groups at all.
 */
import { readTaxonomyTerms } from "@discontent/cms/taxonomies/read";
import {
  fieldMatches,
  filterTerms,
  fold,
  matchesFilter,
  parseQuery,
  type FilterNode,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import { getGroupSearchCorpus } from "recipe-website-common/controller/data/readGroupSearchCorpus";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import type { CurationContext } from "./context";
import { readAllRecipeRows, type RecipeRow } from "./recipes";

export interface SearchResult {
  query: { raw: string; text: string; hasAdvancedSyntax: boolean };
  total: number;
  recipes: RecipeRow[];
}

/** A word's worth in each field: the browser's field order, as numbers. */
export const FIELD_WEIGHTS = {
  name: 4,
  tags: 3,
  ingredients: 2,
  description: 1,
} as const;

/**
 * How well a row answers the free text: for each word, the weight of the best
 * field it appears in (0 if none), summed.
 *
 * `fieldMatches` is the browser's own prefix-at-word-start matcher, exported
 * from `queryLanguage.ts` for exactly this (fact 3), so `search "choc"` finds
 * here what it finds while it is being typed there. A row scoring 0 matched no
 * word and is not a result.
 */
export function scoreFreeText(row: RecipeRow, text: string): number {
  const words = fold(text).split(/\s+/).filter(Boolean);
  let score = 0;
  for (const word of words) {
    if (fieldMatches(row.name, word)) score += FIELD_WEIGHTS.name;
    else if ((row.tags ?? []).some((tag) => fieldMatches(tag, word))) {
      score += FIELD_WEIGHTS.tags;
    } else if (
      (row.ingredients ?? []).some((line) => fieldMatches(line, word))
    ) {
      score += FIELD_WEIGHTS.ingredients;
    } else if (row.description && fieldMatches(row.description, word)) {
      score += FIELD_WEIGHTS.description;
    }
  }
  return score;
}

/** Whether any leaf of the filter is a `group:` term, negated or not. */
function hasGroupTerm(filter: FilterNode | undefined): boolean {
  return filterTerms(filter).some(
    ({ node }) => node.type === "text" && node.field === "group",
  );
}

/**
 * Recipe slug → the strings a `group:` term may match: each membership
 * contributes the group's slug and its name, so `group:weeknight-favourites`
 * and `group:weeknight` both find it. `SearchContext`'s `groupsByRecipe`, on
 * the same corpus — transitive through sub-groups, as the browser's is.
 */
async function readGroupsByRecipe(
  ctx: CurationContext,
): Promise<Map<string, string[]>> {
  const groups = await getGroupSearchCorpus({
    contentDirectory: ctx.contentDirectory,
  });
  const map = new Map<string, string[]>();
  for (const group of groups) {
    for (const slug of group.recipes) {
      const existing = map.get(slug);
      if (existing) existing.push(group.slug, group.name);
      else map.set(slug, [group.slug, group.name]);
    }
  }
  return map;
}

export async function searchRecipes(
  ctx: CurationContext,
  raw: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<SearchResult> {
  const query = raw ?? "";
  const { text, filter, hasAdvancedSyntax } = parseQuery(query);
  const rows = await readAllRecipeRows(ctx);
  const hasText = fold(text).trim().length > 0;
  const groupsByRecipe = hasGroupTerm(filter)
    ? await readGroupsByRecipe(ctx)
    : null;

  const scored: { row: RecipeRow; score: number }[] = [];
  for (const row of rows) {
    /* Matched decorated, returned as read: the result rows keep their shape. */
    const candidate = groupsByRecipe
      ? { ...row, groups: groupsByRecipe.get(row.slug) }
      : row;
    if (filter && !matchesFilter(candidate, filter)) continue;
    /* No free text: typed terms alone decide, and every row they keep scores 0. */
    const score = hasText ? scoreFreeText(row, text) : 0;
    if (hasText && score === 0) continue;
    scored.push({ row, score });
  }
  /* Best first, then newest — the order `readAllRecipeRows` already has. */
  scored.sort((a, b) => b.score - a.score || b.row.date - a.row.date);

  const matched = scored.map(({ row }) => row);
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
