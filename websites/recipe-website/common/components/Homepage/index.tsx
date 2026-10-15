import Link from "next/link";
import RecipeList from "../List";
import GroupList from "../List/Group";
import { GroupThumbnail } from "../GroupThumbnail";
import { MassagedRecipeEntry } from "../../controller/data/read";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import type { HomepageFacet } from "../../controller/homepageFacets";
import { FeaturedStrip, type FeaturedStripEntry } from "./FeaturedStrip";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { Button } from "@discontent/component-library/components/ui/button";
import { EmptyState } from "recipe-website-common/components/EmptyState";
import { BrowseChips } from "./BrowseChips";
import { BrowseTerms } from "./BrowseTerms";
import { HomeActions } from "./HomeActions";

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

/**
 * The homepage (redesigned 2026-10-15; `ui-overhaul.md` has the why).
 *
 * Top to bottom: the ways in (`HomeActions`), the featured strip, browse by
 * term, groups, latest recipes. No section is bigger than another's cards:
 * the hero that gave the newest featured recipe most of the first screen is
 * gone, and that recipe is now one equal card in the strip it was already in.
 *
 * Every value arrives as a prop — the route does all the reading — so this
 * renders nothing it was not handed, and both apps render it the same way.
 */
export default function Homepage({
  recipes,
  featured,
  groups,
  facets,
  tags,
  moreRecipes,
  recipeCount,
  groupCount,
}: {
  recipes: MassagedRecipeEntry[];
  /** The newest few features — recipes, groups and terms mixed, newest first (22g). */
  featured: FeaturedStripEntry[];
  /** The newest few groups, or none — an empty list renders no section at all. */
  groups: GroupListEntry[];
  /** The tag vocabulary's facet roots, ordered and capped (`homepageFacets`). */
  facets: HomepageFacet[];
  /**
   * Flat tag labels for the fallback chips — read only when `facets` is
   * empty, so a corpus with no term records still has a browse row.
   */
  tags: string[];
  moreRecipes: boolean;
  recipeCount: number;
  groupCount: number;
}) {
  return (
    <PageMain>
      <PageSection>
        <HomeActions recipeCount={recipeCount} groupCount={groupCount} />
        <FeaturedStrip featured={featured} />
        {facets.length > 0 ? (
          <BrowseTerms facets={facets} />
        ) : (
          <BrowseChips tags={tags} />
        )}
        {/*
         * Groups after the vocabulary: both are ways in, and the facets are
         * the broader cut. Nothing at all when there are none, which keeps the
         * `three-recipes` fixture (no groups, ever) free of an empty section.
         */}
        {groups.length > 0 && (
          <section aria-labelledby="home-groups" className="mb-8">
            <h2
              id="home-groups"
              className="font-bold text-2xl mb-4 font-display"
            >
              Groups
            </h2>
            <GroupList
              groups={groups}
              renderThumbnail={(group) => (
                /* The list entry carries the group's own image since 22h
                   (D14), so a card that has one renders it with no group
                   read. */
                <GroupThumbnail
                  slug={group.slug}
                  name={group.name}
                  image={group.image}
                />
              )}
            />
            <div className="flex flex-row items-center justify-center my-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/groups">More groups</Link>
              </Button>
            </div>
          </section>
        )}
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
