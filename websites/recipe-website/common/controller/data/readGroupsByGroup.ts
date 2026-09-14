import { createCachedAggregateRead } from "@discontent/cms/aggregates/next/cachedReads";
import { groupsByGroup } from "../groupAggregateConfigs";
import { groupContentConfig } from "../groupContentConfig";

/**
 * The cached read behind a *group* page's "Appears in" block (23c/D16) — the
 * twin of `readGroupsByRecipe.ts`, over the aggregate keyed on `item.group`.
 *
 * Built at module scope for the same reason that one is: the `React.cache`
 * wrapper inside has to outlive a single render to dedupe, and `/group/<slug>`
 * is rendered once for metadata and once for the body.
 *
 * `null` means the aggregate has never been folded — a content directory built
 * before 23c, or one that has not been reindexed since. Callers render that as
 * "in no group", which is also what it looks like.
 */
export const groupsByGroupReads = createCachedAggregateRead({
  config: groupContentConfig,
  aggregateConfig: groupsByGroup,
});

export default groupsByGroupReads;
