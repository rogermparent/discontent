/**
 * The one owner of the aggregate cache tag format.
 *
 * Reads and invalidation have to agree exactly — a typo in either would fail
 * silently as a value that never updates — so neither side spells a tag out.
 */

/**
 * One aggregate of one content type.
 *
 * There is only one tag per aggregate, where pagination has four. That is the
 * kind's whole shape: an aggregate is a single value with a single answer to
 * "did it change", so there is nothing to sub-divide. Anything wanting
 * per-item precision is a pagination index, not an aggregate.
 */
export function aggregateTag(contentType: string, name: string): string {
  return `aggregate:${contentType}:${name}`;
}

export function aggregateTags(contentType: string, name: string) {
  return { value: aggregateTag(contentType, name) };
}
