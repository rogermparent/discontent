import { createCachedPaginationReads } from "@discontent/cms/pagination/next/cachedReads";
import { readAllIds } from "@discontent/cms/pagination/readAllIds";
import { groupContentConfig } from "../groupContentConfig";
import { groupsByDate, type GroupListEntry } from "../groupPaginationConfig";
import type { GroupEntryKey, GroupEntryValue } from "../types";

/**
 * The cached reads for the group index, shared by the editor and the export.
 *
 * Built at module scope rather than per request so the `React.cache` wrappers
 * inside survive long enough to dedupe anything — a factory called inside a
 * render hands back a fresh, empty memo table every time.
 *
 * Not importable from the CLI (D8/T5): `unstable_cache` throws outside a Next
 * request. Anything running under plain `node`/`tsx` wants `readPage` /
 * `readAggregate` with an explicit `contentDirectory` instead.
 */
export const groupPages = createCachedPaginationReads<
  GroupEntryValue,
  GroupEntryKey,
  GroupListEntry
>({
  config: groupContentConfig,
  paginationConfig: groupsByDate,
});

/**
 * Every group slug, for the export's `group/[slug]` `generateStaticParams`
 * (F7). A keys-only walk of the sorted keyspace — see `readAllFeaturedRecipeIds`
 * on why this is not one of the cached reads above.
 */
export function readAllGroupIds(): Promise<string[]> {
  return readAllIds<GroupEntryValue, GroupEntryKey, GroupListEntry>({
    config: groupContentConfig,
    paginationConfig: groupsByDate,
  });
}

export default groupPages;
