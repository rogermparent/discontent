import { groupTagReads } from "./readGroupTagIndex";
import { recipeTagReads } from "./readRecipeTagIndex";
import { tagTermReads } from "./readTagTerms";
import {
  applyPinned,
  breadcrumbOf,
  childrenOf,
  mergeTagVocabulary,
  type TagVocabularyEntry,
  type TermPageData,
} from "../tagVocabulary";

/**
 * The reading half of the join (24c) — the cached reads, and nothing else.
 *
 * Every rule these two functions apply lives in `tagVocabulary.ts`, which is
 * pure. What is here is which values to ask for and how many times: four cached
 * reads for a term page, three for the index, all of them tagged, so a term
 * page costs four cache lookups rather than a corpus scan and the export builds
 * every one of them from a single read of each.
 *
 * **Three sources, one vocabulary.** Recipes and groups each fold the same
 * `tag` taxonomy under their own cache tag, and the term *records* are a third
 * content type entirely. Nothing joins them on disk — the join is here, at read
 * time, which is what makes a record optional and a fourth carrier a fourth
 * read rather than a migration.
 */

/** `/tags` — every term the site has, counts summed, records included. */
export async function readTagVocabulary(): Promise<TagVocabularyEntry[]> {
  const [recipeTerms, groupTerms, tree] = await Promise.all([
    recipeTagReads.terms.read(),
    groupTagReads.terms.read(),
    tagTermReads.tree.read(),
  ]);
  return mergeTagVocabulary({ recipeTerms, groupTerms, tree });
}

/**
 * One term's page, or `null` when the slug names nothing at all.
 *
 * "Nothing at all" means no recipe carries it, no group carries it **and** no
 * record defines it — the three-source version of the rule `tagRoute` has
 * always applied. A record with no carriers is a real page (that is the whole
 * point of a vocabulary you can define ahead of assigning), and so is a term
 * that only exists as a string on one group.
 *
 * The counts the breadcrumb and the child chips print come from the two
 * inverted maps already being read rather than from the two term clouds, which
 * would be two more reads for a number both values already contain: a term's
 * count *is* how many carriers its row lists.
 */
export async function resolveTermPage(
  slug: string,
): Promise<TermPageData | null> {
  const [byRecipeTag, byGroupTag, tree, record] = await Promise.all([
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
    tagTermReads.tree.read(),
    tagTermReads.items.read(slug),
  ]);

  const recipes = byRecipeTag?.[slug];
  const groups = byGroupTag?.[slug];
  if (!recipes && !groups && !record) return null;

  const counts = new Map<string, TagVocabularyEntry>();
  const countInto = (
    source: Record<string, { label: string; items: unknown[] }> | null,
  ) => {
    for (const [termSlug, entry] of Object.entries(source ?? {})) {
      const existing = counts.get(termSlug);
      if (existing) existing.count += entry.items.length;
      else
        counts.set(termSlug, {
          slug: termSlug,
          label: entry.label,
          count: entry.items.length,
        });
    }
  };
  countInto(byRecipeTag ?? null);
  countInto(byGroupTag ?? null);
  /* A record's label beats a fold's, here as on `/tags`. */
  for (const [termSlug, node] of Object.entries(tree ?? {})) {
    const existing = counts.get(termSlug);
    if (existing) existing.label = node.label;
    else counts.set(termSlug, { slug: termSlug, label: node.label, count: 0 });
  }

  return {
    slug,
    label: record?.label ?? recipes?.label ?? groups?.label ?? slug,
    ...(record?.description ? { description: record.description } : {}),
    ...(record?.image ? { image: record.image } : {}),
    breadcrumb: breadcrumbOf(tree, slug, counts),
    children: childrenOf(tree, slug, counts),
    /*
     * The curated front (D5 option 2). Pinned recipes first in the record's
     * order, then the rest newest-first as the fold produced them — and groups
     * after both, as their own section, because a recipe card and a group card
     * are different cards.
     */
    recipes: applyPinned(recipes?.items ?? [], record?.pinned),
    groups: groups?.items ?? [],
  };
}

/**
 * Every term page the export should emit — the union of all three sources.
 *
 * A record-only term is in the list, which is the reason this cannot simply be
 * the two `byTerm` keysets: `/tags/holiday` has a record, no carriers and a
 * page, and an export that skipped it would 404 a link `/tags` prints.
 */
export async function readTermPageSlugs(): Promise<string[]> {
  const [byRecipeTag, byGroupTag, tree] = await Promise.all([
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
    tagTermReads.tree.read(),
  ]);
  return [
    ...new Set([
      ...Object.keys(byRecipeTag ?? {}),
      ...Object.keys(byGroupTag ?? {}),
      ...Object.keys(tree ?? {}),
    ]),
  ];
}
