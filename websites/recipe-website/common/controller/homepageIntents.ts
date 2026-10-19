import type { TermHierarchyNode, TagVocabularyEntry } from "./tagVocabulary";

/**
 * The homepage's intents beside "What can I make?" (usability pass,
 * 2026-10-15; `tag:` chips since 42f): the questions a reader most often
 * arrives with, each answered by one tag query.
 *
 * **The slugs are the vocabulary epic 33 applied** — `quick` and `project`
 * under Speed & effort (D2 defines quick as ≤ 30 minutes and project as
 * several stages or a long rest), `vegetarian` under Main ingredient (D3),
 * and the `drink` root. An intent whose term does not exist, or that nothing
 * carries, is left out, so a corpus without this vocabulary (most test
 * fixtures) shows the search field and the Make tile alone. Change a slug
 * here and nowhere else.
 *
 * **A chip is a search** (42f, canvas B "Now and next"): it reads
 * `tag:quick` and opens `/search?q=tag:quick` (`intentSearchHref`), so the
 * reader lands in the field with the query as a chip to widen or narrow.
 * Until 42f these were tiles linking to the term pages, the drink one to
 * `/drinks`; those pages are still one click away, from the browse rows and
 * the masthead. `tag:` search is hierarchy-aware (24d), so it finds the set
 * the count describes.
 */
export const HOMEPAGE_INTENTS: readonly HomepageIntentConfig[] = [
  { slug: "quick", label: "Quick", noun: "recipe" },
  { slug: "vegetarian", label: "Vegetarian", noun: "recipe" },
  { slug: "project", label: "A weekend project", noun: "recipe" },
  { slug: "drink", label: "A drink", noun: "drink" },
];

export interface HomepageIntentConfig {
  slug: string;
  /** What the chip's tooltip calls it: "Quick: 121 recipes". */
  label: string;
  /** What the count counts: "121 recipes", "217 drinks". */
  noun: string;
}

export interface HomepageIntent extends HomepageIntentConfig {
  count: number;
}

/** Where an intent chip goes: its tag query, in the search field (42f). */
export function intentSearchHref(slug: string): string {
  return `/search?q=${encodeURIComponent(`tag:${slug}`)}`;
}

/**
 * Every term in the hierarchy with its subtree total — the count `/tags`
 * prints beside it and the number of things its page lists.
 */
export function termTotals(tree: TermHierarchyNode[]): Map<string, number> {
  const totals = new Map<string, number>();
  const walk = (node: TermHierarchyNode) => {
    if (totals.has(node.slug)) return;
    totals.set(node.slug, node.total);
    node.children.forEach(walk);
  };
  tree.forEach(walk);
  return totals;
}

/**
 * The chips to show, in `HOMEPAGE_INTENTS` order, each with its count.
 *
 * Counts come from the hierarchy first (subtree totals) and then from the
 * flat vocabulary, which the route reads only when there is no hierarchy — so
 * a bare `quick` tag on a corpus with no records still gets its chip.
 */
export function homepageIntents(
  totals: Map<string, number>,
  vocabulary: TagVocabularyEntry[] = [],
  intents: readonly HomepageIntentConfig[] = HOMEPAGE_INTENTS,
): HomepageIntent[] {
  const flat = new Map(vocabulary.map((entry) => [entry.slug, entry.count]));
  return intents
    .map((intent) => ({
      ...intent,
      count: totals.get(intent.slug) ?? flat.get(intent.slug) ?? 0,
    }))
    .filter((intent) => intent.count > 0);
}

/** "1 recipe", "121 recipes". */
export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
