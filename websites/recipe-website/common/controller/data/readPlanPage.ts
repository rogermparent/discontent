import type { Group, Recipe } from "../types";
import type { ResolvedGroupItem } from "./resolveGroupItems";
import { groupItems } from "./readGroupItem";
import { recipeItems } from "./readRecipeItem";
import { tagTermReads } from "./readTagTerms";
import { tagSlug } from "../tagSlug";
import {
  holidayAliasTarget,
  holidayChildren,
  holidayRule,
} from "../holidaysPage";
import { walkGroupRecipes } from "../../util/groupShoppingWalk";
import { isDrinkRecipe } from "../../util/drinkCount";
import { readPlanTimes } from "../../util/planTimes";
import type {
  PlanHoliday,
  PlanPageData,
  PlanRecipeView,
  PlanRowView,
  PlanSubPlanView,
} from "../../util/planPage";

/**
 * The meal-plan page's reads (43p1), in both apps: the rows the route
 * already resolved (`resolveGroupItems`, one level, the plan's order), each
 * recipe's clock read from its steps (`readPlanTimes`, D5), each sub-plan's
 * own recipes walked for the row that opens in place, and the holiday the
 * plan is for, from its tags.
 *
 * Everything here goes through the cached item reads and the cached term
 * tree, so a retitled recipe or a renamed holiday shows on the next render
 * with no new invalidation (the same tags the group page already carried).
 * The result is plain data, small enough to hand to the client page: the
 * full recipes stay on the server.
 */

/** How much of a sub-plan the row lists in place. */
const SUB_PLAN_RECIPES = 48;
/** The sub-plan row's mosaic. */
const SUB_PLAN_THUMBS = 4;

function ingredientCount(recipe: Recipe): number {
  return (recipe.ingredients ?? []).filter(
    (ingredient) => ingredient.type !== "heading",
  ).length;
}

/** One recipe as a plan row shows it. */
export function planRecipeView(slug: string, recipe: Recipe): PlanRecipeView {
  return {
    slug,
    name: recipe.name,
    date: recipe.date,
    ...(recipe.image ? { image: recipe.image } : {}),
    ...(recipe.totalTime ? { totalTime: recipe.totalTime } : {}),
    ...(recipe.recipeYield?.trim()
      ? { yieldText: recipe.recipeYield.trim() }
      : {}),
    ingredientCount: ingredientCount(recipe),
    drink: isDrinkRecipe(recipe),
    times: readPlanTimes(recipe),
  };
}

async function subPlanView(
  slug: string,
  group: Group,
): Promise<PlanSubPlanView> {
  const walk = await walkGroupRecipes(slug, (child) => groupItems.read(child), {
    maxRecipes: SUB_PLAN_RECIPES,
    maxVisits: SUB_PLAN_RECIPES * 4,
  });
  const recipes = await Promise.all(
    walk.recipes.map(async ({ slug: recipeSlug }) => {
      const recipe = await recipeItems.read(recipeSlug);
      const times = recipe ? readPlanTimes(recipe) : undefined;
      return {
        slug: recipeSlug,
        name: recipe?.name ?? recipeSlug,
        ...(recipe?.image ? { image: recipe.image } : {}),
        found: Boolean(recipe),
        sheet: Boolean(times?.bake || times?.chill),
      };
    }),
  );
  return {
    slug,
    name: group.name,
    ...(group.image ? { image: group.image } : {}),
    recipes: recipes.map(({ slug: s, name, found }) => ({
      slug: s,
      name,
      found,
    })),
    thumbs: recipes
      .filter((recipe) => recipe.image)
      .slice(0, SUB_PLAN_THUMBS)
      .map(({ slug: s, image }) => ({ slug: s, image: image! })),
    ...(walk.truncated ? { truncated: true } : {}),
    /* Any recipe it cooks bakes or chills (`hasRunSheet`'s test). */
    ...(recipes.some((recipe) => recipe.sheet) ? { sheet: true as const } : {}),
  };
}

/** The holiday a plan is for: its first tag that is a holiday, or one's alias. */
export async function readPlanHoliday(
  tags: readonly string[] | undefined,
): Promise<PlanHoliday | undefined> {
  if (!tags || tags.length === 0) return undefined;
  const tree = await tagTermReads.tree.read().catch(() => null);
  if (!tree) return undefined;
  const holidays = holidayChildren(tree);
  for (const tag of tags) {
    const slug = tagSlug(tag);
    const target = holidays.includes(slug)
      ? { slug, label: tree[slug]?.label ?? tag }
      : holidayAliasTarget(tree, slug);
    if (!target) continue;
    const rule = holidayRule(tree, target.slug);
    return {
      slug: target.slug,
      label: target.label,
      ...(rule ? { rule } : {}),
    };
  }
  return undefined;
}

/** The page's data, from the group and the rows `resolveGroupItems` read. */
export async function readPlanPage(
  group: Group,
  slug: string,
  items: ResolvedGroupItem[],
): Promise<PlanPageData> {
  const [rows, holiday] = await Promise.all([
    Promise.all(
      items.map(
        async ({ item, recipe, group: child }): Promise<PlanRowView> => {
          if (item.group !== undefined) {
            return child
              ? { item, group: await subPlanView(item.group, child) }
              : { item, missing: `Group not found: ${item.group}` };
          }
          return recipe
            ? { item, recipe: planRecipeView(item.recipe, recipe) }
            : { item, missing: `Recipe not found: ${item.recipe}` };
        },
      ),
    ),
    readPlanHoliday(group.tags),
  ]);
  return {
    slug,
    name: group.name,
    kind: group.kind,
    date: group.date,
    ...(group.tags?.length ? { tags: group.tags } : {}),
    ...(holiday ? { holiday } : {}),
    rows,
  };
}
