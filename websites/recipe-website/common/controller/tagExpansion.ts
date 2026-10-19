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
 *
 * **Aliases (32i, D5)** are a term's other spellings, and search-only: nothing
 * rewrites a carrier's tag to the canonical term. So an alias works both ways
 * here. `tag:<alias>` expands exactly as `tag:<term>` does (the term and its
 * subtree), and the alias's own spellings join the expansion, so a recipe
 * still tagged with an alias — the old slug of a merged term, or a synonym
 * someone typed — is found by `tag:<term>` too.
 *
 * Which spelling wins a clash: **a record's own slug and label beat any
 * alias**, and **an alias beats a carried-only term**. A record's label is a
 * curator's name for that term, so another term's alias must never take it
 * over (`tag:"Biscuits"` keeps finding the record labelled "Biscuits"). A
 * carried-only term spelled like an alias is what a stray carrier creates
 * when it uses the alias as a tag after it was recorded — nothing
 * canonicalises (D5) — and it should not split the aliased term in two. The
 * seat refuses both clashes at write time; this is the defence for what is
 * on disk anyway.
 */

/** A term's place in the hierarchy: all the expansion needs. */
export interface TermNode {
  slug: string;
  label: string;
  parent?: string;
  /** Other spellings of this term (32i). */
  aliases?: ReadonlyArray<string>;
  /**
   * The term has a record (32i). Its own slug and label then beat any other
   * term's alias; a carried-only term's spellings do not.
   */
  record?: boolean;
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

/**
 * The spelling → term map `tag:` resolves by, with the precedence above: a
 * record's own slug and label first, then aliases, then carried-only terms.
 * Shared by `buildTagExpansion` and `buildTermLookup`, so a tag counted under
 * a term (43f's facets) is the tag `tag:<term>` finds.
 */
function spellingIndex(terms: ReadonlyArray<TermNode>) {
  const bySpelling = new Map<string, string>();
  const nodes = new Map<string, TermNode>();
  /* A record's own spellings, which no other term's alias may take. */
  const claimed = new Map<string, string>();
  for (const term of terms) {
    nodes.set(term.slug, term);
    bySpelling.set(fold(term.label).trim(), term.slug);
    bySpelling.set(fold(term.slug), term.slug);
    if (term.record) {
      claimed.set(fold(term.label).trim(), term.slug);
      claimed.set(fold(term.slug), term.slug);
    }
  }
  /* An alias spelling this term may use: not another record's own. */
  const ownAliasSpellings = (term: TermNode): string[] =>
    aliasSpellings(term).filter((spelling) => {
      const owner = claimed.get(spelling);
      return owner === undefined || owner === term.slug;
    });
  /* After every term, so an alias beats a carried-only term's spelling. */
  for (const term of terms) {
    for (const spelling of ownAliasSpellings(term)) {
      if (spelling !== fold(term.slug)) bySpelling.set(spelling, term.slug);
    }
  }
  /* `value` already folded, as the query parser leaves it. */
  const resolve = (value: string): string | undefined =>
    bySpelling.get(value.trim()) ?? bySpelling.get(tagSlug(value));
  return { nodes, ownAliasSpellings, resolve };
}

/**
 * The term a carried tag (or a `tag:` operand) names — its slug — or
 * `undefined` when it names none: "bean salads", `bean-salads` and an alias
 * of the record all answer `bean-salads`. The exact lookup `tag:` starts its
 * expansion from (43f).
 */
export function buildTermLookup(
  terms: ReadonlyArray<TermNode>,
): (tag: string) => string | undefined {
  const { resolve } = spellingIndex(terms);
  return (tag) => resolve(fold(tag));
}

export function buildTagExpansion(
  terms: ReadonlyArray<TermNode>,
): TermResolver {
  const { nodes, ownAliasSpellings, resolve } = spellingIndex(terms);
  const children = new Map<string, string[]>();
  for (const term of terms) {
    /* A term is never its own child (24-T8), even when a hand edit says so. */
    if (!term.parent || term.parent === term.slug) continue;
    const list = children.get(term.parent);
    if (list) list.push(term.slug);
    else children.set(term.parent, [term.slug]);
  }

  const cache = new Map<string, ReadonlySet<string> | undefined>();

  function expand(value: string): ReadonlySet<string> | undefined {
    const root = resolve(value);
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
      if (node) {
        spellings.add(fold(node.label).trim());
        for (const spelling of ownAliasSpellings(node)) spellings.add(spelling);
      }
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

/**
 * An alias's folded spellings: as typed and as its slug, the two ways a
 * carrier can spell it ("Christmas Biscuits", `christmas-biscuits`).
 */
function aliasSpellings(term: TermNode): string[] {
  const spellings: string[] = [];
  for (const alias of term.aliases ?? []) {
    const typed = fold(alias).trim();
    if (typed) spellings.push(typed);
    const slug = fold(tagSlug(alias));
    if (slug && slug !== typed) spellings.push(slug);
  }
  return spellings;
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
      ...(node.aliases?.length ? { aliases: node.aliases } : {}),
      record: true,
    })),
  );
}
