import type { TaxonomyTerm } from "@discontent/cms/taxonomies/types";
import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type { GroupListEntry } from "./groupPaginationConfig";
import type { RecipeListEntry } from "./paginationConfigs";

/**
 * The join, as pure functions: folds + records + tree → what a page renders.
 *
 * Its own module, and deliberately free of Next, LMDB and the engine's readers
 * — everything here takes plain values and returns plain values. Two reasons.
 * The rules below are the *whole* of what 24c decides (which label wins, what
 * order the recipes come in, where the breadcrumb stops), and a unit test that
 * had to build an LMDB fixture to check "the record's label beats the fold's"
 * would pin the plumbing instead of the rule. And `readTermPage.ts` above it
 * builds cached reads at module scope, so anything importing *this* for the
 * rules alone would otherwise drag `unstable_cache` in with it.
 *
 * The one thing it does not do is read. `readTermPage.ts` is the reading half.
 */

/** One row of `/tags`: a slug, what to print, and how many things carry it. */
export interface TagVocabularyEntry {
  slug: string;
  label: string;
  count: number;
}

/**
 * Everything the term page renders, resolved (24c).
 *
 * A flat record rather than the three sources it came from, so `TagPage` takes
 * one prop and the route decides everything: which label won, which recipes are
 * pinned, how far the breadcrumb walks.
 */
export interface TermPageData {
  slug: string;
  label: string;
  description?: string;
  image?: string;
  /** Root first, this term last — so the trail reads left to right. */
  breadcrumb: TagVocabularyEntry[];
  /** Direct children only, in the tree's order, with their own counts. */
  children: TagVocabularyEntry[];
  recipes: RecipeListEntry[];
  groups: GroupListEntry[];
}

/**
 * Every term the site has, from all three sources, counts summed.
 *
 * **Record label beats both folds.** A fold's label is the first normalised
 * spelling it happened to see on a carrier; a record's is the vocabulary's own,
 * typed by a curator, and that is the whole reason records exist. Between the
 * two folds, recipes win — the corpus is overwhelmingly recipes, and one label
 * has to win a slug collision somewhere (F8's first-label-wins rule, applied
 * across carriers rather than within one).
 *
 * **A record with no carriers is a row at count 0.** "Holiday 0" on `/tags` is
 * the intended reading of a term someone has defined and not yet assigned, not
 * a bug — the hybrid's whole claim is that a record and an assignment are
 * independent things.
 *
 * Sorted by slug, as `tagIndexRoute` has always sorted.
 */
export function mergeTagVocabulary({
  recipeTerms,
  groupTerms,
  tree,
}: {
  recipeTerms?: TaxonomyTerm[] | null;
  groupTerms?: TaxonomyTerm[] | null;
  tree?: TermTree | null;
}): TagVocabularyEntry[] {
  const merged = new Map<string, { label: string; count: number }>();

  for (const term of recipeTerms ?? []) {
    merged.set(term.slug, { label: term.label, count: term.count });
  }
  for (const term of groupTerms ?? []) {
    const existing = merged.get(term.slug);
    if (existing) existing.count += term.count;
    else merged.set(term.slug, { label: term.label, count: term.count });
  }
  for (const [slug, node] of Object.entries(tree ?? {})) {
    const existing = merged.get(slug);
    if (existing) existing.label = node.label;
    else merged.set(slug, { label: node.label, count: 0 });
  }

  return [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([slug, { label, count }]) => ({ slug, label, count }));
}

/**
 * The parent chain, root first, this term last.
 *
 * `parent` is scalar, so this is a walk and not a search — which is the whole
 * argument D2 makes for a scalar reference. The visited set is not defensive
 * tidiness: the tree fold is explicitly allowed to hand back a hand-edited
 * cycle (`A.parent = B`, `B.parent = A` is two lines a text editor can write),
 * and a breadcrumb that looped on one would hang the render. It stops at the
 * first slug it has already seen and reports the trail it has.
 *
 * A term absent from the tree gets a one-element trail — itself — because a
 * record-less term still has a page.
 */
export function breadcrumbOf(
  tree: TermTree | null | undefined,
  slug: string,
  counts?: Map<string, TagVocabularyEntry>,
): TagVocabularyEntry[] {
  const trail: TagVocabularyEntry[] = [];
  const seen = new Set<string>();
  let current: string | undefined = slug;

  while (current && !seen.has(current)) {
    seen.add(current);
    const node: TermTree[string] | undefined = tree?.[current];
    trail.push(
      counts?.get(current) ?? {
        slug: current,
        label: node?.label ?? current,
        count: 0,
      },
    );
    current = node?.parent;
  }

  return trail.reverse();
}

/**
 * The term's direct children, in the tree's order, each with its own count.
 *
 * The tree's order is the fold's — oldest first, the order the index walk
 * produced — and it is kept rather than re-sorted, because that is the order
 * `TermTreeNode.children` documents and the one a second reader would expect.
 * A child the vocabulary has no count for renders at 0, exactly as a
 * record-only term does on `/tags`.
 */
export function childrenOf(
  tree: TermTree | null | undefined,
  slug: string,
  counts?: Map<string, TagVocabularyEntry>,
): TagVocabularyEntry[] {
  const node = tree?.[slug];
  if (!node) return [];
  return node.children.map(
    (child) =>
      counts?.get(child) ?? {
        slug: child,
        label: tree?.[child]?.label ?? child,
        count: 0,
      },
  );
}

/**
 * The curated front: pinned items first, in the pinned order, then the rest.
 *
 * **A pinned slug the term does not carry is dropped**, rather than rendered as
 * a hole or promoted into the list. `pinned` and `tags` are independent writes —
 * untagging a recipe does not touch the term's record — so a stale pin is an
 * ordinary state rather than a broken one, and the page's job is to go on
 * reading correctly. 24e's `term_update` is what refuses to *store* one.
 *
 * Stable in both halves: the pinned run is in the record's order, and the
 * remainder keeps whatever order it arrived in (newest first, from the fold).
 */
export function applyPinned<TItem extends { slug: string }>(
  items: TItem[],
  pinned?: string[],
): TItem[] {
  if (!pinned?.length) return items;

  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const head: TItem[] = [];
  const taken = new Set<string>();
  for (const slug of pinned) {
    const item = bySlug.get(slug);
    if (!item || taken.has(slug)) continue;
    taken.add(slug);
    head.push(item);
  }
  if (head.length === 0) return items;

  return [...head, ...items.filter((item) => !taken.has(item.slug))];
}
