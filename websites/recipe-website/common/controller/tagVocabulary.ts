import type { TaxonomyTerm } from "@discontent/cms/taxonomies/types";
import type { TermTree } from "@discontent/cms/taxonomies/tree";
import type { GroupListEntry } from "./groupPaginationConfig";
import type { RecipeListEntry } from "./paginationConfigs";
import { tagSlug } from "./tagSlug";

/**
 * The join, as pure functions: folds + records + tree → what a page renders.
 *
 * Its own module, and deliberately free of Next, LMDB and the engine's readers
 * — everything here takes plain values and returns plain values. Two reasons.
 * The rules below are the *whole* of what 24c decides (which label wins, what
 * order the recipes come in, where the breadcrumb stops), and a unit test that
 * had to build an LMDB fixture to check "the record's label beats the fold's"
 * would pin the plumbing instead of the rule. And `readTermPage.ts` above it
 * builds cached reads at module scope, so anything importing *this* for the
 * rules alone would otherwise drag `unstable_cache` in with it.
 *
 * The one thing it does not do is read. `readTermPage.ts` is the reading half.
 */

/** One row of `/tags`: a slug, what to print, and how many things carry it. */
export interface TagVocabularyEntry {
  slug: string;
  label: string;
  count: number;
}

/** One step of a term page's breadcrumb: where it links and what it prints. */
export interface TermCrumb {
  slug: string;
  label: string;
}

/**
 * Everything the term page renders, resolved (24c).
 *
 * A flat record rather than the three sources it came from, so `TagPage` takes
 * one prop and the route decides everything: which label won, which recipes are
 * pinned, how far the breadcrumb walks.
 */
export interface TermPageData {
  slug: string;
  label: string;
  description?: string;
  image?: string;
  /**
   * Root first, this term last — so the trail reads left to right. Labels
   * only, no counts (34a): an ancestor's honest count is its whole subtree,
   * and reading that would tie every page under a root to every term under it.
   */
  breadcrumb: TermCrumb[];
  /**
   * Direct children only, in the tree's order. Each `count` is the distinct
   * recipes and groups of the child **and everything under it** (34a) — what
   * the child's own page lists, and what `/tags`' tree prints beside it.
   */
  children: TagVocabularyEntry[];
  /**
   * The term's recipes and every descendant's (34a, D1): deduped, pinned
   * first, then newest first — what `tag:<term>` finds — capped at
   * `TERM_PAGE_RECIPE_LIMIT` (pins are always kept).
   */
  recipes: RecipeListEntry[];
  /** How many recipes the whole subtree has, before the cap — the "M". */
  recipeCount: number;
  /**
   * How many recipes carry this term itself (or one of its aliases) — the
   * page's "N here".
   */
  ownRecipeCount: number;
  /** The term's groups and every descendant's, deduped, newest first. */
  groups: GroupListEntry[];
}

/**
 * Every term the site has, from all three sources, counts summed.
 *
 * **Record label beats both folds.** A fold's label is the first normalised
 * spelling it happened to see on a carrier; a record's is the vocabulary's own,
 * typed by a curator, and that is the whole reason records exist. Between the
 * two folds, recipes win — the corpus is overwhelmingly recipes, and one label
 * has to win a slug collision somewhere (F8's first-label-wins rule, applied
 * across carriers rather than within one).
 *
 * **A record with no carriers is a row at count 0.** "Holiday 0" on `/tags` is
 * the intended reading of a term someone has defined and not yet assigned, not
 * a bug — the hybrid's whole claim is that a record and an assignment are
 * independent things.
 *
 * Sorted by slug, as `tagIndexRoute` has always sorted.
 */
export function mergeTagVocabulary({
  recipeTerms,
  groupTerms,
  tree,
}: {
  recipeTerms?: TaxonomyTerm[] | null;
  groupTerms?: TaxonomyTerm[] | null;
  tree?: TermTree | null;
}): TagVocabularyEntry[] {
  const merged = new Map<string, { label: string; count: number }>();

  for (const term of recipeTerms ?? []) {
    merged.set(term.slug, { label: term.label, count: term.count });
  }
  for (const term of groupTerms ?? []) {
    const existing = merged.get(term.slug);
    if (existing) existing.count += term.count;
    else merged.set(term.slug, { label: term.label, count: term.count });
  }
  for (const [slug, node] of Object.entries(tree ?? {})) {
    const existing = merged.get(slug);
    if (existing) existing.label = node.label;
    else merged.set(slug, { label: node.label, count: 0 });
  }

  return [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([slug, { label, count }]) => ({ slug, label, count }));
}

/**
 * The parent chain, root first, this term last.
 *
 * `parent` is scalar, so this is a walk and not a search — which is the whole
 * argument D2 makes for a scalar reference. The visited set is not defensive
 * tidiness: the tree fold is explicitly allowed to hand back a hand-edited
 * cycle (`A.parent = B`, `B.parent = A` is two lines a text editor can write),
 * and a breadcrumb that looped on one would hang the render. It stops at the
 * first slug it has already seen and reports the trail it has.
 *
 * A term absent from the tree gets a one-element trail — itself — because a
 * record-less term still has a page.
 */
export function breadcrumbOf(
  tree: TermTree | null | undefined,
  slug: string,
  counts?: Map<string, TagVocabularyEntry>,
): TagVocabularyEntry[] {
  const trail: TagVocabularyEntry[] = [];
  const seen = new Set<string>();
  let current: string | undefined = slug;

  while (current && !seen.has(current)) {
    seen.add(current);
    const node: TermTree[string] | undefined = tree?.[current];
    trail.push(
      counts?.get(current) ?? {
        slug: current,
        label: node?.label ?? current,
        count: 0,
      },
    );
    current = node?.parent;
  }

  return trail.reverse();
}

/**
 * The term's direct children, in the tree's order, each with its own count.
 *
 * The tree's order is the fold's — oldest first, the order the index walk
 * produced — and it is kept rather than re-sorted, because that is the order
 * `TermTreeNode.children` documents and the one a second reader would expect.
 * A child the vocabulary has no count for renders at 0, exactly as a
 * record-only term does on `/tags`.
 */
export function childrenOf(
  tree: TermTree | null | undefined,
  slug: string,
  counts?: Map<string, TagVocabularyEntry>,
): TagVocabularyEntry[] {
  const node = tree?.[slug];
  if (!node) return [];
  return node.children.map(
    (child) =>
      counts?.get(child) ?? {
        slug: child,
        label: tree?.[child]?.label ?? child,
        count: 0,
      },
  );
}

/**
 * Every slug at or under `slug` in the tree, `slug` first, then depth-first in
 * the tree's child order (34a, D1) — the terms whose carriers a term page
 * lists, and the set `tag:<slug>` expands to.
 *
 * A walk over `children` with a visited set, the `termHierarchy` pattern: the
 * tree fold may hand back a hand-edited cycle, and this must terminate on it.
 * A slug the tree does not hold is a subtree of one — itself — because a
 * record-less term still has a page; only a record can have children.
 */
export function subtreeSlugs(
  tree: TermTree | null | undefined,
  slug: string,
): string[] {
  const seen = new Set<string>();
  const walk = (current: string) => {
    if (seen.has(current)) return;
    seen.add(current);
    for (const child of tree?.[current]?.children ?? []) walk(child);
  };
  walk(slug);
  return [...seen];
}

/**
 * The by-term keys one term's carriers sit under: its slug, then the slug of
 * each of its record's aliases (32i) — a recipe still tagged with an alias is
 * the term's, as `tag:` finds it (`tagExpansion.ts`'s `ownAliasSpellings`).
 *
 * An alias whose slug is another record's own slug is left out, as the
 * expansion leaves it out: a record's own spelling beats any alias. (The
 * expansion also guards a record's *label*; a by-term key is a slug, so the
 * slug check is the one that applies here.)
 */
export function termKeys(
  tree: TermTree | null | undefined,
  slug: string,
): string[] {
  const keys = new Set([slug]);
  for (const alias of tree?.[slug]?.aliases ?? []) {
    const key = tagSlug(alias);
    if (key && !tree?.[key]) keys.add(key);
  }
  return [...keys];
}

/**
 * Every by-term key a term page reads (34a): `termKeys` of each slug in
 * `subtreeSlugs(tree, slug)`, each once.
 */
export function subtreeKeys(
  tree: TermTree | null | undefined,
  slug: string,
): string[] {
  return [
    ...new Set(
      subtreeSlugs(tree, slug).flatMap((term) => termKeys(tree, term)),
    ),
  ];
}

/**
 * How many recipes a term page lists before it links to search for the rest
 * (34a): pinned first, then the newest, up to this many. A card costs ~10 KB
 * of HTML and RSC payload, and `/tags/course` would otherwise carry 450.
 */
export const TERM_PAGE_RECIPE_LIMIT = 48;

/**
 * Several terms' by-term rows as one list (34a): each carrier once, newest
 * first — the fold's own order (date, then slug, both descending), so a single
 * term's rows come back exactly as the fold wrote them.
 */
export function mergeTermRows<TItem extends { slug: string; date: number }>(
  lists: ReadonlyArray<readonly TItem[] | null | undefined>,
): TItem[] {
  const bySlug = new Map<string, TItem>();
  for (const list of lists) {
    for (const item of list ?? []) {
      if (!bySlug.has(item.slug)) bySlug.set(item.slug, item);
    }
  }
  return [...bySlug.values()].sort(
    (a, b) =>
      b.date - a.date || (a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0),
  );
}

/** One term's by-term row, as `byTerm.readKey` answers it. */
export interface TermRow<TItem> {
  label: string;
  items: TItem[];
}

/**
 * One term's page from its subtree's per-term rows (34a, D2) — the pure half
 * of `resolveTermPage`, or `null` when the slug names nothing at all: no
 * record, and nothing in its subtree carries anything.
 *
 * `recipeRows` and `groupRows` answer for every key of
 * `subtreeKeys(tree, slug)`, and nothing else is read: the breadcrumb is the
 * tree's labels, and each child's count is the distinct carriers of the
 * child's own subtree — a subset of this one, so its rows are already here.
 * Labels keep `mergeTagVocabulary`'s precedence: the record (or its tree node)
 * beats the recipe fold, which beats the group fold, which beats the slug.
 *
 * The recipe list is capped at `limit` (pinned first, then the newest);
 * `recipeCount` is the whole subtree's. Groups are not capped.
 */
export function termPageData({
  slug,
  tree,
  record,
  recipeRows,
  groupRows,
  limit = TERM_PAGE_RECIPE_LIMIT,
}: {
  slug: string;
  tree: TermTree | null | undefined;
  record?: {
    label: string;
    description?: string;
    image?: string;
    pinned?: string[];
  } | null;
  recipeRows: (key: string) => TermRow<RecipeListEntry> | null | undefined;
  groupRows: (key: string) => TermRow<GroupListEntry> | null | undefined;
  limit?: number;
}): TermPageData | null {
  const keysOf = (slugs: string[]) => [
    ...new Set(slugs.flatMap((term) => termKeys(tree, term))),
  ];
  const recipesOf = (slugs: string[]) =>
    mergeTermRows(keysOf(slugs).map((key) => recipeRows(key)?.items));
  const groupsOf = (slugs: string[]) =>
    mergeTermRows(keysOf(slugs).map((key) => groupRows(key)?.items));
  const subtree = subtreeSlugs(tree, slug);
  const recipes = recipesOf(subtree);
  const groups = groupsOf(subtree);

  if (!record && recipes.length === 0 && groups.length === 0) return null;

  /*
   * The curated front (D5 option 2): pinned recipes first in the record's
   * order, then the rest newest-first — and groups after both, as their own
   * section, because a recipe card and a group card are different cards.
   * Every pin is kept even past the cap; the newest fill the rest.
   */
  const listed = new Set(recipes.map((recipe) => recipe.slug));
  const pinnedCount = new Set(
    (record?.pinned ?? []).filter((pin) => listed.has(pin)),
  ).size;
  const shown = applyPinned(recipes, record?.pinned).slice(
    0,
    Math.max(limit, pinnedCount),
  );

  const labelOf = (term: string) =>
    tree?.[term]?.label ??
    recipeRows(term)?.label ??
    groupRows(term)?.label ??
    term;
  const label = record?.label ?? labelOf(slug);

  return {
    slug,
    label,
    ...(record?.description ? { description: record.description } : {}),
    ...(record?.image ? { image: record.image } : {}),
    breadcrumb: breadcrumbOf(tree, slug).map((crumb) => ({
      slug: crumb.slug,
      label: crumb.slug === slug ? label : labelOf(crumb.slug),
    })),
    children: (tree?.[slug]?.children ?? []).map((child) => {
      const under = subtreeSlugs(tree, child);
      return {
        slug: child,
        label: labelOf(child),
        count: recipesOf(under).length + groupsOf(under).length,
      };
    }),
    recipes: shown,
    recipeCount: recipes.length,
    ownRecipeCount: recipesOf([slug]).length,
    groups,
  };
}

/** One node of `/tags`' tree (31b): a term, its subtree total, its children. */
export interface TermHierarchyNode extends TagVocabularyEntry {
  /** Distinct carriers of this term or anything under it. */
  total: number;
  children: TermHierarchyNode[];
}

/**
 * The hierarchy `/tags` draws (31b): every root that has children, with each
 * node's **distinct** carriers across its subtree — a recipe tagged both
 * `cookies` and `linzer-cookies` counts once under `cookies`, which is what
 * `tag:cookies` now returns. Terms outside any hierarchy are left to the flat
 * list below it.
 *
 * `carriers(slug)` is a term's own carriers as opaque keys (the reader passes
 * `recipe:<slug>` and `group:<slug>`). The walk keeps a visited set, so a
 * hand-edited cycle terminates, as the tree's own fold does.
 */
export function termHierarchy(
  tree: TermTree | null | undefined,
  counts: Map<string, TagVocabularyEntry>,
  carriers: (slug: string) => string[],
): TermHierarchyNode[] {
  if (!tree) return [];
  const build = (slug: string, seen: Set<string>): TermHierarchyNode | null => {
    if (seen.has(slug)) return null;
    const visiting = new Set(seen).add(slug);
    const entry = counts.get(slug) ?? {
      slug,
      label: tree[slug]?.label ?? slug,
      count: 0,
    };
    const children = (tree[slug]?.children ?? [])
      .filter((child) => child !== slug)
      .map((child) => build(child, visiting))
      .filter((node): node is TermHierarchyNode => node !== null);
    const reached = new Set(carriers(slug));
    const collect = (node: TermHierarchyNode) => {
      for (const key of carriers(node.slug)) reached.add(key);
      node.children.forEach(collect);
    };
    children.forEach(collect);
    return { ...entry, total: reached.size, children };
  };
  return Object.entries(tree)
    .filter(
      ([slug, node]) =>
        node.children.some((child) => child !== slug) &&
        (!node.parent || !tree[node.parent] || node.parent === slug),
    )
    .map(([slug]) => build(slug, new Set()))
    .filter((node): node is TermHierarchyNode => node !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** `/tags`' board (U4): the hierarchy, the loose records, and every record. */
export interface TagBoard {
  /** One block each: the roots `termHierarchy` draws. */
  roots: TermHierarchyNode[];
  /**
   * Records outside any hierarchy — no parent the tree knows, no children —
   * for the "More tags" block, most carried first.
   */
  loose: TermHierarchyNode[];
  /** Every slug with a record: the rest of the vocabulary is bare tags. */
  recorded: string[];
}

/**
 * `/tags` as a board of count bars (usability pass, U4), from the same tree
 * and counts as `termHierarchy`: its roots become blocks, and the records it
 * leaves out — a term with a record but no place in a hierarchy — become the
 * "More tags" block. A loose term's total is its own distinct carriers.
 */
export function termBoard(
  tree: TermTree | null | undefined,
  counts: Map<string, TagVocabularyEntry>,
  carriers: (slug: string) => string[],
): TagBoard {
  if (!tree) return { roots: [], loose: [], recorded: [] };
  const roots = termHierarchy(tree, counts, carriers);
  const placed = new Set<string>();
  const mark = (node: TermHierarchyNode) => {
    placed.add(node.slug);
    node.children.forEach(mark);
  };
  roots.forEach(mark);
  const loose = Object.keys(tree)
    .filter((slug) => !placed.has(slug))
    .map((slug): TermHierarchyNode => {
      const entry = counts.get(slug) ?? {
        slug,
        label: tree[slug]?.label ?? slug,
        count: 0,
      };
      return { ...entry, total: new Set(carriers(slug)).size, children: [] };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  return { roots, loose, recorded: Object.keys(tree) };
}

/**
 * The curated front: pinned items first, in the pinned order, then the rest.
 *
 * **A pinned slug the term does not carry is dropped**, rather than rendered as
 * a hole or promoted into the list. `pinned` and `tags` are independent writes —
 * untagging a recipe does not touch the term's record — so a stale pin is an
 * ordinary state rather than a broken one, and the page's job is to go on
 * reading correctly. 24e's `term_update` is what refuses to *store* one.
 *
 * Stable in both halves: the pinned run is in the record's order, and the
 * remainder keeps whatever order it arrived in (newest first, from the fold).
 */
export function applyPinned<TItem extends { slug: string }>(
  items: TItem[],
  pinned?: string[],
): TItem[] {
  if (!pinned?.length) return items;

  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const head: TItem[] = [];
  const taken = new Set<string>();
  for (const slug of pinned) {
    const item = bySlug.get(slug);
    if (!item || taken.has(slug)) continue;
    taken.add(slug);
    head.push(item);
  }
  if (head.length === 0) return items;

  return [...head, ...items.filter((item) => !taken.has(item.slug))];
}

/**
 * A tag as `/make`'s picker needs it (epic 28, 28g): the slug its chip puts
 * in the query, the label it prints, and the parent it hangs under.
 *
 * `parent` is kept only when it names a term the vocabulary has and the walk
 * up from here never comes back: a hand-edited cycle (`A.parent = B`,
 * `B.parent = A`) would otherwise leave both terms with a parent and neither
 * reachable from a root, so neither would ever show. Each term in a cycle
 * becomes a root instead.
 */
export interface TagOption {
  slug: string;
  label: string;
  parent?: string;
  /**
   * The record's aliases (32i, D5), absent when it has none: other spellings
   * that search, autocomplete and `/tags/<alias>` resolve to this term.
   */
  aliases?: string[];
  /**
   * `true` when the term has a record (32i): its own slug and label then beat
   * any other term's alias in `tag:` (`tagExpansion.ts`). Absent otherwise.
   */
  record?: true;
}

export function tagOptions(
  vocabulary: TagVocabularyEntry[],
  tree: TermTree | null | undefined,
): TagOption[] {
  const known = new Set(vocabulary.map((entry) => entry.slug));
  function cycles(slug: string): boolean {
    const seen = new Set<string>([slug]);
    let current = tree?.[slug]?.parent;
    while (current && known.has(current)) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = tree?.[current]?.parent;
    }
    return false;
  }
  return vocabulary.map(({ slug, label }) => {
    const node = tree?.[slug];
    const parent = node?.parent;
    return {
      slug,
      label,
      ...(parent && known.has(parent) && !cycles(slug) ? { parent } : {}),
      ...(node?.aliases?.length ? { aliases: node.aliases } : {}),
      ...(node ? { record: true as const } : {}),
    };
  });
}

/**
 * The term a slug is an alias of (32i, D5), or `undefined` when no record
 * lists it — what `/tags/<alias>` redirects to.
 *
 * Matched by slug, as every carrier string is: an alias stored as "Christmas
 * Biscuits" answers `/tags/christmas-biscuits`. A record never redirects to
 * itself, and when two records claim the same alias (a hand edit; the seat
 * refuses it) the first by slug wins, so the answer is stable.
 */
export function aliasTarget(
  tree: TermTree | null | undefined,
  slug: string,
): string | undefined {
  for (const [term, node] of Object.entries(tree ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (term === slug) continue;
    if (node.aliases?.some((alias) => tagSlug(alias) === slug)) return term;
  }
  return undefined;
}

/**
 * Every alias slug the tree lists that is not a term of its own — the extra
 * pages a static export emits so `/tags/<alias>` lands somewhere (32i).
 */
export function aliasSlugs(
  tree: TermTree | null | undefined,
  taken: ReadonlySet<string>,
): string[] {
  const slugs = new Set<string>();
  for (const node of Object.values(tree ?? {})) {
    for (const alias of node.aliases ?? []) {
      const slug = tagSlug(alias);
      if (slug && !taken.has(slug)) slugs.add(slug);
    }
  }
  return [...slugs].sort();
}

/** One choice in the term form's Parent select (31e): a record, indented. */
export interface TermParentOption {
  slug: string;
  label: string;
  /** How far below a root it sits; the select indents by it. */
  depth: number;
}

/**
 * Every term a record could hang under (31e): the **records** — the tree's
 * keys, because the seat refuses a parent with no record (`unknown_term`) —
 * depth-first from the roots, siblings by label, minus `exclude` and
 * everything beneath it, because choosing one of those is the cycle the seat
 * refuses (`term_cycle`, and `24-T8` for the term itself).
 *
 * The seat still decides; this only keeps the select from offering a choice
 * it knows will be refused. A hand-edited cycle leaves its members unreachable
 * from any root, so they are appended at depth 0 rather than dropped, exactly
 * as `tagOptions` makes them roots.
 */
export function termParentOptions(
  tree: TermTree | null | undefined,
  exclude?: string,
): TermParentOption[] {
  if (!tree) return [];
  const excluded = new Set<string>();
  if (exclude) {
    const stack = [exclude];
    while (stack.length > 0) {
      const slug = stack.pop() as string;
      if (excluded.has(slug)) continue;
      excluded.add(slug);
      stack.push(...(tree[slug]?.children ?? []));
    }
  }

  const byLabel = (a: string, b: string) =>
    tree[a].label.localeCompare(tree[b].label) || a.localeCompare(b);
  const options: TermParentOption[] = [];
  const seen = new Set<string>();
  const visit = (slug: string, depth: number) => {
    if (seen.has(slug)) return;
    seen.add(slug);
    if (!excluded.has(slug)) {
      options.push({ slug, label: tree[slug].label, depth });
    }
    const children = tree[slug].children.filter(
      (child) => tree[child] !== undefined,
    );
    for (const child of children.sort(byLabel)) visit(child, depth + 1);
  };

  const slugs = Object.keys(tree).sort(byLabel);
  for (const slug of slugs) {
    const parent = tree[slug].parent;
    if (!parent || parent === slug || tree[parent] === undefined) {
      visit(slug, 0);
    }
  }
  for (const slug of slugs) visit(slug, 0);
  return options;
}
