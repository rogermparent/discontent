/**
 * The one owner of the cache tag format.
 *
 * Reads and invalidation have to agree exactly — a typo in either would fail
 * silently as a page that never updates — so neither side spells a tag out.
 */

/** Everything about one index. Every cached entry carries it. */
export function paginationIndexTag(contentType: string, name: string): string {
  return `pagination:${contentType}:${name}`;
}

/**
 * The meta record: `total`, `headPage`, the numbered route list.
 *
 * Deliberately separate from the page tags. `total` moves on almost every
 * write, so folding it into them would invalidate every page each time the
 * corpus grew and defeat the entire point of the dirty-page diff. The price is
 * a rendering constraint: a numbered page must not print a global count.
 */
export function paginationMetaTag(contentType: string, name: string): string {
  return `${paginationIndexTag(contentType, name)}:meta`;
}

/** The landing page, which folds `headPage` together with `headPage - 1`. */
export function paginationHeadTag(contentType: string, name: string): string {
  return `${paginationIndexTag(contentType, name)}:head`;
}

/** One numbered page, by its stable id. */
export function paginationPageTag(
  contentType: string,
  name: string,
  pageIndex: number,
): string {
  return `${paginationIndexTag(contentType, name)}:page:${pageIndex}`;
}

/** All four, bound to one index. */
export function paginationTags(contentType: string, name: string) {
  return {
    all: paginationIndexTag(contentType, name),
    meta: paginationMetaTag(contentType, name),
    head: paginationHeadTag(contentType, name),
    page: (pageIndex: number) =>
      paginationPageTag(contentType, name, pageIndex),
  };
}
