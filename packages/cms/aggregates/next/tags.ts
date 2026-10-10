/**
 * The one owner of the aggregate cache tag format.
 *
 * Reads and invalidation have to agree exactly — a typo in either would fail
 * silently as a value that never updates — so neither side spells a tag out.
 */

/**
 * One aggregate of one content type.
 *
 * For an ordinary aggregate this is its only tag: one value, one answer to
 * "did it change", and nothing to sub-divide.
 *
 * A **keyed** aggregate (32e) splits it the way pagination splits an index.
 * This tag becomes the catch-all: every cached read of the aggregate carries
 * it, but only the repair seat fires it (`derivedTagsOf`), because a write
 * knows which keys it moved. That is why `derivedTagsOf`'s output did not
 * change when the by-term aggregate became keyed.
 */
export function aggregateTag(contentType: string, name: string): string {
  return `aggregate:${contentType}:${name}`;
}

/**
 * A keyed aggregate's whole-value read. A write fires it whenever any key
 * moved, since the whole value moved with it.
 */
export function aggregateWholeTag(contentType: string, name: string): string {
  return `${aggregateTag(contentType, name)}:whole`;
}

/** One key of a keyed aggregate. A write fires it when that key moved. */
export function aggregateKeyTag(
  contentType: string,
  name: string,
  key: string,
): string {
  return `${aggregateTag(contentType, name)}:key:${key}`;
}

export function aggregateTags(contentType: string, name: string) {
  return {
    /**
     * An ordinary aggregate's one tag; for a keyed aggregate, the catch-all
     * every read carries and only a repair fires.
     */
    value: aggregateTag(contentType, name),
    whole: aggregateWholeTag(contentType, name),
    key: (key: string) => aggregateKeyTag(contentType, name, key),
  };
}
