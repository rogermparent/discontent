import type { ReactNode } from "react";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import type { HomepageFacet } from "../../controller/homepageFacets";
import type { HomepageIntent } from "../../controller/homepageIntents";
import type { TonightCandidates } from "../../controller/homepageTonight";
import type { FreshBatch, FreshCuisine } from "../../controller/homepageFresh";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { BrowseChips } from "./BrowseChips";
import { BrowseTerms } from "./BrowseTerms";
import { featuredRows, type FeaturedStripEntry } from "./FeaturedPanel";
import { Feasts, type FeastView } from "./Feasts";
import { HomeDayProvider } from "./HomeDay";
import { HomeIntro } from "./HomeIntro";
import { HomeRail } from "./HomeRail";
import { MakeTile } from "./MakeTile";
import { NewInCollection, type NewRecipe } from "./NewInCollection";
import { PlanPanel, type PlanLine } from "./PlanPanel";
import { Tonight } from "./Tonight";

/**
 * The homepage — canvas B, "Tonight, then the next feast" (48e;
 * `agent-epic-48.md`). The page answers two questions in order, what's for
 * dinner tonight and what am I getting ready for, then shows what's new:
 *
 * - **The band:** the date and the days to the next holiday, "What are you
 *   making?", the search field (with Ask for a signed-in editor with a
 *   model) and the intents as `tag:` chips.
 * - **Tonight:** a quick dinner, What can I make from the reader's list,
 *   and something warm to drink in the warm season.
 * - **Next up:** the next holiday as its menu by course; **Then:** the two
 *   after it, a plan where one is filed under the holiday.
 * - **New in the collection** by batch and cuisine, beside **On the plan**
 *   and **Featured**; then **Browse** as one index line.
 *
 * On a phone it is one column in the same order. Every value arrives as a
 * prop — the route does all the reading — and what depends on the reader's
 * day (the date, tonight's turn, the next holiday, which recipe shows where)
 * is worked out in the browser (`HomeDayProvider`), so both apps render the
 * same page and the static export never shows a build day's answer.
 */
export default function Homepage({
  intents,
  recipeCount,
  serverDay,
  ask,
  tonight,
  feasts,
  names,
  thumbs,
  cards,
  featured,
  featuredLimit,
  plan,
  planLines,
  showShopping = false,
  recipes,
  batches,
  cuisines,
  freshLimit,
  moreRecipes,
  facets,
  tags,
}: {
  intents: HomepageIntent[];
  recipeCount: number;
  /** The server's day, `YYYY-MM-DD`, for the first render. */
  serverDay: string;
  /** Editor only: the search field with Ask (`HomeAsk`). */
  ask?: (field: ReactNode) => ReactNode;
  tonight: TonightCandidates;
  feasts: FeastView[];
  /** Recipe names by slug, for the holidays' recipes. */
  names: Record<string, string>;
  /** Small pictures by recipe slug, rendered on the server. */
  thumbs: Record<string, ReactNode>;
  /** Larger pictures (course cards, the warm drink), by recipe slug. */
  cards: Record<string, ReactNode>;
  /** Features, newest first (22g): enough that `featuredLimit` remain. */
  featured: FeaturedStripEntry[];
  featuredLimit: number;
  /** The newest group, if there is one. */
  plan?: GroupListEntry;
  /** Its lines, resolved; `undefined` when the record could not be read. */
  planLines?: PlanLine[];
  /** A signed-in editor: the plan panels link the shopping list. */
  showShopping?: boolean;
  /** New in the collection's candidates, newest first. */
  recipes: NewRecipe[];
  batches: FreshBatch[];
  cuisines: FreshCuisine[];
  freshLimit: number;
  moreRecipes: boolean;
  /** The tag vocabulary's facet roots, ordered (`homepageFacets`). */
  facets: HomepageFacet[];
  /** Flat tag labels for the fallback chips, when `facets` is empty. */
  tags: string[];
}) {
  const rows = featuredRows(featured);
  const holidayLabels = Object.fromEntries(
    feasts.map((feast) => [feast.slug, feast.label]),
  );
  return (
    <PageMain>
      <PageSection
        maxWidth="none"
        className="mx-auto flex max-w-6xl flex-col pt-6 pb-14 sm:pt-9"
      >
        <HomeDayProvider
          serverDay={serverDay}
          quick={tonight.quick.map((recipe) => recipe.slug)}
          warm={tonight.warm.map((recipe) => recipe.slug)}
          warmHolidays={tonight.warmHolidays}
          feasts={feasts.map((feast) => ({
            slug: feast.slug,
            rule: feast.rule,
            cards: feast.cards.map((card) => ({
              slug: card.slug,
              picks: card.picks,
            })),
            top: feast.top,
            ...(feast.plan ? { plan: feast.plan.slug } : {}),
          }))}
          featured={rows.map(({ key, holiday, recipe, group, dangling }) => ({
            key,
            ...(holiday ? { holiday } : {}),
            ...(recipe ? { recipe } : {}),
            ...(group ? { group } : {}),
            ...(dangling ? { dangling } : {}),
          }))}
          featuredLimit={featuredLimit}
          {...(plan ? { planGroup: plan.slug } : {})}
          fresh={recipes.map((recipe) => recipe.slug)}
          freshLimit={freshLimit}
          thumbs={thumbs}
          cards={cards}
          names={names}
        >
          <div className="flex flex-col gap-10 lg:gap-12">
            <HomeIntro
              intents={intents}
              recipeCount={recipeCount}
              ask={ask}
              holidayLabels={holidayLabels}
            />
            <Tonight
              quick={tonight.quick}
              warm={tonight.warm}
              make={<MakeTile />}
            />
            <Feasts feasts={feasts} showShopping={showShopping} />
            <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
              <NewInCollection
                recipes={recipes}
                batches={batches}
                cuisines={cuisines}
                limit={freshLimit}
                recipeCount={recipeCount}
                moreRecipes={moreRecipes}
              />
              <HomeRail
                plan={
                  plan ? (
                    <PlanPanel
                      plan={plan}
                      lines={planLines}
                      showShopping={showShopping}
                    />
                  ) : null
                }
                rows={rows}
                limit={featuredLimit}
                className="flex min-w-0 flex-col gap-4"
              />
            </div>
            {facets.length > 0 ? (
              <BrowseTerms facets={facets} />
            ) : (
              <BrowseChips tags={tags} />
            )}
          </div>
        </HomeDayProvider>
      </PageSection>
    </PageMain>
  );
}
