import { revalidateAggregateResults } from "@discontent/cms/aggregates/next/revalidate";
import { revalidateItemWrite } from "@discontent/cms/content/next/revalidate";
import type { ContentWriteResult } from "@discontent/cms/content/types";
import { revalidatePaginationResults } from "@discontent/cms/pagination/next/revalidate";

/**
 * Fire the cache tags one write's regeneration set implies.
 *
 * This demo calls the write functions directly rather than through
 * `createGenericActions`, so it invalidates for itself — this is the same loop
 * `handleContentSuccess` runs, kept in one place for the four call sites.
 *
 * The dependents half is what makes retitling a note update the bookmark
 * pages that show its title: those pages live behind tags keyed by
 * `bookmarks`, not by the content type whose form was submitted.
 *
 * The item half is the third kind, and the one with no list to consult: a
 * write to a slug changes that item's record, so it fires unconditionally. The
 * `previousSlug` argument is not optional in practice on a rename — the file
 * at the old slug is gone, and a surviving entry there would serve the
 * pre-rename record at a URL that should 404.
 *
 * @example
 * ```ts
 * revalidateWrite(noteConfig.contentType, await updateContent({ ... }), {
 *   slug: newSlug,
 *   previousSlug: currentSlug,
 * });
 * ```
 */
export function revalidateWrite(
  contentType: string,
  result: ContentWriteResult,
  write: { slug: string; previousSlug?: string },
): void {
  revalidatePaginationResults(contentType, result.pagination);
  revalidateAggregateResults(contentType, result.aggregates);
  revalidateItemWrite(contentType, write);
  for (const dependent of result.dependents) {
    revalidatePaginationResults(dependent.contentType, dependent.pagination);
    revalidateAggregateResults(dependent.contentType, dependent.aggregates);
    /*
     * The dependent's *records*, which `updateDependents` rewrote on disk.
     * Needs no declaration from the app: an item tag is keyed by content type,
     * which the result already carries.
     */
    for (const slug of dependent.updatedSlugs) {
      revalidateItemWrite(dependent.contentType, { slug });
    }
  }
}

export default revalidateWrite;
