import type { MassagedRecipeEntry } from "../../controller/data/read";
import { featuredRecipePages } from "../../controller/data/readFeaturedRecipePages";
import { groupPages } from "../../controller/data/readGroupPages";
import { recipePages } from "../../controller/data/readRecipePages";
import { readTagLabels, readTagTree } from "../../controller/data/readTermPage";
import { homepageFacets } from "../../controller/homepageFacets";
import Homepage from ".";
import type { FeaturedStripEntry } from "./FeaturedStrip";

/** How many cards each homepage strip shows. */
const STRIP_SIZE = 6;

/**
 * How many group cards the homepage shows: one row of the six-up grid. It was
 * three while the cards were text-only and three-up; since 22g they are
 * thumbnails in the recipe grid's six columns, and three left half a row empty.
 */
const GROUP_STRIP_SIZE = STRIP_SIZE;

/**
 * The homepage, defined once and re-exported by both apps' `page.tsx`.
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
  const [recipeHead, featuredHead, groupHead, tagTree] = await Promise.all([
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
     * on the chips are what that read buys.
     */
    readTagTree(),
  ]);
  const facets = homepageFacets(tagTree);
  /*
   * The flat chips, only for a corpus with no facets (no term records with
   * children — every test fixture but two). Read after the tree rather than
   * beside it, so a site with a vocabulary never pays for, or expires on, the
   * term clouds `readTagLabels` reads.
   */
  const tags = facets.length === 0 ? await readTagLabels() : [];

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
  const featured: FeaturedStripEntry[] = featuredHead.items
    .slice(0, STRIP_SIZE)
    .filter((entry) => entry.recipeName || entry.groupName || entry.termLabel)
    .map((entry): FeaturedStripEntry => {
      /* Newest discriminator first, as the card list does — see that file. */
      if (entry.term && entry.termLabel) {
        return {
          kind: "term",
          slug: entry.term,
          label: entry.termLabel,
          ...(entry.termImage ? { image: entry.termImage } : {}),
          date: entry.date,
        };
      }
      if (entry.group && entry.groupName) {
        return {
          kind: "group",
          slug: entry.group,
          name: entry.groupName,
          groupKind: entry.groupKind,
          date: entry.date,
        };
      }
      return {
        kind: "recipe",
        recipe: {
          slug: entry.recipe!,
          date: entry.date,
          name: entry.recipeName!,
          image: entry.recipeImage,
        } satisfies MassagedRecipeEntry,
      };
    });

  return (
    <Homepage
      recipes={recipes}
      featured={featured}
      groups={groupHead.items.slice(0, GROUP_STRIP_SIZE)}
      facets={facets}
      tags={tags}
      moreRecipes={recipeHead.total > STRIP_SIZE}
      /*
       * The intro line's counts. `total` is on the head pages already read,
       * under the same head tags, for the reason `moreRecipes` gives above.
       */
      recipeCount={recipeHead.total}
      groupCount={groupHead.total}
    />
  );
}

export default homepageRoute;
