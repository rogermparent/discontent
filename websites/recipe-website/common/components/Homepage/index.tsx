import Link from "next/link";
import RecipeList from "../List";
import GroupList from "../List/Group";
import { GroupThumbnail } from "../GroupThumbnail";
import { MassagedRecipeEntry, getAllTags } from "../../controller/data/read";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import { recipeItems } from "../../controller/data/readRecipeItem";
import { Recipe } from "../../controller/types";
import { FeaturedStrip, type FeaturedStripEntry } from "./FeaturedStrip";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { Button } from "@discontent/component-library/components/ui/button";
import { EmptyState } from "recipe-website-common/components/EmptyState";
import { HeroBench } from "./HeroBench";
import { BrowseChips } from "./BrowseChips";

function RecipeSection({
  title,
  recipes,
  linkHref,
  linkText,
  emptyText,
}: {
  title: string;
  recipes: MassagedRecipeEntry[];
  linkHref?: string;
  linkText?: string;
  emptyText?: string;
}) {
  if (recipes.length === 0 && !emptyText) {
    return null;
  }

  return (
    <div className="mb-8">
      <PageHeading className="font-display">{title}</PageHeading>
      {recipes.length > 0 ? (
        <RecipeList recipes={recipes} />
      ) : (
        emptyText && <EmptyState message={emptyText} />
      )}
      {recipes.length > 0 && linkHref && linkText && (
        <div className="flex flex-row items-center justify-center my-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={linkHref}>{linkText}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default async function Homepage({
  recipes,
  featured,
  groups,
  moreRecipes,
}: {
  recipes: MassagedRecipeEntry[];
  /** The newest few features — recipes and groups mixed, newest first (22g). */
  featured: FeaturedStripEntry[];
  /** The newest few groups, or none — an empty list renders no section at all. */
  groups: GroupListEntry[];
  moreRecipes: boolean;
}) {
  /*
   * The hero leads with a featured **recipe** when there is one; otherwise it
   * falls back to the latest recipe. A featured *group* is not a hero candidate
   * — `HeroBench` renders a recipe's whole record — so filtering here keeps the
   * rule 22g inherited exactly as it was rather than letting a group in the
   * strip silently demote the hero to "Latest".
   */
  const featuredRecipes: MassagedRecipeEntry[] = featured
    .filter((entry) => entry.kind === "recipe")
    .map((entry) => entry.recipe);
  const heroSlug = featuredRecipes[0]?.slug ?? recipes[0]?.slug;
  const heroLabel: "Featured" | "Latest" =
    featuredRecipes.length > 0 ? "Featured" : "Latest";

  /*
   * The hero reads the chosen recipe's *whole* data file — far more than any
   * projection carries — at a URL that is `/`. That is the case F19 exists for
   * (§2): editing this recipe's description changes what the homepage renders
   * and dirties no page, moves no aggregate, and cannot be reached by
   * `revalidatePath(itemBasePath + "/" + slug)`. `item:recipes:<slug>` is what
   * reaches it, and the read is now cached under that tag.
   *
   * Nothing needs to fire specially when the *hero changes recipe*: which slug
   * is chosen comes from the strips, which read pagination heads the featured
   * and recipe writes already expire (F10a). A different hero is simply a
   * different cache key.
   *
   * The `catch` stays, and no longer looks vestigial: a missing recipe is now
   * `null` rather than a throw, so this only swallows genuine I/O failures —
   * which is the difference between a homepage with no hero and a 500.
   */
  const [tags, heroRecipe] = await Promise.all([
    getAllTags(),
    heroSlug
      ? recipeItems.read(heroSlug).catch(() => undefined)
      : Promise.resolve<Recipe | undefined>(undefined),
  ]);

  return (
    <PageMain>
      <PageSection>
        {heroRecipe && heroSlug && (
          <HeroBench recipe={heroRecipe} slug={heroSlug} label={heroLabel} />
        )}
        <BrowseChips tags={tags} />
        {/*
         * Groups sit between the browse chips and the featured strip: above the
         * recipe grids because they are a *way in* rather than more of the same
         * thing, and below the chips because tags are the shorter, cheaper cut.
         *
         * Nothing at all when there are none — which is what keeps the
         * `three-recipes` homepage baseline still, since that fixture has no
         * groups and never will.
         */}
        {groups.length > 0 && (
          <div className="mb-8">
            <PageHeading className="font-display">Groups</PageHeading>
            <GroupList
              groups={groups}
              renderThumbnail={(group) => (
                <GroupThumbnail slug={group.slug} name={group.name} />
              )}
            />
            <div className="flex flex-row items-center justify-center my-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/groups">More groups</Link>
              </Button>
            </div>
          </div>
        )}
        <FeaturedStrip featured={featured} />
        <RecipeSection
          title="Latest Recipes"
          recipes={recipes}
          linkHref={moreRecipes ? "/recipes" : undefined}
          linkText="More Latest Recipes"
          emptyText="There are no recipes yet."
        />
      </PageSection>
    </PageMain>
  );
}
