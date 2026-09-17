import type {
  TaxonomyByTermEntry,
  TaxonomyConfig,
} from "@discontent/cms/taxonomies/types";
import {
  projectGroupListEntry,
  type GroupListEntry,
} from "./groupPaginationConfig";
import type { GroupEntryKey, GroupEntryValue } from "./types";

/**
 * Groups join the site's **one** `tag` vocabulary (24b/D4).
 *
 * Same `name` as recipes declare, which is the whole of the universality claim:
 * the vocabulary is site-level and each carrier type declares participation, so
 * a term's page unions the recipes and the groups naming it at read time
 * (`TagPage/routes.tsx`). Nothing here knows that recipes exist.
 *
 * Its own module rather than a field inside `groupContentConfig.ts` — the
 * content config imports this, and this imports only the pagination module and
 * types back, so there is no cycle (T1/T3).
 */
export const groupTagTaxonomy: TaxonomyConfig<
  GroupEntryValue,
  GroupEntryKey,
  GroupListEntry
> = {
  name: "tag",
  field: "tags",
  /*
   * `"1"`: this vocabulary is new on groups, so there is no stored shape to
   * invalidate. It is independent of the recipe taxonomy's `"2"` — the stored
   * spec version is per content type, and two carriers of one vocabulary
   * version their own projections. Bump when `project` changes what it
   * produces (T1).
   */
  version: "1",
  /*
   * **The same function `groupsByDate` projects with**, so a by-term row *is* a
   * `GroupListEntry` and `GroupList` renders a tag page's groups with no second
   * card shape and no adapter. One definition, imported, rather than two that
   * could drift.
   */
  project: projectGroupListEntry,
};

/** One tag's groups, as `/tags/<slug>` lists them. */
export type GroupTagIndexEntry = TaxonomyByTermEntry<GroupListEntry>;

export default groupTagTaxonomy;
