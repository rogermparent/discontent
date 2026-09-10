/**
 * The search query language.
 *
 * One field is the whole filter UI. A query mixes **free text** — bare words,
 * handed to FlexSearch exactly as before, so PR 19's native field-priority
 * ranking survives — with **typed terms** that form a small boolean AST
 * evaluated in JS over whatever the engine returned:
 *
 *     tag:chinese (ingredient:beef OR ingredient:pork)
 *     chocolate cake tag:dessert -tag:baked time:<30 before:2026-01-01
 *
 * Two rules shape everything below:
 *
 *  1. **An unknown prefix is not an error.** `foo:bar` is free text, so a colon
 *     typed in an ordinary search never traps the user in a filter they didn't
 *     ask for.
 *  2. **Nothing here throws.** This runs on every keystroke against half-typed
 *     input — `tag:`, `(ingredient:beef OR`, `time:<` — and a parse failure that
 *     blanked the results would be worse than any misreading. Fragments that
 *     don't resolve are dropped, and the rest of the query still works.
 */

import { tagSlug } from "../../controller/tagSlug";

/** Fields an operator may bind. Anything else is free text (rule 1). */
export const FILTER_FIELDS = [
  "tag",
  "ingredient",
  "name",
  "description",
  "group",
  "time",
  "before",
  "after",
] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];

/**
 * The pseudo-field a *negated bare word* binds to. `-chocolate` has to mean
 * something — free text can't express exclusion, and silently searching *for*
 * chocolate would be the opposite of what was typed — so it becomes "no field
 * mentions chocolate".
 */
export type MatchField = FilterField | "any";

export type ComparisonOperator = "<" | "<=" | ">" | ">=";

/** Fields whose operand is matched as text; `value` is always pre-folded. */
export type TextMatchField = Exclude<MatchField, "time" | "before" | "after">;

/**
 * Where a leaf came from in the raw query — `raw.slice(start, end)` is the atom
 * exactly as it was typed, leading `-` and quotes included.
 *
 * **Only the leaves carry it, and that is the point.** A chip has to render the
 * text the user typed and rewrite it in place, and neither is derivable from the
 * leaf's payload: `value` is pre-folded (`tag:Crème` is held as `creme`), and
 * matching by value cannot tell "this chip" from "a chip that looks like it"
 * when a query names the same term twice. The tokenizer has always recorded
 * these; until PR 21b `termNode` simply dropped them on the floor.
 *
 * The cost, stated plainly: two leaves for the same term are no longer `toEqual`
 * each other, so AST equality is position-sensitive. Nothing evaluates on it —
 * `matchesFilter` ignores these fields — but the unit tests compare parsed
 * filters as values and go through a `spanless()` helper because of it.
 */
export interface QuerySpan {
  start: number;
  end: number;
}

export type FilterNode =
  | ({ type: "text"; field: TextMatchField; value: string } & QuerySpan)
  | ({ type: "time"; op: ComparisonOperator; minutes: number } & QuerySpan)
  | ({ type: "date"; field: "before" | "after"; timestamp: number } & QuerySpan)
  | { type: "not"; child: FilterNode }
  | { type: "and"; children: FilterNode[] }
  | { type: "or"; children: FilterNode[] };

export type TextFilterNode = Extract<FilterNode, { type: "text" }>;

/** The three variants that stand for something the user typed. */
export type FilterLeafNode = Extract<
  FilterNode,
  { type: "text" | "time" | "date" }
>;

export interface ParsedQuery {
  /** The free-text remainder, handed to FlexSearch. */
  text: string;
  /** The filter AST, or `undefined` when the query is plain text. */
  filter?: FilterNode;
  /**
   * True once the query uses anything beyond bare words — a typed term, a
   * negation, an explicit AND/OR, or a parenthesis. PR 21b's chip preview keys
   * off this so it stays out of the way of an ordinary search.
   */
  hasAdvancedSyntax: boolean;
}

/**
 * Fold text for matching: lowercase and diacritic-stripped, mirroring what
 * FlexSearch's default encoder does to the corpus — so `tag:creme` matches
 * `Crème` for the same reason a plain "creme" search finds it.
 *
 * For precomposed (NFC) text — what content files carry — this is
 * length-preserving (é → e + ◌́ → e, one char in, one char out), which
 * `highlightText` relies on to slice at a prefix offset. It checks that anyway.
 */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// --- tokenizer -------------------------------------------------------------

type TokenKind = "lparen" | "rparen" | "and" | "or" | "not" | "term" | "text";

interface Token {
  kind: TokenKind;
  /** Offsets into the raw query, so the rewrite helpers can splice precisely. */
  start: number;
  end: number;
  /** Set on `term`/`text`: the atom carried a leading `-`. */
  negated: boolean;
  /** Set on `term`. */
  field?: FilterField;
  /** Set on `term` (the operand) and `text` (the word, unquoted). */
  value: string;
}

const FIELD_SET = new Set<string>(FILTER_FIELDS);

function isFilterField(name: string): name is FilterField {
  return FIELD_SET.has(name);
}

/**
 * Split a raw query into tokens. Quotes suspend the usual delimiters, so
 * `tag:"slow cooker"` is one term; an unterminated quote simply runs to the end
 * of the input rather than failing (rule 2 — this is what half-typed looks like).
 */
function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({
        kind: char === "(" ? "lparen" : "rparen",
        start: i,
        end: i + 1,
        negated: false,
        value: char,
      });
      i += 1;
      continue;
    }

    const start = i;
    let negated = false;
    // A lone "-" is punctuation, not a negation; and an interior hyphen
    // ("slow-cooked") never reaches here because we only look at position 0.
    if (char === "-" && i + 1 < raw.length && !/[\s()]/.test(raw[i + 1])) {
      negated = true;
      i += 1;
    }

    // Read the atom, stripping quotes as we go. `firstColon` records the first
    // colon seen *outside* quotes — a quoted colon (`"name: the sequel"`) is
    // content, not an operator.
    let text = "";
    let firstColon = -1;
    while (i < raw.length) {
      const c = raw[i];
      if (c === '"') {
        i += 1;
        while (i < raw.length && raw[i] !== '"') text += raw[i++];
        if (i < raw.length) i += 1; // closing quote
        continue;
      }
      if (/[\s()]/.test(c)) break;
      if (c === ":" && firstColon === -1) firstColon = text.length;
      text += c;
      i += 1;
    }
    const end = i;

    if (!text) {
      // A bare "-" or a lone pair of quotes: nothing to bind.
      continue;
    }

    const upper = text.toUpperCase();
    if (!negated && (upper === "AND" || upper === "OR" || upper === "NOT")) {
      tokens.push({
        kind: upper === "AND" ? "and" : upper === "OR" ? "or" : "not",
        start,
        end,
        negated: false,
        value: upper,
      });
      continue;
    }

    if (firstColon > 0) {
      const field = text.slice(0, firstColon).toLowerCase();
      const value = text.slice(firstColon + 1);
      if (isFilterField(field)) {
        // A known field with no operand yet — `tag:` the instant before the
        // value is typed. Dropped outright rather than passed on as free text,
        // which would search the corpus for the literal word "tag" and blank a
        // page that was about to be filtered (rule 2).
        if (!value) continue;
        tokens.push({ kind: "term", start, end, negated, field, value });
        continue;
      }
      // An unknown prefix is not an error (rule 1): the whole atom, colon
      // included, is free text.
    }

    tokens.push({ kind: "text", start, end, negated, value: text });
  }

  return tokens;
}

// --- parser ----------------------------------------------------------------

function and(left: FilterNode | undefined, right: FilterNode | undefined) {
  if (!left) return right;
  if (!right) return left;
  const children =
    left.type === "and" ? [...left.children, right] : [left, right];
  return { type: "and" as const, children };
}

/**
 * OR, with unconstrained operands dropped rather than absorbing the expression.
 * `(tag:dessert OR chocolate)` mixes a filter with free text, and free text is
 * already applied upstream by the engine — so the only operand that can be
 * *evaluated* here is the tag. Reading it as "no constraint" (the strictly
 * logical alternative) would silently widen the query to the whole corpus,
 * which is never what the typist meant.
 */
function or(left: FilterNode | undefined, right: FilterNode | undefined) {
  if (!left) return right;
  if (!right) return left;
  const children =
    left.type === "or" ? [...left.children, right] : [left, right];
  return { type: "or" as const, children };
}

interface ParserState {
  tokens: Token[];
  pos: number;
}

/**
 * A `time:` operand: an optional comparison and a duration. Shared with
 * `cycleTermAt`, which has to read back the operator it is advancing — two copies
 * of this would be two places for "what counts as a duration" to drift.
 */
const TIME_OPERAND = /^(<=|>=|<|>)?\s*(\d+(?:\.\d+)?)$/;

function termNode(token: Token): FilterNode | undefined {
  // The only construction site for a leaf, which is why threading the span
  // through here is the whole of PR 21b's propagation work.
  const { field, value, start, end } = token;
  if (field === "time") {
    const match = TIME_OPERAND.exec(value);
    // `time:<` mid-keystroke, or `time:soon` — drop the fragment, keep the query.
    if (!match) return undefined;
    // A bare `time:30` reads as "thirty minutes or less"; an exact-equality
    // match on a duration would be true of almost nothing.
    const op = (match[1] ?? "<=") as ComparisonOperator;
    return { type: "time", op, minutes: Number(match[2]), start, end };
  }
  if (field === "before" || field === "after") {
    const timestamp = parseDateValue(value);
    if (timestamp === undefined) return undefined;
    return { type: "date", field, timestamp, start, end };
  }
  const folded = fold(value).trim();
  if (!folded) return undefined;
  return {
    type: "text",
    field: field as TextMatchField,
    value: folded,
    start,
    end,
  };
}

/** `YYYY-MM-DD` at local midnight, so a boundary means what the date column shows. */
function parseDateValue(value: string): number | undefined {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const time = new Date(year, month - 1, day).getTime();
  return Number.isNaN(time) ? undefined : time;
}

function parsePrimary(state: ParserState): FilterNode | undefined {
  const token = state.tokens[state.pos];
  if (!token) return undefined;
  state.pos += 1;

  switch (token.kind) {
    case "not": {
      const child = parsePrimary(state);
      return child ? { type: "not", child } : undefined;
    }
    case "lparen": {
      const inner = parseOr(state);
      if (state.tokens[state.pos]?.kind === "rparen") state.pos += 1;
      return inner;
    }
    // A stray `)`, or an `AND`/`OR` with nothing on its left: consumed and
    // ignored, which is what a query being typed left-to-right looks like.
    case "rparen":
    case "and":
    case "or":
      return undefined;
    case "term": {
      const node = termNode(token);
      if (!node) return undefined;
      return token.negated ? { type: "not", child: node } : node;
    }
    case "text": {
      // Positive bare words are free text and never reach the AST; negated ones
      // must, because the engine has no way to express exclusion.
      if (!token.negated) return undefined;
      const folded = fold(token.value).trim();
      if (!folded) return undefined;
      const child: TextFilterNode = {
        type: "text",
        field: "any",
        value: folded,
        start: token.start,
        end: token.end,
      };
      return { type: "not", child };
    }
  }
}

function parseAnd(state: ParserState): FilterNode | undefined {
  let node = parsePrimary(state);
  while (state.pos < state.tokens.length) {
    const next = state.tokens[state.pos];
    if (next.kind === "rparen" || next.kind === "or") break;
    if (next.kind === "and") state.pos += 1; // explicit AND; otherwise implied
    if (state.pos >= state.tokens.length) break;
    if (state.tokens[state.pos].kind === "rparen") break;
    node = and(node, parsePrimary(state));
  }
  return node;
}

function parseOr(state: ParserState): FilterNode | undefined {
  let node = parseAnd(state);
  while (state.tokens[state.pos]?.kind === "or") {
    state.pos += 1;
    if (state.pos >= state.tokens.length) break; // trailing "OR" — still typing
    node = or(node, parseAnd(state));
  }
  return node;
}

/**
 * Split a raw query into the free text FlexSearch should run and the filter
 * evaluated over its results.
 */
export function parseQuery(raw: string): ParsedQuery {
  const tokens = tokenize(raw ?? "");
  const state: ParserState = { tokens, pos: 0 };

  let filter = parseOr(state);
  // Anything left after the top-level expression (an unbalanced `)`, say) is
  // parsed as a further implicit-AND clause rather than discarded wholesale.
  while (state.pos < tokens.length) {
    const before = state.pos;
    filter = and(filter, parseOr(state));
    if (state.pos === before) state.pos += 1; // never spin on an unconsumable token
  }

  const text = tokens
    .filter((token) => token.kind === "text" && !token.negated)
    .map((token) => token.value)
    .join(" ");

  const hasAdvancedSyntax = tokens.some(
    (token) => token.kind !== "text" || token.negated,
  );

  return { text, filter, hasAdvancedSyntax };
}

// --- evaluation ------------------------------------------------------------

/** The recipe shape the filter reads. Structurally `MassagedRecipeEntry`. */
export interface FilterableRecipe {
  name: string;
  date?: number;
  description?: string;
  ingredients?: string[];
  tags?: string[];
  /**
   * The groups this recipe belongs to — each membership contributing both the
   * group's slug and its name, so `group:weeknight-favourites` and
   * `group:weeknight` both find it (22f).
   *
   * Never carried by the corpus the server serves: `SearchContext` decorates
   * the fetched corpus from `/search/groups` before anything filters over it,
   * because group membership lives in the *groups* index and moves without the
   * recipe index moving at all.
   */
  groups?: string[];
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
}

/**
 * Does `haystack` contain `needle` (already folded) at a word start? Prefix
 * matching, not equality, mirrors the engine's `tokenize: "forward"` — so
 * `ingredient:choc` narrows live while it's being typed, the same way a plain
 * search does. A multi-word needle (`tag:"slow cooker"`) is matched as a
 * substring instead, since it spans the word boundaries we'd otherwise split on.
 */
export function fieldMatches(haystack: string, needle: string): boolean {
  const hay = fold(haystack);
  if (/\s/.test(needle)) return hay.includes(needle);
  if (hay.startsWith(needle)) return true;
  for (const word of hay.split(/[^\p{L}\p{N}]+/u)) {
    if (word && word.startsWith(needle)) return true;
  }
  return false;
}

function anyMatches(values: (string | undefined)[], needle: string): boolean {
  return values.some((value) => value && fieldMatches(value, needle));
}

/**
 * Total minutes for a recipe: `totalTime` when set, else prep + cook. Recipes
 * with no timing data at all match no `time:` query — "unknown" is not "fast".
 */
function recipeMinutes(recipe: FilterableRecipe): number | undefined {
  if (typeof recipe.totalTime === "number" && recipe.totalTime > 0) {
    return recipe.totalTime;
  }
  const sum = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
  return sum > 0 ? sum : undefined;
}

/** One day later at local midnight — DST-safe, unlike adding 86_400_000. */
function nextDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).getTime();
}

export function matchesFilter(
  recipe: FilterableRecipe,
  filter?: FilterNode,
): boolean {
  if (!filter) return true;

  switch (filter.type) {
    case "and":
      return filter.children.every((child) => matchesFilter(recipe, child));
    case "or":
      return filter.children.some((child) => matchesFilter(recipe, child));
    case "not":
      return !matchesFilter(recipe, filter.child);
    case "time": {
      const minutes = recipeMinutes(recipe);
      if (minutes === undefined) return false;
      switch (filter.op) {
        case "<":
          return minutes < filter.minutes;
        case "<=":
          return minutes <= filter.minutes;
        case ">":
          return minutes > filter.minutes;
        case ">=":
          return minutes >= filter.minutes;
      }
    }
    case "date": {
      if (typeof recipe.date !== "number") return false;
      // Both bounds exclude the named day, so `before:X` and `after:X` can't
      // both be true of the same recipe.
      return filter.field === "before"
        ? recipe.date < filter.timestamp
        : recipe.date >= nextDay(filter.timestamp);
    }
    case "text": {
      const { field, value } = filter;
      switch (field) {
        case "tag":
          return (recipe.tags ?? []).some((tag) => fieldMatches(tag, value));
        case "ingredient":
          return (recipe.ingredients ?? []).some((line) =>
            fieldMatches(line, value),
          );
        case "name":
          return fieldMatches(recipe.name, value);
        case "description":
          return anyMatches([recipe.description], value);
        case "group":
          return (recipe.groups ?? []).some((group) =>
            fieldMatches(group, value),
          );
        case "any":
          /*
           * Groups are deliberately absent here. `"any"` is what a *negated
           * bare word* binds to, and it reads the fields a plain search reads —
           * a recipe's own text. Membership is not that: `-weeknight` would
           * otherwise quietly drop every recipe in a collection called
           * "Weeknight Favourites", none of which mentions the word. Narrowing
           * by a group is something you type (`group:`), never something a bare
           * word does by itself.
           */
          return (
            anyMatches([recipe.name, recipe.description], value) ||
            (recipe.tags ?? []).some((tag) => fieldMatches(tag, value)) ||
            (recipe.ingredients ?? []).some((line) => fieldMatches(line, value))
          );
      }
    }
  }
}

// --- inspection ------------------------------------------------------------

/**
 * The tag values the query is *positively* filtering on, folded. Drives the
 * pressed state of every tag chip: `-tag:baked` is excluded deliberately —
 * an excluded tag isn't a selected one, so its chip must not read as pressed.
 */
export function positiveTagValues(filter?: FilterNode): string[] {
  const found: string[] = [];
  const walk = (node?: FilterNode) => {
    if (!node) return;
    switch (node.type) {
      case "and":
      case "or":
        node.children.forEach(walk);
        return;
      case "not":
        return; // do not descend: everything below is an exclusion
      case "text":
        if (node.field === "tag") found.push(node.value);
        return;
      default:
        return;
    }
  };
  walk(filter);
  return found;
}

/**
 * Does the filter read `field` anywhere — including under a negation?
 *
 * Drives the deferred `/search/ingredients` fetch (F4a): a filter-only query
 * like `ingredient:beef` needs the ingredients document even when the cached
 * FlexSearch index is current and nothing else would ask for it.
 *
 * **`"any"` counts as every field**, which is the whole reason this walks
 * rather than collecting typed terms. A negated bare word (`-chocolate`) binds
 * to `"any"`, and `matchesFilter` checks ingredients for it — so reporting
 * `false` for an `"any"` node would leave the ingredients unfetched and let
 * `-chocolate` quietly *keep* the recipes it is there to exclude.
 *
 * Unlike `positiveTagValues`, this descends into `not`: an exclusion still
 * reads the field it excludes on.
 */
export function filterUsesField(
  filter: FilterNode | undefined,
  field: MatchField,
): boolean {
  if (!filter) return false;
  switch (filter.type) {
    case "and":
    case "or":
      return filter.children.some((child) => filterUsesField(child, field));
    case "not":
      return filterUsesField(filter.child, field);
    case "text":
      return filter.field === field || filter.field === "any";
    case "time":
      return field === "time";
    case "date":
      return filter.field === field;
  }
}

/** How many leaf terms the filter carries — the ticker's "2 FILTERS" count. */
export function countFilterTerms(filter?: FilterNode): number {
  if (!filter) return 0;
  switch (filter.type) {
    case "and":
    case "or":
      return filter.children.reduce(
        (total, child) => total + countFilterTerms(child),
        0,
      );
    case "not":
      return countFilterTerms(filter.child);
    default:
      return 1;
  }
}

/**
 * One typed term as a chip surface sees it: the leaf, where it sits in the raw
 * query, and whether an enclosing `NOT` excludes it.
 *
 * `negated` is not on the leaf itself because negation is not a property of a
 * leaf — it is the `not` node above it, and `-tag:x` and `NOT tag:x` produce the
 * identical shape. The walk knows it for free, and a chip needs it: the span
 * renders `-tag:x` correctly on its own, but `NOT tag:x`'s span is just `tag:x`,
 * which would draw as an *include* chip for a term that excludes.
 */
export interface FilterTerm extends QuerySpan {
  node: FilterLeafNode;
  negated: boolean;
}

/**
 * The filter's leaf terms, in the order they were typed — `countFilterTerms`'s
 * walk with the leaves themselves as the accumulator instead of a tally.
 *
 * "In query order" is free rather than sorted for: `and`/`or` hold their
 * children in source order, so an in-order walk is source order.
 *
 * **Only terms that evaluate appear here**, which is the whole reason the chip
 * line reads the AST rather than the token stream. A half-typed `tag:` is
 * dropped by the tokenizer (judgement call (a)) and an OR's unconstrained
 * operand is dropped by the parser (judgement call (c)) — neither narrows
 * anything, so neither earns a chip that says it does.
 */
export function filterTerms(filter?: FilterNode): FilterTerm[] {
  const found: FilterTerm[] = [];
  const walk = (node: FilterNode | undefined, negated: boolean) => {
    if (!node) return;
    switch (node.type) {
      case "and":
      case "or":
        node.children.forEach((child) => walk(child, negated));
        return;
      case "not":
        walk(node.child, !negated);
        return;
      default:
        found.push({
          node,
          negated,
          start: node.start,
          end: node.end,
        });
    }
  };
  walk(filter, false);
  return found;
}

/** The atom exactly as typed — what a chip must display. */
export function termText(raw: string, term: QuerySpan): string {
  return raw.slice(term.start, term.end);
}

// --- rewriting -------------------------------------------------------------

/** Quote a value that would otherwise tokenize as several atoms. */
export function quoteQueryValue(value: string): string {
  const cleaned = value.replace(/"/g, "");
  return /[\s()":]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/**
 * The canonical link for a tag — used by every deep link into one.
 *
 * Points at the pre-baked `/tags/<slug>` page since F8. It used to be
 * `/search?q=tag:<tag>`, which needed the client search bundle and the whole
 * corpus to render anything and could not be indexed. Repointing one function
 * moved every tag chip in the app: the recipe detail page, the list cards and
 * the homepage's browse row.
 *
 * `tagSlug`, not `quoteQueryValue`: the destination is a path segment now, not
 * a query atom.
 */
export function tagSearchHref(tag: string): string {
  return `/tags/${tagSlug(tag)}`;
}

/**
 * The canonical "search inside this group" link — a `?q=` query, not a path.
 *
 * Unlike `tagSearchHref` this stays on `/search`, because that is the whole
 * point of it: the destination is a *live* query the reader can then widen,
 * negate or compose (`group:x tag:quick`), with the term visible in the field
 * as a chip. There is no pre-baked page to point at, and a group is small
 * enough that the client corpus answers it instantly.
 *
 * The slug is quoted before it is encoded, so a value that would tokenize as
 * several atoms survives the round trip even though `createGroupSlug` does not
 * currently mint one.
 */
export function groupSearchHref(slug: string): string {
  return `/search?q=${encodeURIComponent(`group:${quoteQueryValue(slug)}`)}`;
}

/**
 * Drop token spans from the raw query, then tidy what that leaves behind: empty
 * parentheses, and operators with nothing left to join. Iterated because one
 * pass can create the next pass's work (`(tag:a OR tag:b)` → `( OR )` → `()` → ``).
 */
function spliceTokens(raw: string, doomed: Set<number>): string {
  const tokens = tokenize(raw);
  let result = "";
  let cursor = 0;
  for (const [index, token] of tokens.entries()) {
    if (!doomed.has(index)) continue;
    result += raw.slice(cursor, token.start);
    cursor = token.end;
  }
  result += raw.slice(cursor);
  return tidy(result);
}

/**
 * Collapse the whitespace a splice leaves behind, including the space that ends
 * up hugging the inside of a parenthesis.
 *
 * The paren half arrived with PR 21b: until a *single* operand could be removed,
 * every removal that touched a group removed all of it and the whole `()` went
 * with it, so `( tag:c)` was unreachable. It parses identically to `(tag:c)` —
 * this is about what the field shows the user, since the query is the state.
 *
 * Known and pre-existing: this runs over the raw string, so a quoted operand
 * holding `"a  b"` or `"a ( b"` loses that spacing too. The plain `\s+` collapse
 * has always had that property; the parens inherit it rather than adding it.
 */
function collapseSpacing(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function tidy(raw: string): string {
  let current = collapseSpacing(raw);
  for (let pass = 0; pass < 4; pass += 1) {
    const tokens = tokenize(current);
    const doomed = new Set<number>();
    tokens.forEach((token, index) => {
      const previous = tokens[index - 1];
      const next = tokens[index + 1];
      const opensLeft =
        !previous ||
        previous.kind === "lparen" ||
        previous.kind === "and" ||
        previous.kind === "or" ||
        previous.kind === "not";
      const opensRight =
        !next ||
        next.kind === "rparen" ||
        next.kind === "and" ||
        next.kind === "or";
      if (
        (token.kind === "and" || token.kind === "or") &&
        (opensLeft || opensRight)
      ) {
        doomed.add(index);
      }
      if (token.kind === "not" && (!next || next.kind === "rparen")) {
        doomed.add(index);
      }
      if (token.kind === "lparen" && next?.kind === "rparen") {
        doomed.add(index);
        doomed.add(index + 1);
      }
    });
    if (doomed.size === 0) break;
    let next = "";
    let cursor = 0;
    for (const [index, token] of tokens.entries()) {
      if (!doomed.has(index)) continue;
      next += current.slice(cursor, token.start);
      cursor = token.end;
    }
    next += current.slice(cursor);
    current = collapseSpacing(next);
  }
  return current;
}

/**
 * Add or remove a `tag:<value>` term. This is the *only* way a chip surface
 * changes the filter: chips mutate the query, so there is no parallel state to
 * fall out of step with what the field says.
 *
 * Matching is exact (not the prefix rule evaluation uses) — a chip for "bread"
 * must not read as pressed just because the query says `tag:b`.
 */
export function toggleTagTerm(raw: string, tag: string): string {
  const target = fold(tag).trim();
  const tokens = tokenize(raw);
  const doomed = new Set<number>();
  tokens.forEach((token, index) => {
    if (token.kind !== "term" || token.field !== "tag" || token.negated) return;
    if (fold(token.value).trim() !== target) return;
    doomed.add(index);
    // `NOT tag:x` written long-hand: the operator goes with the term it negated.
    if (tokens[index - 1]?.kind === "not") doomed.add(index - 1);
  });

  if (doomed.size > 0) return spliceTokens(raw, doomed);

  const term = `tag:${quoteQueryValue(tag)}`;
  const base = raw.trimEnd();
  return base ? `${base} ${term}` : term;
}

/**
 * Strip typed terms from a query — all of them, or just one field's. Free text
 * survives, which is what makes "Clear tags" safe next to a live search box.
 */
export function removeFilterTerms(raw: string, field?: FilterField): string {
  const tokens = tokenize(raw);
  const doomed = new Set<number>();
  tokens.forEach((token, index) => {
    if (token.kind !== "term") return;
    if (field && token.field !== field) return;
    doomed.add(index);
    if (tokens[index - 1]?.kind === "not") doomed.add(index - 1);
  });
  if (doomed.size === 0) return raw;
  return spliceTokens(raw, doomed);
}

// --- rewriting one term, keyed on where it sits (PR 21b) --------------------

/**
 * Find the token a `FilterTerm` came from, and refuse if it isn't there any more.
 *
 * Chips are re-derived from the current string on every parse, so a chip the
 * user can see always matches the string it was rendered from — there is no
 * stored mapping to go stale. This exists for the one case that isn't render
 * order: a rewrite handed a *different* string than the one the chip was drawn
 * from (the shared query moved between render and click). Matching the span
 * alone would then be a coincidence away from editing the wrong term, so the
 * token's kind and field have to agree with the leaf as well.
 *
 * Returning `undefined` makes every helper below a no-op rather than a wrong
 * edit. A dead click is recoverable; a silently mangled query is not.
 */
function findTermToken(
  tokens: Token[],
  term: FilterTerm,
): { token: Token; index: number } | undefined {
  const index = tokens.findIndex(
    (token) => token.start === term.start && token.end === term.end,
  );
  if (index === -1) return undefined;
  const token = tokens[index];
  const { node } = term;
  if (node.type === "text" && node.field === "any") {
    // A negated bare word: `text`, not `term` — it binds no field.
    if (token.kind !== "text" || !token.negated) return undefined;
  } else {
    const field = node.type === "time" ? "time" : node.field;
    if (token.kind !== "term" || token.field !== field) return undefined;
  }
  return { token, index };
}

/**
 * Replace a span in the raw query, optionally dropping a token that sits in
 * front of it, then tidy what the replacement orphans.
 *
 * `dropBefore` is taken in the same pass rather than spliced afterwards: a
 * second pass would be splicing against offsets the first one already moved.
 */
function spliceSpan(
  raw: string,
  span: QuerySpan,
  replacement: string,
  dropBefore?: Token,
): string {
  const head = dropBefore
    ? raw.slice(0, dropBefore.start) + raw.slice(dropBefore.end, span.start)
    : raw.slice(0, span.start);
  return tidy(head + replacement + raw.slice(span.end));
}

/**
 * Drop one term, wherever it sits, and tidy the parentheses and operators the
 * removal orphans — the same `tidy` pass "Clear tags" goes through, for the same
 * reason: `tag:a (tag:b OR tag:c)` losing both operands must come back as
 * `tag:a`, not as `tag:a ( OR )`.
 */
export function removeTermAt(raw: string, term: FilterTerm): string {
  const tokens = tokenize(raw);
  const found = findTermToken(tokens, term);
  if (!found) return raw;
  const doomed = new Set<number>([found.index]);
  // The operator goes with the term it negated, as in `removeFilterTerms`.
  if (tokens[found.index - 1]?.kind === "not") doomed.add(found.index - 1);
  return spliceTokens(raw, doomed);
}

/** `<` → `<=` → `>` → `>=` → `<`. Four steps, so four cycles are the identity. */
const COMPARISON_CYCLE: ComparisonOperator[] = ["<", "<=", ">", ">="];

/**
 * Advance one term's operator by one step, and never remove anything — only the
 * `×` removes, so the body of a chip is safe to mash.
 *
 * What "its operator" means per field:
 *
 * - **text fields** (`tag:` and friends, and a negated bare word) have one
 *   operator, negation: include → exclude → include. Two cycles are the
 *   identity. A long-hand `NOT tag:x` de-negates by dropping the `NOT` token
 *   rather than by growing a second negation.
 * - **`time:`** cycles the four comparisons above. A bare `time:30` reads as
 *   `<=` (that is what it parses to), so it starts from there rather than
 *   pretending it was strict. Strictness is preserved, never collapsed: `<`
 *   flips to `<=` because that is the next step, not because a bound the user
 *   typed is being loosened behind their back.
 * - **`before:`/`after:`** *are* their operator, and there are only two of them:
 *   `before:` is `<` and `after:` is `>=` in `matchesFilter`. So a date term
 *   cycles by swapping the field. A date term has no operator *slot* to advance,
 *   so swapping is what "cycle its operator" can mean here; the four-step
 *   comparison cycle simply has no syntax to land in.
 *
 * Returns `raw` unchanged when the term is not where it says it is
 * (`findTermToken`), and when the operand can no longer be read at all.
 */
export function cycleTermAt(raw: string, term: FilterTerm): string {
  const tokens = tokenize(raw);
  const found = findTermToken(tokens, term);
  if (!found) return raw;
  const { token, index } = found;
  const span: QuerySpan = { start: token.start, end: token.end };
  const { node } = term;

  if (node.type === "time") {
    const match = TIME_OPERAND.exec(token.value);
    if (!match) return raw;
    const current = (match[1] ?? "<=") as ComparisonOperator;
    const next =
      COMPARISON_CYCLE[
        (COMPARISON_CYCLE.indexOf(current) + 1) % COMPARISON_CYCLE.length
      ];
    const sign = token.negated ? "-" : "";
    return spliceSpan(raw, span, `${sign}time:${next}${match[2]}`);
  }

  if (node.type === "date") {
    const flipped = node.field === "before" ? "after" : "before";
    const sign = token.negated ? "-" : "";
    return spliceSpan(
      raw,
      span,
      `${sign}${flipped}:${quoteQueryValue(token.value)}`,
    );
  }

  // Text: flip the negation. Three shapes to get from and to — `-x`, `NOT x`
  // and plain `x` — and only two states, so the long-hand form normalises to
  // the short one on the way back.
  const body =
    token.kind === "term"
      ? `${token.field}:${quoteQueryValue(token.value)}`
      : quoteQueryValue(token.value);
  if (token.negated) return spliceSpan(raw, span, body);
  if (tokens[index - 1]?.kind === "not") {
    return spliceSpan(raw, span, body, tokens[index - 1]);
  }
  return spliceSpan(raw, span, `-${body}`);
}

/**
 * Append a term to a query — `field:value`, or a bare `field:` when no operand
 * is given.
 *
 * The bare form is what a palette row that offers a *field* inserts, and it is
 * safe precisely because of 21a's judgement call (a): the tokenizer drops a
 * known field with no operand, so the query the user is looking at keeps
 * returning exactly what it returned before, and the field is left ready for
 * the operand instead of the page going blank while they type it.
 */
export function appendFilterTerm(
  raw: string,
  field: FilterField,
  value?: string,
): string {
  const term = value ? `${field}:${quoteQueryValue(value)}` : `${field}:`;
  const base = raw.trimEnd();
  return base ? `${base} ${term}` : term;
}
