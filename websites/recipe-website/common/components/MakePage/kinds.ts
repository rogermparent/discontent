import {
  filterTerms,
  fold,
  parseQuery,
  removeTermAt,
  type FilterNode,
  type FilterTerm,
} from "../SearchForm/queryLanguage";

/**
 * `/make`'s kind switch (32j): Anything / Food / Drinks above the tag chips.
 *
 * Site config, not engine: each kind is a scope in the search language,
 * composed with the tag picks in the page's own `?q=`, so a kind is never
 * state beside the query — the query says it, and the switch reads it back.
 * Food is "not a drink" because the drink tree is the only kind vocabulary
 * the corpus has; a food vocabulary (32k) would only change this list.
 */
export interface MakeKind {
  id: string;
  label: string;
  /** Top-level terms only (ANDed): `tag:drink`, `-tag:drink`, or nothing. */
  query: string;
}

export const MAKE_KINDS: MakeKind[] = [
  { id: "any", label: "Anything", query: "" },
  { id: "food", label: "Food", query: "-tag:drink" },
  { id: "drinks", label: "Drinks", query: "tag:drink" },
];

/** The leaves ANDed at the top of a filter — what a kind may add or read. */
function topLevelLeaves(filter?: FilterNode): Set<FilterNode> {
  const leaves = new Set<FilterNode>();
  const add = (node: FilterNode) => {
    if (node.type === "not") {
      if (node.child.type !== "and" && node.child.type !== "or") {
        leaves.add(node.child);
      }
    } else if (node.type !== "and" && node.type !== "or") {
      leaves.add(node);
    }
  };
  if (!filter) return leaves;
  if (filter.type === "and") filter.children.forEach(add);
  else add(filter);
  return leaves;
}

function topLevelTerms(query: string): FilterTerm[] {
  const { filter } = parseQuery(query);
  const leaves = topLevelLeaves(filter);
  return filterTerms(filter).filter((term) => leaves.has(term.node));
}

/** Two terms say the same: same field, folded value and sign. */
function sameTerm(a: FilterTerm, b: FilterTerm): boolean {
  return (
    a.negated === b.negated &&
    a.node.type === "text" &&
    b.node.type === "text" &&
    a.node.field === b.node.field &&
    fold(a.node.value).trim() === fold(b.node.value).trim()
  );
}

/**
 * Which kind a query is in: the kind whose every term the query carries at
 * its top level (the most specific, if several), else the one with no terms.
 */
export function kindOfQuery(
  query: string,
  kinds: MakeKind[] = MAKE_KINDS,
): MakeKind | undefined {
  const terms = topLevelTerms(query);
  let best: { kind: MakeKind; size: number } | undefined;
  for (const kind of kinds) {
    const wanted = topLevelTerms(kind.query);
    if (!wanted.every((term) => terms.some((had) => sameTerm(had, term)))) {
      continue;
    }
    if (!best || wanted.length > best.size) {
      best = { kind, size: wanted.length };
    }
  }
  return best?.kind;
}

/** Remove, one at a time, every top-level term `doomed` picks. */
function removeTopLevel(
  query: string,
  doomed: (term: FilterTerm) => boolean,
): string {
  let current = query;
  for (let guard = 0; guard < 50; guard++) {
    const term = topLevelTerms(current).find(doomed);
    if (!term) break;
    const next = removeTermAt(current, term);
    if (next === current) break;
    current = next;
  }
  return current.trim();
}

/**
 * `query` switched to `kind`: every kind's terms come out, `kind`'s go in
 * front, and everything else — tag picks, free text — stays.
 */
export function withKind(
  query: string,
  kind: MakeKind,
  kinds: MakeKind[] = MAKE_KINDS,
): string {
  const kindTerms = kinds.flatMap((each) => topLevelTerms(each.query));
  let rest = removeTopLevel(query, (term) =>
    kindTerms.some((kindTerm) => sameTerm(term, kindTerm)),
  );
  /* `-tag:drink a OR b` would bind the kind to `a` alone. */
  if (rest && parseQuery(rest).filter?.type === "or") rest = `(${rest})`;
  return [kind.query, rest].filter(Boolean).join(" ");
}

/**
 * `query` without its tag picks — the positive `tag:` terms that aren't a
 * kind's — so the top-level chips can stay put while the picks drill down.
 */
export function withoutTagPicks(
  query: string,
  kinds: MakeKind[] = MAKE_KINDS,
): string {
  const kindTerms = kinds.flatMap((each) => topLevelTerms(each.query));
  return removeTopLevel(
    query,
    (term) =>
      !term.negated &&
      term.node.type === "text" &&
      term.node.field === "tag" &&
      !kindTerms.some((kindTerm) => sameTerm(term, kindTerm)),
  );
}
