import { readAllIds } from "@discontent/cms/pagination/readAllIds";
import { projectsByDate, type ProjectListEntry } from "../paginationConfigs";
import { projectContentConfig } from "../projectContentConfig";
import type { ProjectEntryKey, ProjectEntryValue } from "../types";

/**
 * Every project slug, for the export's `project/[slug]`
 * `generateStaticParams` (F7).
 *
 * A keys-only walk of the sorted pagination keyspace, where `getProjects()`
 * deserialized every index value — name, summary, tags, image, the lot — to
 * throw all of it away but the slug.
 *
 * Deliberately not wrapped in `createCachedPaginationReads` the way recipe's
 * sibling reads are, and deliberately not a cached read itself.
 * `generateStaticParams` runs once per build, so an `unstable_cache` entry
 * would be written and never read again — and it would be a fourth tagged read
 * to keep in step with §7's three invalidation seats, bought for nothing.
 * There is no other consumer here either: the editor's project list still
 * reads the content index, and portfolio has no numbered index route.
 *
 * The order is the sorted keyspace's — ascending, where `getProjects()`
 * returned newest-first. `generateStaticParams` is a set, not a sequence: it
 * decides which pages exist, not what any of them contains.
 */
export function readAllProjectIds(): Promise<string[]> {
  return readAllIds<ProjectEntryValue, ProjectEntryKey, ProjectListEntry>({
    config: projectContentConfig,
    paginationConfig: projectsByDate,
  });
}

export default readAllProjectIds;
