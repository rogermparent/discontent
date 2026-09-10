import { createCachedPaginationReads } from "@discontent/cms/pagination/next/cachedReads";
import { bookmarksByDate, type BookmarkListItem } from "./bookmarkPagination";
import {
  bookmarkConfig,
  type BookmarkIndexKey,
  type BookmarkIndexValue,
} from "./bookmarks";

/**
 * The cached reads for the bookmarks index, built once per process — see
 * `notePaginationReads.ts` on why module scope rather than a factory.
 */
export const bookmarkPages = createCachedPaginationReads<
  BookmarkIndexValue,
  BookmarkIndexKey,
  BookmarkListItem
>({
  config: bookmarkConfig,
  paginationConfig: bookmarksByDate,
});
