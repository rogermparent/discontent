import { groupIndexRoutes } from "recipe-website-common/components/GroupIndexPage/routes";

/**
 * A numbered page. `/groups/1` is the *oldest* page, not an alias for the
 * landing — numbers name stable page ids counted from the oldest group, so
 * creating one moves nothing and no sealed URL ever changes what it points at.
 */
export default groupIndexRoutes.numbered;

/**
 * Derived from the meta record in O(1), and never empty — a corpus with no
 * numbered pages still emits one param, because `output: export` rejects a
 * dynamic route whose params come back empty. The factory owns both.
 */
export const generateStaticParams = groupIndexRoutes.generateStaticParams;
