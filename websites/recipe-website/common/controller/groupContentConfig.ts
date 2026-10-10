import type { ContentTypeConfig } from "@discontent/cms/content/types";
import buildGroupIndexValue from "./buildGroupIndexValue";
import createDefaultGroupSlug from "./createGroupSlug";
import { featuredRecipeContentConfig } from "./featuredRecipeContentConfig";
import { recipeContentConfig } from "./recipeContentConfig";
import { groupsByGroup, groupsByRecipe } from "./groupAggregateConfigs";
import { groupsByDate } from "./groupPaginationConfig";
import { groupTagTaxonomy } from "./groupTagTaxonomy";
import { Group, GroupEntryKey, GroupEntryValue } from "./types";

/**
 * Content type configuration for groups — meal plans and collections.
 *
 * **Array `references` that follow renames (F32, epic 31).** A group's items
 * live in `items[].recipe` and `items[].group`. Both are declared as reference
 * paths with `fields: []`: a group card borrows nothing from its members, so
 * retitling a recipe does not dirty it, but **renaming** a recipe or a
 * sub-group rewrites every item that names it, in the rename's own commit
 * (`updateDependents`, `referencePath.ts`). A **delete** still leaves a
 * dangling slug the detail page renders as "Recipe not found" — the history
 * of what the group held is worth more than a tidy file (D3, amended). The
 * detail page reads each recipe through the cached item read, so a retitle
 * shows there without any of this.
 *
 * **One scalar edge inbound, since 22g.** A featured entry may point at a group
 * (`FeaturedRecipe.group`), which is an ordinary scalar reference, so this
 * declares the `referencedBy` half that lets `updateDependents` find those
 * features: retitling a group rewrites `groupName` on every featured card that
 * shows it, renaming one rewrites the feature's own data file, and deleting one
 * clears the borrowed values while leaving the slug to render as "Group not
 * found". D3 was amended for exactly this on 2026-09-06.
 *
 * That edge makes this module and `featuredRecipeContentConfig` name each
 * other, so **both sides are thunks** (T4): a bare import would evaluate one
 * module's object literal while the other's `const` was still in the temporal
 * dead zone, and fail at import with a `ReferenceError`.
 */
export const groupContentConfig: ContentTypeConfig<
  Group,
  GroupEntryValue,
  GroupEntryKey
> = {
  contentType: "groups",
  dataDirectory: "groups/data",
  indexDirectory: "groups/index",
  dataFilename: "group.json",
  /*
   * Singular, matching `uploads/recipe` — the engine's default for an
   * undeclared type would be `uploads/groups/<slug>/uploads` (the plural
   * `contentType`), and one tree naming its items in the singular while the
   * other used the plural would be a difference with no reason behind it. The
   * path is baked into three places besides this one: `getGroupUploadPath`,
   * `GroupImage`'s `src` key, and the `uploadsDirectory` the client search
   * cards hand `PureStaticImage`.
   */
  uploadsDirectory: "uploads/group",
  buildIndexValue: buildGroupIndexValue,
  buildIndexKey: (slug: string, data: Group): GroupEntryKey => [
    data.date,
    slug,
  ],
  createDefaultSlug: createDefaultGroupSlug,
  paginationIndexes: [groupsByDate],
  /*
   * Order is part of the contract: `revalidateDerivedState` emits one tag per
   * aggregate in this order, and `test/revalidateDerived.test.ts` compares the
   * list with `toEqual` (T36). `by-group` goes after `by-recipe` because it
   * arrived after it.
   */
  aggregates: [groupsByRecipe, groupsByGroup],
  /*
   * Groups join the site's one `tag` vocabulary (24b/D4). Appended *after* the
   * declared aggregates, which is the order `aggregatesOf` fixes and
   * `revalidateDerived.test.ts` pins with `toEqual` (T4): `by-recipe`,
   * `by-group`, then this taxonomy's `tags` and `by-tag`. Appending is safe;
   * reordering is not.
   */
  taxonomies: [groupTagTaxonomy],
  /*
   * Thunks on both edges (T2): `recipeContentConfig` names this module back,
   * and the self-edge names this very `const`. Never the registry
   * (`contentTypes.ts`), which configs do not import.
   */
  references: [
    {
      config: () => recipeContentConfig,
      dataField: "items[].recipe",
      fields: [],
    },
    {
      config: () => groupContentConfig,
      dataField: "items[].group",
      fields: [],
    },
  ],
  referencedBy: [
    { config: () => featuredRecipeContentConfig, indexField: "group" },
    /* A sub-group's rename rewrites its parents' items (F32). */
    { config: () => groupContentConfig, dataField: "items[].group" },
  ],
};

export default groupContentConfig;
