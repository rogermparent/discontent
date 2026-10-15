import type { MassagedRecipeEntry } from "../../controller/data/read";
import type { TermSummary } from "../../controller/homepageComingUp";
import { countLabel } from "../../controller/homepageIntents";
import type { GroupItem, GroupKind } from "../../controller/types";
import { RecipeListItem } from "../List";
import { GroupCard } from "../List/FeaturedRecipe/GroupCard";
import { TermCard } from "../List/FeaturedRecipe/TermCard";
import { RecipeGrid, standardRecipeImageProps } from "../List/shared";
import { HomeSection } from "./HomeSection";
import { TermPicture } from "./TermPicture";

/**
 * One card of the homepage's featured strip (22g).
 *
 * A discriminated union rather than a widened recipe entry, because the two
 * cards render nothing in common: a recipe card carries an image filename and a
 * bookmark button, a group card carries a kind and picks its picture at render
 * time.
 */
export type FeaturedStripEntry =
  | {
      kind: "recipe";
      recipe: MassagedRecipeEntry;
      /** The card's line under the name: the recipe's course, when it has one. */
      meta?: string;
    }
  | {
      kind: "group";
      slug: string;
      name: string;
      groupKind?: GroupKind;
      date: number;
      /**
       * The group's record, read by the route (cached, `item:groups:<slug>`):
       * its picture and items go to the thumbnail, which then reads nothing,
       * and the items give the card its recipe count.
       */
      image?: string;
      items?: GroupItem[];
    }
  /**
   * A featured term record (24c). A third member rather than a widened group
   * entry: a term card has an image of its own and no kind badge, where a group
   * card has a badge and picks its picture at render time.
   */
  | {
      kind: "term";
      slug: string;
      label: string;
      image?: string;
      date: number;
      /** Counts and a picture over the term's subtree (`termSummary`). */
      summary?: TermSummary;
    };

/** How many recipes a group lists directly (sub-groups are not recipes). */
function recipeItems(items: GroupItem[] = []): number {
  return items.filter((item) => item.recipe !== undefined).length;
}

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
 * "Recipes" described only some of them. The `/featured-recipes` page keeps
 * its title: it is the curator's list of features, and renaming a route is
 * its own change. The section's link, "Everything featured", goes there.
 *
 * **No timestamps here.** Each card's line under its name says what it is
 * instead (2026-10-15, Roger): "Tag · 12 recipes", "Plan · 6 recipes", or a
 * recipe's course ("Mains"). Term cards draw the term's picture — its image,
 * else the newest recipe photo under it, else its initial — where the old
 * card showed the group placeholder; group cards already walk to their first
 * member's photo. `/featured-recipes` keeps dates and the old cards: that
 * page is the curator's.
 *
 * The same `RecipeGrid` as "New this week", so the cards line up with the
 * recipe cards below. A `HomeSection`, so the specs find the strip as the
 * region named "Featured".
 */
export function FeaturedStrip({
  featured,
}: {
  featured: FeaturedStripEntry[];
}) {
  if (featured.length === 0) return null;

  return (
    <HomeSection
      id="home-featured"
      title="Featured"
      link={{ href: "/featured-recipes", label: "Everything featured" }}
    >
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
              <RecipeListItem {...entry.recipe} meta={entry.meta ?? "Recipe"} />
            ) : entry.kind === "term" ? (
              <TermCard
                slug={entry.slug}
                label={entry.label}
                image={entry.image}
                date={entry.date}
                picture={
                  <TermPicture
                    slug={entry.slug}
                    label={entry.label}
                    summary={entry.summary ?? { image: entry.image }}
                    width={standardRecipeImageProps.width}
                    height={standardRecipeImageProps.height}
                    sizes={standardRecipeImageProps.sizes}
                  />
                }
                meta={`Tag · ${countLabel(entry.summary?.recipes ?? 0, "recipe")}`}
              />
            ) : (
              <GroupCard
                slug={entry.slug}
                name={entry.name}
                kind={entry.groupKind}
                date={entry.date}
                image={entry.image}
                items={entry.items}
                meta={`Plan · ${countLabel(recipeItems(entry.items), "recipe")}`}
              />
            )}
          </li>
        ))}
      </RecipeGrid>
      {/*
       * No "View Feature" line and no note on either card kind here — the
       * homepage has never shown them, and `featured-recipes.spec.ts` pins it.
       */}
    </HomeSection>
  );
}

export default FeaturedStrip;
