import { tagIndexRoute } from "@discontent/projects-collection/components/TagPage/routes";

/**
 * Every tag in the corpus, from one folded value (24b).
 *
 * Under `(portfolio)` so the masthead layout applies, and a *static* segment,
 * so it beats the sibling `[...slug]` pages catch-all for `/tags`.
 */
export default tagIndexRoute;
