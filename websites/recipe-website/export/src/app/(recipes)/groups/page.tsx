import { groupIndexRoutes } from "recipe-website-common/components/GroupIndexPage/routes";

/**
 * The landing page: the head page folded together with the one below it, so it
 * always holds between `perPage + 1` and `2 * perPage` groups rather than the
 * 1-to-`perPage` a partial head would give on its own.
 */
export default groupIndexRoutes.landing;
