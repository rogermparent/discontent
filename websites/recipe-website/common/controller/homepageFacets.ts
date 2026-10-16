import type { TermHierarchyNode } from "./tagVocabulary";

/**
 * The homepage's "Browse" section, as a pure function of `/tags`' tree
 * (homepage redesign, 2026-10-15).
 *
 * Its own module, like `tagVocabulary.ts`, so the rules — which roots, in
 * what order, how many children — are unit-tested on plain values and never
 * drag a cached read in with them.
 */

/**
 * The order the facet roots lead in. **Hard-coded on purpose**: a term record
 * has no ordering field, and no rule over the data gives this order — sorting
 * by subtree total puts Drinks above Holidays and Spirit, sorting by label
 * puts Course after Cuisine. The order is a reading order (what kind of dish,
 * what is in it, where it is from, how long it takes, then the occasions,
 * then the bar), so it is a list.
 *
 * Only a preference: a root missing from the vocabulary is simply skipped, and
 * a root that is not listed here still shows, after these, by
 * `compareUnlisted`. Adding a root to the vocabulary never needs a code
 * change; putting it somewhere other than the end does.
 */
export const FACET_ROOT_ORDER: readonly string[] = [
  "course",
  "main-ingredient",
  "cuisine",
  "effort",
  "holidays",
  "drink",
  "spirit",
];

/**
 * Children shown per root before "More →" defers to the root's own page.
 * Eight fills two rows of chips in a three-up card on a laptop; the largest
 * roots (Drinks' 66 children, Main ingredient's 15) would otherwise turn a
 * signpost into the whole vocabulary, which is `/tags`' job.
 */
export const FACET_CHILD_LIMIT = 8;

/** One chip under a root: the term, its picture, and its subtree total. */
export interface HomepageFacetChild {
  slug: string;
  label: string;
  total: number;
  image?: string;
}

/** One root and the children the homepage shows under it. */
export interface HomepageFacet extends HomepageFacetChild {
  children: HomepageFacetChild[];
  /** Children with carriers that the cap left out — the "More →" case. */
  hidden: number;
}

/** Biggest first, then by label — the order a reader scans a facet in. */
function byTotal(a: HomepageFacetChild, b: HomepageFacetChild): number {
  return b.total - a.total || a.label.localeCompare(b.label);
}

/** Roots outside `FACET_ROOT_ORDER`: the bigger facet first, as children. */
const compareUnlisted = byTotal;

function child(node: TermHierarchyNode): HomepageFacetChild {
  return {
    slug: node.slug,
    label: node.label,
    total: node.total,
    ...(node.image ? { image: node.image } : {}),
  };
}

/**
 * The facets the homepage browses by: every root of the tree that leads to
 * something, in `order`, each with its biggest children.
 *
 * - **Children** are the root's *direct* children (a grandchild is one click
 *   further, on the child's page), biggest subtree first, capped at `limit`.
 *   A child nothing carries is left out: a chip whose page lists nothing is a
 *   dead end on the one page meant to be all ways in.
 * - **A root** shows when at least one child survives that filter. `readTagTree`
 *   already returns only roots that have children, so this drops just the
 *   vocabulary defined ahead of its recipes.
 *
 * An empty result is the caller's cue to fall back to the flat tag chips — a
 * corpus with no term records (every test fixture but two) still gets a
 * browse row.
 */
export function homepageFacets(
  tree: TermHierarchyNode[],
  {
    order = FACET_ROOT_ORDER,
    limit = FACET_CHILD_LIMIT,
  }: { order?: readonly string[]; limit?: number } = {},
): HomepageFacet[] {
  const rank = (slug: string) => {
    const index = order.indexOf(slug);
    return index === -1 ? order.length : index;
  };
  return tree
    .map((root): HomepageFacet => {
      const carried = root.children
        .filter((node) => node.total > 0)
        .map(child)
        .sort(byTotal);
      return {
        ...child(root),
        children: carried.slice(0, limit),
        hidden: Math.max(0, carried.length - limit),
      };
    })
    .filter((facet) => facet.children.length > 0)
    .sort((a, b) => rank(a.slug) - rank(b.slug) || compareUnlisted(a, b));
}
