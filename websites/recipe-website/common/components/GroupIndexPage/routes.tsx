import { createPaginatedIndexRoute } from "@discontent/cms/pagination/next/createPaginatedIndexRoute";
import { groupPages } from "../../controller/data/readGroupPages";
import { GroupIndexPageWrapper } from "./shared";

/**
 * The `/groups` route handlers, defined once and re-exported by all four route
 * files — `/groups` and `/groups/[page]`, in the editor and the export.
 *
 * The factory owns `[page]` under the list path, which is why the item routes
 * are `/group/<slug>` and not `/groups/<slug>`: the two would collide (D2).
 * That is the same split `/featured-recipes` + `/featured-recipe/<slug>` uses.
 */
export const groupIndexRoutes = createPaginatedIndexRoute({
  reads: groupPages,
  render: (page, { isLanding }) => (
    <GroupIndexPageWrapper page={page} isLanding={isLanding} />
  ),
});

export default groupIndexRoutes;
