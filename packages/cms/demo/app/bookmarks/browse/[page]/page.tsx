import { notFound } from "next/navigation";
import { bookmarkPages } from "@/lib/bookmarkPaginationReads";
import { BookmarkBrowseList } from "../BookmarkBrowseList";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ page: string }>;
}

/**
 * A numbered page, addressed by its stable id — see the notes equivalent for
 * why ids count from the oldest item and why only `0 … headPage - 2` exist.
 */
export default async function NumberedBookmarksPage({ params }: Props) {
  const { page: raw } = await params;
  const pageIndex = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(pageIndex)) notFound();

  const meta = await bookmarkPages.readMeta();
  if (!meta.numberedPages.includes(pageIndex)) notFound();

  const page = await bookmarkPages.readPage(pageIndex);
  if (!page) notFound();

  return <BookmarkBrowseList page={page} isLanding={false} />;
}
