import { createCachedItemRead } from "@discontent/cms/content/next/cachedItemRead";
import {
  bookmarkConfig,
  type Bookmark,
  type BookmarkIndexKey,
  type BookmarkIndexValue,
} from "./bookmarks";

/**
 * The cached by-slug read for a bookmark's whole record.
 *
 * A bookmark's record is rewritten by a *note* write: renaming a note makes
 * `updateDependents` rewrite every bookmark that points at it. So this entry
 * goes stale on a write to another content type entirely — which is why the
 * write path fires an item tag for each slug in `DependentWriteResult.updatedSlugs`.
 */
export const bookmarkItems = createCachedItemRead<
  Bookmark,
  BookmarkIndexValue,
  BookmarkIndexKey
>({
  config: bookmarkConfig,
});

export default bookmarkItems;
