import type { ContentTypeConfig } from "@discontent/cms/content/types";
import buildGroupIndexValue from "./buildGroupIndexValue";
import createDefaultGroupSlug from "./createGroupSlug";
import { featuredRecipeContentConfig } from "./featuredRecipeContentConfig";
import { groupsByRecipe } from "./groupAggregateConfigs";
import { groupsByDate } from "./groupPaginationConfig";
import { Group, GroupEntryKey, GroupEntryValue } from "./types";

/**
 * Content type configuration for groups — meal plans and collections.
 *
 * **No *array* `references` (D3).** A group's recipes live in `items[].recipe`,
 * and the engine's reference machinery is scalar-only
 * (`content/references.ts`, `updateDependents.ts`), so there is no declaration
 * that would follow them. The consequences are deliberate and bounded: a group
 * card borrows nothing from its recipes, so retitling one does not dirty it;
 * the detail page reads each recipe through the cached item read, so a retitle
 * *does* show there; and a rename or delete leaves a dangling slug the detail
 * page renders as "Recipe not found". Array references are engine follow-up
 * F32.
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
  buildIndexValue: buildGroupIndexValue,
  buildIndexKey: (slug: string, data: Group): GroupEntryKey => [
    data.date,
    slug,
  ],
  createDefaultSlug: createDefaultGroupSlug,
  paginationIndexes: [groupsByDate],
  aggregates: [groupsByRecipe],
  referencedBy: [
    { config: () => featuredRecipeContentConfig, indexField: "group" },
  ],
};

export default groupContentConfig;
