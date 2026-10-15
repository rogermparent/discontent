import Link from "next/link";
import { tagSearchHref } from "../SearchForm/queryLanguage";

/** How many tag chips to surface before deferring to the full search page. */
const CHIP_LIMIT = 12;

/**
 * A browse-by-tag row: each chip links to a tag-filtered search — since PR 21a,
 * a `?q=tag:<tag>` query rather than a `?tags=` param, so the destination page
 * shows the filter in its search field instead of hiding it in session state.
 * Renders nothing when the corpus has no tags yet.
 *
 * Since the homepage redesign (2026-10-15) this is the **fallback**: the page
 * browses by `BrowseTerms`' facet roots, and draws these flat chips only when
 * the vocabulary has no roots with carried children — a corpus with no term
 * records, which is most test fixtures. Its chips are `BrowseTerms`' pills
 * without counts, so the two read as one section.
 */
export function BrowseChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  const shown = tags.slice(0, CHIP_LIMIT);
  const hasMore = tags.length > shown.length;

  return (
    <section aria-label="Browse by tag" className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        Browse
      </h2>
      <div className="flex flex-row flex-wrap items-center gap-2">
        {shown.map((tag) => (
          <Link
            key={tag}
            href={tagSearchHref(tag)}
            className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 py-1.5 text-sm text-card-foreground transition-colors hover:border-primary/50"
          >
            {tag}
          </Link>
        ))}
        {hasMore && (
          <Link
            href="/search"
            className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            More →
          </Link>
        )}
      </div>
    </section>
  );
}

export default BrowseChips;
