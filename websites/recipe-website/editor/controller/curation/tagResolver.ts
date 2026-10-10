/**
 * The server's `tag:` expansion (epic 31, 31b): the browser's, from the same
 * vocabulary, read Node-safe.
 *
 * The browser builds its resolver from `/search/terms` — both carriers' term
 * folds merged with the term tree. This reads those three values straight
 * from their aggregates (`readTaxonomyTerms`, `readAggregate`), never through
 * the cached reads `/search/terms` uses (`unstable_cache` throws outside a
 * Next render, T5/D8), and merges them with the same pure functions, so
 * `recipe_search "tag:dessert"` and the search box answer alike.
 *
 * A content directory with no term records, or one never indexed, has no
 * tree: every term is then a leaf, and the expansion only reconciles a
 * term's slug with its label.
 */
import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import { readTaxonomyTerms } from "@discontent/cms/taxonomies/read";
import { termTreeAggregate } from "@discontent/cms/taxonomies/tree";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { groupTagTaxonomy } from "recipe-website-common/controller/groupTagTaxonomy";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import {
  buildTagExpansion,
  type TermResolver,
} from "recipe-website-common/controller/tagExpansion";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import {
  mergeTagVocabulary,
  tagOptions,
} from "recipe-website-common/controller/tagVocabulary";
import type { CurationContext } from "./context";

export async function readTagResolver(
  ctx: CurationContext,
): Promise<TermResolver> {
  const { contentDirectory } = ctx;
  const [recipeTerms, groupTerms, tree] = await Promise.all([
    readTaxonomyTerms({
      config: recipeContentConfig,
      taxonomy: recipeTagTaxonomy,
      contentDirectory,
    }),
    readTaxonomyTerms({
      config: groupContentConfig,
      taxonomy: groupTagTaxonomy,
      contentDirectory,
    }),
    readAggregate({
      config: tagTermContentConfig,
      aggregateConfig: termTreeAggregate(),
      contentDirectory,
    }),
  ]);
  return buildTagExpansion(
    tagOptions(mergeTagVocabulary({ recipeTerms, groupTerms, tree }), tree),
  );
}
