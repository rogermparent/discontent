/**
 * The one owner of the item cache tag format.
 *
 * Reads and invalidation have to agree exactly — a typo in either would fail
 * silently as a record that never updates — so neither side spells a tag out.
 * Same rule as `pagination/next/tags.ts` and `aggregates/next/tags.ts`.
 *
 * This is the **fifth derived kind** (§2): a surface that renders one item's
 * whole record. Its motivating case is not the item's own page — that one has
 * a URL, so `revalidatePath(itemBasePath + "/" + slug)` reaches it — but a
 * surface at a *different* URL that renders the same record. The homepage hero
 * lives at `/`, and `/featured-recipe/<slug>` renders an entire recipe under
 * another content type's slug. Neither is reachable by path from the write
 * that changed the record, which is why the tag is keyed by item.
 *
 * Unlike the other two kinds, this one needs **no per-type declaration**. A
 * pagination index and an aggregate are named on the content config; an item
 * tag's only coupling is the `contentType` string, which every write already
 * carries. That is why the write path could start firing these without any
 * config plumbing.
 */

/**
 * One item of one content type.
 *
 * Keyed by slug rather than by the URL it happens to be rendered at, because
 * the shape this kind exists for is precisely the record appearing at a URL
 * the writer cannot name.
 */
export function itemTag(contentType: string, slug: string): string {
  return `item:${contentType}:${slug}`;
}

/**
 * Every item of one content type — the catch-all.
 *
 * Pagination has one of these because a rebuild moves every page. Aggregates
 * have none because an aggregate is a single entry, so a second tag would name
 * the same thing twice. Items need one for a stronger reason than pagination's:
 * their cardinality is **unbounded and not enumerable**, so a seat that has to
 * drop everything — a rebuild, or a test harness rolling the content directory
 * back to a fixture — has no list of slugs it could iterate instead.
 *
 * Fired by those repair seats only. A *write* must never fire it: a write
 * knows exactly which slugs it touched, and expiring the type would be the
 * over-invalidation §6.4 exists to prevent.
 */
export function itemTypeTag(contentType: string): string {
  return `item:${contentType}`;
}

/**
 * Both tags for one content type, in the shape the read and write sides share.
 *
 * @example
 * ```ts
 * const tags = itemTags("notes");
 * tags.all;            // "item:notes"
 * tags.item("hello");  // "item:notes:hello"
 * ```
 */
export function itemTags(contentType: string) {
  return {
    all: itemTypeTag(contentType),
    item: (slug: string) => itemTag(contentType, slug),
  };
}

export default itemTags;
