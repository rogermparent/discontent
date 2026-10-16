import { HOLIDAYS_ROOT } from "../util/holidays";
import type { TermHierarchyNode } from "./tagVocabulary";

/**
 * The homepage's "Coming up" section, as plain values (usability pass,
 * 2026-10-15): the children of the `holidays` root (epic 34e), each with how
 * many recipes and plans sit under it and a picture to show.
 *
 * Which ones show and in what order is a question about *today*, which the
 * static export cannot answer at build time — so this hands over every
 * holiday that leads somewhere, and the browser orders and cuts them
 * (`ComingUp`, by `util/holidays.ts`).
 */

/** The root whose children are the holidays. */
export { HOLIDAYS_ROOT };

/** The fields of a by-term row this needs. */
export interface ComingUpRow {
  slug: string;
  date?: number;
  image?: string;
}

export interface ComingUpEntry extends TermSummary {
  slug: string;
  label: string;
}

function subtree(node: Pick<TermHierarchyNode, "slug" | "children">): string[] {
  return [node.slug, ...node.children.flatMap(subtree)];
}

type RecipeRows = (slug: string) => Array<ComingUpRow & { name?: string }>;
type GroupRows = (slug: string) => ComingUpRow[];

/** A term's picture and counts — what Coming up and the featured strip show. */
export interface TermSummary {
  /** Distinct recipes of the term and every term under it. */
  recipes: number;
  /** Distinct groups ("plans") of the same subtree. */
  groups: number;
  /** The term record's own picture. */
  image?: string;
  /** Else the newest recipe under it that has a photo. */
  recipeImage?: { slug: string; image: string; name?: string };
}

/** The node for `slug` anywhere in the hierarchy, or `undefined`. */
export function findTermNode(
  tree: TermHierarchyNode[],
  slug: string,
): TermHierarchyNode | undefined {
  for (const node of tree) {
    if (node.slug === slug) return node;
    const found = findTermNode(node.children, slug);
    if (found) return found;
  }
  return undefined;
}

/**
 * One term's counts and picture over its subtree. `recipeRows` and
 * `groupRows` are a term's **own** carriers (the by-term maps' items); the
 * subtree is walked here, so a recipe tagged both `christmas` and a child of
 * it counts once. A term outside the hierarchy (no record, or a leaf root) is
 * passed as a bare node and counts its own carriers.
 *
 * The picture precedence is the one every term tile on the homepage uses:
 * the record's image, else the newest recipe photo under it, else (in the
 * component) a monogram.
 */
export function termSummary(
  node: Pick<TermHierarchyNode, "slug" | "image" | "children">,
  recipeRows: RecipeRows,
  groupRows: GroupRows,
): TermSummary {
  const slugs = subtree(node);
  const recipes = new Map<string, ComingUpRow & { name?: string }>();
  for (const slug of slugs) {
    for (const row of recipeRows(slug)) recipes.set(row.slug, row);
  }
  const groups = new Set(
    slugs.flatMap((slug) => groupRows(slug).map((row) => row.slug)),
  );
  const pictured = [...recipes.values()]
    .filter((row) => row.image)
    .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
  return {
    recipes: recipes.size,
    groups: groups.size,
    ...(node.image ? { image: node.image } : {}),
    ...(!node.image && pictured?.image
      ? {
          recipeImage: {
            slug: pictured.slug,
            image: pictured.image,
            ...(pictured.name ? { name: pictured.name } : {}),
          },
        }
      : {}),
  };
}

/** The facet root whose children name a dish's course (epic 33, D1). */
export const COURSE_ROOT = "course";

/**
 * Recipe slug → its course's label ("Mains", "Desserts"), for the featured
 * strip's recipe cards. A recipe with two courses gets the bigger one; a
 * recipe with none is absent, and the card says "Recipe".
 */
export function courseLabels(
  tree: TermHierarchyNode[],
  recipeRows: RecipeRows,
): Map<string, string> {
  const labels = new Map<string, string>();
  const course = tree.find((node) => node.slug === COURSE_ROOT);
  if (!course) return labels;
  const children = [...course.children].sort((a, b) => b.total - a.total);
  for (const child of children) {
    for (const slug of subtree(child)) {
      for (const row of recipeRows(slug)) {
        if (!labels.has(row.slug)) labels.set(row.slug, child.label);
      }
    }
  }
  return labels;
}

/**
 * The holidays, in the tree's order, or `null` when there is no `holidays`
 * root at all — the cue to render no section. A holiday nothing is tagged
 * with is left out: a card that leads to an empty page is a dead end.
 */
export function comingUpEntries(
  tree: TermHierarchyNode[],
  recipeRows: RecipeRows,
  groupRows: GroupRows,
  root: string = HOLIDAYS_ROOT,
): ComingUpEntry[] | null {
  const holidays = tree.find((node) => node.slug === root);
  if (!holidays) return null;
  return holidays.children
    .map(
      (node): ComingUpEntry => ({
        slug: node.slug,
        label: node.label,
        ...termSummary(node, recipeRows, groupRows),
      }),
    )
    .filter((entry) => entry.recipes + entry.groups > 0);
}
