import { groupIndexRoutes } from "recipe-website-common/components/GroupIndexPage/routes";

/**
 * A numbered page. `/groups/1` is the *oldest* page, not an alias for the
 * landing — numbers name stable page ids counted from the oldest group, so
 * creating one moves nothing and no sealed URL ever changes what it points at.
 *
 * This segment is why the item routes live under `/group/<slug>` (D2): a
 * `/groups/[slug]` would collide with it.
 */
export default groupIndexRoutes.numbered;
