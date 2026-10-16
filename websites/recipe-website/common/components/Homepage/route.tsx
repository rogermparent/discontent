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
import {
  HOLIDAYS_ROOT,
  comingUpEntries,
  courseLabels,
  findTermNode,
  termSummary,
} from "../../controller/homepageComingUp";
import { homepageFacets } from "../../controller/homepageFacets";
import { homepageIntents, termTotals } from "../../controller/homepageIntents";
import { dayKey, localDay } from "../../util/holidays";
import Homepage from ".";
import type { FeaturedStripEntry } from "./FeaturedStrip";

/** How many cards each homepage strip shows. */
const STRIP_SIZE = 6;

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
export async function homepageRoute() {
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
  const allFacets = homepageFacets(tagTree);
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
  const comingUp = comingUpEntries(tagTree, recipeRows, groupRows);
  /*
   * Browse skips the holidays root while Coming up shows it: the same terms
   * twice, one screen apart. Without a Coming up section it stays a row.
   */
  const facets =
    comingUp && comingUp.length > 0
      ? allFacets.filter((facet) => facet.slug !== HOLIDAYS_ROOT)
      : allFacets;

  const recipes: MassagedRecipeEntry[] = recipeHead.items.slice(0, STRIP_SIZE);

  /*
   * Slice *then* filter, matching what `getFeaturedRecipes({ limit: 6 })` did:
   * the six newest are chosen first, and a dangling reference among them
   * yields a shorter strip rather than pulling a seventh entry forward.
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
  const courses = courseLabels(tagTree, recipeRows);
  const featured: FeaturedStripEntry[] = await Promise.all(
    featuredHead.items
      .slice(0, STRIP_SIZE)
      .filter((entry) => entry.recipeName || entry.groupName || entry.termLabel)
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

  return (
    <Homepage
      recipes={recipes}
      featured={featured}
      plan={groupHead.items[0]}
      facets={facets}
      tags={tags}
      intents={intents}
      comingUp={comingUp}
      /*
       * The server's day, for the countdowns' first render only — the browser
       * replaces it with its own (`useToday`). On the static export this is
       * the build's day, which is exactly why it is never the final answer.
       */
      serverDay={dayKey(localDay(new Date()))}
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
