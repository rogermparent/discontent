import type { ReactNode } from "react";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { featuredRecipePages } from "../../controller/data/readFeaturedRecipePages";
import { groupPages } from "../../controller/data/readGroupPages";
import { recipePages } from "../../controller/data/readRecipePages";
import { groupTagReads } from "../../controller/data/readGroupTagIndex";
import { recipeTagReads } from "../../controller/data/readRecipeTagIndex";
import {
  readTagBoard,
  readTagVocabulary,
} from "../../controller/data/readTermPage";
import { tagTermReads } from "../../controller/data/readTagTerms";
import {
  aliasedRows,
  mergeTermRows,
  subtreeKeys,
  vocabularyOfRows,
} from "../../controller/tagVocabulary";
import { groupItems } from "../../controller/data/readGroupItem";
import { resolveGroupItems } from "../../controller/data/resolveGroupItems";
import { scaleOf } from "../GroupDetailPage/GroupItems";
import {
  HOLIDAYS_ROOT,
  courseLabels,
  featureCandidates,
  findTermNode,
  termSummary,
} from "../../controller/homepageComingUp";
import { holidayChildren } from "../../controller/holidaysPage";
import { feastCounts, feastEntries } from "../../controller/homepageFeasts";
import { tonightCandidates } from "../../controller/homepageTonight";
import { freshBatches, freshCuisines } from "../../controller/homepageFresh";
import { groupPrefillHref } from "../../controller/groupPrefill";
import { homepageFacets } from "../../controller/homepageFacets";
import { homepageIntents, termTotals } from "../../controller/homepageIntents";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import { groupCountLabel } from "../../util/groupCountLabel";
import { dayKey, localDay } from "../../util/holidays";
import Homepage from ".";
import { BROWSE_CHILD_LIMIT } from "./BrowseTerms";
import type { FeaturedStripEntry } from "./FeaturedPanel";
import type { FeastView } from "./Feasts";
import type { NewRecipe } from "./NewInCollection";
import type { PlanLine } from "./PlanPanel";
import { RecipeThumb } from "./RecipeThumb";

/** How many rows "New in the collection" and "Featured" each show. */
const STRIP_SIZE = 6;
/**
 * Featured's rows. Canvas B draws five; six stays (De4), the count every
 * featured spec and the `/featured-recipes` "first six" rule were written to.
 */
const FEATURED_SIZE = STRIP_SIZE;

/**
 * A plan's lines for the homepage (42f): its record (cached,
 * `item:groups:<slug>`) and each line's recipe or sub-plan (cached item
 * reads, `resolveGroupItems`), in the plan's order. A dangling line is left
 * out — the plan's own page says "not found"; the homepage is no place for a
 * hole. `undefined` when the record cannot be read.
 */
async function readPlanLines(
  plan: Pick<GroupListEntry, "slug"> | undefined,
): Promise<PlanLine[] | undefined> {
  if (!plan) return undefined;
  const group = await groupItems.read(plan.slug).catch(() => undefined);
  if (!group) return undefined;
  const resolved = await resolveGroupItems(group);
  return resolved.flatMap(({ item, recipe, group: child }): PlanLine[] => {
    if (item.recipe !== undefined) {
      if (!recipe) return [];
      /* The plan page's own rule: a 1× or unreadable scale links plainly. */
      const scale = scaleOf(item);
      return [
        {
          href: scale
            ? `/recipe/${item.recipe}?scale=${encodeURIComponent(scale.value)}`
            : `/recipe/${item.recipe}`,
          name: recipe.name,
          recipe: {
            slug: item.recipe,
            ...(recipe.image ? { image: recipe.image } : {}),
          },
        },
      ];
    }
    if (!child) return [];
    return [{ href: `/group/${item.group}`, name: child.name }];
  });
}

/** What the editor's page adds to the reader's (48e: "editor only"). */
export interface HomepageEditor {
  /** A signed-in editor: plan prompts and the shopping list. */
  signedIn?: boolean;
  /** A model is set up: Ask beside the search field, and the curator. */
  ask?: (field: ReactNode) => ReactNode;
  /** `/curator` with an ask filled in (`curatorHref`), when it is offered. */
  curatorHref?: (prompt: string) => string;
}

/**
 * The homepage, defined once and re-exported by both apps' `page.tsx` —
 * canvas B, "Tonight, then the next feast" (48e). It reads no session and no
 * inventory itself: the editor's page says what it adds (`editor`), and the
 * Make tile counts from the browser's own list (U6), so the reader's parts
 * are the same for every reader.
 *
 * What it reads, and why each read is already a cached one:
 *
 * - the recipe, featured and group **head pages** (42f: a write that dirties
 *   no page leaves them alone; `total` is on the head page);
 * - `/tags`' **board** and the recipes' and groups' whole **by-term maps**
 *   and the **tree** (38a), which Browse, the intents, Tonight's candidates
 *   and every holiday's menu are computed from — `React.cache` hands the
 *   board's reads back, so the maps are read once;
 * - each holiday's **record** (its pins and description, which pick a
 *   course's lead dish — `homepageFeasts`), `item:tag-terms:<slug>`;
 * - the **plans** shown: the newest, and each holiday's newest
 *   (`item:groups:<slug>` and their lines' recipes).
 *
 * Which holiday is next, tonight's dishes and which recipe shows where are
 * the reader's day's questions (`homepageDay`), answered in the browser: the
 * export is static, and a spec cannot freeze the server's clock (42f's trap).
 */
export async function homepageRoute({
  showShopping = false,
  editor = {},
}: {
  /**
   * The reader is a signed-in editor: the plan panel links the shopping
   * list. Only the editor's page passes it, from its session; the export's
   * never does, so the static build cannot link a page it does not have.
   */
  showShopping?: boolean;
  editor?: HomepageEditor;
} = {}) {
  /*
   * The server's day, for the first render only — the browser replaces it
   * with its own (`useToday`). On the static export this is the build's
   * day, which is exactly why it is never the final answer.
   */
  const serverDay = dayKey(localDay(new Date()));
  const [
    recipeHead,
    featuredHead,
    groupHead,
    board,
    byRecipeTag,
    byGroupTag,
    termTree,
  ] = await Promise.all([
    recipePages.readHead(),
    featuredRecipePages.readHead(),
    groupPages.readHead(),
    readTagBoard(),
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
    tagTermReads.tree.read(),
  ]);
  const holidaySlugs = holidayChildren(termTree);
  const records = await Promise.all(
    holidaySlugs.map((slug) => tagTermReads.items.read(slug)),
  );
  const recordOf = new Map(holidaySlugs.map((slug, i) => [slug, records[i]]));

  const tagTree = board.roots;
  const allFacets = homepageFacets(tagTree, { limit: BROWSE_CHILD_LIMIT });
  /*
   * The intent chips (38a): a term the board draws counts its distinct
   * carriers, aliases included (D2); any other slug, a bare tag, counts
   * from the flat vocabulary of the maps already read.
   */
  const vocabulary = vocabularyOfRows({
    recipeRows: byRecipeTag,
    groupRows: byGroupTag,
    tree: termTree,
  });
  const intents = homepageIntents(
    termTotals([...board.roots, ...board.loose]),
    vocabulary,
  );
  const recipeRows = aliasedRows(termTree, byRecipeTag);
  const groupRows = aliasedRows(termTree, byGroupTag);
  const aliased = new Set(board.aliased);
  /*
   * The flat chips, only for a corpus with no facets: `/tags`' own
   * vocabulary read, after the board rather than beside it, so a site with
   * a hierarchy never expires on the term clouds.
   */
  const tags =
    allFacets.length === 0
      ? (await readTagVocabulary())
          .filter(
            (entry) =>
              !aliased.has(entry.slug) &&
              (entry.count > 0 ||
                recipeRows(entry.slug).length + groupRows(entry.slug).length >
                  0),
          )
          .map((entry) => entry.label)
      : [];

  /*
   * The holidays as menus (48e). A featured holiday term is marked on its
   * row, and Featured leaves it out while the row shows (42f's Df1); the
   * mark comes from the features the list could show (`featureCandidates`).
   */
  const byKey = (key: string) => byRecipeTag?.[key];
  const menus = feastEntries({
    tree: termTree,
    records: (slug) => recordOf.get(slug),
    recipeRows: byKey,
  });
  const feastRecipes = menus.recipes;
  const dated = new Set(menus.feasts.map((feast) => feast.slug));
  const isSeasonal = (entry: (typeof featuredHead.items)[number]) =>
    Boolean(entry.term && dated.has(entry.term));
  const marked = featureCandidates(
    featuredHead.items,
    isSeasonal,
    FEATURED_SIZE,
  );
  /* Twice as many as shown: the day leaves some out (`homepageDay`). */
  const candidates = featureCandidates(
    featuredHead.items,
    isSeasonal,
    FEATURED_SIZE * 2,
  );
  const featuredTerms = new Set(
    marked.flatMap((entry) =>
      entry.term && entry.termLabel ? [entry.term] : [],
    ),
  );
  const feasts = menus.feasts.map((feast) =>
    featuredTerms.has(feast.slug) ? { ...feast, featured: true } : feast,
  );
  /* Browse leaves the holidays root to the menus above it. */
  const facets =
    feasts.length > 0
      ? allFacets.filter((facet) => facet.slug !== HOLIDAYS_ROOT)
      : allFacets;

  /* Each holiday's plan: the newest plan filed under it (Christmas Baking). */
  const feastPlans = feasts.map(
    (feast) =>
      mergeTermRows(
        subtreeKeys(termTree, feast.slug).map(
          (key) => byGroupTag?.[key]?.items,
        ),
      )[0],
  );
  const tonight = tonightCandidates({ tree: termTree, recipeRows: byKey });

  const courses = courseLabels(tagTree, recipeRows);
  const freshRows = recipeHead.items as MassagedRecipeEntry[];
  /* 47h: twice six candidates; the day shows six no section above shows. */
  const recipes: NewRecipe[] = freshRows
    .slice(0, STRIP_SIZE * 2)
    .map((recipe) => {
      const course = courses.get(recipe.slug);
      return course ? { ...recipe, course } : recipe;
    });

  /*
   * Featured's cards (22g): a dangling one keeps its slot as a placeholder
   * (the browser cuts after leaving out what the page shows); a term's
   * counts and picture come from the maps above, a plan's record is one
   * cached read, a recipe's course from the tree.
   */
  async function featuredEntries(): Promise<FeaturedStripEntry[]> {
    return Promise.all(
      candidates.map(async (entry): Promise<FeaturedStripEntry> => {
        if (!entry.recipeName && !entry.groupName && !entry.termLabel) {
          return { kind: "dangling", date: entry.date };
        }
        if (entry.term && entry.termLabel) {
          const node = findTermNode(tagTree, entry.term) ?? {
            slug: entry.term,
            children: [],
          };
          return {
            kind: "term",
            slug: entry.term,
            label: entry.termLabel,
            ...(entry.termImage ? { image: entry.termImage } : {}),
            date: entry.date,
            ...(dated.has(entry.term) ? { holiday: true } : {}),
            summary: termSummary(
              { ...node, image: entry.termImage },
              recipeRows,
              groupRows,
            ),
          };
        }
        if (entry.group && entry.groupName) {
          const group = await groupItems
            .read(entry.group)
            .catch(() => undefined);
          return {
            kind: "group",
            slug: entry.group,
            name: entry.groupName,
            groupKind: entry.groupKind,
            date: entry.date,
            ...(group?.image ? { image: group.image } : {}),
            ...(group ? { items: group.items } : {}),
          };
        }
        const course = courses.get(entry.recipe!);
        return {
          kind: "recipe",
          recipe: {
            slug: entry.recipe!,
            date: entry.date,
            name: entry.recipeName!,
            image: entry.recipeImage,
          } satisfies MassagedRecipeEntry,
          ...(course ? { meta: course } : {}),
        };
      }),
    );
  }

  const [featured, planLines, feastPlanLines] = await Promise.all([
    featuredEntries(),
    readPlanLines(groupHead.items[0]),
    Promise.all(feastPlans.map((plan) => readPlanLines(plan))),
  ]);

  /*
   * The pictures any island may show, rendered here (an image transform is
   * a server's job) and handed down once by slug: small squares for
   * Tonight's quick dinners, the holidays' top recipes and their plans'
   * lines; larger ones for the course candidates and the warm drinks. A
   * recipe without a photo gets its monogram in the island.
   */
  const small = new Map<string, { image?: string; name: string }>();
  const large = new Map<string, { image?: string; name: string }>();
  for (const recipe of tonight.quick) small.set(recipe.slug, recipe);
  for (const recipe of tonight.warm) large.set(recipe.slug, recipe);
  for (const feast of feasts) {
    for (const slug of feast.top) {
      const recipe = feastRecipes.get(slug);
      if (recipe) small.set(slug, recipe);
    }
    for (const slug of feast.cards.flatMap((card) => card.picks)) {
      const recipe = feastRecipes.get(slug);
      if (recipe) large.set(slug, recipe);
    }
  }
  for (const lines of feastPlanLines) {
    for (const line of lines ?? []) {
      if (line.recipe) {
        small.set(line.recipe.slug, { ...line.recipe, name: line.name });
      }
    }
  }
  const thumbs: Record<string, ReactNode> = {};
  for (const [slug, { image, name }] of small) {
    if (image) {
      thumbs[slug] = <RecipeThumb slug={slug} image={image} name={name} />;
    }
  }
  const cards: Record<string, ReactNode> = {};
  for (const [slug, { image, name }] of large) {
    if (image) {
      cards[slug] = (
        <RecipeThumb slug={slug} image={image} name={name} size="card" />
      );
    }
  }
  const names: Record<string, string> = {};
  for (const [slug, { name }] of [...small, ...large]) names[slug] = name;

  const feastViews: FeastView[] = feasts.map((feast, index) => {
    const plan = feastPlans[index];
    const lines = feastPlanLines[index];
    const picks = feast.cards.flatMap((card) =>
      card.picks[0] ? [{ recipe: card.picks[0], label: card.label }] : [],
    );
    const courseWords = feast.cards
      .map((card) => card.label.toLowerCase())
      .join(", ");
    return {
      slug: feast.slug,
      rule: feast.rule,
      label: feast.label,
      counts: feastCounts(feast.counts, feast.featured),
      cards: feast.cards,
      also: feast.also,
      top: feast.top,
      ...(plan
        ? {
            plan: {
              slug: plan.slug,
              name: plan.name,
              count: groupCountLabel(
                plan.itemCount - (plan.groupCount ?? 0),
                plan.groupCount ?? 0,
              ),
              lines: (lines ?? []).map((line) => ({
                href: line.href,
                name: line.name,
                ...(line.recipe ? { slug: line.recipe.slug } : {}),
              })),
            },
          }
        : {}),
      ...(editor.signedIn
        ? {
            startPlanHref: groupPrefillHref({
              name: feast.label,
              tags: [feast.slug],
              items: picks,
            }),
          }
        : {}),
      ...(editor.signedIn && editor.curatorHref
        ? {
            curatorHref: editor.curatorHref(
              `Plan ${feast.label} from its menu on this site (${courseWords}) as a meal plan tagged ${feast.slug}.`,
            ),
          }
        : {}),
    };
  });

  return (
    <Homepage
      intents={intents}
      recipeCount={recipeHead.total}
      serverDay={serverDay}
      ask={editor.ask}
      tonight={tonight}
      feasts={feastViews}
      names={names}
      thumbs={thumbs}
      cards={cards}
      featured={featured}
      featuredLimit={FEATURED_SIZE}
      plan={groupHead.items[0]}
      planLines={planLines}
      showShopping={showShopping}
      recipes={recipes}
      batches={freshBatches(freshRows, termTree)}
      cuisines={freshCuisines(freshRows, termTree)}
      freshLimit={STRIP_SIZE}
      moreRecipes={recipeHead.total > STRIP_SIZE}
      facets={facets}
      tags={tags}
    />
  );
}

export default homepageRoute;
