import type { PaginationIndexConfig } from "@discontent/cms/pagination/types";
import { GROUPS_PER_PAGE } from "../components/GroupIndexPage/constants";
import type { GroupEntryKey, GroupEntryValue, GroupKind } from "./types";

/**
 * What one row of the paginated group index renders — exactly what
 * `GroupListItem` destructures, and nothing else.
 *
 * `itemCount` rather than the items themselves: the card prints a count, and
 * carrying the array would dirty every sealed page whenever a label changed
 * inside a group the page merely lists. The narrowness is the point, for the
 * reason `RecipeListEntry` sets out at length.
 */
export interface GroupListEntry {
  slug: string;
  date: number;
  name: string;
  kind: GroupKind;
  /**
   * The group's own picture, when it has one (22h/D14). The one field here that
   * is not printed as text: a card that carries it renders `GroupImage`
   * directly and never reads the group's record, and a card without it falls
   * back to the member walk, which does.
   */
  image?: string;
  itemCount: number;
}

/**
 * Groups by date, newest first.
 *
 * Its own module rather than a field inside `groupContentConfig.ts` — the
 * content config imports this, and this imports only *types* back, so there is
 * no cycle. It is also its own module rather than a third export of
 * `paginationConfigs.ts`, because `test/specVersions.test.ts` hashes that file
 * whole and a new content type has no business moving the recipe configs'
 * snapshot (T1).
 */
export const groupsByDate: PaginationIndexConfig<
  GroupEntryValue,
  GroupEntryKey,
  GroupListEntry
> = {
  name: "by-date",
  perPage: GROUPS_PER_PAGE,
  /*
   * Pinned by hand, for the reason `recipesByDate.version` spells out: a hash
   * derived from `fn.toString()` is not stable across a minified production
   * build and a dev server, so an index built by one and read by the other read
   * as stale and rebuilt itself (F16). Bump this when `key` or `project`
   * changes — nothing else will notice.
   *
   * `"2"` since 22h: `project` carries the group's own `image` (D14).
   */
  version: "2",
  /*
   * The date lives in the content index *key* (`buildIndexKey` is
   * `[date, slug]`) and `GroupEntryValue` carries none, so both functions read
   * it from `entry.key` — the same shape recipes and featured recipes use.
   */
  key: ({ key: [date], id }) => [date, id],
  project: ({ key: [date], value, id }) => ({
    slug: id,
    date,
    name: value.name,
    kind: value.kind,
    image: value.image,
    itemCount: value.items.length,
  }),
};

export default groupsByDate;
