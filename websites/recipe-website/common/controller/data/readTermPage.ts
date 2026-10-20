import { groupTagReads } from "./readGroupTagIndex";
import { recipeTagReads } from "./readRecipeTagIndex";
import { tagTermReads } from "./readTagTerms";
import {
  aliasSlugs,
  aliasTarget,
  mergeTagVocabulary,
  subtreeKeys,
  tagOptions,
  termBoard,
  termCarriers,
  termPageData,
  vocabularyOfRows,
  type TagBoard,
  type TagOption,
  type TermHierarchyNode,
  type TagVocabularyEntry,
  type TermPageData,
} from "../tagVocabulary";
import { tagBoardData, type TagBoardData } from "../tagBoardPage";
import { carriersFromRows, facetTermsFromOptions } from "../../util/facets";

/**
 * The reading half of the join (24c) — the cached reads, and nothing else.
 *
 * Every rule these functions apply lives in `tagVocabulary.ts`, which is
 * pure. What is here is which values to ask for and how many times: for a
 * term page, the tree, its record, and two by-term rows per term of its
 * subtree and per alias (34a — a leaf's page is four reads); three for the
 * index; all of
 * them tagged, so a term page costs a handful of cache lookups rather than a
 * corpus scan and the export builds every one of them from cached reads.
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
 * `/tags`' board (31b, U4): the hierarchy roots with distinct subtree totals,
 * and the records outside any hierarchy, from the tree and the two inverted
 * maps.
 *
 * The one reader of the **whole** by-term maps left (32e): a distinct subtree
 * total needs every term's carriers, so this pays for every term and expires
 * when any term's rows move. It is one page. Term pages read one term each.
 */
export async function readTagTree(): Promise<TermHierarchyNode[]> {
  return (await readTagBoard()).roots;
}

/** `/tags`' whole board (U4): `readTagTree`'s roots plus the loose records. */
export async function readTagBoard(): Promise<TagBoard> {
  const [byRecipeTag, byGroupTag, tree] = await Promise.all([
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
    tagTermReads.tree.read(),
  ]);
  if (!tree || Object.keys(tree).length === 0) {
    return { roots: [], loose: [], recorded: [], aliased: [] };
  }
  const counts = new Map(
    vocabularyOfRows({
      recipeRows: byRecipeTag,
      groupRows: byGroupTag,
      tree,
    }).map((entry) => [entry.slug, entry]),
  );
  /* Each term's carriers over its slug and its aliases (38a, D2): read
   * time only — the maps already hold every alias slug's rows. */
  return termBoard(tree, counts, termCarriers(tree, byRecipeTag, byGroupTag));
}

/**
 * `/tags` as canvas B draws it (43t): the facet shelves, Holidays, the drink
 * families, the other tags and "Find a tag" — from the same three reads as
 * `readTagBoard` (the tree and the two whole by-term maps), grouped and
 * counted by the facet model (43f). The terms are the vocabulary's options
 * (records and carried-only tags, each with its fold's label), so a tag
 * with no record is an "other tag" under its own spelling.
 */
export async function readTagBoardPage(): Promise<TagBoardData> {
  const [byRecipeTag, byGroupTag, tree] = await Promise.all([
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
    tagTermReads.tree.read(),
  ]);
  const vocabulary = vocabularyOfRows({
    recipeRows: byRecipeTag,
    groupRows: byGroupTag,
    tree,
  });
  return tagBoardData({
    terms: facetTermsFromOptions(tagOptions(vocabulary, tree)),
    recipes: carriersFromRows(byRecipeTag),
    groups: carriersFromRows(byGroupTag),
  });
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
 * "Nothing at all" means no record defines it and nothing in its subtree is
 * carried by a recipe or a group — the three-source version of the rule
 * `tagRoute` has always applied. A record with no carriers is a real page
 * (that is the whole point of a vocabulary you can define ahead of
 * assigning), and so is a term that only exists as a string on one group.
 *
 * **The subtree's rows, one term at a time** (34a, D1/D2). A term page lists
 * the recipes of the term and every descendant — what `tag:<term>` finds
 * since 24d — so it reads `byTerm.readKey(k)` for each key `k` of
 * `subtreeKeys(tree, slug)` (every subtree slug and each one's alias slugs,
 * as `tag:` expands them), recipes and groups. Each read is cached under
 * that key's own tag (32e), so a write that moves a term's rows expires the
 * pages of that term and its ancestors, and no other — and a key nothing
 * carries yet is still read, so its first carrier expires the page too.
 *
 * **No term clouds.** Until 34a the breadcrumb and child counts came from the
 * two whole `terms` clouds, so any carrier change anywhere expired every term
 * page. The child counts now come from the same per-term rows (each child's
 * subtree is inside this one), and the breadcrumb prints the tree's labels
 * without counts. The pure half — merging, counting, labels — is
 * `termPageData` in `tagVocabulary.ts`.
 */
export async function resolveTermPage(
  slug: string,
): Promise<TermPageData | null> {
  const [tree, record] = await Promise.all([
    tagTermReads.tree.read(),
    tagTermReads.items.read(slug),
  ]);
  const keys = subtreeKeys(tree, slug);
  const [recipeRows, groupRows] = await Promise.all([
    Promise.all(keys.map((key) => recipeTagReads.byTerm.readKey(key))),
    Promise.all(keys.map((key) => groupTagReads.byTerm.readKey(key))),
  ]);
  const recipesByKey = new Map(keys.map((key, i) => [key, recipeRows[i]]));
  const groupsByKey = new Map(keys.map((key, i) => [key, groupRows[i]]));

  return termPageData({
    slug,
    tree,
    record,
    recipeRows: (key) => recipesByKey.get(key),
    groupRows: (key) => groupsByKey.get(key),
  });
}

/**
 * Every term page the export should emit — the union of all three sources.
 *
 * A record-only term is in the list, which is the reason this cannot simply be
 * the two carriers' term slugs: `/tags/holiday` has a record, no carriers and a
 * page, and an export that skipped it would 404 a link `/tags` prints. The
 * same holds for a root that lists only its descendants' recipes (34a): only a
 * record can have children, so it is in the tree's keys.
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
