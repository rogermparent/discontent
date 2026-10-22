/**
 * The recipe form's tag picker (43e2, made quiet in 45a): the recipe's tags
 * read through the facet model (43f, D2), so the form can say which terms
 * the recipe carries, which it reaches through a child ("a child brings its
 * parent"), which the import suggested, and — as you type — which terms
 * match, with their counts and the facet each sits in. Pure — the picker
 * component and its unit tests read the same rules.
 *
 * **What is stored never changes shape (D4).** Tags stay the strings the
 * recipe carries; picking a term appends its slug, unpicking removes every
 * carried spelling of that term (slug, label or alias), and nothing else is
 * ever added or rewritten — in particular a child does **not** add its
 * parent: it reaches it through the hierarchy (`tag:dessert` finds the
 * cookies), the curator skill's convention since v4 (its Christmas-Cookies
 * example tags the linzers `linzer` only).
 */
import {
  buildFacetModel,
  type FacetModel,
  type FacetTerm,
} from "../../../util/facets";
import { DRINK_ROOT } from "../../../controller/drinksPage";
import { normalizeTag } from "../../../controller/normalizeTags";
import { tagSlug } from "../../../controller/tagSlug";

/**
 * Everything the picker needs, read once on the server (`readTagPicker`):
 * the vocabulary's terms and, per term, the recipes and groups that carry
 * it or anything under it (`countFacets`' subtree counts, as pairs). 45a
 * dropped the rest of `FacetCounts` — the facet rows that read it are gone.
 */
export interface TagPickerData {
  terms: FacetTerm[];
  counts: [string, number][];
}

/** The picker's model and counts, built once per data. */
export interface TagPicker {
  model: FacetModel;
  /** Term slug → recipes and groups under it. */
  counts: ReadonlyMap<string, number>;
}

export function buildTagPicker(data: TagPickerData | undefined): TagPicker {
  return {
    model: buildFacetModel(data?.terms ?? []),
    counts: new Map(data?.counts ?? []),
  };
}

/** The term a carried tag names, or `undefined` (an unknown string). */
function resolveTag(model: FacetModel, tag: string): string | undefined {
  return model.resolve(tag);
}

/**
 * The recipe's tags as the picker reads them: each term the recipe carries
 * (any spelling), and each term it only reaches through a child.
 */
export interface TagSelection {
  /** Term slug → the carried spellings that name it. */
  chosen: Map<string, string[]>;
  /** Term slug → the chosen descendant(s) that reach it (nearest first). */
  implied: Map<string, string[]>;
}

export function tagSelection(
  model: FacetModel,
  tags: readonly string[],
): TagSelection {
  const chosen = new Map<string, string[]>();
  for (const tag of tags) {
    const slug = resolveTag(model, tag);
    if (slug === undefined) continue;
    const list = chosen.get(slug);
    if (list) list.push(tag);
    else chosen.set(slug, [tag]);
  }
  const implied = new Map<string, string[]>();
  for (const slug of chosen.keys()) {
    for (const up of model.ancestors(slug).slice(1)) {
      if (chosen.has(up)) continue;
      const list = implied.get(up);
      if (list) {
        if (!list.includes(slug)) list.push(slug);
      } else implied.set(up, [slug]);
    }
  }
  return { chosen, implied };
}

/**
 * The tags with a term toggled: a chosen term's every spelling removed
 * (`Dessert`, `dessert`, an alias), or the slug appended. Nothing else moves.
 */
export function toggleTerm(
  model: FacetModel,
  tags: readonly string[],
  slug: string,
): string[] {
  const present = tags.some((tag) => resolveTag(model, tag) === slug);
  if (present) return tags.filter((tag) => resolveTag(model, tag) !== slug);
  return [...tags, slug];
}

/**
 * A tag typed or picked by hand, normalized as the schema stores it
 * (`normalizeTag`), unless the recipe already carries it — by any spelling of
 * the same term, or the same string.
 */
export function addTag(
  model: FacetModel,
  tags: readonly string[],
  raw: string,
): string[] {
  const value = normalizeTag(raw);
  if (!value) return [...tags];
  const slug = resolveTag(model, value);
  const already = tags.some(
    (tag) =>
      normalizeTag(tag) === value ||
      (slug !== undefined && resolveTag(model, tag) === slug),
  );
  return already ? [...tags] : [...tags, value];
}

/**
 * Is it a drink? A tag under `drink` (any spelling of `drink` itself, a
 * style, a family) — the facet model's reading (Df4/Df5). With no
 * vocabulary loaded, the literal `drink` tag still says so.
 */
export function tagsSayDrink(
  model: FacetModel,
  tags: readonly string[],
): boolean {
  return tags.some((tag) => {
    const slug = resolveTag(model, tag);
    if (slug === undefined) return tagSlug(tag) === DRINK_ROOT;
    return model.ancestors(slug).includes(DRINK_ROOT);
  });
}

/** An import's suggestion that names a term the recipe does not carry yet. */
export interface TagSuggestion {
  /** The suggestion as the page wrote it. */
  tag: string;
  slug: string;
  label: string;
}

/**
 * The import's `suggestedTags` (36d: a page's keywords, a video's tags) that
 * match a term or an alias and are not chosen yet — shown dashed until
 * accepted. A suggestion naming no term is dropped: no free tags from a page
 * (the curator skill's rule for food).
 */
export function tagSuggestions(
  model: FacetModel,
  suggested: readonly string[] | undefined,
  tags: readonly string[],
): TagSuggestion[] {
  const { chosen } = tagSelection(model, tags);
  const seen = new Set<string>();
  const out: TagSuggestion[] = [];
  for (const tag of suggested ?? []) {
    const slug = resolveTag(model, tag);
    if (slug === undefined || chosen.has(slug) || seen.has(slug)) continue;
    const term = model.terms.get(slug);
    if (!term) continue;
    seen.add(slug);
    out.push({ tag, slug, label: term.label });
  }
  return out;
}

/** One match as you type: a term, where it sits, its count. */
export interface TagOptionMatch {
  slug: string;
  label: string;
  /** The ancestors' labels, root first: "Course › Desserts". */
  trail: string[];
  /** The facet the term sits in ("Speed & effort"), when one places it. */
  facet?: string;
  count: number;
  /** The spelling that matched, when it is an alias. */
  alias?: string;
}

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Does `query` start a word of `text` (both folded)? */
function wordStart(text: string, query: string): boolean {
  if (!query) return false;
  if (text.startsWith(query)) return true;
  return text.includes(` ${query}`);
}

/**
 * The facet a term sits in: the group that places it or its nearest
 * ancestor (a group's root, or one of its top-level rows) — "Course" for
 * Cookies, "Families" for a drink name — or `undefined` for a carried-only
 * tag no group places.
 */
export function facetLabel(
  model: FacetModel,
  slug: string,
): string | undefined {
  for (const up of model.ancestors(slug)) {
    const id = model.groupsOf(up)[0];
    if (id === undefined) continue;
    return model.groups.find((group) => group.id === id)?.label;
  }
  return undefined;
}

/** How many matches the field lists at most (45a: "capped, ~12"). */
export const MATCH_LIMIT = 12;

/**
 * Terms whose label, slug or alias has a word starting with what was typed,
 * an exact spelling first, then the most carried, then by label. Terms the
 * recipe carries are left out; an alias resolves to its term.
 */
export function searchPickerTerms(
  picker: TagPicker,
  text: string,
  tags: readonly string[],
  limit = MATCH_LIMIT,
): TagOptionMatch[] {
  const query = fold(text);
  if (!query) return [];
  const { model, counts } = picker;
  const { chosen } = tagSelection(model, tags);
  const matches: (TagOptionMatch & { exact: boolean })[] = [];
  for (const term of model.terms.values()) {
    if (chosen.has(term.slug)) continue;
    const spellings = [term.label, term.slug.replace(/-/g, " ")];
    /* An alias spelled exactly is said, even when the label matches too:
     * Enter on "Tex-Mex" takes Mexican & Tex-Mex. */
    let alias = term.aliases?.find((spelling) => fold(spelling) === query);
    let hit =
      alias !== undefined ||
      spellings.some((spelling) => wordStart(fold(spelling), query));
    if (!hit) {
      alias = term.aliases?.find((spelling) =>
        wordStart(fold(spelling), query),
      );
      hit = alias !== undefined;
    }
    if (!hit) continue;
    const exact = [...spellings, ...(term.aliases ?? [])].some(
      (spelling) => fold(spelling) === query,
    );
    const trail = model
      .ancestors(term.slug)
      .slice(1)
      .reverse()
      .map((slug) => model.terms.get(slug)?.label ?? slug);
    const facet = facetLabel(model, term.slug);
    matches.push({
      slug: term.slug,
      label: term.label,
      trail,
      ...(facet !== undefined ? { facet } : {}),
      count: counts.get(term.slug) ?? 0,
      ...(alias ? { alias } : {}),
      exact,
    });
  }
  matches.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.count - a.count ||
      a.label.localeCompare(b.label),
  );
  return matches.slice(0, limit).map(({ exact: _exact, ...match }) => match);
}

/**
 * The index of the option the typed text names exactly (so Enter picks it),
 * or -1: then Enter adds the text as typed.
 */
export function exactOption(
  options: readonly TagOptionMatch[],
  text: string,
): number {
  const query = fold(text);
  if (!query) return -1;
  return options.findIndex(
    (option) =>
      fold(option.label) === query ||
      fold(option.slug.replace(/-/g, " ")) === query ||
      (option.alias !== undefined && fold(option.alias) === query),
  );
}

/**
 * What the suggestions area lists for the text in the field (45a): the
 * matching terms; **New tag "…"** when none of them spells the text exactly
 * and the recipe does not carry it yet; or, when it does, the spelling it
 * carries (`already`), so the area says so instead of offering a no-op.
 * Nothing for an empty field — the area then shows the import's
 * suggestions, or its hint.
 */
export interface TagFieldOptions {
  matches: TagOptionMatch[];
  /** The index in `matches` of the exact spelling, or -1. */
  exact: number;
  /** The text as it would be stored, offered as a new tag. */
  newTag?: string;
  /** The carried tag the text already names. */
  already?: string;
}

export function tagFieldOptions(
  picker: TagPicker,
  text: string,
  tags: readonly string[],
  limit = MATCH_LIMIT,
): TagFieldOptions {
  const matches = searchPickerTerms(picker, text, tags, limit);
  const exact = exactOption(matches, text);
  const value = normalizeTag(text);
  if (!value || exact >= 0) return { matches, exact };
  if (addTag(picker.model, tags, value).length > tags.length) {
    return { matches, exact, newTag: value };
  }
  const slug = resolveTag(picker.model, value);
  const already = tags.find(
    (tag) =>
      normalizeTag(tag) === value ||
      (slug !== undefined && resolveTag(picker.model, tag) === slug),
  );
  return { matches, exact, ...(already !== undefined ? { already } : {}) };
}

/** How a chosen tag reads in the heading: its term's label, or as carried. */
export function chosenLabel(model: FacetModel, tag: string): string {
  const slug = resolveTag(model, tag);
  return (slug !== undefined && model.terms.get(slug)?.label) || tag;
}

export { tagSlug };
