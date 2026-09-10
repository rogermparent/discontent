import type { ContentTypeConfig } from "@discontent/cms/content/types";
import buildGroupIndexValue from "./buildGroupIndexValue";
import createDefaultGroupSlug from "./createGroupSlug";
import { groupsByRecipe } from "./groupAggregateConfigs";
import { groupsByDate } from "./groupPaginationConfig";
import { Group, GroupEntryKey, GroupEntryValue } from "./types";

/**
 * Content type configuration for groups — meal plans and collections.
 *
 * **No `references` and no `referencedBy` (D3).** A group's recipes live in
 * `items[].recipe`, and the engine's reference machinery is scalar-only
 * (`content/references.ts`, `updateDependents.ts`), so there is no declaration
 * that would follow them. The consequences are deliberate and bounded: a group
 * card borrows nothing, so a retitle does not dirty it; the detail page reads
 * each recipe through the cached item read, so a retitle *does* show there; and
 * a rename or delete leaves a dangling slug the detail page renders as
 * "Recipe not found". Array references are engine follow-up F32.
 *
 * Imports nothing from the recipe config, so it needs no thunk and cannot
 * participate in the temporal-dead-zone cycle §6.1 describes (T4).
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
};

export default groupContentConfig;
