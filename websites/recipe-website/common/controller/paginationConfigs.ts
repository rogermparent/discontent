import type { PaginationIndexConfig } from "@discontent/cms/pagination/types";
import { FEATURED_RECIPES_PER_PAGE } from "../components/FeaturedRecipeIndexPage/constants";
import { RECIPES_PER_PAGE } from "../components/RecipeIndexPage/constants";
import type {
  FeaturedRecipeEntryKey,
  FeaturedRecipeEntryValue,
  GroupKind,
  RecipeEntryKey,
  RecipeEntryValue,
} from "./types";

/**
 * What one row of the paginated recipe index renders — exactly the five fields
 * `RecipeListItem` destructures, and nothing else.
 *
 * The narrowness is the point, not an oversight. The projection is what a page
 * hash is taken over, so a field carried here that nobody renders would dirty
 * sealed pages every time it changed. `getRecipes` still drags descriptions,
 * ingredients and times through for the search corpus; that read is unaffected.
 */
export interface RecipeListEntry {
  slug: string;
  date: number;
  name: string;
  image?: string;
  tags?: string[];
}

/**
 * Recipes by date, newest first.
 *
 * Its own module rather than a field inside `recipeContentConfig.ts`: the
 * content config imports this, and this imports only *types* back, so there is
 * no cycle.
 */
export const recipesByDate: PaginationIndexConfig<
  RecipeEntryValue,
  RecipeEntryKey,
  RecipeListEntry
> = {
  name: "by-date",
  perPage: RECIPES_PER_PAGE,
  /*
   * The whole of this index's spec hash — declared, not derived.
   *
   * The engine once folded `fn.toString()` in too, which a production build
   * minifies and a dev server does not, so an index built by one and read by
   * the other read as stale and rebuilt itself — every page dirty, every time.
   * The Playwright fixtures are generated against `next dev` while `e2e-start`
   * runs the suite against a build, so that boundary is crossed on every run;
   * a real deployment crosses it whenever the editor and the export build
   * share a content directory. F16 removed the derived half.
   *
   * So bump this by hand when `key` or `project` changes — nothing else will
   * notice. `test/specVersions.test.ts` fails on any edit to this file until
   * someone has decided whether it needed a bump.
   */
  version: "1",
  /*
   * The date lives in the content index *key*, not the value — `buildIndexKey`
   * is `[date, slug]` while `RecipeEntryValue` carries no date at all. Both
   * functions below therefore read it from `entry.key`.
   */
  key: ({ key: [date], id }) => [date, id],
  project: ({ key: [date], value, id }) => ({
    slug: id,
    date,
    name: value.name,
    image: value.image,
    tags: value.tags,
  }),
};

/**
 * What one row of the paginated featured-recipe index renders — exactly what
 * `FeaturedRecipeListItem` destructures, and nothing else.
 *
 * `recipeName` and `recipeImage` are only projectable *because* D2a borrowed
 * them onto the index value. Before that a card needed a `recipe.json` read
 * per row, which a pre-baked page cannot do: a page is projected once, at
 * write time, from the index entry alone. The borrowed fields are what make
 * the featured index coverable, and this is the payoff.
 *
 * They stay optional for the same two reasons they are optional on the index
 * value — a reference can dangle, and an index written before the fields
 * existed simply will not have them.
 */
export interface FeaturedRecipeListEntry {
  slug: string;
  date: number;
  recipe?: string;
  note?: string;
  recipeName?: string;
  recipeImage?: string;
  /**
   * The group half (22g). `recipe` and `group` are both optional here because
   * an entry sets exactly one of them, and the card branches on `group`.
   *
   * `groupKind` is what the card's badge prints, and it is borrowed rather than
   * read: a projection that read the group's data file would be a value nothing
   * invalidates, which is the whole argument `recipeName` makes above.
   */
  group?: string;
  groupName?: string;
  groupKind?: GroupKind;
}

/**
 * Featured recipes by date, newest first.
 *
 * The same shape as `recipesByDate` down to the key function, because the two
 * content types are keyed alike: `buildIndexKey` is `[date, slug]` on both.
 */
export const featuredRecipesByDate: PaginationIndexConfig<
  FeaturedRecipeEntryValue,
  FeaturedRecipeEntryKey,
  FeaturedRecipeListEntry
> = {
  name: "by-date",
  perPage: FEATURED_RECIPES_PER_PAGE,
  /*
   * Pinned by hand, for the reason spelled out on `recipesByDate` above.
   *
   * `"2"` since 22g: the projection gained `group`, `groupName` and `groupKind`,
   * so every page projected by a `"1"` build is missing the three fields a
   * featured *group* card renders and has to be reprojected.
   */
  version: "2",
  key: ({ key: [date], id }) => [date, id],
  project: ({ key: [date], value, id }) => ({
    slug: id,
    date,
    recipe: value.recipe,
    note: value.note,
    recipeName: value.recipeName,
    recipeImage: value.recipeImage,
    group: value.group,
    groupName: value.groupName,
    groupKind: value.groupKind,
  }),
};

export default recipesByDate;
