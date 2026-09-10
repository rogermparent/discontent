import { notFound } from "next/navigation";
import { notePages } from "@/lib/notePaginationReads";
import { NoteBrowseList } from "../NoteBrowseList";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ page: string }>;
}

/**
 * A numbered page, addressed by its stable id.
 *
 * Page 0 is the *oldest* content. Ids count from the oldest item so that a
 * create — which lands at the newest end — moves nothing: once a page is
 * sealed, its URL and its contents both stay put.
 *
 * Only `0 … headPage - 2` exist. The head and the page folded into it are
 * reachable through the landing, so serving them here too would put the same
 * content at two URLs.
 */
export default async function NumberedNotesPage({ params }: Props) {
  const { page: raw } = await params;
  const pageIndex = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(pageIndex)) notFound();

  const meta = await notePages.readMeta();
  if (!meta.numberedPages.includes(pageIndex)) notFound();

  const page = await notePages.readPage(pageIndex);
  if (!page) notFound();

  return <NoteBrowseList page={page} isLanding={false} />;
}
