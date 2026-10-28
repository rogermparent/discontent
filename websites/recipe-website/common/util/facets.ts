import type { TermTree } from "@discontent/cms/taxonomies/tree";
import {
  appendFilterTerm,
  filterTerms,
  parseQuery,
  quoteQueryValue,
  removeTermAt,
} from "../components/SearchForm/queryLanguage";
import {
  DRINK_ROOT,
  DRINK_STRENGTH_METHOD_SLUGS,
  DRINK_STYLE_ONLY_SLUGS,
  SPIRIT_ROOT,
} from "../controller/drinksPage";
import { FACET_ROOT_ORDER } from "../controller/homepageFacets";
import { buildTermLookup } from "../controller/tagExpansion";
import { tagSlug } from "../controller/tagSlug";
import type {
  TagBoard,
  TagOption,
  TermHierarchyNode,
  TermRowMap,
} from "../controller/tagVocabulary";
import { HOLIDAYS_ROOT, holidayRuleKey } from "./holidays";

/**
 * The facet model (epic 43, 43f — D2): the term tree grouped into the facets
 * search's Narrow column, `/tags`' shelves, a term page's "Narrow X" chips
 * and the edit form's tag picker all draw, with counts within any set of
 * recipes. Pure — plain values in, plain values out, no reads — so the server
 * and the browser group and count the same way.
 *
 * **The groups** (`FACET_GROUPS`):
 *
 * - **Food:** Course, Main ingredient, Cuisine, Speed & effort — the facet
 *   roots of `FACET_ROOT_ORDER` that are neither holidays nor the bar, each
 *   group its root's children — and **Holidays** (the children of
 *   `holidays`, each row carrying the `HOLIDAY_RULES` key that dates it).
 * - **Either kind:** **Collections** — every *recorded* root that is none of
 *   those roots, `drink`, `spirit` or `holidays` (Fall Favorites, Syrups,
 *   House). A collection can be dishes or the bar (House is mostly drinks),
 *   so the group has kind `"any"`: it shows for either kind, and the counts
 *   within the set decide whether it has rows. `/tags` draws it on the Food
 *   shelf (canvas B).
 * - **Drinks:** **Style** (`DRINK_STYLE_SLUGS` less the next group's),
 *   **Strength & method** (`DRINK_STRENGTH_METHOD_SLUGS`), **Spirit & base**
 *   (the `spirit` root's children) and **Families** (every other child of
 *   `drink` — a drink's name, derived here: no record field says so).
 *
 * **Counting.** A recipe counts once towards a term when it carries the term,
 * one of its aliases or anything under it (`tag:<term>`'s reading, 24d), so a
 * parent's count is its subtree's distinct recipes, never a sum. A carried
 * tag finds its term by `tag:`'s own lookup (`buildTermLookup`): folded slug
 * or label, the slugged spelling ("bean salads" → `bean-salads`), or an
 * alias. Drinks groups count drinks only — a recipe under `drink` — as
 * `/drinks` does (a `tea` cake is not a Tea drink); food groups, Collections
 * and Holidays count every recipe in the set.
 *
 * **Other tags** are what no group places: a tag no term spells, or a term
 * with no record (a string only recipes carry — since 43k gave the one-off
 * drink names records, a rare case).
 */

/** The two shelves: dishes and the bar. `tag:drink` / `-tag:drink` (D3). */
export type FacetKind = "food" | "drinks";

/** A group's kind: one shelf's, or `"any"` (Collections) for both. */
export type FacetGroupKind = FacetKind | "any";

/** The groups, in reading order. */
export type FacetGroupId =
  | "course"
  | "main-ingredient"
  | "cuisine"
  | "effort"
  | "collections"
  | "holidays"
  | "style"
  | "strength-method"
  | "spirit"
  | "families";

/**
 * Children of `drink` that say how strong a drink is or how it is mixed
 * rather than what kind of drink it is (Df2): zero-proof and low-ABV, and the
 * methods `shaken`, `stirred` and `built` — side by side since 46h (43-Df2;
 * until then `stirred` and `built` were styles). The list lives with
 * `/drinks` (`drinksPage.ts`). A slug the site lacks is skipped; one added
 * later lands in Families until it is listed there.
 */
export { DRINK_STRENGTH_METHOD_SLUGS };

/** `DRINK_STYLE_SLUGS` less strength and method: the Style group. */
export const DRINK_STYLE_FACET_SLUGS: readonly string[] =
  DRINK_STYLE_ONLY_SLUGS;

/** The food facet roots, in `FACET_ROOT_ORDER`'s order. */
export const FOOD_FACET_ROOTS: readonly string[] = FACET_ROOT_ORDER.filter(
  (slug) =>
    slug !== HOLIDAYS_ROOT && slug !== DRINK_ROOT && slug !== SPIRIT_ROOT,
);

/** What a group is made of. */
type GroupSource =
  /** The children of one root term. */
  | { type: "root"; root: string }
  /** These slugs, wherever they sit. */
  | { type: "list"; slugs: readonly string[] }
  /** Recorded roots no other group is built on. */
  | { type: "collections" }
  /** Children of `drink` that no list group claims. */
  | { type: "families" };

export interface FacetGroupDef {
  id: FacetGroupId;
  kind: FacetGroupKind;
  /** The heading when no root record names it. */
  label: string;
  source: GroupSource;
}

/**
 * Every group, in the order the shelves read (D2). The root-backed groups'
 * headings come from their root records ("Speed & effort", "Spirit & base");
 * these labels stand in when a record is missing.
 */
export const FACET_GROUPS: readonly FacetGroupDef[] = [
  { id: "course", kind: "food", label: "Course", source: root("course") },
  {
    id: "main-ingredient",
    kind: "food",
    label: "Main ingredient",
    source: root("main-ingredient"),
  },
  { id: "cuisine", kind: "food", label: "Cuisine", source: root("cuisine") },
  {
    id: "effort",
    kind: "food",
    label: "Speed & effort",
    source: root("effort"),
  },
  {
    id: "collections",
    kind: "any",
    label: "Collections",
    source: { type: "collections" },
  },
  {
    id: "holidays",
    kind: "food",
    label: "Holidays",
    source: root(HOLIDAYS_ROOT),
  },
  {
    id: "style",
    kind: "drinks",
    label: "Style",
    source: { type: "list", slugs: DRINK_STYLE_FACET_SLUGS },
  },
  {
    id: "strength-method",
    kind: "drinks",
    label: "Strength & method",
    source: { type: "list", slugs: DRINK_STRENGTH_METHOD_SLUGS },
  },
  {
    id: "spirit",
    kind: "drinks",
    label: "Spirit & base",
    source: root(SPIRIT_ROOT),
  },
  {
    id: "families",
    kind: "drinks",
    label: "Families",
    source: { type: "families" },
  },
];

function root(slug: string): GroupSource {
  return { type: "root", root: slug };
}

// --- input ------------------------------------------------------------------

/**
 * One term, as little as the model needs: `TagOption` and `SearchTerm` (the
 * browser's `/search/terms`) already have this shape.
 */
export interface FacetTerm {
  slug: string;
  label: string;
  parent?: string;
  aliases?: readonly string[];
  /** The term has a record. Only a record can lead a Collection. */
  record?: boolean;
  image?: string;
}

/**
 * The browser's terms (`useSearch().allTerms`, `SearchTerm[]`) or the
 * server's `readTagOptions()` — record-only and carried-only terms both, so
 * a carried-only tag is recognised as an "other tag" rather than unknown.
 */
export function facetTermsFromOptions(
  options: ReadonlyArray<TagOption>,
): FacetTerm[] {
  return options.map((option) => ({
    slug: option.slug,
    label: option.label,
    ...(option.parent ? { parent: option.parent } : {}),
    ...(option.aliases?.length ? { aliases: option.aliases } : {}),
    ...(option.record ? { record: true } : {}),
  }));
}

/**
 * The tree aggregate's records (a server read, or `tagTermReads.tree`):
 * every term a record, with its picture. A parent the tree lacks is dropped,
 * as `tagOptions` drops it; a cycle is broken by the model.
 */
export function facetTermsFromTree(
  tree: TermTree | null | undefined,
): FacetTerm[] {
  return Object.entries(tree ?? {}).map(([slug, node]) => ({
    slug,
    label: node.label,
    ...(node.parent && node.parent !== slug && tree?.[node.parent]
      ? { parent: node.parent }
      : {}),
    ...(node.aliases?.length ? { aliases: node.aliases } : {}),
    record: true,
    ...(node.image ? { image: node.image } : {}),
  }));
}

/**
 * `/tags`' board (`readTagBoard`): its roots, flattened with the parent the
 * nesting gives, and its loose records. Board nodes carry only the aliases
 * that are their own (`ownAliases`), which is all the model keeps anyway.
 */
export function facetTermsFromBoard(board: TagBoard): FacetTerm[] {
  const terms: FacetTerm[] = [];
  const seen = new Set<string>();
  const add = (node: TermHierarchyNode, parent?: string) => {
    if (seen.has(node.slug)) return;
    seen.add(node.slug);
    terms.push({
      slug: node.slug,
      label: node.label,
      ...(parent ? { parent } : {}),
      ...(node.aliases?.length ? { aliases: node.aliases } : {}),
      record: true,
      ...(node.image ? { image: node.image } : {}),
    });
    for (const child of node.children) add(child, node.slug);
  };
  for (const node of [...board.roots, ...board.loose]) add(node);
  return terms;
}

/**
 * The carriers of a whole by-term map (`byTerm.read()`), as recipes with
 * tags: each item once, carrying every key it sits under. What the server
 * passes to `countFacets` when it holds the rows rather than the recipes;
 * an alias key resolves to its term as a carried alias would.
 */
export function carriersFromRows(
  rows: TermRowMap | null | undefined,
): Array<{ slug: string; tags: string[] }> {
  const bySlug = new Map<string, string[]>();
  for (const [key, row] of Object.entries(rows ?? {})) {
    for (const item of row.items) {
      const tags = bySlug.get(item.slug);
      if (tags) tags.push(key);
      else bySlug.set(item.slug, [key]);
    }
  }
  return [...bySlug.entries()].map(([slug, tags]) => ({ slug, tags }));
}

// --- the model ---------------------------------------------------------------

export interface FacetModel {
  /** Every term, by slug. */
  terms: ReadonlyMap<string, FacetTerm>;
  /** The term a carried tag names (`buildTermLookup`), or `undefined`. */
  resolve(tag: string): string | undefined;
  /** `slug` and every ancestor, nearest first; cycle-safe. */
  ancestors(slug: string): string[];
  /** Direct children, in input order. */
  children(slug: string): string[];
  /** The group definitions that have at least one row or root here. */
  groups: ReadonlyArray<FacetGroupShape>;
  /** The group(s) a slug leads a row of or roots: what places it. */
  groupsOf(slug: string): ReadonlyArray<FacetGroupId>;
}

/** A group with its top-level row slugs worked out, before any counting. */
export interface FacetGroupShape {
  id: FacetGroupId;
  kind: FacetGroupKind;
  label: string;
  /** The term the group is the children of (its `/tags/<root>` page). */
  root?: string;
  /** The top-level rows' slugs, in input order. */
  rows: string[];
}

/**
 * Index the terms and work out each group's rows. A parent that names no
 * term, the term itself, or closes a cycle is ignored, so every term is
 * reachable from exactly one root (`tagOptions`' rule, applied again here
 * because a hand-built input need not have been through it).
 */
export function buildFacetModel(input: ReadonlyArray<FacetTerm>): FacetModel {
  const terms = new Map<string, FacetTerm>();
  for (const term of input)
    if (!terms.has(term.slug)) terms.set(term.slug, term);

  const parentOf = new Map<string, string>();
  for (const [slug, term] of terms) {
    if (!term.parent || term.parent === slug || !terms.has(term.parent)) {
      continue;
    }
    parentOf.set(slug, term.parent);
  }
  /* Break cycles: a term whose walk up comes back to itself is a root. */
  for (const slug of [...parentOf.keys()]) {
    const seen = new Set<string>([slug]);
    let current = parentOf.get(slug);
    while (current !== undefined) {
      if (seen.has(current)) {
        parentOf.delete(slug);
        break;
      }
      seen.add(current);
      current = parentOf.get(current);
    }
  }
  const childrenOf = new Map<string, string[]>();
  for (const [slug, parent] of parentOf) {
    const list = childrenOf.get(parent);
    if (list) list.push(slug);
    else childrenOf.set(parent, [slug]);
  }

  const ancestors = (slug: string): string[] => {
    const trail: string[] = [];
    let current: string | undefined = slug;
    while (current !== undefined && !trail.includes(current)) {
      trail.push(current);
      current = parentOf.get(current);
    }
    return trail;
  };
  const children = (slug: string) => childrenOf.get(slug) ?? [];
  const isRoot = (slug: string) => !parentOf.has(slug);

  const listed = new Set<string>(
    FACET_GROUPS.flatMap((group) =>
      group.source.type === "list" ? group.source.slugs : [],
    ),
  );
  const builtOn = new Set<string>([
    ...FACET_GROUPS.flatMap((group) =>
      group.source.type === "root" ? [group.source.root] : [],
    ),
    DRINK_ROOT,
  ]);

  const groups: FacetGroupShape[] = [];
  for (const def of FACET_GROUPS) {
    const { source } = def;
    let rows: string[] = [];
    let rootSlug: string | undefined;
    switch (source.type) {
      case "root":
        if (!terms.has(source.root)) break;
        rootSlug = source.root;
        /* A listed slug (a style under `holidays` one day) stays in its list. */
        rows = children(source.root).filter((slug) => !listed.has(slug));
        break;
      case "list":
        rows = source.slugs.filter((slug) => terms.has(slug));
        break;
      case "collections":
        rows = [...terms.values()]
          .filter(
            (term) =>
              term.record && isRoot(term.slug) && !builtOn.has(term.slug),
          )
          .map((term) => term.slug);
        break;
      case "families":
        rootSlug = terms.has(DRINK_ROOT) ? DRINK_ROOT : undefined;
        rows = children(DRINK_ROOT).filter((slug) => !listed.has(slug));
        break;
    }
    if (rows.length === 0 && rootSlug === undefined) continue;
    groups.push({
      id: def.id,
      kind: def.kind,
      label:
        source.type === "root"
          ? (terms.get(source.root)?.label ?? def.label)
          : def.label,
      ...(rootSlug !== undefined ? { root: rootSlug } : {}),
      rows,
    });
  }

  /*
   * What places a slug: a group's root (the root itself carries for the
   * group — `tag:course` on a recipe is a course, if no particular one) or
   * one of its top-level rows. Not `drink` for Families: a recipe tagged
   * `drink` alone is a drink of no named family — that tag is the Kind, so
   * it places the recipe in no drinks group.
   */
  const placing = new Map<string, FacetGroupId[]>();
  const place = (slug: string, id: FacetGroupId) => {
    const list = placing.get(slug);
    if (!list) placing.set(slug, [id]);
    else if (!list.includes(id)) list.push(id);
  };
  for (const group of groups) {
    if (group.root !== undefined && group.id !== "families") {
      place(group.root, group.id);
    }
    for (const slug of group.rows) place(slug, group.id);
  }

  const lookup = buildTermLookup(
    [...terms.values()].map((term) => ({
      slug: term.slug,
      label: term.label,
      ...(term.aliases?.length ? { aliases: term.aliases } : {}),
      ...(term.record ? { record: true } : {}),
    })),
  );

  return {
    terms,
    resolve: lookup,
    ancestors,
    children,
    groups,
    groupsOf: (slug) => placing.get(slug) ?? [],
  };
}

// --- counting ------------------------------------------------------------------

/** A recipe as the counts read it: its tags as carried. */
export interface FacetRecipe {
  tags?: readonly string[] | null;
}

/** A tag no group places, and how many recipes in the set carry it. */
export interface OtherTag {
  /** The term's slug, or the carried string's slug when no term spells it. */
  slug: string;
  label: string;
  count: number;
}

export interface FacetCounts {
  /** Recipes in the set. */
  total: number;
  /** Drinks (recipes under `drink`) and the rest. */
  kinds: Record<FacetKind, number>;
  /** Each term → recipes in the set under it (subtree, distinct). */
  subtree: ReadonlyMap<string, number>;
  /** The same over the set's drinks only — what drinks groups count. */
  drinks: ReadonlyMap<string, number>;
  /** Each term → recipes carrying it itself (or an alias of it). */
  own: ReadonlyMap<string, number>;
  /** The same over the set's drinks only. */
  ownDrinks: ReadonlyMap<string, number>;
  /** Each group → distinct recipes it places (its heading's number). */
  groups: ReadonlyMap<FacetGroupId, number>;
  /** Tags no group places, most carried first, then by label. */
  other: OtherTag[];
}

function bump<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** The terms one recipe sits under (each once), and its unplaced tags. */
function reach(model: FacetModel, tags: readonly string[]) {
  const own = new Set<string>();
  const reached = new Set<string>();
  const other = new Map<string, string>();
  for (const tag of tags) {
    if (!tag?.trim()) continue;
    const slug = model.resolve(tag);
    if (slug === undefined) {
      const key = tagSlug(tag);
      if (key && !other.has(key)) other.set(key, tag.trim());
      continue;
    }
    own.add(slug);
    for (const up of model.ancestors(slug)) reached.add(up);
  }
  return { own, reached, other };
}

/**
 * Counts within a set of recipes — the whole corpus for `/tags` and the
 * edit form, the current results for search, a term's recipes for its
 * "Narrow" chips. Each recipe counts once per term, however many of the
 * term's descendants (or aliases) it carries.
 */
export function countFacets(
  model: FacetModel,
  recipes: Iterable<FacetRecipe>,
): FacetCounts {
  const subtree = new Map<string, number>();
  const drinks = new Map<string, number>();
  const own = new Map<string, number>();
  const ownDrinks = new Map<string, number>();
  const groups = new Map<FacetGroupId, number>();
  const kinds: Record<FacetKind, number> = { food: 0, drinks: 0 };
  const other = new Map<string, OtherTag>();
  const kindOf = new Map(model.groups.map((group) => [group.id, group.kind]));
  let total = 0;

  for (const recipe of recipes) {
    total += 1;
    const found = reach(model, recipe.tags ?? []);
    const isDrink = found.reached.has(DRINK_ROOT);
    kinds[isDrink ? "drinks" : "food"] += 1;
    for (const slug of found.own) {
      bump(own, slug);
      if (isDrink) bump(ownDrinks, slug);
    }
    const placed = new Set<FacetGroupId>();
    for (const slug of found.reached) {
      bump(subtree, slug);
      if (isDrink) bump(drinks, slug);
      for (const id of model.groupsOf(slug)) placed.add(id);
    }
    for (const id of placed) {
      if (kindOf.get(id) === "drinks" && !isDrink) continue;
      bump(groups, id);
    }
    /* A term no group places — a carried-only string — is an other tag. */
    for (const slug of found.own) {
      if (placedAnywhere(model, slug)) continue;
      const term = model.terms.get(slug);
      found.other.set(slug, term?.label ?? slug);
    }
    for (const [slug, label] of found.other) {
      const entry = other.get(slug);
      if (entry) entry.count += 1;
      else other.set(slug, { slug, label, count: 1 });
    }
  }

  return {
    total,
    kinds,
    subtree,
    drinks,
    own,
    ownDrinks,
    groups,
    other: [...other.values()].sort(
      (a, b) => b.count - a.count || compareLabels(a, b),
    ),
  };
}

/** Is the term (or an ancestor) a group's root or row? */
function placedAnywhere(model: FacetModel, slug: string): boolean {
  return model
    .ancestors(slug)
    .some((up) => model.groupsOf(up).length > 0 || up === DRINK_ROOT);
}

function compareLabels(
  a: { label: string; slug: string },
  b: { label: string; slug: string },
): number {
  return (
    a.label.localeCompare(b.label) ||
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  );
}

// --- groups and rows -------------------------------------------------------------

export interface FacetRow {
  slug: string;
  label: string;
  /** Recipes in the set under this term (its subtree, distinct). */
  count: number;
  /**
   * Recipes in the set carrying this term itself (or an alias) — drinks only
   * in a drinks group, as `count` is.
   */
  ownCount: number;
  /** 0 for a group's top-level row, 1 for its child (Cookies › Linzer)… */
  depth: number;
  group: FacetGroupId;
  /** The record's other spellings that are its own (`ownAliases`' rule). */
  aliases?: string[];
  image?: string;
  /** Holidays: the `HOLIDAY_RULES` key that dates it (`holidayRuleKey`). */
  rule?: string;
  /** Narrower rows, sorted as their parent's siblings are. */
  children: FacetRow[];
}

export interface FacetGroup extends Omit<FacetGroupShape, "rows"> {
  /** Distinct recipes in the set the group places — "Course 571". */
  total: number;
  /** Top-level rows, sorted; empty rows dropped unless asked for. */
  rows: FacetRow[];
}

export interface FacetGroupOptions {
  /** Keep rows nothing in the set carries (the edit form's picker). */
  includeEmpty?: boolean;
  /** Slugs kept even at 0 — a selected row never vanishes under the pointer. */
  keep?: Iterable<string>;
  /** Biggest first (default), or by label (the edit form's picker). */
  sort?: "count" | "label";
  /** `FACET_GROUPS`' order (default), or the biggest group first. */
  order?: "fixed" | "total";
  /** Only the groups of this kind (and the `"any"` ones). */
  kind?: FacetKind;
}

/**
 * The groups with their rows counted (`countFacets`), nested children
 * included. A group with no rows left is dropped, unless `includeEmpty`.
 * Ties are stable: label, then slug.
 */
export function facetGroups(
  model: FacetModel,
  counts: FacetCounts,
  {
    includeEmpty = false,
    keep,
    sort = "count",
    order = "fixed",
    kind,
  }: FacetGroupOptions = {},
): FacetGroup[] {
  const kept = new Set(keep ?? []);
  const compare =
    sort === "label"
      ? compareLabels
      : (a: FacetRow, b: FacetRow) => b.count - a.count || compareLabels(a, b);
  const recordSlugs = new Set(
    [...model.terms.values()].filter((t) => t.record).map((t) => t.slug),
  );

  const groups: FacetGroup[] = [];
  for (const shape of model.groups) {
    if (kind && shape.kind !== kind && shape.kind !== "any") continue;
    const countsOf = shape.kind === "drinks" ? counts.drinks : counts.subtree;
    const build = (
      slug: string,
      depth: number,
      seen: Set<string>,
    ): FacetRow | null => {
      if (seen.has(slug)) return null;
      const term = model.terms.get(slug);
      if (!term) return null;
      const visiting = new Set(seen).add(slug);
      const count = countsOf.get(slug) ?? 0;
      const childRows = model
        .children(slug)
        .map((child) => build(child, depth + 1, visiting))
        .filter((row): row is FacetRow => row !== null)
        .sort(compare);
      if (
        count === 0 &&
        !includeEmpty &&
        !kept.has(slug) &&
        childRows.length === 0
      ) {
        return null;
      }
      const aliases = ownAliasesOf(term, recordSlugs);
      const rule =
        shape.id === "holidays"
          ? holidayRuleKey(
              slug,
              aliases.map((alias) => tagSlug(alias)),
            )
          : undefined;
      return {
        slug,
        label: term.label,
        count,
        ownCount:
          (shape.kind === "drinks" ? counts.ownDrinks : counts.own).get(slug) ??
          0,
        depth,
        group: shape.id,
        ...(aliases.length ? { aliases } : {}),
        ...(term.image ? { image: term.image } : {}),
        ...(rule ? { rule } : {}),
        children: childRows,
      };
    };
    const rows = shape.rows
      .map((slug) => build(slug, 0, new Set(shape.root ? [shape.root] : [])))
      .filter((row): row is FacetRow => row !== null)
      .sort(compare);
    if (rows.length === 0 && !includeEmpty) continue;
    groups.push({ ...shape, total: counts.groups.get(shape.id) ?? 0, rows });
  }
  if (order === "total") {
    const index = new Map(model.groups.map((group, i) => [group.id, i]));
    groups.sort(
      (a, b) =>
        b.total - a.total || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0),
    );
  }
  return groups;
}

/**
 * A term's other spellings, as `/tags` prints them (`ownAliases`): not one
 * that is a record's own slug — this term's or another's — each slug once.
 */
function ownAliasesOf(term: FacetTerm, records: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  return (term.aliases ?? []).filter((alias) => {
    const key = tagSlug(alias);
    if (!key || records.has(key) || key === term.slug || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** A group's rows depth-first, children right after their parent. */
export function flattenRows(rows: readonly FacetRow[]): FacetRow[] {
  return rows.flatMap((row) => [row, ...flattenRows(row.children)]);
}

/**
 * The first `limit` top-level rows, plus any kept (selected) row past the
 * cut, and how many were left out — "Tequila 16 · Vodka 15 · 5 more".
 */
export function limitRows(
  rows: readonly FacetRow[],
  limit: number,
  keep?: Iterable<string>,
): { rows: FacetRow[]; hidden: number } {
  const kept = new Set(keep ?? []);
  const holds = (row: FacetRow): boolean =>
    kept.has(row.slug) || row.children.some(holds);
  const shown = rows.filter((row, index) => index < limit || holds(row));
  return { rows: shown, hidden: rows.length - shown.length };
}

/**
 * Rows that would narrow a set further — a term page's "Narrow Christmas"
 * chips (counts from `countFacets` over the term's recipes): every row of
 * every group, any depth, that some but not all of the set carries, minus
 * `exclude` (the page's own term), its ancestors and its descendants.
 * Biggest first, at most `limit`.
 */
export function narrowRows(
  model: FacetModel,
  counts: FacetCounts,
  {
    exclude = [],
    limit = Infinity,
    kind,
  }: { exclude?: Iterable<string>; limit?: number; kind?: FacetKind } = {},
): FacetRow[] {
  const out = new Set<string>();
  for (const slug of exclude) {
    const below = new Set<string>();
    const stack = [slug];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (below.has(current)) continue;
      below.add(current);
      stack.push(...model.children(current));
    }
    for (const term of [...model.ancestors(slug), ...below]) out.add(term);
  }
  const seen = new Set<string>();
  return facetGroups(model, counts, { kind })
    .flatMap((group) => flattenRows(group.rows))
    .filter((row) => {
      if (out.has(row.slug) || seen.has(row.slug)) return false;
      seen.add(row.slug);
      return row.count > 0 && row.count < counts.total;
    })
    .sort((a, b) => b.count - a.count || compareLabels(a, b))
    .slice(0, limit);
}

// --- the query (D3: `tag:` terms in `?q=`, AND) -------------------------------------

/** The slugs the query positively filters on, resolved through the model. */
export function activeFacetSlugs(model: FacetModel, raw: string): Set<string> {
  const active = new Set<string>();
  for (const term of filterTerms(parseQuery(raw).filter)) {
    if (term.negated) continue;
    if (term.node.type !== "text" || term.node.field !== "tag") continue;
    const slug = model.resolve(term.node.value);
    if (slug !== undefined) active.add(slug);
  }
  return active;
}

/** Drop every `tag:` term (of `sign`) that names `slug`, one at a time. */
function removeTagTerms(
  model: FacetModel,
  raw: string,
  slug: string,
  sign: "positive" | "negated" | "both",
): string {
  let current = raw;
  for (let guard = 0; guard < 64; guard += 1) {
    const doomed = filterTerms(parseQuery(current).filter).find(
      (term) =>
        term.node.type === "text" &&
        term.node.field === "tag" &&
        (sign === "both" || term.negated === (sign === "negated")) &&
        model.resolve(term.node.value) === slug,
    );
    if (!doomed) return current;
    const next = removeTermAt(current, doomed);
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * A facet row's click: remove every positive `tag:` term naming the row's
 * term (by any spelling — `tag:Mains` and `tag:main` are one term); else, if
 * the query excludes the term (`-tag:sour`), remove that exclusion — the row
 * goes back to neutral rather than asking for both; else append
 * `tag:<slug>`. AND, as every `tag:` term already is (D3).
 */
export function toggleFacet(
  model: FacetModel,
  raw: string,
  slug: string,
): string {
  if (activeFacetSlugs(model, raw).has(slug)) {
    return removeTagTerms(model, raw, slug, "positive");
  }
  const cleared = removeTagTerms(model, raw, slug, "negated");
  if (cleared !== raw) return cleared;
  return appendFilterTerm(raw, "tag", slug);
}

/** What Kind the query asks for: `tag:drink` → drinks, `-tag:drink` → food. */
export function queryKind(
  model: FacetModel,
  raw: string,
): FacetKind | undefined {
  let kind: FacetKind | undefined;
  for (const term of filterTerms(parseQuery(raw).filter)) {
    if (term.node.type !== "text" || term.node.field !== "tag") continue;
    if (model.resolve(term.node.value) !== DRINK_ROOT) continue;
    const said: FacetKind = term.negated ? "food" : "drinks";
    if (kind && kind !== said) return undefined;
    kind = said;
  }
  return kind;
}

/**
 * Set the Kind row: drop every `tag:drink` / `-tag:drink`, then write the
 * one `kind` means (none for `undefined` — both kinds).
 */
export function setQueryKind(
  model: FacetModel,
  raw: string,
  kind: FacetKind | undefined,
): string {
  const base = removeTagTerms(model, raw, DRINK_ROOT, "both");
  if (kind === undefined) return base;
  const term = kind === "drinks" ? `tag:${DRINK_ROOT}` : `-tag:${DRINK_ROOT}`;
  const trimmed = base.trimEnd();
  return trimmed ? `${trimmed} ${term}` : term;
}

/** `tag:a tag:b` (and the Kind term) — /tags' Combine, a fresh query. */
export function facetQuery(slugs: readonly string[], kind?: FacetKind): string {
  const terms = [...new Set(slugs)].map(
    (slug) => `tag:${quoteQueryValue(slug)}`,
  );
  if (kind === "drinks") terms.push(`tag:${DRINK_ROOT}`);
  if (kind === "food") terms.push(`-tag:${DRINK_ROOT}`);
  return terms.join(" ");
}

/** `/search?q=…` for `facetQuery` — "Show 38 recipes →". */
export function facetSearchHref(
  slugs: readonly string[],
  kind?: FacetKind,
): string {
  return `/search?q=${encodeURIComponent(facetQuery(slugs, kind))}`;
}
