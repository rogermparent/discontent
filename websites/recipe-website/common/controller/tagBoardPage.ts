import {
  FACET_GROUPS,
  buildFacetModel,
  countFacets,
  narrowRows,
  facetGroups,
  flattenRows,
  type FacetGroup,
  type FacetGroupId,
  type FacetModel,
  type FacetRecipe,
  type FacetRow,
  type FacetTerm,
  type OtherTag,
} from "../util/facets";
import { HOLIDAYS_ROOT } from "../util/holidays";
import { tagSlug } from "./tagSlug";
import type { RecipeListEntry } from "./paginationConfigs";

/**
 * `/tags` and the term pages as canvas B, "Narrow it down", draws them (epic
 * 43, 43t) — the pure half: facet model + carriers in, plain serializable
 * values out. Every grouping and count is the facet model's (43f, D2); this
 * only picks which groups go on which shelf and flattens them for the page.
 */

/** One dot-leader line on the board: a term, its depth, how many under it. */
export interface BoardRow {
  slug: string;
  label: string;
  count: number;
  /** 0 for a group's top-level row, 1 under it, and so on. */
  depth: number;
}

/** One column of a shelf: a facet group, its rows depth-first. */
export interface BoardColumn {
  id: FacetGroupId;
  label: string;
  /** The term the group is the children of — its heading links there. */
  root?: string;
  /** Distinct recipes the group places ("Course 571"). */
  total: number;
  rows: BoardRow[];
}

/** One family on the Drinks shelf's run-in list, its own families inline. */
export interface BoardFamily {
  slug: string;
  label: string;
  count: number;
  children: BoardFamily[];
}

/** A holiday on the board's aside; the browser dates and orders it. */
export interface BoardHoliday {
  slug: string;
  label: string;
  /** The `HOLIDAY_RULES` key that dates it; absent when undated. */
  rule?: string;
  recipes: number;
  plans: number;
}

/** One row of "Find a tag": a term by any of its names. */
export interface FinderEntry {
  slug: string;
  label: string;
  aliases?: string[];
  /** The labels above it, root first ("Course › Desserts"). */
  trail: string[];
  /** Recipes under it (subtree, distinct). */
  count: number;
  /** The facet group that places it, lowercased — Combine's token note. */
  facet?: string;
}

export interface TagBoardData {
  /** Recipes that are not drinks / drinks — the shelves' tickers. */
  foodCount: number;
  drinkCount: number;
  /** Course, Main ingredient, Cuisine, Speed & effort. */
  food: BoardColumn[];
  /** Root-level records that are no facet (Fall Favorites, Syrups, House). */
  collections?: BoardColumn;
  /**
   * The same Collections counted on drinks, the ones holding any (43t, Dt2):
   * a collection has no kind, and House recipes is mostly drinks.
   */
  drinkCollections: BoardRow[];
  holidays: BoardHoliday[];
  /** Distinct recipes under any holiday. */
  holidayCount: number;
  /** Style, Strength & method, Spirit & base. */
  drinks: BoardColumn[];
  /** Children of `drink` that are no style or method: drink names. */
  families: BoardFamily[];
  /** Every family row, nested ones included. */
  familyCount: number;
  /** The `drink` root, when the vocabulary has one: "All N families →". */
  drinkRoot?: string;
  /** Tags no group places, recipes and plans counted. */
  other: OtherTag[];
  /** Of them, carried once. */
  otherOnce: number;
  /** Every term by name and alias, for "Find a tag". */
  finder: FinderEntry[];
  /** How many names and aliases "Find a tag" searches. */
  names: number;
}

const FOOD_COLUMNS: readonly FacetGroupId[] = [
  "course",
  "main-ingredient",
  "cuisine",
  "effort",
];
const DRINK_COLUMNS: readonly FacetGroupId[] = [
  "style",
  "strength-method",
  "spirit",
];

function column(group: FacetGroup): BoardColumn {
  return {
    id: group.id,
    label: group.label,
    ...(group.root ? { root: group.root } : {}),
    total: group.total,
    rows: flattenRows(group.rows).map(toBoardRow),
  };
}

function toBoardRow(row: FacetRow): BoardRow {
  return {
    slug: row.slug,
    label: row.label,
    count: row.count,
    depth: row.depth,
  };
}

function family(row: FacetRow): BoardFamily {
  return {
    slug: row.slug,
    label: row.label,
    count: row.count,
    children: row.children.map(family),
  };
}

/** The labels above `slug`, root first. */
function trailOf(model: FacetModel, slug: string): string[] {
  return model
    .ancestors(slug)
    .slice(1)
    .reverse()
    .map((up) => model.terms.get(up)?.label ?? up);
}

/** The group that places `slug` or an ancestor of it, lowercased. */
function facetOf(
  model: FacetModel,
  slug: string,
  labels: ReadonlyMap<FacetGroupId, string>,
): string | undefined {
  for (const up of model.ancestors(slug)) {
    const id = model.groupsOf(up)[0];
    if (id) return labels.get(id)?.toLowerCase();
  }
  return undefined;
}

/**
 * The board (43t): four food columns and Collections, Holidays, three drinks
 * columns and the Families run-in list, the other tags, and "Find a tag".
 *
 * `recipes` and `groups` are every carrier with its tags (the server's
 * `carriersFromRows` over the two whole by-term maps). The shelves count
 * recipes — what "Show N recipes" opens; a holiday's plans are counted
 * beside its recipes, and the other tags count both carriers, as `/tags`
 * always counted a bare tag.
 */
export function tagBoardData({
  terms,
  recipes,
  groups = [],
}: {
  terms: ReadonlyArray<FacetTerm>;
  recipes: ReadonlyArray<FacetRecipe>;
  groups?: ReadonlyArray<FacetRecipe>;
}): TagBoardData {
  const model = buildFacetModel(terms);
  const counts = countFacets(model, recipes);
  const planCounts = countFacets(model, groups);
  const both = countFacets(model, [...recipes, ...groups]);
  const all = facetGroups(model, counts);
  const byId = new Map(all.map((group) => [group.id, group]));
  const labels = new Map(model.groups.map((group) => [group.id, group.label]));

  const collections = byId.get("collections");
  const drinkCollections = (collections?.rows ?? [])
    .map((row) => ({
      slug: row.slug,
      label: row.label,
      count: counts.drinks.get(row.slug) ?? 0,
      depth: 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const holidayRows = byId.get("holidays")?.rows ?? [];
  const familyRows = byId.get("families")?.rows ?? [];

  const finder: FinderEntry[] = [...model.terms.values()]
    .filter((term) => term.record || (counts.subtree.get(term.slug) ?? 0) > 0)
    .map((term) => {
      const facet = facetOf(model, term.slug, labels);
      const aliases = (term.aliases ?? []).filter(
        (alias) => tagSlug(alias) !== term.slug,
      );
      return {
        slug: term.slug,
        label: term.label,
        ...(aliases.length ? { aliases } : {}),
        trail: trailOf(model, term.slug),
        count: counts.subtree.get(term.slug) ?? 0,
        ...(facet ? { facet } : {}),
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    foodCount: counts.kinds.food,
    drinkCount: counts.kinds.drinks,
    food: FOOD_COLUMNS.flatMap((id) => {
      const group = byId.get(id);
      return group ? [column(group)] : [];
    }),
    ...(collections ? { collections: column(collections) } : {}),
    drinkCollections,
    holidays: holidayRows.map((row) => ({
      slug: row.slug,
      label: row.label,
      ...(row.rule ? { rule: row.rule } : {}),
      recipes: row.count,
      plans: planCounts.subtree.get(row.slug) ?? 0,
    })),
    holidayCount: counts.subtree.get(HOLIDAYS_ROOT) ?? 0,
    drinks: DRINK_COLUMNS.flatMap((id) => {
      const group = byId.get(id);
      return group ? [column(group)] : [];
    }),
    families: familyRows.map(family),
    familyCount: flattenRows(familyRows).length,
    ...(model.terms.has("drink") ? { drinkRoot: "drink" } : {}),
    other: both.other,
    otherOnce: both.other.filter((tag) => tag.count === 1).length,
    finder,
    names: finder.reduce(
      (sum, entry) => sum + 1 + (entry.aliases?.length ?? 0),
      0,
    ),
  };
}

/**
 * "Find a tag" (43t): entries whose label, slug or an alias holds every
 * typed word, label prefixes first, then the most carried. `alias` is the
 * spelling that matched when it was not the label — the row says "also …".
 */
export function findTags(
  entries: ReadonlyArray<FinderEntry>,
  text: string,
  limit: number,
): Array<FinderEntry & { alias?: string }> {
  const words = fold(text)
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  const hits: Array<{
    entry: FinderEntry;
    alias?: string;
    rank: number;
  }> = [];
  for (const entry of entries) {
    const names = [entry.label, entry.slug];
    const own = fold(names.join(" "));
    if (words.every((word) => own.includes(word))) {
      hits.push({
        entry,
        rank: fold(entry.label).startsWith(words[0]) ? 0 : 1,
      });
      continue;
    }
    const alias = entry.aliases?.find((spelling) => {
      const hay = fold(spelling);
      return words.every((word) => hay.includes(word));
    });
    if (alias) hits.push({ entry, alias, rank: 2 });
  }
  return hits
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.entry.count - a.entry.count ||
        a.entry.label.localeCompare(b.entry.label),
    )
    .slice(0, limit)
    .map(({ entry, alias }) => (alias ? { ...entry, alias } : entry));
}

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// --- term pages ------------------------------------------------------------

/**
 * How many of a term's subtree rows a term page sends to the browser for
 * "Narrow X" to filter in place (43t, Dt3). Measured on the real corpus
 * (2026-10-19): Christmas 41 rows = 8.1 KB of JSON (2.0 KB gzipped), Desserts
 * 148 = 27 KB (6.4 KB), Holidays 139 = 27 KB, Course 597 = 105 KB (27 KB).
 * Root pages (Course, Holidays, Drinks) don't narrow — they show one row per
 * narrower term — so the biggest page that does is a mid-level term; past
 * this many rows the chips are left out rather than the page growing.
 */
export const TERM_NARROW_ROW_LIMIT = 400;

/**
 * A term page's own tags, which its cards leave out (42j: every card
 * repeated the page's tag): the term, everything above it and everything
 * under it.
 */
export function pageTagSlugs(model: FacetModel, slug: string): Set<string> {
  const out = new Set<string>(model.ancestors(slug));
  const stack = [slug];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (out.has(current) && current !== slug) continue;
    out.add(current);
    stack.push(...model.children(current));
  }
  return out;
}

/** `tags` less the page's own (`pageTagSlugs`), as carried. */
export function otherTags(
  model: FacetModel,
  tags: readonly string[] | undefined,
  page: ReadonlySet<string>,
): string[] {
  return (tags ?? []).filter((tag) => {
    const slug = model.resolve(tag);
    return slug === undefined || !page.has(slug);
  });
}

/** Does a recipe carry `slug`, an alias of it, or anything under it? */
export function carriesTerm(
  model: FacetModel,
  tags: readonly string[] | undefined,
  slug: string,
): boolean {
  return (tags ?? []).some((tag) => {
    const found = model.resolve(tag);
    return found !== undefined && model.ancestors(found).includes(slug);
  });
}

/** One narrower term on a root page: its count, photos and sub-chips. */
export interface RootSection {
  slug: string;
  label: string;
  /** Recipes under it (subtree, distinct). */
  count: number;
  /** Up to three, the newest with a photo (the term's pins first). */
  recipes: RecipeListEntry[];
  /** Its own narrower terms that carry anything, biggest first. */
  children: Array<{ slug: string; label: string; count: number }>;
}

/** How many narrower terms get a photo row before "And N more". */
export const ROOT_PHOTO_SECTIONS = 7;
/** Photos per row. */
export const ROOT_SECTION_PHOTOS = 3;

/**
 * A root page (43t, `/tags/course`): one section per narrower term, biggest
 * first, from the subtree's rows (`rows`, pinned first then newest — what
 * `termPageData` merged). The first `photos` get three photos each; the
 * rest are dot-leader lines.
 */
export function rootSections(
  model: FacetModel,
  slug: string,
  rows: ReadonlyArray<RecipeListEntry>,
  photos: number = ROOT_PHOTO_SECTIONS,
): { sections: RootSection[]; more: RootSection[] } {
  const counts = countFacets(model, rows);
  const children = model
    .children(slug)
    .map((child) => ({
      slug: child,
      label: model.terms.get(child)?.label ?? child,
      count: counts.subtree.get(child) ?? 0,
    }))
    .filter((child) => child.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const sections = children.map((child, index): RootSection => {
    const grand = model
      .children(child.slug)
      .map((under) => ({
        slug: under,
        label: model.terms.get(under)?.label ?? under,
        count: counts.subtree.get(under) ?? 0,
      }))
      .filter((under) => under.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return {
      ...child,
      recipes:
        index < photos
          ? rows
              .filter(
                (row) => row.image && carriesTerm(model, row.tags, child.slug),
              )
              .slice(0, ROOT_SECTION_PHOTOS)
          : [],
      children: grand,
    };
  });
  return {
    sections: sections.slice(0, photos),
    more: sections.slice(photos),
  };
}

/** Chips per facet row, and facet rows under the narrower terms. */
export const CHIPS_PER_ROW = 6;
export const FACET_ROWS = 4;

/** One "Narrow X" chip. */
export interface NarrowChip {
  slug: string;
  label: string;
  count: number;
  pressed: boolean;
}

/** One row of chips: the narrower terms, or a facet group. */
export interface NarrowChipRow {
  id: string;
  label: string;
  chips: NarrowChip[];
}

/**
 * The chip rows over `filtered` (the term's recipes, narrowed by
 * `selected`): first the term's own narrower terms, then a row per facet
 * group in `FACET_GROUPS`' order — each row's terms some but not all of the
 * set carries (`narrowRows`), biggest first — and a pressed chip always
 * keeps its place.
 */
export function narrowChips(
  model: FacetModel,
  slug: string,
  filtered: ReadonlyArray<{ tags?: readonly string[] }>,
  selected: readonly string[],
): NarrowChipRow[] {
  const counts = countFacets(model, filtered);
  const total = filtered.length;
  const pressed = new Set(selected);
  const label = (each: string) => model.terms.get(each)?.label ?? each;
  const rows: NarrowChipRow[] = [];

  const children = model.children(slug);
  const own = children
    .map((child) => ({
      slug: child,
      label: label(child),
      count: counts.subtree.get(child) ?? 0,
      pressed: pressed.has(child),
    }))
    .filter(
      (chip) => chip.pressed || (chip.count > 0 && chip.count < total),
    )
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (own.length > 0) {
    rows.push({ id: "narrower", label: "Narrower", chips: own });
  }

  const shown = new Set(own.map((chip) => chip.slug));
  const byGroup = new Map<FacetGroupId, NarrowChip[]>();
  const groupOf = (each: string): FacetGroupId | undefined => {
    for (const up of model.ancestors(each)) {
      const id = model.groupsOf(up)[0];
      if (id) return id;
    }
    return undefined;
  };
  for (const pick of selected) {
    if (shown.has(pick)) continue;
    const id = groupOf(pick);
    if (!id) continue;
    const list = byGroup.get(id) ?? [];
    list.push({ slug: pick, label: label(pick), count: total, pressed: true });
    byGroup.set(id, list);
    shown.add(pick);
  }
  for (const row of narrowRows(model, counts, {
    exclude: [slug, ...selected],
  })) {
    if (shown.has(row.slug)) continue;
    const list = byGroup.get(row.group) ?? [];
    if (list.filter((chip) => !chip.pressed).length >= CHIPS_PER_ROW) continue;
    list.push({
      slug: row.slug,
      label: row.label,
      count: row.count,
      pressed: false,
    });
    byGroup.set(row.group, list);
    shown.add(row.slug);
  }

  const groupLabel = new Map(model.groups.map((g) => [g.id, g.label]));
  let facetRows = 0;
  for (const def of FACET_GROUPS) {
    const chips = byGroup.get(def.id);
    if (!chips?.length) continue;
    const hasPressed = chips.some((chip) => chip.pressed);
    if (facetRows >= FACET_ROWS && !hasPressed) continue;
    rows.push({
      id: def.id,
      label: groupLabel.get(def.id) ?? def.label,
      chips,
    });
    facetRows += 1;
  }
  return rows;
}
