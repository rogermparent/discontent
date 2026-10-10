import { groupTagReads } from "./readGroupTagIndex";
import { recipeTagReads } from "./readRecipeTagIndex";
import { tagTermReads } from "./readTagTerms";
import {
  aliasSlugs,
  aliasTarget,
  applyPinned,
  breadcrumbOf,
  childrenOf,
  mergeTagVocabulary,
  tagOptions,
  termHierarchy,
  type TagOption,
  type TermHierarchyNode,
  type TagVocabularyEntry,
  type TermPageData,
} from "../tagVocabulary";

/**
 * The reading half of the join (24c) — the cached reads, and nothing else.
 *
 * Every rule these two functions apply lives in `tagVocabulary.ts`, which is
 * pure. What is here is which values to ask for and how many times: six cached
 * reads for a term page (its two by-term rows, the two term clouds, the tree
 * and its record — 32e), three for the index, all of them tagged, so a term
 * page costs six cache lookups rather than a corpus scan and the export builds
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
 * `/tags`' tree (31b): the hierarchy roots with distinct subtree totals, from
 * the tree and the two inverted maps.
 *
 * The one reader of the **whole** by-term maps left (32e): a distinct subtree
 * total needs every term's carriers, so this pays for every term and expires
 * when any term's rows move. It is one page. Term pages read one term each.
 */
export async function readTagTree(): Promise<TermHierarchyNode[]> {
  const [byRecipeTag, byGroupTag, tree] = await Promise.all([
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
    tagTermReads.tree.read(),
  ]);
  if (!tree || Object.keys(tree).length === 0) return [];
  const counts = new Map(
    mergeTagVocabulary({
      recipeTerms: Object.entries(byRecipeTag ?? {}).map(([slug, entry]) => ({
        slug,
        label: entry.label,
        count: entry.items.length,
      })),
      groupTerms: Object.entries(byGroupTag ?? {}).map(([slug, entry]) => ({
        slug,
        label: entry.label,
        count: entry.items.length,
      })),
      tree,
    }).map((entry) => [entry.slug, entry]),
  );
  return termHierarchy(tree, counts, (slug) => [
    ...(byRecipeTag?.[slug]?.items ?? []).map((item) => `recipe:${item.slug}`),
    ...(byGroupTag?.[slug]?.items ?? []).map((item) => `group:${item.slug}`),
  ]);
}

/**
 * Every term something carries, as labels, in slug order (31b) — the forms'
 * `TagsInput` suggestions and the homepage's browse chips.
 *
 * It replaced `getAllTags()`, which read the recipe fold alone: the server half
 * of the one "all terms" list (24-T11) whose browser half is `/search/terms`.
 * A group's tags and a record's label now reach both, and a record nothing
 * carries is left out, as the rail leaves it out.
 */
export async function readTagLabels(): Promise<string[]> {
  return (await readTagVocabulary())
    .filter((entry) => entry.count > 0)
    .map((entry) => entry.label);
}

/**
 * `/make`'s tag picker (28g): the same vocabulary as `/tags`, with each term's
 * parent from the tree, so the page can show roots and expand them.
 */
export async function readTagOptions(): Promise<TagOption[]> {
  const [recipeTerms, groupTerms, tree] = await Promise.all([
    recipeTagReads.terms.read(),
    groupTagReads.terms.read(),
    tagTermReads.tree.read(),
  ]);
  return tagOptions(
    mergeTagVocabulary({ recipeTerms, groupTerms, tree }),
    tree,
  );
}

/** One row of `/search/terms`: a term, its parent, its aliases, and how many carry it. */
export interface SearchTerm extends TagOption {
  /** Recipes and groups carrying the term itself (not its subtree). */
  count: number;
}

/**
 * `/search/terms` (epic 31, 31b): every term the site has — carried, recorded,
 * or both — with its parent from the tree and its count.
 *
 * The browser's one "all terms" list (24-T11): the tag rail, autocomplete, ⌘K
 * and `BrowseChips` read its labels, and `SearchContext` builds the `tag:`
 * expansion from its parents (`tagExpansion.ts`), so `tag:dessert` finds the
 * linzer cookies in the browser exactly as `recipe_search` does on the server.
 * Each row carries its record's `aliases` from the tree (32i), so `tag:<alias>`
 * and the autocomplete reach the canonical term in the browser as well.
 */
export async function readSearchTerms(): Promise<SearchTerm[]> {
  const [recipeTerms, groupTerms, tree] = await Promise.all([
    recipeTagReads.terms.read(),
    groupTagReads.terms.read(),
    tagTermReads.tree.read(),
  ]);
  const vocabulary = mergeTagVocabulary({ recipeTerms, groupTerms, tree });
  /* `tagOptions` maps the vocabulary in order, so the two line up by index. */
  return tagOptions(vocabulary, tree).map((option, index) => ({
    ...option,
    count: vocabulary[index].count,
  }));
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
 * **One term's rows, not the whole inverted map** (32e). The by-term
 * aggregate is keyed, so `byTerm.readKey(slug)` decodes this term alone and is
 * cached under this term's own tag: a write that moves another term's rows
 * leaves this page cached. Until 32e it read both whole maps (200 KB on the
 * real corpus) and expired with every one of them.
 *
 * The counts the breadcrumb and the child chips print come from the two term
 * clouds, which `/tags` reads anyway (9.5 KB). They agree with the old count
 * of row lengths by construction: both folds see the same walk, a term's
 * `count` is the number of carriers its row lists, and the first label seen
 * wins in both. `mergeTagVocabulary` lets a record's label beat a fold's, here
 * as on `/tags`.
 */
export async function resolveTermPage(
  slug: string,
): Promise<TermPageData | null> {
  const [recipes, groups, recipeTerms, groupTerms, tree, record] =
    await Promise.all([
      recipeTagReads.byTerm.readKey(slug),
      groupTagReads.byTerm.readKey(slug),
      recipeTagReads.terms.read(),
      groupTagReads.terms.read(),
      tagTermReads.tree.read(),
      tagTermReads.items.read(slug),
    ]);

  if (!recipes && !groups && !record) return null;

  const counts = new Map<string, TagVocabularyEntry>(
    mergeTagVocabulary({ recipeTerms, groupTerms, tree }).map((entry) => [
      entry.slug,
      entry,
    ]),
  );

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
 * the two carriers' term slugs: `/tags/holiday` has a record, no carriers and a
 * page, and an export that skipped it would 404 a link `/tags` prints.
 *
 * The carried slugs come from the two term clouds rather than the two whole
 * `byTerm` maps since 32e: the same slugs (one walk folds both), a twentieth
 * of the bytes.
 */
export async function readTermPageSlugs(): Promise<string[]> {
  const [recipeTerms, groupTerms, tree] = await Promise.all([
    recipeTagReads.terms.read(),
    groupTagReads.terms.read(),
    tagTermReads.tree.read(),
  ]);
  return [
    ...new Set([
      ...(recipeTerms ?? []).map((term) => term.slug),
      ...(groupTerms ?? []).map((term) => term.slug),
      ...Object.keys(tree ?? {}),
    ]),
  ];
}

/**
 * The term `/tags/<slug>` should redirect to, when `slug` is no term's page
 * but a record lists it as an alias (32i, D5) — else `undefined`.
 *
 * Asked only after `resolveTermPage` came back `null`: a slug that has a page
 * of its own (a record, or carriers that still use the alias as a tag) shows
 * that page, because it lists things the canonical page does not. One read,
 * the tree, which every term page reads anyway.
 */
export async function resolveTermAlias(
  slug: string,
): Promise<{ slug: string; label: string } | undefined> {
  const tree = await tagTermReads.tree.read();
  const target = aliasTarget(tree, slug);
  return target
    ? { slug: target, label: tree?.[target]?.label ?? target }
    : undefined;
}

/**
 * `readTermPageSlugs` plus every alias that is not a term of its own (32i):
 * the static export's params, so `/tags/<alias>` is a file that sends the
 * reader on. The editor renders an alias on demand and redirects instead, so
 * it keeps the plain list.
 */
export async function readTermPageSlugsWithAliases(): Promise<string[]> {
  const [slugs, tree] = await Promise.all([
    readTermPageSlugs(),
    tagTermReads.tree.read(),
  ]);
  return [...slugs, ...aliasSlugs(tree, new Set(slugs))];
}
