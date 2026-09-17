import type {
  TaxonomyByTermEntry,
  TaxonomyConfig,
} from "@discontent/cms/taxonomies/types";
import { projectsByDate, type ProjectListEntry } from "./paginationConfigs";
import type { ProjectEntryKey, ProjectEntryValue } from "./types";

/**
 * Projects' tag vocabulary.
 *
 * `Project.tags` has been stored, indexed, form-editable and rendered on every
 * index row since the collection was written — with **no aggregate and no
 * routes**, so a reader could see a tag but never click it. This declaration is
 * the whole of the fix: the engine derives `projects/aggregates/tags` and
 * `projects/aggregates/by-tag` from it, and `components/TagPage` renders them.
 *
 * Its own module rather than a field inside `projectContentConfig.ts` — the
 * content config imports this, and this imports only the pagination module and
 * types back, so there is no cycle (T1/T3).
 */
export const projectTagTaxonomy: TaxonomyConfig<
  ProjectEntryValue,
  ProjectEntryKey,
  ProjectListEntry
> = {
  name: "tag",
  field: "tags",
  /*
   * `"1"`: new derived state, so there is no stored shape to invalidate. Bump
   * when `project` changes what it produces (T1) — `test/specVersions.test.ts`
   * asks about every edit to this module until someone has decided.
   */
  version: "1",
  /*
   * **The same function `projectsByDate` projects with**, so a by-term row *is*
   * a `ProjectListEntry` and a tag page lists exactly what the index lists. One
   * definition, reused, rather than two that could drift — and the projection
   * is already near-identity here, for the reason `ProjectListEntry` argues.
   */
  project: projectsByDate.project,
};

/** One tag's projects, as `/tags/<slug>` lists them. */
export type ProjectTagIndexEntry = TaxonomyByTermEntry<ProjectListEntry>;

export default projectTagTaxonomy;
