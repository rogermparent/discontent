import Link from "next/link";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import type { FreshBatch, FreshCuisine } from "../../controller/homepageFresh";
import { EmptyState } from "../EmptyState";
import { HomeSection } from "./HomeSection";
import { FreshRows } from "./FreshRows";
import { Monogram } from "./Monogram";
import { RecipeThumb } from "./RecipeThumb";

/** A newest recipe with its course label ("Mains"), when it has one. */
export type NewRecipe = MassagedRecipeEntry & { course?: string };

/**
 * "10/17" — the day it was added, month/day. A fixed format rather than
 * `toLocaleDateString`, which is the *server's* locale here (a server
 * component; the export's build machine): the same string on every host.
 */
function shortDate(date: number): string {
  const day = new Date(date);
  return `${day.getMonth() + 1}/${day.getDate()}`;
}

/** "New to the shelf": the cuisines the newest recipes bring. */
function Cuisines({ cuisines }: { cuisines: FreshCuisine[] }) {
  if (cuisines.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-xs leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase">
        New to the shelf{" "}
        <span className="tracking-normal normal-case">· cuisines</span>
      </h3>
      <ul
        className="grid grid-cols-1 gap-x-5 sm:grid-cols-2"
        data-testid="fresh-cuisines"
      >
        {cuisines.map((cuisine) => (
          <li key={cuisine.slug} className="border-b border-border">
            <Link
              href={`/tags/${cuisine.slug}`}
              className="group grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 py-2"
            >
              <div className="size-11 overflow-hidden rounded-md bg-muted">
                {cuisine.picture ? (
                  <RecipeThumb
                    slug={cuisine.picture.slug}
                    image={cuisine.picture.image}
                    name={cuisine.picture.name}
                  />
                ) : (
                  <Monogram label={cuisine.label} small />
                )}
              </div>
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-sm leading-5 font-semibold group-hover:underline group-hover:underline-offset-4">
                  {cuisine.label}{" "}
                  <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
                    {cuisine.count} new
                  </span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {cuisine.names.join(" · ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "New in the collection" (48e, canvas B; "New this week" since 42f): the
 * newest recipes **by batch** — the day they were added, how many, what they
 * mostly are (`freshBatches`) — as square tiles, then **New to the shelf**:
 * the cuisines the newest recipes bring (`freshCuisines`). "All N recipes"
 * past six.
 *
 * `recipes` are candidates, newest first — more than `limit` — and the
 * browser's day shows the first `limit` no section above already shows
 * (`homepageDay`: a recipe once on the page). A tile keeps the course and
 * the day it was added ("Mains · 10/17", a `<time>`, masked in the
 * baselines) under its name.
 */
export function NewInCollection({
  recipes,
  batches,
  cuisines,
  limit,
  recipeCount,
  moreRecipes,
}: {
  recipes: NewRecipe[];
  batches: FreshBatch[];
  cuisines: FreshCuisine[];
  limit: number;
  recipeCount: number;
  moreRecipes: boolean;
}) {
  return (
    <HomeSection
      id="home-new"
      title="New in the collection"
      link={
        moreRecipes
          ? { href: "/recipes", label: `All ${recipeCount} recipes` }
          : undefined
      }
      className="min-w-0 gap-3"
    >
      {recipes.length > 0 ? (
        <>
          <FreshRows
            limit={limit}
            batches={batches}
            rows={recipes.map((recipe) => ({
              slug: recipe.slug,
              row: (
                <li key={recipe.slug} className="min-w-0">
                  <Link
                    href={`/recipe/${recipe.slug}`}
                    className="group flex flex-col gap-1.5"
                  >
                    <div className="aspect-square overflow-hidden rounded-md bg-muted">
                      <RecipeThumb
                        slug={recipe.slug}
                        image={recipe.image}
                        name={recipe.name}
                      />
                    </div>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[0.8125rem] leading-[1.125rem] font-medium group-hover:underline group-hover:underline-offset-4">
                        {recipe.name}
                      </span>
                      <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                        {recipe.course && <>{recipe.course} · </>}
                        <time dateTime={new Date(recipe.date).toISOString()}>
                          {shortDate(recipe.date)}
                        </time>
                      </span>
                    </span>
                  </Link>
                </li>
              ),
            }))}
          />
          <Cuisines cuisines={cuisines} />
        </>
      ) : (
        <EmptyState message="There are no recipes yet." />
      )}
    </HomeSection>
  );
}

export default NewInCollection;
