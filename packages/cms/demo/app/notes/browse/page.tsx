import { notePages } from "@/lib/notePaginationReads";
import { NoteBrowseList } from "./NoteBrowseList";

/*
 * A static segment, so it wins over the sibling `[slug]` route and
 * `/notes/browse` never resolves to a note.
 */
export const dynamic = "force-dynamic";

/**
 * The landing page: the head page folded together with the one below it, so it
 * always holds between `perPage + 1` and `2 * perPage` items rather than the
 * 1-to-`perPage` a partial head would give on its own.
 */
export default async function BrowseNotesPage() {
  const page = await notePages.readHead();
  return <NoteBrowseList page={page} isLanding={true} />;
}
