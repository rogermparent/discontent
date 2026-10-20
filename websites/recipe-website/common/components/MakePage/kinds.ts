import {
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

/**
 * `/make`'s temporary scope (43q): one pattern item per `?with=`, which an
 * editor's Ask fills in and only the editor's route reads. Never on a list.
 */
export const MAKE_SCOPE_PARAM = "with";

/**
 * The question an editor's Ask filled `/make` in from (43q, `?ask=`). A new
 * value is a new Ask, which resets the page's typed query and its temporary
 * scope; the value going away (Dismiss) changes nothing (Dq13).
 */
export const MAKE_ASK_PARAM = "ask";

// --- featured ingredients (41h) ---------------------------------------------

/**
 * The name a label features (41h review): its words without a
 * parenthetical, as `parseInventoryItem` splits an item — "aperitif
 * (Gnista)" features "aperitif". A label that is all parenthetical keeps it.
 */
export function featureName(label: string): string {
  const outside = label
    .replace(/\([^()]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return outside || label.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

/** The key two spellings of a featured ingredient share. */
export function featureKey(name: string): string {
  return fold(featureName(name)).replace(/\s+/g, " ").trim();
}

/**
 * A positive `ingredient:` term ANDed at the top: a featured ingredient,
 * spelled as the query has it ("St-Germain", not the parser's folded
 * "st-germain"), so the question shows the label as typed.
 */
function featureValue(query: string, term: FilterTerm): string | undefined {
  if (term.negated || term.node.type !== "text") return undefined;
  if (term.node.field !== "ingredient") return undefined;
  const folded = term.node.value.replace(/\s+/g, " ").trim();
  const raw = query
    .slice(term.node.start, term.node.end)
    .replace(/^-?\s*[a-z]+:/i, "")
    .replace(/^"([^"]*)"$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return raw && fold(raw).trim() === folded ? raw : folded;
}

/**
 * The featured ingredients a query carries (41h): its top-level positive
 * `ingredient:` terms, as typed, once each, in order. Typing
 * `ingredient:lime` in the field features lime, and featuring writes the
 * same term — the query stays the one source of truth, and a URL shares it.
 * Like a kind, a term inside an OR is the person's choice, not a feature.
 *
 * On `/make` a feature is judged by the matcher, not by the search
 * language's word-prefix rule (Dh7): `scopeRecipes` gets the query
 * `withoutFeatures`, and `featureScope` keeps the recipes a feature meets.
 */
export function featuredOfQuery(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of topLevelTerms(query)) {
    const value = featureValue(query, term);
    const key = value && featureKey(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** An operator left dangling at the end: `tag:a OR`, `tag:a and`, `-`. */
const DANGLING = /(?:^|\s)(?:OR|AND|NOT|-)\s*$/i;

/**
 * `query` with `name` featured: an `ingredient:` term ANDed at the end —
 * the label's name without a parenthetical (`featureName`).
 */
export function withFeature(query: string, name: string): string {
  const value = featureName(name);
  const key = featureKey(value);
  if (!key) return query;
  if (featuredOfQuery(query).some((had) => featureKey(had) === key)) {
    return query;
  }
  let base = query.trim();
  for (let guard = 0; guard < 5 && DANGLING.test(base); guard++) {
    base = base.replace(DANGLING, "").trim();
  }
  /* `tag:a OR tag:b ingredient:lime` would bind lime to `tag:b` alone. */
  if (base && parseQuery(base).filter?.type === "or") base = `(${base})`;
  const term = `ingredient:${quoteQueryValue(value)}`;
  return base ? `${base} ${term}` : term;
}

/** `query` with every top-level feature spelled like `name` taken out. */
export function withoutFeature(query: string, name: string): string {
  const key = featureKey(name);
  /* By the folded value: `removeTopLevel` hands over terms of the query
   * as it shrinks, so a span of the original would be stale. */
  return removeTopLevel(
    query,
    (term) =>
      !term.negated &&
      term.node.type === "text" &&
      term.node.field === "ingredient" &&
      featureKey(term.node.value) === key,
  );
}

/**
 * `query` without any feature: what `scopeRecipes` reads on `/make`, where
 * the features narrow through the matcher instead (`featureScope`).
 */
export function withoutFeatures(query: string): string {
  if (featuredOfQuery(query).length === 0) return query;
  return removeTopLevel(
    query,
    (term) =>
      !term.negated &&
      term.node.type === "text" &&
      term.node.field === "ingredient",
  );
}

/**
 * Is `item`, an ingredient label on the page, featured? By its own name
 * only (41h review): with gin featured, "ginger beer" and "non-alcoholic
 * gin" are not — `aria-pressed` says exactly what a tap would undo.
 */
export function isFeatured(item: string, featured: string[]): boolean {
  const key = featureKey(item);
  return !!key && featured.some((name) => featureKey(name) === key);
}

/** A label's tap (41h): un-feature it if it is featured, else feature it. */
export function toggleFeature(query: string, item: string): string {
  return isFeatured(item, featuredOfQuery(query))
    ? withoutFeature(query, item)
    : withFeature(query, item);
}
