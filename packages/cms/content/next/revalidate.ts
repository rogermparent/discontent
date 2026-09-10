import { revalidateTag } from "next/cache";
import { itemTags } from "./itemTags";

/**
 * Expire matching entries now. See `pagination/next/revalidate.ts` for why the
 * second argument is required in Next 16 and why a named profile is wrong: a
 * write must be visible on the redirect that follows it.
 */
const EXPIRE_NOW = { expire: 0 } as const;

export interface ItemWrite {
  /** The slug the item now lives at. */
  slug: string;
  /**
   * The slug it lived at before, when a write renamed it.
   *
   * Not optional in practice on the rename path: `updateContent` deletes the
   * file at the old slug, so an entry surviving there would serve the
   * pre-rename record at a URL that should now 404.
   */
  previousSlug?: string;
}

/**
 * Exactly which item tags one write implies — the pure half, so the negative
 * case is assertable.
 *
 * The negative case is the one worth pinning, because it cannot be seen from
 * the outside: a spurious catch-all expiry re-renders byte-identical HTML, so
 * no rendered-output test can distinguish "fired too much" from "fired right".
 * Hence a unit test on this function rather than an end-to-end one.
 *
 * Never includes `tags.all`. A write knows its own slugs; only the repair
 * seats — `rebuild*Index()` and the test harness's cache reset — expire a
 * whole content type.
 */
export function itemTagsForWrite(
  contentType: string,
  { slug, previousSlug }: ItemWrite,
): string[] {
  const tags = itemTags(contentType);
  const fired = [tags.item(slug)];
  if (previousSlug && previousSlug !== slug) fired.push(tags.item(previousSlug));
  return fired;
}

/**
 * Fire the item tags one write implies.
 *
 * The fifth derived kind's whole write-side surface. Unlike pagination and
 * aggregates it consumes no engine result, because there is nothing to decide:
 * a write to a slug changes that item's record, full stop. What the *engine*
 * contributes is the dependent case — `DependentWriteResult.updatedSlugs`
 * names items of another type whose data files this write rewrote, and since
 * an item tag is keyed by content type, those need no config seat at all.
 *
 * @example
 * ```ts
 * revalidateItemWrite("notes", { slug: newSlug, previousSlug: currentSlug });
 * ```
 */
export function revalidateItemWrite(
  contentType: string,
  write: ItemWrite,
): void {
  for (const tag of itemTagsForWrite(contentType, write)) {
    revalidateTag(tag, EXPIRE_NOW);
  }
}

export default revalidateItemWrite;
