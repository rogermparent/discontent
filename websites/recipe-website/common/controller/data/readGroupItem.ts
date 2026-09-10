import { createCachedItemRead } from "@discontent/cms/content/next/cachedItemRead";
import { groupContentConfig } from "../groupContentConfig";
import type { Group, GroupEntryKey, GroupEntryValue } from "../types";

/**
 * The cached by-slug read for a group's whole data file, shared by the editor
 * and the export (D13/22g).
 *
 * `readGroups.ts` argued at length that groups did not need one, and the
 * argument was sound for the reason it gave — a group *detail* page reads its
 * own record once. What changed is not that page but the **cards**: every
 * server-rendered group card now picks a member's thumbnail, and the member
 * slugs live in the group's `items`, which no projection carries (`GroupListEntry`
 * projects a count, deliberately — see `groupPaginationConfig.ts`). So `/groups`,
 * the homepage Groups section and the featured strip each read every group they
 * list, and `unstable_cache` under `item:groups:<slug>` is what keeps that one
 * read rather than one per card per request.
 *
 * Built at module scope so the `React.cache` wrapper inside survives long
 * enough to dedupe, the same reasoning as `readRecipeItem.ts`.
 *
 * Read sites only, and **never from a script or the CLI** (T5/D8):
 * `unstable_cache` throws outside a Next render. `getGroupBySlug` in
 * `readGroups.ts` stays the raw read for the write path and the curation layer.
 */
export const groupItems = createCachedItemRead<
  Group,
  GroupEntryValue,
  GroupEntryKey
>({
  config: groupContentConfig,
});

export default groupItems;
