import { createPaginatedJsonRoute } from "@discontent/cms/pagination/next/createPaginatedJsonRoute";
import { recipePages } from "../../controller/data/readRecipePages";

/**
 * The `/recipes` JSON route handlers, defined once and re-exported by all four
 * route files — `/recipes/head` and `/recipes/page/[page]`, in the editor and
 * the export.
 *
 * The JSON twin of `recipeIndexRoutes` beside it, reading through the same
 * `recipePages` and serving the same `PaginationPage` the renderer is handed.
 * No new cache tags and no new invalidation seats: the reads are already
 * tagged, so a write that dirties a page drops the HTML and the JSON for it
 * together.
 *
 * `firstPageNumber` is left at its default of 1, matching the HTML routes. The
 * two must agree — a reader deep-linked to `/recipes/3` seeds the client list
 * from whatever `/recipes/page/3` returns, and an offset mismatch would show
 * them a different page than the server just rendered.
 */
export const recipeIndexJsonRoutes = createPaginatedJsonRoute({
  reads: recipePages,
});

export default recipeIndexJsonRoutes;
