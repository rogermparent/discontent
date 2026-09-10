/**
 * What every content type invalidates after a write, in one plain module.
 *
 * These objects used to be inline consts inside each `*EditorConfig` in
 * `controller/actions/*.ts`. They cannot stay there, for a reason that is about
 * Next rather than tidiness: those four modules are `"use server"`, and a
 * `"use server"` module may export **only async functions** (T7). The API
 * routes need the same configs to call `revalidateContentWrite` (D9) after a
 * curation write, so the configs move to a module anything may import and the
 * action modules import them back.
 *
 * The comments came with the objects. They are the record of *why* each config
 * is shaped the way it is — particularly `paginationOnly`, which is a
 * declaration about what the homepage still reads untagged — and they belong
 * next to the values they explain.
 */
import type { ContentSuccessConfig } from "@discontent/cms/content/editorContentConfig";

/**
 * Where the items that borrow from a recipe are served.
 *
 * A featured recipe's *detail* page renders the recipe's name through its own
 * `getRecipeBySlug`, so the borrowed values on the index do not cover it — a
 * retitle would update the cards and leave `/featured-recipe/<slug>` serving
 * the old name. The write path knows which features moved; only the app knows
 * the URL they are served at, which is why this seat exists here and not on
 * the content config.
 *
 * Shared by the update and delete configs: a delete strips the borrowed values
 * from every feature of the recipe, and those detail pages go stale in exactly
 * the same way.
 */
export const RECIPE_DEPENDENT_ITEM_BASE_PATHS = {
  "featured-recipes": "/featured-recipe",
};

export const recipeSuccessConfig: ContentSuccessConfig = {
  itemBasePath: "/recipe",
  /*
   * Empty because `/recipes` and `/recipes/[page]` read through the
   * pagination index, and `revalidatePaginationResults` invalidates exactly
   * the pages a write actually changed — where a blanket `revalidatePath`
   * dropped every sealed page on every create.
   *
   * With `listPaths` empty on all **three** recipe-family configs (this one,
   * `recipeDeleteSuccessConfig` below, and featured recipes' — a comment here
   * used to say four), `paginationOnly` controls exactly one call:
   * `revalidatePath("/")`. So the only question it has ever asked is "what
   * does the homepage still read untagged", and the answer is now nothing.
   * `homepageRoute` reads four things, and each carries a tag this write
   * fires when it moves them:
   *
   *   `recipePages.readHead()`          pagination head tag       (P3)
   *   `featuredRecipePages.readHead()`  pagination head tag       (D2b/F10a)
   *   `getAllTags()`                    aggregate tag             (F10b/F10c)
   *   `recipeItems.read(heroSlug)`      `item:recipes:<slug>`     (F19)
   *
   * The hero was the last holdout and F19 closed it. Note what did *not*
   * need a special case: featuring a recipe changes *which* recipe the hero
   * renders, but the hero is not a cached page — only the read is cached,
   * keyed by slug — so a different hero is simply a different cache key, and
   * the choice itself comes from the featured head above.
   *
   * **This is a declaration, not a measurable change**, and the honest
   * framing matters more than the flag. A production build renders `/` as
   * `ƒ` — next-auth reads cookies in the layout — so there is no Full Route
   * Cache entry for `revalidatePath("/")` to drop, and the export has no
   * server at all. Nothing observable moves. What changes is that the record
   * is now true: the write path is precise, rather than precise-plus-a-
   * blanket-call kept for the one reader that had no tag.
   *
   * F4 never blocked this, contrary to what the doc used to say:
   * `revalidatePath("/")` never covered `/search/all`, `/search/ingredients`
   * or `/search/version`, which are separate route paths that nothing
   * revalidates.
   */
  listPaths: [],
  paginationOnly: true,
  dependentItemBasePaths: RECIPE_DEPENDENT_ITEM_BASE_PATHS,
};

export const recipeDeleteSuccessConfig: ContentSuccessConfig = {
  itemBasePath: "/recipe",
  listPaths: [],
  /* Same reasoning as above; a delete moves the same four readers. */
  paginationOnly: true,
  dependentItemBasePaths: RECIPE_DEPENDENT_ITEM_BASE_PATHS,
  redirectTo: () => "/",
};

export const featuredRecipeSuccessConfig: ContentSuccessConfig = {
  itemBasePath: "/featured-recipe",
  /*
   * Empty because `/featured-recipes` and `/featured-recipes/[page]` read
   * through the pagination index, and `revalidatePaginationResults`
   * invalidates exactly the pages a write actually changed — where a blanket
   * `revalidatePath` dropped every sealed page on every feature.
   *
   * `paginationOnly` is on since F19, for the reason set out at length on the
   * recipe config: every reader on `/` now carries a tag, the hero's item
   * read having been the last holdout.
   *
   * A featured write matters to the homepage in two ways, and both are
   * covered by the featured head tag this write already fires. It changes
   * what the strip lists, and it changes *which* recipe the hero renders —
   * because the hero prefers the newest featured recipe. The second needs no
   * special case: the hero is not a cached page, only its read is cached and
   * keyed by slug, so a new hero is a different cache key rather than a stale
   * entry. The chosen slug comes from the head above.
   *
   * Featured recipes have no delete config, so a feature *delete* runs
   * through here too and redirects to `/`. With the flag on, the featured
   * head tag alone has to carry that — which is worth knowing, and is why
   * `featured-recipes.spec.ts` covers a delete removing the card from `/`.
   */
  listPaths: [],
  paginationOnly: true,
  redirectTo: () => "/",
};

export const pageSuccessConfig: ContentSuccessConfig = {
  // Pages render at the site root ("/about"), not under a prefix, so
  // itemBasePath is empty and the redirect target is "/" + slug. Keeping that
  // exact target matters: `pages.spec.ts` asserts the rendered page
  // immediately after creating it.
  itemBasePath: "",
  listPaths: [{ path: "/pages" }],
  redirectTo: (slug: string) => "/" + slug,
};

export const pageDeleteSuccessConfig: ContentSuccessConfig = {
  itemBasePath: "",
  listPaths: [{ path: "/pages" }],
  redirectTo: () => "/pages",
};

export const groupSuccessConfig: ContentSuccessConfig = {
  itemBasePath: "/group",
  /*
   * Empty, and `paginationOnly` on, for the reason the recipe and featured
   * configs give at length: `/groups` and `/groups/[page]` read through the
   * pagination index, so `revalidatePaginationResults` invalidates exactly
   * the pages this write moved, where a blanket `revalidatePath` would drop
   * every sealed page on every save.
   *
   * The flag's only remaining job is dropping `revalidatePath("/")`, and that
   * stayed correct when 22f gave the homepage a Groups section: the section
   * reads `groupPages.readHead()`, whose `pagination:groups:by-date:head` tag
   * this very write already fires through `revalidatePaginationResults`. A
   * blanket path call would drop the whole homepage — hero, both recipe
   * strips, the browse chips — to move three cards. The recipe *views* that
   * render "Appears in" also read group state, and they are covered without a
   * path call for the same kind of reason: the block reads
   * `groupsByRecipe`, whose aggregate tag this write fires through
   * `revalidateAggregateResults` — and only when the folded value actually
   * moved, which is the whole point of the aggregate kind.
   */
  listPaths: [],
  paginationOnly: true,
  /* No `redirectTo`: the default is `itemBasePath + "/" + slug`. */
};

/*
 * A delete needs its own, or it would inherit the create/update redirect and
 * send the user to the group it just removed. `/groups` is where a delete
 * leaves you everywhere else in this app (pages, menus), and the aggregate
 * tag above still carries the "Appears in" removal onto every recipe view.
 */
export const groupDeleteSuccessConfig: ContentSuccessConfig = {
  itemBasePath: "/group",
  listPaths: [],
  paginationOnly: true,
  redirectTo: () => "/groups",
};

/**
 * The configs, keyed the way a write *event* names its content type.
 *
 * The curation layer's `onWrite` hook reports `{contentType, kind}` and nothing
 * else, so this is the lookup that turns those two strings into the object
 * `revalidateContentWrite` needs. A type with no delete config falls back to
 * its write one, which is exactly what `createGenericActions` does with
 * `deleteSuccessConfig || successConfig`.
 */
const SUCCESS_CONFIGS: Record<
  string,
  { write: ContentSuccessConfig; delete: ContentSuccessConfig }
> = {
  recipes: { write: recipeSuccessConfig, delete: recipeDeleteSuccessConfig },
  "featured-recipes": {
    write: featuredRecipeSuccessConfig,
    delete: featuredRecipeSuccessConfig,
  },
  pages: { write: pageSuccessConfig, delete: pageDeleteSuccessConfig },
  groups: { write: groupSuccessConfig, delete: groupDeleteSuccessConfig },
};

export function successConfigFor(
  contentType: string,
  kind: "write" | "delete",
): ContentSuccessConfig {
  const entry = SUCCESS_CONFIGS[contentType];
  if (!entry) {
    throw new Error(`No success config for content type "${contentType}"`);
  }
  return entry[kind];
}
