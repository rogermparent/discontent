import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import type { ComingUpEntry } from "../../controller/homepageComingUp";
import type { HomepageFacet } from "../../controller/homepageFacets";
import type { HomepageIntent } from "../../controller/homepageIntents";
import { cn } from "@discontent/component-library/lib/utils";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { BrowseChips } from "./BrowseChips";
import { BrowseTerms } from "./BrowseTerms";
import { FeaturedPanel, type FeaturedStripEntry } from "./FeaturedPanel";
import { HomeIntro } from "./HomeIntro";
import { NewThisWeek, type NewRecipe } from "./NewThisWeek";
import { PlanPanel, type PlanLine } from "./PlanPanel";
import { ThisSeason, hasSeason } from "./ThisSeason";

/**
 * The homepage — canvas B, "Now and next" (42f; `agent-epic-42.md`), on the
 * structure the 2026-10-15 redesign settled (`ui-overhaul.md`).
 *
 * One screen holds what you are cooking now and what is next:
 *
 * - **The band:** the date, "What are you making?", a search field and the
 *   intents as `tag:` chips; the Make tile beside them.
 * - **The main column:** "This season" (the next holidays, dated), "New
 *   this week" (a compact list), "Browse" (one line per facet root).
 * - **The right rail:** "On the plan" (the newest plan) and "Featured".
 *
 * On a phone it is one column: the band, the season, the rail, then New
 * this week and Browse — the plan right after the season, as the canvas's
 * phone board has it. On a laptop the rail spans the main column's rows;
 * the second row is `1fr`, so a rail taller than the season stretches the
 * bottom of the main column rather than opening a gap under the season.
 *
 * Every value arrives as a prop — the route does all the reading — and the
 * things that depend on the reader's browser (the date, the season's rows
 * and the features they stand in for, the Make tile's count) are client
 * islands, so both apps
 * render the same page and the static export never shows a build day's date.
 */
export default function Homepage({
  recipes,
  featured,
  season: seasonHolidays,
  featuredLimit,
  plan,
  planLines,
  showShopping = false,
  facets,
  tags,
  intents,
  comingUp,
  serverDay,
  moreRecipes,
  recipeCount,
}: {
  recipes: NewRecipe[];
  /**
   * Features, newest first (22g): enough that `featuredLimit` remain once
   * the browser hides the holidays "This season" shows (42f).
   */
  featured: FeaturedStripEntry[];
  /** The dated holidays with something under them (`datedHolidays`). */
  season: Array<{ slug: string }>;
  featuredLimit: number;
  /** The newest group, if there is one. */
  plan?: GroupListEntry;
  /** Its lines, resolved; `undefined` when the record could not be read. */
  planLines?: PlanLine[];
  /** A signed-in editor: the plan panel links the shopping list. */
  showShopping?: boolean;
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
  /** The server's day, `YYYY-MM-DD`, for the season's first render. */
  serverDay: string;
  moreRecipes: boolean;
  recipeCount: number;
}) {
  const season = hasSeason(comingUp);
  const hasRail = plan !== undefined || featured.length > 0;
  return (
    <PageMain>
      <PageSection
        maxWidth="none"
        className="mx-auto flex max-w-6xl flex-col gap-10 pt-8 pb-14 sm:pt-9"
      >
        <HomeIntro intents={intents} recipeCount={recipeCount} />
        <div
          className={cn(
            "flex flex-col gap-10",
            hasRail &&
              "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-10",
          )}
        >
          {season && (
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <ThisSeason entries={comingUp} serverDay={serverDay} />
            </div>
          )}
          {hasRail && (
            <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
              <PlanPanel
                plan={plan}
                lines={planLines}
                showShopping={showShopping}
              />
              <FeaturedPanel
                featured={featured}
                season={seasonHolidays}
                serverDay={serverDay}
                limit={featuredLimit}
              />
            </div>
          )}
          <div
            className={cn(
              "flex min-w-0 flex-col gap-10 lg:col-start-1",
              season ? "lg:row-start-2" : "lg:row-start-1",
            )}
          >
            <NewThisWeek
              recipes={recipes}
              recipeCount={recipeCount}
              moreRecipes={moreRecipes}
            />
            {facets.length > 0 ? (
              <BrowseTerms facets={facets} />
            ) : (
              <BrowseChips tags={tags} />
            )}
          </div>
        </div>
      </PageSection>
    </PageMain>
  );
}
