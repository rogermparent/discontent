import { bookmarkPages } from "@/lib/bookmarkPaginationReads";
import { BookmarkBrowseList } from "./BookmarkBrowseList";

/*
 * A static segment, so it wins over the sibling `[slug]` route and
 * `/bookmarks/browse` never resolves to a bookmark.
 */
export const dynamic = "force-dynamic";

/** The landing: the head page folded together with the one below it. */
export default async function BrowseBookmarksPage() {
  const page = await bookmarkPages.readHead();
  return <BookmarkBrowseList page={page} isLanding={true} />;
}
