import Link from "next/link";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { EmptyState } from "../EmptyState";
import { HomeSection } from "./HomeSection";
import { RecipeThumb } from "./RecipeThumb";

/** A newest recipe with its course label ("Mains"), when it has one. */
export type NewRecipe = MassagedRecipeEntry & { course?: string };

/** "10/17" — the day it was added, in the reader's own short form. */
function shortDate(date: number): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}

/**
 * "New this week" (42f, canvas B): the newest six as a compact two-column
 * list — a 56 px picture, the name, and "Mains · 10/17" — where it was a
 * grid of tall cards. "All N recipes" past six.
 *
 * The list keeps `data-testid="recipe-list"`, which `checkNamesInOrder`
 * reads the order from. The date is a `<time>`, masked in the baselines.
 * No bookmark button: the rows are a way in, and every recipe list page
 * still carries one.
 */
export function NewThisWeek({
  recipes,
  recipeCount,
  moreRecipes,
}: {
  recipes: NewRecipe[];
  recipeCount: number;
  moreRecipes: boolean;
}) {
  return (
    <HomeSection
      id="home-new"
      title="New this week"
      link={
        moreRecipes
          ? { href: "/recipes", label: `All ${recipeCount} recipes` }
          : undefined
      }
      className="gap-2"
    >
      {recipes.length > 0 ? (
        <ul
          data-testid="recipe-list"
          className="grid grid-cols-1 gap-x-6 sm:grid-cols-2"
        >
          {recipes.map((recipe) => (
            <li key={recipe.slug} className="border-b border-border">
              <Link
                href={`/recipe/${recipe.slug}`}
                className="group grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 py-2.5"
              >
                <div className="size-14 overflow-hidden rounded-md bg-muted">
                  <RecipeThumb
                    slug={recipe.slug}
                    image={recipe.image}
                    name={recipe.name}
                  />
                </div>
                <div className="flex min-w-0 flex-col">
                  <h3 className="font-display text-sm leading-5 font-semibold group-hover:underline group-hover:underline-offset-4">
                    {recipe.name}
                  </h3>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    {recipe.course && <>{recipe.course} · </>}
                    <time dateTime={new Date(recipe.date).toISOString()}>
                      {shortDate(recipe.date)}
                    </time>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState message="There are no recipes yet." />
      )}
    </HomeSection>
  );
}

export default NewThisWeek;
