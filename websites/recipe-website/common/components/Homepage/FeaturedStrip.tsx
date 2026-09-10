import Link from "next/link";
import { Button } from "@discontent/component-library/components/ui/button";
import { PageHeading } from "recipe-website-common/components/PageLayout";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import type { GroupKind } from "../../controller/types";
import { RecipeListItem } from "../List";
import { GroupCard } from "../List/FeaturedRecipe/GroupCard";
import { RecipeGrid } from "../List/shared";

/**
 * One card of the homepage's featured strip (22g).
 *
 * A discriminated union rather than a widened recipe entry, because the two
 * cards render nothing in common: a recipe card carries an image filename and a
 * bookmark button, a group card carries a kind and picks its picture at render
 * time. Keeping them apart is also what lets the hero go on asking for "the
 * first featured *recipe*" without guessing.
 */
export type FeaturedStripEntry =
  | { kind: "recipe"; recipe: MassagedRecipeEntry }
  | {
      kind: "group";
      slug: string;
      name: string;
      groupKind?: GroupKind;
      date: number;
    };

/**
 * The homepage's "Featured Recipes" strip — recipes and groups in one row.
 *
 * The heading stays "Featured Recipes" even when a group is in it. That was
 * decided with the user: the strip is the place things are *featured*, and
 * renaming it would make a page that mostly shows recipes read as though the
 * section had changed subject.
 *
 * Same wrapper as the recipe sections beside it, down to the `RecipeGrid`, so a
 * strip of recipes alone is byte-for-byte what `RecipeSection` rendered before
 * this component existed — which is what keeps the visual baselines still.
 */
export function FeaturedStrip({
  featured,
}: {
  featured: FeaturedStripEntry[];
}) {
  if (featured.length === 0) return null;

  return (
    <div className="mb-8">
      <PageHeading className="font-display">Featured Recipes</PageHeading>
      <RecipeGrid>
        {featured.map((entry, index) => (
          <li
            /*
             * By position, not by slug: a recipe may be featured more than once
             * and both features can be in the newest six, so the slug is not a
             * key.
             */
            key={
              entry.kind === "recipe"
                ? `${index}-recipe-${entry.recipe.slug}`
                : `${index}-group-${entry.slug}`
            }
          >
            {entry.kind === "recipe" ? (
              <RecipeListItem {...entry.recipe} />
            ) : (
              <GroupCard
                slug={entry.slug}
                name={entry.name}
                kind={entry.groupKind}
                date={entry.date}
              />
            )}
          </li>
        ))}
      </RecipeGrid>
      {/*
       * No "View Feature" line and no note on either card kind here — the
       * homepage has never shown them, and `featured-recipes.spec.ts` pins it.
       */}
      <div className="flex flex-row items-center justify-center my-2">
        <Button asChild variant="secondary" size="sm">
          <Link href="/featured-recipes">More Featured Recipes</Link>
        </Button>
      </div>
    </div>
  );
}

export default FeaturedStrip;
