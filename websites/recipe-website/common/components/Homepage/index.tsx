import RecipeList from "../List";
import { MassagedRecipeEntry } from "../../controller/data/read";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import type { ComingUpEntry } from "../../controller/homepageComingUp";
import type { HomepageFacet } from "../../controller/homepageFacets";
import type { HomepageIntent } from "../../controller/homepageIntents";
import { FeaturedStrip, type FeaturedStripEntry } from "./FeaturedStrip";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { EmptyState } from "recipe-website-common/components/EmptyState";
import { BrowseChips } from "./BrowseChips";
import { BrowseTerms } from "./BrowseTerms";
import { ComingUp } from "./ComingUp";
import { HomeIntro } from "./HomeIntro";
import { HomeSection } from "./HomeSection";
import { PlansStrip } from "./PlansStrip";

/**
 * The homepage — direction A of the usability pass (2026-10-15), on the
 * structure the homepage redesign earlier that day settled; `ui-overhaul.md`
 * has both.
 *
 * Top to bottom: the intro and its intent tiles, "Coming up" (the next
 * holidays), "Featured", "Browse" (the facet roots), "New this week", and the
 * newest plan. No section outweighs another: the hero that gave the newest
 * featured recipe most of the first screen is gone.
 *
 * Every value arrives as a prop — the route does all the reading — and the
 * three things that depend on the reader's browser (the date, the countdowns,
 * the Make tile's count) are client islands, so both apps render the same
 * page and the static export never shows a build day's date.
 */
export default function Homepage({
  recipes,
  featured,
  plan,
  facets,
  tags,
  intents,
  comingUp,
  serverDay,
  moreRecipes,
  recipeCount,
}: {
  recipes: MassagedRecipeEntry[];
  /** The newest few features — recipes, groups and terms mixed, newest first (22g). */
  featured: FeaturedStripEntry[];
  /** The newest group, if there is one. */
  plan?: GroupListEntry;
  /** The tag vocabulary's facet roots, ordered and capped (`homepageFacets`). */
  facets: HomepageFacet[];
  /**
   * Flat tag labels for the fallback chips — read only when `facets` is
   * empty, so a corpus with no term records still has a browse row.
   */
  tags: string[];
  intents: HomepageIntent[];
  /** The holidays, or `null` when there is no `holidays` root. */
  comingUp: ComingUpEntry[] | null;
  /** The server's day, `YYYY-MM-DD`, for the countdowns' first render. */
  serverDay: string;
  moreRecipes: boolean;
  recipeCount: number;
}) {
  return (
    <PageMain>
      <PageSection
        maxWidth="none"
        className="mx-auto flex max-w-6xl flex-col gap-12 pt-8 pb-16 sm:gap-14 sm:pt-10"
      >
        <HomeIntro intents={intents} />
        <ComingUp entries={comingUp} serverDay={serverDay} />
        <FeaturedStrip featured={featured} />
        {facets.length > 0 ? (
          <BrowseTerms facets={facets} />
        ) : (
          <BrowseChips tags={tags} />
        )}
        <HomeSection
          id="home-new"
          title="New this week"
          link={
            moreRecipes
              ? { href: "/recipes", label: `All ${recipeCount} recipes` }
              : undefined
          }
        >
          {recipes.length > 0 ? (
            <RecipeList recipes={recipes} />
          ) : (
            <EmptyState message="There are no recipes yet." />
          )}
        </HomeSection>
        <PlansStrip plan={plan} />
      </PageSection>
    </PageMain>
  );
}
