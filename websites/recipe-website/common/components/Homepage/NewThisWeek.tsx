import Link from "next/link";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { EmptyState } from "../EmptyState";
import { HomeSection } from "./HomeSection";
import { FreshRows } from "./FreshRows";
import { RecipeThumb } from "./RecipeThumb";

/** A newest recipe with its course label ("Mains"), when it has one. */
export type NewRecipe = MassagedRecipeEntry & { course?: string };

/**
 * "10/17" — the day it was added, month/day. A fixed format rather than
 * `toLocaleDateString`, which is the *server's* locale here (a server
 * component; the export's build machine): the same string on every host.
 * The day is the server's time zone's — a recipe added near midnight may
 * read a day off for a reader elsewhere, which a "new this week" list can
 * bear.
 */
function shortDate(date: number): string {
  const day = new Date(date);
  return `${day.getMonth() + 1}/${day.getDate()}`;
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
 *
 * 47h: `recipes` are candidates, newest first — more than `limit` — and the
 * browser's day shows the first `limit` no section above already shows
 * (`homepageShown`: a recipe once on the page).
 */
export function NewThisWeek({
  recipes,
  limit,
  recipeCount,
  moreRecipes,
}: {
  recipes: NewRecipe[];
  limit: number;
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
        <FreshRows
          limit={limit}
          rows={recipes.map((recipe) => ({
            slug: recipe.slug,
            row: (
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
            ),
          }))}
        />
      ) : (
        <EmptyState message="There are no recipes yet." />
      )}
    </HomeSection>
  );
}

export default NewThisWeek;
