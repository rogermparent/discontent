import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { tagSearchHref } from "../SearchForm/queryLanguage";

/** How many tag chips to surface before deferring to the full search page. */
const CHIP_LIMIT = 12;

/**
 * A browse-by-tag row: each chip links to a tag-filtered search — since PR 21a,
 * a `?q=tag:<tag>` query rather than a `?tags=` param, so the destination page
 * shows the filter in its search field instead of hiding it in session state.
 * Renders nothing when the corpus has no tags yet.
 */
export function BrowseChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  const shown = tags.slice(0, CHIP_LIMIT);
  const hasMore = tags.length > shown.length;

  return (
    <section aria-label="Browse by tag" className="mb-10">
      <span className="mb-3 block font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Browse
      </span>
      <div className="flex flex-row flex-wrap items-center gap-2">
        {shown.map((tag) => (
          <Badge key={tag} asChild variant="secondary">
            <Link href={tagSearchHref(tag)}>{tag}</Link>
          </Badge>
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
