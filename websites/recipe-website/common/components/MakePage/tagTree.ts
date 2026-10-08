import type { TagOption } from "../../controller/tagVocabulary";
import { fold, type FilterableRecipe } from "../SearchForm/queryLanguage";

/**
 * The tag tree as `/make` reads it (epic 28, 28g): pure functions over the
 * vocabulary the route passes in and the recipes in scope.
 *
 * A recipe *uses* a term when it carries the term or anything under it, so a
 * root's number is how many recipes in scope sit anywhere in its subtree —
 * the same reading `/tags/<slug>` gives a parent. Matching a carried tag to a
 * term is by folded slug or label: content stores tags as slugs, but a label
 * spelling must not make a recipe vanish from the counts.
 */

export interface TagNode extends TagOption {
  /** Direct children, in vocabulary order. */
  children: string[];
}

export type TagIndex = Map<string, TagNode>;

export function buildTagIndex(options: TagOption[]): TagIndex {
  const index: TagIndex = new Map(
    options.map((option) => [option.slug, { ...option, children: [] }]),
  );
  for (const node of index.values()) {
    if (node.parent) index.get(node.parent)?.children.push(node.slug);
  }
  return index;
}

/** Root first, `slug` last. Bounded, in case the index was built by hand. */
export function breadcrumb(index: TagIndex, slug: string): TagNode[] {
  const trail: TagNode[] = [];
  const seen = new Set<string>();
  let current: string | undefined = slug;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = index.get(current);
    if (!node) break;
    trail.push(node);
    current = node.parent;
  }
  return trail.reverse();
}

/**
 * How many of `recipes` sit in each term's subtree. A recipe counts once per
 * term however many of that term's descendants it carries.
 */
export function subtreeUsage(
  recipes: FilterableRecipe[],
  index: TagIndex,
): Map<string, number> {
  const bySpelling = new Map<string, string>();
  for (const node of index.values()) {
    bySpelling.set(fold(node.label), node.slug);
    bySpelling.set(fold(node.slug), node.slug);
  }
  const usage = new Map<string, number>();
  for (const recipe of recipes) {
    const reached = new Set<string>();
    for (const tag of recipe.tags ?? []) {
      const slug = bySpelling.get(fold(tag).trim());
      if (!slug) continue;
      for (const node of breadcrumb(index, slug)) reached.add(node.slug);
    }
    for (const slug of reached) usage.set(slug, (usage.get(slug) ?? 0) + 1);
  }
  return usage;
}

function byUse(usage: Map<string, number>, index: TagIndex) {
  return (a: string, b: string) =>
    (usage.get(b) ?? 0) - (usage.get(a) ?? 0) ||
    (index.get(a)?.label ?? a).localeCompare(index.get(b)?.label ?? b);
}

/**
 * The root chips: roots used in scope, most used first, at most `limit` —
 * plus any root that is selected or has a selected term under it, so a pick
 * never disappears from under the pointer.
 */
export function rootsInScope(
  index: TagIndex,
  usage: Map<string, number>,
  selected: Set<string>,
  limit: number,
): string[] {
  const roots = [...index.values()]
    .filter((node) => !node.parent)
    .map((node) => node.slug);
  const pinned = new Set(
    [...selected]
      .map((slug) => breadcrumb(index, slug)[0]?.slug)
      .filter((slug): slug is string => !!slug),
  );
  const used = roots
    .filter((slug) => (usage.get(slug) ?? 0) > 0)
    .sort(byUse(usage, index))
    .slice(0, limit);
  for (const slug of used) pinned.delete(slug);
  return [...used, ...[...pinned].sort(byUse(usage, index))];
}

/** A root's children used in scope (or selected), most used first. */
export function childrenInScope(
  index: TagIndex,
  usage: Map<string, number>,
  selected: Set<string>,
  root: string,
): string[] {
  return (index.get(root)?.children ?? [])
    .filter((slug) => (usage.get(slug) ?? 0) > 0 || selected.has(slug))
    .sort(byUse(usage, index));
}

/**
 * Tags whose slug or label contains every typed word, for the search box:
 * prefix matches first, then by use across the whole corpus.
 */
export function searchTags(
  index: TagIndex,
  corpusUsage: Map<string, number>,
  text: string,
  limit: number,
): TagNode[] {
  const words = fold(text)
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  const hits: { node: TagNode; prefix: boolean }[] = [];
  for (const node of index.values()) {
    if ((corpusUsage.get(node.slug) ?? 0) === 0) continue;
    const hay = `${fold(node.label)} ${fold(node.slug)}`;
    if (!words.every((word) => hay.includes(word))) continue;
    const first = words[0];
    hits.push({
      node,
      prefix: fold(node.label).startsWith(first) || node.slug.startsWith(first),
    });
  }
  return hits
    .sort(
      (a, b) =>
        Number(b.prefix) - Number(a.prefix) ||
        byUse(corpusUsage, index)(a.node.slug, b.node.slug),
    )
    .slice(0, limit)
    .map((hit) => hit.node);
}
