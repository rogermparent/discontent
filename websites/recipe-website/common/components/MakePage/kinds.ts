import {
  fieldMatches,
  filterTerms,
  fold,
  parseQuery,
  quoteQueryValue,
  removeTermAt,
  type FilterNode,
  type FilterTerm,
} from "../SearchForm/queryLanguage";

/**
 * `/make`'s kind switch (32j): anything / food / drinks — since 41h the word
 * in the page's question ("What **drinks** can I make?"), a menu.
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
  /**
   * The word the page's question uses (41h): "What **drinks** can I make?" —
   * plural, and `one` for a count of one ("1 drink").
   */
  word: string;
  one: string;
  /** Top-level terms only (ANDed): `tag:drink`, `-tag:drink`, or nothing. */
  query: string;
}

export const MAKE_KINDS: MakeKind[] = [
  { id: "any", label: "Anything", word: "recipes", one: "recipe", query: "" },
  {
    id: "food",
    label: "Food",
    word: "dishes",
    one: "dish",
    query: "-tag:drink",
  },
  {
    id: "drinks",
    label: "Drinks",
    word: "drinks",
    one: "drink",
    query: "tag:drink",
  },
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
 * front, and everything else — free text, and the tag picks — stays.
 *
 * `keepTag` (32j review) is asked about each top-level tag pick: answer
 * false to drop one with nothing under the new kind, so Drinks → Food
 * doesn't land on `-tag:drink tag:sour`, an empty scope.
 */
export function withKind(
  query: string,
  kind: MakeKind,
  kinds: MakeKind[] = MAKE_KINDS,
  keepTag?: (tag: string, kind: MakeKind) => boolean,
): string {
  const kindTerms = kinds.flatMap((each) => topLevelTerms(each.query));
  const isKindTerm = (term: FilterTerm) =>
    kindTerms.some((kindTerm) => sameTerm(term, kindTerm));
  let rest = removeTopLevel(
    query,
    (term) =>
      isKindTerm(term) ||
      (!!keepTag &&
        !term.negated &&
        term.node.type === "text" &&
        term.node.field === "tag" &&
        !keepTag(term.node.value, kind)),
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

// --- featured ingredients (41h) ---------------------------------------------

/** The key two spellings of a featured ingredient share. */
export function featureKey(name: string): string {
  return fold(name).replace(/\s+/g, " ").trim();
}

/** A positive `ingredient:` term ANDed at the top: a featured ingredient. */
function featureValue(term: FilterTerm): string | undefined {
  if (term.negated || term.node.type !== "text") return undefined;
  if (term.node.field !== "ingredient") return undefined;
  return term.node.value.replace(/\s+/g, " ").trim();
}

/**
 * The featured ingredients a query carries (41h): its top-level positive
 * `ingredient:` terms, as typed, once each, in order. Typing
 * `ingredient:lime` in the field features lime, and featuring writes the
 * same term — the query stays the one source of truth, and a URL shares it.
 * Like a kind, a term inside an OR is the person's choice, not a feature.
 */
export function featuredOfQuery(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of topLevelTerms(query)) {
    const value = featureValue(term);
    const key = value && featureKey(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** `query` with `name` featured: an `ingredient:` term at the end. */
export function withFeature(query: string, name: string): string {
  const value = name.replace(/\s+/g, " ").trim();
  const key = featureKey(value);
  if (!key) return query;
  if (featuredOfQuery(query).some((had) => featureKey(had) === key)) {
    return query;
  }
  let base = query.trim();
  /* `tag:a OR tag:b ingredient:lime` would bind lime to `tag:b` alone. */
  if (base && parseQuery(base).filter?.type === "or") base = `(${base})`;
  const term = `ingredient:${quoteQueryValue(value)}`;
  return base ? `${base} ${term}` : term;
}

/** `query` with every top-level feature spelled like `name` taken out. */
export function withoutFeature(query: string, name: string): string {
  const key = featureKey(name);
  return removeTopLevel(query, (term) => {
    const value = featureValue(term);
    return value !== undefined && featureKey(value) === key;
  });
}

/**
 * The features that light up `item`, an ingredient label on the page: the
 * search language's own rule, so under `ingredient:lime` — which matches a
 * line with a word starting "lime" — the label "lime juice" reads as
 * featured too.
 */
export function featuredBy(item: string, featured: string[]): string[] {
  return featured.filter((name) => fieldMatches(item, featureKey(name)));
}

/** A label's tap (41h): un-feature whatever lights it up, or feature it. */
export function toggleFeature(query: string, item: string): string {
  const by = featuredBy(item, featuredOfQuery(query));
  if (by.length === 0) return withFeature(query, item);
  return by.reduce((current, name) => withoutFeature(current, name), query);
}
