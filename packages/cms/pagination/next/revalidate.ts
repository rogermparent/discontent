import { revalidateTag } from "next/cache";
import type { PaginationUpdateResult } from "../types";
import { paginationTags } from "./tags";

/**
 * Expire matching entries now, rather than serving them stale while they
 * refresh in the background.
 *
 * Next 16 made the second argument required: a bare `revalidateTag(tag)` is
 * deprecated, and passing a named profile like `"max"` marks the entry
 * stale-while-revalidate and deliberately does *not* let the action that wrote
 * the content read its own write. A content write must be visible on the
 * redirect that follows it, so it expires.
 *
 * `updateTag(tag)` means the same thing but throws outside a Server Action,
 * which would shut route handlers and scripts out of the adapter.
 */
const EXPIRE_NOW = { expire: 0 } as const;

function expire(tag: string): void {
  revalidateTag(tag, EXPIRE_NOW);
}

/**
 * Turn a pass's dirty-page diff into the cache invalidation it implies.
 *
 * This is the payoff for everything upstream: `handleContentSuccess` fires
 * blanket `revalidatePath` for every configured list path plus `/`, because
 * nothing could tell it which pages had actually changed. For the common
 * create, this fires two tags — the landing and the meta record — and leaves
 * every sealed page's cache entry alone.
 *
 * @example
 * ```ts
 * const { pagination } = await createContent({ ... });
 * revalidatePaginationResults("recipes", pagination);
 * ```
 */
export function revalidatePaginationResults(
  contentType: string,
  results: PaginationUpdateResult[],
): void {
  for (const result of results) {
    if (result.unchanged) continue;
    const tags = paginationTags(contentType, result.name);

    /* A rebuild moves everything; one tag covers the whole index. */
    if (result.rebuilt) {
      expire(tags.all);
      continue;
    }

    /*
     * The landing folds `headPage` and `headPage - 1`, so a change to either
     * is a change to the landing rather than to a numbered route — neither has
     * a numbered URL of its own.
     */
    const foldedIntoLanding = (pageIndex: number) =>
      pageIndex === result.headPage || pageIndex === result.headPage - 1;

    let landingChanged = false;
    for (const pageIndex of [...result.dirtyPages, ...result.removedPages]) {
      if (foldedIntoLanding(pageIndex)) landingChanged = true;
      else expire(tags.page(pageIndex));
    }

    /*
     * The head sealed. Exactly one numbered route appears — the page that was
     * folded into the landing and is now addressable on its own — and its
     * content was already final, so this drops a cache entry rather than
     * correcting one.
     */
    if (result.headPage !== result.previousHeadPage) {
      landingChanged = true;
      const exposed = result.headPage - 2;
      if (exposed >= 0) expire(tags.page(exposed));
    }

    if (landingChanged) expire(tags.head);

    /*
     * Meta carries `total`, which moves whenever the corpus does. It is its
     * own tag precisely so that this line does not invalidate every page.
     */
    expire(tags.meta);
  }
}

export default revalidatePaginationResults;
