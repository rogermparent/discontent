import type { TermTree } from "@discontent/cms/taxonomies/tree";
import { fold } from "../components/SearchForm/queryLanguage";
import { tagSlug } from "./tagSlug";

/**
 * Hierarchy-aware `tag:` (epic 31, 31b — `agent-taxonomy.md` 24-D6).
 *
 * `tag:dessert` finds the recipes tagged `dessert` **and** every recipe tagged
 * with a term under it — `cookies`, and `linzer-cookies` under that — because
 * the tree says a linzer cookie is a dessert even when no recipe says so.
 *
 * Pure, and shared by every caller so they cannot disagree: the browser's
 * `SearchContext` (from `/search/terms`), `/make`'s scope, and the curation
 * layer's `recipe_search` and `list --tag` (from the tree aggregate, read
 * Node-safe). Matching a carried tag to a term uses `subtreeUsage`'s folding
 * (`MakePage/tagTree.ts`): by folded slug or folded label, since content
 * stores tags as slugs but a label spelling must not drop a recipe.
 */

/** A term's place in the hierarchy: all the expansion needs. */
export interface TermNode {
  slug: string;
  label: string;
  parent?: string;
}

export interface TermResolver {
  /**
   * The folded spellings — slug and label — of the term `value` names and of
   * every term under it, or `undefined` when `value` names no term (the caller
   * then keeps its plain prefix match). A leaf term still answers, with its
   * own two spellings: a record labelled "Christmas Cookies" over carriers
   * tagged `christmas-cookies` must match by either.
   * `value` is already folded, as the query parser leaves it.
   */
  expandTerm(field: "tag", value: string): ReadonlySet<string> | undefined;
}

export function buildTagExpansion(
  terms: ReadonlyArray<TermNode>,
): TermResolver {
  const bySpelling = new Map<string, string>();
  const nodes = new Map<string, TermNode>();
  const children = new Map<string, string[]>();
  for (const term of terms) {
    nodes.set(term.slug, term);
    bySpelling.set(fold(term.label).trim(), term.slug);
    bySpelling.set(fold(term.slug), term.slug);
  }
  for (const term of terms) {
    /* A term is never its own child (24-T8), even when a hand edit says so. */
    if (!term.parent || term.parent === term.slug) continue;
    const list = children.get(term.parent);
    if (list) list.push(term.slug);
    else children.set(term.parent, [term.slug]);
  }

  const cache = new Map<string, ReadonlySet<string> | undefined>();

  function expand(value: string): ReadonlySet<string> | undefined {
    const root = bySpelling.get(value.trim()) ?? bySpelling.get(tagSlug(value));
    if (!root) return undefined;
    const spellings = new Set<string>();
    /* Visited-set walk: a hand-edited cycle terminates, as the tree's does. */
    const seen = new Set<string>();
    const stack = [root];
    while (stack.length > 0) {
      const slug = stack.pop() as string;
      if (seen.has(slug)) continue;
      seen.add(slug);
      spellings.add(fold(slug));
      const node = nodes.get(slug);
      if (node) spellings.add(fold(node.label).trim());
      stack.push(...(children.get(slug) ?? []));
    }
    return spellings;
  }

  return {
    expandTerm(field, value) {
      if (field !== "tag") return undefined;
      if (!cache.has(value)) cache.set(value, expand(value));
      return cache.get(value);
    },
  };
}

/** The same expansion from the stored tree aggregate (the Node-safe read). */
export function buildTagExpansionFromTree(
  tree: TermTree | null | undefined,
): TermResolver {
  return buildTagExpansion(
    Object.entries(tree ?? {}).map(([slug, node]) => ({
      slug,
      label: node.label,
      ...(node.parent ? { parent: node.parent } : {}),
    })),
  );
}
