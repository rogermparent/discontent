import Link from "next/link";
import { Button } from "@discontent/component-library/components/ui/button";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import type { GroupKind } from "../../controller/types";
import { RecipeListItem } from "../List";
import { GroupCard } from "../List/FeaturedRecipe/GroupCard";
import { TermCard } from "../List/FeaturedRecipe/TermCard";
import { RecipeGrid } from "../List/shared";

/**
 * One card of the homepage's featured strip (22g).
 *
 * A discriminated union rather than a widened recipe entry, because the two
 * cards render nothing in common: a recipe card carries an image filename and a
 * bookmark button, a group card carries a kind and picks its picture at render
 * time.
 */
export type FeaturedStripEntry =
  | { kind: "recipe"; recipe: MassagedRecipeEntry }
  | {
      kind: "group";
      slug: string;
      name: string;
      groupKind?: GroupKind;
      date: number;
    }
  /**
   * A featured term record (24c). A third member rather than a widened group
   * entry: a term card has an image of its own and no kind badge, where a group
   * card has a badge and picks its picture at render time.
   */
  | { kind: "term"; slug: string; label: string; image?: string; date: number };

/**
 * The homepage's "Featured" strip — recipes, groups and terms in one grid of
 * equal cards, newest first.
 *
 * **No first item is special** (homepage redesign, 2026-10-15). Until then a
 * hero above the page drew the newest featured recipe again at full width,
 * with its photo, timeline and a large button, so one feature outweighed the
 * rest of the page. That hero is gone; the newest feature is the first card
 * here and nothing more.
 *
 * **The heading is "Featured"**, revised with Roger on 2026-10-15. It had
 * stayed "Featured Recipes" through 22g and 24c, decided with him then on the
 * grounds that the strip is where things are featured and a new name would
 * read as a change of subject. Once groups and terms were regular cards here,
 * "Recipes" described only some of them. The `/featured-recipes` page and the
 * "More Featured Recipes" button that names it keep their titles: that page
 * is the curator's list of features, and renaming a route is its own change.
 *
 * The same `RecipeGrid` as the Latest section, so the cards line up with the
 * recipe cards below. A `section` labelled by its heading, so the specs find
 * the strip as the region named "Featured".
 */
export function FeaturedStrip({
  featured,
}: {
  featured: FeaturedStripEntry[];
}) {
  if (featured.length === 0) return null;

  return (
    <section aria-labelledby="home-featured" className="mb-8">
      <h2 id="home-featured" className="mb-4 font-display text-2xl font-bold">
        Featured
      </h2>
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
                : `${index}-${entry.kind}-${entry.slug}`
            }
          >
            {entry.kind === "recipe" ? (
              <RecipeListItem {...entry.recipe} />
            ) : entry.kind === "term" ? (
              <TermCard
                slug={entry.slug}
                label={entry.label}
                image={entry.image}
                date={entry.date}
              />
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
    </section>
  );
}

export default FeaturedStrip;
