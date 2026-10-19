/**
 * The edit form's tag picker (epic 43, 43e2 — canvas B "Review, then save"):
 * the recipe's tags read through the facet model (43f, D2), so the form can
 * draw a row per facet with counts, say which terms the recipe carries, which
 * it reaches through a child ("a child brings its parent"), and which the
 * import suggested. Pure — the picker component and its unit tests read the
 * same rules.
 *
 * **What is stored never changes shape (D4).** Tags stay the strings the
 * recipe carries; picking a row appends the term's slug, unpicking removes
 * every carried spelling of that term (slug, label or alias), and nothing
 * else is ever added or rewritten — in particular a child does **not** add
 * its parent: it reaches it through the hierarchy (`tag:dessert` finds the
 * cookies), the curator skill's convention since v4 (its Christmas-Cookies
 * example tags the linzers `linzer` only). The parent's row shows as reached.
 */
import {
  buildFacetModel,
  facetGroups,
  type FacetCounts,
  type FacetGroup,
  type FacetGroupId,
  type FacetKind,
  type FacetModel,
  type FacetTerm,
  type OtherTag,
} from "../../../util/facets";
import { DRINK_ROOT } from "../../../controller/drinksPage";
import { normalizeTag } from "../../../controller/normalizeTags";
import { tagSlug } from "../../../controller/tagSlug";

/** `FacetCounts` as JSON: what the server hands the form. */
export interface SerializedFacetCounts {
  total: number;
  kinds: Record<FacetKind, number>;
  subtree: [string, number][];
  drinks: [string, number][];
  own: [string, number][];
  ownDrinks: [string, number][];
  groups: [FacetGroupId, number][];
  other: OtherTag[];
}

/**
 * Everything the picker needs, read once on the server (`readTagPicker`):
 * the vocabulary's terms and the corpus counts — recipes and groups that
 * carry each term or anything under it.
 */
export interface TagPickerData {
  terms: FacetTerm[];
  counts: SerializedFacetCounts;
}

export function serializeFacetCounts(
  counts: FacetCounts,
): SerializedFacetCounts {
  return {
    total: counts.total,
    kinds: counts.kinds,
    subtree: [...counts.subtree],
    drinks: [...counts.drinks],
    own: [...counts.own],
    ownDrinks: [...counts.ownDrinks],
    groups: [...counts.groups],
    other: counts.other,
  };
}

export function deserializeFacetCounts(
  counts: SerializedFacetCounts,
): FacetCounts {
  return {
    total: counts.total,
    kinds: counts.kinds,
    subtree: new Map(counts.subtree),
    drinks: new Map(counts.drinks),
    own: new Map(counts.own),
    ownDrinks: new Map(counts.ownDrinks),
    groups: new Map(counts.groups),
    other: counts.other,
  };
}

/** The picker's model and counts, built once per data. */
export interface TagPicker {
  model: FacetModel;
  counts: FacetCounts;
}

export function buildTagPicker(data: TagPickerData | undefined): TagPicker {
  return {
    model: buildFacetModel(data?.terms ?? []),
    counts: deserializeFacetCounts(
      data?.counts ?? {
        total: 0,
        kinds: { food: 0, drinks: 0 },
        subtree: [],
        drinks: [],
        own: [],
        ownDrinks: [],
        groups: [],
        other: [],
      },
    ),
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

/**
 * The groups the picker draws, per kind: food reads Course, Main ingredient,
 * Cuisine, Speed & effort and Holidays (canvas B's desktop board); a drink
 * Spirit & base first, then Style, Strength & method and the drink's name
 * (Families — canvas B's phone board). Collections (Fall Favorites, House)
 * are found through "Anything else", as the canvas's placeholder says.
 */
export const PICKER_GROUPS: Record<FacetKind, readonly FacetGroupId[]> = {
  food: ["course", "main-ingredient", "cuisine", "effort", "holidays"],
  drinks: ["spirit", "style", "strength-method", "families"],
};

/**
 * The picker's groups for a kind, every row kept (a row nothing carries yet
 * is still a choice), sorted by label as the boards are; a group with no
 * rows is dropped.
 */
export function pickerGroups(picker: TagPicker, kind: FacetKind): FacetGroup[] {
  const all = facetGroups(picker.model, picker.counts, {
    includeEmpty: true,
    sort: "label",
    kind,
  });
  return PICKER_GROUPS[kind]
    .map((id) => all.find((group) => group.id === id))
    .filter(
      (group): group is FacetGroup =>
        group !== undefined && group.rows.length > 0,
    );
}

/**
 * Families have a row per drink name (113 of them on the real site): the
 * picker shows only the ones this drink carries or reaches, and finds the
 * rest through "Anything else".
 */
export const COLLAPSED_GROUPS: ReadonlySet<FacetGroupId> = new Set([
  "families",
]);

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

/** One option of "Anything else": a term, its trail, its count. */
export interface TagOptionMatch {
  slug: string;
  label: string;
  /** The ancestors' labels, root first: "Desserts › Cookies". */
  trail: string[];
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
 * Terms whose label, slug or alias has a word starting with what was typed,
 * an exact spelling first, then the most carried. Terms the recipe carries
 * are left out.
 */
export function searchPickerTerms(
  picker: TagPicker,
  text: string,
  tags: readonly string[],
  limit = 8,
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
    const exact =
      [...spellings, ...(term.aliases ?? [])].some(
        (spelling) => fold(spelling) === query,
      ) || false;
    const trail = model
      .ancestors(term.slug)
      .slice(1)
      .reverse()
      .map((slug) => model.terms.get(slug)?.label ?? slug);
    matches.push({
      slug: term.slug,
      label: term.label,
      trail,
      count: counts.subtree.get(term.slug) ?? 0,
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
  return options.findIndex(
    (option) =>
      fold(option.label) === query ||
      fold(option.slug.replace(/-/g, " ")) === query ||
      (option.alias !== undefined && fold(option.alias) === query),
  );
}

/**
 * Tags no group places (Df6) that the recipe does not carry — the corpus's
 * loose strings, offered as one-click adds as the form always has ("Add tag
 * soup"). On the real site, since 43k, there are none.
 */
export function looseTags(
  picker: TagPicker,
  tags: readonly string[],
  fallback: readonly string[] = [],
): string[] {
  const carried = new Set(tags.map((tag) => normalizeTag(tag)));
  const loose =
    picker.counts.other.length > 0 || picker.model.terms.size > 0
      ? picker.counts.other.map((other) => other.label)
      : fallback;
  const out: string[] = [];
  for (const label of loose) {
    const value = normalizeTag(label);
    if (!value || carried.has(value) || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

/** How a chosen tag reads in the heading: its term's label, or as carried. */
export function chosenLabel(model: FacetModel, tag: string): string {
  const slug = resolveTag(model, tag);
  return (slug !== undefined && model.terms.get(slug)?.label) || tag;
}

export { tagSlug };
