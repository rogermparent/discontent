import type { MassagedRecipeEntry } from "../../controller/data/read";
import { featuredRecipePages } from "../../controller/data/readFeaturedRecipePages";
import { groupPages } from "../../controller/data/readGroupPages";
import { recipePages } from "../../controller/data/readRecipePages";
import Homepage from ".";

/** How many cards each homepage strip shows. */
const STRIP_SIZE = 6;

/**
 * How many group cards the homepage shows. Three, not six: the cards are
 * three-up and text-only, so a second row of them would push the recipe grids
 * below the fold on a laptop for a section that is a signpost, not the content.
 */
const GROUP_STRIP_SIZE = 3;

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
  const [recipeHead, featuredHead, groupHead] = await Promise.all([
    recipePages.readHead(),
    featuredRecipePages.readHead(),
    /*
     * The same shape as the two above, and invalidated the same way: a group
     * write already fires `pagination:groups:by-date:head`, so
     * `groupSuccessConfig.paginationOnly` keeps working untouched — the
     * homepage needs no `revalidatePath("/")` to see a new group (fact 2).
     */
    groupPages.readHead(),
  ]);

  const recipes: MassagedRecipeEntry[] = recipeHead.items.slice(0, STRIP_SIZE);

  /*
   * Slice *then* filter, matching what `getFeaturedRecipes({ limit: 6 })` did:
   * the six newest are chosen first, and a dangling reference among them
   * yields a shorter strip rather than pulling a seventh entry forward.
   * Filtering first would silently change which cards the homepage shows.
   */
  const featuredRecipes: MassagedRecipeEntry[] = featuredHead.items
    .slice(0, STRIP_SIZE)
    .filter((entry) => entry.recipeName)
    .map((entry) => ({
      slug: entry.recipe,
      date: entry.date,
      name: entry.recipeName!,
      image: entry.recipeImage,
    }));

  return (
    <Homepage
      recipes={recipes}
      featuredRecipes={featuredRecipes}
      groups={groupHead.items.slice(0, GROUP_STRIP_SIZE)}
      moreRecipes={recipeHead.total > STRIP_SIZE}
    />
  );
}

export default homepageRoute;
