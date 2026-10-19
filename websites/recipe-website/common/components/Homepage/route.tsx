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
import { aliasedRows, vocabularyOfRows } from "../../controller/tagVocabulary";
import { groupItems } from "../../controller/data/readGroupItem";
import { resolveGroupItems } from "../../controller/data/resolveGroupItems";
import { scaleOf } from "../GroupDetailPage/GroupItems";
import {
  HOLIDAYS_ROOT,
  comingUpEntries,
  courseLabels,
  datedHolidays,
  featureCandidates,
  findTermNode,
  markFeaturedHolidays,
  termSummary,
} from "../../controller/homepageComingUp";
import { homepageFacets } from "../../controller/homepageFacets";
import { homepageIntents, termTotals } from "../../controller/homepageIntents";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import { dayKey, localDay } from "../../util/holidays";
import Homepage from ".";
import { BROWSE_CHILD_LIMIT } from "./BrowseTerms";
import type { FeaturedStripEntry } from "./FeaturedPanel";
import type { NewRecipe } from "./NewThisWeek";
import type { PlanLine } from "./PlanPanel";

/** How many rows "New this week" and "Featured" each show. */
const STRIP_SIZE = 6;

/**
 * The newest plan's lines for the rail (42f): its record (cached,
 * `item:groups:<slug>`, the read its thumbnail made anyway) and each line's
 * recipe or sub-plan (cached item reads, `resolveGroupItems`), in the plan's
 * order. A dangling line is left out — the plan's own page says "not
 * found"; the homepage is no place for a hole. `undefined` when the record
 * cannot be read.
 */
async function readPlanLines(
  plan: GroupListEntry | undefined,
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

/**
 * The homepage, defined once and re-exported by both apps' `page.tsx`. It
 * reads no session and no inventory: the Make tile counts from the browser's
 * own list (U6), so the page is the same for every reader.
 *
 * Both strips read the pre-baked keyspace rather than the content index. The
 * trade is deliberate and worth stating: `readHead` hands back `perPage + 1`
 * to `2 * perPage` rows — up to 24 — to serve six. That is more rows than
 * `getRecipes({ limit: 6 })` read, but it is still one forward range seek
 * either way, against a process-cached environment rather than one
 * `readContentIndex` opens and unmaps per call. What it buys is the point: the
 * strips now sit behind a cache tag, so a write that dirties no page leaves
 * them alone. `readContentIndex` carries no tag at all.
 *
 * `moreRecipes` comes from `total`, which `PaginationPage` already carries.
 * Deliberately not from `readPaginationMeta` — the meta tag moves on nearly
 * every write, and reading it here would hand back most of the precision the
 * head tag just bought. `total` cannot change without the head page being
 * dirty, so the head-tagged entry is always fresh. It is also a small
 * correctness win over the `more` it replaces, which is unreliable for reads
 * that do not bound themselves (F2).
 */
export async function homepageRoute({
  showShopping = false,
}: {
  /**
   * The reader is a signed-in editor: the plan panel links the shopping
   * list. Only the editor's page passes it, from its session; the export's
   * never does, so the static build cannot link a page it does not have.
   */
  showShopping?: boolean;
} = {}) {
  /*
   * The server's day, for the season's first render only — the browser
   * replaces it with its own (`useToday`). On the static export this is the
   * build's day, which is exactly why it is never the final answer.
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
    /*
     * The same shape as the two above, and invalidated the same way: a group
     * write already fires `pagination:groups:by-date:head`, so
     * `groupSuccessConfig.paginationOnly` keeps working untouched — the
     * homepage needs no `revalidatePath("/")` to see a new group (fact 2).
     */
    groupPages.readHead(),
    /*
     * The browse section's facets: `/tags`' own tree read (31b), so the
     * homepage is invalidated exactly when that page is. It reads under three
     * tags, and every term write reaches one of them through the engine's
     * generic write path (`revalidateContentWrite` → aggregate results):
     *
     * - the term records' `tree` aggregate — `term create`, `update`,
     *   `rename`, `delete` and `merge` all write a record, and the tree folds
     *   label, parent, children and image, so a moved value fires its tag;
     * - the recipes' and groups' `by-tag` maps, whole-value tag — `term
     *   assign` (and any recipe or group whose tags change) moves a key, and
     *   a keyed aggregate fires `:whole` beside the key's own tag (32e).
     *
     * The cost is breadth, and it is accepted: those whole maps move on any
     * tag change anywhere, so the homepage now expires on a retag that dirties
     * no head page. It still expires on nothing else, and the subtree totals
     * on the chips and intent tiles are what that read buys.
     */
    readTagBoard(),
    /*
     * The same two whole maps and the tree `readTagBoard` just read —
     * `React.cache` hands back the same values, so this is no second read
     * and no new tag. "Coming up" needs their rows, not only their counts:
     * recipes and plans per holiday, and a recipe photo for a holiday with
     * no picture of its own; the tree says which slugs alias which term.
     */
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
    tagTermReads.tree.read(),
  ]);
  const tagTree = board.roots;
  const allFacets = homepageFacets(tagTree, { limit: BROWSE_CHILD_LIMIT });
  /*
   * The intent tiles, per tile (38a): a term the board draws — a root's
   * subtree or a loose record — counts its distinct carriers, aliases
   * included (D2); any other slug, a bare tag, counts from the flat
   * vocabulary. That vocabulary comes from the maps already read, so a site
   * with a hierarchy pays for no term cloud.
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
  /*
   * The flat chips, only for a corpus with no facets (no term records with
   * children — every test fixture but a few): `/tags`' own vocabulary read,
   * after the board rather than beside it, so a site with a hierarchy never
   * expires on the term clouds.
   */
  /* A term's rows include its aliases' (38a, D2), for Coming up's counts. */
  const recipeRows = aliasedRows(termTree, byRecipeTag);
  const groupRows = aliasedRows(termTree, byGroupTag);
  /* An alias slug is its term's, not a chip of its own (38a review); a term
   * carried only through an alias still gets its chip. */
  const aliased = new Set(board.aliased);
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
   * "This season" and the featured list share their holidays once (42f):
   * a featured holiday term's row says "featured", and the featured list
   * hides the holidays that have a row on the reader's day (`HomeRail`).
   * The head page holds up to `2 * perPage` features, so a hidden holiday
   * lets the next feature up rather than shortening the list
   * (`featureCandidates`). The "featured" mark comes from those same
   * candidates — a holiday featured long ago, past the list's reach, is
   * not called featured.
   */
  const holidays = comingUpEntries(tagTree, recipeRows, groupRows);
  const season = datedHolidays(holidays ?? []).map(({ slug, rule }) => ({
    slug,
    ...(rule ? { rule } : {}),
  }));
  const seasonal = new Set(season.map(({ slug }) => slug));
  const candidates = featureCandidates(
    featuredHead.items,
    (entry) => Boolean(entry.term && seasonal.has(entry.term)),
    STRIP_SIZE,
  );
  const featuredTerms = new Set(
    candidates.flatMap((entry) =>
      entry.term && entry.termLabel ? [entry.term] : [],
    ),
  );
  const comingUp = holidays && markFeaturedHolidays(holidays, featuredTerms);
  /*
   * Browse skips the holidays root while the season shows it: the same terms
   * twice, one screen apart. Without a season section it stays a row.
   */
  const facets =
    comingUp && comingUp.length > 0
      ? allFacets.filter((facet) => facet.slug !== HOLIDAYS_ROOT)
      : allFacets;

  const courses = courseLabels(tagTree, recipeRows);
  const recipes: NewRecipe[] = recipeHead.items
    .slice(0, STRIP_SIZE)
    .map((recipe: MassagedRecipeEntry) => {
      const course = courses.get(recipe.slug);
      return course ? { ...recipe, course } : recipe;
    });

  /*
   * Take enough to leave six once the season's holidays hide
   * (`featureCandidates`), then filter the dangling — slice-then-filter, as
   * `getFeaturedRecipes({ limit: 6 })` did: the six newest are chosen first,
   * and a dangling reference among them yields a shorter list rather than
   * pulling a seventh entry forward.
   * Filtering first would silently change which cards the homepage shows.
   *
   * The filter is on the *borrowed name* rather than on the reference, which is
   * what makes it cover both kinds with one rule (22g): an entry whose recipe
   * or group has been deleted has no name to print, and a nameless card on the
   * homepage would be a hole rather than information. `/featured-recipes`
   * deliberately differs — it renders the dangle as "Group not found", because
   * that page is where a curator goes to fix one.
   *
   * `termLabel` joins the same rule at 24c: one condition per borrowed name,
   * and a deleted term record drops off the homepage exactly as a deleted group
   * does.
   */
  /*
   * Each card's line and picture (2026-10-15): a term's subtree counts and
   * photo come from the maps above; a recipe's course likewise; a group's
   * record is one cached read (`item:groups:<slug>`, fired by every group
   * write) — the read its thumbnail made anyway, now made once here and
   * handed down.
   */
  async function featuredEntries(): Promise<FeaturedStripEntry[]> {
    return Promise.all(
      candidates
        .filter(
          (entry) => entry.recipeName || entry.groupName || entry.termLabel,
        )
        .map(async (entry): Promise<FeaturedStripEntry> => {
          /* Newest discriminator first, as the card list does — see that file. */
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
              ...(seasonal.has(entry.term) ? { holiday: true } : {}),
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

  const [featured, planLines] = await Promise.all([
    featuredEntries(),
    readPlanLines(groupHead.items[0]),
  ]);

  return (
    <Homepage
      recipes={recipes}
      featured={featured}
      season={season}
      featuredLimit={STRIP_SIZE}
      plan={groupHead.items[0]}
      planLines={planLines}
      showShopping={showShopping}
      facets={facets}
      tags={tags}
      intents={intents}
      comingUp={comingUp}
      serverDay={serverDay}
      moreRecipes={recipeHead.total > STRIP_SIZE}
      /*
       * "All N recipes". `total` is on the head page already read, under the
       * same head tag, for the reason `moreRecipes` gives above.
       */
      recipeCount={recipeHead.total}
    />
  );
}

export default homepageRoute;
