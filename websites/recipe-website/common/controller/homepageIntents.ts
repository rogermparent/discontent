import type { TermHierarchyNode, TagVocabularyEntry } from "./tagVocabulary";

/**
 * The homepage's intent tiles beside "What can I make?" (usability pass,
 * 2026-10-15): the questions a reader most often arrives with, each answered
 * by one term page.
 *
 * **The slugs are the vocabulary epic 33 applied** — `quick` and `project`
 * under Speed & effort (D2 defines quick as ≤ 30 minutes and project as
 * several stages or a long rest), `vegetarian` under Main ingredient (D3),
 * and the `drink` root. A tile whose term does not exist, or that nothing
 * carries, is left out, so a corpus without this vocabulary (every test
 * fixture) shows the Make tile alone. Change a slug here and nowhere else.
 *
 * The one-line descriptions are copy, not data; the count under each is the
 * term's own subtree total, the number its page lists.
 */
export const HOMEPAGE_INTENTS: readonly HomepageIntentConfig[] = [
  {
    slug: "quick",
    label: "Quick",
    description: "On the table in 30 minutes or less",
    noun: "recipe",
  },
  {
    slug: "vegetarian",
    label: "Vegetarian",
    description: "Savory dishes with no meat or fish",
    noun: "recipe",
  },
  {
    slug: "project",
    label: "A weekend project",
    description: "Long rises, several stages, worth it",
    noun: "recipe",
  },
  {
    slug: "drink",
    label: "A drink",
    description: "Cocktails, spritzes, tea and zero-proof",
    noun: "drink",
  },
];

export interface HomepageIntentConfig {
  slug: string;
  label: string;
  description: string;
  /** What the count line counts: "121 recipes", "217 drinks". */
  noun: string;
}

export interface HomepageIntent extends HomepageIntentConfig {
  count: number;
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
 * The tiles to show, in `HOMEPAGE_INTENTS` order, each with its count.
 *
 * Counts come from the hierarchy first (subtree totals) and then from the
 * flat vocabulary, which the route reads only when there is no hierarchy — so
 * a bare `quick` tag on a corpus with no records still gets its tile.
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
