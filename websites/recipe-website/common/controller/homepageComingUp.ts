import type { TermHierarchyNode } from "./tagVocabulary";

/**
 * The homepage's "Coming up" section, as plain values (usability pass,
 * 2026-10-15): the children of the `holidays` root (epic 34e), each with how
 * many recipes and plans sit under it and a picture to show.
 *
 * Which ones show and in what order is a question about *today*, which the
 * static export cannot answer at build time — so this hands over every
 * holiday that leads somewhere, and the browser orders and cuts them
 * (`ComingUp`, by `holidayDates.ts`).
 */

/** The root whose children are the holidays. */
export const HOLIDAYS_ROOT = "holidays";

/** The fields of a by-term row this needs. */
export interface ComingUpRow {
  slug: string;
  date?: number;
  image?: string;
}

export interface ComingUpEntry {
  slug: string;
  label: string;
  /** Distinct recipes of the holiday and every term under it. */
  recipes: number;
  /** Distinct groups ("plans") of the same subtree. */
  groups: number;
  /** The term record's own picture. */
  image?: string;
  /** Else the newest recipe under it that has a photo. */
  recipeImage?: { slug: string; image: string; name?: string };
}

function subtree(node: TermHierarchyNode): string[] {
  return [node.slug, ...node.children.flatMap(subtree)];
}

/**
 * The holidays, in the tree's order, or `null` when there is no `holidays`
 * root at all — the cue to render no section. A holiday nothing is tagged
 * with is left out: a card that leads to an empty page is a dead end.
 *
 * `recipeRows` and `groupRows` are a term's **own** carriers (the by-term
 * maps' items); the subtree is walked here, and a recipe tagged both
 * `christmas` and a child of it counts once.
 */
export function comingUpEntries(
  tree: TermHierarchyNode[],
  recipeRows: (slug: string) => Array<ComingUpRow & { name?: string }>,
  groupRows: (slug: string) => ComingUpRow[],
  root: string = HOLIDAYS_ROOT,
): ComingUpEntry[] | null {
  const holidays = tree.find((node) => node.slug === root);
  if (!holidays) return null;
  return holidays.children
    .map((node): ComingUpEntry => {
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
        slug: node.slug,
        label: node.label,
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
    })
    .filter((entry) => entry.recipes + entry.groups > 0);
}
