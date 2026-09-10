import { createPaginatedJsonRoute } from "@discontent/cms/pagination/next/createPaginatedJsonRoute";
import { notePages } from "@/lib/notePaginationReads";

/**
 * The JSON twin of the browse routes, for the client list to walk.
 *
 * `firstPageNumber: 0` because the demo's numbered URLs *are* the stable page
 * ids — `/notes/browse/0` is the oldest page. The recipe site offsets by one;
 * the offset has to match the HTML routes for the same index or a deep link
 * would seed the client from a different page than the server rendered.
 */
export const noteJsonRoutes = createPaginatedJsonRoute({
  reads: notePages,
  firstPageNumber: 0,
});

export default noteJsonRoutes;
