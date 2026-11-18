import type { TermTree } from "@discontent/cms/taxonomies/tree";
import { holidayChildren, holidayRecipeOf, menuCourses } from "./holidaysPage";
import { CUISINE_ROOT } from "./homepageTonight";
import type { RecipeListEntry } from "./paginationConfigs";
import { tagSlug } from "./tagSlug";
import { subtreeKeys } from "./tagVocabulary";

/**
 * "New in the collection" (48e, canvas B), the pure half: the newest
 * recipes as **batches** — a run of recipes added on the same day, which is
 * how the curator imports (a round of Thanksgiving baking, a night of
 * Korean dinners) — each with what it mostly is; and the **cuisines** the
 * newest recipes bring.
 */

/** One batch: recipes added on one day, newest first. */
export interface FreshBatch {
  /** The day, `YYYY-MM-DD` on the server's calendar (42f's Df9). */
  day: string;
  /** Every candidate added that day, newest first. */
  slugs: string[];
  /** What it mostly is: "Thanksgiving · Desserts and Breads & doughs". */
  summary?: string;
}

/** "2026-11-09", the server's calendar day of a timestamp. */
export function serverDayOf(date: number): string {
  const day = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Tag slug → the holiday it falls under, by label, for a batch's summary. */
function holidayLookup(tree: TermTree | null | undefined): Map<string, string> {
  const found = new Map<string, string>();
  for (const slug of holidayChildren(tree)) {
    for (const key of subtreeKeys(tree, slug)) {
      if (!found.has(key)) found.set(key, tree?.[slug]?.label ?? slug);
    }
  }
  return found;
}

/**
 * The most common of `labels` (at least `min` times), most first, then in
 * first-seen order, at most `limit`.
 */
function commonest(labels: string[], min: number, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label]) => label);
}

/** "Desserts", "Desserts and Breads". */
function andList(labels: string[]): string {
  return labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The newest recipes as batches by day, newest first. A batch's summary
 * names the holiday at least half of it is filed under, then its one or two
 * commonest courses ("Drinks" for drinks) — nothing it cannot say from the
 * tags. `dayOf` is the server's calendar by default; tests pass their own.
 */
export function freshBatches(
  recipes: RecipeListEntry[],
  tree: TermTree | null | undefined,
  dayOf: (date: number) => string = serverDayOf,
): FreshBatch[] {
  const view = holidayRecipeOf(tree);
  const courseLabel = new Map(
    menuCourses(tree).map((course) => [course.slug, course.label]),
  );
  const holidays = holidayLookup(tree);
  const batches: Array<{ day: string; rows: RecipeListEntry[] }> = [];
  for (const recipe of recipes) {
    const day = dayOf(recipe.date);
    const last = batches[batches.length - 1];
    if (last && last.day === day) last.rows.push(recipe);
    else batches.push({ day, rows: [recipe] });
  }
  return batches.map(({ day, rows }) => {
    const holiday = commonest(
      rows.flatMap((row) => [
        ...new Set(
          (row.tags ?? []).flatMap((tag) => {
            const label = holidays.get(tagSlug(tag));
            return label ? [label] : [];
          }),
        ),
      ]),
      Math.max(1, Math.ceil(rows.length / 2)),
      1,
    );
    const courses = commonest(
      rows.flatMap((row) => {
        const seen = view(row);
        if (seen.kind === "drinks") return ["Drinks"];
        const label = seen.course ? courseLabel.get(seen.course) : undefined;
        return label ? [label] : [];
      }),
      1,
      2,
    );
    const summary = [...holiday, ...(courses.length ? [andList(courses)] : [])]
      .filter(Boolean)
      .join(" · ");
    return {
      day,
      slugs: rows.map((row) => row.slug),
      ...(summary ? { summary } : {}),
    };
  });
}

/** One cuisine the newest recipes bring. */
export interface FreshCuisine {
  slug: string;
  label: string;
  /** Recipes of it among the newest. */
  count: number;
  /** Their names, newest first, at most three. */
  names: string[];
  /** The newest of them with a photo, for the row's picture. */
  picture?: { slug: string; image: string; name: string };
}

/** How many cuisines "New in the collection" lists (canvas B: four). */
export const FRESH_CUISINES = 4;

/**
 * The cuisines (children of the `cuisine` root, epic 33) the newest recipes
 * are filed under, subtree and aliases included — Jamaican counts for
 * Caribbean — the most recipes first, then by label.
 */
export function freshCuisines(
  recipes: RecipeListEntry[],
  tree: TermTree | null | undefined,
  limit: number = FRESH_CUISINES,
): FreshCuisine[] {
  const children = (tree?.[CUISINE_ROOT]?.children ?? []).filter(
    (child) => child !== CUISINE_ROOT,
  );
  const cuisineOf = new Map<string, string>();
  for (const child of children) {
    for (const key of subtreeKeys(tree, child)) {
      if (!cuisineOf.has(key)) cuisineOf.set(key, child);
    }
  }
  const found = new Map<string, RecipeListEntry[]>();
  for (const recipe of recipes) {
    const own = new Set(
      (recipe.tags ?? []).flatMap((tag) => {
        const cuisine = cuisineOf.get(tagSlug(tag));
        return cuisine ? [cuisine] : [];
      }),
    );
    for (const cuisine of own) {
      found.set(cuisine, [...(found.get(cuisine) ?? []), recipe]);
    }
  }
  return [...found.entries()]
    .map(([slug, rows]): FreshCuisine => {
      const pictured = rows.find((row) => row.image);
      return {
        slug,
        label: tree?.[slug]?.label ?? slug,
        count: rows.length,
        names: rows.slice(0, 3).map((row) => row.name),
        ...(pictured?.image
          ? {
              picture: {
                slug: pictured.slug,
                image: pictured.image,
                name: pictured.name,
              },
            }
          : {}),
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
